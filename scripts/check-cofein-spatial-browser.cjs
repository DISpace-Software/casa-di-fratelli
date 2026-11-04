// Local Chromium regression checks. Uses a separately installed Playwright and browser.
// node scripts/check-cofein-spatial-browser.cjs <playwright module> <chromium executable> <output directory> [local origin]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const [modulePath, executablePath, outputDirectory, origin = 'http://127.0.0.1:5176'] = process.argv.slice(2);
assert(outputDirectory, 'Expected Playwright, Chromium and output directory arguments');
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Local preview only');
const { chromium } = require(path.resolve(modulePath));
const report = { realBrowser: true, localOnly: true, checks: [], errors: [], screenshots: [] };
const check = (name, condition) => { assert(condition, name); report.checks.push({ name, passed: true }); };
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const camera = page => page.locator('.cofein-map-world').evaluate(el => {
  const matrix = new DOMMatrix(getComputedStyle(el).transform);
  return { x: matrix.e, y: matrix.f, scale: matrix.a };
});
let browser;

async function capture(page, name) {
  await page.screenshot({ path: path.join(outputDirectory, `${name}.png`) });
  report.screenshots.push(`${name}.png`);
}

async function openBooking(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`${origin}/cofein-preview.html#booking`);
  await page.locator('.cofein-map-world').waitFor();
  const date = await page.locator('input[type=date]').inputValue();
  const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 2);
  await page.locator('input[type=date]').fill(next.toISOString().slice(0, 10));
  await page.locator('.cofein-booking-search select').first().selectOption('19:00');
  await page.locator('.cofein-map-table-button:enabled').first().waitFor();
  return page;
}

(async () => {
  await fs.mkdir(outputDirectory, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' });
  const desktop = await openBooking(desktopContext);
  check('Public map renders 30 live tables', await desktop.locator('.cofein-map-table-button').count() === 30);
  check('Real API availability enables tables', await desktop.locator('.cofein-map-table-button:enabled').count() > 0);
  await desktop.locator('.cofein-map-surface').scrollIntoViewIfNeeded();
  await capture(desktop, 'desktop-whole-map');
  for (let index = 1; index <= 4; index++) {
    const button = desktop.locator('.cofein-map-views button').nth(index);
    await button.click(); await frame(desktop);
    check(`Detailed view ${index} selected`, await button.getAttribute('aria-pressed') === 'true');
    await capture(desktop, `desktop-section-${index}`);
  }
  await desktop.locator('.cofein-map-views button').nth(2).click();
  await desktop.locator('[data-table-id=T13]').click();
  check('Selecting a table updates reservation choice', await desktop.locator('.cofein-booking-choice h3').innerText() === 'T13');
  await capture(desktop, 'desktop-selected');
  await desktop.getByRole('button', { name: 'Продължи' }).click();
  check('Contact form retains chosen table', (await desktop.locator('.cofein-booking-selection').innerText()).includes('T13'));
  await desktop.getByRole('button', { name: 'Назад към масите' }).click();
  await desktop.locator('.cofein-booking-list summary').click();
  await desktop.locator('.cofein-booking-options button').filter({ hasText: 'Маса T14' }).click();
  check('List alternative selects a real table', await desktop.locator('.cofein-booking-choice h3').innerText() === 'T14');

  // A keyboard user must see the focused table even when it is outside the current fragment.
  await desktop.locator('.cofein-map-views button').nth(2).click();
  await desktop.locator('.cofein-map-viewport').focus();
  await desktop.keyboard.press('Tab');
  await frame(desktop);
  check('Keyboard focus moves into the map', await desktop.locator('[data-table-id=T01]').evaluate(el => el === document.activeElement));
  check('Focused table is inside camera without hidden scrolling', await desktop.locator('[data-table-id=T01]').evaluate(el => {
    const table = el.getBoundingClientRect(); const viewport = el.closest('.cofein-map-viewport'); const view = viewport.getBoundingClientRect();
    return table.left >= view.left && table.right <= view.right && table.top >= view.top && table.bottom <= view.bottom && viewport.scrollTop === 0 && viewport.scrollLeft === 0;
  }));

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'bg-BG', timezoneId: 'Europe/Sofia' });
  const mobile = await openBooking(mobileContext);
  await mobile.locator('.cofein-map-views button').nth(2).tap();
  await mobile.locator('.cofein-map-surface').scrollIntoViewIfNeeded();
  check('Phone document and modal have no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth));
  await capture(mobile, 'mobile-map');
  const cdp = await mobileContext.newCDPSession(mobile);
  let box = await mobile.locator('.cofein-map-viewport').boundingBox();
  const point = y => [{ x: box.x + 110, y: box.y + y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(140) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(160) }); await frame(mobile);
  const firstMove = await camera(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(190) }); await frame(mobile);
  const secondMove = await camera(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(230) }); await frame(mobile);
  const thirdMove = await camera(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('Touch pan continues beyond first movement', secondMove.y > firstMove.y + 20 && thirdMove.y > secondMove.y + 20);
  const tapTarget = await mobile.locator('.cofein-map-table-button:enabled').evaluateAll(elements => {
    const viewport = document.querySelector('.cofein-map-viewport').getBoundingClientRect();
    const table = elements.find(el => { const r = el.getBoundingClientRect(); return r.top > viewport.top + 170 && r.bottom < viewport.bottom - 10 && r.left > viewport.left && r.right < viewport.right - 70; });
    const rect = table.getBoundingClientRect(); return { id: table.dataset.tableId, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tapTarget.x, y: tapTarget.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('A deliberate tap immediately after panning is accepted', await mobile.locator('.cofein-booking-choice h3').innerText() === tapTarget.id);

  const beforePinch = await camera(mobile);
  const pair = spread => [{ x: box.x + 155 - spread, y: box.y + 250, id: 1 }, { x: box.x + 155 + spread, y: box.y + 250, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair(30) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pair(45) }); await frame(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pair(65) }); await frame(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const afterPinch = await camera(mobile);
  check('Two-finger pinch changes scale continuously', afterPinch.scale > beforePinch.scale * 1.8);
  await mobile.setViewportSize({ width: 390, height: 760 }); await frame(mobile);
  check('Viewport resize preserves manual zoom', Math.abs((await camera(mobile)).scale - afterPinch.scale) < 0.001);
  await mobile.setViewportSize({ width: 390, height: 844 }); await frame(mobile);
  await mobile.getByRole('button', { name: 'Покажи целия избран изглед' }).tap();
  await mobile.locator('[data-table-id=T13]').tap();
  check('Phone table tap selects without ghost click', await mobile.locator('.cofein-booking-choice h3').innerText() === 'T13');
  await mobile.locator('.cofein-booking-choice').scrollIntoViewIfNeeded();
  await capture(mobile, 'mobile-selected');
  await mobile.getByRole('button', { name: 'Продължи' }).tap();
  check('Phone can proceed to contact details', await mobile.locator('input[name=guestName]').isVisible());
  await capture(mobile, 'mobile-contact');

  await mobile.getByRole('button', { name: 'Назад към масите' }).tap();
  await mobile.setViewportSize({ width: 844, height: 390 }); await frame(mobile);
  const landscapeHeight = await mobile.locator('.cofein-map-viewport').evaluate(el => el.clientHeight);
  check('Landscape map leaves room to scroll outside map', landscapeHeight < 260);
  await mobile.locator('.cofein-map-surface').scrollIntoViewIfNeeded();
  await capture(mobile, 'mobile-landscape');

  await desktop.emulateMedia({ reducedMotion: 'reduce' });
  check('Reduced motion disables map animation and transitions', await desktop.locator('.cofein-map-explorer').evaluate(root => [...root.querySelectorAll('*')].every(el => {
    const style = getComputedStyle(el); return style.animationName === 'none' && style.transitionDuration.split(',').every(value => parseFloat(value) === 0);
  })));
  await desktop.getByRole('button', { name: 'Увеличи картата' }).click();
  check('Zoom remains usable with reduced motion', (await camera(desktop)).scale > 0);

  // Network failure must clear selection and disable booking, while keeping the plan visible.
  const availabilityRoute = '**/reservations/blocked-slots';
  await desktop.route(availabilityRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  const failedResponse = desktop.waitForResponse(response => response.url().endsWith('/reservations/blocked-slots') && response.status() === 503);
  await desktop.getByRole('button', { name: 'Обнови наличността' }).click();
  await failedResponse; await frame(desktop);
  await desktop.waitForFunction(() => document.querySelectorAll('.cofein-map-table-button:enabled').length === 0);
  check('Availability failure disables selection and Continue', await desktop.getByRole('button', { name: 'Продължи' }).isDisabled());
  check('Failure keeps architectural context', await desktop.locator('.cofein-map-table-button').count() === 30);
  await desktop.unroute(availabilityRoute);
  await desktop.getByRole('button', { name: 'Обнови наличността' }).click();
  await desktop.locator('.cofein-map-table-button:enabled').first().waitFor();
  check('Retry recovers actual availability', await desktop.locator('.cofein-map-table-button:enabled').count() > 0);
  await desktop.keyboard.press('Escape');
  check('Escape closes booking modal', await desktop.getByRole('dialog').count() === 0);
  check('No browser runtime errors', report.errors.length === 0);
  report.passed = true;
})().catch(error => { report.passed = false; report.failure = error.message; process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure, outputDirectory }));
});
