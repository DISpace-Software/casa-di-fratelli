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
  "46": { x: 34, y: 34 },
  "47": { x: 66, y: 34 },
  "48": { x: 34, y: 72 },
  "49": { x: 66, y: 72 },
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
