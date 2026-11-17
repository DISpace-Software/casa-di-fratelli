// Read-only, local Chromium checks for the scroll-driven Cofein introduction.
// Usage: node script <origin> <output-dir> <playwright-module> <chromium-binary> [comma-separated-scenarios]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [origin, outputRoot, playwrightPath, chromiumPath, scenarioFilter] = process.argv.slice(2);
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Only local sites are permitted');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
await fs.mkdir(outputRoot, { recursive: true });
const selectedScenarios = scenarioFilter ? new Set(scenarioFilter.split(',')) : null;
const handoffProgress = 1;
const isSceneEntry = url => /\/coffeeWebGLScene(?:[.-]|\/)/i.test(url);
const isSceneRuntime = url => isSceneEntry(url) || /\/(?:three(?:[._-]|\/))/i.test(url);
const report = { localOnly: true, realBrowser: true, selectedScenarios: selectedScenarios ? [...selectedScenarios] : 'all', checks: [], errors: [], consoleErrors: [], expectedFailures: [], failedResources: [], screenshots: [], metrics: [], writes: 0 };
const check = (name, result) => { report.checks.push({ name, passed: Boolean(result) }); console.log(`${result ? 'PASS' : 'FAIL'}: ${name}`); };
const shell = page => page.locator('.cofein-intro-shell');
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function capture(page, label) {
  const file = `${label}.png`;
  await page.screenshot({ path: path.join(outputRoot, file), animations: 'disabled' });
  report.screenshots.push(file);
}
async function createPage(label, { width = 1440, height = 1000, reducedMotion = 'no-preference', engineFailure = false, engineDelay = 0, earlyContextLoss = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900, deviceScaleFactor: 1, locale: 'bg-BG', timezoneId: 'Europe/Sofia', reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => report.errors.push({ label, message: error.message }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const entry = { label, message: message.text(), url: message.location().url };
    if (engineFailure && isSceneEntry(entry.url) && /Failed to load resource|ERR_FAILED/.test(entry.message)) report.expectedFailures.push(entry);
    else report.consoleErrors.push(entry);
  });
  page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ label, status: response.status(), url: response.url() }); });
  await page.route('**/*', async route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) { report.writes++; return route.abort(); }
    if (isSceneEntry(route.request().url())) {
      if (engineFailure) return route.abort('failed');
      if (engineDelay) await new Promise(resolve => setTimeout(resolve, engineDelay));
    }
    return route.continue().catch(() => {});
  });
  await page.addInitScript(loseEarly => {
    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    const pending = new Set();
    window.__introAudit = { frames: 0, draws: 0, pending };
    window.requestAnimationFrame = callback => {
      const id = raf(time => { pending.delete(id); window.__introAudit.frames++; callback(time); });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { pending.delete(id); caf(id); };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('coffee-scene__reveal')) window.__introAudit.draws++;
      return clear.apply(this, args);
    };
    if (loseEarly) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const context = getContext.apply(this, args);
        if (args[0] === 'webgl2' && this.classList.contains('coffee-scene__objects') && !window.__contextLossScheduled) {
          window.__contextLossScheduled = true;
          // This microtask runs when scene construction reaches its texture
          // await, before the logo's load event can resolve the scene promise.
          queueMicrotask(() => {
            const extension = context?.getExtension('WEBGL_lose_context');
            window.__contextLossAudit = { requested: Boolean(extension), at: performance.now(), readyBefore: document.querySelector('.cofein-intro-shell')?.dataset.ready === 'true' };
            extension?.loseContext();
          });
        }
        return context;
      };
    }
  }, earlyContextLoss);
  return { context, page, requests };
}
async function navigate(page, hash = '') {
  await page.goto(`${origin}/cofein-preview.html${hash}`, { waitUntil: 'domcontentloaded' });
  await shell(page).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function ready(page) { await page.waitForFunction(() => document.querySelector('.cofein-intro-shell')?.dataset.ready === 'true'); await frame(page); }
async function scroll(page, y) { await page.evaluate(top => window.scrollTo({ top, left: 0, behavior: 'instant' }), y); await frame(page); }
async function metrics(page, label) {
  const result = await page.evaluate(() => {
    const content = document.querySelector('.cofein-intro-content');
    const scene = document.querySelector('.coffee-scene');
    const canvas = document.querySelector('.coffee-scene__reveal');
    const objects = document.querySelector('.coffee-scene__objects');
    const webgl = objects?.getContext('webgl2');
    const pageTop = Number(document.querySelector('.cofein-intro-shell').dataset.pageTop);
    let clear = 0;
    let clearAbovePage = 0;
    let sampledAbovePage = 0;
    if (canvas) {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let y = 8; y < canvas.height; y += 16) for (let x = 8; x < canvas.width; x += 16) {
        total++;
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (alpha < 16) clear++;
        if (y * canvas.clientHeight / canvas.height < pageTop - 3) {
          sampledAbovePage++;
          if (alpha < 250) clearAbovePage++;
        }
      }
      clear /= Math.max(1, total);
    }
    return {
      width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, scrollY,
      state: document.querySelector('.cofein-intro-shell').dataset.coffeeIntro,
      progress: Number(document.querySelector('.cofein-intro-shell').dataset.progress),
      pageTop,
      runway: parseFloat(document.querySelector('.cofein-intro-shell').style.paddingTop || '0'),
      mainTop: document.querySelector('main').getBoundingClientRect().top,
      heroTop: document.querySelector('.hero').getBoundingClientRect().top,
      contentTop: content.getBoundingClientRect().top,
      headerHeight: document.querySelector('.site-header').getBoundingClientRect().height,
      contentInert: content.inert, contentTransform: getComputedStyle(content).transform,
      overlayCount: document.querySelectorAll('.cofein-intro-overlay').length,
      sceneCount: document.querySelectorAll('.coffee-scene').length,
      canvasCount: document.querySelectorAll('.coffee-scene canvas').length,
      renderer: scene?.dataset.renderer || null,
      webglVersion: webgl ? webgl.getParameter(webgl.VERSION) : null,
      fluidFraction: scene ? Number(scene.dataset.fluidFraction) : null,
      dropCount: scene ? Number(scene.dataset.dropCount) : null,
      visibleDropCount: scene ? Number(scene.dataset.visibleDropCount) : null,
      renderCount: scene ? Number(scene.dataset.renderCount) : null,
      clearFraction: clear,
      clearAbovePage, sampledAbovePage,
      bodyOverflow: getComputedStyle(document.body).overflow,
      activeElement: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName,
      pendingFrames: window.__introAudit.pending.size, draws: window.__introAudit.draws,
    };
  });
  report.metrics.push({ label, ...result });
  check(`${label}: no horizontal overflow`, result.documentWidth <= result.width + 1);
  return result;
}
async function cleanHandoff(page, label, { top = 0, focus = false } = {}) {
  await page.waitForFunction(() => document.querySelector('.cofein-intro-shell')?.dataset.coffeeIntro !== 'active');
  await frame(page);
  const result = await metrics(page, label);
  check(`${label}: intro canvas and overlay are removed`, result.overlayCount === 0 && result.canvasCount === 0);
  check(`${label}: content is unlocked with no runway or transform`, !result.contentInert && result.runway === 0 && result.contentTransform === 'none' && result.bodyOverflow !== 'hidden');
  if (top !== null) check(`${label}: correct native page position`, Math.abs(result.scrollY - top) <= 2);
  if (focus) check(`${label}: skip moves focus to the restaurant page`, result.activeElement === 'top');
  const cleanup = await page.evaluate(async () => {
    const initialDraws = window.__introAudit.draws;
    const started = performance.now();
    let previousY = scrollY;
    let stableSince = started;
    // A touch gesture can still be coasting after the scene has unmounted.
    // Normal page/header RAF callbacks during that scroll are not a scene leak.
    while (performance.now() - started < 3000) {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (Math.abs(scrollY - previousY) > 0.1) {
        previousY = scrollY;
        stableSince = performance.now();
      }
      if (performance.now() - stableSince >= 200 && window.__introAudit.pending.size === 0) {
        return { settled: true, initialDraws, finalDraws: window.__introAudit.draws, pending: 0, waitMs: performance.now() - started };
      }
    }
    return { settled: false, initialDraws, finalDraws: window.__introAudit.draws, pending: window.__introAudit.pending.size, waitMs: performance.now() - started };
  });
  report.metrics.push({ label: `${label}-cleanup`, ...cleanup });
  check(`${label}: scene drawing stops and no idle animation loop remains`, cleanup.settled && cleanup.initialDraws === cleanup.finalDraws && cleanup.pending === 0);
}
async function scenario(label, run) {
  if (selectedScenarios && !selectedScenarios.has(label)) return;
  try { await run(); }
  catch (error) { check(`${label}: completes without unexpected errors`, false); report.errors.push({ label, message: error.message, stack: error.stack }); }
}

try {
  for (const size of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'tablet', width: 900, height: 1100 },
    { name: 'phone390', width: 390, height: 844 },
    { name: 'phone320', width: 320, height: 740 },
    { name: 'landscape', width: 844, height: 390 },
  ]) await scenario(size.name, async () => {
    const { context, page, requests } = await createPage(size.name, size);
    try {
      await navigate(page); await ready(page);
      const initial = await metrics(page, `${size.name}-start`);
      check(`${size.name}: a native scroll runway starts at zero`, initial.state === 'active' && initial.scrollY === 0 && initial.progress === 0 && initial.runway > size.height);
      check(`${size.name}: the real restaurant begins below the cup scene`, Math.abs(initial.contentTop - size.height) <= 2 && initial.mainTop > size.height);
      check(`${size.name}: covered restaurant content is inert`, initial.contentInert);
      // Playwright's role query does not filter the native inert subtree.
      check(`${size.name}: skip is the sole reachable action`, await page.locator('button').evaluateAll(buttons => buttons.filter(button => !button.closest('[inert]') && button.getClientRects().length).length === 1) && await page.getByRole('button', { name: 'Към сайта' }).isVisible());
      const skipBox = await page.getByRole('button', { name: 'Към сайта' }).boundingBox();
      check(`${size.name}: skip has a 44-pixel touch target`, skipBox.width >= 44 && skipBox.height >= 44);
      check(`${size.name}: the cup is rendered by a live WebGL scene`, initial.renderer === 'webgl' && initial.canvasCount === 2 && initial.webglVersion?.includes('WebGL') && initial.renderCount > 0);
      check(`${size.name}: the original restaurant lettering loads as the texture`, requests.some(url => url.includes('/cofein/brand/cofein-lockup.svg')));
      check(`${size.name}: no obsolete cup or saucer pictures are fetched or preloaded`, !requests.some(url => url.includes('/cofein/intro/')) && await page.locator('link[rel=preload][href*="/cofein/intro/"]').count() === 0);
      check(`${size.name}: menu and booking modules remain deferred`, !requests.some(url => /\/Cofein(?:Menu|Booking)\./.test(url)));
      check(`${size.name}: the cup initially contains coffee`, Number.isFinite(initial.fluidFraction) && initial.fluidFraction > 0.6 && initial.fluidFraction <= 1);
      check(`${size.name}: the initial mask fully covers the page`, initial.clearFraction === 0 && initial.clearAbovePage === 0);
      await capture(page, `${size.name}-00-start`);
      let previousClear = initial.clearFraction;
      let previousTop = initial.contentTop;
      let previousVolume = initial.fluidFraction;
      let maximumDropCount = 0;
      let firstStage;
      for (const progress of [0.35, 0.55, 0.75, 0.90, 0.985]) {
        await scroll(page, Math.round(initial.runway * progress));
        const label = `${size.name}-${Math.round(progress * 100)}-reveal`;
        const result = await metrics(page, label);
        check(`${label}: scroll determines the scene progress`, result.state === 'active' && Math.abs(result.progress - progress) < 0.002);
        check(`${label}: the real page approaches from below and agrees with the mask`, result.contentTop >= -1 && result.contentTop <= previousTop + 2 && Math.abs(result.contentTop - result.pageTop) < 2);
        check(`${label}: reveal droplets never expose an area above the real page`, result.clearAbovePage === 0);
        check(`${label}: revealed area grows`, result.clearFraction >= previousClear - 0.01);
        check(`${label}: remaining coffee decreases as the cup pours`, Number.isFinite(result.fluidFraction) && result.fluidFraction >= 0 && result.fluidFraction <= previousVolume + 0.005);
        if (progress <= 0.75 && result.dropCount > 0) {
          check(`${label}: pouring droplets remain inside the viewport`, Number.isFinite(result.visibleDropCount) && result.visibleDropCount >= Math.min(4, result.dropCount) && result.visibleDropCount / result.dropCount >= 0.7);
        }
        if (!firstStage) firstStage = result;
        maximumDropCount = Math.max(maximumDropCount, result.dropCount);
        previousTop = result.contentTop;
        previousVolume = result.fluidFraction;
        previousClear = result.clearFraction;
        if (progress === 0.985) {
          check(`${label}: the restaurant is revealed before normal scrolling resumes`, result.clearFraction > 0.9 && Math.abs(result.contentTop) < 2);
          check(`${label}: the cup has substantially emptied`, result.fluidFraction < initial.fluidFraction * 0.2);
        }
        await capture(page, label);
      }
      check(`${size.name}: pouring produces multiple separate 3D drops`, maximumDropCount >= 4);
      // Reversing before completion must reconstruct the same view, not accumulate holes.
      await scroll(page, initial.runway * 0.35);
      const reverse = await metrics(page, `${size.name}-reverse`);
      check(`${size.name}: scrolling upward reverses the reveal and page position`, reverse.state === 'active' && Math.abs(reverse.clearFraction - firstStage.clearFraction) < 0.015 && Math.abs(reverse.contentTop - firstStage.contentTop) < 2);
      check(`${size.name}: reversing restores the corresponding liquid volume`, Math.abs(reverse.fluidFraction - firstStage.fluidFraction) < 0.005);
      // Controls must unlock as soon as the visual reveal has finished.
      await scroll(page, Math.ceil(initial.runway * handoffProgress));
      await cleanHandoff(page, `${size.name}-100-handoff`);
      check(`${size.name}: visible restaurant controls are interactive at completion`, await page.locator('.hero-actions').getByRole('button', { name: 'Разгледай менюто', exact: true }).evaluate(element => !element.closest('[inert]') && !element.disabled));
      await capture(page, `${size.name}-100-site`);
      await scroll(page, 0);
      check(`${size.name}: returning to the top does not replay the introduction`, await shell(page).getAttribute('data-coffee-intro') === 'complete' && await page.locator('.cofein-intro-overlay').count() === 0);
      await page.locator('.hero-actions').getByRole('button', { name: 'Разгледай менюто', exact: true }).click();
      await page.locator('.cofein-menu .menu-dish').first().waitFor();
      check(`${size.name}: real menu works after the handoff`, await page.locator('dialog[open]').count() === 1 && new URL(page.url()).hash === '#menu');
      await page.getByRole('button', { name: 'Затвори прозореца', exact: true }).click();
      await page.locator('dialog[open]').waitFor({ state: 'detached' });
      await page.locator('.hero-actions').getByRole('button', { name: 'Резервирай маса', exact: true }).click();
      await page.locator('.cofein-booking[data-step=workspace]').waitFor();
      check(`${size.name}: real reservation form works after the handoff`, await page.locator('[name=reservedDate]').isVisible() && new URL(page.url()).hash === '#booking');
      await page.getByRole('button', { name: 'Затвори прозореца', exact: true }).click();
      await page.locator('dialog[open]').waitFor({ state: 'detached' });
      check(`${size.name}: closing reservation restores its trigger`, await page.locator('.hero-actions').getByRole('button', { name: 'Резервирай маса', exact: true }).evaluate(element => element === document.activeElement));
    } finally { await context.close(); }
  });

  for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'phone390', width: 390, height: 844 }]) await scenario(`overscroll-${size.name}`, async () => {
    const { context, page } = await createPage(`overscroll-${size.name}`, size);
    try {
      await navigate(page); await ready(page);
      const initial = await metrics(page, `overscroll-${size.name}-start`);
      await scroll(page, Math.ceil(initial.runway * handoffProgress) + 120);
      await cleanHandoff(page, `overscroll-${size.name}-handoff`, { top: 120 });
      check(`${size.name}: handoff preserves 120 pixels of overscroll`, await page.evaluate(() => Math.abs(scrollY - 120) <= 2));
    } finally { await context.close(); }
  });

  for (const method of ['click', 'keyboard', 'Escape']) await scenario(`skip-${method}`, async () => {
    const { context, page } = await createPage(`skip-${method}`, { width: 390, height: 844 });
    try {
      await navigate(page); await ready(page);
      if (method === 'click') {
        await scroll(page, 500);
        await page.getByRole('button', { name: 'Към сайта' }).click();
      } else if (method === 'keyboard') {
        await page.keyboard.press('Tab');
        check('keyboard skip: Tab focuses the skip action', await page.getByRole('button', { name: 'Към сайта' }).evaluate(element => element === document.activeElement));
        await page.keyboard.press('Enter');
      } else await page.keyboard.press('Escape');
      await cleanHandoff(page, `skip-${method}`, { focus: true });
    } finally { await context.close(); }
  });

  await scenario('native-keyboard-wheel', async () => {
    const { context, page } = await createPage('native-keyboard-wheel');
    try {
      await navigate(page); await ready(page);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(450);
      check('PageDown advances the introduction without custom key interception', await page.evaluate(() => scrollY > 200 && Number(document.querySelector('.cofein-intro-shell').dataset.progress) > 0));
      await page.mouse.wheel(0, 3500);
      await page.waitForTimeout(450);
      await cleanHandoff(page, 'native-wheel-handoff', { top: null });
      check('Native wheel continues into the restaurant page', await page.evaluate(() => scrollY > 100));
    } finally { await context.close(); }
  });

  await scenario('native-touch-pan', async () => {
    const { context, page } = await createPage('native-touch-pan', { width: 390, height: 844 });
    try {
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
      check('Real mobile touch pan advances the reveal over inert restaurant content', await page.evaluate(() => scrollY > 120 && Number(document.querySelector('.cofein-intro-shell').dataset.progress) > 0));
      await capture(page, 'phone390-touch-pan');
      for (let attempt = 0; attempt < 5 && await shell(page).getAttribute('data-coffee-intro') === 'active'; attempt++) await swipe();
      await cleanHandoff(page, 'native-touch-handoff', { top: null });
      check('Touch scrolling never opens an underlying action accidentally', await page.locator('dialog[open]').count() === 0);
    } finally { await context.close(); }
  });

  for (const hash of ['#booking', '#menu', '#spaces', '#visit', '#top', '#%E0%A4%A']) await scenario(`deep-link-${hash}`, async () => {
    const { context, page, requests } = await createPage(`deep-link-${hash}`, { width: 390, height: 844 });
    try {
      await navigate(page, hash); await frame(page);
      check(`${hash}: initial navigation bypasses the introduction`, await shell(page).getAttribute('data-coffee-intro') === 'bypassed');
      check(`${hash}: bypass does not download the WebGL engine or Three.js`, !requests.some(isSceneRuntime));
      check(`${hash}: bypass has no scene canvas or old raster preloads`, await page.locator('.coffee-scene canvas, link[rel=preload][href*="/cofein/intro/"]').count() === 0);
      check(`${hash}: content remains unlocked`, !(await page.locator('.cofein-intro-content').evaluate(element => element.inert)));
      if (hash === '#booking') { await page.locator('.cofein-booking[data-step=workspace]').waitFor(); check('Direct booking is usable', await page.locator('[name=reservedDate]').isVisible()); }
      else if (hash === '#menu') { await page.locator('.cofein-menu .menu-dish').first().waitFor(); check('Direct menu is usable', await page.locator('.menu-modal[open]').count() === 1); }
      else if (hash === '#spaces' || hash === '#visit') {
        await page.waitForTimeout(600);
        check(`${hash}: anchor destination remains visible`, await page.locator(hash).evaluate(element => Math.abs(element.getBoundingClientRect().top) <= innerHeight));
      }
    } finally { await context.close(); }
  });

  await scenario('mid-intro-deep-link', async () => {
    const { context, page } = await createPage('mid-intro-deep-link');
    try {
      await navigate(page); await ready(page);
      await page.evaluate(() => { location.hash = '#booking'; });
      await page.locator('.cofein-booking[data-step=workspace]').waitFor();
      check('A booking hash received during the introduction opens the real form', await page.locator('.booking-modal[open]').count() === 1 && await page.locator('.cofein-intro-overlay').count() === 0);
      check('A booking hash removes intro inert state without removing the modal lock', await page.evaluate(() => !document.querySelector('.cofein-intro-content').inert && getComputedStyle(document.body).overflow === 'hidden'));
    } finally { await context.close(); }
  });

  await scenario('reduced-motion', async () => {
    const { context, page, requests } = await createPage('reduced-motion', { reducedMotion: 'reduce', width: 390, height: 844 });
    try {
      await navigate(page); await page.waitForLoadState('networkidle');
      check('Reduced motion starts directly on the restaurant', await shell(page).getAttribute('data-coffee-intro') === 'bypassed');
      check('Reduced motion downloads no WebGL engine or Three.js', !requests.some(isSceneRuntime));
      check('Reduced motion creates no scene canvas or obsolete image preloads', await page.locator('.coffee-scene canvas, link[rel=preload][href*="/cofein/intro/"]').count() === 0);
      await cleanHandoff(page, 'reduced-motion');
    } finally { await context.close(); }
  });

  await scenario('changing-motion-preference', async () => {
    const { context, page } = await createPage('changing-motion-preference');
    try {
      await navigate(page); await ready(page); await scroll(page, 550);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await cleanHandoff(page, 'changing-motion-preference');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      check('Turning motion back on does not force another introduction', await page.locator('.cofein-intro-overlay').count() === 0);
    } finally { await context.close(); }
  });

  for (const engineFailure of [true, false]) await scenario(engineFailure ? 'failed-engine' : 'stalled-engine', async () => {
    const label = engineFailure ? 'failed-engine' : 'stalled-engine';
    const { context, page, requests } = await createPage(label, { engineFailure, engineDelay: engineFailure ? 0 : 6500 });
    try {
      const start = Date.now();
      await navigate(page);
      await cleanHandoff(page, label);
      const elapsed = Date.now() - start;
      report.metrics.push({ label, failOpenElapsedMs: elapsed });
      check(`${label}: the failure was injected into the WebGL engine request`, requests.some(isSceneEntry));
      check(`${label}: an unavailable engine never traps the visitor`, elapsed < (engineFailure ? 4500 : 6500));
      if (!engineFailure) {
        await page.waitForTimeout(2500);
        check('A late engine does not resurrect the dismissed introduction', await page.locator('.cofein-intro-overlay').count() === 0 && !(await page.locator('.cofein-intro-content').evaluate(element => element.inert)));
      }
    } finally { await context.close(); }
  });

  for (const early of [true, false]) await scenario(early ? 'context-loss-before-ready' : 'context-loss-after-ready', async () => {
    const label = early ? 'context-loss-before-ready' : 'context-loss-after-ready';
    const { context, page } = await createPage(label, { width: 390, height: 844, earlyContextLoss: early });
    try {
      await navigate(page);
      if (!early) {
        await ready(page);
        const distance = await shell(page).evaluate(element => parseFloat(element.style.paddingTop));
        await scroll(page, distance * 0.55);
        await page.evaluate(() => {
          const gl = document.querySelector('.coffee-scene__objects')?.getContext('webgl2');
          const extension = gl?.getExtension('WEBGL_lose_context');
          window.__contextLossAudit = { requested: Boolean(extension), at: performance.now(), readyBefore: document.querySelector('.cofein-intro-shell')?.dataset.ready === 'true' };
          extension?.loseContext();
        });
      }
      await cleanHandoff(page, label);
      const loss = await page.evaluate(() => ({ ...window.__contextLossAudit, recoveredAfterMs: performance.now() - window.__contextLossAudit.at }));
      report.metrics.push({ label, ...loss });
      check(`${label}: a real GPU context was lost at the intended lifecycle stage`, loss.requested && loss.readyBefore === !early);
      check(`${label}: GPU failure immediately restores the restaurant`, loss.recoveredAfterMs < 2500);
      await page.waitForTimeout(350);
      check(`${label}: late work cannot remount the dismissed scene`, await page.locator('.coffee-scene').count() === 0 && !(await page.locator('.cofein-intro-content').evaluate(element => element.inert)));
    } finally { await context.close(); }
  });

  await scenario('resize-and-rotation', async () => {
    const { context, page } = await createPage('resize-and-rotation', { width: 390, height: 844 });
    try {
      await navigate(page); await ready(page);
      const initial = await metrics(page, 'rotation-before');
      await scroll(page, initial.runway * 0.55);
      await page.setViewportSize({ width: 844, height: 390 }); await frame(page);
      const landscape = await metrics(page, 'rotation-landscape');
      check('Rotation keeps the entering page and reveal mask aligned', landscape.state === 'active' && Math.abs(landscape.contentTop - landscape.pageTop) < 2 && Math.abs(landscape.mainTop - landscape.contentTop - landscape.headerHeight) < 2 && landscape.clearAbovePage === 0);
      check('Both canvases redraw at the new viewport dimensions', await page.locator('.coffee-scene canvas').evaluateAll(elements => elements.length === 2 && elements.every(element => element.clientWidth === innerWidth && element.clientHeight === innerHeight)));
      await capture(page, 'rotation-landscape');
      await page.setViewportSize({ width: 390, height: 844 }); await frame(page);
      const portrait = await metrics(page, 'rotation-portrait');
      // Mobile Chrome may preserve its visual anchor by adjusting native scrollY
      // during rotation. The scene must follow that offset, with no large jump.
      check('Returning to portrait preserves the ongoing native scroll scene', Math.abs(portrait.progress - portrait.scrollY / portrait.runway) < 0.002 && Math.abs(portrait.progress - 0.55) < 0.02 && Math.abs(portrait.contentTop - portrait.pageTop) < 2 && portrait.clearAbovePage === 0);
      await scroll(page, Math.ceil(portrait.runway * handoffProgress) + 91);
      await cleanHandoff(page, 'rotation-handoff', { top: 91 });
    } finally { await context.close(); }
  });

  await scenario('browser-back', async () => {
    const { context, page, requests } = await createPage('browser-back');
    try {
      await navigate(page); await ready(page); await scroll(page, 450);
      await page.goto('about:blank');
      requests.length = 0;
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await shell(page).waitFor();
      await page.waitForFunction(() => document.querySelector('.cofein-intro-shell').dataset.coffeeIntro !== 'active');
      check('Browser Back restores the restaurant without forcing an introduction', await page.locator('.cofein-intro-overlay').count() === 0 && !(await page.locator('.cofein-intro-content').evaluate(element => element.inert)));
      check('Browser Back issues no new WebGL engine or Three.js requests', !requests.some(isSceneRuntime));
    } finally { await context.close(); }
  });

  check('No unexpected JavaScript page exceptions or scenario failures', report.errors.length === 0);
  check('No unexpected browser console errors or shader failures', report.consoleErrors.length === 0);
  check('No failing HTTP resource responses', report.failedResources.length === 0);
  check('Introduction audit made no writes', report.writes === 0);
} finally {
  await fs.writeFile(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.checks.some(item => !item.passed)) process.exitCode = 1;
