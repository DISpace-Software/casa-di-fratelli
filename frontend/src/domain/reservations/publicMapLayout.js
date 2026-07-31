const MOBILE_OPEN_TERRACE_POINTS = Object.freeze({
  "63": { x: 17, y: 20 },
  "62": { x: 34, y: 20 },
  "61": { x: 51, y: 20 },
  "60": { x: 68, y: 20 },
  "51": { x: 68, y: 37 },
  "50": { x: 85, y: 37 },
  "53": { x: 68, y: 54 },
  "52": { x: 85, y: 54 },
  "64": { x: 17, y: 71 },
  "65": { x: 34, y: 71 },
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
