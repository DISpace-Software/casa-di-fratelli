using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public class InventoryRecipeSeedService
{
    private readonly AppDbContext _db;

    public InventoryRecipeSeedService(AppDbContext db)
    {
        _db = db;
    }

    private sealed record IngredientSeed(string Name, string Category, string Unit, decimal Stock, decimal Minimum, decimal UnitCost);
    private sealed record RecipeSeed(string IngredientName, decimal Quantity, string? Notes = null);

    private static readonly IngredientSeed[] Ingredients =
    {
        new("Тесто за пица", "Тесто", "g", 30000, 5000, 0.003m),
        new("Домашна паста", "Паста", "g", 18000, 2500, 0.006m),
        new("Доматен сос", "Сосове", "g", 15000, 2500, 0.004m),
        new("Моцарела", "Сирена", "g", 12000, 2000, 0.012m),
        new("Пармезан", "Сирена", "g", 6000, 900, 0.025m),
        new("Бурата", "Сирена", "pcs", 80, 10, 2.20m),
        new("Горгонзола", "Сирена", "g", 4000, 700, 0.018m),
        new("Кашкавал", "Сирена", "g", 9000, 1500, 0.011m),
        new("Сирене", "Сирена", "g", 8000, 1200, 0.009m),
        new("Пеперони", "Месо", "g", 5000, 800, 0.018m),
        new("Прошуто крудо", "Месо", "g", 3500, 500, 0.030m),
        new("Панчета", "Месо", "g", 4500, 700, 0.020m),
        new("Пилешко филе", "Месо", "g", 10000, 1800, 0.011m),
        new("Телешко", "Месо", "g", 7000, 1200, 0.022m),
        new("Скариди", "Риба и морски", "g", 5000, 800, 0.032m),
        new("Лаврак", "Риба и морски", "g", 7000, 1000, 0.026m),
        new("Сьомга", "Риба и морски", "g", 6000, 900, 0.028m),
        new("Микс салати", "Зеленчуци", "g", 9000, 1300, 0.006m),
        new("Айсберг", "Зеленчуци", "g", 6000, 900, 0.004m),
        new("Рукола", "Зеленчуци", "g", 3500, 500, 0.010m),
        new("Домати", "Зеленчуци", "g", 12000, 2000, 0.004m),
        new("Чери домати", "Зеленчуци", "g", 5000, 800, 0.008m),
        new("Гъби", "Зеленчуци", "g", 7000, 1000, 0.007m),
        new("Босилек", "Подправки", "g", 1200, 150, 0.020m),
        new("Зехтин", "Мазнини", "ml", 12000, 2000, 0.008m),
        new("Сметана", "Млечни", "ml", 8000, 1200, 0.006m),
        new("Яйца", "Млечни", "pcs", 180, 30, 0.22m),
        new("Брашно", "Сухи", "g", 25000, 4000, 0.002m),
        new("Ориз арборио", "Сухи", "g", 15000, 2500, 0.006m),
        new("Картофи", "Зеленчуци", "g", 20000, 3000, 0.002m),
        new("Цезар сос", "Сосове", "g", 6000, 900, 0.010m),
        new("Крутони", "Сухи", "g", 3500, 500, 0.006m),
        new("Нутела", "Десерти", "g", 7000, 1000, 0.011m),
        new("Шоколад", "Десерти", "g", 6000, 900, 0.014m),
        new("Coca-Cola 330 мл", "Напитки", "pcs", 240, 48, 0.75m),
        new("Безалкохолна напитка 330 мл", "Напитки", "pcs", 300, 60, 0.65m),
        new("Минерална вода", "Напитки", "pcs", 300, 60, 0.35m),
        new("Лимонада база", "Напитки", "ml", 20000, 3000, 0.004m),
        new("Вино", "Алкохол", "ml", 30000, 5000, 0.012m),
        new("Бира", "Алкохол", "pcs", 180, 36, 0.90m),
        new("Кафе", "Бар", "g", 4000, 600, 0.018m),
        new("Вода за кафе", "Бар", "ml", 50000, 5000, 0.0002m),
        new("Ром", "Алкохол", "ml", 5000, 700, 0.018m),
    };

    public async Task<InventorySeedResult> SeedAsync()
    {
        var existingItems = await _db.InventoryItems.ToListAsync();
        var byName = existingItems.ToDictionary(x => Normalize(x.Name), x => x);
        var createdIngredients = 0;

        foreach (var seed in Ingredients)
        {
            if (byName.ContainsKey(Normalize(seed.Name))) continue;

            var item = new InventoryItem
            {
                Name = seed.Name,
                Category = seed.Category,
                Unit = seed.Unit,
                CurrentQuantity = seed.Stock,
                MinimumQuantity = seed.Minimum,
                UnitCost = seed.UnitCost,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.InventoryItems.Add(item);
            byName[Normalize(seed.Name)] = item;
            createdIngredients++;
        }

        await _db.SaveChangesAsync();

        var menuItems = await _db.MenuItems
            .Where(x => x.IsActive)
            .OrderBy(x => x.Department)
            .ThenBy(x => x.Category)
            .ThenBy(x => x.NameBg)
            .ToListAsync();
        var existingRecipeMenuIds = await _db.MenuItemRecipeIngredients
            .Select(x => x.MenuItemId)
            .Distinct()
            .ToListAsync();
        var existingRecipeSet = existingRecipeMenuIds.ToHashSet();
        var createdRecipes = 0;
        var createdRecipeLines = 0;

        foreach (var menuItem in menuItems)
        {
            if (existingRecipeSet.Contains(menuItem.Id)) continue;

            var lines = BuildRecipe(menuItem)
                .GroupBy(x => Normalize(x.IngredientName))
                .Select(group => new
                {
                    Ingredient = byName.GetValueOrDefault(group.Key),
                    Quantity = group.Sum(x => x.Quantity),
                    Notes = group.Select(x => x.Notes).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))
                })
                .Where(x => x.Ingredient != null && x.Quantity > 0)
                .ToList();

            if (lines.Count == 0) continue;

            _db.MenuItemRecipeIngredients.AddRange(lines.Select(line => new MenuItemRecipeIngredient
            {
                MenuItemId = menuItem.Id,
                InventoryItemId = line.Ingredient!.Id,
                Quantity = line.Quantity,
                Notes = line.Notes
            }));
            createdRecipes++;
            createdRecipeLines += lines.Count;
        }

        await _db.SaveChangesAsync();
        return new InventorySeedResult(createdIngredients, createdRecipes, createdRecipeLines, menuItems.Count);
    }

    private static IEnumerable<RecipeSeed> BuildRecipe(MenuItem item)
    {
        var text = Normalize($"{item.NameBg} {item.NameEn} {item.DescriptionBg} {item.DescriptionEn} {item.Category}");
        var isDrink = string.Equals(item.Department, "Bar", StringComparison.OrdinalIgnoreCase);

        if (isDrink)
        {
            if (text.Contains("каф")) return new[] { new RecipeSeed("Кафе", 8), new RecipeSeed("Вода за кафе", 50) };
            if (text.Contains("вино")) return new[] { new RecipeSeed("Вино", 150) };
            if (text.Contains("бира") || text.Contains("будвайзер") || text.Contains("корона")) return new[] { new RecipeSeed("Бира", 1) };
            if (text.Contains("кола") || text.Contains("coca")) return new[] { new RecipeSeed("Coca-Cola 330 мл", 1) };
            if (text.Contains("лимона")) return new[] { new RecipeSeed("Лимонада база", 330) };
            if (text.Contains("вода")) return new[] { new RecipeSeed("Минерална вода", 1) };
            return new[] { new RecipeSeed("Безалкохолна напитка 330 мл", 1) };
        }

        if (text.Contains("пица") || text.Contains("пиц"))
        {
            var lines = new List<RecipeSeed>
            {
                new("Тесто за пица", 250),
                new("Доматен сос", text.Contains("бианка") || text.Contains("нутела") ? 0 : 80),
                new("Моцарела", text.Contains("нутела") ? 0 : 120),
                new("Зехтин", text.Contains("нутела") ? 0 : 10)
            };
            if (text.Contains("пеперони")) lines.Add(new("Пеперони", 70));
            if (text.Contains("прошуто")) lines.Add(new("Прошуто крудо", 70));
            if (text.Contains("панчета")) lines.Add(new("Панчета", 60));
            if (text.Contains("пиле") || text.Contains("поло")) lines.Add(new("Пилешко филе", 90));
            if (text.Contains("гъби") || text.Contains("фунги")) lines.Add(new("Гъби", 90));
            if (text.Contains("рукол")) lines.Add(new("Рукола", 25));
            if (text.Contains("бур")) lines.Add(new("Бурата", 1));
            if (text.Contains("нутела")) lines.Add(new("Нутела", 120));
            if (text.Contains("босил")) lines.Add(new("Босилек", 5));
            return lines.Where(x => x.Quantity > 0);
        }

        if (text.Contains("паста") || text.Contains("талиател") || text.Contains("карбонара") || text.Contains("болонез"))
        {
            var lines = new List<RecipeSeed> { new("Домашна паста", 120), new("Пармезан", 25), new("Зехтин", 10) };
            if (text.Contains("карбонара")) { lines.Add(new("Яйца", 1)); lines.Add(new("Панчета", 80)); lines.Add(new("Сметана", 60)); }
            if (text.Contains("скарид")) lines.Add(new("Скариди", 120));
            if (text.Contains("болон")) lines.Add(new("Телешко", 120));
            if (text.Contains("гъби")) lines.Add(new("Гъби", 100));
            return lines;
        }

        if (text.Contains("ризото"))
        {
            var lines = new List<RecipeSeed> { new("Ориз арборио", 110), new("Пармезан", 25), new("Зехтин", 10) };
            if (text.Contains("лаврак")) lines.Add(new("Лаврак", 150));
            if (text.Contains("рибай")) lines.Add(new("Телешко", 180));
            if (text.Contains("гъби")) lines.Add(new("Гъби", 120));
            return lines;
        }

        if (text.Contains("салат"))
        {
            var lines = new List<RecipeSeed> { new("Микс салати", 120), new("Домати", 80), new("Зехтин", 15) };
            if (text.Contains("цезар")) { lines.Add(new("Айсберг", 120)); lines.Add(new("Пилешко филе", 120)); lines.Add(new("Крутони", 30)); lines.Add(new("Пармезан", 20)); lines.Add(new("Цезар сос", 40)); }
            if (text.Contains("скарид")) lines.Add(new("Скариди", 130));
            if (text.Contains("бур")) lines.Add(new("Бурата", 1));
            if (text.Contains("рукол")) lines.Add(new("Рукола", 70));
            if (text.Contains("сирене")) lines.Add(new("Сирене", 80));
            return lines;
        }

        if (text.Contains("хляб") || text.Contains("пърлен") || text.Contains("фокача"))
        {
            var lines = new List<RecipeSeed> { new("Брашно", 220), new("Зехтин", 15) };
            if (text.Contains("кашкавал")) lines.Add(new("Кашкавал", 80));
            if (text.Contains("сирене")) lines.Add(new("Сирене", 80));
            return lines;
        }

        if (text.Contains("десерт") || text.Contains("мус") || text.Contains("торта") || text.Contains("шоколад"))
            return new[] { new RecipeSeed("Шоколад", 80), new RecipeSeed("Сметана", 80), new RecipeSeed("Яйца", 1) };

        if (text.Contains("сьомг")) return new[] { new RecipeSeed("Сьомга", 220), new RecipeSeed("Картофи", 180), new RecipeSeed("Зехтин", 15) };
        if (text.Contains("лаврак")) return new[] { new RecipeSeed("Лаврак", 260), new RecipeSeed("Картофи", 180), new RecipeSeed("Зехтин", 15) };
        if (text.Contains("пиле")) return new[] { new RecipeSeed("Пилешко филе", 220), new RecipeSeed("Картофи", 180), new RecipeSeed("Зехтин", 15) };
        if (text.Contains("телеш") || text.Contains("рибай")) return new[] { new RecipeSeed("Телешко", 280), new RecipeSeed("Картофи", 180), new RecipeSeed("Зехтин", 15) };

        return new[] { new RecipeSeed("Зехтин", 15), new RecipeSeed("Микс салати", 80) };
    }

    private static string Normalize(string value)
    {
        return value.Trim().ToLowerInvariant();
    }
}

public record InventorySeedResult(int CreatedIngredients, int CreatedRecipes, int CreatedRecipeLines, int MenuItemsSeen);
