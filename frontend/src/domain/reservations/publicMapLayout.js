const MOBILE_OPEN_TERRACE_POINTS = Object.freeze({
  "63": { x: 24.25, y: 47 },
  "62": { x: 37.75, y: 47 },
  "61": { x: 51.25, y: 47 },
  "60": { x: 64.75, y: 47 },
  "51": { x: 79, y: 52 },
  "50": { x: 94, y: 52 },
  "53": { x: 79, y: 80 },
  "52": { x: 94, y: 80 },
  "64": { x: 27, y: 91 },
  "65": { x: 42, y: 91 },
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
