import test from "node:test";
import assert from "node:assert/strict";
import { getActiveLayoutTables } from "../reservations/layoutTables.js";

const fallback = [{ id: "1", seats: 4, x: 10, y: 20 }];

test("an explicitly disabled area stays empty instead of restoring default tables", () => {
  assert.deepEqual(getActiveLayoutTables([{ id: "2", area: "indoor", isActive: false }], "indoor", fallback), []);
});

test("an area containing only retired tables stays empty", () => {
  assert.deepEqual(getActiveLayoutTables([{ id: "30a", area: "indoor", isActive: true }], "indoor", fallback), []);
});

test("missing areas and malformed responses preserve the default layout", () => {
  for (const input of [[], null, undefined, {}, [null], [{ id: "2", area: "garden" }]]) {
    assert.deepEqual(getActiveLayoutTables(input, "indoor", fallback).map((table) => table.id), ["1"]);
  }
});

test("PascalCase API fields preserve disabled areas and normalize active table fields", () => {
  assert.deepEqual(getActiveLayoutTables([{ Id: "2", Area: "indoor", IsActive: false }], "indoor", fallback), []);
  assert.deepEqual(getActiveLayoutTables([{ Id: " 2 ", Area: "indoor", IsActive: true, Seats: 6, X: 15, Y: 30, Special: true, Wide: true }], "indoor", fallback), [
    { id: "2", area: "indoor", isActive: true, seats: 6, x: 15, y: 30, special: true, wide: true },
  ]);
});

test("mixed layouts exclude inactive and retired tables without changing the input", () => {
  const items = [
    { id: "2", area: "indoor", isActive: true },
    { id: "3", area: "indoor", isActive: false },
    { id: "30A", area: "indoor", isActive: true },
    { id: "4", area: "garden", isActive: true },
  ];
  const original = structuredClone(items);
  assert.deepEqual(getActiveLayoutTables(items, "indoor", fallback).map((table) => table.id), ["2"]);
  assert.deepEqual(items, original);
});
