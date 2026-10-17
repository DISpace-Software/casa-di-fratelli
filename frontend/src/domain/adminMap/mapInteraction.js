export function shouldStartMapGesture({ pointerType, button, isInteractiveTarget }) {
  if (isInteractiveTarget) return false;
  return pointerType !== "mouse" || button === 0;
}

export function getMapPopoverAlignment(centerPercent) {
  if (Number(centerPercent) < 28) return "start";
  if (Number(centerPercent) > 72) return "end";
  return "center";
}

export function isTabletMapViewport({ width, height }, navigatorLike) {
  const shortestSide = Math.min(Number(width || 0), Number(height || 0));
  return Number(navigatorLike?.maxTouchPoints || 0) > 0 && shortestSide >= 600;
}

export function getMapModalPortalTarget(documentLike) {
  if (!documentLike) return null;

  // iPadOS does not reliably support the native Fullscreen API. The map uses
  // a modal <dialog> there, which lives in the browser's top layer. Portaling
  // into document.body would leave the walk-in/consumption modal behind that
  // dialog, regardless of its z-index.
  const modalMapShell = documentLike.querySelector?.(
    "dialog[data-admin-reservation-map-shell='true'][open]"
  );

  return documentLike.fullscreenElement || modalMapShell || documentLike.body || null;
}

export function shouldUseNativeMapFullscreen(navigatorLike) {
  const userAgent = navigatorLike?.userAgent || "";
  const platform = navigatorLike?.platform || "";
  const maxTouchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  const isAppleTouchDevice = /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === "MacIntel" && maxTouchPoints > 1);

  return !isAppleTouchDevice;
}

export function getMapOverlayViewport(windowLike) {
  const viewport = windowLike?.visualViewport;
  return {
    left: Math.max(0, Number(viewport?.offsetLeft || 0)),
    top: Math.max(0, Number(viewport?.offsetTop || 0)),
    width: Math.max(1, Number(viewport?.width || windowLike?.innerWidth || 1)),
    height: Math.max(1, Number(viewport?.height || windowLike?.innerHeight || 1)),
  };
}
