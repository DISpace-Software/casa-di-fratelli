// Production-build lab measurement of the optional WebGL opening.
// node script <static-origin> <output-dir> <playwright-module> <chromium-binary>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [origin, outputRoot, playwrightPath, chromiumPath] = process.argv.slice(2);
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Only local sites are permitted');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
await fs.mkdir(outputRoot, { recursive: true });
const report = {
  localOnly: true, productionBuild: true, samplesPerProfile: 1,
  note: 'Three cold browser-cache loads: desktop and two emulated phone DPR profiles, one sample each. Local headless Chromium, not physical-phone FPS, a statistical median, CDN timing, or canvas LCP. Native RAF deltas measure synthetic scrolling. Callback durations cover synchronous JS/WebGL commands, not deferred GPU rendering. Encoded/decoded resource bytes and actual Content-Encoding are recorded. Three additional functional navigations check settling/disposal and animation bypass.',
  browserVersion: browser.version(), profiles: [], lifecycle: null, bypass: [],
  errors: [], failedResponses: [], blockedWrites: [],
};
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0;
};
const summarize = values => ({ count: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95), maxMs: Math.max(0, ...values) });
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, mobile: false, cpu: 1, latency: 0, downloadBytesPerSecond: -1 },
  { name: 'phone390-dpr1', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, mobile: true, cpu: 4, latency: 150, downloadBytesPerSecond: 200000 },
  { name: 'phone390-dpr2', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, mobile: true, cpu: 4, latency: 150, downloadBytesPerSecond: 200000 },
];

async function createPage(profile, label, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.mobile, hasTouch: profile.mobile, locale: 'bg-BG', reducedMotion, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    report.blockedWrites.push({ label, method: request.method(), path: new URL(request.url()).pathname });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  const encodings = new Map();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push({ label, message: error.message }));
  page.on('response', response => {
    encodings.set(response.url(), response.headers()['content-encoding'] || 'identity');
    if (response.status() >= 400) report.failedResponses.push({ label, status: response.status(), url: response.url() });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  if (profile.mobile) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.downloadBytesPerSecond, uploadThroughput: 93750, connectionType: 'cellular4g' });
  await page.addInitScript(() => {
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    const audit = window.__coffeePerf = { nativeRAF, pending, wrapper: null, sceneReadyMs: null, firstRenderMs: null, callbacks: [], longTasks: [], cls: 0 };
    audit.readRenders = () => {
      audit.wrapper = document.querySelector('.coffee-scene') || audit.wrapper;
      return Number(audit.wrapper?.dataset.renderCount || 0);
    };
    window.requestAnimationFrame = callback => {
      const id = nativeRAF(timestamp => {
        pending.delete(id);
        const before = audit.readRenders();
        const start = performance.now();
        try { callback(timestamp); }
        finally {
          const renders = audit.readRenders() - before;
          if (renders > 0) audit.callbacks.push({ start, duration: performance.now() - start, renders });
        }
      });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); nativeCancel(id); };
    new MutationObserver(() => {
      if (audit.sceneReadyMs === null && document.querySelector('.cofein-intro-shell')?.dataset.ready === 'true') audit.sceneReadyMs = performance.now();
      if (audit.firstRenderMs === null && audit.readRenders() > 0) audit.firstRenderMs = performance.now();
    }).observe(document, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-ready', 'data-render-count'] });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) audit.longTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) audit.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  return { context, page, encodings };
}

async function sceneReady(page) {
  await page.waitForFunction(() => document.querySelector('.cofein-intro-shell')?.dataset.ready === 'true'
    && Number(document.querySelector('.coffee-scene')?.dataset.renderCount || 0) > 0);
}

async function rendererSnapshot(page) {
  return page.evaluate(() => ({ renders: window.__coffeePerf.readRenders(), pendingFrames: window.__coffeePerf.pending.size,
    canvasCount: document.querySelectorAll('.coffee-scene canvas').length,
    state: document.querySelector('.cofein-intro-shell')?.dataset.coffeeIntro,
    contentInert: document.querySelector('.cofein-intro-content')?.inert,
    wrapperConnected: Boolean(window.__coffeePerf.wrapper?.isConnected),
  }));
}

try {
  for (const profile of profiles) {
    const { context, page, encodings } = await createPage(profile, profile.name);
    try {
      await page.goto(`${origin}/cofein-preview.html`, { waitUntil: 'domcontentloaded' });
      await sceneReady(page);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const initial = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        const resourceList = resources.map(entry => ({ url: entry.name, path: new URL(entry.name).pathname,
          encodedBytes: entry.encodedBodySize, decodedBytes: entry.decodedBodySize, transferBytes: entry.transferSize,
          startMs: entry.startTime, responseEndMs: entry.responseEnd, durationMs: entry.duration, initiator: entry.initiatorType }));
        const js = resourceList.filter(entry => /\.js(?:\?|$)/.test(entry.path));
        const engine = js.filter(entry => /coffeeWebGLScene|coffeeFluidPhysics|coffeeWetReveal|(?:^|\/)three(?:[./-]|$)/i.test(entry.path));
        const canvas = document.querySelector('.coffee-scene__objects');
        const gl = canvas.getContext('webgl2');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          sceneReadyMs: window.__coffeePerf.sceneReadyMs, firstRenderMs: window.__coffeePerf.firstRenderMs,
          renderCount: window.__coffeePerf.readRenders(), renderer: document.querySelector('.coffee-scene')?.dataset.renderer,
          webgl: gl ? { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR) } : null,
          canvases: [...document.querySelectorAll('.coffee-scene canvas')].map(item => ({ className: item.className, width: item.width, height: item.height, cssWidth: item.clientWidth, cssHeight: item.clientHeight })),
          resources: resourceList, jsResources: js, engineResources: engine,
          totalEncodedBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
          totalDecodedBytes: resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
          jsEncodedBytes: js.reduce((sum, entry) => sum + entry.encodedBytes, 0),
          engineEncodedBytes: engine.reduce((sum, entry) => sum + entry.encodedBytes, 0),
          engineDecodedBytes: engine.reduce((sum, entry) => sum + entry.decodedBytes, 0),
          menuDeferred: !resources.some(entry => /CofeinMenu/.test(entry.name)),
          bookingDeferred: !resources.some(entry => /CofeinBooking/.test(entry.name)),
          initialLongTasks: [...window.__coffeePerf.longTasks],
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
        };
      });
      initial.resources.forEach(resource => { resource.contentEncoding = encodings.get(resource.url) || 'unknown'; });
      initial.engineResources.forEach(resource => { resource.contentEncoding = encodings.get(resource.url) || 'unknown'; });
      assert(!initial.jsResources.some(resource => /\/@vite\/|\/src\//.test(resource.path)), 'Use a frozen production build, not Vite development mode');
      assert.equal(initial.renderer, 'webgl');
      assert(initial.webgl && initial.renderCount > 0);
      assert.equal(initial.canvases.length, 2, 'The 3D scene and wet reveal use separate canvases');
      assert(initial.engineResources.length > 0 && initial.engineEncodedBytes > 0, 'Record the actual production WebGL chunk and its bytes');
      assert(initial.menuDeferred && initial.bookingDeferred && initial.noHorizontalOverflow);
      const idleBefore = await rendererSnapshot(page);
      await page.waitForTimeout(350);
      const idleAfter = await rendererSnapshot(page);
      assert.equal(idleAfter.renders, idleBefore.renders, 'An untouched scene must stop rendering');
      assert.equal(idleAfter.pendingFrames, 0, 'An untouched scene must not retain an animation loop');
      const scroll = await page.evaluate(async () => {
        const audit = window.__coffeePerf;
        const runway = parseFloat(document.querySelector('.cofein-intro-shell').style.paddingTop);
        const frames = [];
        const start = performance.now();
        const beforeRenders = audit.readRenders();
        await new Promise(resolve => {
          let count = 0;
          let previous;
          const advance = timestamp => {
            if (previous !== undefined) frames.push(timestamp - previous);
            previous = timestamp;
            // Handoff is at p=1. Never scroll to an old runway coordinate after
            // its removal: that would benchmark the restaurant instead.
            window.scrollTo({ top: runway * count / 119, left: 0, behavior: 'instant' });
            count++;
            if (count < 120) audit.nativeRAF(advance);
            else audit.nativeRAF(() => audit.nativeRAF(resolve));
          };
          audit.nativeRAF(advance);
        });
        const end = performance.now();
        return { start, end, elapsedMs: end - start, frames, renders: audit.readRenders() - beforeRenders,
          callbacks: audit.callbacks.filter(entry => entry.start >= start && entry.start <= end),
          longTasks: audit.longTasks.filter(entry => entry.start >= start && entry.start <= end),
          scrollY, cls: audit.cls,
        };
      });
      const complete = await rendererSnapshot(page);
      await page.waitForTimeout(400);
      const cleanup = await rendererSnapshot(page);
      assert.equal(complete.state, 'complete', 'Native scrolling must hand off at the end of the runway');
      assert.equal(complete.canvasCount, 0);
      assert.equal(complete.contentInert, false);
      assert.equal(cleanup.renders, complete.renders, 'A disposed renderer must not produce further frames');
      assert.equal(cleanup.pendingFrames, 0);
      const measurement = { ...profile, sample: 1, ...initial,
        idle: { before: idleBefore, after: idleAfter, quietMs: 350 },
        scroll: { ...scroll, frameDelta: summarize(scroll.frames), rendererCallback: summarize(scroll.callbacks.map(entry => entry.duration)),
          framesOver25Ms: scroll.frames.filter(value => value > 25).length, framesOver50Ms: scroll.frames.filter(value => value > 50).length },
        complete, cleanup,
      };
      report.profiles.push(measurement);
      console.log(`${profile.name}: first render ${Math.round(initial.firstRenderMs)} ms; engine ${initial.engineEncodedBytes} encoded / ${initial.engineDecodedBytes} decoded B; RAF p50/p95 ${measurement.scroll.frameDelta.p50Ms.toFixed(1)}/${measurement.scroll.frameDelta.p95Ms.toFixed(1)} ms; JS/WebGL callback p95 ${measurement.scroll.rendererCallback.p95Ms.toFixed(1)} ms; scroll long tasks ${scroll.longTasks.length}`);
    } finally { await context.close(); }
  }

  // Check the finite slosh-settling loop, then dispose it while it is active.
  {
    const { context, page } = await createPage(profiles[0], 'settle-and-skip');
    try {
      await page.goto(`${origin}/cofein-preview.html`, { waitUntil: 'networkidle' });
      await sceneReady(page);
      await page.evaluate(() => window.scrollTo({ top: parseFloat(document.querySelector('.cofein-intro-shell').style.paddingTop) * 0.45, behavior: 'instant' }));
      await page.waitForTimeout(1400);
      const settled = await rendererSnapshot(page);
      await page.waitForTimeout(350);
      const quiet = await rendererSnapshot(page);
      assert.equal(quiet.renders, settled.renders, 'Liquid inertia must settle and stop rendering');
      assert.equal(quiet.pendingFrames, 0);
      await page.evaluate(() => window.scrollTo({ top: parseFloat(document.querySelector('.cofein-intro-shell').style.paddingTop) * 0.55, behavior: 'instant' }));
      await page.waitForFunction(before => window.__coffeePerf.readRenders() > before && window.__coffeePerf.pending.size > 0, settled.renders);
      const active = await rendererSnapshot(page);
      await page.getByRole('button', { name: 'Към сайта' }).click();
      const skipped = await rendererSnapshot(page);
      await page.waitForTimeout(1100);
      const afterSkip = await rendererSnapshot(page);
      assert.equal(skipped.canvasCount, 0);
      assert.equal(skipped.contentInert, false);
      assert.equal(afterSkip.renders, skipped.renders, 'Skip must cancel the active WebGL/settling loop');
      assert.equal(afterSkip.pendingFrames, 0);
      report.lifecycle = { settled, quiet, active, skipped, afterSkip, settlingWaitMs: 1400, quietWaitMs: 350, disposalWaitMs: 1100 };
      console.log('lifecycle: slosh settles; skip cancels an active renderer without further frames');
    } finally { await context.close(); }
  }

  for (const scenario of [{ name: 'reduced-motion', reducedMotion: 'reduce', hash: '' }, { name: 'direct-booking', reducedMotion: 'no-preference', hash: '#booking' }]) {
    const { context, page } = await createPage(profiles[0], scenario.name, scenario.reducedMotion);
    try {
      await page.goto(`${origin}/cofein-preview.html${scenario.hash}`, { waitUntil: 'networkidle' });
      const result = await page.evaluate(() => ({ state: document.querySelector('.cofein-intro-shell').dataset.coffeeIntro,
        engineResources: performance.getEntriesByType('resource').filter(entry => /coffeeWebGLScene|coffeeFluidPhysics|coffeeWetReveal|(?:^|\/)three(?:[./-]|$)/i.test(new URL(entry.name).pathname)).map(entry => new URL(entry.name).pathname),
        sceneCount: document.querySelectorAll('.coffee-scene').length, renders: window.__coffeePerf.readRenders(),
      }));
      assert.equal(result.state, 'bypassed');
      assert.equal(result.engineResources.length, 0, 'Bypass must not fetch the WebGL engine or Three.js');
      assert.equal(result.sceneCount, 0);
      assert.equal(result.renders, 0);
      report.bypass.push({ ...scenario, ...result });
      console.log(`${scenario.name}: no WebGL/Three.js chunk or renderer`);
    } finally { await context.close(); }
  }
  assert.equal(report.errors.length, 0);
  assert.equal(report.failedResponses.length, 0);
  assert.equal(report.blockedWrites.length, 0);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outputRoot, 'performance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
