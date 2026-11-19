import test from "node:test";
import assert from "node:assert/strict";
import { nextTablePosition } from "../adminMap/layoutDraft.js";

test("repeated table additions stay distinct and inside API bounds", () => {
  const tables = [];
  for (let index = 0; index < 100; index += 1) {
    const point = nextTablePosition(tables, "new-hall");
    assert(point, `position for table ${index}`);
    assert(point.x >= 5 && point.x <= 95 && point.y >= 5 && point.y <= 95);
    assert(tables.every(table => (table.x - point.x) ** 2 + (table.y - point.y) ** 2 >= 36));
    tables.push({ id: String(index), area: "new-hall", isActive: true, ...point });
  }
});

test("other halls and inactive tables do not consume positions", () => {
  assert.deepEqual(nextTablePosition([
    { area: "other", x: 10, y: 10, isActive: true },
    { area: "hall", x: 10, y: 10, isActive: false },
  ], "hall"), { x: 10, y: 10 });
});

test("a full hall cannot silently create overlapping tables", () => {
  const tables = [];
  for (let x = 5; x <= 95; x += 5) for (let y = 5; y <= 95; y += 5) tables.push({ area: "hall", x, y, isActive: true });
  assert.equal(nextTablePosition(tables, "hall"), null);
});
