const TAU = Math.PI * 2;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const outlines = new WeakMap();

function impactOutline(impact, seed, segments) {
  const cached = outlines.get(impact);
  if (cached?.seed === seed && cached.segments === segments) return cached.factors;
  // Each projected landing survives until resize/disposal. Its angular shape
  // stays fixed, so avoid repeating thousands of trig operations every frame.
  const factors = new Float64Array(segments * 4);
  for (let i = 0; i < segments; i += 1) {
    const angle = i / segments * TAU;
    const sine = Math.sin(angle);
    const edge = 1 + 0.09 * Math.sin(angle * 3 + seed)
      + 0.035 * Math.cos(angle * 5 - seed * 0.7)
      + 0.012 * Math.sin(angle * 7 + seed * 0.3);
    const fingers = Math.max(0, sine)
      * (0.08 + 0.10 * (0.5 + 0.5 * Math.sin(angle * 5 + seed)) ** 2);
    factors[i * 4] = Math.cos(angle) * edge;
    factors[i * 4 + 1] = sine * edge;
    factors[i * 4 + 2] = sine * fingers;
    factors[i * 4 + 3] = sine;
  }
  outlines.set(impact, { seed, segments, factors });
  return factors;
}

function validImpact(impact) {
  return Number.isFinite(impact?.at) && Number.isFinite(impact?.x)
    && (Number.isFinite(impact?.screenY) || Number.isFinite(impact?.pageY));
}

/** Small footprint at the physical landing point; page coordinates are a fallback. */
export function coffeeWetPatch(width, height, progress, impact, pageTop = 0) {
  const age = progress - impact.at;
  if (age <= 0 || !validImpact(impact)) return null;
  const seed = Number.isFinite(impact.seed) ? impact.seed : Number(impact.id) || 1;
  const scale = Math.min(width, height);
  const mass = clamp(Math.cbrt(Math.max(0, impact.mass || 0.003)) / 0.20, 0.55, 1.6);
  const contact = smooth(age / 0.018);
  // Contact spreads quickly, then slows. Broad coalescence is delayed until the
  // viewer has seen the individual drops open their own small parts of the page.
  const spreading = Math.sqrt(clamp(age / 0.37));
  const merging = smooth((progress - 0.64) / 0.28);
  const secondaryScale = impact.secondary ? 0.24 : 1;
  const radius = contact * secondaryScale * ((2.5 + scale * 0.008) * mass
    + scale * 0.067 * spreading + width * 0.067 * merging);
  const down = 1 + spreading * 0.44 + merging * 0.5;
  const x = impact.x * width;
  const y = Number.isFinite(impact.screenY) ? impact.screenY * height : pageTop + impact.pageY * height;
  // A first impact near the entering page's edge spreads along that edge. Keep
  // the upper meniscus curved instead of cutting a large flat cap off the pool.
  const upward = Math.min(0.68, Math.max(0.025,
    (y - pageTop - height * 0.003) / Math.max(1, radius * 1.16)));
  const points = [];
  const segments = width <= 760 ? (impact.secondary ? 12 : 28) : (impact.secondary ? 24 : 56);
  const factors = impactOutline(impact, seed, segments);
  for (let i = 0; i < segments; i += 1) {
    const offset = i * 4;
    points.push({
      x: x + radius * factors[offset],
      y: y + radius * (factors[offset + 3] > 0
        ? down * (factors[offset + 1] + spreading * factors[offset + 2])
        : upward * factors[offset + 1]),
    });
  }
  return { x, y, radius, points, age, seed };
}

/**
 * The joined wet film is fed by actual impact locations. Each column has its
 * own arrival time, set by lateral travel from the nearest impact. Its leading
 * edge travels down before the remaining liquid fills the space behind it.
 * This is deliberately a surface approximation rather than a fluid solver.
 */
export function coffeeWetFront(width, height, progress, impacts, pageTop = 0) {
  const active = impacts.filter(impact => validImpact(impact) && !impact.secondary && impact.at < progress);
  if (progress <= 0.68 || !active.length) return null;
  const top = [];
  const bottom = [];
  const columns = width <= 760 ? 32 : 80;
  const edgeBleed = width * 0.035;
  for (let i = 0; i <= columns; i += 1) {
    const across = i / columns;
    const x = across * (width + edgeBleed * 2) - edgeBleed;
    let distance = Infinity;
    let weightedY = 0;
    let totalWeight = 0;
    for (const impact of active) {
      const d = Math.abs(x - impact.x * width);
      const mature = smooth((progress - impact.at) / 0.055);
      distance = Math.min(distance, d + width * (1 - mature) / Math.max(1e-6, mature));
      const weight = mature / (d / width + 0.06) ** 2;
      const landingY = Number.isFinite(impact.screenY)
        ? impact.screenY : pageTop / height + clamp(impact.pageY, 0.02, 0.92);
      weightedY += landingY * weight;
      totalWeight += weight;
    }
    const arrival = 0.68 + clamp(distance / width) * 0.12;
    const t = smooth((progress - arrival) / (0.988 - arrival));
    const origin = weightedY / totalWeight * height;
    // Broad connected lobes, with much smaller capillary detail. Frequencies
    // live in normalized page coordinates so resizing cannot change the waves.
    const wave = Math.sin(across * TAU * 2.7 + 1.6) * 0.019
      + Math.sin(across * TAU * 5.3 + 4) * 0.006
      + Math.cos(across * TAU * 8.1 - 1.2) * 0.002;
    const irregularity = height * wave * Math.sin(t * Math.PI);
    const downstream = smooth(t / 0.84);
    // The cup fades from the scene as this late backfill opens the header.
    // Earlier waterlines stay at the physical floor while the page moves below.
    const upstream = smooth((progress - 0.84) / (0.988 - 0.84));
    top.push({ x, y: origin - (origin - pageTop + height * 0.08) * upstream + irregularity });
    bottom.push({ x, y: origin + (height - origin + height * 0.1) * downstream + irregularity * 2 });
  }
  return { top, bottom };
}

function contour(context, points, begin = true) {
  const last = points.at(-1);
  const first = points[0];
  if (begin) context.beginPath();
  context.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const next = points[(i + 1) % points.length];
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  context.closePath();
}

function frontPath(context, front, begin = true) {
  // Midpoint quadratic interpolation rounds every join and keeps the contour
  // inside its control polygon. Extra offscreen samples prevent rounded screen
  // corners from leaving opaque wedges at the native scroll handoff.
  contour(context, front.top.concat(front.bottom.slice().reverse()), begin);
}

/**
 * Paint the opaque introductory surface and cut its wet reveal apertures.
 * `ctx` uses CSS-pixel coordinates (the caller owns the DPR transform).
 * `impacts`: [{ id, at, x, screenY?, pageY?, mass, seed, secondary? }].
 * x and screenY are normalized viewport coordinates of the physical landing.
 * If screenY is omitted, pageY measures from the page top in viewport heights.
 * The real page can enter behind a fixed landing without lifting old holes.
 * Secondary splash beads open tiny local spots and do not drive the broad film.
 * The caller clears this canvas before each draw; the separate object layer draws the
 * ceramic, liquid and falling drops separately above this surface.
 */
export function drawCoffeeWetReveal(context, width, height, progress, {
  pageTop = 0, impacts = [],
} = {}) {
  if (!context || width <= 0 || height <= 0) return;
  const p = clamp(progress);
  context.save();
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
  // A fully transparent end frame makes the native document handoff exact.
  if (p >= 0.995) {
    context.clearRect(0, 0, width, height);
    context.restore();
    return;
  }
  const backdrop = context.createLinearGradient(0, 0, width * 0.8, height);
  backdrop.addColorStop(0, '#030609');
  backdrop.addColorStop(0.43, '#060b10');
  backdrop.addColorStop(1, '#020304');
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);

  context.beginPath();
  context.rect(0, Math.max(0, pageTop), width, Math.max(0, height - Math.max(0, pageTop)));
  context.clip();
  const patches = impacts.filter(validImpact)
    .map(impact => coffeeWetPatch(width, height, p, impact, pageTop)).filter(Boolean);
  const front = coffeeWetFront(width, height, p, impacts, pageTop);
  context.globalCompositeOperation = 'destination-out';
  context.fillStyle = '#000';
  context.beginPath();
  for (const patch of patches) {
    contour(context, patch.points, false);
  }
  if (front) frontPath(context, front, false);
  // One small feather over the joined path softens fresh fluid intersections.
  // Applying it once avoids a separate full-surface filter for every impact.
  if (patches.length || front) {
    context.filter = 'blur(1.15px)';
    context.fill();
    context.filter = 'none';
  }

  // A narrow, short-lived reflected edge, not a painted brown puddle. Old
  // outlines disappear as neighboring patches meet; never outline the film.
  context.globalCompositeOperation = 'source-over';
  context.lineWidth = 0.7;
  for (const patch of patches) {
    if (patch.age > 0.045 || p > 0.73) continue;
    contour(context, patch.points);
    context.strokeStyle = `rgba(191,151,105,${0.28 * (1 - patch.age / 0.045)})`;
    context.stroke();
  }
  context.restore();
}
