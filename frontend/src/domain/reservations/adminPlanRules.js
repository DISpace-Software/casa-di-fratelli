export function getTablesCapacity(tables, ids) {
  return [...new Set(ids)].reduce((sum, id) => sum + (tables.find(t => t.id === id)?.seats || 0), 0);
}
export function getAreaTablesCapacity(_area, ids, areaTables = []) {
  return getTablesCapacity(areaTables, ids);
}

// Same exact-set rule as FloorPlanService.Select. Partial selection is only a UI aid.
export function canUseAdminTableSelection(area, tableIds, { areaTables = [], combinations = [], requiredSeats = 0, allowPartial = true, maxTables = Infinity } = {}) {
  const ids = [...new Set(tableIds.filter(Boolean))];
  const active = areaTables.filter(t => t.isActive !== false && (!t.area || t.area === area));
  const activeIds = new Set(active.map(t => t.id));
  if (!ids.length || ids.some(id => !activeIds.has(id)) || ids.length > maxTables) return false;
  const candidates = [...active.map(t => [t.id]), ...combinations]
    .filter(group => group.length <= maxTables && group.every(id => activeIds.has(id)) && getTablesCapacity(active, group) >= requiredSeats);
  return candidates.some(group => ids.every(id => group.includes(id)) && (allowPartial || group.length === ids.length));
}

// A loaded plan is authoritative, including intentionally empty zones.
export function getActiveLayoutTables(items, area) {
  return (Array.isArray(items) ? items : []).filter(table => table && table.area === area && table.isActive !== false);
}
