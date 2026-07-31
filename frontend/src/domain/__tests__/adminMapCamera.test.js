import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  clampCamera,
  fitBounds,
  focusCameraOnWorldPoint,
  localPercentToWorld,
  preserveWorldCenter,
  rotatePercentPointClockwise,
  rotatePercentPointCounterClockwise,
  screenToWorld,
  zoomCameraAt,
} from "../adminMap/mapCamera.js";
import { ADMIN_MAP_ZONES } from "../adminMap/mapConfig.js";

test("admin map converts zone-local percentages to world coordinates", () => {
  assert.deepEqual(
    localPercentToWorld({ x: 100, y: 200, width: 800, height: 600 }, { x: 25, y: 50 }),
    { x: 300, y: 500 }
  );
});

test("admin map converts screen coordinates to world coordinates", () => {
  assert.deepEqual(screenToWorld({ x: 110, y: 70 }, { x: 10, y: 20, scale: 2 }), { x: 50, y: 25 });
});

test("covered terrace points rotate clockwise and can be restored", () => {
  const original = { x: 17, y: 22 };
  const rotated = rotatePercentPointClockwise(original);

  assert.deepEqual(rotated, { x: 78, y: 17 });
  assert.deepEqual(rotatePercentPointCounterClockwise(rotated), original);
});

test("open terrace entrance aligns with the indoor hall entrance", () => {
  const indoor = ADMIN_MAP_ZONES.find((zone) => zone.id === "indoor");
  const openTerrace = ADMIN_MAP_ZONES.find((zone) => zone.id === "openTerrace");

  const indoorEntranceX = indoor.x + indoor.width * 0.6;
  const openTerraceEntranceX = openTerrace.x + openTerrace.width * 0.5;

  assert.ok(Math.abs(openTerraceEntranceX - indoorEntranceX) < 0.001);
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

test("table focus centers a world point at the preferred scale", () => {
  const viewport = { width: 1000, height: 700 };
  const point = { x: 820, y: 360 };
  const camera = focusCameraOnWorldPoint(point, viewport, 0.7, 0.35, 3);

  assert.equal(camera.scale, 0.7);
  assert.deepEqual(screenToWorld({ x: 500, y: 350 }, camera), point);
});

test("table focus clamps an invalid preferred scale", () => {
  assert.equal(
    focusCameraOnWorldPoint({ x: 0, y: 0 }, { width: 100, height: 100 }, 10, 0.35, 3).scale,
    3
  );
});

test("camera clamping keeps a large world reachable inside the viewport", () => {
  assert.deepEqual(
    clampCamera(
      { x: 500, y: -2000, scale: 1 },
      { width: 1000, height: 700 },
      { width: 1970, height: 1420 },
      120
    ),
    { x: 380, y: -950, scale: 1 }
  );
});
