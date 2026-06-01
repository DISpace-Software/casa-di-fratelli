const menuPageData = {
  bg: {
    heroBadge: "Luxury menu experience",
    heroTitle: "Меню     Casa di Fratelli",
    heroText:
      "Премиално меню с авторски ястия, италиански акценти и богата селекция от вкусове, поднесени в елегантна среда.",
    chefBadge: "Chef selection",
    chefTitle: "Подписани предложения",
    chefText:
      "Избрани ястия с авторски почерк и силен характер, вдъхновени от стила на Casa di Fratelli.",
    categories: [
      {
        id: "salads",
        title: "Салати",
        items: [
          {
            name: "Салата Dei Fratelli",
            weight: "300 гр",
            price: "19.60 лв",
            description:
              "Със запечено козе сирене, лоло росо, рукола, бейби спанак, круша, орех пекан и малинов хайвер",
          },
          {
            name: "Салата от бурата",
            weight: "360 гр",
            price: "20.56 лв",
            description:
              "Чери домати, кедрови ядки, рукола, песто и домашна фокача",
          },
          {
            name: "Салата Цезар с пиле",
            weight: "380 гр",
            price: "19.77 лв",
            description:
              "Айсберг, пилешко филе, чери домати, пармезан, билкови крутони и сос Цезар",
          },
          {
            name: "Салата със сотирани тигрови скариди",
            weight: "350 гр",
            price: "22.32 лв",
            description:
              "Микс зелени салати, жулиени зеленчуци и дресинг песто",
          },
          {
            name: "Салата Фермата",
            weight: "350 гр",
            price: "19.60 лв",
            description:
              "Панирано фермерско сирене, сезонни плодове, меден дресинг, сос от нар и бейби спанак",
          },
        ],
      },

      {
        id: "starters",
        title: "Нещо за начало",
        items: [
          {
            name: "Антипасти за двама",
            weight: "300 гр",
            price: "27.38 лв",
            description:
              "Плато от италиански колбаси, маслини каламата, сирена и изпечена фокача",
          },
          {
            name: "Трио разядки с домашен хляб",
            weight: "300 гр",
            price: "15.45 лв",
            description:
              "Тирокафтери, катък с чушка и млечна салата",
          },
          {
            name: "Патешки сърца с печурки",
            weight: "300 гр",
            price: "17.90 лв",
            description: "Топло предястие с наситен вкус",
          },
          {
            name: "Бейби калмари с манго сос",
            weight: "280 гр",
            price: "22.90 лв",
            description: "Крехки калмари с плодов акцент",
          },
          {
            name: "Скариди темпура",
            weight: "250 гр",
            price: "22.32 лв",
            description: "Поднесени с чипотле сос",
          },
          {
            name: "Телешки език с манатарка и скаморца",
            weight: "330 гр",
            price: "21.32 лв",
            description: "Богат вкус и кремообразен завършек",
          },
        ],
      },

      {
        id: "pasta-risotto",
        title: "Паста и ризото",
        items: [
          {
            name: "Ризото с диви гъби и трюфел",
            weight: "360 гр",
            price: "20.36 лв",
            description: "Кладница, манатарка и пармезан",
          },
          {
            name: "Ризото с рибай “Талиата”",
            weight: "380 гр",
            price: "29.14 лв",
            description:
              "Signature dish by Chef Yurukov — ризото с шафран, рибай, спанак и чипс от пармезан",
            featured: true,
          },
          {
            name: "Талиателе песто и скариди",
            weight: "400 гр",
            price: "22.32 лв",
            description:
              "Босилеково песто, зехтин, пармезан, шамфъстък и скариди",
          },
          {
            name: "Талиатели с пистачио и панчета",
            weight: "400 гр",
            price: "20.16 лв",
            description:
              "Signature dish by Chef Yurukov — домашна паста с крем от шамфъстък и панчета",
            featured: true,
          },
          {
            name: "Талиатели Болонезе",
            weight: "400 гр",
            price: "18.60 лв",
            description: "Домашна паста с телешка кайма и пармезан",
          },
          {
            name: "Талиателе Карбонара",
            weight: "400 гр",
            price: "20.36 лв",
            description:
              "Домашна паста, панчета и класически сос от жълтък и грана падано",
          },
        ],
      },

      {
        id: "mains",
        title: "Основни и рибни",
        items: [
          {
            name: "Нашите свински ребра с BBQ сос",
            weight: "450 гр",
            price: "28.95 лв",
            description:
              "Бавно готвени ребра, глазирани с BBQ сос и бейби картофки",
          },
          {
            name: "Шницел от сочни пилешки гърди",
            weight: "400 гр",
            price: "22.69 лв",
            description: "Поднесен с картофи соте и пармезан",
          },
          {
            name: "Телешки кюфтенца Black Angus",
            weight: "400 гр",
            price: "21.51 лв",
            description: "С опушен катък, домашна лютеница и фокача",
          },
          {
            name: "Рибай стек Black Angus",
            weight: "450 гр",
            price: "62.59 лв",
            description:
              "Зрял аржентински рибай с бейби картофки, аспержи и сос по избор",
          },
          {
            name: "Филе от лаврак",
            weight: "400 гр",
            price: "26.23 лв",
            description:
              "С картофено пюре, броколи и beurre blanc сос",
          },
          {
            name: "Филе от сьомга със задушени зеленчуци",
            weight: "350 гр",
            price: "27.40 лв",
            description:
              "Бейби моркови, аспержи, тиквички и сос холандез",
          },
        ],
      },

      {
        id: "pizza",
        title: "Пица",
        items: [
          {
            name: "Пица с телешко FRATELLI",
            weight: "400 гр",
            price: "24.27 лв",
            description: "Доматен сос, топено сирене, моцарела и червен лук",
          },
          {
            name: "Джорджио",
            weight: "500 гр",
            price: "24.27 лв",
            description:
              "Доматен сос, моцарела, кото, шамфъстък, песто, бурата, босилек и лимонови кори",
          },
          {
            name: "Пица бурата",
            weight: "550 гр",
            price: "22.90 лв",
            description:
              "Доматен сос, моцарела, пармезан, крудо, рукола, бурата, чери домати и песто",
          },
          {
            name: "Пеперони специална",
            weight: "500 гр",
            price: "22.32 лв",
            description:
              "Доматен сос, моцарела, борд Филаделфия, пеперони и панчета",
          },
          {
            name: "Прошуто крудо",
            weight: "450 гр",
            price: "22.32 лв",
            description:
              "Доматен сос, моцарела, крудо, рукола, чери домати и пармезан",
          },
          {
            name: "Куатро стаджони",
            weight: "450 гр",
            price: "22.12 лв",
            description:
              "Доматен сос, моцарела, прошуто кото, панчета, гъби, маслини таджаска и ементал",
          },
          {
            name: "Пица бианка",
            weight: "450 гр",
            price: "21.53 лв",
            description:
              "Сметана, моцарела, пушено пуешко филе, царевица и топено сирене",
          },
          {
            name: "Капричоза",
            weight: "500 гр",
            price: "20.36 лв",
            description: "Доматен сос, моцарела, маслини таджаска, артишок и кото",
          },
          {
            name: "Пеперони класик",
            weight: "450 гр",
            price: "19.58 лв",
            description: "Доматен сос, моцарела, пеперони и халапеньо",
          },
          {
            name: "Прошуто фунги",
            weight: "450 гр",
            price: "18.40 лв",
            description: "Доматен сос, моцарела, гъби, кото и риган",
          },
          {
            name: "Калцоне",
            weight: "500 гр",
            price: "18.40 лв",
            description:
              "Доматен сос, моцарела, гъби, кисели краставички, топено сирене и кото",
          },
          {
            name: "Салами",
            weight: "450 гр",
            price: "18.40 лв",
            description:
              "Доматен сос, моцарела, вентричина, топено сирене и червен лук",
          },
          {
            name: "Куатро формаджи",
            weight: "450 гр",
            price: "18.40 лв",
            description:
              "Сметана, моцарела, горгонзола, бри, пармезан и чери домати",
          },
          {
            name: "Поло",
            weight: "450 гр",
            price: "18.40 лв",
            description:
              "Доматен сос, моцарела, пилешко филе, кисели краставички, царевица и топено сирене",
          },
          {
            name: "Примавера",
            weight: "450 гр",
            price: "18.40 лв",
            description: "Доматен сос, моцарела, прошуто кото, гъби и капия",
          },
          {
            name: "Вегетариана",
            weight: "400 гр",
            price: "18.01 лв",
            description:
              "Доматен сос, моцарела, гъби, артишок, маслини таджаска и рукола",
          },
          {
            name: "Маргарита",
            weight: "400 гр",
            price: "14.90 лв",
            description: "Доматен сос, моцарела, риган и босилек",
          },
        ],
      },

      {
        id: "bread",
        title: "Домашен хляб",
        items: [
          {
            name: "Цял домашен хляб",
            weight: "450 гр",
            price: "11.54 лв",
            description: "Прясно изпечен домашен хляб",
          },
          {
            name: "Фокача на парче",
            weight: "150 гр",
            price: "5.67 лв",
            description: "Класическа фокача",
          },
          {
            name: "Домашна питка с Филаделфия",
            weight: "250 гр",
            price: "7.63 лв",
            description: "Мека питка с крема сирене",
          },
          {
            name: "Комбинирана пърленка със сирене и кашкавал",
            weight: "350 гр",
            price: "7.63 лв",
            description: "Богат вкус и аромат",
          },
        ],
      },

      {
        id: "desserts",
        title: "Десерти",
        items: [
          {
            name: "Пистачио чийзкейк",
            weight: "150 гр",
            price: "11.45 лв",
            description: "Кремообразен десерт с шамфъстък",
          },
          {
            name: "Тирамису",
            weight: "200 гр",
            price: "10.95 лв",
            description: "Класически италиански десерт",
          },
          {
            name: "Шоколадов мус by Chef Yurukov",
            weight: "170 гр",
            price: "12.01 лв",
            description: "Авторски шоколадов финал",
            featured: true,
          },
          {
            name: "Шоколадово суфле със сметанов сладолед",
            weight: "150 гр",
            price: "10.17 лв",
            description: "Топъл десерт с кремообразен център",
          },
        ],
      },
    ],
  },

  en: {
    heroBadge: "Luxury menu experience",
    heroTitle: "Casa di Fratelli Menu",
    heroText:
      "A premium menu with signature dishes, Italian accents, and a refined dining experience presented in an elegant atmosphere.",
    chefBadge: "Chef selection",
    chefTitle: "Signature highlights",
    chefText:
      "A curated selection of standout dishes with strong character and the signature touch of Casa di Fratelli.",
    categories: [
      {
        id: "salads",
        title: "Salads",
        items: [
          {
            name: "Dei Fratelli Salad",
            weight: "300 g",
            price: "19.60 lv",
            description:
              "Baked goat cheese, lollo rosso, arugula, baby spinach, pear, pecan, and raspberry caviar",
          },
          {
            name: "Burrata Salad",
            weight: "360 g",
            price: "20.56 lv",
            description:
              "Cherry tomatoes, pine nuts, arugula, pesto, and homemade focaccia",
          },
          {
            name: "Chicken Caesar Salad",
            weight: "380 g",
            price: "19.77 lv",
            description:
              "Iceberg lettuce, chicken fillet, cherry tomatoes, parmesan, croutons, and Caesar dressing",
          },
        ],
      },

      {
        id: "starters",
        title: "Starters",
        items: [
          {
            name: "Antipasti for Two",
            weight: "300 g",
            price: "27.38 lv",
            description:
              "Italian cold cuts, Kalamata olives, cheeses, and baked focaccia",
          },
          {
            name: "Tempura Shrimp",
            weight: "250 g",
            price: "22.32 lv",
            description: "Served with chipotle sauce",
          },
          {
            name: "Beef Tongue with Porcini and Scamorza",
            weight: "330 g",
            price: "21.32 lv",
            description: "Deep savory flavor with creamy finish",
          },
        ],
      },

      {
        id: "pasta-risotto",
        title: "Pasta & Risotto",
        items: [
          {
            name: "Wild Mushroom and Truffle Risotto",
            weight: "360 g",
            price: "20.36 lv",
            description: "Oyster mushrooms, porcini, and parmesan",
          },
          {
            name: "Ribeye Tagliata Risotto",
            weight: "380 g",
            price: "29.14 lv",
            description:
              "Signature dish by Chef Yurukov — saffron risotto, ribeye, spinach, and parmesan chips",
            featured: true,
          },
          {
            name: "Pesto Tagliatelle with Shrimp",
            weight: "400 g",
            price: "22.32 lv",
            description:
              "Basil pesto, olive oil, parmesan, pistachio, and shrimp",
          },
          {
            name: "Tagliatelle with Pistachio and Pancetta",
            weight: "400 g",
            price: "20.16 lv",
            description:
              "Signature dish by Chef Yurukov — homemade pasta with pistachio cream and pancetta",
            featured: true,
          },
        ],
      },

      {
        id: "mains",
        title: "Main Courses",
        items: [
          {
            name: "BBQ Pork Ribs",
            weight: "450 g",
            price: "28.95 lv",
            description: "Slow-cooked ribs glazed with BBQ sauce and baby potatoes",
          },
          {
            name: "Chicken Schnitzel",
            weight: "400 g",
            price: "22.69 lv",
            description: "Served with sautéed potatoes and parmesan",
          },
          {
            name: "Black Angus Ribeye Steak",
            weight: "450 g",
            price: "62.59 lv",
            description:
              "Aged Argentine ribeye with baby potatoes, asparagus, and sauce of choice",
          },
          {
            name: "Sea Bass Fillet",
            weight: "400 g",
            price: "26.23 lv",
            description:
              "With mashed potatoes, broccoli, and beurre blanc sauce",
          },
        ],
      },

      {
        id: "pizza",
        title: "Pizza",
        items: [
          {
            name: "Beef FRATELLI Pizza",
            weight: "400 g",
            price: "24.27 lv",
            description: "Tomato sauce, processed cheese, mozzarella, and red onion",
          },
          {
            name: "Giorgio",
            weight: "500 g",
            price: "24.27 lv",
            description:
              "Tomato sauce, mozzarella, cotto, pistachio, pesto, burrata, basil, and lemon zest",
          },
          {
            name: "Burrata Pizza",
            weight: "550 g",
            price: "22.90 lv",
            description:
              "Tomato sauce, mozzarella, parmesan, crudo, arugula, burrata, cherry tomatoes, and pesto",
          },
          {
            name: "Special Pepperoni Pizza",
            weight: "500 g",
            price: "22.32 lv",
            description:
              "Tomato sauce, mozzarella, Philadelphia crust, pepperoni, and pancetta",
          },
          {
            name: "Prosciutto Crudo",
            weight: "450 g",
            price: "22.32 lv",
            description:
              "Tomato sauce, mozzarella, crudo, arugula, cherry tomatoes, and parmesan",
          },
          {
            name: "Quattro Stagioni",
            weight: "450 g",
            price: "22.12 lv",
            description:
              "Tomato sauce, mozzarella, prosciutto cotto, pancetta, mushrooms, Taggiasca olives, and Emmental",
          },
          {
            name: "Bianca Pizza",
            weight: "450 g",
            price: "21.53 lv",
            description:
              "Cream, mozzarella, smoked turkey fillet, corn, and processed cheese",
          },
          {
            name: "Capricciosa",
            weight: "500 g",
            price: "20.36 lv",
            description: "Tomato sauce, mozzarella, Taggiasca olives, artichoke, and cotto",
          },
          {
            name: "Classic Pepperoni Pizza",
            weight: "450 g",
            price: "19.58 lv",
            description: "Tomato sauce, mozzarella, pepperoni, and jalapeno",
          },
          {
            name: "Prosciutto Funghi",
            weight: "450 g",
            price: "18.40 lv",
            description: "Tomato sauce, mozzarella, mushrooms, cotto, and oregano",
          },
          {
            name: "Calzone",
            weight: "500 g",
            price: "18.40 lv",
            description:
              "Tomato sauce, mozzarella, mushrooms, pickles, processed cheese, and cotto",
          },
          {
            name: "Salami Pizza",
            weight: "450 g",
            price: "18.40 lv",
            description:
              "Tomato sauce, mozzarella, ventricina, processed cheese, and red onion",
          },
          {
            name: "Quattro Formaggi",
            weight: "450 g",
            price: "18.40 lv",
            description:
              "Cream, mozzarella, gorgonzola, brie, parmesan, and cherry tomatoes",
          },
          {
            name: "Pollo Pizza",
            weight: "450 g",
            price: "18.40 lv",
            description:
              "Tomato sauce, mozzarella, chicken fillet, pickles, corn, and processed cheese",
          },
          {
            name: "Primavera Pizza",
            weight: "450 g",
            price: "18.40 lv",
            description: "Tomato sauce, mozzarella, prosciutto cotto, mushrooms, and kapia pepper",
          },
          {
            name: "Vegetariana",
            weight: "400 g",
            price: "18.01 lv",
            description:
              "Tomato sauce, mozzarella, mushrooms, artichoke, Taggiasca olives, and arugula",
          },
          {
            name: "Margherita",
            weight: "400 g",
            price: "14.90 lv",
            description: "Tomato sauce, mozzarella, oregano, and basil",
          },
        ],
      },

      {
        id: "bread",
        title: "Bread",
        items: [
          {
            name: "Whole Homemade Bread",
            weight: "450 g",
            price: "11.54 lv",
            description: "Freshly baked homemade bread",
          },
          {
            name: "Focaccia Slice",
            weight: "150 g",
            price: "5.67 lv",
            description: "Classic focaccia",
          },
        ],
      },

      {
        id: "desserts",
        title: "Desserts",
        items: [
          {
            name: "Pistachio Cheesecake",
            weight: "150 g",
            price: "11.45 lv",
            description: "Creamy pistachio dessert",
          },
          {
            name: "Tiramisu",
            weight: "200 g",
            price: "10.95 lv",
            description: "Classic Italian dessert",
          },
          {
            name: "Chocolate Mousse by Chef Yurukov",
            weight: "170 g",
            price: "12.01 lv",
            description: "Signature chocolate finish",
            featured: true,
          },
        ],
      },
    ],
  },
};

export default menuPageData;
