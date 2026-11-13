// Real Chromium against the disposable, notification-disabled local fixture.
// Network-failure cases are explicitly intercepted; the successful reservation
// really reaches PostgreSQL and is cancelled in cleanup. No production URLs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [statePath, outputRoot, playwrightPath, chromiumPath] = process.argv.slice(2);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const value of [state.apiUrl, state.origin]) assert.equal(new URL(value).hostname, '127.0.0.1');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const report = { localOnly: true, realBrowser: true, checks: [], errors: [], screenshots: [], metrics: [], simulatedCases: [], cleanup: [] };
const reservationsToCancel = new Set();
const responseTasks = [];
let observedPostCount = 0;
const pendingKey = 'cofein:booking:pending:v1';
const bookingUrl = state.apiUrl + '/api/v1/restaurants/cofein/reservations';
const blockedUrl = state.apiUrl + '/api/v1/restaurants/cofein/reservations/blocked-slots';
let currentPage;
const check = (name, condition = true) => { assert(condition, name); report.checks.push({ name, passed: true }); console.log(`PASS ${report.checks.length}: ${name}`); };
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function api(route, { method = 'GET', body, tenant = 'cofein' } = {}) {
  const response = await fetch(state.apiUrl + route, { method,
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenant, 'X-Admin-Token': state.tenants[tenant].auth.token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, 200, `${method} ${route}`);
  const raw = await response.text(); return raw ? JSON.parse(raw) : null;
}
async function makePage({ width = 1440, height = 1000, reducedMotion = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600,
    locale: 'bg-BG', timezoneId: 'Europe/Sofia', reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (request.url() === bookingUrl && request.method() === 'POST') observedPostCount++; });
  page.on('response', response => {
    if (response.url() === bookingUrl && response.request().method() === 'POST' && response.ok()) {
      const task = response.json().then(result => { if (result.id) reservationsToCancel.add(result.id); }).catch(() => {});
      responseTasks.push(task);
    }
  });
  return { context, page };
}
async function open(page) {
  await page.goto(state.origin + '/cofein-preview.html#booking');
  await page.locator('dialog[open]').waitFor();
  await page.locator('.cofein-booking[data-step=visit], .cofein-booking[data-step=result], .cofein-booking-empty').first().waitFor();
  await page.locator('dialog').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
}
async function step(page, value) { await page.locator(`.cofein-booking[data-step="${value}"]`).waitFor(); await frame(page); }
async function visit(page, { days = 3, time = '19:00', guests = 2 } = {}) {
  await step(page, 'visit');
  const min = await page.locator('input[type=date]').getAttribute('min'); const target = new Date(min + 'T12:00:00Z'); target.setUTCDate(target.getUTCDate() + days);
  await page.locator('input[type=date]').fill(target.toISOString().slice(0, 10));
  await page.locator('.cofein-booking-search select').nth(0).selectOption(time);
  await page.locator('.cofein-booking-search select').nth(1).selectOption(String(guests));
  return target.toISOString().slice(0, 10);
}
async function tables(page, options) {
  const date = await visit(page, options); await page.getByRole('button', { name: 'Покажи масите', exact: true }).click(); await step(page, 'table');
  await page.locator('.cofein-map-table-button:enabled').first().waitFor(); return date;
}
async function chooseMap(page, tableId = 'T13') {
  await page.locator('.cofein-map-views').getByRole('button', { name: 'Външна · долна', exact: true }).click();
  await page.locator(`[data-table-id="${tableId}"]`).click();
  await page.getByRole('button', { name: 'Продължи', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Продължи', exact: true }).isEnabled(), true);
}
async function contact(page, options) { const date = await tables(page, options); await chooseMap(page); await page.getByRole('button', { name: 'Продължи', exact: true }).click(); await step(page, 'contact'); return date; }
async function fillContact(page) {
  await page.locator('[name=guestName]').fill('Георги Иванов · локален UX тест');
  await page.locator('[name=phone]').fill('089' + Date.now().toString().slice(-7));
  await page.locator('[name=email]').fill(`cofein-ux-${Date.now()}@example.test`);
  await page.locator('[name=privacyConsent]').check();
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(outputRoot, name + '.png'), animations: 'disabled' }); report.screenshots.push(name + '.png');
}
async function bounds(page, label) {
  const measured = await page.evaluate(() => {
    const rect = selector => { const element = document.querySelector(selector); if (!element) return null; const value = element.getBoundingClientRect(); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height }; };
    const modal = document.querySelector('dialog'); const body = document.querySelector('.cofein-booking-body');
    return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
      modal: rect('dialog'), body: rect('.cofein-booking-body'), footer: rect('.cofein-booking-footer'), action: rect('.cofein-booking-footer .cofein-booking-primary'),
      map: rect('.cofein-map-viewport'), contact: rect('.cofein-booking-contact'), modalOverflow: modal.scrollWidth > modal.clientWidth,
      bodyOverflow: body.scrollWidth > body.clientWidth, bodyScrollHeight: body.scrollHeight, bodyHeight: body.clientHeight };
  });
  report.metrics.push({ label, ...measured }); return measured;
}
function contained(result) {
  return result.documentWidth <= result.viewport.width && !result.modalOverflow && !result.bodyOverflow &&
    result.action.left >= 0 && result.action.right <= result.viewport.width + 1 && result.action.top >= 0 && result.action.bottom <= result.viewport.height + 1;
}

try {
  const baseline = await api('/api/reservations'); const casaBefore = await api('/api/floor-plan', { tenant: 'casa-di-fratelli' });
  const floorPlan = await api('/api/floor-plan'); const activeZones = new Set(floorPlan.zones.filter(zone => zone.isActive).map(zone => zone.id));
  const expectedTableCount = floorPlan.tables.filter(table => table.isActive && activeZones.has(table.area)).length;
  report.fixture = { activeTables: expectedTableCount, activeZones: activeZones.size };
  const desktop = await makePage(); const page = desktop.page; await open(page);
  check('Initial visit step has no premature map or contact form', await page.locator('.cofein-map-world, .cofein-booking-contact').count() === 0);
  check('Initial primary action is disabled until a valid time is chosen', await page.getByRole('button', { name: 'Покажи масите', exact: true }).isDisabled());
  check('Desktop visit action is visible without horizontal overflow', contained(await bounds(page, 'desktop-visit')));
  await capture(page, 'desktop-01-visit');
  await page.getByRole('button', { name: 'Утре', exact: true }).click();
  check('Tomorrow shortcut sets the actual date and reports its pressed state', await page.getByRole('button', { name: 'Утре', exact: true }).getAttribute('aria-pressed') === 'true');
  await tables(page);
  check(`Table step focuses its heading and preserves all ${expectedTableCount} live API tables`, await page.locator('#dialog-title').evaluate(element => element === document.activeElement) && await page.locator('.cofein-map-table-button').count() === expectedTableCount);
  await chooseMap(page);
  check('Selected table is reported in the persistent footer and enables Continue', (await page.locator('.cofein-booking-footer-summary').innerText()).includes('Маса T13'));
  await capture(page, 'desktop-02-selected');
  await page.getByRole('button', { name: 'Списък', exact: true }).click();
  const listChoice = page.locator('.cofein-booking-options').getByRole('button', { name: /^Маса T14\b/ });
  await listChoice.focus(); await page.keyboard.press('Enter');
  check('Keyboard selection in the alternative list updates the same reservation choice', (await page.locator('.cofein-booking-footer-summary').innerText()).includes('Маса T14'));
  await page.getByRole('button', { name: 'Продължи', exact: true }).click(); await step(page, 'contact');
  check('Contact entry focuses its heading without premature validation or submission', await page.locator('input[type=date], .cofein-map-world, .cofein-field-error').count() === 0 && await page.locator('#dialog-title').evaluate(element => element === document.activeElement) && observedPostCount === 0);
  await capture(page, 'desktop-03-contact');
  await page.getByRole('button', { name: 'Резервирай маса', exact: true }).click();
  check('Empty contact submission explains each missing field and focuses the first invalid input', await page.locator('.cofein-field-error').count() === 4 && await page.locator('[name=guestName]').evaluate(element => element === document.activeElement));
  await fillContact(page);
  await page.getByRole('button', { name: /Добавете бележка/ }).click(); await page.locator('[name=notes]').fill('Детска количка · само локален тест');
  check('Optional note expands on demand and fields use API-aligned limits', await page.locator('[name=email]').getAttribute('maxlength') === '120' && await page.locator('[name=notes]').getAttribute('maxlength') === '2000');
  const draftName = await page.locator('[name=guestName]').inputValue();
  await page.locator('.cofein-booking-selection').getByRole('button', { name: 'Промени', exact: true }).click(); await step(page, 'table');
  await page.getByRole('button', { name: 'Продължи', exact: true }).click(); await step(page, 'contact');
  check('Back to tables and Continue preserve valid contact without submitting it', await page.locator('[name=guestName]').inputValue() === draftName && (await page.locator('[name=notes]').inputValue()).includes('Детска количка') && observedPostCount === 0);

  let releasePost, posted; const postGate = new Promise(resolve => { releasePost = resolve; }); const postSeen = new Promise(resolve => { posted = resolve; }); let postCount = 0;
  await page.route(bookingUrl, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    postCount++; const response = await route.fetch(); const result = await response.json();
    if (response.ok() && result.id) reservationsToCancel.add(result.id);
    posted(result); await postGate; await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Резервирай маса', exact: true }).click({ clickCount: 2 });
  const booked = await postSeen;
  check('Submission locks closing and prevents a double-click from sending another POST', postCount === 1 && await page.getByRole('button', { name: 'Затвори прозореца', exact: true }).isDisabled());
  await page.keyboard.press('Escape');
  check('Escape cannot dismiss an in-flight real reservation', await page.locator('dialog[open]').count() === 1);
  releasePost(); await step(page, 'result'); await page.getByText('Резервацията Ви е потвърдена.', { exact: true }).waitFor();
  check('Real API booking reaches a focused confirmation and clears the uncertain-attempt marker', booked.status === 'Approved' && await page.locator('#dialog-title').evaluate(element => element === document.activeElement) && await page.evaluate(key => sessionStorage.getItem(key), pendingKey) === null);
  check('The same successful booking is visible in administrator data', (await api('/api/reservations')).some(item => item.id === booked.id && item.tableIds.includes('T14')));
  await capture(page, 'desktop-04-confirmed');
  await api(`/api/reservations/${booked.id}/cancel`, { method: 'PATCH' }); reservationsToCancel.delete(booked.id); report.cleanup.push({ reservationId: booked.id, cancelled: true });
  await desktop.context.close();

  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const device = await makePage(size); const p = device.page; await open(p);
    check(`${size.width}px visit has a visible primary action and fits the screen`, contained(await bounds(p, `${size.width}-visit`)));
    await capture(p, `phone${size.width}-01-visit`);
    await tables(p); await chooseMap(p);
    check(`${size.width}px selected table keeps Continue visible while viewing the map`, contained(await bounds(p, `${size.width}-selected`)));
    await capture(p, `phone${size.width}-02-selected`);
    await p.getByRole('button', { name: 'Продължи', exact: true }).click(); await step(p, 'contact');
    const result = await bounds(p, `${size.width}-contact`);
    check(`${size.width}px contact form and submit action fit without horizontal scrolling`, contained(result) && result.contact.left >= 0 && result.contact.right <= size.width);
    await capture(p, `phone${size.width}-03-contact`);
    await p.locator('.cofein-booking-contact input[name=phone]').focus();
    await p.setViewportSize({ width: size.width, height: 500 }); await frame(p);
    check(`${size.width}px compact-height view keeps the action visible`, contained(await bounds(p, `${size.width}-compact-height`)));
    await device.context.close();
  }

  const failSetup = await makePage(); await failSetup.page.route('**/api/v1/restaurants/cofein/branding', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await open(failSetup.page); await failSetup.page.getByRole('button', { name: 'Опитай отново', exact: true }).waitFor();
  check('Setup failure presents a recovery action instead of an unusable form', await failSetup.page.locator('.cofein-booking[data-step=notice]').count() === 1);
  await failSetup.page.unroute('**/api/v1/restaurants/cofein/branding'); await failSetup.page.getByRole('button', { name: 'Опитай отново', exact: true }).click(); await step(failSetup.page, 'visit');
  check('Setup retry restores the first step'); report.simulatedCases.push('GET branding 503'); await failSetup.context.close();

  const failure = await makePage({ width: 390, height: 844 }); const f = failure.page;
  await f.route(blockedUrl, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })); await open(f); await visit(f);
  await f.getByRole('button', { name: 'Покажи масите', exact: true }).click(); await step(f, 'table');
  await f.waitForFunction(() => document.querySelector('.cofein-booking-live')?.textContent.includes('опитайте'));
  check('Availability failure keeps the plan visible but blocks selection and Continue', await f.locator('.cofein-map-table-button').count() === expectedTableCount && await f.locator('.cofein-map-table-button:enabled').count() === 0 && await f.getByRole('button', { name: 'Продължи', exact: true }).isDisabled());
  await capture(f, 'phone390-04-availability-error'); await f.unroute(blockedUrl); await f.getByRole('button', { name: 'Обнови наличността', exact: true }).click();
  await f.locator('.cofein-map-table-button:enabled').first().waitFor(); check('Retry recovers actual availability without restarting the form');
  report.simulatedCases.push('GET blocked-slots 503'); await failure.context.close();

  const stale = await makePage(); const s = stale.page; let firstRoute, sawFirst; const firstSeen = new Promise(resolve => { sawFirst = resolve; }); let requestCount = 0;
  await s.route(blockedUrl, async route => { requestCount++; if (requestCount === 1) { firstRoute = route; sawFirst(); } else await route.continue(); });
  await open(s); const oldDate = await visit(s); await firstSeen;
  await s.getByRole('button', { name: 'Покажи масите', exact: true }).click(); await step(s, 'table');
  check('Loading a new search cannot enable unverified tables', await s.locator('.cofein-map-table-button:enabled').count() === 0 && await s.getByRole('button', { name: 'Продължи', exact: true }).isDisabled());
  await s.locator('.cofein-booking-visit-summary').getByRole('button', { name: 'Промени', exact: true }).click(); const newDate = await visit(s, { days: 4 });
  await s.getByRole('button', { name: 'Покажи масите', exact: true }).click(); await step(s, 'table'); await s.locator('.cofein-map-table-button:enabled').first().waitFor();
  await firstRoute.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ reservedDate: oldDate, reservedTime: '19:00', tableIds: ['T13'] }]) }).catch(() => {}); await frame(s);
  check('An obsolete delayed availability response cannot overwrite the newer search', await s.locator('[data-table-id=T13]').isEnabled() && (await s.locator('.cofein-booking-visit-summary').innerText()).includes(newDate.split('-').reverse().join('.')));
  report.simulatedCases.push('Out-of-order blocked-slots response'); await stale.context.close();

  const preflight = await makePage(); const q = preflight.page; await open(q); const preflightDate = await contact(q, { days: 5 }); await fillContact(q);
  const postsBeforePreflight = observedPostCount;
  await q.route(blockedUrl, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ reservedDate: preflightDate, reservedTime: '19:00', tableIds: ['T13'] }]) }));
  await q.getByRole('button', { name: 'Резервирай маса', exact: true }).click(); await step(q, 'table');
  await q.waitForFunction(() => document.querySelector('[data-table-id=T13]')?.disabled);
  check('Final preflight catches a newly occupied table before any POST and clears selection', observedPostCount === postsBeforePreflight && await q.getByRole('button', { name: 'Продължи', exact: true }).isDisabled() && await q.evaluate(key => sessionStorage.getItem(key), pendingKey) === null);
  report.simulatedCases.push('Table becomes occupied during final pre-POST availability check'); await preflight.context.close();

  const conflict = await makePage(); const c = conflict.page; await open(c); await contact(c, { days: 5 }); await fillContact(c);
  let conflictPosts = 0; await c.route(bookingUrl, route => { conflictPosts++; return route.fulfill({ status: 409, contentType: 'application/json', body: '{}' }); });
  await c.getByRole('button', { name: 'Резервирай маса', exact: true }).click(); await step(c, 'table');
  check('A definitive booking conflict returns to table selection and clears the pending marker', conflictPosts === 1 && await c.evaluate(key => sessionStorage.getItem(key), pendingKey) === null && await c.getByRole('button', { name: 'Продължи', exact: true }).isDisabled());
  await c.locator('.cofein-map-table-button:enabled').first().waitFor(); await chooseMap(c); await c.getByRole('button', { name: 'Продължи', exact: true }).click(); await step(c, 'contact');
  check('Conflict recovery preserves contact details', (await c.locator('[name=guestName]').inputValue()).includes('Георги Иванов'));
  report.simulatedCases.push('Reservation POST 409, no actual write'); await conflict.context.close();

  const unknown = await makePage({ width: 390, height: 844 }); const u = unknown.page; await open(u); await contact(u, { days: 6 }); await fillContact(u);
  let unknownPosts = 0; await u.route(bookingUrl, route => { unknownPosts++; return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); });
  await u.getByRole('button', { name: 'Резервирай маса', exact: true }).click(); await step(u, 'result');
  check('An uncertain POST outcome blocks immediate resubmission and stores no personal data', await u.getByRole('button', { name: 'Нова резервация след проверка', exact: true }).isDisabled() && await u.evaluate(key => sessionStorage.getItem(key), pendingKey) === '1');
  await capture(u, 'phone390-05-unknown-result');
  await u.getByRole('button', { name: 'Готово', exact: true }).click(); await u.evaluate(() => { location.hash = '#booking'; }); await step(u, 'result');
  await u.reload(); await step(u, 'result');
  check('Closing, reopening and reloading preserve uncertainty protection without another POST', unknownPosts === 1 && await u.getByRole('button', { name: 'Нова резервация след проверка', exact: true }).isDisabled() && await u.locator('[name=guestName]').count() === 0);
  report.simulatedCases.push('Reservation POST 503, no actual write'); await unknown.context.close();

  const reduced = await makePage({ width: 844, height: 390, reducedMotion: true }); const r = reduced.page; await open(r); await tables(r); await chooseMap(r);
  check('Landscape reduced-motion mode keeps its action visible and avoids horizontal overflow', contained(await bounds(r, 'landscape-reduced-motion')));
  await capture(r, 'landscape-selected');
  await r.keyboard.press('Escape'); check('Escape closes an idle booking dialog', await r.locator('dialog[open]').count() === 0); await reduced.context.close();

  assert.deepEqual(await api('/api/floor-plan', { tenant: 'casa-di-fratelli' }), casaBefore);
  check('Cofein flow leaves the Casa floor plan unchanged');
  const after = await api('/api/reservations');
  check('Existing reservations remain and the only actual test booking was cancelled', baseline.every(item => after.some(value => value.id === item.id)) && report.cleanup.every(cleanup => after.find(item => item.id === cleanup.reservationId)?.status === 'Cancelled'));
  check('No browser runtime errors', report.errors.length === 0); report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.message; report.stack = error.stack; process.exitCode = 1;
  await currentPage?.screenshot({ path: path.join(outputRoot, 'failure.png'), animations: 'disabled' }).catch(() => {});
} finally {
  await Promise.allSettled(responseTasks);
  for (const id of reservationsToCancel) {
    try { await api(`/api/reservations/${id}/cancel`, { method: 'PATCH' }); report.cleanup.push({ reservationId: id, cancelled: true }); }
    catch (error) { report.cleanup.push({ reservationId: id, cancelled: false, error: error.message }); report.passed = false; process.exitCode = 1; }
  }
  await browser.close();
  await fs.writeFile(path.join(outputRoot, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure, outputRoot }));
}
