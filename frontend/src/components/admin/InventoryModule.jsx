/** Inventory and recipe feature UI; the server owns stock accounting and audit confirmation. */
import React from 'react';
import { API_BASE_URL } from '../../config/api';
import { readErrorMessage } from '../../admin/api/response.js';
import { Panel } from './AdminPrimitives.jsx';
import { formatEuroAmount } from '../../admin/presentation/formatters.js';
import { getMenuItemName, getDepartmentLabel } from '../../admin/presentation/menu.js';

export function InventoryModule({ adminLanguage, adminFetch, menuItems, loadMenuItems }) {
  const [section, setSection] = React.useState("items");
  const [items, setItems] = React.useState([]);
  const [movements, setMovements] = React.useState([]);
  const [audits, setAudits] = React.useState([]);
  const [recipeSummary, setRecipeSummary] = React.useState([]);
  const [selectedMenuItemId, setSelectedMenuItemId] = React.useState("");
  const [recipe, setRecipe] = React.useState(null);
  const [recipeLines, setRecipeLines] = React.useState([]);
  const [selectedAuditId, setSelectedAuditId] = React.useState("");
  const [selectedAudit, setSelectedAudit] = React.useState(null);
  const [auditLines, setAuditLines] = React.useState([]);
  const [auditSearch, setAuditSearch] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [movementTypeFilter, setMovementTypeFilter] = React.useState("all");
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");
  const [itemForm, setItemForm] = React.useState({
    name: "",
    category: "",
    unit: "g",
    currentQuantity: "",
    minimumQuantity: "",
    unitCost: "",
    isActive: true,
  });
  const [editingItemId, setEditingItemId] = React.useState(null);
  const [adjustment, setAdjustment] = React.useState({
    inventoryItemId: "",
    quantity: "",
    type: "Receipt",
    comment: "",
  });

  const tr = {
    bg: {
      title: "Склад",
      subtitle: "Ингредиенти, рецептури, движения, ревизии и себестойност. Само за Pro версия.",
      items: "Ингредиенти",
      recipes: "Рецептури",
      movements: "Движения",
      audits: "Ревизии",
      low: "Ниски остатъци",
      name: "Име",
      category: "Категория",
      unit: "Мярка",
      stock: "Остатък",
      min: "Мин.",
      cost: "Себестойност",
      active: "Активен",
      save: "Запази",
      add: "Добави",
      edit: "Редактирай",
      cancel: "Откажи",
      receipt: "Приход",
      adjustment: "Корекция",
      waste: "Брак",
      comment: "Коментар",
      menuItem: "Позиция от менюто",
      ingredient: "Ингредиент",
      quantity: "Количество",
      recipeCost: "Себестойност",
      salePrice: "Продажна цена",
      margin: "Марж",
      foodCost: "Food cost",
      createAudit: "Създай ревизия",
      confirmAudit: "Потвърди ревизия",
      actual: "Фактически остатък",
      expected: "Очакван",
      diff: "Разлика",
      seed: "Създай тестови рецепти",
      allCategories: "Всички категории",
      dashboard: "Контролен център",
      deactivate: "Деактивирай",
      activate: "Активирай",
      deleteRecipe: "Изтрий рецепта",
      exportAudit: "Експорт CSV",
      saveDraft: "Запази чернова",
      deleteAudit: "Изтрий ревизия",
      recipeReady: "Готова",
      recipeMissing: "Липсва",
      recipeAttention: "За преглед",
    },
    en: {
      title: "Inventory",
      subtitle: "Ingredients, recipes, movements, audits, and food cost. Pro only.",
      items: "Ingredients",
      recipes: "Recipes",
      movements: "Movements",
      audits: "Audits",
      low: "Low stock",
      name: "Name",
      category: "Category",
      unit: "Unit",
      stock: "Stock",
      min: "Min.",
      cost: "Unit cost",
      active: "Active",
      save: "Save",
      add: "Add",
      edit: "Edit",
      cancel: "Cancel",
      receipt: "Receipt",
      adjustment: "Adjustment",
      waste: "Waste",
      comment: "Comment",
      menuItem: "Menu item",
      ingredient: "Ingredient",
      quantity: "Quantity",
      recipeCost: "Recipe cost",
      salePrice: "Sale price",
      margin: "Margin",
      foodCost: "Food cost",
      createAudit: "Create audit",
      confirmAudit: "Confirm audit",
      actual: "Actual stock",
      expected: "Expected",
      diff: "Difference",
      seed: "Create test recipes",
      allCategories: "All categories",
      dashboard: "Control center",
      deactivate: "Deactivate",
      activate: "Activate",
      deleteRecipe: "Delete recipe",
      exportAudit: "Export CSV",
      saveDraft: "Save draft",
      deleteAudit: "Delete audit",
      recipeReady: "Ready",
      recipeMissing: "Missing",
      recipeAttention: "Needs review",
    },
  }[adminLanguage] || {
    title: "Склад",
    subtitle: "Ингредиенты, рецептуры, движения склада, ревизии и себестоимость блюд.",
    ingredients: "Ингредиенты",
    recipes: "Рецептуры",
    movements: "Движения",
    audits: "Ревизии",
    low: "Низкие остатки",
    active: "Активен",
    inactive: "Неактивен",
    add: "Добавить",
    save: "Сохранить",
    delete: "Удалить",
    receipt: "Приход",
    adjustment: "Корректировка",
    waste: "Списание",
    comment: "Комментарий",
    menuItem: "Позиция меню",
    ingredient: "Ингредиент",
    quantity: "Количество",
    recipeCost: "Себестоимость",
    salePrice: "Цена продажи",
    margin: "Маржа",
    foodCost: "Food cost",
    createAudit: "Создать ревизию",
    confirmAudit: "Подтвердить ревизию",
    actual: "Фактический остаток",
    expected: "Ожидаемый",
    diff: "Разница",
    seed: "Создать тестовые рецептуры",
    allCategories: "Все категории",
    dashboard: "Центр контроля",
    deactivate: "Деактивировать",
    activate: "Активировать",
    deleteRecipe: "Удалить рецептуру",
    exportAudit: "Экспорт CSV",
    saveDraft: "Сохранить черновик",
    deleteAudit: "Удалить ревизию",
    recipeReady: "Готово",
    recipeMissing: "Нет рецептуры",
    recipeAttention: "Нужно проверить",
  };

  const loadItemsViaAdminFetch = React.useCallback(async () => {
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/items`);
    setItems(response.ok ? await response.json() : []);
  }, [adminFetch]);

  const loadMovements = React.useCallback(async () => {
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/movements`);
    setMovements(response.ok ? await response.json() : []);
  }, [adminFetch]);

  const loadAudits = React.useCallback(async () => {
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits`);
    setAudits(response.ok ? await response.json() : []);
  }, [adminFetch]);

  const loadRecipeSummary = React.useCallback(async () => {
    const response = await adminFetch(`${API_BASE_URL}/api/recipes/summary`);
    setRecipeSummary(response.ok ? await response.json() : []);
  }, [adminFetch]);

  React.useEffect(() => {
    loadItemsViaAdminFetch();
    loadMovements();
    loadAudits();
    loadRecipeSummary();
    loadMenuItems?.();
  }, [loadAudits, loadItemsViaAdminFetch, loadMenuItems, loadMovements, loadRecipeSummary]);

  React.useEffect(() => {
    async function loadRecipe() {
      if (!selectedMenuItemId) {
        setRecipe(null);
        setRecipeLines([]);
        return;
      }
      const response = await adminFetch(`${API_BASE_URL}/api/recipes/menu-item/${selectedMenuItemId}`);
      if (!response.ok) return;
      const data = await response.json();
      setRecipe(data);
      setRecipeLines((data.lines || data.Lines || []).map((line) => ({
        inventoryItemId: String(line.inventoryItemId || line.InventoryItemId),
        quantity: String(line.quantity || line.Quantity || ""),
        notes: line.notes || line.Notes || "",
      })));
    }
    loadRecipe();
  }, [adminFetch, selectedMenuItemId]);

  async function saveItem(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    const payload = {
      ...itemForm,
      currentQuantity: Number(itemForm.currentQuantity || 0),
      minimumQuantity: Number(itemForm.minimumQuantity || 0),
      unitCost: Number(itemForm.unitCost || 0),
    };
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/items${editingItemId ? `/${editingItemId}` : ""}`, {
      method: editingItemId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Inventory item failed."));
      return;
    }
    setItemForm({ name: "", category: "", unit: "g", currentQuantity: "", minimumQuantity: "", unitCost: "", isActive: true });
    setEditingItemId(null);
    setNotice(adminLanguage === "bg" ? "Ингредиентът е запазен." : "Ingredient saved.");
    await loadItemsViaAdminFetch();
  }

  async function deleteItem(id) {
    setNotice("");
    setError("");
    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да деактивираме ли ингредиента? Ако няма история, ще бъде изтрит напълно."
        : "Deactivate this ingredient? If it has no history, it will be deleted fully."
    );
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/inventory/items/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Ingredient delete failed."));
      return;
    }
    const data = await response.json().catch(() => null);
    setNotice(data?.mode === "Deleted" || data?.Mode === "Deleted"
      ? (adminLanguage === "bg" ? "Ингредиентът е изтрит." : "Ingredient deleted.")
      : (adminLanguage === "bg" ? "Ингредиентът е деактивиран." : "Ingredient deactivated."));
    await Promise.all([loadItemsViaAdminFetch(), loadRecipeSummary()]);
  }

  async function activateItem(id) {
    setNotice("");
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/items/${id}/activate`, { method: "POST" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Ingredient activation failed."));
      return;
    }
    setNotice(adminLanguage === "bg" ? "Ингредиентът е активиран." : "Ingredient activated.");
    await Promise.all([loadItemsViaAdminFetch(), loadRecipeSummary()]);
  }

  async function saveAdjustment(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/adjustment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventoryItemId: Number(adjustment.inventoryItemId),
        quantity: Number(adjustment.quantity || 0),
        type: adjustment.type,
        comment: adjustment.comment,
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Adjustment failed."));
      return;
    }
    setAdjustment({ inventoryItemId: "", quantity: "", type: "Receipt", comment: "" });
    setNotice(adminLanguage === "bg" ? "Движението е записано." : "Movement saved.");
    await Promise.all([loadItemsViaAdminFetch(), loadMovements()]);
  }

  async function saveRecipe(event) {
    event.preventDefault();
    if (!selectedMenuItemId) return;
    const response = await adminFetch(`${API_BASE_URL}/api/recipes/menu-item/${selectedMenuItemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: recipeLines
          .filter((line) => line.inventoryItemId && Number(line.quantity) > 0)
          .map((line) => ({
            inventoryItemId: Number(line.inventoryItemId),
            quantity: Number(line.quantity),
            notes: line.notes,
          })),
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Recipe failed."));
      return;
    }
    const data = await response.json();
    setRecipe(data);
    setNotice(adminLanguage === "bg" ? "Рецептата е запазена." : "Recipe saved.");
    await loadRecipeSummary();
  }

  async function deleteRecipe() {
    if (!selectedMenuItemId) return;
    const confirmed = window.confirm(adminLanguage === "bg" ? "Да изтрием ли рецептурата за тази позиция?" : "Delete this menu item's recipe?");
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/recipes/menu-item/${selectedMenuItemId}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Recipe delete failed."));
      return;
    }
    setRecipe(null);
    setRecipeLines([]);
    setNotice(adminLanguage === "bg" ? "Рецептата е изтрита." : "Recipe deleted.");
    await loadRecipeSummary();
  }

  async function createAudit() {
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${tr.audits} ${new Date().toLocaleDateString()}` }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit failed."));
      return;
    }
    setNotice(adminLanguage === "bg" ? "Ревизията е създадена." : "Audit created.");
    const data = await response.json().catch(() => null);
    if (data?.id || data?.Id) {
      setSelectedAuditId(String(data.id || data.Id));
      setSelectedAudit(data);
      setAuditLines((data.lines || data.Lines || []).map(mapAuditLine));
    }
    await loadAudits();
  }

  async function loadAuditDetails(id) {
    setSelectedAuditId(String(id || ""));
    if (!id) {
      setSelectedAudit(null);
      setAuditLines([]);
      return;
    }
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${id}`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit load failed."));
      return;
    }
    const data = await response.json();
    setSelectedAudit(data);
    setAuditLines((data.lines || data.Lines || []).map(mapAuditLine));
  }

  async function saveAuditDraft() {
    if (!selectedAuditId) return;
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${selectedAuditId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: auditLines.map((line) => ({
          inventoryItemId: Number(line.inventoryItemId),
          actualQuantity: Number(line.actualQuantity || 0),
          comment: line.comment,
        })),
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit save failed."));
      return;
    }
    const data = await response.json();
    setSelectedAudit(data);
    setAuditLines((data.lines || data.Lines || []).map(mapAuditLine));
    setNotice(adminLanguage === "bg" ? "Ревизията е запазена като чернова." : "Audit draft saved.");
    await loadAudits();
  }

  async function confirmAudit() {
    if (!selectedAuditId) return;
    const confirmed = window.confirm(adminLanguage === "bg" ? "Да потвърдим ли ревизията и да коригираме склада?" : "Confirm audit and update stock?");
    if (!confirmed) return;
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${selectedAuditId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: auditLines.map((line) => ({
          inventoryItemId: Number(line.inventoryItemId),
          actualQuantity: Number(line.actualQuantity || 0),
          comment: line.comment,
        })),
      }),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit confirm failed."));
      return;
    }
    const data = await response.json();
    setSelectedAudit(data);
    setAuditLines((data.lines || data.Lines || []).map(mapAuditLine));
    setNotice(adminLanguage === "bg" ? "Ревизията е потвърдена и складът е коригиран." : "Audit confirmed and stock corrected.");
    await Promise.all([loadAudits(), loadItemsViaAdminFetch(), loadMovements()]);
  }

  async function deleteAudit() {
    if (!selectedAuditId) return;
    const confirmed = window.confirm(adminLanguage === "bg" ? "Да изтрием ли тази чернова ревизия?" : "Delete this draft audit?");
    if (!confirmed) return;
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${selectedAuditId}`, { method: "DELETE" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit delete failed."));
      return;
    }
    setSelectedAuditId("");
    setSelectedAudit(null);
    setAuditLines([]);
    setNotice(adminLanguage === "bg" ? "Ревизията е изтрита." : "Audit deleted.");
    await loadAudits();
  }

  async function exportAudit() {
    if (!selectedAuditId) return;
    const response = await adminFetch(`${API_BASE_URL}/api/inventory/audits/${selectedAuditId}/export`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Audit export failed."));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-audit-${selectedAuditId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function seedTestRecipes() {
    setNotice("");
    setError("");
    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да се създадат ли тестови ингредиенти и рецептури? Съществуващите рецепти няма да се презапишат."
        : "Create test ingredients and recipes? Existing recipes will not be overwritten."
    );
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/inventory/seed-test-recipes`, { method: "POST" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Recipe seed failed."));
      return;
    }
    const result = await response.json();
    setNotice(
      adminLanguage === "bg"
        ? `Готово: ${result.createdIngredients ?? result.CreatedIngredients ?? 0} ингредиента, ${result.createdRecipes ?? result.CreatedRecipes ?? 0} рецепти.`
        : `Done: ${result.createdIngredients ?? result.CreatedIngredients ?? 0} ingredients, ${result.createdRecipes ?? result.CreatedRecipes ?? 0} recipes.`
    );
    await Promise.all([loadItemsViaAdminFetch(), loadMenuItems?.()]);
    await loadRecipeSummary();
    if (selectedMenuItemId) {
      const recipeResponse = await adminFetch(`${API_BASE_URL}/api/recipes/menu-item/${selectedMenuItemId}`);
      if (recipeResponse.ok) setRecipe(await recipeResponse.json());
    }
  }

  const itemCategories = Array.from(new Set(items.map((item) => item.category || item.Category).filter(Boolean))).sort();
  const visibleItems = items.filter((item) => {
    const text = `${item.name || item.Name} ${item.category || item.Category}`.toLowerCase();
    const matchesSearch = !search.trim() || text.includes(search.trim().toLowerCase());
    const matchesCategory = categoryFilter === "all" || (item.category || item.Category) === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const lowStockItems = items.filter((item) => item.isLowStock || item.IsLowStock);
  const visibleMovements = movements.filter((movement) => movementTypeFilter === "all" || (movement.type || movement.Type) === movementTypeFilter);
  const selectedRecipeMenuItem = menuItems.find((item) => String(item.id || item.Id) === String(selectedMenuItemId));
  const missingRecipeCount = recipeSummary.filter((item) => (item.status || item.Status) !== "Ready").length;
  const inventoryValue = items.reduce((sum, item) => sum + Number(item.currentQuantity ?? item.CurrentQuantity ?? 0) * Number(item.unitCost ?? item.UnitCost ?? 0), 0);
  const filteredAuditLines = auditLines.filter((line) => {
    const term = auditSearch.trim().toLowerCase();
    return !term || `${line.ingredient} ${line.category}`.toLowerCase().includes(term);
  });

  function mapAuditLine(line) {
    return {
      id: line.id || line.Id,
      inventoryItemId: line.inventoryItemId || line.InventoryItemId,
      ingredient: line.ingredient || line.Ingredient || "",
      category: line.category || line.Category || "",
      unit: line.unit || line.Unit || "",
      expectedQuantity: line.expectedQuantity ?? line.ExpectedQuantity ?? 0,
      actualQuantity: line.actualQuantity ?? line.ActualQuantity ?? 0,
      differenceQuantity: line.differenceQuantity ?? line.DifferenceQuantity ?? 0,
      comment: line.comment || line.Comment || "",
    };
  }

  return (
    <Panel title={tr.title} subtitle={tr.subtitle}>
      <div className="space-y-5">
        {(notice || error) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-300/30 bg-red-500/15 text-red-100" : "border-emerald-300/25 bg-emerald-500/12 text-emerald-100"}`}>
            {error || notice}
          </div>
        )}

        <div className="flex flex-wrap gap-2 rounded-[26px] border border-white/10 bg-black/20 p-2">
          {[
            ["items", tr.items],
            ["recipes", tr.recipes],
            ["movements", tr.movements],
            ["audits", tr.audits],
            ["low", `${tr.low} (${lowStockItems.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${section === key ? "luxury-button" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            [tr.dashboard, formatEuroAmount(inventoryValue), adminLanguage === "bg" ? "стойност на наличностите" : "stock value"],
            [tr.low, lowStockItems.length, adminLanguage === "bg" ? "артикула под минимум" : "items below minimum"],
            [tr.recipes, recipeSummary.length - missingRecipeCount, adminLanguage === "bg" ? "готови рецептури" : "ready recipes"],
            [tr.recipeAttention, missingRecipeCount, adminLanguage === "bg" ? "липсващи или за преглед" : "missing or needs review"],
          ].map(([label, value, hint]) => (
            <div key={label} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f2d39a]/70">{label}</div>
              <div className="mt-3 text-2xl font-semibold text-[#fff4df]">{value}</div>
              <div className="mt-1 text-xs text-white/40">{hint}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-4">
          <div>
            <div className="text-sm font-semibold text-[#fff4df]">{adminLanguage === "bg" ? "Тестови рецептури" : "Test recipes"}</div>
            <div className="mt-1 text-xs text-white/45">
              {adminLanguage === "bg"
                ? "Запълва склада с примерни ингредиенти и рецепти за текущото меню, без да презаписва съществуващи рецепти."
                : "Fills inventory with sample ingredients and recipes for the current menu without overwriting existing recipes."}
            </div>
          </div>
          <button type="button" onClick={seedTestRecipes} className="luxury-button rounded-2xl px-4 py-3 text-sm font-semibold">
            {tr.seed}
          </button>
        </div>

        {section === "items" && (
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <form onSubmit={saveItem} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="section-kicker">{editingItemId ? tr.edit : tr.add}</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input name="inventoryItem.name" required placeholder={tr.name} value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <input name="inventoryItem.category" required placeholder={tr.category} value={itemForm.category} onChange={(e) => setItemForm((p) => ({ ...p, category: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <select name="inventoryItem.unit" value={itemForm.unit} onChange={(e) => setItemForm((p) => ({ ...p, unit: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300">
                  {["g", "kg", "ml", "l", "pcs"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
                <input name="inventoryItem.currentQuantity" type="number" step="0.001" placeholder={tr.stock} value={itemForm.currentQuantity} onChange={(e) => setItemForm((p) => ({ ...p, currentQuantity: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <input name="inventoryItem.minimumQuantity" type="number" step="0.001" placeholder={tr.min} value={itemForm.minimumQuantity} onChange={(e) => setItemForm((p) => ({ ...p, minimumQuantity: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <input name="inventoryItem.unitCost" type="number" step="0.0001" placeholder={tr.cost} value={itemForm.unitCost} onChange={(e) => setItemForm((p) => ({ ...p, unitCost: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
              </div>
              <label className="mt-4 flex items-center gap-3 text-sm text-white/70">
                <input name="inventoryItem.isActive" type="checkbox" checked={itemForm.isActive} onChange={(e) => setItemForm((p) => ({ ...p, isActive: e.target.checked }))} />
                {tr.active}
              </label>
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="luxury-button rounded-2xl px-5 py-3 font-semibold">{tr.save}</button>
                {editingItemId && (
                  <button type="button" onClick={() => { setEditingItemId(null); setItemForm({ name: "", category: "", unit: "g", currentQuantity: "", minimumQuantity: "", unitCost: "", isActive: true }); }} className="ghost-button rounded-2xl px-5 py-3 font-semibold">{tr.cancel}</button>
                )}
              </div>
            </form>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <input name="inventorySearch" placeholder={adminLanguage === "bg" ? "Търси ингредиент..." : "Search ingredient..."} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                <select name="inventoryCategoryFilter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300">
                  <option value="all">{tr.allCategories}</option>
                  {itemCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {visibleItems.map((item) => (
                  <div key={item.id || item.Id} className={`rounded-2xl border p-3 ${item.isLowStock || item.IsLowStock ? "border-red-300/30 bg-red-500/12" : "border-white/10 bg-black/20"} ${item.isActive === false || item.IsActive === false ? "opacity-55" : ""}`}>
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div>
                      <div className="font-semibold text-[#fff4df]">{item.name || item.Name}</div>
                      <div className="mt-1 text-xs text-white/45">{item.category || item.Category} · {item.isActive === false || item.IsActive === false ? (adminLanguage === "bg" ? "неактивен" : "inactive") : tr.active}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-[#f2d39a]">{item.currentQuantity ?? item.CurrentQuantity} {item.unit || item.Unit}</div>
                      <div className="text-white/45">{formatEuroAmount(item.unitCost ?? item.UnitCost ?? 0)} / {item.unit || item.Unit}</div>
                    </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setEditingItemId(item.id || item.Id); setItemForm({ name: item.name || item.Name || "", category: item.category || item.Category || "", unit: item.unit || item.Unit || "g", currentQuantity: item.currentQuantity ?? item.CurrentQuantity ?? 0, minimumQuantity: item.minimumQuantity ?? item.MinimumQuantity ?? 0, unitCost: item.unitCost ?? item.UnitCost ?? 0, isActive: item.isActive ?? item.IsActive ?? true }); }} className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold">
                        {tr.edit}
                      </button>
                      {item.isActive === false || item.IsActive === false ? (
                        <button type="button" onClick={() => activateItem(item.id || item.Id)} className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100">
                          {tr.activate}
                        </button>
                      ) : (
                        <button type="button" onClick={() => deleteItem(item.id || item.Id)} className="rounded-xl border border-red-300/25 bg-red-500/12 px-3 py-2 text-xs font-semibold text-red-100">
                          {tr.deactivate}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === "recipes" && (
          <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="section-kicker">{adminLanguage === "bg" ? "Статус рецептури" : "Recipe status"}</div>
              <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto pr-1">
                {recipeSummary.map((row) => {
                  const status = row.status || row.Status;
                  const id = row.id || row.Id;
                  const label = status === "Ready" ? tr.recipeReady : status === "NeedsAttention" ? tr.recipeAttention : tr.recipeMissing;
                  const style = status === "Ready"
                    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                    : status === "NeedsAttention"
                      ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                      : "border-red-300/25 bg-red-500/12 text-red-100";
                  return (
                    <button key={id} type="button" onClick={() => { setSelectedMenuItemId(String(id)); }} className={`w-full rounded-2xl border p-3 text-left transition hover:border-[#d8b676]/45 ${String(selectedMenuItemId) === String(id) ? "border-[#d8b676]/70 bg-[#d8b676]/10" : "border-white/10 bg-black/20"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#fff4df]">{getMenuItemName(row, adminLanguage)}</div>
                          <div className="mt-1 text-xs text-white/40">{getDepartmentLabel(row.department || row.Department, adminLanguage)} · {row.lines ?? row.Lines ?? 0} {adminLanguage === "bg" ? "реда" : "lines"}</div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style}`}>{label}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <span className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55">{formatEuroAmount(row.cost ?? row.Cost ?? 0)}</span>
                        <span className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55">{row.foodCostPercent ?? row.FoodCostPercent ?? 0}%</span>
                        <span className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-white/55">{formatEuroAmount(row.margin ?? row.Margin ?? 0)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          <form onSubmit={saveRecipe} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
              <div>
                <label className="mb-2 block text-sm text-white/55">{tr.menuItem}</label>
                <select name="recipe.menuItemId" value={selectedMenuItemId} onChange={(e) => setSelectedMenuItemId(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300">
                  <option value="">—</option>
                  {menuItems.map((item) => (
                    <option key={item.id || item.Id} value={item.id || item.Id}>{getMenuItemName(item, adminLanguage)} · {getDepartmentLabel(item.department || item.Department, adminLanguage)}</option>
                  ))}
                </select>
              </div>
              {recipe && [
                [tr.recipeCost, recipe.cost ?? recipe.Cost ?? 0],
                [tr.salePrice, recipe.salePrice ?? recipe.SalePrice ?? selectedRecipeMenuItem?.price ?? 0],
                [tr.margin, recipe.margin ?? recipe.Margin ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">{label}</div>
                  <div className="mt-1 font-semibold text-[#f2d39a]">{formatEuroAmount(value)}</div>
                </div>
              ))}
              {recipe && (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/35">{tr.foodCost}</div>
                  <div className="mt-1 font-semibold text-[#f2d39a]">{recipe.foodCostPercent ?? recipe.FoodCostPercent ?? 0}%</div>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-3">
              {recipeLines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_140px_1fr_auto]">
                  <select name={`recipeLines[${index}].inventoryItemId`} value={line.inventoryItemId} onChange={(e) => setRecipeLines((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, inventoryItemId: e.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none">
                    <option value="">{tr.ingredient}</option>
                    {items.map((item) => <option key={item.id || item.Id} value={item.id || item.Id}>{item.name || item.Name} ({item.unit || item.Unit})</option>)}
                  </select>
                  <input name={`recipeLines[${index}].quantity`} type="number" step="0.001" placeholder={tr.quantity} value={line.quantity} onChange={(e) => setRecipeLines((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: e.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none" />
                  <input name={`recipeLines[${index}].notes`} placeholder={tr.comment} value={line.notes} onChange={(e) => setRecipeLines((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, notes: e.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none" />
                  <button type="button" onClick={() => setRecipeLines((prev) => prev.filter((_, rowIndex) => rowIndex !== index))} className="rounded-xl border border-red-300/25 bg-red-500/12 px-3 py-2 text-red-100">×</button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setRecipeLines((prev) => [...prev, { inventoryItemId: "", quantity: "", notes: "" }])} className="ghost-button rounded-2xl px-5 py-3 font-semibold">{tr.add}</button>
              <button disabled={!selectedMenuItemId} className="luxury-button rounded-2xl px-5 py-3 font-semibold disabled:opacity-40">{tr.save}</button>
              <button type="button" disabled={!selectedMenuItemId || recipeLines.length === 0} onClick={deleteRecipe} className="rounded-2xl border border-red-300/25 bg-red-500/12 px-5 py-3 font-semibold text-red-100 disabled:opacity-40">{tr.deleteRecipe}</button>
            </div>
          </form>
          </div>
        )}

        {section === "movements" && (
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <form onSubmit={saveAdjustment} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="section-kicker">{tr.movements}</div>
              <div className="mt-4 grid gap-3">
                <select name="inventoryAdjustment.inventoryItemId" required value={adjustment.inventoryItemId} onChange={(e) => setAdjustment((p) => ({ ...p, inventoryItemId: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <option value="">{tr.ingredient}</option>
                  {items.map((item) => <option key={item.id || item.Id} value={item.id || item.Id}>{item.name || item.Name}</option>)}
                </select>
                <select name="inventoryAdjustment.type" value={adjustment.type} onChange={(e) => setAdjustment((p) => ({ ...p, type: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <option value="Receipt">{tr.receipt}</option>
                  <option value="ManualAdjustment">{tr.adjustment}</option>
                  <option value="Waste">{tr.waste}</option>
                </select>
                <input name="inventoryAdjustment.quantity" required type="number" step="0.001" placeholder={tr.quantity} value={adjustment.quantity} onChange={(e) => setAdjustment((p) => ({ ...p, quantity: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3" />
                <textarea name="inventoryAdjustment.comment" placeholder={tr.comment} value={adjustment.comment} onChange={(e) => setAdjustment((p) => ({ ...p, comment: e.target.value }))} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3" />
              </div>
              <button className="luxury-button mt-4 rounded-2xl px-5 py-3 font-semibold">{tr.save}</button>
            </form>
            <div className="max-h-[660px] space-y-2 overflow-y-auto rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <select name="inventoryMovementType" value={movementTypeFilter} onChange={(e) => setMovementTypeFilter(e.target.value)} className="mb-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <option value="all">{adminLanguage === "bg" ? "Всички движения" : "All movements"}</option>
                {["Receipt", "SaleConsumption", "ManualAdjustment", "InventoryCorrection", "Waste"].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              {visibleMovements.map((movement) => (
                <div key={movement.id || movement.Id} className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="font-semibold text-[#fff4df]">{movement.ingredient || movement.Ingredient}</div>
                    <div className="mt-1 text-xs text-white/45">{movement.type || movement.Type} · {movement.comment || movement.Comment || "—"}</div>
                  </div>
                  <div className={`text-right font-semibold ${Number(movement.quantity ?? movement.Quantity) < 0 ? "text-red-200" : "text-emerald-200"}`}>
                    {movement.quantity ?? movement.Quantity} {movement.unit || movement.Unit || ""}
                    <div className="text-xs font-normal text-white/35">{new Date(movement.createdAtUtc || movement.CreatedAtUtc).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === "audits" && (
          <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <button type="button" onClick={createAudit} className="luxury-button w-full rounded-2xl px-5 py-3 font-semibold">{tr.createAudit}</button>
              <div className="mt-5 max-h-[680px] space-y-2 overflow-y-auto pr-1">
                {audits.map((audit) => {
                  const id = audit.id || audit.Id;
                  const status = audit.status || audit.Status;
                  return (
                    <button key={id} type="button" onClick={() => loadAuditDetails(id)} className={`w-full rounded-2xl border p-4 text-left transition ${String(selectedAuditId) === String(id) ? "border-[#d8b676]/70 bg-[#d8b676]/10" : "border-white/10 bg-black/20 hover:border-[#d8b676]/35"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-[#fff4df]">{audit.title || audit.Title}</div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status === "Confirmed" ? "border-emerald-300/25 bg-emerald-400/15 text-emerald-100" : "border-amber-300/25 bg-amber-400/12 text-amber-100"}`}>
                          {status}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-white/50">{audit.lines || audit.Lines} {adminLanguage === "bg" ? "реда" : "lines"} · Δ {audit.difference ?? audit.Difference ?? 0}</div>
                      <div className="mt-2 text-xs text-white/35">{new Date(audit.createdAtUtc || audit.CreatedAtUtc).toLocaleString()}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              {!selectedAudit ? (
                <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-white/45">
                  {adminLanguage === "bg" ? "Избери ревизия или създай нова." : "Select an audit or create a new one."}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="section-kicker">{selectedAudit.title || selectedAudit.Title}</div>
                      <div className="mt-2 text-sm text-white/45">
                        {selectedAudit.status || selectedAudit.Status} · {auditLines.length} {adminLanguage === "bg" ? "позиции" : "items"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={exportAudit} className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold">{tr.exportAudit}</button>
                      {(selectedAudit.status || selectedAudit.Status) !== "Confirmed" && (
                        <>
                          <button type="button" onClick={saveAuditDraft} className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold">{tr.saveDraft}</button>
                          <button type="button" onClick={confirmAudit} className="luxury-button rounded-xl px-3 py-2 text-xs font-semibold">{tr.confirmAudit}</button>
                          <button type="button" onClick={deleteAudit} className="rounded-xl border border-red-300/25 bg-red-500/12 px-3 py-2 text-xs font-semibold text-red-100">{tr.deleteAudit}</button>
                        </>
                      )}
                    </div>
                  </div>

                  <input name="inventoryAuditSearch" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder={adminLanguage === "bg" ? "Търси в ревизията..." : "Search audit..."} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />

                  <div className="max-h-[680px] overflow-y-auto pr-1">
                    <div className="grid min-w-[760px] gap-2">
                      <div className="grid grid-cols-[1.2fr_120px_120px_120px_1fr] gap-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                        <span>{tr.ingredient}</span>
                        <span>{tr.expected}</span>
                        <span>{tr.actual}</span>
                        <span>{tr.diff}</span>
                        <span>{tr.comment}</span>
                      </div>
                      {filteredAuditLines.map((line) => {
                        const difference = Number(line.actualQuantity || 0) - Number(line.expectedQuantity || 0);
                        return (
                          <div key={line.inventoryItemId} className={`grid grid-cols-[1.2fr_120px_120px_120px_1fr] items-center gap-2 rounded-2xl border p-3 ${difference === 0 ? "border-white/10 bg-black/20" : difference < 0 ? "border-red-300/25 bg-red-500/10" : "border-emerald-300/20 bg-emerald-400/10"}`}>
                            <div>
                              <div className="font-semibold text-[#fff4df]">{line.ingredient}</div>
                              <div className="mt-1 text-xs text-white/40">{line.category} · {line.unit}</div>
                            </div>
                            <div className="text-sm text-white/55">{line.expectedQuantity} {line.unit}</div>
                            <input name={`inventoryAudit[${line.inventoryItemId}].actualQuantity`} disabled={(selectedAudit.status || selectedAudit.Status) === "Confirmed"} type="number" step="0.001" value={line.actualQuantity} onChange={(event) => setAuditLines((prev) => prev.map((row) => row.inventoryItemId === line.inventoryItemId ? { ...row, actualQuantity: event.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-amber-300 disabled:opacity-60" />
                            <div className={`text-sm font-semibold ${difference < 0 ? "text-red-100" : difference > 0 ? "text-emerald-100" : "text-white/45"}`}>
                              {difference.toFixed(3)}
                            </div>
                            <input name={`inventoryAudit[${line.inventoryItemId}].comment`} disabled={(selectedAudit.status || selectedAudit.Status) === "Confirmed"} value={line.comment} onChange={(event) => setAuditLines((prev) => prev.map((row) => row.inventoryItemId === line.inventoryItemId ? { ...row, comment: event.target.value } : row))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-amber-300 disabled:opacity-60" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {section === "low" && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lowStockItems.map((item) => (
              <div key={item.id || item.Id} className="rounded-[24px] border border-red-300/30 bg-red-500/12 p-4">
                <div className="text-lg font-semibold text-red-50">{item.name || item.Name}</div>
                <div className="mt-1 text-sm text-red-100/70">{item.category || item.Category}</div>
                <div className="mt-4 text-2xl font-semibold text-red-100">{item.currentQuantity ?? item.CurrentQuantity} {item.unit || item.Unit}</div>
                <div className="text-sm text-red-100/55">{tr.min}: {item.minimumQuantity ?? item.MinimumQuantity} {item.unit || item.Unit}</div>
              </div>
            ))}
            {lowStockItems.length === 0 && (
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-6 text-emerald-100">
                {adminLanguage === "bg" ? "Няма ниски остатъци." : "No low stock items."}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

