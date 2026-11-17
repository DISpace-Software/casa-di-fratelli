import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COFFEE_GRAVITY, COFFEE_TIMELINE_SECONDS, CUP_CAPACITY, CUP_INNER_PROFILE,
  INITIAL_COFFEE_FRACTION, coffeeDroplets, coffeeFreeSurface,
  coffeeVolumeBelowPlane, createCoffeeFluidSampler, createCoffeeSloshState, cupInnerRadius,
  cupTiltAt, retainedCoffeeVolume, sampleCoffeeFluid, updateCoffeeSlosh,
} from './coffeeFluidPhysics.js';

const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);

test('upright vessel volume agrees with the sum of its exact conical frustums', () => {
  const capacity = CUP_INNER_PROFILE.slice(1).reduce((sum, b, index) => {
    const a = CUP_INNER_PROFILE[index];
    return sum + Math.PI * (b.y - a.y) * (a.radius ** 2 + a.radius * b.radius + b.radius ** 2) / 3;
  }, 0);
  close(CUP_CAPACITY, capacity);
  close(coffeeVolumeBelowPlane({ x: 0, y: 1, z: 0 }, -1), 0);
  close(coffeeVolumeBelowPlane({ x: 0, y: 1, z: 0 }, 4), capacity);
  close(retainedCoffeeVolume(0), capacity * INITIAL_COFFEE_FRACTION);
});

test('coffee is retained until the low rim reaches it and never refills as the cup tips', () => {
  close(retainedCoffeeVolume(0.15), retainedCoffeeVolume(0));
  assert.ok(retainedCoffeeVolume(0.35) < retainedCoffeeVolume(0.25));
  let previous = Infinity;
  for (let i = 0; i <= 200; i += 1) {
    const amount = retainedCoffeeVolume(i / 200);
    assert.ok(amount >= 0 && amount <= previous + 1e-9);
    previous = amount;
  }
  assert.ok(retainedCoffeeVolume(0.72) / CUP_CAPACITY > 0.07);
  close(retainedCoffeeVolume(1), 0);
});

test('free surface remains horizontal in world coordinates while the ceramic rotates', () => {
  for (const progress of [0, 0.15, 0.3, 0.5, 0.7, 0.8]) {
    const state = sampleCoffeeFluid(progress);
    const { angle, surface: { normal } } = state;
    close(normal.x * Math.cos(angle) - normal.y * Math.sin(angle), 0);
    close(normal.x * Math.sin(angle) + normal.y * Math.cos(angle), 1);
    close(normal.z, 0);
    const flat = coffeeFreeSurface(normal, state.level, { segments: 32, rings: 5, waveAmplitude: 0 });
    for (let i = 0; i < flat.positions.length; i += 3) {
      const worldY = flat.positions[i] * Math.sin(angle) + flat.positions[i + 1] * Math.cos(angle);
      close(worldY, state.level, 1e-6);
    }
  }
});

test('the animated shoreline and every interior vertex stay inside the real bowl', () => {
  let vertexCount = 0;
  let triangleCount = 0;
  for (let frame = 0; frame <= 34; frame += 1) {
    const state = sampleCoffeeFluid(frame / 40, { time: frame * 0.13 });
    const { positions, indices, visible } = state.surface;
    vertexCount ||= positions.length;
    triangleCount ||= indices.length;
    assert.equal(positions.length, vertexCount, 'vertex buffers can be reused across frames');
    assert.equal(indices.length, triangleCount, 'index buffers can be reused across frames');
    if (!visible) continue;
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index]; const y = positions[index + 1]; const z = positions[index + 2];
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
      assert.ok(y >= 0.22 - 1e-6 && y <= 1.48 + 1e-6);
      assert.ok(Math.hypot(x, z) <= cupInnerRadius(Math.max(0.22, Math.min(1.48, y))) + 2e-6,
        `surface crossed ceramic at progress ${frame / 40}: ${x}, ${y}, ${z}`);
    }
    for (const index of indices) assert.ok(index < positions.length / 3);
  }
});

test('surface triangle winding faces upward and the empty cup hides its residual mesh', () => {
  const { surface } = sampleCoffeeFluid(0.5);
  const [a, b, c] = surface.indices;
  const point = index => Array.from(surface.positions.slice(index * 3, index * 3 + 3));
  const [pa, pb, pc] = [a, b, c].map(point);
  const u = pb.map((value, index) => value - pa[index]);
  const v = pc.map((value, index) => value - pa[index]);
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  assert.ok(cross[0] * surface.normal.x + cross[1] * surface.normal.y + cross[2] * surface.normal.z > 0);
  assert.equal(sampleCoffeeFluid(1).surface.visible, false);
});

test('a falling bead accelerates under gravity and its declared landing lies on the floor', () => {
  const first = coffeeDroplets(0.251).drops.find(drop => drop.phase === 'falling');
  assert.ok(first);
  const dt = 0.02;
  const later = coffeeDroplets(0.251 + dt / COFFEE_TIMELINE_SECONDS).drops.find(drop => drop.id === first.id);
  assert.ok(later);
  close(later.velocity.y - first.velocity.y, -COFFEE_GRAVITY * dt);
  close(later.x - first.x, first.velocity.x * dt);
  close(later.y - first.y, first.velocity.y * dt - 0.5 * COFFEE_GRAVITY * dt * dt);
  const landing = coffeeDroplets(first.impactAt).drops.find(drop => drop.id === first.id);
  if (landing) {
    close(landing.y, -2.2);
    close(landing.x, first.impact.x);
    close(landing.z, first.impact.z);
  }
  close(first.impact.y, -2.2);
});

test('droplets use the lip position at birth and inherit motion without upward jets', () => {
  const p = 0.251;
  const stationary = coffeeDroplets(p).drops.find(drop => drop.phase === 'falling');
  const moving = coffeeDroplets(p, { cupPosition: progress => ({ x: progress, y: 0.1, z: 0 }) })
    .drops.find(drop => drop.id === stationary.id);
  close(moving.x - stationary.x, p, 1e-6);
  close(moving.velocity.x - stationary.velocity.x, 1 / COFFEE_TIMELINE_SECONDS, 1e-6);
  for (let progress = 0.25; progress < 0.9; progress += 0.01) {
    for (const drop of coffeeDroplets(progress).drops) {
      if (drop.phase === 'falling') assert.ok(drop.velocity.y <= 0);
    }
  }
});

test('individual landings vary in space, time and size and emit smaller satellites', () => {
  const { impacts } = coffeeDroplets(1);
  assert.equal(impacts.length, 44);
  assert.equal(new Set(impacts.map(impact => impact.at)).size, impacts.length);
  assert.ok(Math.max(...impacts.map(event => event.x)) - Math.min(...impacts.map(event => event.x)) > 0.8);
  assert.ok(Math.max(...impacts.map(event => event.z)) - Math.min(...impacts.map(event => event.z)) > 0.7);
  assert.ok(Math.max(...impacts.map(event => event.radius)) > Math.min(...impacts.map(event => event.radius)) * 1.5);
  const first = impacts[0];
  const satellites = coffeeDroplets(first.at + 0.01).drops.filter(drop => drop.phase === 'splash' && drop.impactAt === first.at);
  assert.equal(satellites.length, 3);
  for (const drop of satellites) {
    assert.ok(drop.radius < first.radius / 2);
    assert.ok(drop.y > first.y);
  }
});

test('scrubbing is deterministic, and past droplets do not linger after completion', () => {
  const a = coffeeDroplets(0.6);
  coffeeDroplets(0.9);
  assert.deepEqual(coffeeDroplets(0.6), a);
  assert.equal(coffeeDroplets(0).drops.length, 0);
  assert.equal(coffeeDroplets(1).drops.length, 0);
  close(cupTiltAt(-1), cupTiltAt(0));
  close(cupTiltAt(2), cupTiltAt(1));
});

test('inertial slosh responds to a sudden tilt, stays bounded and settles at rest', () => {
  const state = createCoffeeSloshState();
  updateCoffeeSlosh(state, 0, 1 / 60);
  updateCoffeeSlosh(state, 0.1, 1 / 60);
  assert.ok(Math.abs(state.x) > 0);
  for (let i = 0; i < 600; i += 1) {
    updateCoffeeSlosh(state, 0.1, 1 / 60);
    assert.ok(Math.abs(state.x) <= 0.045 && Math.abs(state.z) <= 0.035);
  }
  assert.ok(Math.abs(state.x) < 0.00001);
  assert.ok(Math.abs(state.velocityX) < 0.00001);
});

test('per-scene caching preserves fresh waves and never leaks geometry across options or scenes', () => {
  const sample = createCoffeeFluidSampler();
  const separate = createCoffeeFluidSampler();
  const first = sample(0.5, { time: 1 });
  const preserved = first.surface.positions.slice();
  for (const options of [
    { time: 2 },
    { time: 3, segments: 32, rings: 6 },
    { time: 4, slosh: { x: 0.02, z: -0.01 } },
    { time: 5, cupPosition: () => ({ x: 1, y: 0.2, z: 0.5 }), floorY: -3 },
  ]) {
    const expected = sampleCoffeeFluid(0.5, options);
    const actual = sample(0.5, options);
    assert.deepEqual(actual, expected);
    assert.deepEqual(separate(0.5, options), expected);
  }
  assert.deepEqual(first.surface.positions, preserved, 'sampling must not mutate retained frames');
  assert.notDeepEqual(sample(0.5, { time: 2 }).surface.positions, preserved, 'waves still move while the tilt is stationary');
});

test('every bead detaches outside the ceramic lip with outward relative velocity', () => {
  const births = new Map();
  for (let p = 0.24; p < 0.86; p += 0.003) {
    for (const drop of coffeeDroplets(p).drops) {
      if (drop.phase === 'falling') births.set(drop.id, drop.bornAt);
    }
  }
  assert.equal(births.size, 44);
  for (const [id, birth] of births) {
    const drop = coffeeDroplets(birth).drops.find(candidate => candidate.id === id);
    assert.ok(drop);
    const angle = cupTiltAt(birth);
    const x = drop.x * Math.cos(angle) + (drop.y - 0.1) * Math.sin(angle);
    const y = -drop.x * Math.sin(angle) + (drop.y - 0.1) * Math.cos(angle);
    const radius = Math.hypot(x, drop.z);
    assert.ok(radius > 1.015, 'the inner rim is not a valid detached-particle birthplace');
    close(y, 1.50);
    const step = 1 / COFFEE_TIMELINE_SECONDS / 120;
    const angularVelocity = (cupTiltAt(birth + step) - cupTiltAt(birth - step)) / (step * 2 * COFFEE_TIMELINE_SECONDS);
    const vx = drop.velocity.x + (drop.y - 0.1) * angularVelocity;
    const vy = drop.velocity.y - drop.x * angularVelocity;
    const localVX = vx * Math.cos(angle) + vy * Math.sin(angle);
    assert.ok(localVX * x / radius + drop.velocity.z * drop.z / radius > 0,
      `bead ${id} was directed back into its cup`);
  }
});

test('resting coffee has a calm film while actual slosh increases ripple amplitude', () => {
  function excursion(surface) {
    let maximum = 0;
    for (let index = 0; index < surface.positions.length; index += 3) {
      const height = surface.positions[index] * surface.normal.x
        + surface.positions[index + 1] * surface.normal.y
        + surface.positions[index + 2] * surface.normal.z;
      maximum = Math.max(maximum, Math.abs(height - surface.level));
    }
    return maximum;
  }
  const resting = sampleCoffeeFluid(0.5, { time: 3 }).surface;
  const moving = sampleCoffeeFluid(0.5, { time: 3, slosh: { x: 0.03, z: 0.01, angularVelocity: 0.5 } }).surface;
  assert.ok(excursion(resting) < 0.001);
  assert.ok(excursion(moving) > excursion(resting) * 3);
});

test('the wider outward cone spreads primary landings while secondary impacts match their own flights', () => {
  const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  const cupPosition = p => ({
    x: -0.28 * ease((p - 0.06) / 0.18),
    y: 0.10 + 0.65 * ease((p - 0.035) / 0.22) + 6 * ease((p - 0.74) / 0.20),
    z: 0,
  });
  const options = { cupPosition, includeSplashImpacts: true };
  const { impacts, splashImpacts } = coffeeDroplets(0, options);
  const xs = impacts.map(impact => impact.x);
  assert.ok(Math.min(...xs) > -4);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1.5);
  assert.equal(splashImpacts.length, 132);
  assert.equal(coffeeDroplets(0).splashImpacts.length, 0, 'frame sampling need not allocate unused reveal events');
  for (const impact of splashImpacts) {
    const parent = impacts.find(candidate => candidate.id === impact.parentId);
    assert.ok(impact.secondary && impact.at > parent.at);
    assert.ok(impact.radius < parent.radius * 0.5);
    assert.ok(impact.mass < parent.mass * 0.125);
  }
  const impact = splashImpacts[0];
  const beforeLanding = coffeeDroplets(impact.at - 1e-6, { cupPosition }).drops.find(drop => drop.id === impact.id);
  assert.ok(beforeLanding && beforeLanding.phase === 'splash');
  close(beforeLanding.x, impact.x, 0.00005);
  close(beforeLanding.y, impact.y, 0.00005);
  close(beforeLanding.z, impact.z, 0.00005);
});
