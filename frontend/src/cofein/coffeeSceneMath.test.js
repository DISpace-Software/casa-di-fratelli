import assert from 'node:assert/strict';
import test from 'node:test';
import { coffeeImpacts, coffeePose, floodRadius, poolRadius } from './coffeeSceneMath.js';

const viewports = [[320, 740], [390, 844], [844, 390], [900, 1100], [1440, 1000], [3440, 1440]];

test('Scroll offsets outside the introduction cannot tilt or fade the cup beyond its endpoints', () => {
  for (const [width, height] of viewports) {
    assert.deepEqual(coffeePose(width, height, -0.5), coffeePose(width, height, 0));
    assert.deepEqual(coffeePose(width, height, 1.5), coffeePose(width, height, 1));
  }
});

test('Cup, pouring lip and saucer remain finite across phone, landscape and ultrawide viewports', () => {
  for (const [width, height] of viewports) for (let step = 0; step <= 100; step++) {
    const pose = coffeePose(width, height, step / 100);
    for (const value of [pose.x, pose.y, pose.size, pose.rotation, pose.opacity, pose.lip.x, pose.lip.y, pose.saucer.x, pose.saucer.y, pose.saucer.size, pose.saucer.rotation]) assert(Number.isFinite(value));
    assert(pose.size > 0 && pose.saucer.size > 0);
    assert(pose.opacity >= 0 && pose.opacity <= 1);
    assert(pose.lip.x >= 0 && pose.lip.x <= width, 'Pouring lip must remain on screen');
    assert(pose.lip.y >= 0 && pose.lip.y <= height, 'Pouring lip must remain on screen');
  }
});

test('Coffee never uncovers the page before an impact and each impact grows monotonically', () => {
  for (const [width, height] of viewports) for (const impact of coffeeImpacts) {
    assert.equal(poolRadius(width, height, impact.at - 0.01, impact), 0);
    assert.equal(poolRadius(width, height, impact.at, impact), 0);
    let previous = 0;
    for (let step = 0; step <= 100; step++) {
      const radius = poolRadius(width, height, step / 100, impact);
      assert(radius >= previous);
      previous = radius;
    }
  }
});

test('Final flood covers every screen corner before scroll handoff, even with irregular contours', () => {
  // The contour's three waves can shorten its radius by 17%; its y axis is 84%.
  // A conservative circle inside that contour must still reach all corners.
  for (const [width, height] of viewports) {
    const innerRadius = floodRadius(width, height, 0.95) * 0.83 * 0.84;
    for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) {
      assert(innerRadius > Math.hypot(x - width * 0.46, y - height * 0.66));
    }
    assert.equal(coffeePose(width, height, 0.95).opacity, 0);
  }
});
