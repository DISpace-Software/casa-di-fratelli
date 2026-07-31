const MOBILE_OPEN_TERRACE_POINTS = Object.freeze({
  "63": { x: 18.275, y: 47 },
  "62": { x: 30.425, y: 47 },
  "61": { x: 42.575, y: 47 },
  "60": { x: 54.725, y: 47 },
  "51": { x: 79, y: 52 },
  "50": { x: 94, y: 52 },
  "53": { x: 79, y: 80 },
  "52": { x: 94, y: 80 },
  "64": { x: 19, y: 91 },
  "65": { x: 34, y: 91 },
});

const TABLET_OPEN_TERRACE_POINTS = Object.freeze({
  "46": { x: 34, y: 25 },
  "47": { x: 66, y: 25 },
  "48": { x: 34, y: 75 },
  "49": { x: 66, y: 75 },
  "50": { x: 90.4, y: 25 },
  "51": { x: 75.3, y: 25 },
  "52": { x: 89.7, y: 75 },
  "53": { x: 75.1, y: 75 },
  "60": { x: 54.2, y: 25 },
  "61": { x: 39.8, y: 25 },
  "62": { x: 25.1, y: 25 },
  "63": { x: 10.4, y: 25 },
  "64": { x: 12.2, y: 75 },
  "65": { x: 26.5, y: 75 },
});

export function getPublicMapTablePoints(table, area) {
  const desktop = { x: Number(table.x), y: Number(table.y) };
  const tablet =
    area === "openTerrace" && TABLET_OPEN_TERRACE_POINTS[table.id]
      ? TABLET_OPEN_TERRACE_POINTS[table.id]
      : desktop;

  if (area === "openTerrace" && MOBILE_OPEN_TERRACE_POINTS[table.id]) {
    return { desktop, tablet, mobile: MOBILE_OPEN_TERRACE_POINTS[table.id] };
  }

  if (area === "indoor" || area === "garden") {
    return {
      desktop,
      tablet,
      mobile: { x: Math.min(90, desktop.x + 7), y: desktop.y },
    };
  }

  return { desktop, tablet, mobile: desktop };
}
