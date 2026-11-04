export const ADMIN_MAP_CAMERA = Object.freeze({
  minScale: 0.35,
  maxScale: 3,
  zoomStep: 0.15,
  fitPadding: 42,
  panOverscan: 120,
  tapMoveThreshold: 8,
  tabletFocusScale: 0.98,
  persistCamera: true,
});

export const ADMIN_MAP_WORLD = Object.freeze({
  width: 2242,
  height: 1420,
});

export const ADMIN_MAP_ZONES = Object.freeze([
  { id: "indoor", x: 110, y: 70, width: 992, height: 650 },
  { id: "garden", x: 1140, y: 70, width: 992, height: 650 },
  { id: "openTerrace", x: 295.2, y: 760, width: 820, height: 440 },
]);

export function getAdminMapZone(area) {
  return ADMIN_MAP_ZONES.find((zone) => zone.id === area) || ADMIN_MAP_ZONES[0];
}

// Geometry is presentation only; booking rules never depend on coordinates or table numbers.
export function buildMapGeometry(zones) {
  const casa = zones.length === 3 && zones.every(z => z.presentation?.startsWith("casa-") && ADMIN_MAP_ZONES.some(preset => preset.id === z.id));
  const geometry = zones.map((zone, index) => ({
    ...zone,
    ...(casa ? ADMIN_MAP_ZONES.find(z => z.id === zone.id) : null),
    ...(!casa ? { x: 80 + (index % 2) * 1070, y: 70 + Math.floor(index / 2) * 720, width: 992, height: 650 } : {}),
  }));
  return { zones: geometry, world: casa ? ADMIN_MAP_WORLD : { width: 2242, height: Math.max(800, Math.ceil(zones.length / 2) * 720 + 70) } };
}
