export function resolveAdminMapViewMode(value, tenantId) {
  if (value === "section" || value === "scroll") return value;
  return tenantId === "cofein" ? "section" : "scroll";
}

// Camera changes must keep the current booking or move target in view.
export function sectionForAdminSelection(views, currentId, tableIds = []) {
  const selected = new Set(tableIds);
  const containsSelection = view => view.tableIds?.some(id => selected.has(id));
  const current = views.find(view => view.id === currentId);
  return (current && (!selected.size || containsSelection(current)) ? current : views.find(containsSelection))
    || current || views[0] || null;
}
