// A deterministic free position keeps repeated additions valid under the API's
// minimum six-percentage-point spacing rule. The API remains authoritative.
export function nextTablePosition(tables, area) {
  const active = tables.filter(table => table.area === area && table.isActive !== false);
  for (let y = 10; y <= 90; y += 8) {
    for (let x = 10; x <= 90; x += 8) {
      if (active.every(table => (table.x - x) ** 2 + (table.y - y) ** 2 >= 36)) return { x, y };
    }
  }
  // Existing custom placements can leave gaps outside the initial grid.
  for (let y = 5; y <= 95; y += 6) {
    for (let x = 5; x <= 95; x += 6) {
      if (active.every(table => (table.x - x) ** 2 + (table.y - y) ** 2 >= 36)) return { x, y };
    }
  }
  return null;
}
