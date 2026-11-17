import { useEffect, useImperativeHandle, useRef } from 'react';
import './cofein-coffee-scene.css';

/** The frame player and its manifest load only while this optional opening is mounted. */
export default function CofeinCoffeeScene({ ref, onReady, onError }) {
  const wrapperRef = useRef(null);
  const objectsRef = useRef(null);
  const revealRef = useRef(null);
  const engineRef = useRef(null);
  const pendingRef = useRef({ progress: 0, layout: {} });
  useImperativeHandle(ref, () => ({
    render(progress, layout = {}) {
      pendingRef.current = { progress, layout };
      engineRef.current?.render(progress, layout);
    },
  }), []);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let engine;
    import('./coffeePhotorealScene.js')
      .then(async module => {
        if (cancelled) return null;
        const response = await fetch('/cofein/intro/film/manifest.json', {
          signal: controller.signal,
          cache: 'no-cache',
        });
        if (cancelled) return null;
        if (!response.ok) throw new Error(`Coffee film manifest request failed (${response.status})`);
        const manifest = await response.json();
        if (cancelled) return null;
        return module.createCoffeePhotorealScene(
          objectsRef.current, revealRef.current, wrapperRef.current, onError, controller.signal, manifest,
        );
      })
      .then(result => {
        if (!result) return;
        if (cancelled) { result.dispose(); return; }
        engine = result; engineRef.current = result;
        const pending = pendingRef.current;
        result.render(pending.progress, pending.layout);
        onReady();
      })
      .catch(() => { if (!cancelled) onError(); });
    return () => {
      cancelled = true;
      controller.abort();
      engineRef.current = null;
      engine?.dispose();
    };
  }, [onReady, onError]);
  return <div className="coffee-scene" ref={wrapperRef}>
    <canvas className="coffee-scene__reveal" ref={revealRef} />
    <canvas className="coffee-scene__objects" ref={objectsRef} />
  </div>;
}
