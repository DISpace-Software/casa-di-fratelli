// bookingApi derives these options from the server's plan and availability.
// Index those exact options so the map never invents a group of tables.
export function getMapSelectionOptions(options, area) {
  const index = new Map();
  const ranked = options.filter(option => option.area === area).sort((a, b) =>
    a.tableIds.length - b.tableIds.length || a.seats - b.seats || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const option of ranked) {
    for (const tableId of option.tableIds) {
      if (!index.has(tableId)) index.set(tableId, []);
      index.get(tableId).push(option);
    }
  }
  return index;
}

export function getMapSelectionOption(index, tableId, selectedKey) {
  const options = index.get(tableId);
  return options?.find(option => option.key === selectedKey) || options?.[0];
}
