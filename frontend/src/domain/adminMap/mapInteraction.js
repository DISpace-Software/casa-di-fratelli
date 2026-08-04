export function shouldStartMapGesture({ pointerType, button, isInteractiveTarget }) {
  if (isInteractiveTarget) return false;
  return pointerType !== "mouse" || button === 0;
}

export function getMapModalPortalTarget(documentLike) {
  return documentLike?.fullscreenElement || documentLike?.body || null;
}

export function shouldUseNativeMapFullscreen(navigatorLike) {
  const userAgent = navigatorLike?.userAgent || "";
  const platform = navigatorLike?.platform || "";
  const maxTouchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  const isAppleTouchDevice = /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === "MacIntel" && maxTouchPoints > 1);

  return !isAppleTouchDevice;
}
