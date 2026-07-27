export const ADMIN_MAP_CAMERA = Object.freeze({
  minScale: 0.35,
  maxScale: 3,
  zoomStep: 0.15,
  fitPadding: 42,
  panOverscan: 120,
  tapMoveThreshold: 8,
  persistCamera: true,
});

export const ADMIN_MAP_WORLD = Object.freeze({
  width: 1900,
  height: 1420,
});

export const ADMIN_MAP_ZONES = Object.freeze([
  { id: "indoor", x: 70, y: 70, width: 980, height: 780 },
  { id: "garden", x: 1100, y: 70, width: 720, height: 780 },
  { id: "openTerrace", x: 500, y: 900, width: 820, height: 440 },
]);

export function getAdminMapZone(area) {
  return ADMIN_MAP_ZONES.find((zone) => zone.id === area) || ADMIN_MAP_ZONES[0];
}
