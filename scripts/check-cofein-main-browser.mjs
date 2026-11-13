// Read-only Chromium checks for Cofein's public site and entry into reservations.
// Usage: node script <origin> <output-dir> <playwright-module> <chromium-binary>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [origin, outputRoot, playwrightPath, chromiumPath] = process.argv.slice(2);
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Only local sites are permitted');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
await fs.mkdir(outputRoot, { recursive: true });
const report = { localOnly: true, realBrowser: true, checks: [], errors: [], failedResources: [], screenshots: [], metrics: [], writes: 0 };
let activePage;
const check = (name, result) => { report.checks.push({ name, passed: Boolean(result) }); console.log(`${result ? 'PASS' : 'FAIL'}: ${name}`); };
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function capture(page, label, fullPage = false) { const file = `${label}.png`; await page.screenshot({ path: path.join(outputRoot, file), fullPage, animations: 'disabled' }); report.screenshots.push(file); }
async function layout(page, label) {
  const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, scrollY, bodyOverflow: getComputedStyle(document.body).overflow,
    dialog: (() => { const el = document.querySelector('dialog[open]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }; })(),
    activeElement: document.activeElement?.getAttribute('aria-label') || document.activeElement?.id || document.activeElement?.tagName,
  }));
  report.metrics.push({ label, ...metrics });
  check(`${label}: no page horizontal overflow`, metrics.documentWidth <= metrics.width + 1);
  if (metrics.dialog) check(`${label}: dialog fits width without horizontal overflow`, metrics.dialog.x >= -1 && metrics.dialog.x + metrics.dialog.width <= metrics.width + 1 && metrics.dialog.scrollWidth <= metrics.dialog.clientWidth + 1);
}
async function closeDialog(page) { await page.getByRole('button', { name: 'Затвори прозореца', exact: true }).click(); await page.locator('dialog[open]').waitFor({ state: 'detached' }); await frame(page); }
try {
  for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'phone390', width: 390, height: 844 }, { name: 'phone360', width: 360, height: 740 }, { name: 'phone320', width: 320, height: 740 }, { name: 'landscape', width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport: size, isMobile: size.width < 900, hasTouch: size.width < 900, deviceScaleFactor: 1, locale: 'bg-BG', timezoneId: 'Europe/Sofia', reducedMotion: 'reduce' });
    const page = await context.newPage(); activePage = page; page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push({ device: size.name, message: error.message }));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ device: size.name, status: response.status(), url: response.url() }); });
    await page.route('**/*', async route => { const method = route.request().method(); if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) { report.writes++; return route.abort(); } return route.continue(); });
    await page.addInitScript(() => { window.__cofeinPerf = { lcp: 0, cls: 0, longTasks: 0 }; try { new PerformanceObserver(list => { for (const item of list.getEntries()) window.__cofeinPerf.lcp = item.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); new PerformanceObserver(list => { for (const item of list.getEntries()) if (!item.hadRecentInput) window.__cofeinPerf.cls += item.value; }).observe({ type: 'layout-shift', buffered: true }); new PerformanceObserver(list => { window.__cofeinPerf.longTasks += list.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch { /* Unsupported metric is left at zero. */ } });
    await page.goto(`${origin}/cofein-preview.html`, { waitUntil: 'networkidle' }); await page.locator('.hero h1').waitFor(); await page.evaluate(() => document.fonts.ready); await frame(page);
    check(`${size.name}: one main landmark and one page heading`, await page.getByRole('main').count() === 1 && await page.getByRole('heading', { level: 1 }).count() === 1);
    const perf = await page.evaluate(() => { const resources = performance.getEntriesByType('resource'); const sum = items => items.reduce((n, r) => n + r.encodedBodySize, 0); return { ...window.__cofeinPerf, resourceCount: resources.length, encodedBytes: sum(resources), imageBytes: sum(resources.filter(r => /\.(webp|jpe?g|png|avif)(\?|$)/.test(r.name))), fontBytes: sum(resources.filter(r => /\.(woff2?|ttf)(\?|$)/.test(r.name))), imageRequests: resources.filter(r => /\.(webp|jpe?g|png|avif)(\?|$)/.test(r.name)).map(r => ({ path: new URL(r.name).pathname, bytes: r.encodedBodySize })), lazyMenuLoaded: resources.some(r => /CofeinMenu|menu-food|menu-drinks/.test(r.name)), lazyBookingLoaded: resources.some(r => /CofeinBooking(?:[.-]|$)|CofeinMapExplorer/.test(r.name)) }; });
    report.metrics.push({ label: `${size.name}-initial-performance`, note: 'Local Chromium, warm OS cache, no throttling; dev module sizes are not production bundle sizes.', ...perf });
    check(`${size.name}: menu and booking are deferred on landing`, !perf.lazyMenuLoaded && !perf.lazyBookingLoaded);
    await layout(page, `${size.name}-hero`); await capture(page, `${size.name}-01-hero`);
    check(`${size.name}: hero exposes direct booking and menu actions`, await page.locator('.hero-actions').getByRole('button', { name: 'Резервирай маса', exact: true }).isVisible() && await page.locator('.hero-actions').getByRole('button', { name: 'Разгледай менюто', exact: true }).isVisible());
    const momentTabs = page.getByRole('tablist', { name: 'Ритъмът на деня' }).getByRole('tab'); await momentTabs.first().click(); await momentTabs.first().press('ArrowRight');
    check(`${size.name}: day moments support keyboard and mount only the selected image`, await momentTabs.nth(1).getAttribute('aria-selected') === 'true' && await page.locator('.hero-frame img').count() === 1 && await page.locator('.hero-frame:not([hidden])').count() === 1); await momentTabs.first().click();

    if (await page.getByRole('button', { name: 'Отвори навигацията', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Отвори навигацията', exact: true }).click();
      check(`${size.name}: mobile navigation opens and focuses its first action`, await page.getByRole('navigation', { name: 'Основна навигация' }).isVisible() && await page.evaluate(() => Boolean(document.activeElement?.closest('.navigation'))));
      check(`${size.name}: mobile navigation locks and makes background inert`, await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden' && document.querySelector('main').inert));
      let stayedInHeader = true; for (let index = 0; index < 10; index++) { await page.keyboard.press('Tab'); stayedInHeader &&= await page.evaluate(() => Boolean(document.activeElement?.closest('.site-header'))); }
      check(`${size.name}: mobile keyboard focus stays in navigation header`, stayedInHeader); await capture(page, `${size.name}-02-navigation`);
      await page.keyboard.press('Escape');
      check(`${size.name}: escape closes navigation and restores trigger focus`, await page.getByRole('button', { name: 'Отвори навигацията', exact: true }).getAttribute('aria-expanded') === 'false' && await page.getByRole('button', { name: 'Отвори навигацията', exact: true }).evaluate(e => e === document.activeElement));
      await page.getByRole('button', { name: 'Отвори навигацията', exact: true }).click();
    }
    const menuTrigger = page.getByRole('navigation', { name: 'Основна навигация' }).getByRole('button', { name: 'Меню', exact: true });
    await menuTrigger.click(); await page.locator('.cofein-menu .menu-dish').first().waitFor(); await frame(page);
    check(`${size.name}: menu opens by navigation and locks background`, await page.locator('dialog[open]').count() === 1 && await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden') && new URL(page.url()).hash === '#menu');
    await layout(page, `${size.name}-menu`); await capture(page, `${size.name}-03-menu`);
    await page.getByRole('group', { name: 'Раздел на менюто' }).getByRole('button', { name: /^Бар/ }).click();
    const search = page.locator('.menu-search input'); await search.fill('qqq-няма-такъв'); await page.locator('.menu-empty').waitFor();
    check(`${size.name}: menu search explains zero matches`, await page.locator('.menu-empty').isVisible()); await page.locator('.menu-empty').getByRole('button', { name: 'Изчисти търсенето', exact: true }).click();
    check(`${size.name}: clearing menu search restores products and focus`, await page.locator('.menu-dish').count() > 0 && await search.evaluate(e => e === document.activeElement));
    await page.locator('.close-modal').focus(); await page.keyboard.press('Shift+Tab');
    check(`${size.name}: menu keyboard focus stays inside its modal`, await page.evaluate(() => Boolean(document.activeElement?.closest('dialog[open]'))));
    await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'detached' }); await frame(page);
    check(`${size.name}: escape closes menu, clears hash and restores focus`, new URL(page.url()).hash === '' && await page.evaluate(() => document.activeElement?.matches('.navigation button, .menu-toggle')));
    await page.locator('.menu-preview-links button').nth(1).click(); await page.locator('.cofein-menu .menu-dish').first().waitFor();
    check(`${size.name}: bar shortcut opens the drinks department directly`, await page.getByRole('group', { name: 'Раздел на менюто' }).getByRole('button', { name: 'Бар', exact: true }).getAttribute('aria-pressed') === 'true'); await closeDialog(page);
    await page.locator('.space-tabs').scrollIntoViewIfNeeded(); const tabs = page.getByRole('tablist', { name: 'Пространства в Cofein' }).getByRole('tab'); await tabs.first().click(); await tabs.first().press('ArrowRight');
    check(`${size.name}: hall presentation tabs support arrow keys`, await tabs.nth(1).getAttribute('aria-selected') === 'true'); await capture(page, `${size.name}-04-spaces`);
    await page.locator('.gallery-heading button').click(); await page.locator('.photo-modal[open]').waitFor(); const before = await page.locator('#dialog-title').innerText(); await page.keyboard.press('ArrowRight');
    check(`${size.name}: gallery arrow key advances photo`, await page.locator('#dialog-title').innerText() !== before); await layout(page, `${size.name}-gallery`); await capture(page, `${size.name}-05-gallery`); await closeDialog(page);
    await page.locator('.site-footer').scrollIntoViewIfNeeded(); await layout(page, `${size.name}-footer`); await capture(page, `${size.name}-06-footer`);
    check(`${size.name}: contact area exposes telephone and directions links`, await page.locator('.visit-card a[href^="tel:"]').count() === 1 && await page.locator('.visit-card a[target="_blank"]').getAttribute('rel') === 'noreferrer');
    const scrollBeforeBooking = await page.evaluate(() => scrollY);
    // The header is already visible: avoid locator auto-scroll moving a sticky target.
    const headerBox = await page.locator('.header-book').boundingBox();
    if (size.width < 900) await page.touchscreen.tap(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
    else await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
    await page.locator('.cofein-booking[data-step=workspace]').waitFor(); await frame(page); await layout(page, `${size.name}-booking`); await capture(page, `${size.name}-07-booking`);
    check(`${size.name}: booking opens from primary site action with correct hash`, new URL(page.url()).hash === '#booking' && await page.locator('.cofein-booking[data-step=workspace]').isVisible());
    const min = await page.locator('[name=reservedDate]').getAttribute('min'); const date = new Date(min + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + 3); await page.locator('[name=reservedDate]').fill(date.toISOString().slice(0,10)); await page.locator('[name=reservedTime]').selectOption('19:00'); await page.locator('[name=guestCount]').selectOption('2');
    const next = page.getByRole('button', { name: 'Виж масите', exact: true }); if (await next.isVisible()) await next.click(); await page.locator('.cofein-map-table-button:enabled').first().click(); await page.getByRole('button', { name: 'Вашите данни', exact: true }).click(); await page.locator('.cofein-booking[data-step=contact]').waitFor(); await layout(page, `${size.name}-contact`); await capture(page, `${size.name}-08-contact`);
    check(`${size.name}: site reaches reservation contact step without creating a booking`, await page.locator('[name=guestName]').isVisible() && report.writes === 0); await closeDialog(page);
    check(`${size.name}: closing booking restores header action focus and page scroll`, await page.locator('.header-book').evaluate(e => e === document.activeElement) && await page.evaluate(previous => getComputedStyle(document.body).overflow !== 'hidden' && Math.abs(scrollY - previous) < 2, scrollBeforeBooking));
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { window.scrollTo(0,y); await new Promise(resolve => setTimeout(resolve, 30)); } window.scrollTo(0,0); }); await page.waitForLoadState('networkidle'); await capture(page, `${size.name}-09-full-page`, true);
    check(`${size.name}: no failed loaded content images`, await page.locator('img').evaluateAll(images => images.every(image => !image.currentSrc || !image.complete || image.naturalWidth > 0)));
    await page.goto(`${origin}/cofein-preview.html#menu`); await page.locator('.cofein-menu .menu-dish').first().waitFor();
    check(`${size.name}: menu deep link opens directly`, await page.locator('.menu-modal[open]').count() === 1); await closeDialog(page);
    await page.goto(`${origin}/cofein-preview.html#booking`); await page.locator('.cofein-booking[data-step=workspace]').waitFor();
    check(`${size.name}: booking deep link opens directly`, await page.locator('.booking-modal[open]').count() === 1); await closeDialog(page);
    if (size.width < 761) {
      await page.getByRole('button', { name: 'Отвори навигацията', exact: true }).click(); await page.locator('.header-book').click(); await page.locator('.cofein-booking[data-step=workspace]').waitFor();
      check(`${size.name}: navigation to booking retains background lock`, await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden' && !document.querySelector('main').inert)); await closeDialog(page);
      check(`${size.name}: navigation booking returns to its menu trigger and unlocks page`, await page.getByRole('button', { name: 'Отвори навигацията', exact: true }).evaluate(e => e === document.activeElement) && await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'));
    }
    await context.close();
  }
  const motionContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference', locale: 'bg-BG' });
  const motionPage = await motionContext.newPage();
  motionPage.on('pageerror', error => report.errors.push({ device: 'desktop-motion', message: error.message }));
  await motionPage.goto(`${origin}/cofein-preview.html`, { waitUntil: 'networkidle' });
  const introSkip = motionPage.getByRole('button', { name: 'Към сайта', exact: true });
  if (await introSkip.isVisible()) await introSkip.click();
  for (const selector of ['#atmosphere', '#spaces', '#gallery', '#visit']) { await motionPage.locator(selector).scrollIntoViewIfNeeded(); await motionPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  check('Normal-motion sections reveal as they enter the viewport', await motionPage.locator('[data-reveal]').evaluateAll(nodes => nodes.every(node => node.classList.contains('is-visible'))));
  await motionPage.emulateMedia({ reducedMotion: 'reduce' }); await frame(motionPage);
  check('Changing to reduced motion preserves all revealed content', await motionPage.locator('[data-reveal]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).opacity === '1')));
  await motionContext.close();
  check('No JavaScript page exceptions', report.errors.length === 0); check('No failing HTTP resource responses', report.failedResources.length === 0); check('Main site audit made no writes', report.writes === 0);
} catch (error) {
  report.fatal = { message: error.message, stack: error.stack };
  if (activePage && !activePage.isClosed()) {
    report.failureState = await activePage.evaluate(() => ({
      date: document.querySelector('[name=reservedDate]')?.value,
      time: document.querySelector('[name=reservedTime]')?.value,
      guests: document.querySelector('[name=guestCount]')?.value,
      mapStatus: document.querySelector('.cofein-booking-map-header')?.innerText,
      enabledTables: document.querySelectorAll('.cofein-map-table-button:enabled').length,
      step: document.querySelector('.cofein-booking')?.dataset.step,
      intro: document.querySelector('.cofein-intro-shell')?.dataset.coffeeIntro,
    })).catch(() => null);
    await capture(activePage, 'failure-state').catch(() => {});
  }
  throw error;
}
finally { await fs.writeFile(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
if (report.checks.some(item => !item.passed)) process.exitCode = 1;
