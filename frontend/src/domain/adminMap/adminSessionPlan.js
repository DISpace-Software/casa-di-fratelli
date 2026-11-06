import { gardenGroups, indoorGroups, openTerraceGroups } from "../reservations/tableConfig.js";

export const EMPTY_ADMIN_PLAN = Object.freeze({ schemaVersion: 1, revision: "", zones: [], tables: [], combinations: [], staffCombinationMode: "configured" });
const CASA_ZONES = [
  { id: "indoor", name: "Зала / Непушачи", presentation: "casa-indoor", isActive: true, names: { bg: "Зала / Непушачи", en: "Hall / Non-smoking", ru: "Зал / Некурящие" } },
  { id: "garden", name: "Покрита тераса", presentation: "casa-garden", isActive: true, names: { bg: "Покрита тераса", en: "Covered terrace", ru: "Крытая терраса" } },
  { id: "openTerrace", name: "Открита тераса", presentation: "casa-terrace", isActive: true, names: { bg: "Открита тераса", en: "Open terrace", ru: "Открытая терраса" } },
];

function legacyCasaCombinations() {
  const combinations = [];
  for (const group of gardenGroups) {
    for (let start = 0; start < group.length; start += 1) {
      for (let end = start + 2; end <= group.length; end += 1) combinations.push(group.slice(start, end));
    }
  }
  for (const group of [...indoorGroups, ...openTerraceGroups]) {
    for (let mask = 1; mask < 2 ** group.length; mask += 1) {
      const ids = group.filter((_, index) => mask & (1 << index));
      if (ids.length > 1) combinations.push(ids);
    }
  }
  return combinations;
}

// Legacy presets are allowed only for a confirmed old Casa API response. A
// failed request or a loaded empty plan must never invent another tenant's data.
export function getAdminSessionPlan(snapshot, { isCasa = false } = {}) {
  if (snapshot.savedPlan) return {
    ...snapshot.savedPlan,
    tables: snapshot.savedTables,
    staffCombinationMode: snapshot.savedPlan.staffCombinationMode || (isCasa ? "same-zone" : "configured"),
  };
  if (!snapshot.loaded || !isCasa) return EMPTY_ADMIN_PLAN;
  return { schemaVersion: 1, revision: "", zones: CASA_ZONES, tables: snapshot.savedTables, combinations: legacyCasaCombinations(), staffCombinationMode: "same-zone" };
}

export function validAdminPlan(plan) {
  if (plan?.schemaVersion !== 1 || typeof plan.revision !== "string" || !plan.revision ||
      !Array.isArray(plan.zones) || !Array.isArray(plan.tables) || !Array.isArray(plan.combinations)) return false;
  if (plan.staffCombinationMode !== undefined && !["same-zone", "configured"].includes(plan.staffCombinationMode)) return false;
  if (plan.zones.some(zone => !zone || typeof zone.id !== "string" || !zone.id || zone.id === "all" || typeof zone.name !== "string" || typeof zone.isActive !== "boolean")) return false;
  const zones = new Set(plan.zones.map(zone => zone.id));
  if (zones.size !== plan.zones.length) return false;
  const ids = new Set();
  for (const table of plan.tables) {
    if (!table || typeof table.id !== "string" || !table.id || ids.has(table.id) || !zones.has(table.area) ||
        !Number.isFinite(table.seats) || table.seats < 1 || !Number.isFinite(table.x) || !Number.isFinite(table.y)) return false;
    ids.add(table.id);
  }
  return plan.combinations.every(group => Array.isArray(group) && group.every(id => ids.has(id)));
}
