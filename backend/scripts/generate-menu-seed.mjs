import fs from "node:fs";

const [, , sourcePath, targetPath] = process.argv;

if (!sourcePath || !targetPath) {
  console.error("Usage: node generate-menu-seed.mjs <source.json> <target.cs>");
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const items = Array.isArray(source.items) ? source.items : [];

const categories = new Map([
  ["Салати", ["Kitchen", "salads"]],
  ["Нещо за начало", ["Kitchen", "starters"]],
  ["Паста и ризото", ["Kitchen", "pasta-risotto"]],
  ["Основни и рибни", ["Kitchen", "mains"]],
  ["BBQ Josper", ["Kitchen", "bbq"]],
  ["Пица", ["Kitchen", "pizza"]],
  ["Домашен хляб", ["Kitchen", "bread"]],
  ["Десерти", ["Kitchen", "desserts"]],
  ["Топли напитки", ["Bar", "hot-drinks"]],
  ["Добавки към напитки", ["Bar", "drink-extras"]],
  ["Безалкохолни", ["Bar", "soft-drinks"]],
  ["Лимонади", ["Bar", "lemonades"]],
  ["Вода", ["Bar", "water"]],
  ["Студени напитки", ["Bar", "cold-drinks"]],
  ["Фреш", ["Bar", "fresh-juice"]],
  ["Наливна бира", ["Bar", "draft-beer"]],
  ["Бутилирана бира и сайдер", ["Bar", "bottled-beer-cider"]],
  ["Шотландско уиски", ["Bar", "scotch-whisky"]],
  ["Ирландско уиски", ["Bar", "irish-whisky"]],
  ["Бърбън и тенеси", ["Bar", "bourbon-tennessee"]],
  ["Коняк и бренди", ["Bar", "cognac-brandy"]],
  ["Анасонови напитки", ["Bar", "anise-drinks"]],
  ["Ром", ["Bar", "rum"]],
  ["Водка", ["Bar", "vodka"]],
  ["Джин", ["Bar", "gin"]],
  ["Текила", ["Bar", "tequila"]],
  ["Ликьори и вермути", ["Bar", "liqueurs-vermouth"]],
  ["Ракия", ["Bar", "rakia"]],
  ["Коктейли", ["Bar", "cocktails"]],
]);

const legacyNames = new Map([
  ["Салата от бурата с прошуто крудо", "Салата от бурата"],
  ["Градинска салата „Пирамида“", "Салата Пирамида"],
  ["Патешки сърца с печурки и масло", "Патешки сърца с печурки"],
  ["Телешки език Апулия", "Телешки език с манатарка и скаморца"],
  ["Ризото с рибай „Талията“", "Ризото с рибай „Таглиата“"],
  ["Талиатели Карбонара", "Талиателе Карбонара"],
  ["Двоен чийзбургер 100% телешко Black Angus", "Чийзбургер 100% телешко Black Angus"],
  ["Домашната плескавица", "Домашната плескавица на Бране"],
  ["Бианка", "Пица бианка"],
  ["Бурата", "Пица бурата"],
  ["Пица Нутела с ягоди", "Пица Нутела с Ягоди"],
  ["Пържени сладки картофки", "Пържени сладки картофи"],
  ["Шоколадов мус от бял и черен шоколад", "Шоколадов мус by Chef Yurukov"],
  ["Шоколадово суфле с ванилов сладолед", "Шоколадово суфле със сметанов сладолед"],
]);

function cs(value) {
  return `@"${String(value ?? "").replaceAll('"', '""')}"`;
}

function price(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error(`Invalid price: ${value}`);
  return `${numeric.toFixed(2)}m`;
}

const rows = items.map((item) => {
  const mapped = categories.get(item.category);
  if (!mapped) throw new Error(`Unknown category: ${item.category}`);
  const [department, category] = mapped;
  const legacyName = legacyNames.get(item.name_bg) || "";
  const description = item.name_bg === "Цял домашен хляб" ? "" : item.description_bg || "";
  return `        new(${cs(department)}, ${cs(category)}, ${cs(item.name_bg)}, ${cs(item.name_en || item.name_bg)}, ${cs(item.name_ru || item.name_bg)}, ${cs(description)}, ${cs(item.description_en || description)}, ${cs(item.description_ru || description)}, ${cs(item.quantity || "")}, ${price(item.price_eur)}, ${cs(legacyName)})`;
});

const output = `using System.Text;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Data;

public static class MenuSeedData
{
    private sealed record SeedMenuItem(
        string Department,
        string Category,
        string NameBg,
        string NameEn,
        string NameRu,
        string DescriptionBg,
        string DescriptionEn,
        string DescriptionRu,
        string Weight,
        decimal Price,
        string LegacyNameBg = "");

    private static string NormalizeKeyPart(string? value)
    {
        var normalized = (value ?? string.Empty)
            .Normalize(NormalizationForm.FormKC)
            .Trim()
            .ToLowerInvariant()
            .Replace("гр.", "г")
            .Replace("гр", "г")
            .Replace('–', '-')
            .Replace('—', '-')
            .Replace("„", string.Empty)
            .Replace("“", string.Empty)
            .Replace("”", string.Empty)
            .Replace("\\\"", string.Empty)
            .Replace("’", "'");

        return string.Join(' ', normalized.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static string BuildSeedKey(string department, string category, string nameBg, string weight)
    {
        return $"{NormalizeKeyPart(department)}|{NormalizeKeyPart(category)}|{NormalizeKeyPart(nameBg)}|{NormalizeKeyPart(weight)}";
    }

    private static readonly SeedMenuItem[] Items =
    {
${rows.join(",\n")}
    };

    public static async Task<int> SeedAsync(AppDbContext db)
    {
        var existingItems = await db.MenuItems.ToListAsync();
        var unmatchedExistingItems = new HashSet<MenuItem>(existingItems);

        var existingItemsByKey = existingItems
            .GroupBy(item => BuildSeedKey(item.Department, item.Category, item.NameBg, item.Weight), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        MenuItem? FindUniqueExistingItem(SeedMenuItem item, string name, string weight)
        {
            var key = BuildSeedKey(item.Department, item.Category, name, weight);
            return existingItemsByKey.TryGetValue(key, out var matches) && matches.Count == 1
                ? matches[0]
                : null;
        }

        MenuItem? FindExistingItem(SeedMenuItem item)
        {
            var exactMatch = FindUniqueExistingItem(item, item.NameBg, item.Weight);
            if (exactMatch != null) return exactMatch;

            if (string.IsNullOrWhiteSpace(item.Weight))
            {
                var nameMatches = existingItems
                    .Where(existing =>
                        NormalizeKeyPart(existing.Department) == NormalizeKeyPart(item.Department) &&
                        NormalizeKeyPart(existing.Category) == NormalizeKeyPart(item.Category) &&
                        NormalizeKeyPart(existing.NameBg) == NormalizeKeyPart(item.NameBg))
                    .ToList();
                if (nameMatches.Count == 1) return nameMatches[0];
            }

            if (string.IsNullOrWhiteSpace(item.LegacyNameBg)) return null;

            var legacyMatch = FindUniqueExistingItem(item, item.LegacyNameBg, item.Weight);
            if (legacyMatch != null) return legacyMatch;

            var legacyNameMatches = existingItems
                .Where(existing =>
                    NormalizeKeyPart(existing.Department) == NormalizeKeyPart(item.Department) &&
                    NormalizeKeyPart(existing.Category) == NormalizeKeyPart(item.Category) &&
                    NormalizeKeyPart(existing.NameBg) == NormalizeKeyPart(item.LegacyNameBg))
                .ToList();

            return legacyNameMatches.Count == 1 ? legacyNameMatches[0] : null;
        }

        var now = DateTime.UtcNow;
        var changedCount = 0;

        foreach (var item in Items)
        {
            var existingItem = FindExistingItem(item);
            if (existingItem == null)
            {
                db.MenuItems.Add(new MenuItem
                {
                    Department = item.Department,
                    Category = item.Category,
                    NameBg = item.NameBg,
                    NameEn = item.NameEn,
                    NameRu = item.NameRu,
                    DescriptionBg = item.DescriptionBg,
                    DescriptionEn = item.DescriptionEn,
                    DescriptionRu = item.DescriptionRu,
                    Weight = item.Weight,
                    Price = item.Price,
                    IsActive = true,
                    NotifySubscribers = false,
                    CreatedAtUtc = now
                });
                changedCount++;
                continue;
            }

            unmatchedExistingItems.Remove(existingItem);
            var targetWeight = string.IsNullOrWhiteSpace(item.Weight) ? existingItem.Weight : item.Weight;
            var changed = existingItem.NameBg != item.NameBg ||
                existingItem.Price != item.Price ||
                existingItem.Weight != targetWeight ||
                existingItem.Category != item.Category ||
                existingItem.Department != item.Department ||
                existingItem.DescriptionBg != item.DescriptionBg;
            changed = changed ||
                existingItem.NameEn != item.NameEn ||
                existingItem.NameRu != item.NameRu ||
                existingItem.DescriptionEn != item.DescriptionEn ||
                existingItem.DescriptionRu != item.DescriptionRu;

            if (!changed) continue;

            existingItem.NameBg = item.NameBg;
            existingItem.NameEn = item.NameEn;
            existingItem.NameRu = item.NameRu;
            existingItem.DescriptionBg = item.DescriptionBg;
            existingItem.DescriptionEn = item.DescriptionEn;
            existingItem.DescriptionRu = item.DescriptionRu;
            existingItem.Price = item.Price;
            existingItem.Weight = targetWeight;
            existingItem.Category = item.Category;
            existingItem.Department = item.Department;
            existingItem.UpdatedAtUtc = now;
            changedCount++;
        }

        foreach (var obsoleteItem in unmatchedExistingItems.Where(item => item.IsActive))
        {
            obsoleteItem.IsActive = false;
            obsoleteItem.UpdatedAtUtc = now;
            changedCount++;
        }

        if (changedCount == 0) return 0;

        await db.SaveChangesAsync();
        return changedCount;
    }
}
`;

fs.writeFileSync(targetPath, output);
console.log(`Generated ${items.length} menu items in ${targetPath}`);
