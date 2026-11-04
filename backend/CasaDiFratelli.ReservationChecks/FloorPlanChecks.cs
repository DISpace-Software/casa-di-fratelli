using SeatMap.Api.Controllers;
using SeatMap.Api.Data;
using SeatMap.Api.Dtos;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

internal static class FloorPlanChecks
{
    private static void Check(bool result, string message) { if (!result) throw new Exception(message); }
    private static async Task Reject(Func<Task> action, string message) { try { await action(); } catch (ArgumentException) { return; } catch (FloorPlanConflictException) { return; } throw new Exception(message); }
    public static async Task RunAsync()
    {
        await using var a = new SqliteConnection("Data Source=:memory:"); await a.OpenAsync();
        await using var b = new SqliteConnection("Data Source=:memory:"); await b.OpenAsync();
        await using var da = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(a).Options);
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(b).Options);
        await da.Database.EnsureCreatedAsync(); await db.Database.EnsureCreatedAsync();
        CurrentTenant Tenant(string id) { var t = new CurrentTenant(); t.Resolve(new() { Id = id, Name = id, Slug = id }); return t; }
        var ta = Tenant("alpha"); var tb = Tenant("beta");
        var pa = new FloorPlanService(da, ta); var pb = new FloorPlanService(db, tb);
        Check((await pa.GetAsync()).Tables.Count == 0, "New tenants must start with an empty map");
        Check((await pa.SelectAsync(["1"], null, 2)).Error != null, "Missing map must never inherit Casa capacity");
        var plan = await pa.SaveAsync((await pa.GetAsync()) with {
            Zones = [new("roof", "Roof"), new("private", "Private room")],
            Tables = [new("1", "roof", 20, 20, 2, false, false, true), new("30A", "roof", 60, 20, 4, false, false, true), new("2", "private", 20, 20, 8, false, false, true), new("3", "roof", 20, 60, 8, false, false, false)],
            Combinations = [["1", "30A"]], PublicMaxGuests = 6, PublicMaxTables = 2
        });
        await pb.SaveAsync((await pb.GetAsync()) with { Zones = [new("salon", "Salon")], Tables = [new("1", "salon", 20, 20, 10, false, false, true)] });
        Check((await pa.SelectAsync(["1"], "roof", 3)).Error != null && (await pb.SelectAsync(["1"], "salon", 3)).Error == null, "Same ID must have tenant-specific capacity and zone");
        Check((await pa.SelectAsync(["30a"], "roof", 4)).TableIds.SequenceEqual(["30A"]), "Casa retired IDs must work in other restaurants, with canonical casing");
        foreach (var ids in new string[][] { ["missing"], ["3"], ["1", "2"] }) Check((await pa.SelectAsync(ids, null, 2)).Error != null, "Unknown, inactive or cross-zone selection accepted");
        Check((await pa.SelectAsync(["1"], "private", 2)).Error != null, "Forged zone accepted");
        Check((await pa.SelectAsync(["1", "30A"], "roof", 6, publicBooking: true)).Error == null, "Configured public combination rejected");
        Check((await pa.SelectAsync(["1", "30A"], "roof", 7)).Error != null, "Default selection must respect capacity without an explicit trusted staff override");
        var seasonal = new SeasonalZoneService(da, pa);
        await seasonal.SetClosedAsync("roof", true);
        Check((await pa.SelectAsync(["1"], null, 2)).Error != null, "Dynamic zone closure ignored");
        Check((await pb.SelectAsync(["1"], null, 2)).Error == null, "Closure leaked across databases");
        Check((await pa.SelectAsync(["1", "2"], "all", 0, block: true)).Error == null, "Administrative blocks should not require seating combinations");
        await seasonal.SetClosedAsync("roof", false);
        var changed = await pa.SaveAsync(plan with { PublicMaxGuests = 5 });
        await Reject(() => pa.SaveAsync(plan), "Stale map save overwrote newer changes");
        await Reject(() => pa.SaveAsync(changed with { Tables = changed.Tables.Concat([changed.Tables[0] with { Id = "1" }]).ToList() }), "Duplicate IDs accepted");
        await Reject(() => pa.SaveAsync(changed with { Combinations = [["1", "2"]] }), "Cross-zone combination accepted");
        await Reject(() => pa.SaveAsync(changed with { Tables = [changed.Tables[0] with { Area = "missing" }] }), "Unknown zone accepted");
        da.Reservations.Add(new() { GuestName = "Future guest", Phone = "test", ReservedDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(3), ReservedTime = "19:00", Area = "roof", GuestCount = 2, Status = "Approved", Tables = [new() { TableCode = "1" }] });
        await da.SaveChangesAsync();
        await Reject(() => pa.SaveAsync(changed with { Tables = changed.Tables.Select(t => t.Id == "1" ? t with { IsActive = false } : t).ToList() }), "Disabled a table with an upcoming reservation");
        await Reject(() => pa.SaveAsync(changed with { Tables = changed.Tables.Where(t => t.Id != "1").ToList(), Combinations = [] }), "Deleted a table with reservation history");
        var controller = new ReservationsController(da, null!, null!, new(da), null!, new AuditService(da), null!, ta, null!, null!) { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        controller.HttpContext.Items["AdminUser"] = new AdminPrincipal(1, "Test", "test@example.test", "Administrator");
        var reservation = await da.Reservations.Include(r => r.Tables).SingleAsync();
        Check(await controller.UpdateTables(reservation.Id, new() { TableIds = ["missing"] }) is BadRequestObjectResult, "Move bypassed map validation");
        Check(await controller.UpdateTables(reservation.Id, new() { TableIds = ["30A"], Area = "roof", GuestCount = 5 }) is OkObjectResult, "Authenticated staff move must preserve legacy capacity flexibility");
        Check(await controller.UpdateTables(reservation.Id, new() { TableIds = ["1"], Area = "roof", GuestCount = 2 }) is OkObjectResult, "Staff move could not restore the original selection");
        Check(await controller.CreateWalkIn(new() { TableIds = ["missing"], Area = "roof", GuestCount = 2 }) is BadRequestObjectResult, "Walk-in bypassed validation");
        Check(await controller.BlockTables(new() { TableIds = ["missing"], Area = "all", Times = ["19:00"] }) is BadRequestObjectResult, "Hall block accepted unknown tables");
        var brand = new TenantBrandingService(da, ta, new ConfigurationBuilder().Build(), NullLogger<TenantBrandingService>.Instance);
        var holds = new PublicTableHoldsController(da, new AuditService(da), pa, brand) { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        Check(await holds.Create(new() { TableIds = ["missing"], ReservedDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1) }) is BadRequestObjectResult, "Hold accepted unknown table");
        Check(reservation.Tables.Single().TableCode == "1" && reservation.GuestCount == 2, "Rejected writes changed existing booking");
        var mixedCaseDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(5);
        da.Reservations.Add(new() { GuestName = "Legacy casing", Phone = "test", ReservedDate = mixedCaseDate, ReservedTime = "19:00", Area = "roof", GuestCount = 2, Status = "Approved", Tables = [new() { TableCode = "30a" }] });
        await da.SaveChangesAsync();
        Check(await new ReservationConflictService(da).FindTableConflictAsync(mixedCaseDate, "19:00", ["30A"]) != null, "Historical casing bypassed occupancy");
        await Reject(() => pa.SaveAsync(changed with { Tables = changed.Tables.Select(t => t.Id == "30A" ? t with { Id = "30a" } : t).ToList(), Combinations = [["1", "30a"]] }), "Case-only renaming broke history");
        Console.WriteLine("PASS: restaurant-specific maps/capacities/zones/combinations, fail-closed validation, revision conflicts, history and future booking protection, move/walk-in/block/hold validation.");
        // Reads of legacy maps must neither write nor substitute tables for a saved empty/malformed map.
        await using var legacy = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(b).Options);
        await legacy.AppSettings.Where(x => x.Key == FloorPlanService.StorageKey).ExecuteDeleteAsync();
        var casa = new FloorPlanService(legacy, Tenant("casa-di-fratelli"));
        var initialCasa = await casa.GetAsync();
        Check(initialCasa.Tables.Count == 41 && initialCasa.Tables.All(t => !new[] { "30A", "34A", "45A" }.Contains(t.Id)), "Casa compatibility layout changed");
        Check(await legacy.AppSettings.CountAsync() == 0, "Map GET wrote data");
        await legacy.Database.ExecuteSqlRawAsync("CREATE TABLE \"TableLayouts\" (\"Id\" integer PRIMARY KEY, \"LayoutJson\" text NOT NULL)");
        var snapshotJson = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Fixtures", "casa-layout-2026-11-03.json"));
        var snapshotTables = System.Text.Json.JsonSerializer.Deserialize<List<TableLayoutItem>>(snapshotJson, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
        await legacy.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"TableLayouts\" VALUES (1, {snapshotJson})");
        Check(snapshotTables.Count == 51 && (await casa.GetAsync()).Tables.SequenceEqual(snapshotTables), "Saved production Casa layout must retain all 51 table IDs, coordinates, capacities and flags");
        Console.WriteLine("PASS: saved Casa layout snapshot preserves all 51 tables exactly; the 41-table bootstrap never replaces it.");
        await legacy.Database.ExecuteSqlRawAsync("UPDATE \"TableLayouts\" SET \"LayoutJson\" = '[]'");
        Check((await casa.GetAsync()).Tables.Count == 0 && (await casa.SelectAsync(["1"], null, 2)).Error != null, "Saved empty layout restored Casa defaults");
        await legacy.Database.ExecuteSqlRawAsync("UPDATE \"TableLayouts\" SET \"LayoutJson\" = 'broken'");
        try { await casa.GetAsync(); throw new Exception("Malformed legacy map fell back to Casa"); } catch (System.Text.Json.JsonException) { }
        Console.WriteLine("PASS: Casa compatibility layout, read-only import, saved empty map and corrupt storage fail closed.");
    }
}
