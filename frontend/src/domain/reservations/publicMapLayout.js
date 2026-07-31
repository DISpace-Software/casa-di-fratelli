const MOBILE_OPEN_TERRACE_POINTS = Object.freeze({
  "63": { x: 22, y: 36 },
  "62": { x: 37, y: 36 },
  "61": { x: 52, y: 36 },
  "60": { x: 67, y: 36 },
  "51": { x: 72, y: 50 },
  "50": { x: 87, y: 50 },
  "53": { x: 72, y: 64 },
  "52": { x: 87, y: 64 },
  "64": { x: 27, y: 70 },
  "65": { x: 42, y: 70 },
});

export function getPublicMapTablePoints(table, area) {
  const desktop = { x: Number(table.x), y: Number(table.y) };

  if (area === "openTerrace" && MOBILE_OPEN_TERRACE_POINTS[table.id]) {
    return { desktop, mobile: MOBILE_OPEN_TERRACE_POINTS[table.id] };
  }

  if (area === "indoor" || area === "garden") {
    return {
      desktop,
      mobile: { x: Math.min(90, desktop.x + 7), y: desktop.y },
    };
  }

  return { desktop, mobile: desktop };
}
