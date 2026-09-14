using System.Text;
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
            .Replace("\"", string.Empty)
            .Replace("’", "'");

        return string.Join(' ', normalized.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static string BuildSeedKey(string department, string category, string nameBg, string weight)
    {
        return $"{NormalizeKeyPart(department)}|{NormalizeKeyPart(category)}|{NormalizeKeyPart(nameBg)}|{NormalizeKeyPart(weight)}";
    }

    private static readonly SeedMenuItem[] Items =
    {
        new(@"Kitchen", @"salads", @"Салата Dei Fratelli", @"Salad Dei Fratelli", @"Салат Деи Фрателли", @"Запечено козе сирене, лоло росо, рукола, бейби спанак, круша, орех пекан и малинов хайвер", @"Baked goat cheese, lolo rosso, arugula, baby spinach, pear, pecan and raspberry caviar", @"Запеченный козий сыр, лоло Россо, руккола, молодой шпинат, груша, орех пекан и малиновая икра", @"300 г", 9.60m, @""),
        new(@"Kitchen", @"salads", @"Почти Цезар салата", @"Almost a Caesar salad", @"Почти салат Цезарь", @"Хрупкаво панирано пилешко, пармезан, микс салати, Цезар дресинг, крутони от фокача и чери домати", @"Crispy breaded chicken, parmesan, mixed salads, Caesar dressing, focaccia croutons and cherry tomatoes", @"Хрустящая курица в панировке, пармезан, микс салатов, соус «Цезарь», гренки фокачча и помидоры черри", @"350 г", 9.80m, @""),
        new(@"Kitchen", @"salads", @"Салата от бурата с прошуто крудо", @"Burrata salad with prosciutto crudo", @"Салат буррата с прошутто крудо", @"Бурата, микс чери домати, кедрови ядки, валериана, песто и домашна фокача", @"Burrata, mixed cherry tomatoes, pine nuts, lamb's lettuce, pesto and homemade focaccia", @"Буррата, микс помидоров черри, кедровые орехи, корн-салат, песто и домашняя фокачча", @"360 г", 10.90m, @"Салата от бурата"),
        new(@"Kitchen", @"salads", @"Салата Цезар с пиле", @"Caesar salad with chicken", @"Салат Цезарь с курицей", @"Айсберг, пилешко филе, чери домати, пармезан, билкови крутони, сос Цезар и чипс от прошуто", @"Iceberg, chicken fillet, cherry tomatoes, parmesan, herb croutons, Caesar sauce and prosciutto chips", @"Айсберг, куриное филе, помидоры черри, пармезан, гренки с зеленью, соус Цезарь и чипсы прошутто", @"380 г", 9.70m, @""),
        new(@"Kitchen", @"salads", @"Салата със сотирани тигрови скариди", @"Salad with sauteed tiger prawns", @"Салат с жареными тигровыми креветками", @"Микс зеленолистни салати и жулиени от зеленчуци с песто дресинг", @"Mix of green leafy salads and julienned vegetables with pesto dressing", @"Микс из зеленых листовых салатов и нарезанных соломкой овощей с соусом песто", @"350 г", 10.90m, @""),
        new(@"Kitchen", @"salads", @"Салата Фермата", @"Farm salad", @"Фермерский салат", @"Панирано фермерско краве сирене, сезонни плодове, меден дресинг, сос от нар, бейби спанак и маруля", @"Breaded farm cow cheese, seasonal fruit, honey dressing, pomegranate dressing, baby spinach and lettuce", @"Панированный фермерский сыр, сезонные фрукты, медовая заправка, гранатовая заправка, молодой шпинат и салат.", @"350 г", 9.80m, @""),
        new(@"Kitchen", @"salads", @"Градинска салата „Пирамида“", @"Pyramid Garden Salad", @"Пирамидальный садовый салат", @"Розов домат, тиквичка, патладжан, печена чушка, пресен лук и прясно краве сирене", @"Pink tomato, zucchini, eggplant, roasted pepper, fresh onion and fresh cow's cheese", @"Розовый помидор, цуккини, баклажан, жареный перец, свежий лук и свежий коровий сыр", @"360 г", 9.90m, @"Салата Пирамида"),
        new(@"Kitchen", @"salads", @"Биволарска салата", @"Buffalo Cheese Salad", @"Салат с буйволиным сыром", @"Розов домат, краставица, биволско сирене, печена чушка, маслини Каламата и магданоз", @"Pink tomato, cucumber, buffalo cheese, roasted pepper, Kalamata olives and parsley", @"Розовый помидор, огурец, сыр Баффало, жареный перец, оливки Каламата и петрушка", @"350 г", 9.60m, @""),
        new(@"Kitchen", @"salads", @"Салата с киноа и бейби спанак", @"Quinoa and baby spinach salad", @"Салат из киноа и молодого шпината", @"Чери домати, печена чушка, яйце, мус от сирена и орехи", @"Cherry tomatoes, roasted pepper, egg, cheese mousse and walnuts", @"Помидоры черри, жареный перец, яйцо, сырный мусс и грецкие орехи", @"350 г", 9.70m, @""),
        new(@"Kitchen", @"starters", @"Антипасти за двама", @"Antipasti for two", @"Антипасти на двоих", @"Италиански колбаси, маслини Каламата, микс сирена, разядки, чери домати и изпечена фокача", @"Italian sausages, Kalamata olives, mixed cheeses, appetizers, cherry tomatoes and baked focaccia", @"Итальянские колбаски, оливки Каламата, сырные смеси, закуски, помидоры черри и запеченная фокачча.", @"300 г", 14.00m, @""),
        new(@"Kitchen", @"starters", @"Стек тартар", @"Steak Tartare", @"Стейк Тартар", @"Телешко бонфиле Black Angus, шалот, кисели краставички и свежи подправки, с домашни брускети", @"Black Angus beef tenderloin, shallots, pickles and fresh spices, with homemade bruschetta", @"Говяжья вырезка Блэк Ангус, лук-шалот, соленые огурцы и свежие специи, с домашней брускеттой", @"250 г", 12.50m, @""),
        new(@"Kitchen", @"starters", @"Патешки сърца с печурки и масло", @"Duck hearts with mushrooms and butter", @"Утиные сердечки с грибами и сливочным маслом", @"", @"", @"", @"300 г", 9.50m, @"Патешки сърца с печурки"),
        new(@"Kitchen", @"starters", @"Бейби калмари с манго сос", @"Baby Calamari with Mango Sauce", @"Бейби-кальмары с соусом манго", @"Панирани калмари с леко сладък пикантен манго сос и сусам", @"Breaded squid with slightly sweet spicy mango sauce and sesame seeds", @"Кальмары в панировке со слегка сладковатым пикантным соусом из манго и кунжутом", @"280 г", 11.30m, @""),
        new(@"Kitchen", @"starters", @"Скариди темпура", @"Shrimp tempura", @"Креветки темпура", @"С чипотле сос и лайм", @"With chipotle sauce and lime", @"С соусом чипотле и лаймом", @"250 г", 11.00m, @""),
        new(@"Kitchen", @"starters", @"Панирани пилешки бонфиленца", @"Breaded chicken tenderloins", @"Куриные вырезки в панировке", @"С пържени картофки и млечен сос", @"With French fries and yogurt sauce", @"С картофелем фри и йогуртовым соусом", @"400 г", 8.90m, @""),
        new(@"Kitchen", @"starters", @"Крокети от тиквички със сирена", @"Zucchini croquettes with cheese", @"Крокеты из кабачков с сыром", @"С копър и млечен мус от катък и цвекло", @"With dill and a yogurt-cheese mousse with beetroot", @"С укропом и муссом из катыка со свёклой", @"300 г", 9.90m, @""),
        new(@"Kitchen", @"starters", @"Телешки език Апулия", @"Veal tongue Apulia", @"Телячий язык Апулия", @"С домашно масло, манатарки, пушена скаморца и жу", @"With homemade butter, porcini mushrooms, smoked scamorza and jus", @"С домашним маслом, белыми грибами, копчёной скаморцей и соусом жу", @"330 г", 10.90m, @"Телешки език с манатарка и скаморца"),
        new(@"Kitchen", @"starters", @"Пържени сладки картофки", @"Fried sweet potatoes", @"Жареный сладкий картофель", @"С пармезан и трюфел майонеза", @"With parmesan and truffle mayonnaise", @"С пармезаном и трюфельным майонезом", @"250 г", 7.00m, @"Пържени сладки картофи"),
        new(@"Kitchen", @"starters", @"Пържени картофи", @"Fried potatoes", @"Жареный картофель", @"", @"", @"", @"300 г", 4.20m, @""),
        new(@"Kitchen", @"pasta-risotto", @"Ризото с диви гъби и трюфел", @"Risotto with wild mushrooms and truffle", @"Ризотто с лесными грибами и трюфелем", @"Ориз арборио, кладница, манатарка и пармезан", @"Arborio rice, oyster mushrooms, porcini and parmesan", @"Рис арборио, вешенки, белые грибы и пармезан", @"360 г", 9.90m, @""),
        new(@"Kitchen", @"pasta-risotto", @"Ризото с рибай „Талията“", @"Risotto with Ribeye Tagliata", @"Ризотто с рибай тальята", @"Ризото с шафран, аржентински рибай, спанак и чипс от пармезан", @"Risotto with saffron, Argentinian ribeye, spinach and parmesan chips", @"Ризотто с шафраном, аргентинским рибай, шпинатом и чипсами из пармезана", @"380 г", 15.90m, @"Ризото с рибай „Таглиата“"),
        new(@"Kitchen", @"pasta-risotto", @"Лингуини с морски дарове", @"Linguini with seafood", @"Лингвини с морепродуктами", @"Октопод, скариди, калмари, зехтин, чесън, чери домати и магданоз", @"Octopus, shrimp, squid, olive oil, garlic, cherry tomatoes and parsley", @"Осьминог, креветки, кальмары, оливковое масло, чеснок, помидоры черри и петрушка", @"400 г", 11.90m, @""),
        new(@"Kitchen", @"pasta-risotto", @"Равиоли „Аньолоти“", @"Agnolotti Ravioli", @"Аньолотти Равиоли", @"Ръчно направени равиоли с рикота и спанак, бавно сготвен доматен сос и пармезан", @"Handmade ravioli with ricotta and spinach, slow cooked tomato sauce and parmesan cheese", @"Равиоли ручной работы с рикоттой и шпинатом, томатным соусом медленного приготовления и сыром пармезан", @"400 г", 11.50m, @""),
        new(@"Kitchen", @"pasta-risotto", @"Паста Gigli с песто и скариди", @"Pasta Gigli with pesto and shrimps", @"Паста Джильи с песто и креветками", @"Босилеково песто, зехтин, пармезан, шамфъстък и скариди", @"Basil pesto, olive oil, parmesan, pistachios and shrimp", @"Песто из базилика, оливковое масло, пармезан, фисташки и креветки.", @"400 г", 10.90m, @""),
        new(@"Kitchen", @"pasta-risotto", @"Талиатели с пистачио и панчета", @"Tagliatelle with pistachio and pancetta", @"Тальятелле с фисташками и панчеттой", @"Крем от шамфъстък, панчета и пармезан", @"Pistachio cream, pancetta and parmesan", @"Фисташковый крем, панчетта и пармезан", @"400 г", 10.90m, @""),
        new(@"Kitchen", @"pasta-risotto", @"Талиатели Болонезе", @"Tagliatelle Bolognese", @"Тальятелле Болоньезе", @"Телешка кайма, доматен сос и пармезан", @"Beef mince, tomato sauce and parmesan", @"Говяжий фарш, томатный соус и пармезан", @"400 г", 9.00m, @""),
        new(@"Kitchen", @"pasta-risotto", @"Талиатели Карбонара", @"Tagliatelle Carbonara", @"Тальятелле Карбонара", @"Панчета, класически сос от жълтък, Grana Padano и черен пипер", @"Pancetta, classic egg yolk sauce, Grana Padano and black pepper", @"Панчетта, классический соус из яичных желтков, Грана Падано и черный перец", @"400 г", 9.20m, @"Талиателе Карбонара"),
        new(@"Kitchen", @"mains", @"Нашите свински ребра с BBQ сос", @"Our pork ribs with BBQ sauce", @"Наши свиные ребрышки с соусом Барбекю", @"Бавно готвени ребра, глазирани с BBQ сос, с бейби картофки", @"Slow cooked ribs, glazed with BBQ sauce, with baby potatoes", @"Ребрышки медленного приготовления, глазированные соусом Барбекю, с молодым картофелем", @"450 г", 14.90m, @""),
        new(@"Kitchen", @"mains", @"Шницел от сочни пилешки гърди", @"Juicy chicken breast schnitzel", @"Сочный шницель из куриной грудки", @"С картофи соте, магданоз и пармезан", @"With sauteed potatoes, parsley and parmesan", @"С жареным картофелем, петрушкой и пармезаном", @"400 г", 11.90m, @""),
        new(@"Kitchen", @"mains", @"Телешки кюфтенца Black Angus", @"Black Angus Beef Meatballs", @"Фрикадельки из говядины Блэк Ангус", @"С опушен катък, домашна лютеница и фокача", @"With smoked katak, homemade lutenitsa and focaccia", @"С копчёным катыком, домашней лютеницей и фокаччей", @"400 г", 11.00m, @""),
        new(@"Kitchen", @"mains", @"Двоен чийзбургер 100% телешко Black Angus", @"Double cheeseburger 100% Black Angus beef", @"Двойной чизбургер из 100% говядины Блэк Ангус", @"Айсберг, домат, чедър, кисели краставички, яйце, бургер сос и пържени картофки", @"Iceberg, tomato, cheddar, pickles, egg, burger sauce and fries", @"Айсберг, помидоры, чеддер, соленые огурцы, яйцо, соус для бургера и картофель фри", @"500 г", 11.90m, @"Чийзбургер 100% телешко Black Angus"),
        new(@"Kitchen", @"mains", @"Пилешки шишчета", @"Chicken skewers", @"Куриные шашлычки", @"Доматен хумус и салатка с магданоз, домат и червен лук", @"Tomato hummus and salad with parsley, tomato and red onion", @"Томатный хумус и салат с петрушкой, помидорами и красным луком", @"400 г", 10.90m, @""),
        new(@"Kitchen", @"mains", @"Филе от лаврак", @"Sea bass fillet", @"Филе сибаса", @"Картофено пюре, броколи и сос beurre blanc", @"Mashed potatoes, broccoli and beurre blanc sauce", @"Картофельное пюре, брокколи и соус Бер Блан", @"400 г", 12.90m, @""),
        new(@"Kitchen", @"mains", @"Филе от сьомга със задушени зеленчуци", @"Salmon fillet with stewed vegetables", @"Филе лосося с тушеными овощами", @"Бейби моркови, аспержи, тиквички и сос Холандез", @"Baby carrots, asparagus, zucchini and hollandaise sauce", @"Бэби-морковь, спаржа, цуккини и голландский соус", @"350 г", 13.50m, @""),
        new(@"Kitchen", @"mains", @"Октопод Josper Grill", @"Octopus Josper Grill", @"Осьминог Хоспер Гриль", @"Бейби картофи в масло, чимичури, каперси и свежа салата", @"Baby potatoes in butter, chimichurri, capers and fresh salad", @"Молодой картофель в масле, чимичурри, каперсы и свежий салат", @"400 г", 17.50m, @""),
        new(@"Kitchen", @"mains", @"Цял лаврак Josper Grill", @"Josper Grill whole sea bass", @"Морской окунь Хоспер Гриль целиком", @"Свежа салата с фенел и лимон", @"Fresh salad with fennel and lemon", @"Свежий салат с фенхелем и лимоном", @"500–600 г", 14.90m, @""),
        new(@"Kitchen", @"bbq", @"Аржентинско телешко бонфиле", @"Argentinian beef tenderloin", @"Аргентинская говяжья вырезка", @"Печени картофи, сезонни зеленчуци и гъбен или пепър сос", @"Baked potatoes, seasonal vegetables and mushroom or pepper sauce", @"Запеченный картофель, сезонные овощи и грибной или перечный соус.", @"400 г", 28.90m, @""),
        new(@"Kitchen", @"bbq", @"Свински кралски котлет", @"Pork Loin Chop", @"Свиной королевский котлет", @"Печени картофи, гриловани сезонни зеленчуци и пинджур", @"Baked potatoes, grilled seasonal vegetables and pinjur", @"Запеченный картофель, сезонные овощи на гриле и пинджур", @"500 г", 14.90m, @""),
        new(@"Kitchen", @"bbq", @"Свински врат", @"Pork neck", @"Свиная шея", @"Печени картофи, гриловани сезонни зеленчуци и пинджур", @"Baked potatoes, grilled seasonal vegetables and pinjur", @"Запеченный картофель, сезонные овощи на гриле и пинджур", @"450 г", 10.50m, @""),
        new(@"Kitchen", @"bbq", @"Свински гърдички", @"Pork Belly", @"Свиная грудинка", @"Печени картофи, гриловани сезонни зеленчуци и пинджур", @"Baked potatoes, grilled seasonal vegetables and pinjur", @"Запеченный картофель, сезонные овощи на гриле и пинджур", @"450 г", 10.90m, @""),
        new(@"Kitchen", @"bbq", @"Рибай стек Black Angus", @"Black Angus Ribeye Steak", @"Стейк Рибай Блэк Ангус", @"36 дни зрял аржентински рибай, бейби картофки, аспержи и гъбен или пепър сос", @"36 day aged Argentinian ribeye, baby potatoes, asparagus and mushroom or pepper sauce", @"Аргентинский рибай 36-дневной выдержки, молодой картофель, спаржа и грибной или перечный соус.", @"450 г", 32.00m, @""),
        new(@"Kitchen", @"bbq", @"Пилешко филе", @"Chicken fillet", @"Куриное филе", @"Бейби картофи, гриловани зеленчуци и гъбен или пепър сос", @"Baby potatoes, grilled vegetables and mushroom or pepper sauce", @"Молодой картофель, овощи гриль и грибной или перечный соус.", @"400 г", 9.90m, @""),
        new(@"Kitchen", @"bbq", @"Домашната плескавица", @"Homemade Pleskavitsa", @"Домашняя плескавица", @"Печени картофи, гриловани сезонни зеленчуци и тиро", @"Roasted potatoes, grilled seasonal vegetables and tirokafteri", @"Запечённый картофель, сезонные овощи гриль и тирокафтери", @"450 г", 10.90m, @"Домашната плескавица на Бране"),
        new(@"Kitchen", @"bbq", @"Балканска скара за четирима", @"Balkan grill for four", @"Балканский гриль на четверых", @"Пилешки пържолки, свински гърдички, телешки кюфтенца, свински врат, чеснови бейби картофки и задушени гъби", @"Chicken steaks, pork belly, beef meatballs, pork neck, garlic baby potatoes and sautéed mushrooms", @"Куриные стейки, свиная грудинка, говяжьи тефтели, свиная шея, молодой картофель с чесноком и жареные грибы", @"2000 г", 59.90m, @""),
        new(@"Kitchen", @"bbq", @"Балканска скара за двама", @"Balkan grill for two", @"Балканский гриль на двоих", @"Пилешки пържолки, свински гърдички, телешки кюфтенца, свински врат, чеснови бейби картофки и задушени гъби", @"Chicken steaks, pork belly, beef meatballs, pork neck, garlic baby potatoes and sautéed mushrooms", @"Куриные стейки, свиная грудинка, говяжьи тефтели, свиная шея, молодой картофель с чесноком и жареные грибы", @"1000 г", 32.00m, @""),
        new(@"Kitchen", @"pizza", @"Маргарита", @"Margarita", @"Маргарита", @"Доматен сос, моцарела, риган и босилек", @"Tomato sauce, mozzarella, oregano and basil", @"Томатный соус, моцарелла, орегано и базилик", @"400 г", 7.90m, @""),
        new(@"Kitchen", @"pizza", @"Маринара", @"Marinara", @"Маринара", @"Доматен сос, чесън, зехтин и босилек", @"Tomato sauce, garlic, olive oil and basil", @"Томатный соус, чеснок, оливковое масло и базилик", @"350 г", 6.90m, @""),
        new(@"Kitchen", @"pizza", @"Прошуто фунги", @"Prosciutto Funghi", @"Прошутто фунги", @"Доматен сос, моцарела, гъби, кото и риган", @"Tomato sauce, mozzarella, mushrooms, kotto and oregano", @"Томатный соус, моцарелла, шампиньоны, котто и орегано", @"450 г", 8.90m, @""),
        new(@"Kitchen", @"pizza", @"Пица с телешко „Fratelli“", @"Fratelli Veal Pizza", @"Пицца Фрателли с телятиной", @"Доматен сос, топено сирене, червен лук и моцарела", @"Tomato sauce, melted cheese, red onion and mozzarella", @"Томатный соус, плавленый сыр, красный лук и моцарелла", @"400 г", 11.90m, @""),
        new(@"Kitchen", @"pizza", @"Капричоза", @"Capricciosa", @"Капричоза", @"Доматен сос, моцарела, маслини Каламата, артишок, кото и гъби", @"Tomato sauce, mozzarella, Kalamata olives, artichoke, kotto and mushrooms", @"Томатный соус, моцарелла, оливки Каламата, артишок, котто и грибы", @"500 г", 9.90m, @""),
        new(@"Kitchen", @"pizza", @"Калцоне", @"Calzone", @"Кальцоне", @"Доматен сос, моцарела, гъби, кисели краставички, топено сирене и кото", @"Tomato sauce, mozzarella, mushrooms, pickles, melted cheese and kotto", @"Томатный соус, моцарелла, шампиньоны, соленые огурцы, плавленый сыр и котто", @"500 г", 9.00m, @""),
        new(@"Kitchen", @"pizza", @"Салами", @"Salami", @"Салями", @"Доматен сос, моцарела, вентричина, топено сирене и червен лук", @"Tomato sauce, mozzarella, ventricina, melted cheese and red onion", @"Томатный соус, моцарелла, вентричина, плавленый сыр и красный лук", @"450 г", 9.30m, @""),
        new(@"Kitchen", @"pizza", @"Пеперони специална", @"Pepperoni Special", @"Пепперони специальная", @"Бор Филаделфия, доматен сос, моцарела, пеперони и панчета", @"Philadelphia-stuffed crust, tomato sauce, mozzarella, pepperoni and pancetta", @"Борт с сыром Филадельфия, томатный соус, моцарелла, пепперони и панчетта", @"500 г", 10.90m, @""),
        new(@"Kitchen", @"pizza", @"Куатро стаджони", @"Quattro Stagioni", @"Кватро Стаджони", @"Доматен сос, моцарела, кото, панчета, гъби и маслини Каламата", @"Tomato sauce, mozzarella, kotto, pancetta, mushrooms and Kalamata olives", @"Томатный соус, моцарелла, котто, панчетта, грибы и оливки Каламата", @"450 г", 10.90m, @""),
        new(@"Kitchen", @"pizza", @"Куатро формаджи", @"Quattro Formaggi", @"Кватро Формаджи", @"Сметана, моцарела, горгонзола, бри, пармезан и чери домати", @"Sour cream, mozzarella, gorgonzola, brie, parmesan and cherry tomatoes", @"Сметана, моцарелла, горгонзола, бри, пармезан и помидоры черри", @"450 г", 9.50m, @""),
        new(@"Kitchen", @"pizza", @"Бианка", @"Bianca", @"Бьянка", @"Сметана, моцарела, пушено пуешко филе, царевица и топено сирене", @"Sour cream, mozzarella, smoked turkey fillet, corn and melted cheese", @"Сметана, моцарелла, копченое филе индейки, кукуруза и плавленый сыр", @"450 г", 10.50m, @"Пица бианка"),
        new(@"Kitchen", @"pizza", @"Поло", @"Polo", @"Поло", @"Доматен сос, моцарела, пилешко филе, кисели краставички, царевица и топено сирене", @"Tomato sauce, mozzarella, chicken fillet, pickles, corn and melted cheese", @"Томатный соус, моцарелла, куриное филе, соленые огурцы, кукуруза и плавленый сыр", @"450 г", 9.00m, @""),
        new(@"Kitchen", @"pizza", @"Примавера", @"Primavera", @"Примавера", @"Доматен сос, моцарела, кото, гъби и капия", @"Tomato sauce, mozzarella, kotto, mushrooms and capia", @"Томатный соус, моцарелла, котто, шампиньоны и капия", @"450 г", 8.90m, @""),
        new(@"Kitchen", @"pizza", @"Прошуто крудо", @"Prosciutto crudo", @"Прошутто крудо", @"Доматен сос, моцарела, крудо, рукола, чери домати и пармезан", @"Tomato sauce, mozzarella, crudo, arugula, cherry tomatoes and parmesan", @"Томатный соус, моцарелла, крудо, руккола, помидоры черри и пармезан", @"450 г", 10.90m, @""),
        new(@"Kitchen", @"pizza", @"Вегетариана", @"Vegetariana", @"Вегетариана", @"Доматен сос, моцарела, гъби, артишок, Каламата и рукола", @"Tomato sauce, mozzarella, mushrooms, artichoke, Kalamata and arugula", @"Томатный соус, моцарелла, шампиньоны, артишоки, каламата и руккола", @"400 г", 8.80m, @""),
        new(@"Kitchen", @"pizza", @"Бурата", @"Burrata", @"Буррата", @"Доматен сос, моцарела, пармезан, крудо, рукола, бурата, чери домати и песто", @"Tomato sauce, mozzarella, parmesan, crudo, arugula, burrata, cherry tomatoes and pesto", @"Томатный соус, моцарелла, пармезан, крудо, руккола, буррата, помидоры черри и песто", @"550 г", 11.50m, @"Пица бурата"),
        new(@"Kitchen", @"pizza", @"Пеперони класик", @"Pepperoni classic", @"Пепперони классический", @"Доматен сос, моцарела, пеперони и халапеньо", @"Tomato sauce, mozzarella, pepperoni and jalapeño", @"Томатный соус, моцарелла, пепперони и халапеньо", @"450 г", 9.50m, @""),
        new(@"Kitchen", @"pizza", @"Джорджио", @"Giorgio", @"Джорджио", @"Доматен сос, моцарела, кото, шамфъстък, песто, бурата, босилек и лимонови кори", @"Tomato sauce, mozzarella, cotto, pistachios, pesto, burrata, basil and lemon peels", @"Томатный соус, моцарелла, котто, фисташки, песто, буррата, базилик и цедра лимона", @"500 г", 11.90m, @""),
        new(@"Kitchen", @"pizza", @"Мортадела и пистачио", @"Mortadella and pistachios", @"Мортаделла и фисташки", @"Моцарела, мортадела, пистачио и страчатела", @"Mozzarella, mortadella, pistachio and stracciatella", @"Моцарелла, мортаделла, фисташки и страчателла", @"450 г", 11.90m, @""),
        new(@"Kitchen", @"bread", @"Цял домашен хляб", @"Whole Homemade Bread", @"Целый домашний хлеб", @"", @"", @"", @"", 7.50m, @""),
        new(@"Kitchen", @"bread", @"Фокача на парче", @"Focaccia Slice", @"Кусочек фокаччи", @"", @"", @"", @"150 г", 2.90m, @""),
        new(@"Kitchen", @"bread", @"Домашна питка с Филаделфия", @"Homemade Bread Roll with Philadelphia", @"Домашняя лепёшка с сыром Филадельфия", @"", @"", @"", @"250 г", 4.00m, @""),
        new(@"Kitchen", @"bread", @"Домашна питка на пещ", @"Homemade Oven-Baked Bread Roll", @"Домашняя лепёшка из печи", @"", @"", @"", @"180 г", 3.50m, @""),
        new(@"Kitchen", @"bread", @"Пърленка с кашкавал", @"Flatbread with Yellow Cheese", @"Лепёшка с кашкавалом", @"", @"", @"", @"320 г", 3.50m, @""),
        new(@"Kitchen", @"bread", @"Пърленка със сирене", @"Flatbread with White Cheese", @"Лепёшка с брынзой", @"", @"", @"", @"320 г", 3.30m, @""),
        new(@"Kitchen", @"bread", @"Пърленка с масло", @"Flatbread with Butter", @"Лепёшка с маслом", @"", @"", @"", @"250 г", 2.90m, @""),
        new(@"Kitchen", @"bread", @"Пърленка с чесново масло", @"Flatbread with Garlic Butter", @"Лепёшка с чесночным маслом", @"", @"", @"", @"250 г", 3.20m, @""),
        new(@"Kitchen", @"bread", @"Комбинирана пърленка със сирене и кашкавал", @"Flatbread with White and Yellow Cheese", @"Лепёшка с брынзой и кашкавалом", @"", @"", @"", @"350 г", 4.00m, @""),
        new(@"Kitchen", @"desserts", @"Неаполитански „Баба“ десерт", @"Neapolitan Baba Dessert", @"Неаполитанский десерт «Баба»", @"Крем от маскарпоне, портокалова кора и сезонни плодове", @"Mascarpone cream, orange peel and seasonal fruits", @"Крем маскарпоне, апельсиновая цедра и сезонные фрукты", @"200 г", 6.90m, @""),
        new(@"Kitchen", @"desserts", @"Пистачио чийзкейк", @"Pistachio cheesecake", @"Фисташковый чизкейк", @"", @"", @"", @"150 г", 6.90m, @""),
        new(@"Kitchen", @"desserts", @"Тирамису", @"Tiramisu", @"Тирамису", @"", @"", @"", @"200 г", 5.90m, @""),
        new(@"Kitchen", @"desserts", @"Шоколадов мус от бял и черен шоколад", @"White and Dark Chocolate Mousse", @"Мусс из белого и тёмного шоколада", @"", @"", @"", @"170 г", 7.00m, @"Шоколадов мус by Chef Yurukov"),
        new(@"Kitchen", @"desserts", @"Шоколадово суфле с ванилов сладолед", @"Chocolate souffle with vanilla ice cream", @"Шоколадное суфле с ванильным мороженым", @"", @"", @"", @"150 г", 6.90m, @"Шоколадово суфле със сметанов сладолед"),
        new(@"Kitchen", @"desserts", @"Крем брюле „Orange“", @"Creme Brulee ""Orange""", @"Крем-брюле «Апельсин»", @"", @"", @"", @"150 г", 5.90m, @""),
        new(@"Kitchen", @"desserts", @"Сладолед", @"Ice cream", @"Мороженое", @"Ванилия, белгийски ягодов с парченца ягоди или шоколадов", @"Vanilla, Belgian strawberry with strawberry pieces or chocolate", @"Ваниль, бельгийская клубника с кусочками клубники или шоколад", @"150 г", 5.20m, @""),
        new(@"Kitchen", @"desserts", @"Пица Нутела с ягоди", @"Nutella pizza with strawberries", @"Пицца Нутелла с клубникой", @"", @"", @"", @"300 г", 7.50m, @"Пица Нутела с Ягоди"),
        new(@"Bar", @"hot-drinks", @"Кафе", @"Coffee", @"Кофе", @"", @"", @"", @"60 мл", 1.80m, @""),
        new(@"Bar", @"hot-drinks", @"Чай бял / голд", @"White / gold tea", @"Белый/золотой чай", @"", @"", @"", @"250 мл", 2.50m, @""),
        new(@"Bar", @"hot-drinks", @"Горещ шоколад", @"Hot chocolate", @"Горячий шоколад", @"", @"", @"", @"250 мл", 2.90m, @""),
        new(@"Bar", @"hot-drinks", @"Мляко с какао", @"Milk with cocoa", @"Молоко с какао", @"", @"", @"", @"250 мл", 2.50m, @""),
        new(@"Bar", @"hot-drinks", @"Чаша горещо мляко", @"A glass of hot milk", @"Стакан горячего молока", @"", @"", @"", @"250 мл", 1.50m, @""),
        new(@"Bar", @"hot-drinks", @"Капучино", @"Cappuccino", @"Капучино", @"", @"", @"", @"180 мл", 2.80m, @""),
        new(@"Bar", @"hot-drinks", @"Нес кафе", @"Instant Coffee", @"Растворимый кофе", @"", @"", @"", @"250 мл", 1.80m, @""),
        new(@"Bar", @"hot-drinks", @"Мляко с нес", @"Milk with Instant Coffee", @"Молоко с растворимым кофе", @"", @"", @"", @"250 мл", 2.50m, @""),
        new(@"Bar", @"hot-drinks", @"Лате макиато", @"Latte macchiato", @"Латте макиато", @"", @"", @"", @"250 мл", 3.00m, @""),
        new(@"Bar", @"drink-extras", @"Мед", @"Honey", @"Мёд", @"", @"", @"", @"15 мл", 0.50m, @""),
        new(@"Bar", @"drink-extras", @"Каничка мляко", @"A jug of milk", @"Кувшин молока", @"", @"", @"", @"30 мл", 0.50m, @""),
        new(@"Bar", @"soft-drinks", @"Кока-Кола", @"Coca-Cola", @"Кока-Кола", @"", @"", @"", @"250 мл", 2.09m, @""),
        new(@"Bar", @"soft-drinks", @"Кока-Кола Zero", @"Coca-Cola Zero", @"Кока-Кола Зеро", @"", @"", @"", @"250 мл", 2.09m, @""),
        new(@"Bar", @"soft-drinks", @"Фанта", @"Fanta", @"Фанта", @"", @"", @"", @"250 мл", 2.09m, @""),
        new(@"Bar", @"soft-drinks", @"Спрайт", @"Sprite", @"Спрайт", @"", @"", @"", @"250 мл", 2.09m, @""),
        new(@"Bar", @"soft-drinks", @"Швепс", @"Schweppes", @"Швепс", @"", @"", @"", @"250 мл", 2.09m, @""),
        new(@"Bar", @"soft-drinks", @"Швепс сода", @"Schweppes soda", @"Швепс содовая", @"", @"", @"", @"250 мл", 2.09m, @""),
        new(@"Bar", @"soft-drinks", @"Швепс тоник", @"Schweppes tonic", @"Швепс тоник", @"", @"", @"", @"250 мл", 2.09m, @""),
        new(@"Bar", @"soft-drinks", @"Швепс розов тоник", @"Schweppes pink tonic", @"Швепс розовый тоник", @"", @"", @"", @"250 мл", 2.09m, @""),
        new(@"Bar", @"soft-drinks", @"Сок Cappy", @"Cappy juice", @"Каппи сок", @"", @"", @"", @"250 мл", 2.30m, @""),
        new(@"Bar", @"soft-drinks", @"Red Bull", @"Red Bull", @"Red Bull", @"", @"", @"", @"250 мл", 3.60m, @""),
        new(@"Bar", @"soft-drinks", @"Red Bull Light", @"Red Bull Light", @"Red Bull Light", @"", @"", @"", @"250 мл", 3.60m, @""),
        new(@"Bar", @"soft-drinks", @"Айрян малък", @"Small Ayran", @"Маленький айран", @"", @"", @"", @"400 мл", 1.80m, @""),
        new(@"Bar", @"soft-drinks", @"Айрян голям", @"Large Ayran", @"Большой айран", @"", @"", @"", @"1 л", 3.60m, @""),
        new(@"Bar", @"lemonades", @"Лимонада", @"Lemonade", @"Лимонад", @"", @"", @"", @"1 л", 7.20m, @""),
        new(@"Bar", @"lemonades", @"Маракуя", @"Passion fruit", @"Маракуйя", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Ягода", @"Strawberry", @"Клубника", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Малина", @"Raspberry", @"Малиновый", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Бъз и джинджифил", @"Elderflower and Ginger", @"Бузина и имбирь", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Бъз", @"Elderflower", @"Бузина", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Боровинка", @"Blueberry", @"черника", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Манго", @"Mango", @"Манго", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Праскова", @"Peach", @"Персик", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Ананас", @"Pineapple", @"Ананас", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Цитронада", @"Citronade", @"Цитронад", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"lemonades", @"Цитронада", @"Citronade", @"Цитронад", @"", @"", @"", @"1 л", 6.20m, @""),
        new(@"Bar", @"lemonades", @"Оранжада", @"Orangeade", @"Оранжад", @"", @"", @"", @"450 мл", 3.90m, @""),
        new(@"Bar", @"water", @"Банкя", @"Bankya", @"Банкя", @"", @"", @"", @"330 мл", 1.99m, @""),
        new(@"Bar", @"water", @"Банкя", @"Bankya", @"Банкя", @"", @"", @"", @"1 л", 2.90m, @""),
        new(@"Bar", @"water", @"Ferrarelle Sparkling", @"Ferrarelle Sparkling", @"Ferrarelle Sparkling", @"", @"", @"", @"330 мл", 2.35m, @""),
        new(@"Bar", @"water", @"San Pellegrino", @"San Pellegrino", @"San Pellegrino", @"", @"", @"", @"750 мл", 4.50m, @""),
        new(@"Bar", @"water", @"San Pellegrino", @"San Pellegrino", @"San Pellegrino", @"", @"", @"", @"250 мл", 2.10m, @""),
        new(@"Bar", @"water", @"Acqua Panna", @"Acqua Panna", @"Acqua Panna", @"", @"", @"", @"250 мл", 2.50m, @""),
        new(@"Bar", @"water", @"Acqua Panna", @"Acqua Panna", @"Acqua Panna", @"", @"", @"", @"750 мл", 4.90m, @""),
        new(@"Bar", @"water", @"Perrier", @"Perrier", @"Perrier", @"", @"", @"", @"330 мл", 3.10m, @""),
        new(@"Bar", @"cold-drinks", @"Фрапе", @"Frappe", @"Фраппе", @"", @"", @"", @"400 мл", 2.80m, @""),
        new(@"Bar", @"cold-drinks", @"Капучино фредо", @"Cappuccino Fredo", @"Капучино Фредо", @"", @"", @"", @"300 мл", 2.90m, @""),
        new(@"Bar", @"cold-drinks", @"Чокофредо", @"Chocofredo", @"Чокофредо", @"", @"", @"", @"300 мл", 2.90m, @""),
        new(@"Bar", @"fresh-juice", @"Портокал", @"Orange", @"Апельсин", @"", @"", @"", @"250 мл", 3.70m, @""),
        new(@"Bar", @"fresh-juice", @"Грейпфрут", @"Grapefruit", @"Грейпфрут", @"", @"", @"", @"250 мл", 3.10m, @""),
        new(@"Bar", @"fresh-juice", @"Цитрус микс", @"Citrus mix", @"Цитрусовый микс", @"", @"", @"", @"250 мл", 3.10m, @""),
        new(@"Bar", @"draft-beer", @"Бланка 1664", @"1664 Blanc", @"1664 Блан", @"", @"", @"", @"330 мл", 2.99m, @""),
        new(@"Bar", @"draft-beer", @"Бланка 1664", @"1664 Blanc", @"1664 Блан", @"", @"", @"", @"500 мл", 3.99m, @""),
        new(@"Bar", @"draft-beer", @"Карлсберг", @"Carlsberg", @"Карлсберг", @"", @"", @"", @"330 мл", 2.89m, @""),
        new(@"Bar", @"draft-beer", @"Карлсберг", @"Carlsberg", @"Карлсберг", @"", @"", @"", @"500 мл", 3.29m, @""),
        new(@"Bar", @"draft-beer", @"Шуменско", @"Shumensko", @"Шуменско", @"", @"", @"", @"330 мл", 2.29m, @""),
        new(@"Bar", @"draft-beer", @"Шуменско", @"Shumensko", @"Шуменско", @"", @"", @"", @"500 мл", 2.69m, @""),
        new(@"Bar", @"draft-beer", @"Ердингер", @"Erdinger", @"Эрдингер", @"", @"", @"", @"330 мл", 3.99m, @""),
        new(@"Bar", @"draft-beer", @"Ердингер", @"Erdinger", @"Эрдингер", @"", @"", @"", @"500 мл", 4.39m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Ердингер", @"Erdinger", @"Эрдингер", @"", @"", @"", @"500 мл", 4.39m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Будвайзер", @"Budweiser", @"Будвайзер", @"", @"", @"", @"330 мл", 3.29m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Будвайзер", @"Budweiser", @"Будвайзер", @"", @"", @"", @"500 мл", 3.99m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Карлсберг", @"Carlsberg", @"Карлсберг", @"", @"", @"", @"330 мл", 2.99m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Карлсберг", @"Carlsberg", @"Карлсберг", @"", @"", @"", @"500 мл", 3.59m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Карлсберг 0%", @"Carlsberg 0%", @"Карлсберг 0%", @"", @"", @"", @"330 мл", 2.99m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Туборг", @"Tuborg", @"Туборг", @"", @"", @"", @"330 мл", 2.99m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Шуменско бомбичка", @"Shumensko Small Bottle", @"Шуменско, маленькая бутылка", @"", @"", @"", @"250 мл", 2.29m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Корона", @"Corona", @"Корона", @"", @"", @"", @"355 мл", 3.99m, @""),
        new(@"Bar", @"bottled-beer-cider", @"Самърсби", @"Somersby", @"Сомерсби", @"Ябълка, боровинка или горски плод", @"Apple, blueberry or wild fruit", @"Яблоко, черника или дикие фрукты", @"330 мл", 3.19m, @""),
        new(@"Bar", @"scotch-whisky", @"Johnnie Walker Red Label", @"Johnnie Walker Red Label", @"Johnnie Walker Red Label", @"", @"", @"", @"50 мл", 3.90m, @""),
        new(@"Bar", @"scotch-whisky", @"Johnnie Walker Black Label", @"Johnnie Walker Black Label", @"Johnnie Walker Black Label", @"", @"", @"", @"50 мл", 5.90m, @""),
        new(@"Bar", @"scotch-whisky", @"Chivas Regal 12", @"Chivas Regal 12", @"Chivas Regal 12", @"", @"", @"", @"50 мл", 6.60m, @""),
        new(@"Bar", @"irish-whisky", @"Jameson", @"Jameson", @"Jameson", @"", @"", @"", @"50 мл", 4.50m, @""),
        new(@"Bar", @"irish-whisky", @"Jameson Black Barrel", @"Jameson Black Barrel", @"Jameson Black Barrel", @"", @"", @"", @"50 мл", 5.90m, @""),
        new(@"Bar", @"irish-whisky", @"Bushmills", @"Bushmills", @"Bushmills", @"", @"", @"", @"50 мл", 4.50m, @""),
        new(@"Bar", @"irish-whisky", @"Black Bush", @"Black Bush", @"Black Bush", @"", @"", @"", @"50 мл", 6.20m, @""),
        new(@"Bar", @"irish-whisky", @"Proper Twelve", @"Proper Twelve", @"Proper Twelve", @"", @"", @"", @"50 мл", 5.30m, @""),
        new(@"Bar", @"irish-whisky", @"Glenfiddich 12", @"Glenfiddich 12", @"Glenfiddich 12", @"", @"", @"", @"50 мл", 6.40m, @""),
        new(@"Bar", @"irish-whisky", @"Glenfiddich 15", @"Glenfiddich 15", @"Glenfiddich 15", @"", @"", @"", @"50 мл", 7.90m, @""),
        new(@"Bar", @"irish-whisky", @"Macallan 12", @"Macallan 12", @"Macallan 12", @"", @"", @"", @"50 мл", 11.20m, @""),
        new(@"Bar", @"irish-whisky", @"Lagavulin 16", @"Lagavulin 16", @"Lagavulin 16", @"", @"", @"", @"50 мл", 13.20m, @""),
        new(@"Bar", @"bourbon-tennessee", @"Jack Daniel’s", @"Jack Daniel’s", @"Jack Daniel’s", @"", @"", @"", @"50 мл", 5.30m, @""),
        new(@"Bar", @"bourbon-tennessee", @"Gentleman Jack", @"Gentleman Jack", @"Gentleman Jack", @"", @"", @"", @"50 мл", 6.30m, @""),
        new(@"Bar", @"bourbon-tennessee", @"Woodford Reserve", @"Woodford Reserve", @"Woodford Reserve", @"", @"", @"", @"50 мл", 10.00m, @""),
        new(@"Bar", @"bourbon-tennessee", @"Jim Beam", @"Jim Beam", @"Jim Beam", @"", @"", @"", @"50 мл", 3.90m, @""),
        new(@"Bar", @"bourbon-tennessee", @"Four Roses", @"Four Roses", @"Four Roses", @"", @"", @"", @"50 мл", 3.90m, @""),
        new(@"Bar", @"cognac-brandy", @"Черноморско злато", @"Black Sea gold", @"Черноморское золото.", @"", @"", @"", @"50 мл", 2.70m, @""),
        new(@"Bar", @"cognac-brandy", @"Metaxa 5", @"Metaxa 5", @"Metaxa 5", @"", @"", @"", @"50 мл", 4.50m, @""),
        new(@"Bar", @"cognac-brandy", @"Hennessy V.S.", @"Hennessy V.S.", @"Hennessy V.S.", @"", @"", @"", @"50 мл", 6.00m, @""),
        new(@"Bar", @"anise-drinks", @"Узо Баба Зим", @"Ouzo Baba Zim", @"Узо Баба Зим", @"", @"", @"", @"50 мл", 3.10m, @""),
        new(@"Bar", @"anise-drinks", @"Узо Баба Зим", @"Ouzo Baba Zim", @"Узо Баба Зим", @"", @"", @"", @"200 мл", 9.20m, @""),
        new(@"Bar", @"anise-drinks", @"Узо Пломари", @"Ouzo Plomari", @"Узо Пломари", @"", @"", @"", @"50 мл", 3.10m, @""),
        new(@"Bar", @"anise-drinks", @"Узо Пломари", @"Ouzo Plomari", @"Узо Пломари", @"", @"", @"", @"200 мл", 9.20m, @""),
        new(@"Bar", @"anise-drinks", @"Узо Мини", @"Ouzo Mini", @"Узо Мини", @"", @"", @"", @"50 мл", 2.90m, @""),
        new(@"Bar", @"anise-drinks", @"Перно", @"Pernod", @"Перно", @"", @"", @"", @"50 мл", 3.50m, @""),
        new(@"Bar", @"anise-drinks", @"Узо Сертико", @"Ouzo Sertico", @"Узо Сертико", @"", @"", @"", @"50 мл", 3.50m, @""),
        new(@"Bar", @"anise-drinks", @"Узо Сертико", @"Ouzo Sertico", @"Узо Сертико", @"", @"", @"", @"200 мл", 10.70m, @""),
        new(@"Bar", @"rum", @"Bacardi Bianco", @"Bacardi Bianco", @"Bacardi Bianco", @"", @"", @"", @"50 мл", 3.50m, @""),
        new(@"Bar", @"rum", @"Bacardi Gold", @"Bacardi Gold", @"Bacardi Gold", @"", @"", @"", @"50 мл", 3.50m, @""),
        new(@"Bar", @"rum", @"Captain Morgan Spiced", @"Captain Morgan Spiced", @"Captain Morgan Spiced", @"", @"", @"", @"50 мл", 4.00m, @""),
        new(@"Bar", @"vodka", @"Finlandia", @"Finlandia", @"Finlandia", @"", @"", @"", @"50 мл", 3.80m, @""),
        new(@"Bar", @"vodka", @"Руски стандарт", @"Russian standard", @"Русский стандарт", @"", @"", @"", @"50 мл", 3.80m, @""),
        new(@"Bar", @"vodka", @"Reyka", @"Reyka", @"Reyka", @"", @"", @"", @"50 мл", 3.90m, @""),
        new(@"Bar", @"vodka", @"Grey Goose", @"Grey Goose", @"Grey Goose", @"", @"", @"", @"50 мл", 7.90m, @""),
        new(@"Bar", @"vodka", @"Belvedere", @"Belvedere", @"Belvedere", @"", @"", @"", @"50 мл", 7.90m, @""),
        new(@"Bar", @"gin", @"Gordon’s", @"Gordon’s", @"Gordon’s", @"", @"", @"", @"50 мл", 3.10m, @""),
        new(@"Bar", @"gin", @"Bombay Sapphire", @"Bombay Sapphire", @"Bombay Sapphire", @"", @"", @"", @"50 мл", 3.50m, @""),
        new(@"Bar", @"gin", @"Tanqueray", @"Tanqueray", @"Tanqueray", @"", @"", @"", @"50 мл", 4.00m, @""),
        new(@"Bar", @"gin", @"Whitley Neill Малина", @"Whitley Neill Raspberry", @"Уитли Нил Малина", @"", @"", @"", @"50 мл", 5.50m, @""),
        new(@"Bar", @"gin", @"Whitley Neill Алое", @"Whitley Neill Aloe", @"Уитли Нил Алоэ", @"", @"", @"", @"50 мл", 5.50m, @""),
        new(@"Bar", @"gin", @"Hendrick’s", @"Hendrick’s", @"Hendrick’s", @"", @"", @"", @"50 мл", 6.10m, @""),
        new(@"Bar", @"gin", @"Berkshire", @"Berkshire", @"Berkshire", @"", @"", @"", @"50 мл", 6.60m, @""),
        new(@"Bar", @"tequila", @"Jose Cuervo Silver", @"Jose Cuervo Silver", @"Jose Cuervo Silver", @"", @"", @"", @"30 мл", 3.10m, @""),
        new(@"Bar", @"tequila", @"Jose Cuervo Gold", @"Jose Cuervo Gold", @"Jose Cuervo Gold", @"", @"", @"", @"30 мл", 3.70m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Baileys", @"Baileys", @"Baileys", @"", @"", @"", @"50 мл", 2.90m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Amaretto", @"Amaretto", @"Amaretto", @"", @"", @"", @"50 мл", 3.90m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Limoncello", @"Limoncello", @"Limoncello", @"", @"", @"", @"50 мл", 3.00m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Jägermeister", @"Jägermeister", @"Jägermeister", @"", @"", @"", @"30 мл", 3.00m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Frangelico", @"Frangelico", @"Frangelico", @"", @"", @"", @"50 мл", 3.90m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Aftershock", @"Aftershock", @"Aftershock", @"Син, червен или черен", @"Blue, red or black", @"Синий, красный или черный", @"", 2.60m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Campari", @"Campari", @"Campari", @"", @"", @"", @"50 мл", 2.90m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Aperol", @"Aperol", @"Aperol", @"", @"", @"", @"50 мл", 2.60m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Martini", @"Martini", @"Martini", @"", @"", @"", @"100 мл", 4.00m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Martini Extra Dry", @"Martini Extra Dry", @"Martini Extra Dry", @"", @"", @"", @"100 мл", 4.00m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Martini Bianco", @"Martini Bianco", @"Martini Bianco", @"", @"", @"", @"50 мл", 4.00m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Antica Formula", @"Antica Formula", @"Antica Formula", @"", @"", @"", @"50 мл", 4.69m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Fernet Branca", @"Fernet Branca", @"Fernet Branca", @"", @"", @"", @"50 мл", 3.32m, @""),
        new(@"Bar", @"liqueurs-vermouth", @"Branca Menta", @"Branca Menta", @"Branca Menta", @"", @"", @"", @"50 мл", 3.32m, @""),
        new(@"Bar", @"rakia", @"Пещерска гроздова", @"Peshterska Grape Rakia", @"Пещерска виноградная ракия", @"", @"", @"", @"50 мл", 2.50m, @""),
        new(@"Bar", @"rakia", @"Пещерска гроздова отлежала", @"Peshterska Aged Grape Rakia", @"Пещерска выдержанная виноградная ракия", @"", @"", @"", @"50 мл", 2.80m, @""),
        new(@"Bar", @"rakia", @"Троянска сливова", @"Troyanska Plum Rakia", @"Троянска сливовая ракия", @"", @"", @"", @"50 мл", 2.70m, @""),
        new(@"Bar", @"rakia", @"Троянска сливова 7 г.", @"Troyanska Plum Rakia, 7 Years", @"Троянска сливовая ракия, 7 лет", @"", @"", @"", @"50 мл", 3.90m, @""),
        new(@"Bar", @"rakia", @"Сливенска перла", @"Slivenska Perla Rakia", @"Ракия Сливенска Перла", @"", @"", @"", @"50 мл", 3.80m, @""),
        new(@"Bar", @"rakia", @"Бургаска мускатова", @"Burgaska Muscat Rakia", @"Бургаска мускатная ракия", @"", @"", @"", @"50 мл", 2.80m, @""),
        new(@"Bar", @"rakia", @"Поморийска мускатова", @"Pomoriyska Muscat Rakia", @"Поморийска мускатная ракия", @"", @"", @"", @"50 мл", 2.80m, @""),
        new(@"Bar", @"rakia", @"Кортен отлежала мускат", @"Korten Aged Muscat Rakia", @"Кортен выдержанная мускатная ракия", @"", @"", @"", @"50 мл", 5.60m, @""),
        new(@"Bar", @"rakia", @"Стралджанска мускат отлежала", @"Straldzhanska Aged Muscat Rakia", @"Стралджанска выдержанная мускатная ракия", @"", @"", @"", @"50 мл", 3.90m, @""),
        new(@"Bar", @"rakia", @"Стралджанска мускат барел", @"Straldzhanska Muscat Barrel Rakia", @"Стралджанска мускатная ракия Barrel", @"", @"", @"", @"50 мл", 4.20m, @""),
        new(@"Bar", @"rakia", @"Бургас 63 оригинал", @"Burgas 63 original", @"Бургас 63 оригинал", @"", @"", @"", @"50 мл", 2.90m, @""),
        new(@"Bar", @"rakia", @"Бургас 63 барел", @"Burgas 63 Barrel", @"Бургас 63 Barrel", @"", @"", @"", @"50 мл", 3.50m, @""),
        new(@"Bar", @"rakia", @"Бранко Юлева сръбска", @"Branko Yuleva Serbian Rakia", @"Сербская ракия Бранко Юлева", @"", @"", @"", @"50 мл", 6.30m, @""),
        new(@"Bar", @"cocktails", @"Аперо шприц", @"Apero Spritz", @"Аперо Шприц", @"", @"", @"", @"", 6.90m, @""),
        new(@"Bar", @"cocktails", @"Ягодово дайкири", @"Strawberry daiquiri", @"Клубничный дайкири", @"", @"", @"", @"", 6.90m, @""),
        new(@"Bar", @"cocktails", @"Маргарита", @"Margarita", @"Маргарита", @"", @"", @"", @"", 6.90m, @""),
        new(@"Bar", @"cocktails", @"Кралицата", @"The queen", @"Королева", @"", @"", @"", @"", 8.90m, @""),
        new(@"Bar", @"cocktails", @"Розовата пантера", @"The Pink Panther", @"Розовая Пантера", @"", @"", @"", @"", 7.70m, @""),
        new(@"Bar", @"cocktails", @"Страст", @"Passion", @"страсть", @"", @"", @"", @"", 7.90m, @""),
        new(@"Bar", @"cocktails", @"Азиатско муле", @"Asian mule", @"Азиатский мул", @"", @"", @"", @"", 7.70m, @""),
        new(@"Bar", @"cocktails", @"Кулър", @"Cooler", @"Кулер", @"", @"", @"", @"", 7.70m, @"")
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
