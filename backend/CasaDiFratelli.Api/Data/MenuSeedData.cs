using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Data;

public static class MenuSeedData
{
    private sealed record SeedMenuItem(
        string Category,
        string NameBg,
        string NameEn,
        string DescriptionBg,
        string DescriptionEn,
        string Weight,
        decimal Price,
        bool Featured = false);

    private static readonly SeedMenuItem[] Items =
    {
        new("salads", "Салата Dei Fratelli", "Dei Fratelli Salad", "Със запечено козе сирене, лоло росо, рукола, бейби спанак, круша, орех пекан и малинов хайвер", "Baked goat cheese, lollo rosso, arugula, baby spinach, pear, pecan, and raspberry caviar", "300 гр", 19.60m),
        new("salads", "Салата от бурата", "Burrata Salad", "Чери домати, кедрови ядки, рукола, песто и домашна фокача", "Cherry tomatoes, pine nuts, arugula, pesto, and homemade focaccia", "360 гр", 20.56m),
        new("salads", "Салата Цезар с пиле", "Chicken Caesar Salad", "Айсберг, пилешко филе, чери домати, пармезан, билкови крутони и сос Цезар", "Iceberg lettuce, chicken fillet, cherry tomatoes, parmesan, croutons, and Caesar dressing", "380 гр", 19.77m),
        new("salads", "Салата с киноа и бейби спанак", "Quinoa and Baby Spinach Salad", "Чери домати, печена чушка, яйце, сирене и мус от орехи", "Cherry tomatoes, roasted pepper, egg, cheese, and walnut mousse", "350 гр", 17.20m),
        new("salads", "Хориатики", "Choriatiki", "Класическа гръцка салата", "Classic Greek salad", "350 гр", 15.90m),
        new("salads", "Домашна млечна салата", "Homemade Dairy Salad", "Свежа домашна млечна салата", "Fresh homemade dairy salad", "270 гр", 10.90m),
        new("salads", "Салата със сотирани тигрови скариди", "Tiger Shrimp Salad", "Микс зелени салати, жулиени зеленчуци и дресинг песто", "Mixed green salads, julienne vegetables, and pesto dressing", "350 гр", 22.32m),
        new("salads", "Салата Фермата", "Farm Salad", "Панирано фермерско сирене, сезонни плодове, меден дресинг, сос от нар и бейби спанак", "Breaded farm cheese, seasonal fruit, honey dressing, pomegranate sauce, and baby spinach", "350 гр", 19.60m),

        new("starters", "Антипасти за двама", "Antipasti for Two", "Плато от италиански колбаси, маслини каламата, сирена и изпечена фокача", "Italian cold cuts, Kalamata olives, cheeses, and baked focaccia", "300 гр", 27.38m),
        new("starters", "Трио разядки с домашен хляб", "Trio of Spreads with Homemade Bread", "Тирокафтери, катък с чушка и млечна салата", "Tirokafteri, katak with pepper, and milk salad", "300 гр", 15.45m),
        new("starters", "Патешки сърца с печурки", "Duck Hearts with Mushrooms", "Топло предястие с наситен вкус", "Warm starter with a rich flavor", "300 гр", 17.90m),
        new("starters", "Бейби калмари с манго сос", "Baby Calamari with Mango Sauce", "Крехки калмари с плодов акцент", "Tender calamari with a fruity accent", "280 гр", 22.90m),
        new("starters", "Скариди темпура", "Tempura Shrimp", "Поднесени с чипотле сос", "Served with chipotle sauce", "250 гр", 22.32m),
        new("starters", "Телешки език с манатарка и скаморца", "Beef Tongue with Porcini and Scamorza", "Богат вкус и кремообразен завършек", "Deep savory flavor with creamy finish", "330 гр", 21.32m),

        new("pasta-risotto", "Ризото с диви гъби и трюфел", "Wild Mushroom and Truffle Risotto", "Кладница, манатарка и пармезан", "Oyster mushrooms, porcini, and parmesan", "360 гр", 20.36m),
        new("pasta-risotto", "Ризото с рибай “Талиата”", "Ribeye Tagliata Risotto", "Signature dish by Chef Yurukov — ризото с шафран, рибай, спанак и чипс от пармезан", "Signature dish by Chef Yurukov — saffron risotto, ribeye, spinach, and parmesan chips", "380 гр", 29.14m, true),
        new("pasta-risotto", "Талиателе песто и скариди", "Pesto Tagliatelle with Shrimp", "Босилеково песто, зехтин, пармезан, шамфъстък и скариди", "Basil pesto, olive oil, parmesan, pistachio, and shrimp", "400 гр", 22.32m),
        new("pasta-risotto", "Талиатели с пистачио и панчета", "Tagliatelle with Pistachio and Pancetta", "Signature dish by Chef Yurukov — домашна паста с крем от шамфъстък и панчета", "Signature dish by Chef Yurukov — homemade pasta with pistachio cream and pancetta", "400 гр", 20.16m, true),
        new("pasta-risotto", "Талиатели Болонезе", "Tagliatelle Bolognese", "Домашна паста с телешка кайма и пармезан", "Homemade pasta with minced beef and parmesan", "400 гр", 18.60m),
        new("pasta-risotto", "Талиателе Карбонара", "Tagliatelle Carbonara", "Домашна паста, панчета и класически сос от жълтък и грана падано", "Homemade pasta, pancetta, and classic egg yolk and Grana Padano sauce", "400 гр", 20.36m),

        new("mains", "Нашите свински ребра с BBQ сос", "BBQ Pork Ribs", "Бавно готвени ребра, глазирани с BBQ сос и бейби картофки", "Slow-cooked ribs glazed with BBQ sauce and baby potatoes", "450 гр", 28.95m),
        new("mains", "Шницел от сочни пилешки гърди", "Chicken Schnitzel", "Поднесен с картофи соте и пармезан", "Served with sauteed potatoes and parmesan", "400 гр", 22.69m),
        new("mains", "Телешки кюфтенца Black Angus", "Black Angus Beef Meatballs", "С опушен катък, домашна лютеница и фокача", "With smoked katak, homemade lutenitsa, and focaccia", "400 гр", 21.51m),
        new("mains", "Рибай стек Black Angus", "Black Angus Ribeye Steak", "Зрял аржентински рибай с бейби картофки, аспержи и сос по избор", "Aged Argentine ribeye with baby potatoes, asparagus, and sauce of choice", "450 гр", 62.59m),
        new("mains", "Филе от лаврак", "Sea Bass Fillet", "С картофено пюре, броколи и beurre blanc сос", "With mashed potatoes, broccoli, and beurre blanc sauce", "400 гр", 26.23m),
        new("mains", "Филе от сьомга със задушени зеленчуци", "Salmon Fillet with Steamed Vegetables", "Бейби моркови, аспержи, тиквички и сос холандез", "Baby carrots, asparagus, zucchini, and hollandaise sauce", "350 гр", 27.40m),

        new("pizza", "Пица с телешко FRATELLI", "Beef FRATELLI Pizza", "Доматен сос, топено сирене, моцарела и червен лук", "Tomato sauce, processed cheese, mozzarella, and red onion", "400 гр", 24.27m),
        new("pizza", "Джорджио", "Giorgio", "Доматен сос, моцарела, кото, шамфъстък, песто, бурата, босилек и лимонови кори", "Tomato sauce, mozzarella, cotto, pistachio, pesto, burrata, basil, and lemon zest", "500 гр", 24.27m),
        new("pizza", "Пица бурата", "Burrata Pizza", "Доматен сос, моцарела, пармезан, крудо, рукола, бурата, чери домати и песто", "Tomato sauce, mozzarella, parmesan, crudo, arugula, burrata, cherry tomatoes, and pesto", "550 гр", 22.90m),
        new("pizza", "Пеперони специална", "Special Pepperoni Pizza", "Доматен сос, моцарела, борд Филаделфия, пеперони и панчета", "Tomato sauce, mozzarella, Philadelphia crust, pepperoni, and pancetta", "500 гр", 22.32m),
        new("pizza", "Прошуто крудо", "Prosciutto Crudo", "Доматен сос, моцарела, крудо, рукола, чери домати и пармезан", "Tomato sauce, mozzarella, crudo, arugula, cherry tomatoes, and parmesan", "450 гр", 22.32m),
        new("pizza", "Куатро стаджони", "Quattro Stagioni", "Доматен сос, моцарела, прошуто кото, панчета, гъби, маслини таджаска и ементал", "Tomato sauce, mozzarella, prosciutto cotto, pancetta, mushrooms, Taggiasca olives, and Emmental", "450 гр", 22.12m),
        new("pizza", "Пица бианка", "Bianca Pizza", "Сметана, моцарела, пушено пуешко филе, царевица и топено сирене", "Cream, mozzarella, smoked turkey fillet, corn, and processed cheese", "450 гр", 21.53m),
        new("pizza", "Капричоза", "Capricciosa", "Доматен сос, моцарела, маслини таджаска, артишок и кото", "Tomato sauce, mozzarella, Taggiasca olives, artichoke, and cotto", "500 гр", 20.36m),
        new("pizza", "Пеперони класик", "Classic Pepperoni Pizza", "Доматен сос, моцарела, пеперони и халапеньо", "Tomato sauce, mozzarella, pepperoni, and jalapeno", "450 гр", 19.58m),
        new("pizza", "Прошуто фунги", "Prosciutto Funghi", "Доматен сос, моцарела, гъби, кото и риган", "Tomato sauce, mozzarella, mushrooms, cotto, and oregano", "450 гр", 18.40m),
        new("pizza", "Калцоне", "Calzone", "Доматен сос, моцарела, гъби, кисели краставички, топено сирене и кото", "Tomato sauce, mozzarella, mushrooms, pickles, processed cheese, and cotto", "500 гр", 18.40m),
        new("pizza", "Салами", "Salami Pizza", "Доматен сос, моцарела, вентричина, топено сирене и червен лук", "Tomato sauce, mozzarella, ventricina, processed cheese, and red onion", "450 гр", 18.40m),
        new("pizza", "Куатро формаджи", "Quattro Formaggi", "Сметана, моцарела, горгонзола, бри, пармезан и чери домати", "Cream, mozzarella, gorgonzola, brie, parmesan, and cherry tomatoes", "450 гр", 18.40m),
        new("pizza", "Поло", "Pollo Pizza", "Доматен сос, моцарела, пилешко филе, кисели краставички, царевица и топено сирене", "Tomato sauce, mozzarella, chicken fillet, pickles, corn, and processed cheese", "450 гр", 18.40m),
        new("pizza", "Примавера", "Primavera Pizza", "Доматен сос, моцарела, прошуто кото, гъби и капия", "Tomato sauce, mozzarella, prosciutto cotto, mushrooms, and kapia pepper", "450 гр", 18.40m),
        new("pizza", "Вегетариана", "Vegetariana", "Доматен сос, моцарела, гъби, артишок, маслини таджаска и рукола", "Tomato sauce, mozzarella, mushrooms, artichoke, Taggiasca olives, and arugula", "400 гр", 18.01m),
        new("pizza", "Маргарита", "Margherita", "Доматен сос, моцарела, риган и босилек", "Tomato sauce, mozzarella, oregano, and basil", "400 гр", 14.90m),

        new("bread", "Цял домашен хляб", "Whole Homemade Bread", "Прясно изпечен домашен хляб", "Freshly baked homemade bread", "450 гр", 11.54m),
        new("bread", "Фокача на парче", "Focaccia Slice", "Класическа фокача", "Classic focaccia", "150 гр", 5.67m),
        new("bread", "Домашна питка с Филаделфия", "Homemade Bread Roll with Philadelphia", "Мека питка с крема сирене", "Soft bread roll with cream cheese", "250 гр", 7.63m),
        new("bread", "Комбинирана пърленка със сирене и кашкавал", "Flatbread with White and Yellow Cheese", "Богат вкус и аромат", "Rich taste and aroma", "350 гр", 7.63m),

        new("desserts", "Пистачио чийзкейк", "Pistachio Cheesecake", "Кремообразен десерт с шамфъстък", "Creamy pistachio dessert", "150 гр", 11.45m),
        new("desserts", "Тирамису", "Tiramisu", "Класически италиански десерт", "Classic Italian dessert", "200 гр", 10.95m),
        new("desserts", "Шоколадов мус by Chef Yurukov", "Chocolate Mousse by Chef Yurukov", "Авторски шоколадов финал", "Signature chocolate finish", "170 гр", 12.01m, true),
        new("desserts", "Шоколадово суфле със сметанов сладолед", "Chocolate Souffle with Cream Ice Cream", "Топъл десерт с кремообразен център", "Warm dessert with a creamy center", "150 гр", 10.17m)
    };

    public static async Task<int> SeedAsync(AppDbContext db)
    {
        var existingItems = await db.MenuItems.ToListAsync();
        var existingItemByName = existingItems.ToDictionary(item => item.NameBg, StringComparer.OrdinalIgnoreCase);

        var now = DateTime.UtcNow;
        var missingItems = Items
            .Where(item => !existingItemByName.ContainsKey(item.NameBg))
            .ToList();

        var updatedCount = 0;
        foreach (var item in Items)
        {
            if (!existingItemByName.TryGetValue(item.NameBg, out var existingItem))
                continue;

            if (existingItem.Price == item.Price &&
                existingItem.Weight == item.Weight &&
                existingItem.DescriptionBg == item.DescriptionBg &&
                existingItem.DescriptionEn == item.DescriptionEn)
            {
                continue;
            }

            existingItem.Price = item.Price;
            existingItem.Weight = item.Weight;
            existingItem.DescriptionBg = item.DescriptionBg;
            existingItem.DescriptionEn = item.DescriptionEn;
            existingItem.UpdatedAtUtc = now;
            updatedCount++;
        }

        if (missingItems.Count == 0 && updatedCount == 0)
            return 0;

        db.MenuItems.AddRange(missingItems.Select(item => new MenuItem
        {
            Category = item.Category,
            NameBg = item.NameBg,
            NameEn = item.NameEn,
            DescriptionBg = item.DescriptionBg,
            DescriptionEn = item.DescriptionEn,
            Weight = item.Weight,
            Price = item.Price,
            IsActive = true,
            NotifySubscribers = item.Featured,
            CreatedAtUtc = now
        }));

        await db.SaveChangesAsync();

        return missingItems.Count + updatedCount;
    }
}
