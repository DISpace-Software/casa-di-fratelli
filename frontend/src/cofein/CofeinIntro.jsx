import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import CofeinCoffeeScene from './CofeinCoffeeScene.jsx';
import './cofein-intro-shell.css';

function initialExperience() {
  const navigation = performance.getEntriesByType('navigation')[0];
  const initialHash = window.location.hash;
  const restoredPosition = navigation?.type === 'back_forward' || window.scrollY > 1;
  const bypass = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || Boolean(initialHash)
    || restoredPosition;
  return {
    enabled: !bypass,
    distance: Math.max(1, Math.round(window.innerHeight * 1.55)),
    initialHash,
    restoreAnchor: Boolean(initialHash) && !restoredPosition,
  };
}

/** Native scrolling uncovers the real page; its DOM and booking state stay intact. */
export default function CofeinIntro({ children }) {
  const [experience] = useState(initialExperience);
  const [active, setActive] = useState(experience.enabled);
  const shellRef = useRef(null);
  const contentRef = useRef(null);
  const overlayRef = useRef(null);
  const sceneRef = useRef(null);
  const mountedRef = useRef(false);
  const activeRef = useRef(experience.enabled);
  const readyRef = useRef(false);
  const progressRef = useRef(0);
  const deadlineRef = useRef(null);
  const handoffRef = useRef(null);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!experience.restoreAnchor) return undefined;
    let identifier;
    try { identifier = decodeURIComponent(experience.initialHash.slice(1)); }
    catch { return undefined; }
    // The browser tries the fragment before this client-rendered page exists.
    // Modal hashes retain their own focus/scroll handling in CofeinPage.
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
    const placeAnchor = () => {
      if (cancelled || window.location.hash !== experience.initialHash) return;
      const destination = document.getElementById(identifier);
      if (!destination || !contentRef.current?.contains(destination)) return;
      destination.scrollIntoView({ behavior: 'instant', block: 'start' });
      destination.focus({ preventScroll: true });
      stopListening();
    };
    // Font metrics change mobile section heights; restore after that first layout,
    // while a user's own navigation always wins over the pending correction.
    Promise.resolve(document.fonts?.ready).then(() => {
      if (!cancelled) frame = window.requestAnimationFrame(placeAnchor);
    });
    return cancel;
  }, [experience]);

  const finish = useCallback((reason = 'complete') => {
    if (!mountedRef.current || !activeRef.current) return;
    activeRef.current = false;
    handoffRef.current = {
      top: reason === 'complete' ? Math.max(0, window.scrollY - experience.distance * 0.95) : 0,
      hash: window.location.hash,
      restoreFocus: reason === 'skip' || overlayRef.current?.contains(document.activeElement),
    };
    window.clearTimeout(deadlineRef.current);
    setActive(false);
  }, [experience.distance]);

  const onReady = useCallback(() => {
    if (!mountedRef.current || !activeRef.current) return;
    readyRef.current = true;
    window.clearTimeout(deadlineRef.current);
    shellRef.current?.setAttribute('data-ready', 'true');
    sceneRef.current?.render(progressRef.current);
  }, []);

  const onError = useCallback(() => finish('error'), [finish]);

  useLayoutEffect(() => {
    if (active || !handoffRef.current) return;
    const handoff = handoffRef.current;
    handoffRef.current = null;
    const rootStyle = document.documentElement.style;
    const previousBehavior = rootStyle.getPropertyValue('scroll-behavior');
    const previousPriority = rootStyle.getPropertyPriority('scroll-behavior');
    // The site's normal anchor scrolling is smooth. This layout correction must
    // happen before paint, otherwise removing the runway visibly rewinds the page.
    rootStyle.setProperty('scroll-behavior', 'auto', 'important');
    let destination;
    if (handoff.hash) {
      try { destination = document.getElementById(decodeURIComponent(handoff.hash.slice(1))); }
      catch { /* Malformed external hashes still open the page normally. */ }
    }
    if (destination) destination.scrollIntoView({ behavior: 'instant', block: 'start' });
    else window.scrollTo({ top: handoff.top, left: 0, behavior: 'instant' });
    if (handoff.restoreFocus) {
      (destination || contentRef.current?.querySelector('#top'))?.focus({ preventScroll: true });
    }
    if (previousBehavior) rootStyle.setProperty('scroll-behavior', previousBehavior, previousPriority);
    else rootStyle.removeProperty('scroll-behavior');
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    let frame = 0;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
      frame = 0;
      if (!activeRef.current) return;
      const offset = Math.max(0, window.scrollY);
      const progress = Math.min(1, offset / experience.distance);
      progressRef.current = progress;
      if (contentRef.current) {
        contentRef.current.style.transform = `translateY(${Math.min(offset, experience.distance * 0.95) - experience.distance}px)`;
      }
      shellRef.current?.setAttribute('data-progress', progress.toFixed(4));
      overlayRef.current?.style.setProperty('--intro-progress', String(progress));
      sceneRef.current?.render(progress);
      // At this point the canvas is clear. Do not leave visible controls inert
      // while asking the visitor to scroll through an invisible final segment.
      if (progress >= 0.95) finish('complete');
    };
    const schedule = () => {
      if (!frame && activeRef.current) frame = window.requestAnimationFrame(draw);
    };
    const onHashChange = () => finish('hash');
    const onPageShow = event => { if (event.persisted) finish('restore'); };
    const onPreferenceChange = () => { if (preference.matches) finish('preference'); };
    const onKeyDown = event => {
      if (event.key === 'Escape') finish('skip');
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('keydown', onKeyDown);
    preference.addEventListener('change', onPreferenceChange);
    // A failed or stalled decorative asset must never block the restaurant.
    if (!readyRef.current) deadlineRef.current = window.setTimeout(() => finish('error'), 5000);
    draw();
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(deadlineRef.current);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('keydown', onKeyDown);
      preference.removeEventListener('change', onPreferenceChange);
    };
  }, [active, experience.distance, finish]);

  return (
    <div
      ref={shellRef}
      className="cofein-intro-shell"
      data-coffee-intro={active ? 'active' : experience.enabled ? 'complete' : 'bypassed'}
      data-progress={active ? '0.0000' : '1.0000'}
      data-ready="false"
      style={{ paddingTop: active ? experience.distance : undefined }}
    >
      <div
        ref={contentRef}
        className="cofein-intro-content"
        inert={active}
        style={{ transform: active ? `translateY(${-experience.distance}px)` : undefined }}
      >{children}</div>
      {active && <section ref={overlayRef} className="cofein-intro-overlay" aria-label="Добре дошли в Cofein">
        <div className="cofein-intro-scene" aria-hidden="true">
          <CofeinCoffeeScene ref={sceneRef} onReady={onReady} onError={onError} />
        </div>
        <button className="cofein-intro-skip" type="button" onClick={() => finish('skip')}>
          Към сайта <span aria-hidden="true">↗</span>
        </button>
        <div className="cofein-intro-hint" aria-hidden="true">
          <span className="cofein-intro-hint-line" />
          <p>Всичко започва с кафе.</p>
          <span>Превърти, за да откриеш мястото.</span>
          <svg viewBox="0 0 20 28" fill="none"><path d="M10 1v23m-6-6 6 6 6-6" /></svg>
        </div>
        <p className="cofein-intro-accessible">Превъртете надолу, за да откриете сайта, или изберете „Към сайта“.</p>
      </section>}
    </div>
  );
}
