import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMenuDataFromCms,
  formatEuro,
  localizeStaticMenuPrices,
  priceTextToEuro,
} from "../../utils/menuUtils.js";

const fallbackData = {
  categories: [
    {
      id: "fallback",
      title: "Fallback",
      items: [{ name: "Old", price: "12,30 лв" }],
    },
  ],
};

test("formatEuro always returns guest-facing EUR text", () => {
  assert.equal(formatEuro(12), "€12.00");
  assert.equal(formatEuro("12.5"), "€12.50");
  assert.equal(formatEuro("bad"), "€0.00");
  assert.equal(formatEuro(-1), "€0.00");
});

test("static menu fallback prices are normalized to EUR", () => {
  assert.equal(priceTextToEuro("12,30 лв"), "€12.30");
  assert.equal(priceTextToEuro("no price"), "no price");
  assert.equal(localizeStaticMenuPrices(fallbackData).categories[0].items[0].price, "€12.30");
});

test("CMS menu builder hides inactive items and localizes category labels", () => {
  const result = buildMenuDataFromCms(
    [
      {
        id: 42,
        category: "salads",
        nameBg: "Салата",
        nameEn: "Salad",
        descriptionBg: "Домати",
        descriptionEn: "Tomatoes",
        weight: "300 гр",
        price: 10.4,
        isActive: true,
      },
      {
        category: "salads",
        nameBg: "Скрита",
        price: 4,
        isActive: false,
      },
    ],
    "en",
    fallbackData
  );

  assert.equal(result.categories.length, 1);
  assert.equal(result.categories[0].id, "salads");
  assert.equal(result.categories[0].title, "Salads");
  assert.equal(result.categories[0].items.length, 1);
  assert.equal(result.categories[0].items[0].id, 42);
  assert.equal(result.categories[0].items[0].category, "salads");
  assert.equal(result.categories[0].items[0].name, "Salad");
  assert.equal(result.categories[0].items[0].price, "€10.40");
  assert.equal(result.categories[0].items[0].priceValue, 10.4);
  assert.equal(result.categories[0].items[0].featured, false);
});

test("CMS menu builder falls back when no active CMS items exist", () => {
  const result = buildMenuDataFromCms([{ nameBg: "Hidden", isActive: false }], "bg", fallbackData);

  assert.equal(result.categories[0].id, "fallback");
  assert.equal(result.categories[0].items[0].price, "€12.30");
});

test("CMS menu builder localizes the new detailed drink categories", () => {
  const result = buildMenuDataFromCms(
    [
      {
        category: "draft-beer",
        department: "Bar",
        nameBg: "Шуменско",
        weight: "500 мл",
        price: 2.69,
        isActive: true,
      },
    ],
    "bg",
    fallbackData
  );

  assert.equal(result.categories[0].title, "Наливна бира");
  assert.equal(result.departments[0].title, "Напитки");
});

test("CMS menu builder uses Russian menu fields for Russian guests", () => {
  const result = buildMenuDataFromCms(
    [
      {
        category: "salads",
        nameBg: "Салата",
        nameEn: "Salad",
        nameRu: "Салат",
        descriptionBg: "Домати",
        descriptionEn: "Tomatoes",
        descriptionRu: "Помидоры",
        price: 8,
        isActive: true,
      },
    ],
    "ru",
    fallbackData
  );

  assert.equal(result.categories[0].items[0].name, "Салат");
  assert.equal(result.categories[0].items[0].description, "Помидоры");
});
