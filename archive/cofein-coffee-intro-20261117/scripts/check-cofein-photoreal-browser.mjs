// Read-only Chromium/WebKit audit for the actual RGBA frame sequence, after integration.
// Usage: node script <origin> <output-dir> <playwright-module> <browser-binary> [comma-separated-scenarios] [chromium|webkit]
// This intentionally rejects the old WebGL renderer; it does not substitute mock film frames.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [origin, outputRoot, playwrightPath, browserPath, scenarioFilter, browserEngine = 'chromium'] = process.argv.slice(2);
assert(origin && outputRoot && playwrightPath && browserPath, 'Provide origin, output directory, Playwright module and browser binary');
assert(['chromium', 'webkit'].includes(browserEngine), 'Browser engine must be chromium or webkit');
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Only local sites are permitted');
const playwright = await import(pathToFileURL(playwrightPath).href);
const browser = await playwright[browserEngine].launch({ headless: true, executablePath: browserPath });
// Safari's default keyboard navigation reaches native buttons with Option+Tab.
// Keep real browser keyboard focus and Enter activation in both engines.
const keyboardNavigationKey = browserEngine === 'webkit' ? 'Alt+Tab' : 'Tab';
await fs.mkdir(outputRoot, { recursive: true });
const selected = scenarioFilter ? new Set(scenarioFilter.split(',')) : null;
const MiB = 1024 * 1024;
const isSceneEntry = url => /\/coffeePhotorealScene(?:[.-]|\/)/i.test(url);
const isManifest = url => /\/cofein\/intro\/[^?#]*\.json(?:[?#]|$)/i.test(url);
const isFrame = url => /\/cofein\/intro\/[^?#]*\.(?:webp|png)(?:[?#]|$)/i.test(url);
const isMedia = url => isManifest(url) || isFrame(url);
const isBookingSetup = url => {
  const parsed = new URL(url);
  return ['127.0.0.1', 'localhost'].includes(parsed.hostname)
    && /^\/api\/v1\/restaurants\/cofein\/(?:branding|floor-plan)$/.test(parsed.pathname);
};
// Only known browser cancellation messages are expected; connection, decoding,
// protocol and arbitrary errors must still fail the audit.
const isKnownCancellation = message => typeof message === 'string'
  && (/^(?:net::)?ERR_ABORTED$/.test(message)
    || (browserEngine === 'webkit' && ['cancelled', 'Load request cancelled'].includes(message)));
const report = { localOnly: true, realBrowser: true, selectedScenarios: selected ? [...selected] : 'all',
  browserEngine, browserVersion: browser.version(), browserExecutable: browserPath, keyboardNavigationKey, skippedScenarios: [],
  checks: [], errors: [], consoleErrors: [], expectedFailures: [], failedResources: [], failedRequests: [],
  cancelledResources: [], completedSetupRequests: [], screenshots: [], metrics: [], manifests: [], writes: 0 };
const check = (name, result) => { report.checks.push({ name, passed: Boolean(result) }); console.log(`${result ? 'PASS' : 'FAIL'}: ${name}`); };
const shell = page => page.locator('.cofein-intro-shell');
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function withDeadline(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function capture(page, label) {
  const file = `${label}.png`;
  await page.screenshot({ path: path.join(outputRoot, file), animations: 'disabled' });
  report.screenshots.push(file);
}

async function createPage(label, { width = 1440, height = 1000, reducedMotion = 'no-preference',
  failure = '', gateEngine = false, deviceScaleFactor = width <= 760 ? 2 : 1 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 900,
    hasTouch: width < 900, deviceScaleFactor, locale: 'bg-BG', timezoneId: 'Europe/Sofia', reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const requests = [];
  const requestIds = new WeakMap();
  let nextRequestId = 0;
  const manifests = [];
  const injected = new Set();
  const engineGate = deferred();
  const assetGate = deferred();
  const blockedAsset = deferred();
  const setupComplete = deferred();
  const controls = { armed: false, closing: false, navigatingAway: false, firstInjectedAt: null,
    releaseEngine: engineGate.resolve, releaseAssets: assetGate.resolve, blockedAsset: blockedAsset.promise };
  page.on('request', request => { requests.push(request.url()); requestIds.set(request, ++nextRequestId); });
  page.on('requestfinished', async request => {
    if (label !== 'deep-link-#booking' || request.method() !== 'GET' || !isBookingSetup(request.url())) return;
    try {
      const response = await request.response();
      if (!response?.ok()) return;
      report.completedSetupRequests.push({ label, url: request.url(), method: request.method(),
        requestId: requestIds.get(request), status: response.status(), finishedAt: Date.now() });
      const paths = new Set(report.completedSetupRequests.filter(entry => entry.label === label)
        .map(entry => new URL(entry.url).pathname.split('/').at(-1)));
      if (paths.has('branding') && paths.has('floor-plan')) setupComplete.resolve();
    } catch (error) { report.errors.push({ label, message: `Cannot verify booking setup completion: ${error.message}` }); }
  });
  page.on('pageerror', error => report.errors.push({ label, message: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const entry = { label, message: message.text(), url: message.location().url };
    if (injected.has(entry.url) && /Failed to load resource|ERR_FAILED|404/.test(entry.message)) report.expectedFailures.push(entry);
    else report.consoleErrors.push(entry);
  });
  page.on('requestfailed', request => {
    const entry = { label, url: request.url(), message: request.failure()?.errorText,
      method: request.method(), requestId: requestIds.get(request), failedAt: Date.now() };
    if (injected.has(entry.url)) report.expectedFailures.push(entry);
    else if (isKnownCancellation(entry.message) && (controls.closing || controls.navigatingAway
      || isMedia(entry.url) || isSceneEntry(entry.url))) report.cancelledResources.push(entry);
    else report.failedRequests.push(entry);
  });
  page.on('response', async response => {
    if (response.status() >= 400) {
      const entry = { label, status: response.status(), url: response.url() };
      if (injected.has(entry.url)) report.expectedFailures.push(entry); else report.failedResources.push(entry);
    }
    if (isManifest(response.url()) && response.ok()) {
      try {
        const manifest = await response.json();
        manifests.push(manifest);
        report.manifests.push({ label, url: response.url(), frameCount: manifest.frameCount, fps: manifest.fps,
          variants: manifest.variants?.map(variant => ({ id: variant.id, width: variant.width, height: variant.height,
            frames: variant.frames?.length })), impactCount: manifest.impacts?.length,
          firstImpact: Math.min(...(manifest.impacts || []).map(impact => impact.at)), framing: manifest.framing });
      } catch (error) { report.errors.push({ label, message: `Cannot read real manifest: ${error.message}` }); }
    }
  });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { report.writes++; return route.abort(); }
    if (gateEngine && isSceneEntry(url)) await engineGate.promise;
    if ((failure === 'manifest-404' && isManifest(url)) || (failure === 'frame-404' && isFrame(url))
      || (failure === 'late-target-404' && controls.armed && isFrame(url))) {
      injected.add(url);
      controls.firstInjectedAt ??= Date.now();
      blockedAsset.resolve(url);
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Intentional local audit failure' }).catch(() => {});
    }
    if (isFrame(url) && (failure === 'slow-frame' || (controls.armed && failure === 'slow-target'))) {
      injected.add(url);
      controls.firstInjectedAt ??= Date.now();
      blockedAsset.resolve(url);
      await assetGate.promise;
    }
    return route.continue().catch(() => {});
  });
  await page.addInitScript(() => {
    const isFrameURL = url => /\/cofein\/intro\/[^?#]*\.(?:webp|png)(?:[?#]|$)/i.test(url);
    const audit = window.__filmAudit = { frames: 0, draws: 0, pending: new Set(), activeFetches: new Set(),
      fetches: 0, maxFetches: 0, activeBodies: 0, decodes: 0, activeDecodes: 0, maxDecodes: 0,
      liveBitmaps: 0, liveBytes: 0, maxLiveBytes: 0, closedBitmaps: 0, firstSource: null,
      sources: new Map(), introActiveAt: null, introEndedAt: null,
      naturalHandoff: null, holdDecodes: false, heldDecodes: [], paints: [] };
    // React writes progress=1 for every finish reason. Record the imperative
    // scroll update while the active runway still exists, before React cleanup;
    // checking the final DOM alone would also accept an error fallback.
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (name === 'data-progress' && Number(value) >= 1
        && this.classList.contains('cofein-intro-shell') && this.dataset.coffeeIntro === 'active') {
        const runway = parseFloat(this.style.paddingTop || '0');
        if (runway > 0 && scrollY >= runway - 1) audit.naturalHandoff = { progress: Number(value), scrollY, runway };
      }
      return setAttribute.call(this, name, value);
    };
    // Record the actual transition, independent of font readiness and the
    // slower disposal assertions that run after the page is already usable.
    new MutationObserver(() => {
      const state = document.querySelector('.cofein-intro-shell')?.dataset.coffeeIntro;
      if (state === 'active') audit.introActiveAt ??= Date.now();
      else if (state && audit.introActiveAt !== null) audit.introEndedAt ??= Date.now();
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-coffee-intro'] });
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      const id = raf(time => { audit.pending.delete(id); audit.frames++; callback(time); });
      audit.pending.add(id); return id;
    };
    window.cancelAnimationFrame = id => { audit.pending.delete(id); caf(id); };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('coffee-scene__reveal')) audit.draws++;
      return clear.apply(this, args);
    };
    const bitmapSourceURLs = new WeakMap();
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas.classList.contains('coffee-scene__objects')) {
        audit.paints.push({ url: bitmapSourceURLs.get(args[0]) || null,
          progress: Number(document.querySelector('.cofein-intro-shell')?.dataset.progress) });
      }
      return drawImage.apply(this, args);
    };
    const responseFetches = new WeakMap();
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, options = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!isFrameURL(url)) return nativeFetch(input, options);
      const record = { signal: options.signal || input?.signal };
      audit.activeFetches.add(record); audit.fetches++;
      audit.maxFetches = Math.max(audit.maxFetches, [...audit.activeFetches].filter(item => !item.signal?.aborted).length);
      try {
        const response = await nativeFetch(input, options);
        // A slot is occupied through the body download, not just until headers.
        if (response.ok) responseFetches.set(response, record);
        else audit.activeFetches.delete(record);
        return response;
      } catch (error) { audit.activeFetches.delete(record); throw error; }
    };
    const blobs = new WeakMap();
    const nativeBlob = Response.prototype.blob;
    Response.prototype.blob = async function (...args) {
      const tracked = isFrameURL(this.url);
      if (tracked) audit.activeBodies++;
      try {
        const blob = await nativeBlob.apply(this, args);
        if (tracked) blobs.set(blob, this.url);
        return blob;
      } finally {
        if (tracked) audit.activeBodies--;
        const record = responseFetches.get(this);
        if (record) { audit.activeFetches.delete(record); responseFetches.delete(this); }
      }
    };
    const tracked = new WeakMap();
    const nativeClose = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function (...args) {
      const bytes = tracked.get(this);
      if (bytes) {
        tracked.delete(this); audit.liveBitmaps--; audit.liveBytes -= bytes; audit.closedBitmaps++;
      }
      return nativeClose.apply(this, args);
    };
    const nativeDecode = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      if (!blobs.has(args[0])) return nativeDecode(...args);
      audit.decodes++; audit.activeDecodes++; audit.maxDecodes = Math.max(audit.maxDecodes, audit.activeDecodes);
      try {
        const bitmap = await nativeDecode(...args);
        const bytes = bitmap.width * bitmap.height * 4;
        tracked.set(bitmap, bytes); audit.liveBitmaps++; audit.liveBytes += bytes;
        audit.maxLiveBytes = Math.max(audit.maxLiveBytes, audit.liveBytes);
        const sourceURL = blobs.get(args[0]);
        bitmapSourceURLs.set(bitmap, sourceURL);
        if (!audit.sources.has(sourceURL)) {
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let clear = 0; let visible = 0; let total = 0; let signature = 2166136261;
          for (let y = 0; y < canvas.height; y += 8) for (let x = 0; x < canvas.width; x += 8) {
            total++; const offset = (y * canvas.width + x) * 4; const alpha = pixels[offset + 3];
            if (alpha < 8) clear++; if (alpha > 32) visible++;
            for (let channel = 0; channel < 4; channel++) signature = Math.imul(signature ^ pixels[offset + channel], 16777619);
          }
          const source = { width: bitmap.width, height: bitmap.height, bytes, signature: signature >>> 0,
            clearFraction: clear / total, visibleFraction: visible / total, url: sourceURL };
          audit.sources.set(sourceURL, source);
          audit.firstSource ??= source;
          canvas.width = 1; canvas.height = 1;
        }
        // Delay delivery of an actually decoded film frame. This exercises the
        // non-cancellable browser decode race without substituting test pixels.
        if (audit.holdDecodes) await new Promise(resolve => audit.heldDecodes.push({ url: sourceURL, release: resolve }));
        return bitmap;
      } finally { audit.activeDecodes--; }
    };
  });
  return { context, page, requests, manifests, injected, controls, setupComplete: setupComplete.promise };
}

function bookingSetupReplacement(entry, bookingReadyAt) {
  if (!bookingReadyAt || entry.label !== 'deep-link-#booking' || entry.method !== 'GET'
    || !isBookingSetup(entry.url) || !isKnownCancellation(entry.message)) return null;
  return report.completedSetupRequests.find(replacement => replacement.label === entry.label
    && replacement.url === entry.url && replacement.method === 'GET'
    && replacement.status >= 200 && replacement.status < 300
    && replacement.requestId > entry.requestId && replacement.finishedAt >= entry.failedAt
    && replacement.finishedAt <= bookingReadyAt) || null;
}

async function confirmBookingSetup(session) {
  // StrictMode cancels its first setup effect in development. Accept that
  // cancellation only after the replacement body finished and the real form
  // reached setup=ready, before closing this page. Preserve both observations.
  await session.page.locator('.cofein-booking-workspace').waitFor();
  await withDeadline(session.setupComplete, 15000, 'Booking setup responses did not finish successfully');
  const bookingReadyAt = Date.now();
  report.failedRequests = report.failedRequests.filter(entry => {
    const replacement = bookingSetupReplacement(entry, bookingReadyAt);
    if (!replacement) return true;
    report.cancelledResources.push({ ...entry, reason: 'Replaced StrictMode booking setup request', replacement, bookingReadyAt });
    return false;
  });
  check('Booking setup completed both real GET responses before closing', ['branding', 'floor-plan'].every(endpoint =>
    report.completedSetupRequests.some(entry => entry.label === 'deep-link-#booking' && new URL(entry.url).pathname.endsWith(`/${endpoint}`))));
}

async function close(session) {
  session.controls.closing = true;
  session.controls.releaseEngine(); session.controls.releaseAssets();
  await session.page.evaluate(() => {
    if (!window.__filmAudit) return;
    window.__filmAudit.holdDecodes = false;
    window.__filmAudit.heldDecodes.forEach(entry => entry.release());
  }).catch(() => {});
  await session.context.close();
}
async function navigate(page, hash = '') {
  await page.goto(`${origin}/cofein-preview.html${hash}`, { waitUntil: 'domcontentloaded' });
  await shell(page).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.cofein-intro-shell')?.dataset.ready === 'true');
  assert.equal(await page.locator('.coffee-scene').getAttribute('data-renderer'), 'photoreal-frames',
    'The real photoreal sequence must be integrated before this audit runs');
  await frame(page);
}
async function scroll(page, y) {
  await page.evaluate(top => window.scrollTo({ top, left: 0, behavior: 'instant' }), y);
  await frame(page);
}
async function settledFrame(page, expected) {
  await page.waitForFunction(index => {
    const scene = document.querySelector('.coffee-scene');
    return scene && Number(scene.dataset.targetFrame) === index && Number(scene.dataset.displayedFrame) === index;
  }, expected);
  await page.waitForFunction(() => window.__filmAudit.activeFetches.size === 0
    && window.__filmAudit.activeBodies === 0 && window.__filmAudit.activeDecodes === 0);
  await frame(page);
}
async function metrics(page, label) {
  const result = await page.evaluate(() => {
    const root = document.querySelector('.cofein-intro-shell');
    const content = document.querySelector('.cofein-intro-content');
    const scene = document.querySelector('.coffee-scene');
    const canvas = document.querySelector('.coffee-scene__reveal');
    const objects = document.querySelector('.coffee-scene__objects');
    const pageTop = Number(root.dataset.pageTop);
    let clear = 0; let clearAbovePage = 0; let total = 0;
    if (canvas) {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 8; y < canvas.height; y += 16) for (let x = 8; x < canvas.width; x += 16) {
        total++; const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (alpha < 16) clear++;
        if (y * canvas.clientHeight / canvas.height < pageTop - 3 && alpha < 250) clearAbovePage++;
      }
    }
    const audit = window.__filmAudit;
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      scrollY, state: root.dataset.coffeeIntro, progress: Number(root.dataset.progress), pageTop,
      runway: parseFloat(root.style.paddingTop || '0'), contentTop: content.getBoundingClientRect().top,
      contentInert: content.inert, contentTransform: getComputedStyle(content).transform,
      overlayCount: document.querySelectorAll('.cofein-intro-overlay').length,
      canvasCount: document.querySelectorAll('.coffee-scene canvas').length,
      renderer: scene?.dataset.renderer, displayed: Number(scene?.dataset.displayedFrame), target: Number(scene?.dataset.targetFrame),
      decodedBytes: Number(scene?.dataset.decodedBytes || 0), blobBytes: Number(scene?.dataset.blobBytes || 0),
      renderCount: Number(scene?.dataset.renderCount || 0), variant: scene?.dataset.variant,
      objectPixels: objects ? [objects.width, objects.height] : null,
      clearFraction: clear / Math.max(1, total), clearAbovePage,
      bodyOverflow: getComputedStyle(document.body).overflow, activeElement: document.activeElement?.id,
      draws: audit.draws, pending: audit.pending.size, fetches: audit.fetches, decodes: audit.decodes,
      activeFetches: audit.activeFetches.size, activeBodies: audit.activeBodies, activeDecodes: audit.activeDecodes,
      maxFetches: audit.maxFetches, maxDecodes: audit.maxDecodes,
      liveBitmaps: audit.liveBitmaps, liveBytes: audit.liveBytes, maxLiveBytes: audit.maxLiveBytes,
      closedBitmaps: audit.closedBitmaps, firstSource: audit.firstSource, sources: [...audit.sources.values()],
      introActiveAt: audit.introActiveAt, introEndedAt: audit.introEndedAt,
      naturalHandoff: audit.naturalHandoff,
    };
  });
  report.metrics.push({ label, ...result });
  check(`${label}: no horizontal overflow`, result.documentWidth <= result.width + 1);
  return result;
}
function budgets(label, result, mobile) {
  const decodedCap = (mobile ? 24 : 64) * MiB;
  check(`${label}: byte-bounded decoded images and reported Blob cache`, result.decodedBytes <= decodedCap
    && result.liveBytes <= decodedCap && result.blobBytes <= (mobile ? 12 : 24) * MiB);
  check(`${label}: at most three fetches and one decoder`, result.maxFetches <= 3 && result.maxDecodes <= 1);
  check(`${label}: real decoded image memory stays within cache plus one working frame`,
    result.maxLiveBytes <= decodedCap + (result.firstSource?.bytes || 0));
}
async function stableIdle(page, label) {
  const before = await metrics(page, `${label}-before-idle`);
  await page.waitForTimeout(350);
  const after = await metrics(page, `${label}-after-idle`);
  check(`${label}: no idle rendering, preloading or decoder loop`, after.draws === before.draws
    && after.renderCount === before.renderCount && after.fetches === before.fetches && after.decodes === before.decodes);
}
async function cleanHandoff(page, label, { top = 0, focus = false, modal = false, natural = false } = {}) {
  await page.waitForFunction(() => document.querySelector('.cofein-intro-shell')?.dataset.coffeeIntro !== 'active');
  await frame(page);
  const result = await metrics(page, label);
  if (natural) check(`${label}: scrolling reached the full runway before normal completion`, result.state === 'complete'
    && result.naturalHandoff?.progress >= 1 && result.naturalHandoff.scrollY >= result.naturalHandoff.runway - 1);
  check(`${label}: intro canvases and overlay are removed`, result.overlayCount === 0 && result.canvasCount === 0);
  check(`${label}: real content is unlocked without runway or transform`, !result.contentInert && result.runway === 0
    && result.contentTransform === 'none' && (modal || result.bodyOverflow !== 'hidden'));
  if (top !== null) check(`${label}: native scroll position is preserved`, Math.abs(result.scrollY - top) <= 2);
  if (focus) check(`${label}: skip restores focus to the restaurant`, result.activeElement === 'top');
  await page.waitForFunction(() => window.__filmAudit.liveBitmaps === 0 && window.__filmAudit.activeDecodes === 0
    && window.__filmAudit.activeBodies === 0
    && [...window.__filmAudit.activeFetches].every(item => item.signal?.aborted));
  const cleanup = await page.evaluate(async () => {
    const initialDraws = window.__filmAudit.draws;
    const started = performance.now(); let previousY = scrollY; let stableSince = started;
    while (performance.now() - started < 3000) {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (Math.abs(scrollY - previousY) > 0.1) { previousY = scrollY; stableSince = performance.now(); }
      if (performance.now() - stableSince >= 200) break;
    }
    return { initialDraws, finalDraws: window.__filmAudit.draws, pending: window.__filmAudit.pending.size,
      liveBitmaps: window.__filmAudit.liveBitmaps, liveBytes: window.__filmAudit.liveBytes };
  });
  report.metrics.push({ label: `${label}-cleanup`, ...cleanup });
  // Other restaurant components may schedule RAFs. The scene's own draws and
  // resources must stop; a global pending-RAF count remains diagnostic only.
  check(`${label}: disposal releases every decoded bitmap and stops scene drawing`, cleanup.liveBitmaps === 0
    && cleanup.liveBytes === 0 && cleanup.initialDraws === cleanup.finalDraws);
}
function displayedSource(result, manifest) {
  const variant = manifest.variants.find(candidate => (candidate.id || `${candidate.width}x${candidate.height}`) === result.variant);
  const url = variant?.frames[result.displayed];
  const source = result.sources.find(candidate => candidate.url === (url && new URL(url, origin).href));
  return { variant, source };
}
async function scenario(label, run) {
  if (selected && !selected.has(label)) return;
  try { await run(); }
  catch (error) { check(`${label}: completes without unexpected errors`, false); report.errors.push({ label, message: error.message, stack: error.stack }); }
}

try {
  for (const size of [{ name: 'desktop', width: 1440, height: 1000 },
    { name: 'phone390', width: 390, height: 844 }, { name: 'phone320', width: 320, height: 740 }]) {
    await scenario(size.name, async () => {
      const session = await createPage(size.name, size);
      const { page, requests, manifests } = session;
      try {
        await navigate(page); await ready(page); await settledFrame(page, 0);
        const manifest = manifests.at(-1);
        assert(manifest?.frameCount >= 2, 'The browser must load a real JSON sequence manifest');
        const initial = await metrics(page, `${size.name}-00-start`);
        const first = displayedSource(initial, manifest);
        check(`${size.name}: real alpha sequence and two separate composition layers`, initial.renderer === 'photoreal-frames'
          && initial.canvasCount === 2 && first.source?.clearFraction > 0.1 && first.source?.visibleFraction > 0.01);
        check(`${size.name}: the displayed source is the actual declared RGBA frame`, first.source
          && first.source.width === first.variant.width && first.source.height === first.variant.height);
        const displayedSignatures = new Set(first.source ? [first.source.signature] : []);
        check(`${size.name}: the real restaurant begins below the scene with native scrolling`, initial.state === 'active'
          && initial.scrollY === 0 && initial.runway > size.height && Math.abs(initial.contentTop - size.height) < 2 && initial.contentInert);
        check(`${size.name}: the initial page mask is opaque`, initial.clearFraction === 0 && initial.clearAbovePage === 0);
        check(`${size.name}: startup requests only a local frame neighborhood`, new Set(requests.filter(isFrame)).size <= 5);
        check(`${size.name}: the procedural engine stays unloaded`, !requests.some(url => /\/(?:coffeeWebGLScene|three)(?:[._/-])/.test(url)));
        const skip = await page.getByRole('button', { name: 'Към сайта' }).boundingBox();
        check(`${size.name}: skip has a 44-pixel touch target`, skip?.width >= 44 && skip?.height >= 44);
        budgets(`${size.name}-00`, initial, size.width <= 760);
        await capture(page, `${size.name}-00-start`);
        await stableIdle(page, `${size.name}-initial`);
        let firstStage; let previous = initial;
        for (const progress of [0.3, 0.55, 0.75, 0.9]) {
          await scroll(page, Math.round(initial.runway * progress));
          const actualProgress = Number(await shell(page).getAttribute('data-progress'));
          const expected = Math.round(actualProgress * (manifest.frameCount - 1));
          await settledFrame(page, expected);
          const label = `${size.name}-${Math.round(progress * 100)}`;
          const result = await metrics(page, label);
          const decoded = displayedSource(result, manifest);
          check(`${label}: real decoded frame matches the latest scroll target`, result.target === expected && result.displayed === expected
            && Math.abs(result.progress - progress) < 0.002 && Boolean(decoded.source));
          // An intentionally empty late frame is valid when the cup has left.
          // Check the decoded alpha itself; do not mistake the cleared output
          // canvas or its opacity fade for source-image transparency.
          check(`${label}: the actual decoded source retains transparent composition`, decoded.source?.clearFraction > 0.1);
          if (decoded.source) displayedSignatures.add(decoded.source.signature);
          check(`${label}: the page enters from below without revealing above its edge`, result.contentTop >= -1
            && result.contentTop <= previous.contentTop + 2 && Math.abs(result.contentTop - result.pageTop) < 2 && result.clearAbovePage === 0);
          check(`${label}: wet reveal advances with the displayed film`, result.clearFraction >= previous.clearFraction - 0.015);
          const firstImpact = Math.min(...(manifest.impacts || []).map(impact => impact.at));
          if (progress > firstImpact + 0.04) check(`${label}: actual recorded landings reveal the restaurant`, result.clearFraction > 0);
          budgets(label, result, size.width <= 760);
          if (!firstStage) firstStage = result;
          previous = result;
          await capture(page, label);
        }
        await scroll(page, Math.round(initial.runway * 0.3));
        await settledFrame(page, firstStage.displayed);
        const reverse = await metrics(page, `${size.name}-rewind`);
        check(`${size.name}: reverse scrolling reconstructs the earlier frame and mask`, reverse.displayed === firstStage.displayed
          && Math.abs(reverse.clearFraction - firstStage.clearFraction) < 0.015 && Math.abs(reverse.contentTop - firstStage.contentTop) < 2);
        await capture(page, `${size.name}-rewind`);
        await stableIdle(page, `${size.name}-reverse`);
        check(`${size.name}: actual source pixels change through the sequence`, displayedSignatures.size > 1);
        check(`${size.name}: a complete staged visit does not fetch all frames`, new Set(requests.filter(isFrame)).size < manifest.frameCount);
        await scroll(page, initial.runway);
        await cleanHandoff(page, `${size.name}-handoff`, { natural: true });
        check(`${size.name}: restaurant actions are interactive after handoff`, await page.locator('.hero-actions')
          .getByRole('button', { name: 'Резервирай маса', exact: true }).evaluate(element => !element.closest('[inert]') && !element.disabled));
        await capture(page, `${size.name}-100-site`);
        await scroll(page, 0);
        check(`${size.name}: returning to the top does not replay`, await page.locator('.cofein-intro-overlay').count() === 0);
      } finally { await close(session); }
    });
  }

  for (const method of ['click', 'keyboard', 'Escape']) await scenario(`skip-${method}`, async () => {
    const session = await createPage(`skip-${method}`, { width: 390, height: 844 });
    try {
      await navigate(session.page); await ready(session.page);
      if (method === 'click') await session.page.getByRole('button', { name: 'Към сайта' }).click();
      else if (method === 'keyboard') {
        await session.page.keyboard.press(keyboardNavigationKey);
        check(`Keyboard skip is reachable with ${keyboardNavigationKey} before inert content`, await session.page.getByRole('button', { name: 'Към сайта' })
          .evaluate(element => element === document.activeElement));
        await session.page.keyboard.press('Enter');
      } else await session.page.keyboard.press('Escape');
      await cleanHandoff(session.page, `skip-${method}`, { focus: true });
    } finally { await close(session); }
  });

  await scenario('skip-before-load', async () => {
    const session = await createPage('skip-before-load', { gateEngine: true, width: 390, height: 844 });
    try {
      await navigate(session.page);
      await session.page.getByRole('button', { name: 'Към сайта' }).click();
      session.controls.releaseEngine();
      await cleanHandoff(session.page, 'skip-before-load', { focus: true });
      await session.page.waitForTimeout(350);
      check('Skipping before the renderer arrives downloads no manifest or frames', !session.requests.some(isMedia));
      check('A late renderer cannot remount the dismissed scene', await session.page.locator('.coffee-scene').count() === 0);
    } finally { await close(session); }
  });

  await scenario('rapid-reversal', async () => {
    const session = await createPage('rapid-reversal', { width: 390, height: 844 });
    try {
      const { page, manifests } = session;
      await navigate(page); await ready(page); await settledFrame(page, 0);
      const manifest = manifests.at(-1);
      const initial = await metrics(page, 'rapid-reversal-start');
      const { variant, source } = displayedSource(initial, manifest);
      assert(source, 'Rapid reversal must start from a real decoded frame');
      await page.evaluate(() => { window.__filmAudit.paints.length = 0; window.__filmAudit.holdDecodes = true; });
      await scroll(page, Math.round(initial.runway * 0.75));
      await page.waitForFunction(() => window.__filmAudit.heldDecodes.length > 0, null, { timeout: 3000 });
      const heldURL = await page.evaluate(() => window.__filmAudit.heldDecodes[0].url);
      // Do not settle between these seeks: the actual earlier bitmap remains
      // in flight while the latest target changes in both directions.
      for (const progress of [0.3, 0.9, 0.55]) await scroll(page, Math.round(initial.runway * progress));
      const actualProgress = Number(await shell(page).getAttribute('data-progress'));
      const expected = Math.round(actualProgress * (manifest.frameCount - 1));
      const expectedURL = new URL(variant.frames[expected], origin).href;
      const pending = await metrics(page, 'rapid-reversal-pending');
      check('Rapid reversal holds the previous real image while the latest target waits', pending.state === 'active'
        && pending.target === expected && pending.displayed === initial.displayed && heldURL !== expectedURL);
      check('Rapid reversal does not paint any unready or obsolete frame', await page.evaluate(initialURL =>
        window.__filmAudit.paints.every(paint => paint.url === initialURL), source.url));
      await page.evaluate(() => {
        window.__filmAudit.holdDecodes = false;
        window.__filmAudit.heldDecodes.forEach(entry => entry.release());
      });
      await settledFrame(page, expected);
      const result = await metrics(page, 'rapid-reversal-settled');
      const paints = await page.evaluate(() => window.__filmAudit.paints);
      check('A late decoded real frame cannot overwrite the reversed target', paints.length > 0
        && paints.every(paint => paint.url === source.url || paint.url === expectedURL)
        && !paints.some(paint => paint.url === heldURL) && paints.at(-1).url === expectedURL
        && result.displayed === expected && result.target === expected);
      budgets('rapid-reversal', result, true);
      await capture(page, 'rapid-reversal-settled');
      await stableIdle(page, 'rapid-reversal');
      await page.getByRole('button', { name: 'Към сайта' }).click();
      await cleanHandoff(page, 'rapid-reversal-cleanup', { focus: true });
    } finally { await close(session); }
  });

  await scenario('skip-pending-first-frame', async () => {
    const session = await createPage('skip-pending-first-frame', { failure: 'slow-frame', width: 390, height: 844 });
    try {
      await navigate(session.page);
      await withDeadline(session.controls.blockedAsset, 3000, 'No actual first-frame request reached the audit gate');
      check('The first real frame is pending when skip is pressed', session.injected.size > 0
        && await shell(session.page).getAttribute('data-coffee-intro') === 'active'
        && await shell(session.page).getAttribute('data-ready') !== 'true');
      await session.page.getByRole('button', { name: 'Към сайта' }).click();
      await cleanHandoff(session.page, 'skip-pending-first-frame', { focus: true });
      session.controls.releaseAssets();
      await session.page.waitForTimeout(500);
      const result = await metrics(session.page, 'skip-pending-first-frame-late-assets');
      check('Late first-frame downloads cannot paint or remount after skip', result.overlayCount === 0
        && result.canvasCount === 0 && !result.contentInert && result.liveBitmaps === 0
        && await session.page.evaluate(() => window.__filmAudit.paints.length === 0));
    } finally { await close(session); }
  });

  for (const hash of ['#booking', '#menu', '#spaces', '#visit', '#top', '#%E0%A4%A']) await scenario(`deep-link-${hash}`, async () => {
    const session = await createPage(`deep-link-${hash}`, { width: 390, height: 844 });
    try {
      await navigate(session.page, hash); await frame(session.page);
      check(`${hash}: direct navigation bypasses the opening`, await shell(session.page).getAttribute('data-coffee-intro') === 'bypassed');
      check(`${hash}: no film module, manifest or frame request`, !session.requests.some(url => isMedia(url) || isSceneEntry(url)));
      check(`${hash}: no film preload`, await session.page.locator('link[rel=preload][href*="/cofein/intro/"]').count() === 0);
      await cleanHandoff(session.page, `deep-link-${hash}`, { top: null, modal: ['#booking', '#menu'].includes(hash) });
      if (hash === '#booking') {
        await session.page.locator('.cofein-booking[data-step=workspace]').waitFor();
        await confirmBookingSetup(session);
        check('Direct booking remains usable', await session.page.locator('[name=reservedDate]').isVisible());
      }
      if (hash === '#menu') { await session.page.locator('.cofein-menu .menu-dish').first().waitFor(); check('Direct menu remains usable', await session.page.locator('dialog[open]').count() === 1); }
    } finally { await close(session); }
  });

  await scenario('reduced-motion', async () => {
    const session = await createPage('reduced-motion', { reducedMotion: 'reduce', width: 390, height: 844 });
    try {
      await navigate(session.page); await cleanHandoff(session.page, 'reduced-motion');
      check('Reduced motion bypasses the film without downloading its manifest or frames',
        await shell(session.page).getAttribute('data-coffee-intro') === 'bypassed' && !session.requests.some(url => isMedia(url) || isSceneEntry(url)));
    } finally { await close(session); }
  });

  await scenario('changing-motion-preference', async () => {
    const session = await createPage('changing-motion-preference');
    try {
      await navigate(session.page); await ready(session.page);
      await session.page.emulateMedia({ reducedMotion: 'reduce' });
      await cleanHandoff(session.page, 'changing-motion-preference');
      await session.page.emulateMedia({ reducedMotion: 'no-preference' });
      check('Enabling motion again does not restart the film', await session.page.locator('.coffee-scene').count() === 0);
    } finally { await close(session); }
  });

  for (const failure of ['manifest-404', 'frame-404', 'slow-frame', 'slow-target', 'late-target-404']) await scenario(failure, async () => {
    const session = await createPage(failure, { failure, width: 390, height: 844 });
    try {
      let failedTargetURL;
      await navigate(session.page);
      if (failure === 'slow-target' || failure === 'late-target-404') {
        await ready(session.page); await settledFrame(session.page, 0);
        if (failure === 'late-target-404') {
          const manifest = session.manifests.at(-1);
          const variantID = await session.page.locator('.coffee-scene').getAttribute('data-variant');
          const variant = manifest.variants.find(candidate => (candidate.id || `${candidate.width}x${candidate.height}`) === variantID);
          failedTargetURL = new URL(variant.frames[Math.round(0.75 * (manifest.frameCount - 1))], origin).href;
        }
        session.controls.armed = true;
        const runway = await shell(session.page).evaluate(element => parseFloat(element.style.paddingTop));
        await scroll(session.page, runway * 0.75);
      }
      await cleanHandoff(session.page, failure);
      const timing = await session.page.evaluate(() => ({ activeAt: window.__filmAudit.introActiveAt,
        endedAt: window.__filmAudit.introEndedAt }));
      const elapsed = timing.endedAt !== null && session.controls.firstInjectedAt !== null
        ? timing.endedAt - session.controls.firstInjectedAt : null;
      report.metrics.push({ label: failure, failOpenElapsedMs: elapsed,
        assetBlockedAt: session.controls.firstInjectedAt, ...timing });
      check(`${failure}: an active intro encountered the intended blocked asset`, session.injected.size > 0
        && timing.activeAt !== null && elapsed !== null && elapsed >= 0);
      check(`${failure}: an unavailable frame cannot trap the visitor`, elapsed !== null && elapsed >= 0
        && elapsed < (failure.includes('slow') ? 6000 : 4500));
      // The late-frame case has already cleared the shell's startup deadline.
      // Its failure must therefore come from the held target's own timeout.
      if (failure === 'slow-target') check('slow-target: the requested frame timeout was actually exercised',
        elapsed !== null && elapsed >= 4000);
      if (failure === 'late-target-404') check('late-target-404: the new target received HTTP 404 after initial readiness',
        session.injected.has(failedTargetURL)
        && report.expectedFailures.some(entry => entry.label === failure && entry.url === failedTargetURL && entry.status === 404));
      session.controls.releaseAssets();
      await session.page.waitForTimeout(500);
      check(`${failure}: late downloads cannot restore the dismissed scene`, await session.page.locator('.coffee-scene').count() === 0
        && !(await session.page.locator('.cofein-intro-content').evaluate(element => element.inert)));
    } finally { await close(session); }
  });

  await scenario('resize-and-rotation', async () => {
    const session = await createPage('resize-and-rotation', { width: 390, height: 844 });
    try {
      const { page } = session;
      await navigate(page); await ready(page);
      const initial = await metrics(page, 'rotation-start');
      await scroll(page, initial.runway * 0.55);
      await page.setViewportSize({ width: 844, height: 390 }); await frame(page);
      const expected = Math.round(Number(await shell(page).getAttribute('data-progress')) * (session.manifests.at(-1).frameCount - 1));
      await settledFrame(page, expected);
      const landscape = await metrics(page, 'rotation-landscape');
      check('Rotation retains the existing decoded variant and aligns the mask with the page', landscape.variant === initial.variant
        && Math.abs(landscape.contentTop - landscape.pageTop) < 2 && landscape.clearAbovePage === 0);
      budgets('Rotation retains the mobile memory ceiling', landscape, true);
      await capture(page, 'rotation-landscape');
      await page.setViewportSize({ width: 390, height: 844 }); await frame(page);
      await scroll(page, initial.runway + 91);
      await cleanHandoff(page, 'rotation-handoff', { top: 91, natural: true });
    } finally { await close(session); }
  });

  await scenario('native-touch-pan', async () => {
    if (browserEngine !== 'chromium') {
      const reason = 'Native touch pan uses Chromium CDP Input.dispatchTouchEvent; Playwright WebKit has no CDP session.';
      report.skippedScenarios.push({ name: 'native-touch-pan', reason });
      console.log(`SKIP: native-touch-pan: ${reason}`);
      return;
    }
    const session = await createPage('native-touch-pan', { width: 390, height: 844 });
    try {
      const { page, context } = session;
      await navigate(page); await ready(page);
      const client = await context.newCDPSession(page);
      const swipe = async () => {
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 710 }] });
        for (let step = 1; step <= 12; step++) {
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 710 - step * 33 }] });
          await page.waitForTimeout(24);
        }
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(180);
      };
      await swipe();
      check('Real touch scrolling advances the native intro runway', await page.evaluate(() => scrollY > 120));
      for (let attempt = 0; attempt < 5 && await shell(page).getAttribute('data-coffee-intro') === 'active'; attempt++) await swipe();
      await cleanHandoff(page, 'native-touch-handoff', { top: null, natural: true });
      check('Touch scrolling does not activate covered page controls', await page.locator('dialog[open]').count() === 0);
    } finally { await close(session); }
  });

  await scenario('browser-back', async () => {
    const session = await createPage('browser-back');
    try {
      await navigate(session.page); await ready(session.page); await scroll(session.page, 450);
      session.controls.navigatingAway = true;
      await session.page.goto('about:blank'); session.requests.length = 0;
      await session.page.goBack({ waitUntil: 'domcontentloaded' }); await shell(session.page).waitFor();
      session.controls.navigatingAway = false;
      await cleanHandoff(session.page, 'browser-back', { top: null });
      check('Browser Back requests no new film manifest or frames', !session.requests.some(url => isMedia(url) || isSceneEntry(url)));
    } finally { await close(session); }
  });

  check('No unexpected JavaScript exceptions or scenario failures', report.errors.length === 0);
  check('No unexpected browser console errors', report.consoleErrors.length === 0);
  check('No unexpected HTTP failures', report.failedResources.length === 0 && report.failedRequests.length === 0);
  check('The audit sent no write requests', report.writes === 0);
} finally {
  await fs.writeFile(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.checks.some(item => !item.passed)) process.exitCode = 1;
