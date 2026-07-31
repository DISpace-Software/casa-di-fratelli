export function shouldStartMapGesture({ pointerType, button, isInteractiveTarget }) {
  if (isInteractiveTarget) return false;
  return pointerType !== "mouse" || button === 0;
}

export function getMapModalPortalTarget(documentLike) {
  return documentLike?.fullscreenElement || documentLike?.body || null;
}
