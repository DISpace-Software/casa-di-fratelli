const categoryLabels = {
  salads: { bg: "Салати", en: "Salads", ru: "Салаты" },
  starters: { bg: "Нещо за начало", en: "Starters", ru: "Закуски" },
  "pasta-risotto": { bg: "Паста и ризото", en: "Pasta & Risotto", ru: "Паста и ризотто" },
  mains: { bg: "Основни и рибни", en: "Mains & Fish", ru: "Основные блюда и рыба" },
  pizza: { bg: "Пица", en: "Pizza", ru: "Пицца" },
  bread: { bg: "Домашен хляб", en: "Homemade Bread", ru: "Домашний хлеб" },
  desserts: { bg: "Десерти", en: "Desserts", ru: "Десерты" },
  main: { bg: "Основни", en: "Main", ru: "Основные" },
  drinks: { bg: "Напитки", en: "Drinks", ru: "Напитки" },
};

const departmentLabels = {
  Kitchen: { bg: "Ястия", en: "Dishes", ru: "Блюда" },
  Bar: { bg: "Напитки", en: "Drinks", ru: "Напитки" },
};

export function formatEuro(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "€0.00";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function priceTextToEuro(priceText) {
  const match = String(priceText || "").match(/[\d]+(?:[.,]\d+)?/);

  if (!match) return priceText || "";

  return formatEuro(match[0].replace(",", "."));
}

export function localizeStaticMenuPrices(data) {
  return {
    ...data,
    categories: data.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => ({
        ...item,
        price: priceTextToEuro(item.price),
      })),
    })),
  };
}

function getValue(item, key) {
  return item?.[key] ?? item?.[key[0].toUpperCase() + key.slice(1)];
}

function slugify(value) {
  return String(value || "main")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "main";
}

function normalizeDepartment(value) {
  return String(value || "Kitchen").trim().toLowerCase() === "bar" ? "Bar" : "Kitchen";
}

export function buildMenuDataFromCms(items, language, fallbackData) {
  if (!Array.isArray(items) || items.length === 0) {
    return localizeStaticMenuPrices(fallbackData);
  }

  const activeItems = items.filter((item) => getValue(item, "isActive") !== false);
  const grouped = new Map();
  const groupedByDepartment = new Map();

  activeItems.forEach((item) => {
    const rawCategory = getValue(item, "category") || "Main";
    const categoryId = slugify(rawCategory);
    const department = normalizeDepartment(getValue(item, "department"));

    if (!grouped.has(categoryId)) {
      const labels = categoryLabels[categoryId] || categoryLabels[String(rawCategory).toLowerCase()];
      grouped.set(categoryId, {
        id: categoryId,
        department,
        title: labels?.[language] || rawCategory,
        items: [],
      });
    }

    grouped.get(categoryId).items.push({
      id: getValue(item, "id"),
      category: categoryId,
      department,
      kind: department === "Bar" ? "Drink" : "Dish",
      name:
        getValue(item, language === "en" ? "nameEn" : "nameBg") ||
        getValue(item, "nameBg") ||
        getValue(item, "nameEn") ||
        "",
      weight: getValue(item, "weight") || "",
      price: formatEuro(getValue(item, "price")),
      priceValue: Number(getValue(item, "price") || 0),
      imageUrl: getValue(item, "imageUrl") || "",
      description:
        getValue(item, language === "en" ? "descriptionEn" : "descriptionBg") ||
        getValue(item, "descriptionBg") ||
        getValue(item, "descriptionEn") ||
        "",
      featured: Boolean(getValue(item, "notifySubscribers")),
    });
  });

  const categories = Array.from(grouped.values()).filter((category) => category.items.length > 0);

  categories.forEach((category) => {
    if (!groupedByDepartment.has(category.department)) {
      groupedByDepartment.set(category.department, {
        id: category.department,
        title: departmentLabels[category.department]?.[language] || category.department,
        categories: [],
      });
    }

    groupedByDepartment.get(category.department).categories.push(category);
  });

  if (categories.length === 0) {
    return localizeStaticMenuPrices(fallbackData);
  }

  return {
    ...fallbackData,
    categories,
    departments: Array.from(groupedByDepartment.values()),
  };
}
