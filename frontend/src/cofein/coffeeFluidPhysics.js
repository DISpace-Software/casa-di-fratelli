/**
 * A small, deterministic, physically guided coffee model, in cup-local units.
 *
 * The free surface conserves the volume the tilted vessel can still contain.
 * Its boundary is the intersection with the actual inner wall, not an ellipse
 * pasted across the rim. Individual visible beads represent small packets of
 * discharged coffee; this is a real-time surface/particle model, not CFD.
 */
export const CUP_INNER_PROFILE = Object.freeze([
  { y: 0.22, radius: 0.33 },
  { y: 0.35, radius: 0.52 },
  { y: 0.70, radius: 0.69 },
  { y: 1.00, radius: 0.80 },
  { y: 1.35, radius: 0.90 },
  { y: 1.48, radius: 0.94 },
].map(Object.freeze));

export const COFFEE_TIMELINE_SECONDS = 7.2;
export const COFFEE_GRAVITY = 9.81;
export const INITIAL_COFFEE_FRACTION = 0.82;
const BOTTOM = CUP_INNER_PROFILE[0].y;
const RIM = CUP_INNER_PROFILE.at(-1);
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

/** Positive rotation about Z lowers the cup's negative-X lip. */
export function cupTiltAt(progress) {
  const p = clamp(progress, 0, 1);
  return smooth((p - 0.08) / 0.64) + 0.34 * smooth((p - 0.72) / 0.18);
}

export function cupInnerRadius(y) {
  if (y < BOTTOM || y > RIM.y) return 0;
  for (let i = 1; i < CUP_INNER_PROFILE.length; i += 1) {
    const a = CUP_INNER_PROFILE[i - 1];
    const b = CUP_INNER_PROFILE[i];
    if (y <= b.y) return a.radius + (b.radius - a.radius) * (y - a.y) / (b.y - a.y);
  }
  return RIM.radius;
}

function normalized(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

/** Volume underneath n·position = level, integrated through the circular bowl. */
export function coffeeVolumeBelowPlane(normal, level, slices = 96) {
  const horizontal = Math.hypot(normal.x, normal.z);
  if (horizontal < 1e-8 && normal.y > 0) {
    const top = clamp(level / normal.y, BOTTOM, RIM.y);
    let result = 0;
    for (let i = 1; i < CUP_INNER_PROFILE.length; i += 1) {
      const a = CUP_INNER_PROFILE[i - 1];
      const b = CUP_INNER_PROFILE[i];
      if (top <= a.y) break;
      const height = Math.min(top, b.y) - a.y;
      const slope = (b.radius - a.radius) / (b.y - a.y);
      result += Math.PI * (a.radius ** 2 * height
        + a.radius * slope * height ** 2 + slope ** 2 * height ** 3 / 3);
    }
    return result;
  }
  const dy = (RIM.y - BOTTOM) / slices;
  let volume = 0;
  for (let i = 0; i < slices; i += 1) {
    const y = BOTTOM + (i + 0.5) * dy;
    const radius = cupInnerRadius(y);
    const offset = level - normal.y * y;
    let area;
    if (horizontal < 1e-8) {
      area = offset >= 0 ? Math.PI * radius * radius : 0;
    } else {
      const cut = offset / horizontal;
      if (cut <= -radius) area = 0;
      else if (cut >= radius) area = Math.PI * radius * radius;
      else area = radius * radius * (Math.asin(cut / radius) + Math.PI / 2)
        + cut * Math.sqrt(Math.max(0, radius * radius - cut * cut));
    }
    volume += area * dy;
  }
  return volume;
}

export const CUP_CAPACITY = coffeeVolumeBelowPlane({ x: 0, y: 1, z: 0 }, RIM.y + 1);

function lowestRimLevel(normal) {
  return normal.y * RIM.y - Math.hypot(normal.x, normal.z) * RIM.radius;
}

export function retainedCoffeeVolume(progress) {
  const angle = cupTiltAt(progress);
  const normal = { x: Math.sin(angle), y: Math.cos(angle), z: 0 };
  return Math.min(INITIAL_COFFEE_FRACTION * CUP_CAPACITY,
    coffeeVolumeBelowPlane(normal, lowestRimLevel(normal)));
}

function planeLevelForVolume(normal, volume) {
  let low = -2;
  let high = 2;
  for (let i = 0; i < 25; i += 1) {
    const middle = (low + high) / 2;
    if (coffeeVolumeBelowPlane(normal, middle) < volume) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function planeWallIntersections(normal, level, segments) {
  const points = [];
  const keys = new Set();
  function add(point) {
    const key = `${Math.round(point.x * 1e6)}:${Math.round(point.y * 1e6)}:${Math.round(point.z * 1e6)}`;
    if (!keys.has(key)) { keys.add(key); points.push(point); }
  }
  function edge(a, b) {
    const da = dot(normal, a) - level;
    const db = dot(normal, b) - level;
    if (Math.abs(da) < 1e-8) add(a);
    if (Math.abs(db) < 1e-8) add(b);
    if (da * db < 0) {
      const t = da / (da - db);
      add({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments * TAU;
    const b = (i + 1) / segments * TAU;
    const ca = Math.cos(a); const sa = Math.sin(a);
    const cb = Math.cos(b); const sb = Math.sin(b);
    for (let j = 0; j < CUP_INNER_PROFILE.length; j += 1) {
      const section = CUP_INNER_PROFILE[j];
      const point = { x: section.radius * ca, y: section.y, z: section.radius * sa };
      edge(point, { x: section.radius * cb, y: section.y, z: section.radius * sb });
      if (j) {
        const previous = CUP_INNER_PROFILE[j - 1];
        edge(point, { x: previous.radius * ca, y: previous.y, z: previous.radius * sa });
      } else {
        edge(point, { x: 0, y: BOTTOM, z: 0 });
      }
    }
  }
  return points;
}

function insideCup(point) {
  return point.y >= BOTTOM && point.y <= RIM.y
    && Math.hypot(point.x, point.z) <= cupInnerRadius(point.y);
}

function animateSurfacePositions(base, normal, segments, rings, time, amplitude, output = new Float32Array(base.length)) {
  for (let index = 0; index < base.length / 3; index += 1) {
    const fraction = index === 0 ? 0 : (1 + Math.floor((index - 1) / segments)) / rings;
    const x = base[index * 3]; const y = base[index * 3 + 1]; const z = base[index * 3 + 2];
    let wave = amplitude * (1 - fraction * fraction) ** 2
      * (Math.sin(x * 9 + time * 5.2) * 0.6 + Math.sin(z * 12 - time * 4.3) * 0.4);
    let displaced = { x: x + normal.x * wave, y: y + normal.y * wave, z: z + normal.z * wave };
    // A shallow residual film must not flicker through the ceramic as it waves.
    for (let i = 0; i < 8 && !insideCup(displaced); i += 1) {
      wave *= 0.5;
      displaced = { x: x + normal.x * wave, y: y + normal.y * wave, z: z + normal.z * wave };
    }
    if (!insideCup(displaced)) displaced = { x, y, z };
    output[index * 3] = displaced.x;
    output[index * 3 + 1] = displaced.y;
    output[index * 3 + 2] = displaced.z;
  }
  return output;
}

/**
 * A fixed-size triangle mesh. Boundary vertices meet the bowl exactly; the
 * interior gets small travelling capillary waves that die away at the wall.
 */
export function coffeeFreeSurface(normal, level, {
  segments = 48, rings = 8, time = 0, waveAmplitude = 0.007,
} = {}) {
  const count = Math.max(16, Math.floor(segments));
  const ringCount = Math.max(2, Math.floor(rings));
  const intersections = planeWallIntersections(normal, level, count);
  const positions = new Float32Array((1 + count * ringCount) * 3);
  const indices = new Uint16Array(count * (1 + (ringCount - 1) * 2) * 3);
  if (intersections.length < 3) return { positions, indices, normal, visible: false };

  const center = intersections.reduce((sum, point) => ({
    x: sum.x + point.x / intersections.length,
    y: sum.y + point.y / intersections.length,
    z: sum.z + point.z / intersections.length,
  }), { x: 0, y: 0, z: 0 });
  const u = normalized({ x: normal.y, y: -normal.x, z: 0 });
  const v = {
    x: normal.y * u.z - normal.z * u.y,
    y: normal.z * u.x - normal.x * u.z,
    z: normal.x * u.y - normal.y * u.x,
  };
  const boundary = [];
  for (let segment = 0; segment < count; segment += 1) {
    const phi = segment / count * TAU;
    const direction = {
      x: u.x * Math.cos(phi) + v.x * Math.sin(phi),
      y: u.y * Math.cos(phi) + v.y * Math.sin(phi),
      z: u.z * Math.cos(phi) + v.z * Math.sin(phi),
    };
    let low = 0; let high = 3.2;
    // Keep the inside endpoint: fewer iterations cannot push coffee into clay.
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const distance = (low + high) / 2;
      const point = { x: center.x + direction.x * distance, y: center.y + direction.y * distance, z: center.z + direction.z * distance };
      if (insideCup(point)) low = distance;
      else high = distance;
    }
    boundary.push({ x: direction.x * low, y: direction.y * low, z: direction.z * low });
  }
  function write(index, point) {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
  }
  write(0, center);
  for (let ring = 1; ring <= ringCount; ring += 1) {
    const fraction = ring / ringCount;
    for (let segment = 0; segment < count; segment += 1) {
      const edge = boundary[segment];
      write(1 + (ring - 1) * count + segment, {
        x: center.x + edge.x * fraction,
        y: center.y + edge.y * fraction,
        z: center.z + edge.z * fraction,
      });
    }
  }
  let cursor = 0;
  const triangle = (a, b, c) => { indices[cursor++] = a; indices[cursor++] = b; indices[cursor++] = c; };
  for (let segment = 0; segment < count; segment += 1) {
    const next = (segment + 1) % count;
    triangle(0, 1 + segment, 1 + next);
    for (let ring = 1; ring < ringCount; ring += 1) {
      const inner = 1 + (ring - 1) * count;
      const outer = inner + count;
      triangle(inner + segment, outer + segment, outer + next);
      triangle(inner + segment, outer + next, inner + next);
    }
  }
  if (waveAmplitude) animateSurfacePositions(positions, normal, count, ringCount, time, waveAmplitude, positions);
  return { positions, indices, normal, center, level, visible: true };
}

function noise(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function originAt(option, progress) {
  return (typeof option === 'function' ? option(progress) : option) || { x: 0, y: 0.10, z: 0 };
}

function rotated(point, angle, origin) {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle) + origin.x,
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle) + origin.y,
    z: point.z + origin.z,
  };
}

const EMISSION_COUNT = 44;
const EMISSIONS = Array.from({ length: EMISSION_COUNT }, (_, index) => {
  const at = 0.247 + index / (EMISSION_COUNT - 1) * 0.59 + (noise(index + 8) - 0.5) * 0.006;
  const before = retainedCoffeeVolume(Math.max(0, at - 0.007));
  const after = retainedCoffeeVolume(Math.min(1, at + 0.007));
  const angle = cupTiltAt(at);
  const phi = (noise(index + 4) - 0.5) * 0.34;
  const radius = 0.035 + noise(index + 70) * 0.048;
  // A detached bead leaves the outside of the rounded ceramic lip. Starting
  // at the inner water boundary would send it through the rim's thickness.
  const wetLipRadius = 1.015 + radius * 0.4;
  const relativeStart = rotated({ x: -wetLipRadius * Math.cos(phi), y: 1.50, z: wetLipRadius * Math.sin(phi) }, angle, { x: 0, y: 0, z: 0 });
  const step = 1 / COFFEE_TIMELINE_SECONDS / 120;
  const angularVelocity = (cupTiltAt(at + step) - cupTiltAt(at - step)) / (step * 2 * COFFEE_TIMELINE_SECONDS);
  const outwardSpeed = 0.18 + noise(index + 12) * 2.4;
  return {
    id: index, at, mass: Math.max(0.0001, before - after), seed: index + 1,
    radius,
    relativeStart,
    baseVelocity: {
      x: -relativeStart.y * angularVelocity - Math.cos(phi) * Math.cos(angle) * outwardSpeed,
      y: relativeStart.x * angularVelocity - Math.cos(phi) * Math.sin(angle) * outwardSpeed - 0.12,
      z: (noise(index + 29) - 0.5) * 2.6,
    },
    satellites: Array.from({ length: 3 }, (_, satellite) => {
      const direction = noise(index * 7 + satellite + 94) * TAU;
      const lateral = 1.2 + noise(index * 9 + satellite + 105) * 1.5;
      return {
        vx: Math.cos(direction) * lateral,
        vz: Math.sin(direction) * lateral,
        up: 1.45 + noise(index * 11 + satellite + 121) * 1.05,
        radiusFactor: 0.30 + noise(index + satellite + 136) * 0.18,
      };
    }),
  };
});

function emissionTrajectory(emission, { cupPosition, floorY }) {
  const { at, relativeStart, baseVelocity } = emission;
  const origin = originAt(cupPosition, at);
  const start = { x: relativeStart.x + origin.x, y: relativeStart.y + origin.y, z: relativeStart.z + origin.z };
  const step = 1 / COFFEE_TIMELINE_SECONDS / 120;
  const previous = originAt(cupPosition, Math.max(0, at - step));
  const next = originAt(cupPosition, Math.min(1, at + step));
  const dt = step * 2 * COFFEE_TIMELINE_SECONDS;
  // The moving lip contributes tangential velocity; discharged beads also
  // separate laterally. They never start with an artificial upward launch.
  const velocity = {
    x: (next.x - previous.x) / dt + baseVelocity.x,
    y: Math.min(-0.05, (next.y - previous.y) / dt + baseVelocity.y),
    z: (next.z - previous.z) / dt + baseVelocity.z,
  };
  const flight = Math.max(0, (velocity.y + Math.sqrt(velocity.y ** 2 + 2 * COFFEE_GRAVITY * Math.max(0, start.y - floorY))) / COFFEE_GRAVITY);
  const impactAt = at + flight / COFFEE_TIMELINE_SECONDS;
  const impact = {
    x: start.x + velocity.x * flight,
    y: floorY,
    z: start.z + velocity.z * flight,
  };
  return { ...emission, start, velocity, flight, impactAt, impact };
}

/** Individual ballistic beads and their much smaller post-impact satellites. */
export function coffeeDroplets(progress, { cupPosition, floorY = -2.2, includeSplashImpacts = false } = {}) {
  const p = clamp(progress, 0, 1);
  const drops = [];
  const impacts = [];
  const splashImpacts = [];
  for (const emission of EMISSIONS) {
    const event = emissionTrajectory(emission, { cupPosition, floorY });
    const { id, at, start, velocity, flight, impactAt, impact, radius, mass, seed } = event;
    impacts.push({ id, at: impactAt, ...impact, mass, radius, seed });
    if (includeSplashImpacts) {
      emission.satellites.forEach(({ vx, vz, up, radiusFactor }, satellite) => {
        const lifetime = up * 2 / COFFEE_GRAVITY;
        splashImpacts.push({
          id: `${id}-${satellite}`, parentId: id, secondary: true,
          at: impactAt + lifetime / COFFEE_TIMELINE_SECONDS,
          x: impact.x + vx * lifetime, y: floorY, z: impact.z + vz * lifetime,
          radius: radius * radiusFactor, mass: mass * radiusFactor ** 3,
          seed: seed + satellite * 0.37,
        });
      });
    }
    const age = (p - at) * COFFEE_TIMELINE_SECONDS;
    if (age < 0) continue;
    if (age <= flight) {
      const vy = velocity.y - COFFEE_GRAVITY * age;
      const speed = Math.hypot(velocity.x, vy, velocity.z);
      drops.push({
        id, x: start.x + velocity.x * age,
        y: start.y + velocity.y * age - 0.5 * COFFEE_GRAVITY * age * age,
        z: start.z + velocity.z * age,
        radius, stretch: 1 + Math.min(0.62, speed * 0.065),
        velocity: { x: velocity.x, y: vy, z: velocity.z },
        phase: 'falling', bornAt: at, impactAt, impact,
      });
    } else {
      const sinceImpact = age - flight;
      for (let satellite = 0; satellite < 3; satellite += 1) {
        const { vx, vz, up, radiusFactor } = emission.satellites[satellite];
        const lifetime = up * 2 / COFFEE_GRAVITY;
        if (sinceImpact > lifetime) continue;
        const vy = up - COFFEE_GRAVITY * sinceImpact;
        drops.push({
          id: `${id}-${satellite}`,
          x: impact.x + vx * sinceImpact,
          y: floorY + up * sinceImpact - 0.5 * COFFEE_GRAVITY * sinceImpact ** 2,
          z: impact.z + vz * sinceImpact,
          radius: radius * radiusFactor,
          stretch: 1 + Math.abs(vy) * 0.10,
          velocity: { x: vx, y: vy, z: vz },
          phase: 'splash', bornAt: impactAt, impactAt, impact,
        });
      }
    }
  }
  return { drops, impacts, splashImpacts };
}

/** A damped oscillator for inertial movement when the user changes scroll speed. */
export function createCoffeeSloshState() {
  return { angle: 0, angularVelocity: 0, x: 0, z: 0, velocityX: 0, velocityZ: 0, initialized: false };
}

export function updateCoffeeSlosh(state, angle, deltaSeconds, lateralAcceleration = 0) {
  const dt = clamp(deltaSeconds, 1 / 240, 1 / 20);
  if (!state.initialized) { state.angle = angle; state.initialized = true; return state; }
  const angularVelocity = (angle - state.angle) / dt;
  const acceleration = clamp((angularVelocity - state.angularVelocity) / dt, -12, 12);
  const steps = Math.ceil(dt * 120);
  const step = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    state.velocityX += (-64 * state.x - 8.8 * state.velocityX - acceleration * 0.075) * step;
    state.velocityZ += (-81 * state.z - 10 * state.velocityZ - lateralAcceleration * 0.06) * step;
    state.x = clamp(state.x + state.velocityX * step, -0.045, 0.045);
    state.z = clamp(state.z + state.velocityZ * step, -0.035, 0.035);
  }
  state.angle = angle;
  state.angularVelocity = angularVelocity;
  return state;
}

function sampleCoffeeFluidWithCache(progress, {
  segments = 48, rings = 8, slosh = 0, time = clamp(progress, 0, 1) * COFFEE_TIMELINE_SECONDS,
  cupPosition, floorY = -2.2, includeSplashImpacts = false,
} = {}, cache) {
  const p = clamp(progress, 0, 1);
  const angle = cupTiltAt(p);
  const slopeX = typeof slosh === 'number' ? slosh : slosh.x || 0;
  const slopeZ = typeof slosh === 'number' ? 0 : slosh.z || 0;
  const normal = normalized({
    x: Math.sin(angle) + Math.cos(angle) * slopeX,
    y: Math.cos(angle) - Math.sin(angle) * slopeX,
    z: slopeZ,
  });
  const volume = cache && cache.progress === p ? cache.volume : retainedCoffeeVolume(p);
  const samePlane = cache && cache.volume === volume && cache.normal?.x === normal.x
    && cache.normal?.y === normal.y && cache.normal?.z === normal.z
    && cache.segments === segments && cache.rings === rings;
  const visibleVolume = samePlane ? cache.visibleVolume : Math.min(volume,
    coffeeVolumeBelowPlane(normal, lowestRimLevel(normal)));
  const level = samePlane ? cache.level : planeLevelForVolume(normal, visibleVolume);
  const angularSpeed = typeof slosh === 'object' ? Math.abs(slosh.angularVelocity || 0) : 0;
  const amplitude = 0.0009 + Math.min(0.009,
    Math.abs(slopeX) * 0.17 + Math.abs(slopeZ) * 0.17 + Math.min(0.8, angularSpeed) * 0.003);
  let surface;
  if (cache) {
    const base = samePlane ? cache.base : coffeeFreeSurface(normal, level, { segments, rings, waveAmplitude: 0 });
    surface = {
      ...base,
      positions: base.visible ? animateSurfacePositions(base.positions, normal,
        Math.max(16, Math.floor(segments)), Math.max(2, Math.floor(rings)), time, amplitude) : base.positions,
    };
    Object.assign(cache, { progress: p, volume, normal, segments, rings, visibleVolume, level, base });
  } else {
    surface = coffeeFreeSurface(normal, level, { segments, rings, time, waveAmplitude: amplitude });
  }
  surface.visible = surface.visible && visibleVolume > CUP_CAPACITY * 0.0003;
  const rim = rotated({ x: -RIM.radius, y: RIM.y, z: 0 }, angle, originAt(cupPosition, p));
  return {
    angle, remainingFraction: volume / CUP_CAPACITY, volume, level,
    surface, rim, ...coffeeDroplets(p, { cupPosition, floorY, includeSplashImpacts }),
  };
}

/** Stateless sampling is useful for deterministic scrubbing and verification. */
export function sampleCoffeeFluid(progress, options = {}) {
  return sampleCoffeeFluidWithCache(progress, options);
}

/**
 * One sampler per scene reuses the clipped plane while its pose is unchanged.
 * Time, cup motion, drop trajectories and options are still sampled each call;
 * returned position buffers remain independent, so callers can retain a frame.
 */
export function createCoffeeFluidSampler() {
  const cache = {};
  return (progress, options = {}) => sampleCoffeeFluidWithCache(progress, options, cache);
}
