import { useEffect } from 'react';

/** One-time reveals and restrained, optional depth; content works without motion. */
export default function useCofeinMotion(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reveals = [...root.querySelectorAll('[data-reveal]')];
    const initiallyVisible = new Set(reveals.filter((node) => node.classList.contains('is-visible')));
    const hero = root.querySelector('[data-hero-visual]');
    const header = root.querySelector('.site-header');
    const previousScrolled = header?.getAttribute('data-scrolled');
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktopPointer = window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)');
    const previousMotion = root.getAttribute('data-motion');
    const previousShift = hero?.style.getPropertyValue('--hero-shift');
    const previousShiftPriority = hero?.style.getPropertyPriority('--hero-shift');

    let active = true;
    let observer;
    let frame = 0;
    let lastShift;

    const show = (node) => {
      node.classList.add('is-visible');
      observer?.unobserve(node);
    };

    // Content already in view (including a restored anchor position) never
    // disappears while React's effect installs the enhancement.
    const showNearViewport = () => {
      reveals.forEach((node) => {
        if (!node.classList.contains('is-visible') && node.getClientRects().length
          && node.getBoundingClientRect().top <= window.innerHeight + 100) show(node);
      });
    };

    const writeShift = (shift) => {
      if (!hero || lastShift === shift) return;
      hero.style.setProperty('--hero-shift', `${shift}px`);
      lastShift = shift;
    };

    const updateViewport = () => {
      frame = 0;
      if (!active) return;
      header?.setAttribute('data-scrolled', String(window.scrollY > 24));
      if (!hero || motionPreference.matches || !desktopPointer.matches) {
        writeShift(0);
        return;
      }
      // Measure the stationary wrapper; only the oversized image moves.
      const shift = Math.min(40, Math.max(0, -hero.getBoundingClientRect().top * 0.07));
      writeShift(Math.round(shift * 100) / 100);
    };

    const scheduleViewport = () => {
      if (!frame && active) frame = window.requestAnimationFrame(updateViewport);
    };

    const onResize = () => {
      showNearViewport();
      scheduleViewport();
    };

    const onFocus = (event) => {
      // Nested reveal wrappers must all be visible for the focused control.
      let node = event.target.closest?.('[data-reveal]');
      while (node && root.contains(node)) {
        show(node);
        node = node.parentElement?.closest('[data-reveal]');
      }
    };

    const configureMotion = () => {
      observer?.disconnect();
      observer = undefined;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      const reducedMotion = motionPreference.matches;
      if (reducedMotion || !('IntersectionObserver' in window)) {
        reveals.forEach(show);
      } else {
        showNearViewport();
        observer = new IntersectionObserver((entries) => {
          if (!active) return;
          entries.forEach((entry) => {
            if (entry.isIntersecting) show(entry.target);
          });
        }, { threshold: 0, rootMargin: '0px 0px 100px 0px' });

        reveals.forEach((node) => {
          if (!node.classList.contains('is-visible')) observer.observe(node);
        });
      }

      root.setAttribute('data-motion', 'ready');
      updateViewport();
    };

    configureMotion();
    window.addEventListener('scroll', scheduleViewport, { passive: true });
    window.addEventListener('resize', onResize);
    root.addEventListener('focusin', onFocus);
    motionPreference.addEventListener('change', configureMotion);
    desktopPointer.addEventListener('change', scheduleViewport);

    return () => {
      active = false;
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleViewport);
      window.removeEventListener('resize', onResize);
      root.removeEventListener('focusin', onFocus);
      motionPreference.removeEventListener('change', configureMotion);
      desktopPointer.removeEventListener('change', scheduleViewport);
      if (previousScrolled == null) header?.removeAttribute('data-scrolled');
      else header?.setAttribute('data-scrolled', previousScrolled);

      if (previousMotion === null) root.removeAttribute('data-motion');
      else root.setAttribute('data-motion', previousMotion);

      reveals.forEach((node) => {
        if (!initiallyVisible.has(node)) node.classList.remove('is-visible');
      });

      if (hero) {
        if (previousShift) hero.style.setProperty('--hero-shift', previousShift, previousShiftPriority);
        else hero.style.removeProperty('--hero-shift');
      }
    };
  }, [rootRef]);
}
