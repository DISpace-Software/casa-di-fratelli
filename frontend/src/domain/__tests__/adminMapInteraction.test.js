import test from "node:test";
import assert from "node:assert/strict";
import {
  getMapModalPortalTarget,
  shouldStartMapGesture,
  shouldUseNativeMapFullscreen,
} from "../adminMap/mapInteraction.js";

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

test("map modals render inside the native fullscreen element", () => {
  const body = { id: "body" };
  const fullscreenElement = { id: "fullscreen-map" };

  assert.equal(getMapModalPortalTarget({ body, fullscreenElement }), fullscreenElement);
});

test("map modals fall back to the document body outside fullscreen", () => {
  const body = { id: "body" };

  assert.equal(getMapModalPortalTarget({ body, fullscreenElement: null }), body);
  assert.equal(getMapModalPortalTarget(null), null);
});

test("iPad uses the fixed map overlay instead of native fullscreen", () => {
  assert.equal(shouldUseNativeMapFullscreen({
    userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)",
    platform: "iPad",
    maxTouchPoints: 5,
  }), false);
});

test("desktop Safari can still use native fullscreen", () => {
  assert.equal(shouldUseNativeMapFullscreen({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    platform: "MacIntel",
    maxTouchPoints: 0,
  }), true);
});

test("iPad desktop user agent is detected by touch support", () => {
  assert.equal(shouldUseNativeMapFullscreen({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    platform: "MacIntel",
    maxTouchPoints: 5,
  }), false);
});
