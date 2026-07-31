export function shouldStartMapGesture({ pointerType, button, isInteractiveTarget }) {
  if (isInteractiveTarget) return false;
  return pointerType !== "mouse" || button === 0;
}
