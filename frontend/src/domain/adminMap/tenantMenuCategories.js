// Labels transcribed from the supplied Cofein menus. No invented translations.
const cofeinCategories = {
  "salads": "Салати",
  "spreads": "Разядки",
  "spaghetti": "Спагети",
  "starters": "Предястия и Аламинути",
  "grill": "Скара",
  "flatbreads": "Пърленка",
  "club-sandwiches": "Клуб сандвичи",
  "burgers": "Бургер меню",
  "bruschetta": "Брускети",
  "savory-pancakes": "Палачинки /солени/",
  "mixed-platters": "Комбинирани плата",
  "breakfast": "Закуски и принцеси",
  "desserts": "Десерти",
  "pizzas": "Пици",
  "hot-drinks": "Топли напитки",
  "cold-drinks": "Студени освежителни напитки",
  "soft-drinks": "Безалкохолни напитки",
  "fresh-bar": "Fresh bar",
  "mocktails": "Безалкохолни коктейли",
  "wine-sangria": "Вино и сангрия",
  "energy-drinks": "Енергийни напитки",
  "protein-bar": "Протеинов бар",
  "beer-cider": "Бира и сайдер",
  "cocktails": "Алкохолни коктейли",
  "whisky": "Уиски",
  "irish-whisky": "Ирландско уиски",
  "bourbon": "Бърбън",
  "scotch-whisky": "Скоч уиски",
  "gin": "Джин",
  "vodka": "Водка",
  "liqueurs": "Ликьори",
  "mastika-digestifs": "Мастика и диджестиви",
  "shots": "Шотове — 25 ml",
  "cognac-brandy": "Коняк и бренди",
  "rum": "Ром",
  "tequila": "Текила",
  "rakia": "Ракии"
};

export function tenantCategoryLabel(tenantId, category) {
  return tenantId === "cofein" ? cofeinCategories[category] : undefined;
}

const cofeinDepartmentCategories = {
  "Kitchen": [
    "salads",
    "spreads",
    "spaghetti",
    "starters",
    "grill",
    "flatbreads",
    "club-sandwiches",
    "burgers",
    "bruschetta",
    "savory-pancakes",
    "mixed-platters",
    "breakfast",
    "desserts",
    "pizzas"
  ],
  "Bar": [
    "hot-drinks",
    "cold-drinks",
    "soft-drinks",
    "fresh-bar",
    "mocktails",
    "wine-sangria",
    "energy-drinks",
    "protein-bar",
    "beer-cider",
    "cocktails",
    "whisky",
    "irish-whisky",
    "bourbon",
    "scotch-whisky",
    "gin",
    "vodka",
    "liqueurs",
    "mastika-digestifs",
    "shots",
    "cognac-brandy",
    "rum",
    "tequila",
    "rakia"
  ]
};

export function tenantCategoryOptions(tenantId, department) {
  return tenantId === "cofein" ? cofeinDepartmentCategories[department] || [] : [];
}
