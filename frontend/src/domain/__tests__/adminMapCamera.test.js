import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  fitBounds,
  localPercentToWorld,
  preserveWorldCenter,
  screenToWorld,
  zoomCameraAt,
} from "../adminMap/mapCamera.js";
import {
  ADMIN_MAP_TERRACE_CONNECTION,
  ADMIN_MAP_ZONES,
} from "../adminMap/mapConfig.js";

test("admin map converts zone-local percentages to world coordinates", () => {
  assert.deepEqual(
    localPercentToWorld({ x: 100, y: 200, width: 800, height: 600 }, { x: 25, y: 50 }),
    { x: 300, y: 500 }
  );
});

test("admin map converts screen coordinates to world coordinates", () => {
  assert.deepEqual(screenToWorld({ x: 110, y: 70 }, { x: 10, y: 20, scale: 2 }), { x: 50, y: 25 });
});

test("admin map zoom keeps the world point under the cursor fixed", () => {
  const point = { x: 300, y: 200 };
  const before = { x: 20, y: 40, scale: 1 };
  const after = zoomCameraAt(before, point, 2, 0.35, 3);
  assert.deepEqual(screenToWorld(point, after), screenToWorld(point, before));
});

test("admin map scale is clamped", () => {
  assert.equal(clamp(0.1, 0.35, 3), 0.35);
  assert.equal(clamp(5, 0.35, 3), 3);
});

test("fitBounds centers content in the viewport", () => {
  assert.deepEqual(
    fitBounds({ x: 0, y: 0, width: 1000, height: 500 }, { width: 1000, height: 600 }, 50, 0.35, 3),
    { x: 50, y: 75, scale: 0.9 }
  );
});

test("resize preserves the logical world center", () => {
  const camera = { x: -100, y: -50, scale: 1.5 };
  const beforeCenter = screenToWorld({ x: 400, y: 300 }, camera);
  const resized = preserveWorldCenter(camera, { width: 800, height: 600 }, { width: 1200, height: 800 });
  const afterCenter = screenToWorld({ x: 600, y: 400 }, resized);
  assert.deepEqual(afterCenter, beforeCenter);
});

test("restaurant halls and open terrace share one aligned entrance axis", () => {
  const indoor = ADMIN_MAP_ZONES.find((zone) => zone.id === "indoor");
  const garden = ADMIN_MAP_ZONES.find((zone) => zone.id === "garden");
  const openTerrace = ADMIN_MAP_ZONES.find((zone) => zone.id === "openTerrace");
  const upperHallJunction = ((indoor.x + indoor.width) + garden.x) / 2;
  const openTerraceEntrance = openTerrace.x + openTerrace.width / 2;

  assert.equal(ADMIN_MAP_TERRACE_CONNECTION.centerX, upperHallJunction);
  assert.equal(openTerraceEntrance, upperHallJunction);
  assert.equal(ADMIN_MAP_TERRACE_CONNECTION.top, indoor.y + indoor.height);
  assert.equal(ADMIN_MAP_TERRACE_CONNECTION.top, garden.y + garden.height);
  assert.equal(
    ADMIN_MAP_TERRACE_CONNECTION.top + ADMIN_MAP_TERRACE_CONNECTION.height,
    openTerrace.y
  );
});
