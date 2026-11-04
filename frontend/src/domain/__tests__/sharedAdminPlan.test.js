import test from "node:test";
import assert from "node:assert/strict";
import { getAdminSessionPlan, validAdminPlan, EMPTY_ADMIN_PLAN } from "../adminMap/adminSessionPlan.js";
import { canUseAdminTableSelection, getActiveLayoutTables, getAreaTablesCapacity } from "../reservations/adminPlanRules.js";
import { ADMIN_MAP_ZONES, ADMIN_MAP_WORLD, buildMapGeometry } from "../adminMap/mapConfig.js";
import { tenantCategoryLabel, tenantCategoryOptions } from "../adminMap/tenantMenuCategories.js";

const plan = {
  schemaVersion: 1, revision: "cofein-1",
  zones: [{ id: "cafe", name: "Кафе", isActive: true, presentation: "plain" }],
  tables: [{ id: "T01", area: "cafe", x: 20, y: 20, seats: 4, isActive: true }, { id: "F01", area: "cafe", x: 60, y: 60, seats: 6, isActive: true }],
  combinations: [],
};

test("authoritative Cofein tables, capacities and no-combination policy", () => {
  assert.equal(validAdminPlan(plan), true);
  const active = getActiveLayoutTables(plan.tables, "cafe");
  assert.equal(getAreaTablesCapacity("cafe", ["F01"], active), 6);
  assert.equal(canUseAdminTableSelection("cafe", ["T01"], { areaTables: active, requiredSeats: 4 }), true);
  assert.equal(canUseAdminTableSelection("cafe", ["T01", "F01"], { areaTables: active, combinations: [], requiredSeats: 8 }), false);
  assert.equal(canUseAdminTableSelection("cafe", ["1"], { areaTables: active }), false);
  assert.equal(canUseAdminTableSelection("cafe", ["T01"], { areaTables: active, requiredSeats: 6 }), false);
});

test("custom table IDs never inherit retired Casa IDs or inferred combinations", () => {
  const tables = [{ id: "30A", area: "custom", seats: 6, isActive: true }, { id: "31", area: "custom", seats: 4, isActive: false }];
  assert.deepEqual(getActiveLayoutTables(tables, "custom").map(table => table.id), ["30A"]);
  assert.equal(canUseAdminTableSelection("custom", ["30A", "31"], { areaTables: tables, combinations: [["30A", "31"]] }), false);
});

test("empty or failed tenant plans never populate Casa zones or tables", () => {
  assert.equal(getAdminSessionPlan({ loaded: false }, { isCasa: true }), EMPTY_ADMIN_PLAN);
  assert.equal(getAdminSessionPlan({ loaded: true, savedTables: [] }, { isCasa: false }), EMPTY_ADMIN_PLAN);
  const empty = { ...plan, zones: [], tables: [] };
  const result = getAdminSessionPlan({ loaded: true, savedPlan: empty, savedTables: [] }, { isCasa: true });
  assert.deepEqual(result.zones, []);
  assert.deepEqual(getActiveLayoutTables([], "indoor"), []);
});

test("confirmed legacy Casa map keeps original geometric presets", () => {
  const legacy = getAdminSessionPlan({ loaded: true, savedTables: [] }, { isCasa: true });
  const geometry = buildMapGeometry(legacy.zones);
  assert.deepEqual(geometry.world, ADMIN_MAP_WORLD);
  assert.deepEqual(geometry.zones.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })), ADMIN_MAP_ZONES);
  assert.ok(legacy.combinations.some(ids => ids.join(",") === "20,22"));
});

test("plain geometry and malformed metadata cannot borrow Casa assumptions", () => {
  const geometry = buildMapGeometry(plan.zones);
  assert.equal(geometry.zones[0].id, "cafe");
  assert.equal(geometry.zones[0].presentation, "plain");
  assert.equal(validAdminPlan({ ...plan, zones: [] }), false);
  assert.equal(validAdminPlan({ ...plan, combinations: [["T01", "1"]] }), false);
  assert.equal(validAdminPlan({ ...plan, zones: undefined }), false);
});

test("Cofein category labels are restaurant-specific source data", () => {
  assert.equal(tenantCategoryLabel("cofein", "salads"), "Салати");
  assert.equal(tenantCategoryLabel("casa-di-fratelli", "salads"), undefined);
  assert.equal(tenantCategoryLabel("unknown", "salads"), undefined);
  assert.equal(tenantCategoryOptions("cofein", "Kitchen").includes("pizzas"), true);
  assert.equal(tenantCategoryOptions("cofein", "Kitchen").includes("bbq"), false);
  assert.equal(tenantCategoryOptions("cofein", "Bar").includes("beer-cider"), true);
  assert.deepEqual(tenantCategoryOptions("unknown", "Kitchen"), []);
});
