import { useEffect, useImperativeHandle, useRef } from 'react';
import './cofein-coffee-scene.css';

/** The WebGL engine is fetched only when this optional opening is mounted. */
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
    import('./coffeeWebGLScene.js')
      .then(module => {
        if (cancelled) return null;
        return module.createCoffeeWebGLScene(objectsRef.current, revealRef.current, wrapperRef.current, onError, controller.signal);
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
