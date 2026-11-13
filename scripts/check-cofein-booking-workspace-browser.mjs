// Real Chromium against the disposable local fixture; all failure cases are
// intercepted reads/POSTs. The single real reservation is cancelled in finally.
// node script <private state> <evidence dir> <playwright module> <chromium>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [statePath, outputRoot, playwrightPath, chromiumPath] = process.argv.slice(2);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const value of [state.apiUrl, state.origin]) assert.equal(new URL(value).hostname, '127.0.0.1');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
await fs.mkdir(outputRoot, { recursive: true });
const report = { localOnly: true, realBrowser: true, checks: [], errors: [], screenshots: [], metrics: [], simulatedCases: [], cleanup: [] };
const created = new Set();
const responseTasks = [];
const bookingUrl = `${state.apiUrl}/api/v1/restaurants/cofein/reservations`;
const blockedUrl = `${bookingUrl}/blocked-slots`;
const planUrl = `${state.apiUrl}/api/v1/restaurants/cofein/floor-plan`;
const zonesUrl = `${state.apiUrl}/api/v1/restaurants/cofein/zones`;
const pendingKey = 'cofein:booking:pending:v1';
let page, postCount = 0;
const check = (name, condition = true) => { assert(condition, name); report.checks.push({ name, passed: true }); console.log(`PASS ${report.checks.length}: ${name}`); };
const frame = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function api(route, { method = 'GET', body, tenant = 'cofein' } = {}) {
  const response = await fetch(state.apiUrl + route, { method, headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenant, 'X-Admin-Token': state.tenants[tenant].auth.token }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert(response.ok, `${method} ${route}: ${response.status}`);
  const raw = await response.text(); return raw ? JSON.parse(raw) : null;
}
async function makePage(size = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.width < 600, hasTouch: size.width < 600, locale: 'bg-BG', timezoneId: 'Europe/Sofia', reducedMotion: 'reduce' });
  const p = await context.newPage(); page = p; p.setDefaultTimeout(12000);
  p.on('pageerror', error => report.errors.push(error.message));
  p.on('request', request => { if (request.url() === bookingUrl && request.method() === 'POST') postCount++; });
  p.on('response', response => { if (response.url() === bookingUrl && response.request().method() === 'POST' && response.ok()) responseTasks.push(response.json().then(result => { if (result.id) created.add(result.id); }).catch(() => {})); });
  return { context, page: p };
}
async function open(p) {
  await p.goto(state.origin + '/cofein-preview.html#booking');
  await p.locator('.cofein-booking[data-step=workspace], .cofein-booking[data-step=result], .cofein-booking-empty').first().waitFor();
  await p.locator('dialog').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished))); await frame(p);
}
async function editVisit(p) {
  if (!(await p.locator('[name=reservedTime]').isVisible())) await p.getByRole('button', { name: 'Промени посещението и залата', exact: true }).click();
  await p.locator('[name=reservedTime]').waitFor();
}
async function visit(p, { days = 3, guests = 2, time = '19:00' } = {}) {
  await editVisit(p);
  const min = await p.locator('[name=reservedDate]').getAttribute('min');
  const target = new Date(min + 'T12:00:00Z'); target.setUTCDate(target.getUTCDate() + days); const date = target.toISOString().slice(0, 10);
  await p.locator('[name=reservedDate]').fill(date);
  await p.locator('[name=reservedTime]').selectOption(time);
  await p.locator('[name=guestCount]').selectOption(String(guests));
  return date;
}
async function showMap(p) {
  const next = p.getByRole('button', { name: 'Виж масите', exact: true });
  if (await next.isVisible()) await next.click();
  await p.locator('.cofein-map-table-button:enabled').first().waitFor(); await frame(p);
}
async function chooseHall(p, name) {
  await editVisit(p);
  await p.locator('.cofein-booking-hall-options').getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
async function choose(p, tableId = 'T19') {
  await p.locator('.cofein-booking-sections button').first().click();
  await p.locator(`[data-table-id="${tableId}"]`).click();
  await p.getByRole('button', { name: 'Вашите данни', exact: true }).waitFor();
  assert(await p.getByRole('button', { name: 'Вашите данни', exact: true }).isEnabled());
}
async function contact(p, options) {
  const date = await visit(p, options); await showMap(p); await choose(p);
  await p.getByRole('button', { name: 'Вашите данни', exact: true }).click();
  await p.locator('.cofein-booking[data-step=contact]').waitFor(); await frame(p); return date;
}
async function fillContact(p, name = 'Локален UX тест Георги Иванов') {
  const draft = { guestName: name, phone: '089' + Date.now().toString().slice(-7), email: `cofein-workspace-${Date.now()}@example.test` };
  for (const [key, value] of Object.entries(draft)) await p.locator(`[name=${key}]`).fill(value);
  await p.locator('[name=privacyConsent]').check(); return draft;
}
async function capture(p, name) { await p.screenshot({ path: path.join(outputRoot, name + '.png'), animations: 'disabled' }); report.screenshots.push(name + '.png'); }
async function measure(p, label) {
  const result = await p.evaluate(() => {
    const rect = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
    const body = document.querySelector('.cofein-booking-body');
    const buttons = [...document.querySelectorAll('.cofein-booking-footer .cofein-booking-primary')].filter(e => e.getClientRects().length);
    const nodes = [...document.querySelectorAll('.cofein-map-table-button')];
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, bodyWidth: body.scrollWidth, bodyClientWidth: body.clientWidth,
      actionCount: buttons.length, action: rect(buttons[0]), map: rect(document.querySelector('.cofein-map-viewport')), controls: rect(document.querySelector('.cofein-booking-visit-controls')), tableTargets: nodes.map(e => ({ id: e.dataset.tableId, ...rect(e) })) };
  });
  report.metrics.push({ label, ...result });
  check(`${label}: one visible primary action fits the screen without horizontal overflow`, result.documentWidth <= result.width && result.bodyWidth <= result.bodyClientWidth && result.actionCount === 1 && result.action.x >= 0 && result.action.right <= result.width + 1 && result.action.y >= 0 && result.action.bottom <= result.height + 1);
  return result;
}
async function step(p, value) { await p.locator(`.cofein-booking[data-step=${value}]`).waitFor(); await frame(p); }

try {
  const baseline = await api('/api/reservations'); const plan = await api('/api/floor-plan'); const casa = await api('/api/floor-plan', { tenant: 'casa-di-fratelli' });
  const areas = new Map(plan.tables.map(t => [t.id, t.area]));
  for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'phone390', width: 390, height: 844 }, { name: 'phone360', width: 360, height: 740 }, { name: 'landscape', width: 844, height: 390 }]) {
    const device = await makePage(size); const p = device.page; await open(p);
    await measure(p, `${size.name}-initial`); await capture(p, `${size.name}-01-initial`);
    check(`${size.name}: hall choice has one owner and no all-halls or global map navigation`, await p.locator('.cofein-booking-halls').count() === 1 && await p.getByText('Без предпочитание', { exact: true }).count() === 0 && await p.locator('.cofein-map-views, .cofein-booking-choice').count() === 0);
    await visit(p); await showMap(p); await measure(p, `${size.name}-map`);
    const mainIds = await p.locator('[data-table-id]').evaluateAll(nodes => nodes.map(n => n.dataset.tableId));
    check(`${size.name}: selected hall renders only its own section and furniture`, mainIds.length > 0 && mainIds.every(id => areas.get(id) === 'interior') && await p.locator('.cofein-map-world').getAttribute('data-map-zone') === 'interior' && await p.locator('.cofein-booking-sections button').count() === 2);
    if (size.width > 900) check('Desktop keeps editable visit controls alongside the map', await p.locator('[name=reservedTime]').isVisible());
    else {
      check(`${size.name}: map replaces visit controls and exposes one edit affordance`, !(await p.locator('[name=reservedTime]').isVisible()) && await p.getByRole('button', { name: 'Промени посещението и залата', exact: true }).isVisible());
      await editVisit(p); check(`${size.name}: editing exposes the original controls and hides the map`, await p.locator('.cofein-booking-visit-controls:visible').count() === 1 && !(await p.locator('.cofein-map-viewport').isVisible())); await showMap(p);
    }
    await choose(p); await p.locator('.cofein-booking-sections button').nth(1).click();
    check(`${size.name}: switching crop preserves hall and selected table`, await p.locator('.cofein-map-world').getAttribute('data-map-zone') === 'interior' && (await p.locator('.cofein-booking-footer-summary').innerText()).includes('T19') && await p.getByRole('button', { name: 'Вашите данни', exact: true }).isEnabled());
    const angleIds = await p.locator('[data-table-id]').evaluateAll(nodes => nodes.map(n => n.dataset.tableId));
    check(`${size.name}: alternate crop changes visible furniture without moving other tables`, angleIds.length > 0 && angleIds.every(id => areas.get(id) === 'interior') && !angleIds.includes('T19') && new Set([...mainIds, ...angleIds]).size === plan.tables.filter(table => table.area === 'interior' && table.isActive).length);
    await p.locator('.cofein-booking-sections button').first().click(); await capture(p, `${size.name}-02-selected`);
    await chooseHall(p, 'Екстериор'); await showMap(p);
    check(`${size.name}: changing hall clears selection and switches the scoped map`, await p.locator('.cofein-map-world').getAttribute('data-map-zone') === 'exterior' && await p.getByRole('button', { name: 'Изберете маса', exact: true }).isDisabled() && !(await p.locator('.cofein-booking-footer-summary').innerText()).includes('T19'));
    await p.locator('.cofein-booking-sections button').nth(1).click(); await p.locator('[data-table-id=T13]').click(); await capture(p, `${size.name}-02-exterior-selected`);
    check(`${size.name}: table selection uses only the scoped map without a list or mode switch`, await p.getByRole('button', { name: 'Списък', exact: true }).count() === 0 && await p.locator('.cofein-booking-mode, .cofein-booking-list, .cofein-booking-options').count() === 0 && await p.locator('.cofein-map-table-button[aria-pressed=true]').getAttribute('data-table-id') === 'T13');
    await chooseHall(p, 'Интериор'); await showMap(p); await choose(p);
    await p.getByRole('button', { name: 'Вашите данни', exact: true }).click(); await step(p, 'contact'); await measure(p, `${size.name}-contact`);
    check(`${size.name}: contacts contain one summary, focused heading and no early validation`, await p.locator('.cofein-booking-selection').count() === 1 && await p.locator('.cofein-field-error').count() === 0 && await p.locator('#dialog-title').evaluate(e => e === document.activeElement));
    await capture(p, `${size.name}-03-contact`); await p.locator('[name=guestName]').fill('Запазена чернова');
    await p.locator('.cofein-booking-selection').getByRole('button', { name: 'Промени', exact: true }).click(); await step(p, 'workspace');
    await p.getByRole('button', { name: 'Вашите данни', exact: true }).click(); await step(p, 'contact');
    check(`${size.name}: back to map and forward preserve contact draft without POST`, await p.locator('[name=guestName]').inputValue() === 'Запазена чернова' && postCount === 0);
    await device.context.close();
  }

  const grouped = await makePage(); const g = grouped.page;
  const groupIds = ['T19', 'T20'];
  await g.route(planUrl, async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({ response, json: { ...data, publicMaxTables: 2, publicMaxGuests: Math.max(data.publicMaxGuests, 4), combinations: [groupIds], tables: data.tables.map(table => groupIds.includes(table.id) ? { ...table, seats: 2 } : table) } });
  });
  await open(g); await visit(g, { guests: 4 }); await showMap(g);
  const firstMember = g.locator('[data-table-id=T19]');
  await firstMember.focus(); await firstMember.press('Enter');
  check('A permitted combination can be selected directly on the map with the keyboard', (await g.locator('.cofein-map-table-button[aria-pressed=true]').evaluateAll(nodes => nodes.map(node => node.dataset.tableId).sort())).join('|') === groupIds.join('|') && await g.getByRole('button', { name: 'Вашите данни', exact: true }).isEnabled());
  await g.locator('[data-table-id=T20]').click();
  check('Tapping another member preserves the selected combination without introducing a table list', await g.locator('.cofein-map-table-button[aria-pressed=true]').count() === 2 && await g.locator('.cofein-booking-mode, .cofein-booking-list, .cofein-booking-options').count() === 0);
  await capture(g, 'map-only-combination');
  await g.getByRole('button', { name: 'Вашите данни', exact: true }).click(); await step(g, 'contact');
  check('The map-selected combination reaches contacts without an early booking request', await g.locator('.cofein-booking-selection').count() === 1 && postCount === 0);
  report.simulatedCases.push('GET floor-plan enables one permitted pair; no plan or booking write');
  await grouped.context.close();

  const real = await makePage(); const r = real.page; await open(r); const date = await contact(r);
  await r.locator('.cofein-booking').getByRole('button', { name: 'Резервирай маса', exact: true }).click();
  check('Required field validation focuses name and sends no request', await r.locator('.cofein-field-error').count() === 4 && await r.locator('[name=guestName]').evaluate(e => e === document.activeElement) && postCount === 0);
  const draft = await fillContact(r); let release, received; const gate = new Promise(resolve => { release = resolve; }); const seen = new Promise(resolve => { received = resolve; }); let realPosts = 0;
  await r.route(bookingUrl, async route => {
    if (route.request().method() !== 'POST') return route.continue(); realPosts++;
    const response = await route.fetch(); const result = await response.json(); if (result.id) created.add(result.id); received(result); await gate; await route.fulfill({ response });
  });
  await r.locator('.cofein-booking').getByRole('button', { name: 'Резервирай маса', exact: true }).click({ clickCount: 2 }); const booked = await seen;
  check('Real request disables close and prevents double-submit', realPosts === 1 && await r.getByRole('button', { name: 'Затвори прозореца', exact: true }).isDisabled());
  await r.keyboard.press('Escape'); check('Escape cannot dismiss an in-flight booking', await r.locator('dialog[open]').count() === 1); release(); await step(r, 'result');
  await r.getByText('Резервацията Ви е потвърдена.', { exact: true }).waitFor();
  check('Real public booking confirms chosen hall/table/date and clears pending marker', booked.status === 'Approved' && booked.area === 'interior' && booked.tableIds.includes('T19') && booked.reservedDate === date && await r.evaluate(key => sessionStorage.getItem(key), pendingKey) === null);
  const rows = await api('/api/reservations'); check('Administrator API sees the exact submitted booking', rows.some(row => row.id === booked.id && row.guestName === draft.guestName && row.tableIds.includes('T19'))); await capture(r, 'real-confirmation');
  const admin = await real.context.newPage(); page = admin; admin.setDefaultTimeout(15000); admin.on('pageerror', error => report.errors.push(error.message));
  await admin.goto(state.origin + '/r/cofein/admin'); await admin.locator('input[type=email]').fill(state.tenants.cofein.email); await admin.locator('input[type=password]').fill(state.tenants.cofein.password); await admin.locator('button[type=submit]').click(); await admin.getByText('Restaurant CRM', { exact: true }).waitFor();
  await admin.getByRole('button', { name: /^Резервации/ }).first().click();
  await admin.getByText(draft.guestName, { exact: true }).last().waitFor();
  check('Administrator browser displays the newly created guest reservation'); await capture(admin, 'real-admin-reservation');
  await api(`/api/reservations/${booked.id}/cancel`, { method: 'PATCH' }); created.delete(booked.id); report.cleanup.push({ reservationId: booked.id, cancelled: true });
  await real.context.close();

  const failure = await makePage({ width: 390, height: 844 }); const f = failure.page; await f.route(blockedUrl, route => route.fulfill({ status: 503, json: {} })); await open(f); await visit(f); await f.getByRole('button', { name: 'Виж масите', exact: true }).click();
  await f.getByRole('button', { name: 'Опитай отново', exact: true }).waitFor();
  check('Availability failure keeps the chosen hall visible and disables unverified furniture', await f.locator('.cofein-map-world').getAttribute('data-map-zone') === 'interior' && await f.locator('.cofein-map-table-button:enabled').count() === 0 && await f.getByRole('button', { name: 'Изберете маса', exact: true }).isDisabled());
  await capture(f, 'availability-failure'); await f.unroute(blockedUrl); await f.getByRole('button', { name: 'Опитай отново', exact: true }).click(); await f.locator('.cofein-map-table-button:enabled').first().waitFor(); check('Retry recovers availability in place'); report.simulatedCases.push('GET availability503'); await failure.context.close();

  const preflight = await makePage(); const q = preflight.page; await open(q); const qDate = await contact(q, { days: 5 }); await fillContact(q); const postsBefore = postCount;
  await q.route(blockedUrl, route => route.fulfill({ status: 200, json: [{ reservedDate: qDate, reservedTime: '19:00', tableIds: ['T19'] }] }));
  await q.locator('.cofein-booking').getByRole('button', { name: 'Резервирай маса', exact: true }).click(); await step(q, 'workspace');
  check('Final preflight catches a newly occupied table and returns to the same hall without POST', postCount === postsBefore && await q.getByRole('button', { name: 'Изберете маса', exact: true }).isDisabled() && await q.evaluate(key => sessionStorage.getItem(key), pendingKey) === null); report.simulatedCases.push('Occupied final preflight'); await preflight.context.close();

  const relocated = await makePage(); const moved = relocated.page; await open(moved); await contact(moved, { days: 5 }); await fillContact(moved); const postsBeforeMove = postCount;
  // A stable table ID can move to another hall while the guest fills contacts.
  // Trap any unexpected POST so even a regression cannot book a different hall.
  await moved.route(bookingUrl, route => route.fulfill({ status: 503, json: {} }));
  await moved.route(planUrl, async route => { const response = await route.fetch(); const data = await response.json(); await route.fulfill({ response, json: { ...data, tables: data.tables.map(table => table.id === 'T19' ? { ...table, area: 'exterior' } : table) } }); });
  await moved.locator('.cofein-booking').getByRole('button', { name: 'Резервирай маса', exact: true }).click(); await step(moved, 'workspace');
  check('Final preflight rejects a table relocated into another hall without sending POST', postCount === postsBeforeMove && await moved.locator('.cofein-map-world').getAttribute('data-map-zone') === 'interior' && await moved.getByRole('button', { name: 'Изберете маса', exact: true }).isDisabled() && await moved.evaluate(key => sessionStorage.getItem(key), pendingKey) === null);
  report.simulatedCases.push('Selected table moves to a different hall before final preflight'); await relocated.context.close();

  const unknown = await makePage({ width: 390, height: 844 }); const u = unknown.page; await open(u); await contact(u, { days: 6 }); await fillContact(u); let unknownPosts = 0;
  await u.route(bookingUrl, route => { unknownPosts++; return route.fulfill({ status: 503, json: {} }); });
  await u.locator('.cofein-booking').getByRole('button', { name: 'Резервирай маса', exact: true }).click(); await step(u, 'result');
  check('Uncertain POST outcome blocks resubmission and stores only a non-personal marker', await u.getByRole('button', { name: 'Нова резервация след проверка', exact: true }).isDisabled() && await u.evaluate(key => sessionStorage.getItem(key), pendingKey) === '1');
  await capture(u, 'unknown-result'); await u.getByRole('button', { name: 'Готово', exact: true }).click(); await u.evaluate(() => { location.hash = '#booking'; }); await step(u, 'result'); await u.reload(); await step(u, 'result');
  check('Reopen and reload retain uncertainty protection with exactly one intercepted POST', unknownPosts === 1 && await u.getByRole('button', { name: 'Нова резервация след проверка', exact: true }).isDisabled()); report.simulatedCases.push('POST503, no write'); await unknown.context.close();

  const policy = await makePage(); const y = policy.page; await open(y); await contact(y); await y.locator('[name=guestName]').fill('Чернова при промяна на правилата');
  await y.route(planUrl, async route => { const response = await route.fetch(); const data = await response.json(); await route.fulfill({ response, json: { ...data, publicMaxGuests: 1 } }); });
  await y.evaluate(() => window.dispatchEvent(new Event('focus'))); await step(y, 'workspace');
  const guests = y.locator('[name=guestCount]'); await guests.waitFor();
  report.policyObserved = await guests.evaluate(element => ({ value: element.value, selected: [...element.selectedOptions].map(option => ({ value: option.value, disabled: option.disabled })) }));
  check('Changed party policy exposes invalid prior value and returns to visit controls', report.policyObserved.value === '2' && report.policyObserved.selected[0]?.disabled === true && await y.getByRole('button', { name: 'Изберете час', exact: true }).isDisabled());
  await guests.focus(); await guests.press('1'); await guests.press('Tab'); await showMap(y); await choose(y); await y.getByRole('button', { name: 'Вашите данни', exact: true }).click(); await step(y, 'contact');
  check('Native policy correction preserves the contact draft', await y.locator('[name=guestName]').inputValue() === 'Чернова при промяна на правилата'); report.simulatedCases.push('Live publicMaxGuests change'); await policy.context.close();

  const scalable = await makePage({ width: 390, height: 844 }); const z = scalable.page;
  const extras = Array.from({ length: 6 }, (_, i) => ({ id: `qa-hall-${i}`, name: `Допълнителна зала ${i + 1}`, names: { bg: `Допълнителна зала ${i + 1}` }, presentation: 'plain', isActive: true }));
  await z.route(planUrl, async route => { const response = await route.fetch(); const data = await response.json(); await route.fulfill({ response, json: { ...data, zones: [...data.zones, ...extras], tables: [...data.tables, ...extras.map((zone, i) => ({ id: `QA${i}`, area: zone.id, x: 50, y: 50, seats: 4, isActive: true }))] } }); });
  await z.route(zonesUrl, async route => { const response = await route.fetch(); const data = await response.json(); await route.fulfill({ response, json: { ...data, closedAreas: ['exterior', 'qa-hall-5'] } }); });
  await open(z); await visit(z); await z.locator('[name=area]').selectOption('qa-hall-0'); await showMap(z);
  check('Eight halls use one native selector and a new hall renders only its own table', await z.locator('[name=area]').count() === 1 && await z.locator('.cofein-booking-hall-options').count() === 0 && await z.locator('[data-table-id=QA0]').count() === 1 && await z.locator('[data-table-id]').count() === 1 && await z.locator('.cofein-booking-sections').count() === 0);
  await measure(z, 'eight-halls-map'); await capture(z, 'eight-halls-map'); await editVisit(z);
  check('Seasonally closed halls are disabled in the single hall selector', await z.locator('[name=area] option[value=exterior]').isDisabled() && await z.locator('[name=area] option[value=qa-hall-5]').isDisabled());
  await capture(z, 'eight-halls-controls'); report.simulatedCases.push('Read-only8hall setup with2seasonalclosures'); await scalable.context.close();

  assert.deepEqual(await api('/api/floor-plan'), plan); assert.deepEqual(await api('/api/floor-plan', { tenant: 'casa-di-fratelli' }), casa);
  check('All original Cofein and Casa floor-plan coordinates remain unchanged');
  const after = await api('/api/reservations'); check('Existing reservations remain and the one actual test booking is cancelled', baseline.every(row => after.some(item => item.id === row.id)) && report.cleanup.length === 1 && report.cleanup.every(cleanup => after.find(row => row.id === cleanup.reservationId)?.status === 'Cancelled'));
  check('No browser runtime errors', report.errors.length === 0); report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.message; report.stack = error.stack; process.exitCode = 1;
  await page?.screenshot({ path: path.join(outputRoot, 'failure.png'), animations: 'disabled' }).catch(() => {});
} finally {
  await Promise.allSettled(responseTasks);
  for (const id of created) { try { await api(`/api/reservations/${id}/cancel`, { method: 'PATCH' }); report.cleanup.push({ reservationId: id, cancelled: true }); } catch (error) { report.cleanup.push({ reservationId: id, cancelled: false, error: error.message }); report.passed = false; process.exitCode = 1; } }
  await browser.close(); await fs.writeFile(path.join(outputRoot, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure, outputRoot }));
}
