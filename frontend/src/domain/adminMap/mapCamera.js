export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function screenToWorld(point, camera) {
  return {
    x: (point.x - camera.x) / camera.scale,
    y: (point.y - camera.y) / camera.scale,
  };
}

export function localPercentToWorld(zone, point) {
  return {
    x: zone.x + (point.x / 100) * zone.width,
    y: zone.y + (point.y / 100) * zone.height,
  };
}

export function zoomCameraAt(camera, point, nextScale, minScale, maxScale) {
  const scale = clamp(nextScale, minScale, maxScale);
  const worldPoint = screenToWorld(point, camera);
  return {
    x: point.x - worldPoint.x * scale,
    y: point.y - worldPoint.y * scale,
    scale,
  };
}

export function fitBounds(bounds, viewport, padding, minScale, maxScale) {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const scale = clamp(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
    minScale,
    maxScale
  );

  return {
    x: (viewport.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (viewport.height - bounds.height * scale) / 2 - bounds.y * scale,
    scale,
  };
}

export function clampCamera(camera, viewport, world, overscan = 0) {
  const scaledWidth = world.width * camera.scale;
  const scaledHeight = world.height * camera.scale;
  const minX = Math.min(overscan, viewport.width - scaledWidth - overscan);
  const maxX = Math.max(-overscan, (viewport.width - scaledWidth) / 2);
  const minY = Math.min(overscan, viewport.height - scaledHeight - overscan);
  const maxY = Math.max(-overscan, (viewport.height - scaledHeight) / 2);

  return {
    ...camera,
    x: clamp(camera.x, minX, maxX),
    y: clamp(camera.y, minY, maxY),
  };
}

export function preserveWorldCenter(camera, previousViewport, nextViewport) {
  const center = screenToWorld(
    { x: previousViewport.width / 2, y: previousViewport.height / 2 },
    camera
  );
  return {
    ...camera,
    x: nextViewport.width / 2 - center.x * camera.scale,
    y: nextViewport.height / 2 - center.y * camera.scale,
  };
}
