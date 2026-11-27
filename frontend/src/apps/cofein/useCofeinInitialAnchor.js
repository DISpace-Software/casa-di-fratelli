import { useEffect, useState } from 'react';

/** Restore section links after the client-rendered page and its fonts exist. */
export default function useCofeinInitialAnchor(rootRef) {
  const [initial] = useState(() => ({
    hash: window.location.hash,
    restoredPosition: performance.getEntriesByType('navigation')[0]?.type === 'back_forward'
      || window.scrollY > 1,
  }));

  useEffect(() => {
    if (!initial.hash || initial.restoredPosition) return undefined;
    let identifier;
    try { identifier = decodeURIComponent(initial.hash.slice(1)); }
    catch { return undefined; }
    // Menu and booking hashes belong to the page's modal handling.
    if (!['top', 'main', 'atmosphere', 'spaces', 'gallery', 'visit'].includes(identifier)) return undefined;

    let cancelled = false;
    let frame = 0;
    const userEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'hashchange', 'popstate'];
    const stopListening = () => userEvents.forEach(name => window.removeEventListener(name, cancel));
    const cancel = () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      stopListening();
    };
    userEvents.forEach(name => window.addEventListener(name, cancel, { passive: true }));

    Promise.resolve(document.fonts?.ready).then(() => {
      if (cancelled) return;
      frame = window.requestAnimationFrame(() => {
        if (cancelled || window.location.hash !== initial.hash) return;
        const destination = document.getElementById(identifier);
        if (destination && rootRef.current?.contains(destination)) {
          destination.scrollIntoView({ behavior: 'instant', block: 'start' });
          destination.focus({ preventScroll: true });
        }
        stopListening();
      });
    });
    return cancel;
  }, [initial, rootRef]);
}
