export function getZoneName(zone, language = "bg") {
  return zone?.names?.[language] || zone?.name || zone?.id || "";
}
