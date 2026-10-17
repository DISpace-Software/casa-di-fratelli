import React from "react";
import { createPortal } from "react-dom";
import { getMapModalPortalTarget, getMapOverlayViewport } from "../../domain/adminMap/mapInteraction";

export default function MapOverlay({ children, title, onClose, modal = true, wide = false }) {
  const panelRef = React.useRef(null);
  const [viewport, setViewport] = React.useState(() => getMapOverlayViewport(window));

  React.useLayoutEffect(() => {
    const update = () => setViewport(getMapOverlayViewport(window));
    const visualViewport = window.visualViewport;
    update();
    window.addEventListener("resize", update);
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  React.useEffect(() => {
    if (!modal) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    };
  }, [modal]);

  return createPortal(
    <div
      data-map-keep-open="true"
      className={`admin-map-overlay-root ${modal ? "admin-map-overlay-modal" : "admin-map-overlay-floating"}`}
      style={{ left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); if (modal && event.target === event.currentTarget) onClose?.(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose?.(); }
        if (!modal || event.key !== "Tab") return;
        const controls = [...(panelRef.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first?.focus(); }
      }}
    >
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal={modal || undefined} aria-label={title}
        className={`admin-map-overlay-panel ${wide ? "admin-map-overlay-wide" : ""}`}>
        <div className="admin-map-overlay-header">
          <span className="min-w-0 break-words text-sm font-semibold text-[#fff4df]">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close map window" className="shrink-0 rounded-full border border-white/15 px-3 text-xl text-white">×</button>
        </div>
        <div className="admin-map-overlay-content">{children}</div>
      </div>
    </div>, getMapModalPortalTarget(document)
  );
}
