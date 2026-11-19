import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_MAP_ZONES, buildMapGeometry } from "../adminMap/mapConfig.js";

const casaZones = [
  { id: "indoor", presentation: "casa-indoor" },
  { id: "garden", presentation: "casa-garden" },
  { id: "openTerrace", presentation: "casa-terrace" },
];
test("adding a Casa hall preserves each original zone's geometry", () => {
  const result = buildMapGeometry([...casaZones, { id: "private", presentation: "plain" }]);
  for (const expected of ADMIN_MAP_ZONES) {
    const actual = result.zones.find(zone => zone.id === expected.id);
    for (const field of ["x", "y", "width", "height"]) assert.equal(actual[field], expected[field]);
  }
  const extra = result.zones.find(zone => zone.id === "private");
  assert(extra.y > 1200);
  assert(extra.y + extra.height <= result.world.height);
});

test("generic restaurant names never select Casa decoration or geometry", () => {
  const result = buildMapGeometry([{ id: "indoor", presentation: "plain" }, { id: "vip", presentation: "plain" }]);
  assert.equal(result.zones[0].x, 80);
  assert.equal(result.zones[1].x, 1150);
  assert.equal(result.zones[0].y, result.zones[1].y);
});

test("partial and empty maps retain valid geometry", () => {
  const result = buildMapGeometry([casaZones[1]]);
  assert.equal(result.zones[0].x, ADMIN_MAP_ZONES[1].x);
  assert.equal(result.world.height, 1420);
  assert.equal(buildMapGeometry([]).world.height, 800);
});
