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
  const preset = zone => zone.presentation?.startsWith("casa-") && ADMIN_MAP_ZONES.find(item => item.id === zone.id);
  const hasCasa = zones.some(preset);
  let extraIndex = 0;
  const geometry = zones.map(zone => {
    const known = preset(zone);
    const index = known ? 0 : extraIndex++;
    return { ...zone, ...(known || {
      x: 80 + (index % 2) * 1070,
      y: (hasCasa ? 1320 : 70) + Math.floor(index / 2) * 720,
      width: 992, height: 650,
    }) };
  });
  return { zones: geometry, world: {
    width: ADMIN_MAP_WORLD.width,
    height: Math.max(hasCasa ? ADMIN_MAP_WORLD.height : 800, ...geometry.map(zone => zone.y + zone.height + 70)),
  } };
}
