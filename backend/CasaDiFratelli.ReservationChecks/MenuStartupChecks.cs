using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Models;

internal static class MenuStartupChecks
{
    public static async Task RunAsync()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        if (await MenuSeedData.SeedIfEmptyAsync(db) == 0 || !await db.MenuItems.AnyAsync())
            throw new Exception("Empty menu was not initialized.");

        var dish = await db.MenuItems.FirstAsync();
        dish.Price = 123.45m;
        dish.DescriptionBg = "Edited by restaurant";
        db.MenuItems.Add(new MenuItem
        {
            NameBg = dish.NameBg, Weight = dish.Weight, Category = dish.Category,
            Department = dish.Department, Price = dish.Price, IsActive = false
        });
        db.MenuItems.Add(new MenuItem
        {
            NameBg = "Restaurant-only dish", Category = "special", Department = "Kitchen",
            Price = 9.99m, IsActive = true
        });
        await db.SaveChangesAsync();

        async Task<string> Snapshot() => JsonSerializer.Serialize(
            await db.MenuItems.AsNoTracking().OrderBy(x => x.Id).ToListAsync());
        var before = await Snapshot();
        if (await MenuSeedData.SeedIfEmptyAsync(db) != 0 || before != await Snapshot())
            throw new Exception("Startup changed an existing menu or recreated duplicate seed keys.");

        foreach (var item in await db.MenuItems.ToListAsync()) item.IsActive = false;
        await db.SaveChangesAsync();
        before = await Snapshot();
        if (await MenuSeedData.SeedIfEmptyAsync(db) != 0 || before != await Snapshot())
            throw new Exception("An intentionally inactive menu must not be reseeded.");
        Console.WriteLine("PASS: startup initializes only empty menus and preserves custom prices, dishes, inactive items and duplicate historical keys.");
    }
}
