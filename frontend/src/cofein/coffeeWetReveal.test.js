import assert from 'node:assert/strict';
import test from 'node:test';
import { coffeeWetFront, coffeeWetPatch, drawCoffeeWetReveal } from './coffeeWetReveal.js';

const impact = { id: 1, at: 0.4, x: 0.35, pageY: 0.2, mass: 0.005, seed: 4 };
const viewports = [[320, 740], [390, 844], [844, 390], [1440, 1000], [3440, 1440]];

test('A drop opens only after impact, initially as a small local patch', () => {
  for (const [width, height] of viewports) {
    assert.equal(coffeeWetPatch(width, height, 0.399, impact), null);
    assert.equal(coffeeWetPatch(width, height, 0.4, impact), null);
    const first = coffeeWetPatch(width, height, 0.401, impact);
    assert(first.radius > 0 && first.radius < 1);
    const settled = coffeeWetPatch(width, height, 0.6, impact);
    assert(settled.radius < Math.min(width, height) * 0.09);
    assert(settled.radius > first.radius);
  }
});

test('Wet patches travel with the real page without changing shape on scroll', () => {
  const original = coffeeWetPatch(390, 844, 0.55, impact, 250);
  const shifted = coffeeWetPatch(390, 844, 0.55, impact, 100);
  for (let i = 0; i < original.points.length; i += 1) {
    assert.equal(original.points[i].x, shifted.points[i].x);
    assert(Math.abs(original.points[i].y - shifted.points[i].y - 150) < 1e-8);
  }
});

test('Physical impacts stay below the cup while the page enters behind them', () => {
  const landing = { ...impact, screenY: 0.81 };
  for (const [width, height] of viewports) {
    const before = coffeeWetPatch(width, height, 0.55, landing, height * 0.4);
    const entered = coffeeWetPatch(width, height, 0.55, landing, 0);
    assert.equal(before.y, height * landing.screenY);
    assert.equal(entered.y, before.y);
    assert.deepEqual(before.points, entered.points);
    assert(entered.points.every(point => point.y > height * 0.65), 'Old holes must not rise above the cup');
    const front = coffeeWetFront(width, height, 0.79, [landing]);
    assert(front.top.every(point => point.y > height * 0.75), 'Upstream reveal waits until the cup leaves');
  }
});

test('A near-edge impact keeps a curved meniscus inside the entering page', () => {
  for (const [width, height] of viewports) {
    const patch = coffeeWetPatch(width, height, 0.64, { ...impact, pageY: 0.025 }, 150);
    assert(patch.points.every(point => point.y > 150));
  }
});

test('Satellite impacts open small local spots without driving the joined film', () => {
  const secondary = { ...impact, id: '1-splash-1', secondary: true };
  for (const progress of [0.401, 0.55, 0.75, 0.9]) {
    const primaryPatch = coffeeWetPatch(390, 844, progress, impact);
    const splashPatch = coffeeWetPatch(390, 844, progress, secondary);
    assert(Math.abs(splashPatch.radius / primaryPatch.radius - 0.24) < 1e-9);
  }
  assert.equal(coffeeWetFront(390, 844, 0.9, [secondary]), null);
  assert.deepEqual(coffeeWetFront(390, 844, 0.85, [impact, { ...secondary, x: 0.98, pageY: 0.95 }]),
    coffeeWetFront(390, 844, 0.85, [impact]));
});

test('A newly arriving distant drop cannot snap the connected wet front', () => {
  const drops = [impact, { ...impact, id: 2, at: 0.8, x: 0.95, pageY: 0.85 }];
  const before = coffeeWetFront(1440, 1000, 0.8 - 1e-6, drops);
  const after = coffeeWetFront(1440, 1000, 0.8 + 1e-6, drops);
  for (let i = 0; i < before.top.length; i += 1) {
    assert(Math.abs(before.top[i].y - after.top[i].y) < 0.03);
    assert(Math.abs(before.bottom[i].y - after.bottom[i].y) < 0.03);
  }
});

test('Coalescence follows impacts and clears the visible page before handoff at every width', () => {
  assert.equal(coffeeWetFront(390, 844, 0.9, []), null);
  assert.equal(coffeeWetFront(390, 844, 0.6, [impact]), null);
  for (const [width, height] of viewports) {
    for (const x of [0.05, 0.5, 0.95]) {
      const front = coffeeWetFront(width, height, 0.99, [{ ...impact, x }], 30);
      assert(front.top.every(point => point.y < 30));
      assert(front.bottom.every(point => point.y > height));
      assert(front.top.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    }
  }
});

test('Completed intro clears the overlay instead of leaving a final opaque frame', () => {
  const calls = [];
  const context = {
    save() { calls.push('save'); }, restore() { calls.push('restore'); },
    clearRect(...args) { calls.push(args); },
  };
  drawCoffeeWetReveal(context, 390, 844, 0.995, { impacts: [impact] });
  assert.deepEqual(calls, ['save', [0, 0, 390, 844], 'restore']);
});
