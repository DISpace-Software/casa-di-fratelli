using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Platform.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;
using SeatMap.Api.Services.Waitlist;

var checks = 0;
void Check(bool ok, string message) { if (!ok) throw new Exception(message); Console.WriteLine("PASS " + message); checks++; }
await using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
var postgres = Environment.GetEnvironmentVariable("WAITLIST_TEST_POSTGRES");
var options = new DbContextOptionsBuilder<AppDbContext>();
if (postgres == null) options.UseSqlite(connection); else {
    if (!new Npgsql.NpgsqlConnectionStringBuilder(postgres).Database!.StartsWith("seatmap_waitlist_checks_")) throw new Exception("Use a dedicated test database");
    options.UseNpgsql(postgres);
}
await using var db = new AppDbContext(options.Options);
await db.Database.EnsureCreatedAsync();
var current = new CurrentTenant(); current.Resolve(new() { Id = "test", Name = "Test", NotificationsEnabled = false });
var brand = new TenantBrandingService(db, current, new ConfigurationBuilder().Build(), NullLogger<TenantBrandingService>.Instance);
await brand.SaveAsync(new() { Name = "Test", Phone = "+359888123456" });
var plans = new FloorPlanService(db, current);
await plans.SaveAsync((await plans.GetAsync()) with { Zones = [new("inside", "Inside")], Tables = [new("T1", "inside", 20, 20, 4, false, false, true)], Combinations = [], PublicMaxGuests = 8 });
var zones = new SeasonalZoneService(db, plans);
var closure = new RestaurantClosureService(db, current);
var conflicts = new ReservationConflictService(db);
var clock = TimeProvider.System;
var queue = new WaitlistService(db, plans, zones, closure, conflicts, brand, clock);
var booking = new ReservationBookingService(db, conflicts, closure, zones, brand, new NoNotifications(), clock, NullLogger<ReservationBookingService>.Instance);
var date = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(2));
GuestProfile Guest(string name) => new() { DisplayName = name, Phone = "+359888123456", Email = name+"@example.test", EmailVerifiedAtUtc = DateTime.UtcNow };
var first = Guest("first"); var second = Guest("second"); second.Phone = "+359888123457";
var req = new WaitlistRequest(date, 4, "inside", ["19:00", "19:30"]);
var unverified = Guest("unverified"); unverified.EmailVerifiedAtUtc = null;
Check((await queue.JoinAsync(unverified, req)).Kind == ReservationBookingResultKind.Invalid, "Unverified identity rejected");
Check((await queue.JoinAsync(first, req with { Guests = 9 })).Kind == ReservationBookingResultKind.Invalid, "Party limit enforced");
Check((await queue.JoinAsync(first, req with { Guests = 6 })).Kind == ReservationBookingResultKind.Invalid, "No undersized table offered");
Check((await queue.JoinAsync(first, req with { Area = "unknown" })).Kind == ReservationBookingResultKind.Invalid, "Unknown zone rejected");
var reservation = new Reservation { GuestName = "Existing", Phone = "x", GuestCount = 4, Area = "inside", ReservedDate = date, ReservedTime = "19:00", Status = "Approved", Tables = [new() { TableCode = "T1" }] };
db.Reservations.Add(reservation); await db.SaveChangesAsync();
Check((await queue.JoinAsync(first, req)).Kind == ReservationBookingResultKind.Success, "Join waiting list");
await queue.JoinAsync(first, req);
Check(await db.WaitlistEntries.CountAsync() == 1, "Joining twice is idempotent");
await queue.JoinAsync(second, req);
await queue.TickAsync();
Check(await db.WaitlistEntries.CountAsync(x => x.Status == "offered") == 0, "Occupied table not offered");
reservation.Status = "Cancelled"; await db.SaveChangesAsync();
await queue.TickAsync();
var a = await db.WaitlistEntries.SingleAsync(x => x.GuestId == first.Id);
var b = await db.WaitlistEntries.SingleAsync(x => x.GuestId == second.Id);
Check(a.Status == "offered" && b.Status == "waiting", "Earliest matching guest gets exclusive offer");
Check(await conflicts.FindTableConflictAsync(date, "20:30", ["T1"], includeHallBlocks: false) != null, "Hold blocks staff and overlapping times");
var normal = new SeatMap.Api.Dtos.CreateReservationRequest { GuestName = "Other", Phone = "+359888123458", Email = "other@example.test", GuestCount = 4, Area = "inside", ReservedDate = date, ReservedTime = "19:00", TableIds = ["T1"], PrivacyConsent = true };
Check((await booking.CreateAsync(normal)).Kind == ReservationBookingResultKind.Conflict, "Ordinary booking cannot steal offered table");
Check((await booking.CreateAsync(new(), acceptance: new(a.Id, second.Id, a.OfferId!.Value))).Kind == ReservationBookingResultKind.NotFound, "Another guest cannot accept an offer");
Check((await booking.CreateAsync(new(), acceptance: new(a.Id, first.Id, Guid.NewGuid()))).Kind == ReservationBookingResultKind.Conflict, "Stale offer version rejected");
a.ExpiresAtUtc = DateTime.UtcNow.AddSeconds(-1); await db.SaveChangesAsync();
Check((await booking.CreateAsync(new(), acceptance: new(a.Id, first.Id, a.OfferId.Value))).Kind == ReservationBookingResultKind.Conflict, "Expired offer cannot be accepted");
await queue.TickAsync();
Check(a.Status == "paused" && b.Status == "offered", "Expired guest pauses and next guest gets offer");
var offer = b.OfferId!.Value;
Check((await booking.CreateAsync(new(), acceptance: new(b.Id, second.Id, offer))).Kind == ReservationBookingResultKind.Success, "Offer converts to normal approved booking");
var saved = await db.Reservations.Include(x => x.Tables).SingleAsync(x => x.Id == b.ReservationId);
Check(saved.Status == "Approved" && saved.EmailConfirmedAtUtc != null && saved.Tables.Single().TableCode == "T1", "Verified identity and held table preserved");
var before = await db.Reservations.CountAsync();
await booking.CreateAsync(new(), acceptance: new(b.Id, second.Id, offer));
Check(await db.Reservations.CountAsync() == before, "Retry does not create another reservation");
Check((await queue.ChangeAsync(a.Id, second.Id, "cancel")).Kind == ReservationBookingResultKind.NotFound, "Another guest cannot edit request");
await queue.ChangeAsync(a.Id, first.Id, "resume");
Check(a.Status == "waiting", "Explicit resume returns to waiting");
await queue.ChangeAsync(a.Id, first.Id, "cancel");
Check(a.Status == "cancelled", "Cancellation persists");
if (postgres != null)
{
    await queue.JoinAsync(first, req with { Date = date.AddDays(1) });
    await queue.JoinAsync(second, req with { Date = date.AddDays(1) });
    async Task<ReservationBookingResult?> Scope(bool tick, WaitlistAcceptance? accept = null)
    {
        await using var other = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(postgres).Options);
        var branding = new TenantBrandingService(other, current, new ConfigurationBuilder().Build(), NullLogger<TenantBrandingService>.Instance);
        var fp = new FloorPlanService(other, current); var z = new SeasonalZoneService(other, fp); var c = new RestaurantClosureService(other, current); var conflict = new ReservationConflictService(other);
        if (tick) { await new WaitlistService(other, fp, z, c, conflict, branding, clock).TickAsync(); return null; }
        return await new ReservationBookingService(other, conflict, c, z, branding, new NoNotifications(), clock, NullLogger<ReservationBookingService>.Instance).CreateAsync(new(), acceptance: accept);
    }
    await Task.WhenAll(Scope(true), Scope(true));
    var held = await db.WaitlistEntries.AsNoTracking().Where(x => x.Date == date.AddDays(1) && x.Status == "offered").ToListAsync();
    Check(held.Count == 1, "PostgreSQL concurrent workers issue one exclusive offer");
    var acceptance = new WaitlistAcceptance(held[0].Id, held[0].GuestId, held[0].OfferId!.Value);
    var replies = await Task.WhenAll(Scope(false, acceptance), Scope(false, acceptance));
    Check(replies.All(x => x!.Kind == ReservationBookingResultKind.Success), "Concurrent confirmation requests succeed idempotently");
    Check(await db.Reservations.CountAsync(x => x.ReservedDate == date.AddDays(1)) == 1, "PostgreSQL concurrent confirmations create exactly one booking");
}
var mailHandler = new MailHandler();
using var mailHttp = new HttpClient(mailHandler);
var mailSender = new WaitlistEmailSender(mailHttp, new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Platform:Email:ApiKey"] = "test-only", ["Platform:Email:From"] = "SeatMap <test@example.test>" }).Build(), NullLogger<WaitlistEmailSender>.Instance);
var noticeId = Guid.NewGuid();
Check(await mailSender.SendAsync("guest@example.test", "Offer", "<p>Test</p>", noticeId, default), "Email success requires provider success");
Check(mailHandler.LastKey == $"waitlist-{noticeId:N}", "Offer email has stable provider idempotency key");
mailHandler.Status = System.Net.HttpStatusCode.ServiceUnavailable;
Check(!await mailSender.SendAsync("guest@example.test", "Offer", "<p>Test</p>", noticeId, default), "Failed email is not reported as delivered");
if (postgres == null) await HttpChecks.Run(connection, first, date.AddDays(3), Check);
Console.WriteLine($"Waitlist: {checks} checks passed");
sealed class NoNotifications : IReservationBookingNotifications {
 public Task SendConfirmationAsync(Reservation r, string t) => Task.CompletedTask;
 public Task NotifyConfirmedAsync(Reservation r) => Task.CompletedTask;
}

sealed class MailHandler : HttpMessageHandler {
 public System.Net.HttpStatusCode Status = System.Net.HttpStatusCode.OK;
 public string? LastKey;
 protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) {
   LastKey = request.Headers.GetValues("Idempotency-Key").Single();
   return Task.FromResult(new HttpResponseMessage(Status));
 }
}
