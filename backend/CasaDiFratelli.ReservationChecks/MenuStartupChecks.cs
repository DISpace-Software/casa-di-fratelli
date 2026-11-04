using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Controllers;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Tenancy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

internal static class MenuStartupChecks
{
    public static async Task RunAsync()
    {
        await CheckTenantSeedGuardAsync();
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

    private static async Task CheckTenantSeedGuardAsync()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var tenant = new CurrentTenant(); tenant.Resolve(new TenantDefinition { Id = "cofein", Name = "Cofein", Slug = "cofein" });
        var brand = new TenantBrandingService(db, tenant, new ConfigurationBuilder().Build(), NullLogger<TenantBrandingService>.Instance);
        var controller = new MenuController(db, null!, NullLogger<MenuController>.Instance, new AuditService(db), brand);
        if (await controller.Seed() is not ConflictObjectResult || await db.MenuItems.AnyAsync())
            throw new Exception("The shared admin must not populate an empty Cofein menu with Casa's catalogue.");
        db.MenuItems.Add(new MenuItem { NameBg = "Меню на Cofein", Department = "Bar", Category = "cofein-category", Price = 4.25m });
        await db.SaveChangesAsync();
        var before = JsonSerializer.Serialize(await db.MenuItems.AsNoTracking().ToListAsync());
        if (await controller.Seed() is not ConflictObjectResult || before != JsonSerializer.Serialize(await db.MenuItems.AsNoTracking().ToListAsync()))
            throw new Exception("The shared admin must not overwrite or supplement Cofein's existing menu with Casa dishes.");
        Console.WriteLine("PASS: non-Casa menu seed requests leave both empty and populated menus untouched.");
    }
}
