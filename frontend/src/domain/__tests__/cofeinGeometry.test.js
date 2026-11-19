import test from "node:test";
import assert from "node:assert/strict";
import { COFEIN_MAP_WORLD, COFEIN_MAP_VIEWS, getCofeinMapGeometry, getCofeinBookingViews, projectCofeinTable, unprojectCofeinPoint } from "../floorPlans/cofeinGeometry.js";

const close = (actual, expected, tolerance = .05) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be close to ${expected}`);

test("Cofein existing normalized tables return to photographed plan coordinates", () => {
  const samples = [
    [{ id: "T01", area: "exterior", x: 5, y: 5 }, [135, 425]],
    [{ id: "T12", area: "exterior", x: 5, y: 95 }, [135, 1495]],
    [{ id: "T19", area: "interior", x: 5, y: 5 }, [410, 434]],
    [{ id: "T24", area: "interior", x: 95, y: 77.87 }, [707.5, 997.5]],
    [{ id: "T25", area: "exterior", x: 70.66, y: 71.66 }, [357.5, 1217.5]],
    [{ id: "F03", area: "interior", x: 65.5, y: 95 }, [610, 1130]],
  ];
  for (const [table, expected] of samples) {
    const result = projectCofeinTable(table);
    close(result.x, expected[0]); close(result.y, expected[1]);
  }
});

test("layout changes from API move Cofein furniture instead of using static ID centres", () => {
  const initial = projectCofeinTable({ id: "T01", area: "exterior", x: 5, y: 5 });
  const moved = projectCofeinTable({ id: "T01", area: "exterior", x: 20, y: 15 });
  assert.ok(moved.x > initial.x && moved.y > initial.y);
  const again = unprojectCofeinPoint("exterior", moved);
  close(again.x, 20, 1e-9); close(again.y, 15, 1e-9);
});

test("projection round-trips all valid API bounds and clamps dragged points at those bounds", () => {
  for (const area of ["interior", "exterior"]) {
    for (const [x, y] of [[5, 5], [5, 95], [50, 50], [95, 95], [32.17, 75.22]]) {
      const result = unprojectCofeinPoint(area, projectCofeinTable({ id: "NEW", area, x, y }));
      close(result.x, x, 1e-9); close(result.y, y, 1e-9);
    }
    assert.deepEqual(unprojectCofeinPoint(area, { x: -10000, y: 10000 }), { x: 5, y: 95 });
  }
});

test("furniture metadata preserves the approved pair and diagonal grouping without adding tables", () => {
  const table = (id, area = "interior") => projectCofeinTable({ id, area, x: 50, y: 50 });
  assert.equal(table("T01", "exterior").kind, "paired");
  assert.equal(table("T13", "exterior").kind, "square");
  assert.equal(table("T19").rotation, 0);
  assert.equal(table("F01").rotation, 45);
  assert.equal(table("T24").kind, "u-booth");
  assert.equal(table("T24").rotation, 45);
  assert.equal(table("F04", "exterior").compact, true);
  assert.equal(table("T18", "exterior").openEnd, true);
});

test("unknown table IDs still use live geometry and wide metadata; invalid data fails closed", () => {
  assert.equal(projectCofeinTable({ id: "NEW", area: "exterior", x: 30, y: 30, wide: true }).kind, "booth");
  assert.equal(projectCofeinTable({ id: "NEW", area: "interior", x: 30, y: 30 }).kind, "square");
  assert.equal(projectCofeinTable({ id: "T01", area: "other", x: 30, y: 30 }), null);
  assert.equal(projectCofeinTable({ id: "T01", area: "exterior", x: NaN, y: 30 }), null);
  assert.equal(projectCofeinTable({ id: "T01", area: "exterior", x: "30", y: 30 }), null);
  assert.equal(unprojectCofeinPoint("other", { x: 1, y: 1 }), null);
  assert.equal(unprojectCofeinPoint("interior", { x: 1, y: Infinity }), null);
});

test("camera bounds preserve live zone data and four fragments remain on one world", () => {
  const zones = [{ id: "interior", name: "Live interior", isActive: true, names: { en: "Live" } }, { id: "exterior", name: "Live exterior", isActive: true }];
  const geometry = getCofeinMapGeometry(zones);
  assert.equal(geometry.world, COFEIN_MAP_WORLD);
  assert.equal(geometry.zones.length, 2);
  assert.equal(geometry.zones[0].name, "Live interior");
  assert.equal(geometry.zones[0].names.en, "Live");
  for (const id of ["exterior-upper", "exterior-lower", "interior-main", "interior-angled"]) {
    const view = COFEIN_MAP_VIEWS[id];
    assert.ok(view.x >= 0 && view.y >= 0);
    assert.ok(view.x + view.width <= COFEIN_MAP_WORLD.width);
    assert.ok(view.y + view.height <= COFEIN_MAP_WORLD.height);
  }
});

test("extra halls preserve approved Cofein coordinates and expose their own camera view", () => {
  const zones = [
    { id: "interior", name: "Вътре", isActive: true },
    { id: "exterior", name: "Вън", isActive: true },
    { id: "roof", name: "Покрив", names: { en: "Rooftop" }, isActive: true },
  ];
  const geometry = getCofeinMapGeometry(zones);
  assert.equal(geometry.zones.length, 3);
  assert.equal(geometry.views["zone:roof"].zoneId, "roof");
  assert.equal(geometry.views["zone:roof"].names.en, "Rooftop");
  assert.ok(geometry.detailViews.includes("zone:roof"));
  const known = { id: "T01", area: "exterior", x: 5, y: 5 };
  assert.deepEqual(projectCofeinTable(known, geometry), projectCofeinTable(known));
  const added = projectCofeinTable({ id: "NEW", area: "roof", x: 50, y: 50, seats: 12 }, geometry);
  assert.equal(added.kind, "square");
  assert.ok(added.x > COFEIN_MAP_WORLD.width);
  assert.ok(added.x < geometry.world.width && added.y < geometry.world.height);
});

test("annex table editing round-trips all API bounds and clamps out-of-range drags", () => {
  const geometry = getCofeinMapGeometry([{ id: "roof", name: "Roof", isActive: true }]);
  for (const [x, y] of [[5, 5], [95, 95], [5, 95], [95, 5], [32.17, 75.22]]) {
    const result = unprojectCofeinPoint("roof", projectCofeinTable({ id: "T01", area: "roof", x, y }, geometry), geometry);
    close(result.x, x, 1e-9); close(result.y, y, 1e-9);
  }
  assert.deepEqual(unprojectCofeinPoint("roof", { x: -10000, y: 10000 }, geometry), { x: 5, y: 95 });
  assert.equal(projectCofeinTable({ id: "MISSING", area: "unconfigured", x: 50, y: 50 }, geometry), null);
  assert.equal(geometry.hasPreset, false);
  assert.equal(projectCofeinTable({ id: "T24", area: "roof", x: 50, y: 50 }, geometry).rotation, 0);
});

test("deactivation removes views and tables without moving other hall coordinates", () => {
  const zones = ["interior", "roof", "garden", "lounge"].map(id => ({ id, name: id, isActive: true }));
  const before = getCofeinMapGeometry(zones);
  const after = getCofeinMapGeometry(zones.map(zone => ({ ...zone, isActive: !["interior", "roof"].includes(zone.id) })));
  assert.equal(after.views["zone:roof"], undefined);
  assert.equal(after.views["interior-main"], undefined);
  assert.equal(projectCofeinTable({ id: "A", area: "roof", x: 50, y: 50 }, after), null);
  assert.equal(unprojectCofeinPoint("roof", { x: 100, y: 100 }, after), null);
  const table = { id: "B", area: "garden", x: 25, y: 50 };
  assert.deepEqual(projectCofeinTable(table, after), projectCofeinTable(table, before));
  const empty = getCofeinMapGeometry([]);
  assert.deepEqual(empty.zones, []);
  assert.deepEqual(empty.detailViews, ["all"]);
  assert.equal(projectCofeinTable({ id: "T01", area: "exterior", x: 5, y: 5 }, empty), null);
});

test("view identity supports IDs resembling fragments and inherited object properties", () => {
  const geometry = getCofeinMapGeometry(["interior", "interior-main", "constructor"].map(id => ({ id, name: id, isActive: true })));
  assert.equal(geometry.views["interior-main"].zoneId, "interior");
  assert.equal(geometry.views["zone:interior-main"].zoneId, "interior-main");
  assert.equal(geometry.views["zone:constructor"].zoneId, "constructor");
  assert.equal(projectCofeinTable({ id: "A", area: "constructor", x: 20, y: 30 }, geometry).kind, "square");
  assert.equal(projectCofeinTable({ id: "A", area: "constructor", x: 20, y: 30 }), null);
});

test("fifty configured halls produce bounded layouts and a camera scale suitable for mobile", () => {
  const zones = Array.from({ length: 50 }, (_, i) => ({ id: `hall-${i}`, name: `Hall ${i}`, isActive: true }));
  const geometry = getCofeinMapGeometry(zones);
  assert.equal(geometry.zones.length, 50);
  assert.equal(geometry.detailViews.length, 51);
  assert.ok(geometry.minScale * geometry.world.height <= 200);
  for (const zone of geometry.zones) {
    assert.ok(zone.x >= 0 && zone.y >= 0 && zone.x + zone.width <= geometry.world.width && zone.y + zone.height <= geometry.world.height);
    assert.ok(zone.content.width >= 1000 && zone.content.height >= 1000);
    const center = projectCofeinTable({ id: "A", area: zone.id, x: 50, y: 50 }, geometry);
    assert.ok(center.x > zone.x && center.x < zone.x + zone.width);
  }
});

test("a sparse annex detail frames its active furniture comfortably while overview stays unchanged", () => {
  const zones = [{ id: "roof", name: "Roof", isActive: true }];
  const tables = [{ id: "ROOF-TABLE-1234567890", area: "roof", x: 50, y: 50, isActive: true }];
  const empty = getCofeinMapGeometry(zones);
  const populated = getCofeinMapGeometry(zones, tables);
  const detail = populated.views["zone:roof"];
  const placed = projectCofeinTable(tables[0], populated);
  assert.equal(detail.width, 360);
  assert.equal(detail.height, 400);
  close(detail.x + detail.width / 2, placed.x, 1e-9);
  close(detail.y + detail.height / 2, placed.y, 1e-9);
  assert.deepEqual(populated.views.all, empty.views.all);
  assert.deepEqual(populated.zones, empty.zones);
  assert.deepEqual(getCofeinMapGeometry(zones, [{ ...tables[0], isActive: false }]).views["zone:roof"], empty.views["zone:roof"]);
});

test("dense annex views include edge furniture, sparse edge views stay inside their room", () => {
  const zones = [{ id: "roof", name: "Roof", isActive: true }];
  const tables = [[5, 5], [95, 95], [5, 95], [95, 5]].map(([x, y], index) => ({ id: `A${index}`, area: "roof", x, y, isActive: true }));
  const dense = getCofeinMapGeometry(zones, tables);
  const detail = dense.views["zone:roof"];
  assert.equal(detail.width, dense.zones[0].width);
  assert.equal(detail.height, dense.zones[0].height);
  for (const table of tables) {
    const sparse = getCofeinMapGeometry(zones, [table]);
    const view = sparse.views["zone:roof"];
    const zone = sparse.zones[0];
    const point = projectCofeinTable(table, sparse);
    assert.ok(view.x >= zone.x && view.y >= zone.y);
    assert.ok(view.x + view.width <= zone.x + zone.width && view.y + view.height <= zone.y + zone.height);
    assert.ok(point.x - point.width / 2 >= view.x && point.x + point.width / 2 <= view.x + view.width);
    assert.ok(point.y - point.height / 2 >= view.y && point.y + point.height / 2 <= view.y + view.height);
  }
});

test("public hall crops use only active furniture from their own part without moving placements", () => {
  const zones = [{ id: "interior", name: "Inside", isActive: true }, { id: "exterior", name: "Outside", isActive: true }, { id: "roof", name: "Roof", isActive: true }];
  const tables = [
    { id: "T19", area: "interior", x: 5, y: 5 },
    { id: "T20", area: "interior", x: 5, y: 25 },
    { id: "T24", area: "interior", x: 95, y: 77.87 },
    { id: "T01", area: "exterior", x: 5, y: 5 },
    { id: "R1", area: "roof", x: 50, y: 50 },
    { id: "OFF", area: "interior", x: 95, y: 5, isActive: false },
  ];
  const geometry = getCofeinMapGeometry(zones, tables);
  const original = structuredClone(geometry);
  const views = getCofeinBookingViews(geometry, "interior", tables);
  assert.deepEqual(views.map(view => view.id), ["interior-main", "interior-angled"]);
  assert.deepEqual(views[0].tableIds, ["T19", "T20"]);
  assert.deepEqual(views[1].tableIds, ["T24"]);
  assert.ok(views[0].height < COFEIN_MAP_VIEWS["interior-main"].height);
  assert.ok(views[0].y > 200, "public crop excludes unrelated service rooms above the tables");
  for (const view of views) {
    for (const tableId of view.tableIds) {
      const table = tables.find(item => item.id === tableId);
      const point = projectCofeinTable(table, geometry);
      assert.deepEqual(point, projectCofeinTable(table, original));
      assert.ok(point.x - point.width / 2 >= view.x && point.x + point.width / 2 <= view.x + view.width);
      assert.ok(point.y - point.height / 2 >= view.y && point.y + point.height / 2 <= view.y + view.height);
    }
  }
  assert.deepEqual(geometry, original);
});

test("public hall crops support sparse new halls, renamed halls, empty parts and reserved view names", () => {
  const zones = ["interior", "constructor", "interior-main"].map(id => ({ id, name: `Live ${id}`, isActive: true }));
  const tables = zones.map((zone, index) => ({ id: `M${index}`, area: zone.id, x: 50, y: 95, isActive: true }));
  const geometry = getCofeinMapGeometry(zones, tables);
  assert.deepEqual(getCofeinBookingViews(geometry, "interior", tables).map(view => view.id), ["interior-angled"]);
  for (const zone of zones.slice(1)) {
    const [view] = getCofeinBookingViews(geometry, zone.id, tables);
    assert.equal(view.id, `zone:${zone.id}`);
    assert.equal(view.label, zone.name);
    assert.equal(view.width, 300);
    assert.equal(view.height, 320);
    assert.equal(view.tableIds.length, 1);
  }
  assert.deepEqual(getCofeinBookingViews(geometry, "missing", tables), []);
  assert.deepEqual(getCofeinBookingViews(geometry, "constructor", []), []);
  assert.deepEqual(getCofeinBookingViews(getCofeinMapGeometry(zones.map(zone => ({ ...zone, isActive: false }))), "interior", tables), []);
});
