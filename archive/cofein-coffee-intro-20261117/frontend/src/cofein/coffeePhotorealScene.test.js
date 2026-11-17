import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { coffeeFilmRect, createCoffeeFrameLoader, createCoffeePhotorealScene } from './coffeePhotorealScene.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (index, size = 8) => ({ ok: true, blob: async () => ({ index, size }) });

function cache(t, overrides = {}) {
  const shown = []; const closed = []; const requests = []; const errors = [];
  const loader = createCoffeeFrameLoader({
    frames: Array.from({ length: 100 }, (_, index) => String(index)), width: 10, height: 10,
    decodedBudget: 4000, blobBudget: 100,
    fetchFrame: async (url, options) => { requests.push({ index: Number(url), signal: options.signal }); return response(Number(url)); },
    decodeFrame: async blob => ({ source: { index: blob.index }, width: 10, height: 10, close: () => closed.push(blob.index) }),
    onFrame: (image, index) => shown.push({ image, index }), onError: error => errors.push(error), ...overrides,
  });
  t.after(() => loader.dispose());
  return { loader, shown, closed, requests, errors };
}

test('Loading is local to the target; idle and reverse scrolling never decode the entire sequence', async t => {
  const { loader, shown, requests } = cache(t);
  loader.request(40);
  await settle();
  assert.deepEqual(requests.slice(0, 3).map(item => item.index), [40, 41, 39]);
  assert.deepEqual(requests.map(item => item.index), [40, 41, 39, 42, 38]);
  assert.equal(loader.stats().decodedFrames, 5);
  assert.deepEqual(shown.map(item => item.index), [40]);
  const count = requests.length;
  await settle();
  assert.equal(requests.length, count, 'An idle renderer must not fetch the remaining 95 frames');
  loader.request(39);
  assert.equal(shown.at(-1).index, 39, 'A cached reverse frame appears synchronously');
  await settle();
  assert(requests.every(item => item.index >= 37 && item.index <= 42));
  assert.equal(loader.current().index, 39);
});

test('A far seek aborts obsolete requests and gives all three slots to the latest target neighborhood', async t => {
  const pending = []; const shown = [];
  const { loader } = cache(t, {
    fetchFrame: (url, options) => {
      const task = { index: Number(url), signal: options.signal, ...deferred() };
      pending.push(task); return task.promise;
    }, onFrame: (_image, index) => shown.push(index),
  });
  loader.request(0);
  await settle();
  assert.deepEqual(pending.map(item => item.index), [0, 1, 2]);
  loader.request(70);
  await settle();
  assert(pending.slice(0, 3).every(item => item.signal.aborted));
  assert.deepEqual(pending.slice(3).map(item => item.index), [70, 71, 69]);
  assert.equal(loader.stats().activeFetches, 3);
  for (const task of pending.slice(0, 3)) task.resolve(response(task.index));
  pending.find(item => item.index === 70).resolve(response(70));
  await settle();
  assert.deepEqual(shown, [70], 'Even an aborted fetch that resolves late cannot display an old frame');
});

test('Only one decode runs; a late non-cancellable decode is closed and cannot rewind the scene', async t => {
  const decoding = []; const closed = [];
  const { loader, shown } = cache(t, {
    decodeFrame: blob => { const task = { index: blob.index, ...deferred() }; decoding.push(task); return task.promise; },
  });
  const finish = task => task.resolve({ source: { index: task.index }, width: 10, height: 10, close: () => closed.push(task.index) });
  loader.request(0);
  await settle();
  loader.request(70);
  await settle();
  assert.equal(decoding.length, 1);
  finish(decoding[0]);
  await settle();
  assert.deepEqual(closed, [0]);
  assert.deepEqual(decoding.map(task => task.index), [0, 70]);
  finish(decoding[1]);
  await settle();
  assert.deepEqual(shown.map(item => item.index), [70]);
  loader.dispose();
  finish(decoding[2]);
  await settle();
  assert(closed.includes(decoding[2].index), 'A decode finishing after disposal releases its bitmap');
});

test('Decoded and compressed LRU caches stay within byte limits across long jumps and reverse traversal', async t => {
  const { loader, closed, requests } = cache(t, { decodedBudget: 1600, blobBudget: 24 });
  for (const index of [10, 20, 30, 40, 50, 60, 50, 40, 30, 20, 10]) {
    loader.request(index);
    await settle();
    const stats = loader.stats();
    assert(stats.decodedBytes <= 1600);
    assert(stats.blobBytes <= 24);
    assert(stats.decodedFrames <= 4);
    assert.equal(loader.current().index, index);
  }
  assert(closed.length > 20, 'Old bitmaps must be explicitly released');
  assert(requests.filter(item => item.index === 10).length >= 2, 'A distant evicted frame can be fetched again');
  loader.dispose();
  assert.equal(loader.stats().decodedBytes, 0);
  assert.equal(loader.stats().blobBytes, 0);
});

test('Aborting cancels network work, releases held frames and suppresses late errors', async t => {
  const controller = new AbortController();
  const pending = [];
  const { loader, errors } = cache(t, {
    signal: controller.signal,
    fetchFrame: (_url, options) => { const task = { ...deferred(), signal: options.signal }; pending.push(task); return task.promise; },
  });
  loader.request(10);
  await settle();
  controller.abort();
  assert(pending.every(task => task.signal.aborted));
  pending.forEach(task => task.reject(new Error('late response')));
  await settle();
  assert.equal(loader.stats().disposed, true);
  assert.deepEqual(errors, []);
});

test('A prefetch failure is harmless until requested; a target failure fails open only once', async t => {
  const { loader, errors, shown } = cache(t, {
    fetchFrame: async url => Number(url) === 11 ? { ok: false, status: 404 } : response(Number(url)),
  });
  loader.request(10);
  await settle();
  assert.equal(shown.at(-1).index, 10);
  assert.deepEqual(errors, []);
  loader.request(11);
  loader.request(11);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /404/);
  assert.equal(loader.stats().disposed, true);
});

test('A stalled target has a deadline, but cached idle frames have no continuing timer', async t => {
  const { loader, errors } = cache(t, { timeoutMs: 12, fetchFrame: () => new Promise(() => {}) });
  loader.request(1);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /timed out/);
  assert.equal(loader.stats().activeFetches, 0);
  const idle = cache(t, { timeoutMs: 12 });
  idle.loader.request(5);
  await settle();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(idle.errors.length, 0);
});

test('Malformed decoded dimensions fail before painting and release the bad bitmap', async t => {
  let closed = 0;
  const { loader, errors, shown } = cache(t, {
    decodeFrame: async () => ({ source: {}, width: 11, height: 10, close: () => { closed += 1; } }),
  });
  loader.request(0);
  await settle();
  assert.equal(closed, 1);
  assert.equal(shown.length, 0);
  assert.match(errors[0].message, /dimensions/);
});

test('Contain framing preserves the complete rendered composition in portrait, desktop and landscape', () => {
  for (const [width, height] of [[320, 740], [390, 844], [1440, 900], [844, 390]]) {
    const rect = coffeeFilmRect(width, height, 1536, 1024);
    assert(rect.x >= 0 && rect.y >= 0);
    assert(rect.x + rect.width <= width);
    assert(rect.y + rect.height <= height);
    assert(Math.abs(rect.width / rect.height - 1.5) < 1e-9);
  }
});

test('Explicit horizontal overscan enlarges safe source bounds without cropping the visible subject', () => {
  for (const maxWidthFraction of [1.18, 1.4]) for (const [width, height] of [[320, 740], [390, 844], [1440, 1000], [844, 390]]) {
    const framing = { maxWidthFraction };
    const rect = coffeeFilmRect(width, height, 1024, 768, framing);
    // These are the planned full-motion safe bounds, including the saucer.
    const leftSubject = rect.x + 0.1685 * rect.width;
    const rightSubject = rect.x + 0.8407 * rect.width;
    assert(leftSubject > 0 && rightSubject < width);
    assert(rect.y >= 0 && rect.y + rect.height <= height);
    assert(rect.width <= 1100, 'The independent desktop maxWidth still applies');
    assert(Math.abs(rect.width / rect.height - 4 / 3) < 1e-9);
    if (width <= 390) {
      assert(Math.abs(rect.width - width * maxWidthFraction) < 1e-9);
      assert(rect.x < 0, 'Only transparent source margins extend outside the canvas');
    }
  }
  const defaults = coffeeFilmRect(390, 844, 1024, 768);
  for (const maxWidthFraction of [undefined, 0, -1, NaN, Infinity]) {
    assert.deepEqual(coffeeFilmRect(390, 844, 1024, 768, { maxWidthFraction }), defaults);
  }
});

function browser(t, options = {}) {
  const originals = new Map();
  for (const [name, value] of Object.entries({
    window: { innerWidth: 390, innerHeight: 844, devicePixelRatio: 2 },
    requestAnimationFrame: () => assert.fail('The film renderer must not schedule an idle animation loop'),
    fetch: async url => response(Number(url)),
    createImageBitmap: async blob => ({ index: blob.index, width: 100, height: 100, close() {} }),
    ...options,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  });
  function canvas() {
    const calls = [];
    const context = new Proxy({
      createLinearGradient: () => ({ addColorStop() {} }),
    }, { get: (object, name) => object[name] || ((...args) => calls.push([name, ...args])) });
    return { width: 0, height: 0, getContext: () => context, calls };
  }
  return { objects: canvas(), mask: canvas(), wrapper: { dataset: {}, getBoundingClientRect: () => ({ width: 390, height: 844 }) } };
}

const manifest = framing => ({ version: 1, frameCount: 10, fps: 24,
  variants: [{ id: 'test', width: 100, height: 100, frames: Array.from({ length: 10 }, (_, index) => String(index)) }],
  framing, impacts: [{ at: 0.4, imageX: 0.3, imageY: 0.8, mass: 0.003 }],
});

test('The scene holds the last real frame while seeking, catches up without another scroll and has a transparent finish', async t => {
  const delayed = deferred();
  const { objects, mask, wrapper } = browser(t, { fetch: url => Number(url) === 7 ? delayed.promise : Promise.resolve(response(Number(url))) });
  const errors = [];
  const engine = await createCoffeePhotorealScene(objects, mask, wrapper, error => errors.push(error), undefined, manifest());
  t.after(() => engine.dispose());
  await settle();
  engine.render(7 / 9, { viewportWidth: 390, viewportHeight: 844, pageTop: 0 });
  assert.equal(wrapper.dataset.targetFrame, '7');
  assert.equal(wrapper.dataset.displayedFrame, '0');
  assert.equal(objects.calls.filter(call => call[0] === 'drawImage').at(-1)[1].index, 0);
  delayed.resolve(response(7));
  await settle();
  assert.equal(wrapper.dataset.displayedFrame, '7');
  assert.equal(objects.calls.filter(call => call[0] === 'drawImage').at(-1)[1].index, 7);
  const draws = objects.calls.filter(call => call[0] === 'drawImage').length;
  engine.render(1, { pageTop: 0 });
  assert.equal(objects.calls.filter(call => call[0] === 'drawImage').length, draws, 'The completed overlay must not paint the last object frame');
  assert.equal(objects.calls.at(-1)[0], 'clearRect');
  assert.equal(mask.calls.at(-2)[0], 'clearRect');
  assert.deepEqual(errors, []);
});

test('A cached frame paints the updated layout once rather than doubling canvas work on every scroll', async t => {
  const { objects, mask, wrapper } = browser(t);
  const engine = await createCoffeePhotorealScene(objects, mask, wrapper, assert.fail, undefined, manifest());
  t.after(() => engine.dispose());
  await settle();
  const before = objects.calls.filter(call => call[0] === 'drawImage').length;
  engine.render(1 / 9, { pageTop: 500 });
  assert.equal(wrapper.dataset.displayedFrame, '1');
  assert.equal(objects.calls.filter(call => call[0] === 'drawImage').length, before + 1);
  assert(mask.calls.some(call => call[0] === 'rect' && call[2] === 500));
});

test('Overscan uses one enlarged rectangle for the image and physical landing coordinates while keeping both canvases viewport-sized', async t => {
  const { objects, mask, wrapper } = browser(t, {
    createImageBitmap: async blob => ({ index: blob.index, width: 1024, height: 768, close() {} }),
  });
  const config = manifest({ maxWidthFraction: 1.4 });
  config.variants[0].width = 1024;
  config.variants[0].height = 768;
  config.impacts = [{ at: 0.5, imageX: 0.168, imageY: 0.8, mass: 0.003, seed: 1 }];
  const engine = await createCoffeePhotorealScene(objects, mask, wrapper, assert.fail, undefined, config);
  t.after(() => engine.dispose());
  engine.render(5 / 9, { viewportWidth: 390, viewportHeight: 844, pageTop: 0 });
  await settle();
  const rect = coffeeFilmRect(390, 844, 1024, 768, config.framing);
  const draw = objects.calls.filter(call => call[0] === 'drawImage').at(-1);
  assert.deepEqual(draw.slice(2), [rect.x, rect.y, rect.width, rect.height]);
  assert.equal(objects.width, 585, 'Object backing width is viewport × DPR, not the overscanned film width');
  assert.equal(objects.height, 1266);
  assert.equal(mask.width, 390);
  assert.equal(mask.height, 844);
  const curves = mask.calls.filter(call => call[0] === 'quadraticCurveTo').slice(-56);
  const xs = curves.map(call => call[1]);
  const ys = curves.map(call => call[2]);
  const expectedX = rect.x + config.impacts[0].imageX * rect.width;
  const expectedY = rect.y + config.impacts[0].imageY * rect.height;
  assert(Math.min(...xs) < expectedX && Math.max(...xs) > expectedX);
  assert(Math.min(...ys) < expectedY && Math.max(...ys) > expectedY);
  assert(Math.max(...xs) < expectedX + 30, 'Landing remains near its source pixel after magnification');
});

test('Mobile overscan retains the explicit mobile film while desktop still selects its larger variant', async t => {
  const requests = [];
  const { objects, mask, wrapper } = browser(t, {
    fetch: async url => {
      requests.push(url);
      const width = url.startsWith('mobile') ? 720 : 1200;
      return { ok: true, blob: async () => ({ size: 8, width, height: width * 0.75 }) };
    },
    createImageBitmap: async blob => ({ width: blob.width, height: blob.height, close() {} }),
  });
  const config = manifest({ maxWidthFraction: 1.4 });
  config.variants = ['mobile', 'desktop'].map(id => {
    const width = id === 'mobile' ? 720 : 1200;
    return { id, width, height: width * 0.75, frames: Array.from({ length: 10 }, (_, index) => `${id}-${index}`) };
  });
  for (const [width, height, expected] of [[390, 844, 'mobile'], [1440, 1000, 'desktop']]) {
    wrapper.getBoundingClientRect = () => ({ width, height });
    window.innerWidth = width; window.innerHeight = height;
    requests.length = 0;
    const engine = await createCoffeePhotorealScene(objects, mask, wrapper, assert.fail, undefined, config);
    await settle();
    assert.equal(wrapper.dataset.variant, expected);
    assert(requests.length > 0 && requests.every(url => url.startsWith(expected)));
    engine.dispose();
  }
});

test('Late fade changes only RGBA opacity; the floor pool, physical impacts and mask remain stationary', async t => {
  const { objects, mask, wrapper } = browser(t);
  const objectContext = objects.getContext();
  const nativeDraw = objectContext.drawImage;
  const alphas = [];
  objectContext.drawImage = (...args) => { alphas.push(objectContext.globalAlpha); nativeDraw(...args); };
  const config = manifest({ fadeStart: 0.7, fadeEnd: 0.9 });
  const engine = await createCoffeePhotorealScene(objects, mask, wrapper, assert.fail, undefined, config);
  t.after(() => engine.dispose());
  engine.render(8 / 9, { viewportWidth: 390, viewportHeight: 844, pageTop: 0 });
  await settle();
  const draw = objects.calls.filter(call => call[0] === 'drawImage').at(-1);
  const base = coffeeFilmRect(390, 844, 100, 100, config.framing);
  assert.deepEqual(draw.slice(2), [base.x, base.y, base.width, base.height]);
  assert(alphas.at(-1) > 0 && alphas.at(-1) < 0.02);
  assert.equal(objectContext.globalAlpha, 1, 'No alpha leaks into the next frame');
  mask.calls.length = 0;
  engine.render(8 / 9);
  const fadedMask = mask.calls.map(call => call.slice());
  assert.equal(mask.getContext().globalAlpha, 1);
  engine.render(1 / 9);
  await settle();
  assert.equal(alphas.at(-1), 1, 'Reverse scrolling restores full opacity before the fade interval');
  engine.dispose();
  const noFade = await createCoffeePhotorealScene(objects, mask, wrapper, assert.fail, undefined, manifest());
  t.after(() => noFade.dispose());
  noFade.render(8 / 9, { viewportWidth: 390, viewportHeight: 844, pageTop: 0 });
  await settle();
  mask.calls.length = 0;
  noFade.render(8 / 9);
  assert.deepEqual(mask.calls, fadedMask, 'Enabling fade does not alter any reveal or impact drawing command');
  assert.equal(alphas.at(-1), 1, 'An omitted fade stays fully opaque');
  assert.equal(objects.calls.filter(call => call[0] === 'drawImage').at(-1)[3], base.y);
});

test('A fully faded film clears its image layer while the reveal continues independently', async t => {
  const { objects, mask, wrapper } = browser(t);
  const engine = await createCoffeePhotorealScene(objects, mask, wrapper, assert.fail, undefined,
    manifest({ fadeStart: 0.4, fadeEnd: 0.6 }));
  t.after(() => engine.dispose());
  engine.render(7 / 9, { pageTop: 0 });
  await settle();
  objects.calls.length = 0; mask.calls.length = 0;
  engine.render(7 / 9);
  assert(objects.calls.some(call => call[0] === 'clearRect'));
  assert(!objects.calls.some(call => call[0] === 'drawImage'));
  assert(mask.calls.some(call => call[0] === 'quadraticCurveTo'));
  assert.equal(objects.getContext().globalAlpha, 1);
  assert.equal(mask.getContext().globalAlpha, 1);
});

test('Abort during the first decode rejects scene readiness and closes the late bitmap', async t => {
  const decoding = deferred(); let closed = 0;
  const { objects, mask, wrapper } = browser(t, { createImageBitmap: () => decoding.promise });
  const controller = new AbortController();
  const scene = createCoffeePhotorealScene(objects, mask, wrapper, assert.fail, controller.signal, manifest());
  const rejection = assert.rejects(scene, { name: 'AbortError' });
  await settle();
  controller.abort();
  await rejection;
  decoding.resolve({ width: 100, height: 100, close() { closed += 1; } });
  await settle();
  assert.equal(closed, 1);
  assert.equal(objects.calls.filter(call => call[0] === 'drawImage').length, 0);
});

test('Safari fallback decodes a real image element, revokes object URLs and releases it on disposal', async t => {
  const revoked = []; const images = [];
  class FallbackImage {
    naturalWidth = 100;
    naturalHeight = 100;
    src = '';
    constructor() { images.push(this); }
    async decode() { assert.match(this.src, /^blob:/); }
  }
  const { objects, mask, wrapper } = browser(t, {
    createImageBitmap: async () => { throw new Error('Unsupported image input'); },
    Image: FallbackImage,
    URL: { createObjectURL: blob => `blob:${blob.index}`, revokeObjectURL: url => revoked.push(url) },
  });
  const engine = await createCoffeePhotorealScene(objects, mask, wrapper, assert.fail, undefined, manifest());
  await settle();
  assert.equal(wrapper.dataset.displayedFrame, '0');
  assert.equal(revoked.length, images.length);
  assert(objects.calls.some(call => call[0] === 'drawImage' && call[1] instanceof FallbackImage));
  engine.dispose();
  assert(images.every(image => image.src === ''), 'Eviction/disposal also releases the fallback decoded image');
});

test('A canvas error during the first frame rejects readiness without duplicating the caller error handler', async t => {
  const { objects, mask, wrapper } = browser(t);
  const errors = [];
  objects.getContext().drawImage = () => { throw new Error('Canvas draw failed'); };
  await assert.rejects(createCoffeePhotorealScene(objects, mask, wrapper, error => errors.push(error), undefined, manifest()), /Canvas draw failed/);
  await settle();
  assert.equal(errors.length, 0);
});

test('A canvas error after readiness reports fail-open once, including an asynchronously arriving frame', async t => {
  const delayed = deferred();
  const { objects, mask, wrapper } = browser(t, { fetch: url => Number(url) === 7 ? delayed.promise : Promise.resolve(response(Number(url))) });
  const errors = [];
  const engine = await createCoffeePhotorealScene(objects, mask, wrapper, error => errors.push(error), undefined,
    manifest({ fadeStart: 0.7, fadeEnd: 0.9 }));
  t.after(() => engine.dispose());
  engine.render(7 / 9, { pageTop: 0 });
  objects.getContext().drawImage = () => {
    assert(objects.getContext().globalAlpha > 0 && objects.getContext().globalAlpha < 1);
    throw new Error('Canvas draw failed later');
  };
  delayed.resolve(response(7));
  await settle();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /failed later/);
  assert.equal(objects.getContext().globalAlpha, 1, 'Drawing failure also restores the canvas alpha');
  engine.render(0.1);
  assert.equal(errors.length, 1);
});
