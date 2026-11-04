import test from "node:test";
import assert from "node:assert/strict";
import { COFEIN_MAP_WORLD, COFEIN_MAP_VIEWS, getCofeinMapGeometry, projectCofeinTable, unprojectCofeinPoint } from "../floorPlans/cofeinGeometry.js";

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
