import { drawCoffeeWetReveal } from './coffeeWetReveal.js';

const MiB = 1024 * 1024;
const clamp = value => Math.max(0, Math.min(1, value));
const cancelled = () => new DOMException('Coffee scene cancelled', 'AbortError');
const touch = (cache, key) => {
  const value = cache.get(key);
  if (value !== undefined) { cache.delete(key); cache.set(key, value); }
  return value;
};

async function decodeBitmap(blob) {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const image = await globalThis.createImageBitmap(blob);
      return { source: image, width: image.width, height: image.height, close: () => image.close() };
    } catch { /* Some Safari versions expose the method but reject particular image inputs. */ }
  }
  const image = new Image();
  const url = URL.createObjectURL(blob);
  image.decoding = 'async';
  try {
    if (typeof image.decode === 'function') {
      image.src = url;
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Coffee frame could not be decoded'));
        image.src = url;
      });
    }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight,
      close: () => { image.src = ''; } };
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

/**
 * A bounded, demand-driven sequence cache. At most three fetches and one decode
 * are active. Only the requested frame can replace the displayed frame; a late
 * decode from an earlier scroll position cannot rewind the scene.
 * Dependencies are injectable so cancellation and memory limits can be tested
 * without claiming that a mock image validates the eventual film.
 */
export function createCoffeeFrameLoader({
  frames, width, height, decodedBudget = 24 * MiB, blobBudget = 12 * MiB,
  fetchFrame = (url, options) => fetch(url, options), decodeFrame = decodeBitmap,
  onFrame = () => {}, onError = () => {}, signal, timeoutMs = 4500,
}) {
  const frameBytes = width * height * 4;
  if (!frames?.length || !(frameBytes > 0) || frameBytes * 2 > decodedBudget || !(blobBudget > 0)) {
    throw new Error('Coffee frame sequence exceeds its memory budget');
  }
  const images = new Map();
  const blobs = new Map();
  const fetching = new Map();
  const failures = new Map();
  let attempted = new Set();
  let decodedBytes = 0;
  let blobBytes = 0;
  let target = -1;
  let displayed = -1;
  let direction = 1;
  let decoding = null;
  let disposed = false;
  let failed = false;
  let timer;
  // One slot remains available for the held frame during a jump to a new range.
  const wantedCount = Math.min(5, Math.max(1, Math.floor(decodedBudget / frameBytes) - 1));

  function wanted() {
    if (target < 0) return [];
    return [target, target + direction, target - direction, target + 2 * direction, target - 2 * direction]
      .filter(index => index >= 0 && index < frames.length).slice(0, wantedCount);
  }

  function trimImages() {
    for (const [index, frame] of images) {
      if (decodedBytes <= decodedBudget) break;
      if (index === displayed || index === target) continue;
      images.delete(index);
      decodedBytes -= frame.bytes;
      frame.close();
    }
  }

  function trimBlobs() {
    for (const [index, blob] of blobs) {
      if (blobBytes <= blobBudget) break;
      // A decode holds its own temporary Blob reference; the cache can release
      // that entry while keeping the current target within its strict budget.
      if (index === target) continue;
      blobs.delete(index);
      blobBytes -= blob.size;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', dispose);
    fetching.forEach(controller => controller.abort());
    fetching.clear();
    images.forEach(frame => frame.close());
    images.clear();
    blobs.clear();
    decodedBytes = 0;
    blobBytes = 0;
  }

  function fail(error) {
    if (disposed || failed) return;
    failed = true;
    dispose();
    onError(error);
  }

  function show(index) {
    if (disposed || index !== target || !images.has(index)) return;
    const frame = touch(images, index);
    clearTimeout(timer);
    if (displayed === index) return;
    displayed = index;
    onFrame(frame.source, index);
  }

  function pumpDecode() {
    if (disposed || decoding !== null) return;
    const index = wanted().find(candidate => blobs.has(candidate) && !images.has(candidate) && !failures.has(candidate));
    if (index === undefined) return;
    const blob = touch(blobs, index);
    decoding = index;
    Promise.resolve().then(() => decodeFrame(blob)).then(frame => {
      if (disposed || !wanted().includes(index)) { frame.close(); return; }
      if (frame.width !== width || frame.height !== height) {
        frame.close();
        throw new Error('Coffee frame dimensions differ from the manifest');
      }
      images.set(index, { ...frame, bytes: frameBytes });
      decodedBytes += frameBytes;
      trimImages();
      show(index);
      trimImages();
    }).catch(error => {
      if (disposed) return;
      failures.set(index, error);
      if (index === target) fail(error);
    }).finally(() => {
      decoding = null;
      trimBlobs();
      pump();
    });
  }

  function startFetch(index) {
    const controller = new AbortController();
    fetching.set(index, controller);
    attempted.add(index);
    Promise.resolve().then(() => fetchFrame(frames[index], { signal: controller.signal, credentials: 'same-origin' }))
      .then(response => {
        if (!response.ok) throw new Error(`Coffee frame request failed (${response.status})`);
        return response.blob();
      }).then(blob => {
        if (disposed || controller.signal.aborted || !wanted().includes(index)) return;
        if (!blob.size || blob.size > blobBudget) throw new Error('Coffee frame file exceeds its memory budget');
        const previous = blobs.get(index);
        if (previous) blobBytes -= previous.size;
        blobs.delete(index);
        blobs.set(index, blob);
        blobBytes += blob.size;
        trimBlobs();
      }).catch(error => {
        if (disposed || controller.signal.aborted) return;
        failures.set(index, error);
        if (index === target) fail(error);
      }).finally(() => {
        // An aborted fetch may settle after a new request for the same index.
        if (fetching.get(index) === controller) fetching.delete(index);
        pump();
      });
  }

  function pump() {
    if (disposed) return;
    pumpDecode();
    for (const index of wanted()) {
      if (fetching.size >= 3) break;
      if (index === decoding || images.has(index) || blobs.has(index) || fetching.has(index) || failures.has(index)
        || (attempted.has(index) && index !== target)) continue;
      startFetch(index);
    }
  }

  function request(index) {
    if (disposed) return;
    const next = Math.max(0, Math.min(frames.length - 1, Math.round(index)));
    if (!Number.isFinite(next)) return;
    if (next !== target) {
      direction = next > target ? 1 : -1;
      target = next;
      attempted = new Set();
      clearTimeout(timer);
      if (!images.has(target)) timer = setTimeout(() => fail(new Error('Coffee frame loading timed out')), timeoutMs);
      const keep = wanted();
      for (const [active, controller] of fetching) {
        if (!keep.includes(active)) { controller.abort(); fetching.delete(active); }
      }
    }
    if (failures.has(target)) { fail(failures.get(target)); return; }
    show(target);
    pump();
  }

  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) dispose();
  return {
    request, dispose,
    current: () => images.get(displayed)?.source,
    stats: () => ({ target, displayed, decodedBytes, blobBytes, decodedFrames: images.size,
      blobFrames: blobs.size, activeFetches: fetching.size, decoding, disposed }),
  };
}

/**
 * Manifest image coordinates include the transparent margin of every frame.
 * Optional horizontal overscan enlarges the drawing inside the viewport-sized
 * canvas. It is appropriate only when the entire sequence has safe side margins.
 */
export function coffeeFilmRect(width, height, imageWidth, imageHeight, framing = {}) {
  const aspect = imageWidth / imageHeight;
  const widthFraction = Number.isFinite(framing.maxWidthFraction) && framing.maxWidthFraction > 0
    ? framing.maxWidthFraction : 1;
  const drawWidth = Math.min(width * widthFraction, framing.maxWidth || 1100,
    height * (framing.maxHeightFraction || 0.8) * aspect);
  const drawHeight = drawWidth / aspect;
  return { x: (width - drawWidth) / 2,
    y: height * (framing.centerY ?? 0.42) - drawHeight / 2, width: drawWidth, height: drawHeight };
}

/**
 * Scroll-driven display of offline-rendered RGBA frames supplied by a manifest.
 * Manifest v1:
 * { version:1, fps:24, frameCount:120,
 *   variants:[{id:'mobile',width:768,height:768,frames:['/…/0001.webp',…]}],
 *   framing:{maxWidth:1100,maxWidthFraction:1,maxHeightFraction:.8,centerY:.42,fadeStart:.9,fadeEnd:1},
 *   impacts:[{at:.4,imageX:.3,imageY:.8,mass:.003,seed:1,secondary:false}] }
 * `at` is frameIndex/(frameCount-1), not seconds; imageX/Y are normalized in
 * the source image. All variants must share composition, aspect and timeline.
 * The RGBA image sits above the separate opaque/reveal canvas, preserving dark
 * coffee and the logo without a black-key or screen-blend approximation.
 */
export async function createCoffeePhotorealScene(canvas, revealCanvas, wrapper, onError, signal, manifest) {
  if (signal?.aborted) throw cancelled();
  if (manifest?.version !== 1 || !Number.isInteger(manifest.frameCount) || manifest.frameCount < 2
    || !(manifest.fps > 0) || !manifest.variants?.length) throw new Error('Invalid coffee film manifest');
  const variants = manifest.variants.slice().sort((a, b) => a.width - b.width);
  for (const variant of variants) {
    if (!Number.isInteger(variant.width) || !Number.isInteger(variant.height) || variant.width < 1 || variant.height < 1
      || variant.frames?.length !== manifest.frameCount || variant.frames.some(url => typeof url !== 'string' || !url)
      || Math.abs(variant.width / variant.height - variants[0].width / variants[0].height) > 0.002) {
      throw new Error('Invalid coffee film variant');
    }
  }
  const context = canvas.getContext('2d', { alpha: true });
  const reveal = revealCanvas.getContext('2d', { alpha: true });
  if (!context || !reveal) throw new Error('Coffee canvas is unavailable');
  const bounds = wrapper.getBoundingClientRect();
  const initialWidth = bounds.width || window.innerWidth;
  const initialHeight = bounds.height || window.innerHeight;
  const mobile = initialWidth <= 760;
  const decodedBudget = (mobile ? 24 : 64) * MiB;
  const candidates = variants.filter(variant => variant.width * variant.height * 8 <= decodedBudget);
  if (!candidates.length) throw new Error('Coffee film has no memory-safe variant');
  const desiredWidth = coffeeFilmRect(initialWidth, initialHeight, variants[0].width, variants[0].height,
    manifest.framing).width * Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  // Overscan changes composition, not the handset's download budget. Prefer
  // an explicit mobile delivery variant even when its source is slightly below
  // the canvas DPR target; otherwise magnification can silently fetch desktop
  // frames on a phone. Manifests without named variants retain size selection.
  const variant = (mobile && candidates.find(candidate => candidate.id === 'mobile'))
    || candidates.find(candidate => candidate.width >= desiredWidth) || candidates.at(-1);
  let disposed = false;
  let progress = 0;
  let displayedFrame = -1;
  let layout = { viewportWidth: initialWidth, viewportHeight: initialHeight, pageTop: initialHeight };
  let geometryKey;
  let rect;
  let impacts;
  let renders = 0;
  let loader;
  let resolveReady;
  let rejectReady;
  let ready = false;
  const firstFrame = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });

  function dispose() {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    loader?.dispose();
    if (!ready) rejectReady(cancelled());
  }

  function failed(error) {
    if (disposed) return;
    if (!ready) rejectReady(error);
    dispose();
    // Initial failures reject creation and are handled by the React import
    // chain. Later failures use the callback, avoiding two fail-open signals.
    if (ready) onError?.(error);
  }

  function draw() {
    if (disposed) return;
    const width = layout.viewportWidth || initialWidth;
    const height = layout.viewportHeight || initialHeight;
    const isMobile = width <= 760;
    const ratio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    const maskRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5);
    const key = `${width}:${height}:${ratio}:${maskRatio}`;
    if (geometryKey !== key) {
      geometryKey = key;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      revealCanvas.width = Math.round(width * maskRatio);
      revealCanvas.height = Math.round(height * maskRatio);
      rect = coffeeFilmRect(width, height, variant.width, variant.height, manifest.framing);
      impacts = (manifest.impacts || []).map(impact => ({ ...impact,
        x: Number.isFinite(impact.imageX) ? (rect.x + impact.imageX * rect.width) / width : impact.x,
        screenY: Number.isFinite(impact.imageY) ? (rect.y + impact.imageY * rect.height) / height : impact.screenY,
      }));
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    reveal.setTransform(maskRatio, 0, 0, maskRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    reveal.clearRect(0, 0, width, height);
    // The mask follows the decoded image, so a future drop cannot open a hole
    // while its frame is still downloading. The native document may keep moving.
    const shownProgress = progress >= 1 ? 1 : Math.max(0, displayedFrame) / (manifest.frameCount - 1);
    drawCoffeeWetReveal(reveal, width, height, shownProgress, { pageTop: layout.pageTop || 0, impacts });
    const image = loader?.current();
    const { fadeStart, fadeEnd } = manifest.framing || {};
    const fade = Number.isFinite(fadeStart) && Number.isFinite(fadeEnd) && fadeEnd > fadeStart
      ? clamp((shownProgress - fadeStart) / (fadeEnd - fadeStart)) : 0;
    // The film contains the floor pool as well as the cup. A late opacity fade
    // preserves its physical position and leaves the separate reveal untouched.
    context.globalAlpha = 1 - fade * fade * (3 - 2 * fade);
    try {
      if (image && progress < 1 && context.globalAlpha > 0) context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    } finally { context.globalAlpha = 1; }
    const stats = loader?.stats();
    wrapper.dataset.renderer = 'photoreal-frames';
    wrapper.dataset.displayedFrame = String(displayedFrame);
    wrapper.dataset.targetFrame = String(stats?.target ?? 0);
    wrapper.dataset.decodedBytes = String(stats?.decodedBytes ?? 0);
    wrapper.dataset.blobBytes = String(stats?.blobBytes ?? 0);
    wrapper.dataset.renderCount = String(++renders);
    wrapper.dataset.variant = variant.id || `${variant.width}x${variant.height}`;
  }

  signal?.addEventListener('abort', dispose, { once: true });
  try {
    loader = createCoffeeFrameLoader({
      frames: variant.frames, width: variant.width, height: variant.height,
      decodedBudget, blobBudget: (mobile ? 12 : 24) * MiB, signal,
      onFrame: (_image, index) => {
        if (disposed) return;
        displayedFrame = index;
        draw();
        if (!ready) { ready = true; resolveReady(); }
      }, onError: failed,
    });
    loader.request(0);
    await firstFrame;
    if (disposed) throw cancelled();
    return {
      render(nextProgress, nextLayout = {}) {
        if (disposed) return;
        progress = clamp(nextProgress);
        layout = { ...layout, ...nextLayout };
        try {
          const before = renders;
          if (progress < 1) loader.request(Math.round(progress * (manifest.frameCount - 1)));
          // A cached frame is shown synchronously by request(). Its callback
          // already paints the latest layout; avoid doing the same work twice.
          if (renders === before) draw();
        } catch (error) { failed(error); }
      }, dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
