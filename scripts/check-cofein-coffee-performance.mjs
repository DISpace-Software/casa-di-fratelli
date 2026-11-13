// Local production-build lab measurement, not real-device FPS or canvas LCP.
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
  localOnly: true, productionBuild: true,
  note: 'Headless local Chromium, three cold browser-cache samples per profile; static server files are uncompressed. Frame deltas measure synthetic native scroll over 120 requestAnimationFrame updates. Canvas callback timings cover synchronous JavaScript and canvas commands, not deferred GPU work. These are neither real-device FPS nor LCP measurements.',
  profiles: [], bypass: [], errors: [], failedResponses: [],
};
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0;
};
const summarize = values => ({ count: values.length, p50Ms: percentile(values, 0.50), p95Ms: percentile(values, 0.95), maxMs: Math.max(0, ...values) });
const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, mobile: false, cpu: 1, latency: 0, downloadBytesPerSecond: -1 },
  { name: 'phone390-dpr1', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, mobile: true, cpu: 4, latency: 150, downloadBytesPerSecond: 200000 },
  { name: 'phone390-dpr2', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, mobile: true, cpu: 4, latency: 150, downloadBytesPerSecond: 200000 },
];

async function createPage(profile, label, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.mobile, hasTouch: profile.mobile, locale: 'bg-BG', reducedMotion, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push({ label, message: error.message }));
  page.on('response', response => { if (response.status() >= 400) report.failedResponses.push({ label, status: response.status(), url: response.url() }); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  if (profile.mobile) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.downloadBytesPerSecond, uploadThroughput: 93750, connectionType: 'cellular4g' });
  await page.addInitScript(() => {
    const nativeRAF = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    window.__coffeePerf = { nativeRAF, pending, draws: 0, sceneReadyMs: null, drawCallbacks: [], longTasks: [], cls: 0 };
    const clearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('coffee-scene')) window.__coffeePerf.draws++;
      return clearRect.apply(this, args);
    };
    window.requestAnimationFrame = callback => {
      const id = nativeRAF(timestamp => {
        pending.delete(id);
        const start = performance.now();
        const before = window.__coffeePerf.draws;
        try { callback(timestamp); }
        finally {
          if (window.__coffeePerf.draws > before) window.__coffeePerf.drawCallbacks.push({ start, duration: performance.now() - start, draws: window.__coffeePerf.draws - before });
        }
      });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); nativeCancel(id); };
    new MutationObserver(() => {
      if (window.__coffeePerf.sceneReadyMs === null && document.querySelector('.cofein-intro-shell')?.dataset.ready === 'true') window.__coffeePerf.sceneReadyMs = performance.now();
    }).observe(document, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-ready'] });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__coffeePerf.longTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__coffeePerf.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  return { context, page };
}

try {
  for (const profile of profiles) {
    const samples = [];
    for (let sample = 1; sample <= 3; sample++) {
      const { context, page } = await createPage(profile, `${profile.name}-${sample}`);
      try {
        await page.goto(`${origin}/cofein-preview.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('.cofein-intro-shell')?.dataset.ready === 'true');
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        // The optional empty cup intentionally does not block scene-ready.
        // Wait for its transfer only to count all bytes and isolate scrolling
        // from network/decode work; its delay cannot change sceneReadyMs.
        await page.waitForFunction(() => performance.getEntriesByType('resource').filter(entry => /\/cofein\/intro\/.*\.webp/.test(entry.name)).length === 3);
        const initial = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource');
          const assets = resources.filter(entry => /\/cofein\/intro\/.*\.webp/.test(entry.name)).map(entry => ({ path: new URL(entry.name).pathname, bytes: entry.encodedBodySize, startMs: entry.startTime, responseEndMs: entry.responseEnd, durationMs: entry.duration, initiator: entry.initiatorType }));
          const canvas = document.querySelector('.coffee-scene');
          return { sceneReadyMs: window.__coffeePerf.sceneReadyMs, assets, assetBytes: assets.reduce((sum, entry) => sum + entry.bytes, 0), logoBytes: resources.find(entry => entry.name.includes('/cofein/brand/cofein-lockup.svg'))?.encodedBodySize || 0,
            totalResourceBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0), draws: window.__coffeePerf.draws,
            canvasBackingStore: { width: canvas.width, height: canvas.height },
            menuDeferred: !resources.some(entry => /CofeinMenu/.test(entry.name)), bookingDeferred: !resources.some(entry => /CofeinBooking/.test(entry.name)),
            initialLongTasks: [...window.__coffeePerf.longTasks], noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
          };
        });
        await page.waitForTimeout(300);
        const idle = await page.evaluate(before => ({ newDraws: window.__coffeePerf.draws - before, pendingFrames: window.__coffeePerf.pending.size }), initial.draws);
        assert(initial.sceneReadyMs > 0 && initial.sceneReadyMs < 7000, 'Scene must become ready before decorative fallback');
        assert.equal(initial.assets.length, 3, 'Cup, empty cup and saucer use one responsive variant each');
        assert(initial.assets.filter(asset => !asset.path.includes('cup-empty')).every(asset => asset.initiator === 'link'), 'The first-scene cup and saucer must use early native preloads');
        assert(initial.assetBytes <= (profile.mobile ? 110000 : 200000), 'Decorative raster asset budget');
        assert(initial.menuDeferred && initial.bookingDeferred && initial.noHorizontalOverflow);
        assert.equal(idle.newDraws, 0, 'Idle scene must not redraw');
        assert.equal(idle.pendingFrames, 0, 'Idle scene must not run a frame loop');
        const scroll = await page.evaluate(async () => {
          const audit = window.__coffeePerf;
          const runway = parseFloat(document.querySelector('.cofein-intro-shell').style.paddingTop);
          const frames = [];
          const start = performance.now();
          const beforeDraws = audit.draws;
          await new Promise(resolve => {
            let count = 0;
            let previous;
            const advance = timestamp => {
              if (previous !== undefined) frames.push(timestamp - previous);
              previous = timestamp;
              // The fully revealed scene now hands off at 95%. Keep all 120
              // updates within that runway; only the last one crosses it.
              // Continuing absolute scrollTo calls after the handoff would
              // jump through the restaurant and measure unrelated page work.
              const progress = count === 119 ? 1 : count / 119 * 0.95;
              window.scrollTo({ top: runway * progress, left: 0, behavior: 'instant' });
              count++;
              if (count < 120) audit.nativeRAF(advance);
              else audit.nativeRAF(() => audit.nativeRAF(resolve));
            };
            audit.nativeRAF(advance);
          });
          const end = performance.now();
          return { start, end, elapsedMs: end - start, frames, draws: audit.draws - beforeDraws,
            drawCallbacks: audit.drawCallbacks.filter(entry => entry.start >= start && entry.start <= end),
            longTasks: audit.longTasks.filter(entry => entry.start >= start && entry.start <= end),
            state: document.querySelector('.cofein-intro-shell').dataset.coffeeIntro,
            canvasCount: document.querySelectorAll('.coffee-scene').length,
            contentInert: document.querySelector('.cofein-intro-content').inert, scrollY,
            finalDraws: audit.draws, pendingFrames: audit.pending.size, cls: audit.cls,
          };
        });
        await page.waitForTimeout(300);
        const cleanup = await page.evaluate(before => ({ newDraws: window.__coffeePerf.draws - before, pendingFrames: window.__coffeePerf.pending.size }), scroll.finalDraws);
        assert.equal(scroll.state, 'complete', 'Native scrolling must hand off to the page');
        assert.equal(scroll.canvasCount, 0);
        assert.equal(scroll.contentInert, false);
        assert.equal(cleanup.newDraws, 0);
        assert.equal(cleanup.pendingFrames, 0);
        const measurement = { sample, ...initial, idle,
          scroll: { ...scroll, frameDelta: summarize(scroll.frames), canvasCallback: summarize(scroll.drawCallbacks.map(entry => entry.duration)), framesOver25Ms: scroll.frames.filter(value => value > 25).length, framesOver50Ms: scroll.frames.filter(value => value > 50).length }, cleanup,
        };
        samples.push(measurement);
        console.log(`${profile.name} ${sample}: ready ${Math.round(initial.sceneReadyMs)} ms, assets ${initial.assetBytes} B, frame p50/p95 ${measurement.scroll.frameDelta.p50Ms.toFixed(1)}/${measurement.scroll.frameDelta.p95Ms.toFixed(1)} ms, canvas p95 ${measurement.scroll.canvasCallback.p95Ms.toFixed(1)} ms, scrolling long tasks ${scroll.longTasks.length}`);
      } finally { await context.close(); }
    }
    report.profiles.push({ ...profile, samples, medianSceneReadyMs: percentile(samples.map(sample => sample.sceneReadyMs), 0.5), frameDelta: summarize(samples.flatMap(sample => sample.scroll.frames)), canvasCallback: summarize(samples.flatMap(sample => sample.scroll.drawCallbacks.map(entry => entry.duration))), scrollingLongTasks: samples.reduce((sum, sample) => sum + sample.scroll.longTasks.length, 0) });
  }
  for (const scenario of [{ name: 'reduced-motion', reducedMotion: 'reduce', hash: '' }, { name: 'direct-booking', reducedMotion: 'no-preference', hash: '#booking' }]) {
    const { context, page } = await createPage(profiles[1], scenario.name, scenario.reducedMotion);
    try {
      await page.goto(`${origin}/cofein-preview.html${scenario.hash}`, { waitUntil: 'networkidle' });
      const result = await page.evaluate(() => ({ state: document.querySelector('.cofein-intro-shell').dataset.coffeeIntro, introResources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/cofein/intro/')).map(entry => entry.name), canvasCount: document.querySelectorAll('.coffee-scene').length, draws: window.__coffeePerf.draws }));
      assert.equal(result.state, 'bypassed');
      assert.equal(result.introResources.length, 0);
      assert.equal(result.canvasCount, 0);
      assert.equal(result.draws, 0);
      report.bypass.push({ ...scenario, ...result });
      console.log(`${scenario.name}: no intro images or canvas work`);
    } finally { await context.close(); }
  }
  assert.equal(report.errors.length, 0);
  assert.equal(report.failedResponses.length, 0);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(outputRoot, 'performance.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
