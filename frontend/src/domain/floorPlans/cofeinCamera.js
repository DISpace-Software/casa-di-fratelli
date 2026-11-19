import { clamp, clampCamera } from '../adminMap/mapCamera.js';

/** A selected crop can be centred even when the complete floor fits one axis. */
export function clampCofeinCamera(camera, viewport, world, focusBounds, scoped = false, overscan = 32) {
  if (scoped) {
    const origin = { x: focusBounds.x * camera.scale, y: focusBounds.y * camera.scale };
    const local = clampCamera({ ...camera, x: camera.x + origin.x, y: camera.y + origin.y }, viewport, focusBounds, overscan);
    return { ...local, x: local.x - origin.x, y: local.y - origin.y };
  }
  const bounded = clampCamera(camera, viewport, world, overscan);
  // The editor may still pan around the whole floor. On an axis where it fits
  // entirely, permit both the world centre and the explicitly selected centre.
  for (const axis of ['x', 'y']) {
    const length = axis === 'x' ? 'width' : 'height';
    if (world[length] * camera.scale > viewport[length]) continue;
    const worldCenter = (viewport[length] - world[length] * camera.scale) / 2;
    const viewCenter = viewport[length] / 2 - (focusBounds[axis] + focusBounds[length] / 2) * camera.scale;
    bounded[axis] = clamp(camera[axis], Math.min(worldCenter, viewCenter) - overscan, Math.max(worldCenter, viewCenter) + overscan);
  }
  return bounded;
}
