// Presentation geometry traced from Cofein's supplied plan (20260907_162344.jpg).
// Coordinates are not dimensions in metres. Booking rules and capacities come
// exclusively from the live floor-plan document; this module never creates tables.
export const COFEIN_MAP_WORLD = Object.freeze({ width: 900, height: 1600 });

const view = (id, label, x, y, width, height) => Object.freeze({ id, label, x, y, width, height });

export const COFEIN_MAP_VIEWS = Object.freeze({
  all: view("all", "Цялата карта", 0, 0, 900, 1600),
  exterior: view("exterior", "Външна зала", 35, 315, 555, 1270),
  interior: view("interior", "Вътрешна зала", 290, 35, 600, 1240),
  "exterior-upper": view("exterior-upper", "Външна зала · към градината", 35, 305, 390, 785),
  "exterior-lower": view("exterior-lower", "Външна зала · към улицата", 35, 1025, 555, 560),
  "interior-main": view("interior-main", "Вътрешна зала · основна част", 300, 35, 590, 875),
  "interior-angled": view("interior-angled", "Вътрешна зала · ъглова част", 315, 765, 520, 515),
});

// These are inverse transforms of the existing API's independent per-zone
// normalization, not hard-coded table centres. A saved x/y edit remains visible.
const transforms = Object.freeze({
  exterior: { minX: 1010, maxX: 1620, minY: 1200, maxY: 3340 },
  interior: { minX: 1560, maxX: 2155, minY: 1218, maxY: 2610 },
});

const transformFor = (id) => Object.hasOwn(transforms, id) ? transforms[id] : null;

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

export function projectCofeinTable(table, geometry) {
  if (geometry && !geometry.zones.some(zone => zone.id === table?.area)) return null;
  const transform = transformFor(table?.area);
  if (typeof table?.x !== "number" || typeof table?.y !== "number"
    || !Number.isFinite(table.x) || !Number.isFinite(table.y)) return null;
  if (!transform) {
    const zone = geometry?.zones.find(item => item.id === table.area);
    if (!zone) return null;
    const content = zone.content;
    return {
      x: content.x + (table.x - 5) / 90 * content.width,
      y: content.y + (table.y - 5) / 90 * content.height,
      width: table.wide ? 98 : 80, height: table.wide ? 98 : 78,
      rotation: 0, kind: table.wide ? "booth" : "square",
      fragmentId: zone.viewId, compact: false, openEnd: false,
    };
  }

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

const DETAIL_VIEWS = Object.freeze({
  exterior: ["exterior-upper", "exterior-lower"],
  interior: ["interior-main", "interior-angled"],
});
const VIEW_NAMES = {
  "exterior-upper": { bg: "Външна зала · към градината", en: "Exterior hall · garden side", ru: "Внешний зал · со стороны сада" },
  "exterior-lower": { bg: "Външна зала · към улицата", en: "Exterior hall · street side", ru: "Внешний зал · со стороны улицы" },
  "interior-main": { bg: "Вътрешна · основна", en: "Interior · main", ru: "Внутренний · основная" },
  "interior-angled": { bg: "Вътрешна · ъглова", en: "Interior · angled", ru: "Внутренний · угловая" },
};

// Zone IDs and camera view IDs are separate namespaces. A hall can be named
// "interior-main" without colliding with a preset detail view.
export const cofeinZoneViewId = (zoneId) => `zone:${zoneId}`;
export function cofeinViewLabel(view, language = "bg") {
  return view?.names?.[language] || view?.names?.bg || view?.label || "";
}

function annexDetailBounds(zone, tables, zones) {
  const placed = tables.filter(table => table.area === zone.id && table.isActive !== false)
    .map(table => projectCofeinTable(table, { zones })).filter(Boolean);
  if (!placed.length) return { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
  const left = Math.min(...placed.map(table => table.x - table.width / 2));
  const right = Math.max(...placed.map(table => table.x + table.width / 2));
  const top = Math.min(...placed.map(table => table.y - table.height / 2));
  const bottom = Math.max(...placed.map(table => table.y + table.height / 2));
  const width = Math.min(zone.width, Math.max(360, right - left + 140));
  const height = Math.min(zone.height, Math.max(400, bottom - top + 140));
  return {
    x: Math.max(zone.x, Math.min(zone.x + zone.width - width, (left + right - width) / 2)),
    y: Math.max(zone.y, Math.min(zone.y + zone.height - height, (top + bottom - height) / 2)),
    width, height,
  };
}

export function getCofeinMapGeometry(zones = [], tables = []) {
  const hasPreset = zones.some(zone => transformFor(zone.id));
  const extras = zones.filter(zone => !transformFor(zone.id));
  const extraBounds = new Map(extras.map((zone, index) => [zone.id, {
    x: (hasPreset ? 980 : 60) + (index % 2) * 1280,
    y: 60 + Math.floor(index / 2) * 1280, width: 1200, height: 1200,
  }]));
  const active = zones.filter(zone => zone.isActive !== false).map(zone => {
    const bounds = transformFor(zone.id) ? COFEIN_MAP_VIEWS[zone.id] : extraBounds.get(zone.id);
    return { ...zone, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      viewId: cofeinZoneViewId(zone.id), preset: Boolean(transformFor(zone.id)),
      content: transformFor(zone.id) ? null : {
        x: bounds.x + 70, y: bounds.y + 110,
        width: bounds.width - 140, height: bounds.height - 180,
      },
    };
  });
  const annexes = active.filter(zone => !zone.preset);
  const world = annexes.length ? {
    width: Math.max(hasPreset ? COFEIN_MAP_WORLD.width : 0, ...annexes.map(zone => zone.x + zone.width + 60)),
    height: Math.max(hasPreset ? COFEIN_MAP_WORLD.height : 0, ...annexes.map(zone => zone.y + zone.height + 60)),
  } : COFEIN_MAP_WORLD;
  const views = { all: { id: "all", x: 0, y: 0, ...world, label: "Цялата карта", names: { bg: "Цялата карта", en: "Whole map", ru: "Вся карта" } } };
  const detailViews = ["all"];
  for (const zone of active) {
    const bounds = zone.preset ? zone : annexDetailBounds(zone, tables, active);
    views[zone.viewId] = { id: zone.viewId, zoneId: zone.id, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, label: zone.name, names: zone.names };
    if (zone.preset) {
      // Keep legacy known-zone camera IDs for saved callers, while explicit
      // zoneId drives filters instead of guessing from a string prefix.
      views[zone.id] = views[zone.viewId];
      for (const id of DETAIL_VIEWS[zone.id]) {
        views[id] = { ...COFEIN_MAP_VIEWS[id], zoneId: zone.id, names: VIEW_NAMES[id] };
        detailViews.push(id);
      }
    } else detailViews.push(zone.viewId);
  }
  return { world, zones: active, views, detailViews, hasPreset, minScale: Math.min(0.12, 200 / Math.max(world.width, world.height)) };
}

const BOOKING_VIEW_NAMES = Object.freeze({
  "exterior-upper": { bg: "Към градината", en: "Garden side", ru: "Со стороны сада" },
  "exterior-lower": { bg: "Към улицата", en: "Street side", ru: "Со стороны улицы" },
  "interior-main": { bg: "Основна част", en: "Main part", ru: "Основная часть" },
  "interior-angled": { bg: "Ъглова част", en: "Corner part", ru: "Угловая часть" },
});

/** Camera crops are presentation, not new business halls or booking rules.
 * Every placement stays in the original world; availability never changes a
 * crop. Only active furniture in this API hall determines its visible parts. */
export function getCofeinBookingViews(geometry, zoneId, tables = []) {
  const zone = geometry.zones.find(item => item.id === zoneId);
  if (!zone) return [];
  const placed = tables.filter(table => table.area === zoneId && table.isActive !== false)
    .map(table => ({ table, placement: projectCofeinTable(table, geometry) })).filter(item => item.placement);
  const ids = Object.hasOwn(DETAIL_VIEWS, zoneId) ? DETAIL_VIEWS[zoneId] : [zone.viewId];
  return ids.flatMap(id => {
    const furniture = placed.filter(item => item.placement.fragmentId === id);
    if (!furniture.length) return [];
    const left = Math.min(...furniture.map(({ placement: p }) => p.x - p.width / 2));
    const right = Math.max(...furniture.map(({ placement: p }) => p.x + p.width / 2));
    const top = Math.min(...furniture.map(({ placement: p }) => p.y - p.height / 2));
    const bottom = Math.max(...furniture.map(({ placement: p }) => p.y + p.height / 2));
    // Keep nearby walls/glazing readable without fitting unrelated kitchens or
    // other halls. Sparse configured halls receive the same comfortable scale.
    const width = Math.min(geometry.world.width, Math.max(300, right - left + 112));
    const height = Math.min(geometry.world.height, Math.max(320, bottom - top + 112));
    const names = BOOKING_VIEW_NAMES[id] || zone.names;
    return [{ ...geometry.views[id], id, zoneId, names, label: names?.bg || zone.name,
      x: Math.max(0, Math.min(geometry.world.width - width, (left + right - width) / 2)),
      y: Math.max(0, Math.min(geometry.world.height - height, (top + bottom - height) / 2)),
      width, height, tableIds: furniture.map(({ table }) => table.id),
    }];
  });
}

export function unprojectCofeinPoint(area, point, geometry) {
  if (geometry && !geometry.zones.some(zone => zone.id === area)) return null;
  const transform = transformFor(area);
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
  // Match FloorPlanService's accepted coordinate range so pointer/keyboard
  // editing cannot produce a document the server necessarily rejects.
  const bound = (number) => Math.min(95, Math.max(5, number));
  if (!transform) {
    const content = geometry?.zones.find(zone => zone.id === area)?.content;
    if (!content) return null;
    return { x: bound(5 + (point.x - content.x) / content.width * 90), y: bound(5 + (point.y - content.y) / content.height * 90) };
  }
  return {
    x: bound(5 + (((point.x * 2 + 740) - transform.minX) / (transform.maxX - transform.minX)) * 90),
    y: bound(5 + (((point.y * 2 + 350) - transform.minY) / (transform.maxY - transform.minY)) * 90),
  };
}
