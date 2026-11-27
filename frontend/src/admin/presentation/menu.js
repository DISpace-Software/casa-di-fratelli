/** Tenant-aware menu labels and grouping for administration; no persistence or stock rules. */
import { getValue } from '../api/wireValue.js';
import { tenantCategoryLabel } from '../../domain/adminMap/tenantMenuCategories';
import { tenantContext } from '../../config/tenantRuntime';

export const categoryDisplayNames = {
  bg: {
    salads: "Салати",
    starters: "Нещо за начало",
    "pasta-risotto": "Паста и ризото",
    mains: "Основни и рибни",
    bbq: "BBQ Josper",
    pizza: "Пица",
    bread: "Домашен хляб",
    desserts: "Десерти",
    "hot-drinks": "Топли напитки",
    "drink-extras": "Добавки към напитки",
    "cold-drinks": "Студени напитки",
    "soft-drinks": "Безалкохолни",
    lemonades: "Лимонади",
    water: "Вода",
    "fresh-juice": "Фреш",
    "draft-beer": "Наливна бира",
    "bottled-beer-cider": "Бутилирана бира и сайдер",
    "scotch-whisky": "Шотландско уиски",
    "irish-whisky": "Ирландско уиски",
    "bourbon-tennessee": "Бърбън и тенеси",
    "cognac-brandy": "Коняк и бренди",
    "anise-drinks": "Анасонови напитки",
    rum: "Ром",
    vodka: "Водка",
    gin: "Джин",
    tequila: "Текила",
    "liqueurs-vermouth": "Ликьори и вермути",
    rakia: "Ракия",
    cocktails: "Коктейли",
    alcohol: "Алкохол",
    main: "Основни",
  },
  en: {
    salads: "Salads",
    starters: "Starters",
    "pasta-risotto": "Pasta & Risotto",
    mains: "Mains & Fish",
    bbq: "BBQ Josper",
    pizza: "Pizza",
    bread: "Bread",
    desserts: "Desserts",
    "hot-drinks": "Hot drinks",
    "drink-extras": "Drink extras",
    "cold-drinks": "Cold drinks",
    "soft-drinks": "Soft drinks",
    lemonades: "Lemonades",
    water: "Water",
    "fresh-juice": "Fresh juice",
    "draft-beer": "Draft beer",
    "bottled-beer-cider": "Bottled beer & cider",
    "scotch-whisky": "Scotch whisky",
    "irish-whisky": "Irish whisky",
    "bourbon-tennessee": "Bourbon & Tennessee",
    "cognac-brandy": "Cognac & brandy",
    "anise-drinks": "Anise drinks",
    rum: "Rum",
    vodka: "Vodka",
    gin: "Gin",
    tequila: "Tequila",
    "liqueurs-vermouth": "Liqueurs & vermouth",
    rakia: "Rakia",
    cocktails: "Cocktails",
    alcohol: "Alcohol",
    main: "Main",
  },
  ru: {
    salads: "Салаты",
    starters: "Закуски",
    "pasta-risotto": "Паста и ризотто",
    mains: "Основные блюда и рыба",
    bbq: "BBQ Josper",
    pizza: "Пицца",
    bread: "Домашний хлеб",
    desserts: "Десерты",
    "hot-drinks": "Горячие напитки",
    "drink-extras": "Добавки к напиткам",
    "cold-drinks": "Холодные напитки",
    "soft-drinks": "Безалкогольные",
    lemonades: "Лимонады",
    water: "Вода",
    "fresh-juice": "Фреш",
    "draft-beer": "Разливное пиво",
    "bottled-beer-cider": "Бутылочное пиво и сидр",
    "scotch-whisky": "Шотландский виски",
    "irish-whisky": "Ирландский виски",
    "bourbon-tennessee": "Бурбон и теннесси",
    "cognac-brandy": "Коньяк и бренди",
    "anise-drinks": "Анисовые напитки",
    rum: "Ром",
    vodka: "Водка",
    gin: "Джин",
    tequila: "Текила",
    "liqueurs-vermouth": "Ликёры и вермуты",
    rakia: "Ракия",
    cocktails: "Коктейли",
    alcohol: "Алкоголь",
    main: "Основные",
  },
};

export const menuDepartmentOptions = [
  { value: "Kitchen", labels: { bg: "Кухня", en: "Kitchen", ru: "Кухня" } },
  { value: "Bar", labels: { bg: "Напитки", en: "Drinks", ru: "Напитки" } },
];

export function normalizeDepartment(value) {
  return String(value || "Kitchen").trim().toLowerCase() === "bar" ? "Bar" : "Kitchen";
}

export function getDepartmentLabel(department, language) {
  const normalized = normalizeDepartment(department);
  return menuDepartmentOptions.find((option) => option.value === normalized)?.labels[language] || normalized;
}

export function getMenuItemKind(item) {
  return normalizeDepartment(getValue(item, "department")) === "Bar" ? "Drink" : "Dish";
}

export function normalizeCategory(value) {
  return String(value || "main").trim() || "main";
}

export function getCategoryLabel(category, language) {
  const normalized = normalizeCategory(category);
  return tenantCategoryLabel(tenantContext.tenantId, normalized) || categoryDisplayNames[language]?.[normalized] || normalized;
}

export function getMenuItemName(item, language = "bg") {
  const key = language === "en" ? "nameEn" : language === "ru" ? "nameRu" : "nameBg";
  return getValue(item, key) || getValue(item, "nameBg") || getValue(item, "nameEn") || "";
}

export function getMenuCategoryGroups(items, language = "bg") {
  const grouped = new Map();

  (items || [])
    .filter((item) => (getValue(item, "isActive") ?? true) === true)
    .forEach((item) => {
      const category = normalizeCategory(getValue(item, "category"));
      if (!grouped.has(category)) {
        grouped.set(category, {
          id: category,
          label: getCategoryLabel(category, language),
          items: [],
        });
      }

      grouped.get(category).items.push(item);
    });

  return Array.from(grouped.values()).sort((first, second) =>
    first.label.localeCompare(second.label, language === "ru" ? "ru" : language === "bg" ? "bg" : "en")
  );
}

