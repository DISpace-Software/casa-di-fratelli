export const clamp01 = value => Math.max(0, Math.min(1, value));
export const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };

/** All coordinates derive from the same cup pivot, including the pouring lip. */
export function coffeePose(width, height, progress) {
  const p = clamp01(progress);
  const tilt = smooth((p - 0.08) / 0.49);
  const departure = smooth((p - 0.74) / 0.16);
  const compact = width < 760;
  const initialSize = Math.min(620, width * (compact ? 0.84 : 0.43), height * 0.72);
  const size = initialSize * (1 - tilt * 0.10);
  const rotation = -tilt * 1.08;
  const x = width * 0.47 + initialSize * 0.43 * tilt;
  const y = height * (compact ? 0.55 : 0.60) - initialSize * 0.09 * tilt - departure * height * 0.23;
  const lipX = -0.308 * size;
  const lipY = -0.443 * size;
  return {
    size, initialSize, rotation, x, y, tilt,
    opacity: 1 - departure,
    lip: {
      x: x + lipX * Math.cos(rotation) - lipY * Math.sin(rotation),
      y: y + lipX * Math.sin(rotation) + lipY * Math.cos(rotation),
    },
    saucer: {
      x: width * 0.47 + tilt * initialSize * 0.39,
      y: height * (compact ? 0.55 : 0.60) + initialSize * 0.015 + tilt * initialSize * 0.20 - departure * height * 0.11,
      rotation: Math.sin(tilt * Math.PI * 2.1) * 0.10 + tilt * 0.14,
      size: initialSize * 1.16 * (1 - tilt * 0.22),
      opacity: (1 - departure) * (1 - smooth((p - 0.29) / 0.38)),
    },
  };
}

// Each new impact joins the previous pool; the final flood extends beyond all corners.
export const coffeeImpacts = [
  { at: 0.34, x: 0.43, y: 0.76, seed: 1 },
  { at: 0.40, x: 0.65, y: 0.69, seed: 3 },
  { at: 0.46, x: 0.28, y: 0.65, seed: 8 },
  { at: 0.52, x: 0.78, y: 0.46, seed: 4 },
  { at: 0.58, x: 0.47, y: 0.40, seed: 6 },
  { at: 0.63, x: 0.17, y: 0.40, seed: 9 },
  { at: 0.68, x: 0.64, y: 0.22, seed: 2 },
  { at: 0.73, x: 0.21, y: 0.17, seed: 7 },
];

export function poolRadius(width, height, progress, impact) {
  const growth = smooth((progress - impact.at) / 0.43);
  return Math.min(width, height) * 0.60 * growth;
}

export function floodRadius(width, height, progress) {
  return Math.hypot(width, height) * 1.10 * smooth((progress - 0.75) / 0.25);
}
