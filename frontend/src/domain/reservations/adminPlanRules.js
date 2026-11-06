export function getTablesCapacity(tables, ids) {
  return [...new Set(ids)].reduce((sum, id) => sum + (tables.find(t => t.id === id)?.seats || 0), 0);
}
export function getAreaTablesCapacity(_area, ids, areaTables = []) {
  return getTablesCapacity(areaTables, ids);
}

// Staff combination policy is supplied by the restaurant plan. Public rules
// remain separate; capacity overrides never invent tables or cross zone borders.
export function canUseAdminTableSelection(area, tableIds, { areaTables = [], combinations = [], requiredSeats = 0, allowPartial = true, maxTables = Infinity, staffCombinationMode = "configured", allowCapacityOverride = false } = {}) {
  const ids = [...new Set(tableIds.filter(Boolean))];
  const active = areaTables.filter(t => t.isActive !== false && (!t.area || t.area === area));
  const activeIds = new Set(active.map(t => t.id));
  if (!ids.length || ids.some(id => !activeIds.has(id)) || ids.length > maxTables) return false;
  if (staffCombinationMode === "same-zone") {
    return allowCapacityOverride || getTablesCapacity(active, allowPartial ? [...activeIds] : ids) >= requiredSeats;
  }
  const candidates = [...active.map(t => [t.id]), ...combinations]
    .filter(group => group.length <= maxTables && group.every(id => activeIds.has(id)) && (allowCapacityOverride || getTablesCapacity(active, group) >= requiredSeats));
  return candidates.some(group => ids.every(id => group.includes(id)) && (allowPartial || group.length === ids.length));
}

// A loaded plan is authoritative, including intentionally empty zones.
export function getActiveLayoutTables(items, area) {
  return (Array.isArray(items) ? items : []).filter(table => table && table.area === area && table.isActive !== false);
}

export function getMoveCandidateOptions(area, guestCount, unavailableTableIds, areaTables = [], combinations = [], staffCombinationMode = "configured") {
  const requiredSeats = Number(guestCount || 0);
  const activeTables = areaTables.filter((table) => table.isActive !== false);
  const activeIds = new Set(activeTables.map((table) => table.id));
  const tableById = new Map(activeTables.map((table) => [table.id, table]));
  const seen = new Set();
  const candidates = [];
  const addCandidate = (ids) => {
    if (ids.some(id => !activeIds.has(id) || unavailableTableIds.has(id))) return;
    const tableIds = [...new Set(ids)];
    if (tableIds.length === 0) return;

    const key = tableIds.join("|");
    if (seen.has(key)) return;
    seen.add(key);

    const capacity = getAreaTablesCapacity(area, tableIds, activeTables);
    if (!canUseAdminTableSelection(area, tableIds, {
      areaTables: activeTables,
      combinations,
      staffCombinationMode,
      allowCapacityOverride: true,
      requiredSeats,
      allowPartial: false,
    })) {
      return;
    }

    candidates.push({
      tableIds,
      capacity,
      overage: capacity - requiredSeats,
      seatsLabel: tableIds.map((id) => tableById.get(id)?.seats || 0).join(" + "),
    });
  };

  activeTables.forEach((table) => addCandidate([table.id]));
  combinations.forEach(addCandidate);

  return candidates.sort((first, second) =>
    Number(first.overage < 0) - Number(second.overage < 0) ||
    Math.abs(first.overage) - Math.abs(second.overage) ||
    first.tableIds.length - second.tableIds.length ||
    first.tableIds.join(",").localeCompare(second.tableIds.join(","), undefined, { numeric: true })
  );
}
