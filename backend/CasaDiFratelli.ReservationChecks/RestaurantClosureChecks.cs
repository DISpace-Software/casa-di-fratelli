using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Tenancy;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

internal static class RestaurantClosureChecks
{
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    public static async Task RunAsync()
    {
        await using var cofeinConnection = new SqliteConnection("Data Source=:memory:");
        await using var casaConnection = new SqliteConnection("Data Source=:memory:");
        await cofeinConnection.OpenAsync();
        await casaConnection.OpenAsync();
        await using var cofeinDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(cofeinConnection).Options);
        await using var casaDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(casaConnection).Options);
        await cofeinDb.Database.EnsureCreatedAsync();
        await casaDb.Database.EnsureCreatedAsync();
        var cofeinTenant = new CurrentTenant(); cofeinTenant.Resolve(new() { Id = "cofein", Name = "Cofein", Slug = "cofein" });
        var casaTenant = new CurrentTenant(); casaTenant.Resolve(new() { Id = "casa-di-fratelli" });
        var cofein = new RestaurantClosureService(cofeinDb, cofeinTenant);
        var casa = new RestaurantClosureService(casaDb, casaTenant);
        var cofeinDefaults = await cofein.GetAsync();
        var casaDefaults = await casa.GetAsync();
        Check(!cofeinDefaults.Enabled && cofeinDefaults.StartDate == default && cofeinDefaults.EndDate == default && cofeinDefaults.Message == "",
            "A new Cofein must not inherit Casa's dated vacation or announcement");
        Check(!RestaurantClosureService.Contains(cofeinDefaults, new(2026, 7, 28)), "Casa vacation must not close Cofein");
        Check(casaDefaults.Enabled && casaDefaults.StartDate == new DateOnly(2026, 7, 27) && casaDefaults.EndDate == new DateOnly(2026, 8, 2) && casaDefaults.Message == RestaurantClosureService.DefaultMessage,
            "Known Casa legacy closure defaults must be preserved");
        Check(!await cofeinDb.AppSettings.AnyAsync() && !await casaDb.AppSettings.AnyAsync(), "Reading defaults must not write either restaurant database");

        var setting = new AppSetting { Key = "restaurant-closure", Value = "invalid-json" };
        cofeinDb.AppSettings.Add(setting); await cofeinDb.SaveChangesAsync();
        Check(await cofein.GetAsync() == cofeinDefaults, "Corrupt Cofein closure must not fall back to Casa's vacation");
        Check((await cofeinDb.AppSettings.SingleAsync()).Value == "invalid-json", "Reading a malformed setting must not overwrite it");
        var ownClosure = new RestaurantClosureSettings(true, new(2027, 1, 4), new(2027, 1, 6), "  Cofein test closure  ");
        var saved = await cofein.SaveAsync(ownClosure);
        Check(saved.Message == "Cofein test closure" && await cofein.GetAsync() == saved && RestaurantClosureService.Contains(saved, new(2027, 1, 5)),
            "A restaurant's explicit saved closure must retain precedence and normal date rules");
        await cofein.SaveAsync(new(false, default, default, ""));
        Check(await cofein.GetAsync() == cofeinDefaults, "A disabled empty saved Cofein setting must not gain Casa's announcement");
        Check(await casa.GetAsync() == casaDefaults && !await casaDb.AppSettings.AnyAsync(), "Cofein saves must preserve Casa state and defaults");
        Console.WriteLine("PASS: Cofein closure defaults are disabled/empty; missing/corrupt/saved-empty settings never inherit Casa vacation; saved restaurant closures and Casa legacy behavior remain intact.");
    }
}
