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
const handoffProgress = 0.95;
const report = { localOnly: true, realBrowser: true, selectedScenarios: selectedScenarios ? [...selectedScenarios] : 'all', checks: [], errors: [], failedResources: [], screenshots: [], metrics: [], writes: 0 };
const check = (name, result) => { report.checks.push({ name, passed: Boolean(result) }); console.log(`${result ? 'PASS' : 'FAIL'}: ${name}`); };
const shell = page => page.locator('.cofein-intro-shell');
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function capture(page, label) {
  const file = `${label}.png`;
  await page.screenshot({ path: path.join(outputRoot, file), animations: 'disabled' });
  report.screenshots.push(file);
}
async function createPage(label, { width = 1440, height = 1000, reducedMotion = 'no-preference', assetFailure, assetDelay = 0, emptyFailure = false, emptyDelay = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900, deviceScaleFactor: 1, locale: 'bg-BG', timezoneId: 'Europe/Sofia', reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => report.errors.push({ label, message: error.message }));
  page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ label, status: response.status(), url: response.url() }); });
  await page.route('**/*', async route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) { report.writes++; return route.abort(); }
    if (route.request().url().includes('/cofein/intro/')) {
      if (assetFailure) return route.abort('failed');
      if (route.request().url().includes('/cup-empty-')) {
        if (emptyFailure) return route.abort('failed');
        if (emptyDelay) await new Promise(resolve => setTimeout(resolve, emptyDelay));
      }
      if (assetDelay) await new Promise(resolve => setTimeout(resolve, assetDelay));
    }
    return route.continue().catch(() => {});
  });
  await page.addInitScript(() => {
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
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { window.__introAudit.draws++; return clear.apply(this, args); };
  });
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
    const canvas = document.querySelector('.coffee-scene');
    let clear = 0;
    if (canvas) {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let y = 8; y < canvas.height; y += 16) for (let x = 8; x < canvas.width; x += 16) {
        total++;
        if (pixels[(y * canvas.width + x) * 4 + 3] < 16) clear++;
      }
      clear /= Math.max(1, total);
    }
    return {
      width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, scrollY,
      state: document.querySelector('.cofein-intro-shell').dataset.coffeeIntro,
      progress: Number(document.querySelector('.cofein-intro-shell').dataset.progress),
      runway: parseFloat(document.querySelector('.cofein-intro-shell').style.paddingTop || '0'),
      mainTop: document.querySelector('main').getBoundingClientRect().top,
      heroTop: document.querySelector('.hero').getBoundingClientRect().top,
      contentTop: content.getBoundingClientRect().top,
      headerHeight: document.querySelector('.site-header').getBoundingClientRect().height,
      contentInert: content.inert, contentTransform: getComputedStyle(content).transform,
      overlayCount: document.querySelectorAll('.cofein-intro-overlay').length,
      canvasCount: document.querySelectorAll('.coffee-scene').length,
      clearFraction: clear,
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
  const before = await page.evaluate(() => ({ frames: window.__introAudit.frames, draws: window.__introAudit.draws }));
  await page.waitForTimeout(140);
  check(`${label}: no idle animation loop remains`, await page.evaluate(previous => window.__introAudit.pending.size === 0 && window.__introAudit.frames === previous.frames && window.__introAudit.draws === previous.draws, before));
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
      check(`${size.name}: covered restaurant content is inert`, initial.contentInert);
      // Playwright's role query does not filter the native inert subtree.
      check(`${size.name}: skip is the sole reachable action`, await page.locator('button').evaluateAll(buttons => buttons.filter(button => !button.closest('[inert]') && button.getClientRects().length).length === 1) && await page.getByRole('button', { name: 'Към сайта' }).isVisible());
      const skipBox = await page.getByRole('button', { name: 'Към сайта' }).boundingBox();
      check(`${size.name}: skip has a 44-pixel touch target`, skipBox.width >= 44 && skipBox.height >= 44);
      check(`${size.name}: authentic restaurant logo and responsive cup assets load`, requests.some(url => url.includes('/cofein/brand/cofein-lockup.svg')) && requests.some(url => url.includes(`/cofein/intro/cup-${size.width <= 760 ? 768 : 1280}.webp`)));
      check(`${size.name}: HTML preloads only the matching initial cup and saucer`, await page.locator('link[rel=preload][href*="/cofein/intro/"]').evaluateAll((links, resolution) => links.length === 2 && links.every(link => link.href.endsWith(`-${resolution}.webp`) && !link.href.includes('cup-empty')), size.width <= 760 ? 768 : 1280));
      check(`${size.name}: menu and booking modules remain deferred`, !requests.some(url => /\/Cofein(?:Menu|Booking)\./.test(url)));
      const idleDraws = await page.evaluate(() => window.__introAudit.draws);
      await page.waitForTimeout(140);
      check(`${size.name}: scene does not animate when the user is idle`, await page.evaluate(draws => window.__introAudit.draws === draws, idleDraws));
      await capture(page, `${size.name}-00-start`);
      let previousClear = initial.clearFraction;
      for (const progress of [0.35, 0.55, 0.75, 0.90]) {
        await scroll(page, Math.round(initial.runway * progress));
        const label = `${size.name}-${Math.round(progress * 100)}-reveal`;
        const result = await metrics(page, label);
        check(`${label}: scroll determines the scene progress`, result.state === 'active' && Math.abs(result.progress - progress) < 0.002);
        check(`${label}: actual restaurant remains stationary under the mask`, Math.abs(result.mainTop - initial.mainTop) < 2 && Math.abs(result.heroTop - initial.heroTop) < 2);
        check(`${label}: revealed area grows`, result.clearFraction >= previousClear - 0.001);
        previousClear = result.clearFraction;
        if (progress === 0.90) check(`${label}: most of the restaurant is visible before handoff`, result.clearFraction > 0.70);
        await capture(page, label);
      }
      // Reversing before completion must reconstruct the same view, not accumulate holes.
      await scroll(page, initial.runway * 0.35);
      const reverse = await metrics(page, `${size.name}-reverse`);
      check(`${size.name}: scrolling upward reverses the reveal`, reverse.clearFraction < 0.08 && reverse.state === 'active');
      // Controls must unlock as soon as the visual reveal has finished.
      await scroll(page, Math.ceil(initial.runway * handoffProgress));
      await cleanHandoff(page, `${size.name}-95-handoff`);
      check(`${size.name}: visible restaurant controls are interactive at 95 percent`, await page.locator('.hero-actions').getByRole('button', { name: 'Разгледай менюто', exact: true }).evaluate(element => !element.closest('[inert]') && !element.disabled));
      await capture(page, `${size.name}-95-site`);
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
      check(`${size.name}: early handoff preserves 120 pixels of overscroll`, await page.evaluate(() => Math.abs(scrollY - 120) <= 2));
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
      check(`${hash}: bypass does not request decorative cup assets`, !requests.some(url => url.includes('/cofein/intro/')));
      check(`${hash}: HTML does not preload bypassed decorative assets`, await page.locator('link[rel=preload][href*="/cofein/intro/"]').count() === 0);
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
      check('Reduced motion requests no decorative cup or saucer assets', !requests.some(url => url.includes('/cofein/intro/')));
      check('Reduced motion bypasses HTML decorative preloads', await page.locator('link[rel=preload][href*="/cofein/intro/"]').count() === 0);
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

  for (const assetFailure of [true, false]) await scenario(assetFailure ? 'failed-assets' : 'stalled-assets', async () => {
    const label = assetFailure ? 'failed-assets' : 'stalled-assets';
    const { context, page } = await createPage(label, { assetFailure, assetDelay: assetFailure ? 0 : 6500 });
    try {
      const start = Date.now();
      await navigate(page);
      await cleanHandoff(page, label);
      const elapsed = Date.now() - start;
      report.metrics.push({ label, failOpenElapsedMs: elapsed });
      check(`${label}: an unavailable decoration never traps the visitor`, elapsed < (assetFailure ? 4500 : 6500));
      if (!assetFailure) {
        await page.waitForTimeout(2000);
        check('Late assets do not resurrect the dismissed introduction', await page.locator('.cofein-intro-overlay').count() === 0 && !(await page.locator('.cofein-intro-content').evaluate(element => element.inert)));
      }
    } finally { await context.close(); }
  });

  for (const emptyFailure of [true, false]) await scenario(emptyFailure ? 'optional-empty-failure' : 'optional-empty-delay', async () => {
    const label = emptyFailure ? 'optional-empty-failure' : 'optional-empty-delay';
    const { context, page, requests } = await createPage(label, { width: 390, height: 844, emptyFailure, emptyDelay: emptyFailure ? 0 : 6500 });
    try {
      const started = Date.now();
      await navigate(page); await ready(page);
      check(`${label}: initial cup is ready without its optional empty variant`, Date.now() - started < 5000 && requests.some(url => url.includes('/cup-empty-')) && await shell(page).getAttribute('data-coffee-intro') === 'active');
      const initial = await metrics(page, `${label}-start`);
      await scroll(page, initial.runway * 0.55);
      check(`${label}: pouring scene remains usable with the original cup`, await shell(page).getAttribute('data-coffee-intro') === 'active' && Number(await shell(page).getAttribute('data-progress')) > 0.54);
      await capture(page, label);
      await scroll(page, Math.ceil(initial.runway * handoffProgress));
      await cleanHandoff(page, label);
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
      check('Rotation keeps the scene and restaurant correctly aligned', landscape.state === 'active' && Math.abs(landscape.contentTop) < 2 && Math.abs(landscape.mainTop - landscape.headerHeight) < 2);
      check('Canvas redraws at the new viewport dimensions', await page.locator('.coffee-scene').evaluate(element => element.clientWidth === innerWidth && element.clientHeight === innerHeight));
      await capture(page, 'rotation-landscape');
      await page.setViewportSize({ width: 390, height: 844 }); await frame(page);
      const portrait = await metrics(page, 'rotation-portrait');
      // Mobile Chrome may preserve its visual anchor by adjusting native scrollY
      // during rotation. The scene must follow that offset, with no large jump.
      check('Returning to portrait preserves the ongoing native scroll scene', Math.abs(portrait.progress - portrait.scrollY / portrait.runway) < 0.002 && Math.abs(portrait.progress - 0.55) < 0.02 && Math.abs(portrait.contentTop) < 2);
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
      check('Browser Back issues no new decorative asset requests', !requests.some(url => url.includes('/cofein/intro/')));
    } finally { await context.close(); }
  });

  check('No unexpected JavaScript page exceptions or scenario failures', report.errors.length === 0);
  check('No failing HTTP resource responses', report.failedResources.length === 0);
  check('Introduction audit made no writes', report.writes === 0);
} finally {
  await fs.writeFile(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.checks.some(item => !item.passed)) process.exitCode = 1;
