import { isRetiredTableId } from "./tableConfig.js";

// An explicitly configured area may intentionally have no bookable tables.
// Only an absent area (or a malformed response) uses the default layout.
export function getActiveLayoutTables(items, area, fallback = []) {
  const configured = Array.isArray(items)
    ? items.filter((item) => item && (item.area || item.Area) === area)
    : [];
  const source = configured.length ? configured : fallback;

  return source.map((item) => ({
    id: String(item.id || item.Id || "").trim(),
    area: item.area || item.Area || area,
    x: Number(item.x ?? item.X ?? 50),
    y: Number(item.y ?? item.Y ?? 50),
    seats: Number(item.seats ?? item.Seats ?? 4),
    special: Boolean(item.special ?? item.Special),
    wide: Boolean(item.wide ?? item.Wide),
    isActive: item.isActive ?? item.IsActive ?? true,
  })).filter((item) => item.id && item.isActive && !isRetiredTableId(item.id));
}
