import React from "react";
import {
  ADMIN_MAP_CAMERA,
  ADMIN_MAP_WORLD,
  getAdminMapZone,
} from "../../domain/adminMap/mapConfig";
import {
  clampCamera,
  preserveWorldCenter,
  zoomCameraAt,
} from "../../domain/adminMap/mapCamera";

const CAMERA_STORAGE_KEY = "casa-admin-unified-map-camera";

function readSavedCamera() {
  if (!ADMIN_MAP_CAMERA.persistCamera || typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(CAMERA_STORAGE_KEY) || "null");
    return Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.scale)
      ? value
      : null;
  } catch {
    return null;
  }
}

export default function UnifiedMapViewport({
  children,
  zones,
  activeZone,
  onZoneChange,
  language = "bg",
}) {
  const viewportRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const [initialCamera] = React.useState(() => readSavedCamera() || { x: 0, y: 0, scale: 1 });
  const cameraRef = React.useRef(initialCamera);
  const viewportSizeRef = React.useRef({ width: 1, height: 1 });
  const pointersRef = React.useRef(new Map());
  const gestureRef = React.useRef(null);
  const animationRef = React.useRef(0);
  const wheelEndTimerRef = React.useRef(0);
  const movedRef = React.useRef(false);
  const initializedRef = React.useRef(false);
  const [scaleLabel, setScaleLabel] = React.useState(initialCamera.scale);

  const applyCamera = React.useCallback((nextCamera, { animate = false, persist = true } = {}) => {
    const camera = clampCamera(
      { ...nextCamera, scale: Math.min(ADMIN_MAP_CAMERA.maxScale, Math.max(ADMIN_MAP_CAMERA.minScale, nextCamera.scale)) },
      viewportSizeRef.current,
      ADMIN_MAP_WORLD,
      ADMIN_MAP_CAMERA.panOverscan
    );
    cameraRef.current = camera;
    if (worldRef.current) {
      worldRef.current.style.transition = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "transform 260ms cubic-bezier(.22,.8,.3,1)"
        : "none";
      worldRef.current.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
    }
    if (animate || persist) setScaleLabel(camera.scale);
    if (persist && ADMIN_MAP_CAMERA.persistCamera) {
      window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(camera));
    }
  }, []);

  const fitToBounds = React.useCallback((bounds, animate = true) => {
    const viewport = viewportSizeRef.current;
    const padding = viewport.width < 640 ? 22 : ADMIN_MAP_CAMERA.fitPadding;
    const availableWidth = Math.max(1, viewport.width - padding * 2);
    const availableHeight = Math.max(1, viewport.height - padding * 2);
    const scale = Math.min(
      ADMIN_MAP_CAMERA.maxScale,
      Math.max(ADMIN_MAP_CAMERA.minScale, Math.min(availableWidth / bounds.width, availableHeight / bounds.height))
    );
    applyCamera({
      x: (viewport.width - bounds.width * scale) / 2 - bounds.x * scale,
      y: (viewport.height - bounds.height * scale) / 2 - bounds.y * scale,
      scale,
    }, { animate });
  }, [applyCamera]);

  const fitToMap = React.useCallback((animate = true) => {
    fitToBounds({ x: 0, y: 0, width: ADMIN_MAP_WORLD.width, height: ADMIN_MAP_WORLD.height }, animate);
  }, [fitToBounds]);

  const focusZone = React.useCallback((zoneId) => {
    const zone = getAdminMapZone(zoneId);
    onZoneChange?.(zone.id);
    fitToBounds(zone, true);
  }, [fitToBounds, onZoneChange]);

  const zoomAtCenter = React.useCallback((direction) => {
    const viewport = viewportSizeRef.current;
    applyCamera(zoomCameraAt(
      cameraRef.current,
      { x: viewport.width / 2, y: viewport.height / 2 },
      cameraRef.current.scale + direction * ADMIN_MAP_CAMERA.zoomStep,
      ADMIN_MAP_CAMERA.minScale,
      ADMIN_MAP_CAMERA.maxScale
    ), { animate: true });
  }, [applyCamera]);

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      const previous = viewportSizeRef.current;
      viewportSizeRef.current = next;
      if (!initializedRef.current) {
        initializedRef.current = true;
        if (readSavedCamera()) applyCamera(cameraRef.current, { persist: false });
        else fitToMap(false);
      } else {
        applyCamera(preserveWorldCenter(cameraRef.current, previous, next), { persist: false });
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [applyCamera, fitToMap]);

  React.useEffect(() => () => {
    window.cancelAnimationFrame(animationRef.current);
    window.clearTimeout(wheelEndTimerRef.current);
  }, []);

  const scheduleCamera = (camera) => {
    cameraRef.current = camera;
    window.cancelAnimationFrame(animationRef.current);
    animationRef.current = window.requestAnimationFrame(() => applyCamera(camera, { persist: false }));
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const viewport = viewportRef.current;
    viewport.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    movedRef.current = false;

    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = {
        type: "pan",
        point: points[0],
        camera: { ...cameraRef.current },
      };
    } else if (points.length === 2) {
      const [a, b] = points;
      gestureRef.current = {
        type: "pinch",
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        camera: { ...cameraRef.current },
      };
    }
  };

  const handlePointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (points.length === 1 && gesture.type === "pan") {
      const dx = points[0].x - gesture.point.x;
      const dy = points[0].y - gesture.point.y;
      if (Math.hypot(dx, dy) > ADMIN_MAP_CAMERA.tapMoveThreshold) movedRef.current = true;
      scheduleCamera({ ...gesture.camera, x: gesture.camera.x + dx, y: gesture.camera.y + dy });
    } else if (points.length >= 2) {
      const [a, b] = points;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const base = gesture.type === "pinch" ? gesture : {
        distance,
        center,
        camera: { ...cameraRef.current },
      };
      movedRef.current = true;
      const rect = viewportRef.current.getBoundingClientRect();
      scheduleCamera(zoomCameraAt(
        base.camera,
        { x: center.x - rect.left, y: center.y - rect.top },
        base.camera.scale * (distance / Math.max(1, base.distance)),
        ADMIN_MAP_CAMERA.minScale,
        ADMIN_MAP_CAMERA.maxScale
      ));
    }
  };

  const finishPointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      applyCamera(cameraRef.current);
      return;
    }
    const point = [...pointersRef.current.values()][0];
    gestureRef.current = { type: "pan", point, camera: { ...cameraRef.current } };
  };

  const handleWheel = (event) => {
    event.preventDefault();
    const isTrackpadPan =
      !event.ctrlKey &&
      !event.metaKey &&
      (Math.abs(event.deltaX) > 0 || (event.deltaMode === 0 && Math.abs(event.deltaY) < 50));

    if (isTrackpadPan) {
      scheduleCamera({
        ...cameraRef.current,
        x: cameraRef.current.x - event.deltaX,
        y: cameraRef.current.y - event.deltaY,
      });
    } else {
    const rect = viewportRef.current.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0015);
      scheduleCamera(zoomCameraAt(
      cameraRef.current,
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      cameraRef.current.scale * factor,
      ADMIN_MAP_CAMERA.minScale,
      ADMIN_MAP_CAMERA.maxScale
      ));
    }

    window.clearTimeout(wheelEndTimerRef.current);
    wheelEndTimerRef.current = window.setTimeout(() => applyCamera(cameraRef.current), 120);
  };

  const labels = language === "bg"
    ? { in: "Увеличи", out: "Намали", fit: "Покажи цялата карта", reset: "Начален изглед", zone: "Премини към зона" }
    : { in: "Zoom in", out: "Zoom out", fit: "Fit to map", reset: "Reset view", zone: "Jump to zone" };

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={activeZone}
          onChange={(event) => focusZone(event.target.value)}
          aria-label={labels.zone}
          title={labels.zone}
          className="min-h-[44px] min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-[#fff4df] outline-none sm:max-w-[280px]"
        >
          {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => zoomAtCenter(-1)} aria-label={labels.out} title={labels.out} className="ghost-button h-11 w-11 rounded-xl text-xl">−</button>
          <span className="hidden min-w-[58px] text-center text-xs font-semibold text-white/50 sm:block">{Math.round(scaleLabel * 100)}%</span>
          <button type="button" onClick={() => zoomAtCenter(1)} aria-label={labels.in} title={labels.in} className="ghost-button h-11 w-11 rounded-xl text-xl">+</button>
          <button type="button" onClick={() => fitToMap(true)} aria-label={labels.fit} title={labels.fit} className="ghost-button min-h-[44px] rounded-xl px-3 text-xs font-semibold">Fit</button>
          <button type="button" onClick={() => { window.localStorage.removeItem(CAMERA_STORAGE_KEY); fitToMap(true); }} aria-label={labels.reset} title={labels.reset} className="ghost-button hidden min-h-[44px] rounded-xl px-3 text-xs font-semibold sm:block">Reset</button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="admin-unified-map-viewport relative h-[clamp(560px,72vh,920px)] min-w-0 overflow-hidden rounded-[26px] border border-white/10 bg-[#0d0b09] shadow-inner shadow-black/60"
        style={{ touchAction: "none", overscrollBehavior: "contain", userSelect: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onWheel={handleWheel}
        onDoubleClick={(event) => {
          const rect = viewportRef.current.getBoundingClientRect();
          applyCamera(zoomCameraAt(
            cameraRef.current,
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            cameraRef.current.scale + ADMIN_MAP_CAMERA.zoomStep * 2,
            ADMIN_MAP_CAMERA.minScale,
            ADMIN_MAP_CAMERA.maxScale
          ), { animate: true });
        }}
        onClickCapture={(event) => {
          if (movedRef.current) {
            event.preventDefault();
            event.stopPropagation();
            movedRef.current = false;
          }
        }}
      >
        <div
          ref={worldRef}
          className="absolute left-0 top-0 will-change-transform"
          style={{
            width: ADMIN_MAP_WORLD.width,
            height: ADMIN_MAP_WORLD.height,
            transformOrigin: "0 0",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
