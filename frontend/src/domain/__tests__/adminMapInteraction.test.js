import test from "node:test";
import assert from "node:assert/strict";
import { shouldStartMapGesture } from "../adminMap/mapInteraction.js";

test("desktop primary-button drag can start a map gesture", () => {
  assert.equal(shouldStartMapGesture({ pointerType: "mouse", button: 0, isInteractiveTarget: false }), true);
});

test("desktop secondary-button drag cannot start a map gesture", () => {
  assert.equal(shouldStartMapGesture({ pointerType: "mouse", button: 2, isInteractiveTarget: false }), false);
});

test("table buttons keep their click instead of starting a map gesture", () => {
  assert.equal(shouldStartMapGesture({ pointerType: "mouse", button: 0, isInteractiveTarget: true }), false);
  assert.equal(shouldStartMapGesture({ pointerType: "touch", button: 0, isInteractiveTarget: true }), false);
});

test("touching the map background can start panning", () => {
  assert.equal(shouldStartMapGesture({ pointerType: "touch", button: 0, isInteractiveTarget: false }), true);
});
