using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;

internal static class GuestCancellationChecks
{
    private static int checks;
    private static void Check(bool value, string message) { checks++; if (!value) throw new Exception(message); }
    private sealed class Clock : TimeProvider {
        public DateTimeOffset Now = new(2026, 11, 19, 9, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class SilentNotifications : IReservationBookingNotifications {
        public Task NotifyConfirmedAsync(Reservation reservation) => Task.CompletedTask;
        public Task SendConfirmationAsync(Reservation reservation, string token) => Task.CompletedTask;
    }

    public static async Task RunAsync()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var tenant = new CurrentTenant(); tenant.Resolve(new TenantDefinition {
            Id = "cofein", Name = "Cofein", Slug = "cofein", NotificationsEnabled = false,
            ReservationConfirmationMode = ReservationConfirmationMode.Automatic });
        var brand = new TenantBrandingService(db, tenant, new ConfigurationBuilder().Build(), NullLogger<TenantBrandingService>.Instance);
        var settings = await brand.GetAsync(); settings.Phone = "+3595550100"; await brand.SaveAsync(settings);
        var plans = new FloorPlanService(db, tenant);
        await plans.SaveAsync(new FloorPlan { Revision = (await plans.GetAsync()).Revision, Zones = [new("room", "Room")],
            Tables = [new("1", "room", 30, 30, 4, false, false, true)] });
        var clock = new Clock();
        var conflicts = new ReservationConflictService(db);
        var bookingService = new ReservationBookingService(db, conflicts, new(db, tenant), new(db, plans), brand,
            new SilentNotifications(), clock, NullLogger<ReservationBookingService>.Instance);
        var created = await bookingService.CreateAsync(new() {
            GuestName = "Synthetic guest", Phone = "+3595550199", Email = "cancellation@example.test",
            GuestCount = 2, Area = "room", TableIds = ["1"], PrivacyConsent = true,
            ReservedDate = new(2026, 11, 20), ReservedTime = "19:00" });
        Check(created.Kind == ReservationBookingResultKind.Success, "Test booking failed");
        var json = JsonSerializer.SerializeToElement(created.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var token = json.GetProperty("managementToken").GetString()!;
        var reservation = await db.Reservations.SingleAsync();
        Check(token.Length == 64 && reservation.GuestManagementTokenHash == GuestReservationService.HashToken(token), "Capability must be random and stored only as a hash");
        Check(!JsonSerializer.Serialize(reservation, new JsonSerializerOptions { ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles }).Contains(token) && !JsonSerializer.Serialize(reservation, new JsonSerializerOptions { ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles }).Contains("GuestManagementTokenHash"), "Reservation JSON must not disclose capabilities or hashes");
        var guests = new GuestReservationService(db, brand, clock);
        Check((await guests.GetAsync(reservation.Id, null)).Kind == ReservationBookingResultKind.NotFound, "ID alone must not disclose booking");
        Check((await guests.CancelAsync(reservation.Id, new string('0', 64))).Kind == ReservationBookingResultKind.NotFound, "Wrong key must not cancel");
        Check((await guests.CancelAsync(reservation.Id + 1, token)).Kind == ReservationBookingResultKind.NotFound, "Key must not authorize another ID");
        var status = (GuestReservationStatus)(await guests.GetAsync(reservation.Id, token)).Value;
        Check(status.CancellationDeadlineUtc == new DateTime(2026, 11, 20, 14, 0, 0, DateTimeKind.Utc), "Three-hour deadline must use Sofia time in winter");
        Check(status.CanCancel && status.RestaurantPhone == settings.Phone, "Guest status needs policy and restaurant phone");
        clock.Now = new DateTimeOffset(status.CancellationDeadlineUtc!.Value).AddTicks(1);
        Check((await guests.CancelAsync(reservation.Id, token)).Kind == ReservationBookingResultKind.Conflict && reservation.Status == "Approved", "One tick after deadline must require restaurant contact");
        clock.Now = new DateTimeOffset(status.CancellationDeadlineUtc.Value);
        reservation.IsArrived = true; await db.SaveChangesAsync();
        Check((await guests.CancelAsync(reservation.Id, token)).Kind == ReservationBookingResultKind.Conflict, "Arrived guest must contact restaurant");
        reservation.IsArrived = false;
        var order = new DiningOrder { ReservationId = reservation.Id, GuestName = "Synthetic guest", TableLabel = "1", Status = "New" };
        db.DiningOrders.Add(order); await db.SaveChangesAsync();
        Check(!((GuestReservationStatus)(await guests.GetAsync(reservation.Id, token)).Value).CanCancel, "Active dining orders must prevent self cancellation");
        Check((await guests.CancelAsync(reservation.Id, token)).Kind == ReservationBookingResultKind.Conflict, "Cancellation must respect dining orders");
        order.Status = "Cancelled"; reservation.EmailConfirmationTokenHash = "old-confirmation"; reservation.OrderAccessToken = "old-order";
        await db.SaveChangesAsync();
        Check((await guests.CancelAsync(reservation.Id, token)).Kind == ReservationBookingResultKind.Success, "Exactly three hours ahead must allow cancellation");
        Check(reservation.Status == "Cancelled" && !reservation.IsDeleted && reservation.DeleteReason == "Cancelled by guest", "Cancellation must retain the restaurant booking history");
        Check(reservation.EmailConfirmationTokenHash == null && reservation.OrderAccessToken == null, "Cancellation must revoke email/order links");
        Check(await conflicts.FindTableConflictAsync(reservation.ReservedDate, reservation.ReservedTime, ["1"]) == null, "Cancelled booking must release its table");
        clock.Now = clock.Now.AddDays(2);
        Check((await guests.CancelAsync(reservation.Id, token)).Kind == ReservationBookingResultKind.Success && await db.AuditLogs.CountAsync(x => x.Action == "guest-cancel") == 1, "Cancellation retries must be idempotent");
        reservation.GuestManagementTokenHash = null; await db.SaveChangesAsync();
        Check((await guests.GetAsync(reservation.Id, token)).Kind == ReservationBookingResultKind.NotFound, "Old bookings without capabilities must remain contact-only");
        var summer = new Reservation { ReservedDate = new(2027, 6, 15), ReservedTime = "19:00", Status = "Approved" };
        Check(GuestReservationService.StartsAtUtc(summer, settings) == new DateTime(2027, 6, 15, 16, 0, 0, DateTimeKind.Utc), "Sofia summer offset must be applied");
        summer.ReservedDate = new(2027, 3, 28); summer.ReservedTime = "03:30";
        Check(GuestReservationService.StartsAtUtc(summer, settings) == null, "Invalid DST local time must not allow cancellation");
        var casa = new CurrentTenant(); casa.Resolve(new TenantDefinition { Id = "casa-di-fratelli", Name = "Casa", Slug = "casa-di-fratelli" });
        // A fresh DB exercises the legacy Casa presentation without modifying production plans.
        await using var second = new SqliteConnection("Data Source=:memory:"); await second.OpenAsync();
        await using var other = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(second).Options); await other.Database.EnsureCreatedAsync();
        var casaPlan = await new FloorPlanService(other, casa).GetAsync();
        Check(casaPlan.Landmarks!.Count == 11 && casaPlan.Landmarks.Single(x => x.Kind == "tv").ZoneId == "garden", "Casa landmarks must preserve the original TV location");
        Check((await new FloorPlanService(other, tenant).GetAsync()).Landmarks!.Count == 0, "Another restaurant must not inherit Casa landmarks");
        Check((await new GuestReservationService(other, brand, clock).GetAsync(reservation.Id, token)).Kind == ReservationBookingResultKind.NotFound, "Capability must not cross restaurant databases");
        Console.WriteLine($"PASS: {checks} guest cancellation, ownership, timezone, idempotency and landmark checks.");
    }
}
