using System.Text.Json;
using SeatMap.Api.Controllers;
using SeatMap.Api.Data;
using SeatMap.Api.Dtos;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

internal static class CasaStaffParityChecks
{
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static async Task Reject(Func<Task> action, string message)
    { try { await action(); } catch (ArgumentException) { return; } throw new Exception(message); }

    public static async Task RunAsync()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var tenant = new CurrentTenant(); tenant.Resolve(new() { Id = "casa-di-fratelli", Name = "Casa", Slug = "casa-di-fratelli" });
        var plans = new FloorPlanService(db, tenant);
        var snapshotJson = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Fixtures", "casa-layout-2026-11-03.json"));
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE \"TableLayouts\" (\"Id\" integer PRIMARY KEY, \"LayoutJson\" text NOT NULL)");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"TableLayouts\" VALUES (1, {snapshotJson})");
        var initial = await plans.GetAsync();
        Check(initial.StaffCombinationMode == "same-zone", "Legacy Casa must expose its staff seating policy");
        Check(initial.Tables.Any(t => t.Id == "29а") && !initial.Tables.Any(t => t.Id == "29a"), "Fixture must preserve Cyrillic table ID, not replace it with a Latin lookalike");
        Check((await plans.SelectAsync(["29", "29а"], "indoor", 8)).Error != null, "Untrusted/default selection must retain configured combinations");
        Check((await plans.SelectAsync(["29", "29а"], "indoor", 8, publicBooking: true, allowStaffCombinations: true)).Error != null, "A staff flag must not loosen public table selection");
        foreach (var ids in new string[][] { ["29", "42"], ["29", "missing"], ["29", "29A"] })
            Check((await plans.SelectAsync(ids, null, 8, allowCapacityOverride: true, allowStaffCombinations: true)).Error != null,
                "Staff policy must reject cross-zone, unknown and different-script IDs");

        var config = new ConfigurationBuilder().Build();
        var brand = new TenantBrandingService(db, tenant, config, NullLogger<TenantBrandingService>.Instance);
        await brand.SaveAsync(new() { Name = "Casa", WalkInOpeningTime = "00:00", WalkInLatestTime = "23:59" });
        var zones = new SeasonalZoneService(db, plans);
        var booking = new ReservationBookingService(db, new(db), new(db, tenant), zones, brand, new NoNotifications(), TimeProvider.System, NullLogger<ReservationBookingService>.Instance);
        var staff = new AdminPrincipal(7, "Local test", "local@example.test", "Owner");
        var day = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(2);
        CreateReservationRequest Request(params string[] ids) => new() {
            GuestName = "Local parity check", Phone = "local-only", Email = "", GuestCount = 8,
            ReservedDate = day, ReservedTime = "19:00", Area = "indoor", TableIds = ids.ToList(), CreatedByAdmin = true
        };
        Check((await booking.CreateAsync(Request("29", "29а"))).Kind == ReservationBookingResultKind.Unauthorized,
            "Forged staff flag must not grant combination privileges");
        var single = Request("29"); single.GuestCount = 6;
        Check((await booking.CreateAsync(single, staff)).Kind == ReservationBookingResultKind.Success, "Create on table 29 failed");
        var reservation = await db.Reservations.Include(r => r.Tables).SingleAsync();
        var controller = new ReservationsController(db, null!, config, new(db), null!, new(db), new(db), tenant, brand, booking)
        { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        controller.HttpContext.Items["AdminUser"] = staff;
        // Daily public holds intentionally do not prevent staff seating.
        db.PublicTableHolds.Add(new() { ReservedDate = day, TableIdsJson = "[\"29а\"]" }); await db.SaveChangesAsync();
        Check(await controller.UpdateTables(reservation.Id, new() { Area = "indoor", TableIds = ["29", "29А"], GuestCount = 8 }) is OkObjectResult,
            "Staff move 29 -> 29 + Cyrillic 29а must work and canonicalize letter case");
        Check(reservation.Tables.Select(t => t.TableCode).SequenceEqual(["29", "29а"]), "Move must preserve exact configured IDs");
        Check(await controller.UpdateReservation(reservation.Id, new() {
            GuestName = "Edited parity check", Phone = "local-only", Email = "", GuestCount = 9,
            ReservedDate = day, ReservedTime = "19:00", Area = "indoor", TableIds = ["29", "29А"]
        }) is OkObjectResult, "Full edit must preserve staff combination and capacity flexibility");
        Check(await controller.Approve(reservation.Id) is OkObjectResult, "Approve rejected existing staff combination");
        Check(await controller.MarkArrived(reservation.Id) is OkObjectResult, "Arrive rejected existing staff combination");
        Check((await booking.CreateAsync(Request("29а"), staff)).Kind == ReservationBookingResultKind.Conflict,
            "Cyrillic table 29а in a merged reservation must block overlapping bookings");
        Check(await controller.UpdateTables(reservation.Id, new() { Area = "all", TableIds = ["29", "42"] }) is BadRequestObjectResult,
            "Staff move cannot merge zones");
        Check(reservation.Tables.Select(t => t.TableCode).SequenceEqual(["29", "29а"]), "Rejected move changed the reservation");
        await zones.SetClosedAsync("indoor", true);
        Check(await controller.UpdateTables(reservation.Id, new() { Area = "indoor", TableIds = ["29", "29а"] }) is BadRequestObjectResult,
            "Staff combination policy bypassed seasonal closure");
        await zones.SetClosedAsync("indoor", false);
        var savedPlan = await plans.SaveAsync(initial);
        Check(savedPlan.StaffCombinationMode == "same-zone" && (await plans.GetAsync()).Tables.SequenceEqual(initial.Tables),
            "Saving the legacy plan must retain policy, IDs, capacities and geometry");
        foreach (var changed in new[] {
            savedPlan with { Tables = savedPlan.Tables.Select(t => t.Id == "29а" ? t with { IsActive = false } : t).ToList() },
            savedPlan with { Tables = savedPlan.Tables.Select(t => t.Id == "29а" ? t with { Id = "29a" } : t).ToList() },
            savedPlan with { StaffCombinationMode = "configured" }
        }) await Reject(() => plans.SaveAsync(changed), "Future merged reservation must protect table identity/activity and staff policy");
        reservation.CreatedByAdmin = false; // Public-origin reservations retain their attribution after a staff move.
        await db.SaveChangesAsync();
        await Reject(() => plans.SaveAsync(savedPlan with { Tables = savedPlan.Tables.Select(t => t.Id == "29а" ? t with { IsActive = false } : t).ToList() }),
            "Staff-arranged public-origin booking above nominal capacity must still protect its table");
        reservation.CreatedByAdmin = true;
        db.Reservations.Add(new() { GuestName = "Public-origin local check", Phone = "local-only", GuestCount = 6, Area = "indoor",
            ReservedDate = day, ReservedTime = "19:00", Status = "Approved", Tables = [new() { TableCode = "28" }] });
        await db.SaveChangesAsync();
        await Reject(() => plans.SaveAsync(savedPlan with { Tables = savedPlan.Tables.Select(t => t.Id == "28" ? t with { Seats = 5 } : t).ToList() }),
            "New capacity reductions must still protect valid public-origin bookings");
        reservation.Status = "Cancelled"; reservation.IsDeleted = true; await db.SaveChangesAsync();
        var maintenance = new MaintenanceController(db, new(db), null!, new(db), plans)
        { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        Check(await maintenance.RestoreReservation(reservation.Id) is ForbidResult, "Restore without staff session must fail");
        maintenance.HttpContext.Items["AdminUser"] = staff;
        Check(await maintenance.RestoreReservation(reservation.Id) is OkObjectResult, "Restore must accept permitted staff combinations");
        var createCombined = Request("24", "24A"); createCombined.ReservedDate = day.AddDays(1);
        Check((await booking.CreateAsync(createCombined, staff)).Kind == ReservationBookingResultKind.Success, "Staff creation must also support configured Latin-suffix tables");

        // Invoke the action filter so walk-in hours come from this disposable fixture.
        await ((Microsoft.AspNetCore.Mvc.Filters.IAsyncActionFilter)controller).OnActionExecutionAsync(
            new(new Microsoft.AspNetCore.Mvc.ActionContext(controller.HttpContext, new(), new()), [], new Dictionary<string, object?>(), controller),
            () => Task.FromResult(new Microsoft.AspNetCore.Mvc.Filters.ActionExecutedContext(new(controller.HttpContext, new(), new()), [], controller)));
        Check(await controller.CreateWalkIn(new() { Area = "indoor", TableIds = ["29", "29А"], GuestCount = 8 }) is OkObjectResult,
            "Walk-in must retain staff combination policy");
        Check(await controller.CreateWalkIn(new() { Area = "indoor", TableIds = ["29а"], GuestCount = 2 }) is ConflictObjectResult,
            "Arrived walk-in on Cyrillic table must block another walk-in");
        controller.HttpContext.Items.Remove("AdminUser");
        Check(await controller.CreateWalkIn(new() { Area = "indoor", TableIds = ["24", "24a"], GuestCount = 8 }) is UnauthorizedObjectResult,
            "Walk-in must require authentication");
        Console.WriteLine("PASS: Casa 29 → 29+29а create/move/edit/approve/arrive/restore/walk-in parity, exact IDs, conflicts, closures, public limits, authentication and future map protection.");

        // Shared machinery does not import Casa's manual policy into Cofein.
        var cofeinTenant = new CurrentTenant(); cofeinTenant.Resolve(new() { Id = "cofein", Name = "Cofein", Slug = "cofein" });
        await using var cofeinConnection = new SqliteConnection("Data Source=:memory:"); await cofeinConnection.OpenAsync();
        await using var cofeinDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(cofeinConnection).Options);
        await cofeinDb.Database.EnsureCreatedAsync();
        var cofeinPlans = new FloorPlanService(cofeinDb, cofeinTenant);
        var cofeinPlan = await cofeinPlans.SaveAsync((await cofeinPlans.GetAsync()) with {
            Zones = [new("hall", "Hall")], Tables = [new("T01", "hall", 20, 20, 4, false, false, true), new("T02", "hall", 60, 20, 4, false, false, true)]
        });
        Check(cofeinPlan.StaffCombinationMode == "configured" && (await cofeinPlans.SelectAsync(["T01", "T02"], "hall", 8, allowStaffCombinations: true)).Error != null,
            "Cofein must retain its explicit no-combination policy");
        await cofeinPlans.SaveAsync(cofeinPlan with { Combinations = [["T01", "T02"]] });
        Check((await cofeinPlans.SelectAsync(["T01", "T02"], "hall", 8, allowStaffCombinations: true)).Error == null,
            "Another restaurant's own configured combination must work");
        Console.WriteLine("PASS: shared staff combination policy is restaurant-specific; Cofein stays configured-only and public selection stays strict.");
    }

    private sealed class NoNotifications : IReservationBookingNotifications
    {
        public Task SendConfirmationAsync(Reservation reservation, string token) => throw new Exception("Staff checks must not send email");
        public Task NotifyConfirmedAsync(Reservation reservation) => throw new Exception("Staff checks must not send notifications");
    }
}
