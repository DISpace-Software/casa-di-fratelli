// Presentation geometry traced from Cofein's supplied plan (20260907_162344.jpg).
// Coordinates are not dimensions in metres. Booking rules and capacities come
// exclusively from the live floor-plan document; this module never creates tables.
export const COFEIN_MAP_WORLD = Object.freeze({ width: 900, height: 1600 });

const view = (id, label, x, y, width, height) => Object.freeze({ id, label, x, y, width, height });

export const COFEIN_MAP_VIEWS = Object.freeze({
  all: view("all", "Цялата карта", 0, 0, 900, 1600),
  exterior: view("exterior", "Външна зала", 35, 315, 555, 1270),
  interior: view("interior", "Вътрешна зала", 290, 35, 600, 1240),
  "exterior-upper": view("exterior-upper", "Външна зала · горна част", 35, 305, 390, 785),
  "exterior-lower": view("exterior-lower", "Външна зала · долна част", 35, 1025, 555, 560),
  "interior-main": view("interior-main", "Вътрешна зала · основна част", 300, 35, 590, 875),
  "interior-angled": view("interior-angled", "Вътрешна зала · ъглова част", 315, 765, 520, 515),
});

// These are inverse transforms of the existing API's independent per-zone
// normalization, not hard-coded table centres. A saved x/y edit remains visible.
const transforms = Object.freeze({
  exterior: { minX: 1010, maxX: 1620, minY: 1200, maxY: 3340 },
  interior: { minX: 1560, maxX: 2155, minY: 1218, maxY: 2610 },
});

const kinds = new Map();
for (let n = 1; n <= 12; n += 1) kinds.set(`T${String(n).padStart(2, "0")}`, "paired");
for (let n = 13; n <= 14; n += 1) kinds.set(`T${n}`, "square");
for (let n = 15; n <= 22; n += 1) kinds.set(`T${n}`, "booth");
for (let n = 23; n <= 26; n += 1) kinds.set(`T${n}`, "u-booth");
for (let n = 1; n <= 3; n += 1) kinds.set(`F0${n}`, "booth");
kinds.set("F04", "square");

function fragmentFor(area, rawY) {
  if (area === "exterior") return rawY >= 2460 ? "exterior-lower" : "exterior-upper";
  return rawY >= 2050 ? "interior-angled" : "interior-main";
}

export function projectCofeinTable(table) {
  const transform = transforms[table?.area];
  if (!transform || typeof table.x !== "number" || typeof table.y !== "number"
    || !Number.isFinite(table.x) || !Number.isFinite(table.y)) return null;

  const rawX = transform.minX + ((table.x - 5) / 90) * (transform.maxX - transform.minX);
  const rawY = transform.minY + ((table.y - 5) / 90) * (transform.maxY - transform.minY);
  const id = String(table.id || "").toUpperCase();
  const kind = kinds.get(id) || (table.wide ? "booth" : "square");
  const rotation = /^F0[1-3]$/.test(id) || /^T2[3-6]$/.test(id) ? 45 : 0;
  const small = id === "F04";
  const dimensions = small ? { width: 48, height: 48 }
    : rotation ? { width: 112, height: 112 }
      : kind === "booth" ? { width: 78, height: 98 }
        : { width: 80, height: 78 };

  return {
    x: (rawX - 740) / 2,
    y: (rawY - 350) / 2,
    ...dimensions,
    rotation,
    kind,
    fragmentId: fragmentFor(table.area, rawY),
    compact: small,
    // The last booth terminates at F04; the source does not show another
    // full-width lower banquette between these two table positions.
    openEnd: id === "T18",
  };
}

export function getCofeinMapGeometry(zones = []) {
  return {
    world: COFEIN_MAP_WORLD,
    zones: zones.filter((zone) => transforms[zone.id]).map((zone) => ({
      ...zone,
      ...COFEIN_MAP_VIEWS[zone.id],
      // Preserve the live localized name and presentation metadata.
      name: zone.name,
    })),
  };
}

export function unprojectCofeinPoint(area, point) {
  const transform = transforms[area];
  if (!transform || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
  // Match FloorPlanService's accepted coordinate range so pointer/keyboard
  // editing cannot produce a document the server necessarily rejects.
  const bound = (number) => Math.min(95, Math.max(5, number));
  return {
    x: bound(5 + (((point.x * 2 + 740) - transform.minX) / (transform.maxX - transform.minX)) * 90),
    y: bound(5 + (((point.y * 2 + 350) - transform.minY) / (transform.maxY - transform.minY)) * 90),
  };
}
