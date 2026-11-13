import test from 'node:test';
import assert from 'node:assert/strict';
import { fitBounds } from '../adminMap/mapCamera.js';
import { clampCofeinCamera } from '../floorPlans/cofeinCamera.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('Cofein detail fit remains centred when an unrelated annex makes the complete world fit horizontally', () => {
  const viewport = { width: 609, height: 280 };
  const world = { width: 2240, height: 1600 };
  const view = { x: 300, y: 35, width: 590, height: 875 };
  const fitted = fitBounds(view, viewport, 24, .05, 3);
  const camera = clampCofeinCamera(fitted, viewport, world, view);
  close(camera.x, fitted.x);
  close(camera.y, fitted.y);
  close(camera.x + (view.x + view.width / 2) * camera.scale, viewport.width / 2);
});

test('scoped camera fits arbitrary hall origins and keeps panning bounded around that crop', () => {
  for (const view of [{ x: 350, y: 390, width: 400, height: 430 }, { x: 1540, y: 16100, width: 300, height: 320 }]) {
    for (const viewport of [{ width: 320, height: 440 }, { width: 900, height: 380 }]) {
      const fitted = fitBounds(view, viewport, 16, .001, 3);
      const camera = clampCofeinCamera(fitted, viewport, { width: 3600, height: 32000 }, view, true);
      close(camera.x, fitted.x); close(camera.y, fitted.y);
      const farAway = clampCofeinCamera({ ...camera, x: -100000, y: 100000 }, viewport, { width: 3600, height: 32000 }, view, true);
      const centerX = farAway.x + (view.x + view.width / 2) * camera.scale;
      const centerY = farAway.y + (view.y + view.height / 2) * camera.scale;
      assert.ok(centerX >= 0 && centerX <= viewport.width);
      assert.ok(centerY >= 0 && centerY <= viewport.height);
    }
  }
});
