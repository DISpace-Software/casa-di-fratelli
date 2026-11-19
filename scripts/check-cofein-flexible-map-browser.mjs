// Mutations are restricted to a disposable fixture created by check-shared-admin-local.py.
// Usage: node <this script> <private state> <evidence dir> <playwright module> <chromium>
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
const report = { localOnly: true, realBrowser: true, checks: [], errors: [], screenshots: [], cleanup: [] };
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
let page, createdBooking, newZone, baseline, baselineBookings, casaBefore;
let addedTableHasHistory = false;
const tableId = `QA${Date.now().toString().slice(-8)}`;
const hallName = 'Панорамна зала · локален тест';
const renamedHall = 'Панорамна зала · ново име';
const check = (name, condition = true) => { assert(condition, name); report.checks.push({ name, passed: true }); console.log(`PASS ${report.checks.length}: ${name}`); };
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function api(route, { tenant = 'cofein', method = 'GET', body, auth = true } = {}) {
  const response = await fetch(state.apiUrl + route, {
    method, headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenant, ...(auth ? { 'X-Admin-Token': state.tenants[tenant].auth.token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let data; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { status: response.status, data };
}
async function plan(tenant = 'cofein') {
  const response = await api('/api/floor-plan', { tenant }); assert.equal(response.status, 200); return response.data;
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outputRoot, name + '.png'), fullPage: false }); report.screenshots.push(name + '.png');
}
async function context(mobile = false) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 },
    isMobile: mobile, hasTouch: mobile, locale: 'bg-BG', timezoneId: 'Europe/Sofia' });
  ctx.on('page', page => { page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(error.message)); page.on('dialog', dialog => dialog.accept()); });
  return ctx;
}
async function login(ctx, tenant = 'cofein') {
  const result = await ctx.newPage();
  await result.goto(state.origin + `/r/${tenant}/admin`);
  await result.locator('input[type=email]').fill(state.tenants[tenant].email);
  await result.locator('input[type=password]').fill(state.tenants[tenant].password);
  await result.locator('button[type=submit]').click();
  await result.getByText('Restaurant CRM', { exact: true }).waitFor();
  return result;
}
async function editor(page) { await page.getByRole('button', { name: /^Карта\s*Контрол$/ }).click(); await page.getByRole('region', { name: 'Зали', exact: true }).waitFor(); }
async function save(page, expected = 200) {
  const response = page.waitForResponse(response => response.url().endsWith('/api/floor-plan') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Запази картата', exact: true }).click();
  assert.equal((await response).status(), expected); await frame(page);
}
async function editVisit(page) {
  if (!(await page.locator('[name=reservedTime]').isVisible())) await page.getByRole('button', { name: 'Промени посещението и залата', exact: true }).click();
  await page.locator('[name=reservedTime]').waitFor();
}
async function choosePublicHall(page, name, id = newZone?.id) {
  await editVisit(page);
  const select = page.locator('[name=area]');
  if (await select.count()) await select.selectOption(id);
  else await page.locator('.cofein-booking-hall-options').getByRole('button', { name: new RegExp('^' + name) }).click();
}
async function chooseAdminHall(page, name, id = newZone?.id) {
  const select = page.locator('.cofein-admin-hall-choice select');
  if (await select.count()) await select.selectOption(id);
  else await page.locator('.cofein-admin-hall-buttons').getByRole('button', { name, exact: true }).click();
}
async function showMap(page) {
  const next = page.getByRole('button', { name: 'Виж масите', exact: true });
  if (await next.isVisible()) await next.click();
  await page.locator('.cofein-map-table-button:enabled').first().waitFor(); await frame(page);
}
async function publicMap(ctx, hall = hallName) {
  const result = await ctx.newPage();
  await result.goto(state.origin + '/cofein-preview.html#booking');
  await result.locator('.cofein-booking[data-step=workspace]').waitFor();
  await result.locator('dialog').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await editVisit(result);
  const today = await result.locator('[name=reservedDate]').getAttribute('min');
  const day = new Date(today + 'T12:00:00Z'); day.setUTCDate(day.getUTCDate() + 3);
  await result.locator('[name=reservedDate]').fill(day.toISOString().slice(0, 10));
  await result.locator('[name=reservedTime]').selectOption('19:00');
  await result.locator('[name=guestCount]').selectOption('2');
  await choosePublicHall(result, hall);
  await showMap(result);
  return result;
}
async function refresh(page) {
  const response = page.waitForResponse(response => response.url().endsWith('/restaurants/cofein/floor-plan') && response.request().method() === 'GET');
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await response; await frame(page);
}
async function position(page, selector) {
  return page.locator(selector).evaluate(el => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }));
}

try {
  baseline = await plan(); casaBefore = await plan('casa-di-fratelli'); baselineBookings = (await api('/api/reservations')).data;
  check('Disposable baseline has 30 Cofein tables and 150 places', baseline.tables.length === 30 && baseline.tables.reduce((sum, table) => sum + table.seats, 0) === 150);
  const desktop = await context(); page = await login(desktop); await editor(page);
  const modeButtons = page.getByRole('group', { name: 'Изглед на картата', exact: true });
  await modeButtons.getByRole('button', { name: 'Цялата карта', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cofein-map-world')?.dataset.mapView === 'all');
  check('Editor whole-map preference previews the entire architecture');
  await modeButtons.getByRole('button', { name: 'По секции', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cofein-map-world')?.dataset.mapView !== 'all');
  check('Editor section preference returns to its selected hall');
  const halls = page.getByRole('region', { name: 'Зали', exact: true });
  await halls.getByLabel('Име на залата', { exact: true }).fill(hallName);
  await halls.getByRole('button', { name: 'Добави зала', exact: true }).click();
  await page.getByRole('button', { name: 'Добави маса', exact: true }).click();
  await page.getByLabel('Номер на маса', { exact: true }).fill(tableId);
  await page.getByLabel('Места', { exact: true }).fill('8');
  await page.getByLabel('X', { exact: true }).fill('60');
  await page.getByLabel('Y', { exact: true }).fill('60');
  assert.deepEqual(await plan(), baseline);
  check('Adding a hall, table, capacity and coordinates remains a local draft until Save');
  await save(page);
  let saved = await plan(); newZone = saved.zones.find(zone => zone.name === hallName);
  assert(newZone); assert.deepEqual(saved.tables.find(table => table.id === tableId), { id: tableId, area: newZone.id, x: 60, y: 60, seats: 8, special: false, wide: false, isActive: true });
  check('One full-plan API save persists a new stable hall ID with table, position and eight seats');
  assert.deepEqual(saved.tables.filter(table => table.id !== tableId), baseline.tables);
  check('Original 30 Cofein table identities, coordinates and capacities remain unchanged');
  await page.reload(); await page.getByText('Restaurant CRM', { exact: true }).waitFor(); await editor(page);
  const tableSelector = `.cofein-map-table-button[data-table-id="${tableId}"]`;
  await chooseAdminHall(page, hallName);
  await page.locator(tableSelector).waitFor();
  check('Reloaded administrator editor keeps the persisted new hall accessible alongside the original furniture', await page.locator('.cofein-map-table-button').count() === baseline.tables.length + 1);
  check('Choosing the new-hall map view also selects its table editing controls', await page.getByLabel('Номер на маса', { exact: true }).inputValue() === tableId);
  await page.locator(tableSelector).click(); await frame(page);
  const cameraBefore = await page.locator('.cofein-map-world').evaluate(element => getComputedStyle(element).transform);
  await page.locator(tableSelector).press('ArrowRight'); await frame(page);
  check('Keyboard table movement changes its local coordinate without moving the camera', await page.getByLabel('X', { exact: true }).inputValue() === '60.5' && await page.locator('.cofein-map-world').evaluate(element => getComputedStyle(element).transform) === cameraBefore);
  const tableBox = await page.locator(tableSelector).boundingBox();
  await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2);
  await page.mouse.down(); await page.mouse.move(tableBox.x + tableBox.width / 2 + 30, tableBox.y + tableBox.height / 2 + 15, { steps: 4 }); await page.mouse.up(); await frame(page);
  check('Pointer table drag changes coordinates without reframing the camera', Number(await page.getByLabel('X', { exact: true }).inputValue()) > 60.5 && Number(await page.getByLabel('Y', { exact: true }).inputValue()) > 60 && await page.locator('.cofein-map-world').evaluate(element => getComputedStyle(element).transform) === cameraBefore);
  assert.equal((await plan()).tables.find(table => table.id === tableId).x, 60);
  await save(page);
  const editorPosition = await position(page, tableSelector);
  await screenshot(page, '01-admin-new-hall');

  const publicPage = await publicMap(desktop);
  await publicPage.locator(tableSelector + ':enabled').waitFor();
  assert.deepEqual(await position(publicPage, tableSelector), editorPosition);
  check('Public booking uses the same new-hall table position and furniture dimensions as administration');
  await publicPage.locator(tableSelector).click();
  assert.match(await publicPage.locator(tableSelector).getAttribute('aria-label'), /8 места/);
  check('Public new-hall view is selectable and displays the API capacity of eight places');
  await publicPage.locator('.cofein-map-surface').scrollIntoViewIfNeeded();
  await screenshot(publicPage, '02-public-new-hall');
  await publicPage.getByRole('button', { name: 'Вашите данни', exact: true }).click();
  await publicPage.locator('input[name=guestName]').fill('Локален тест на нова зала');
  await publicPage.locator('input[name=phone]').fill('0888000001');
  await publicPage.locator('input[name=email]').fill('new-hall@example.test');
  await publicPage.locator('input[name=privacyConsent]').check();
  const bookingResponse = publicPage.waitForResponse(response => response.url().endsWith('/restaurants/cofein/reservations') && response.request().method() === 'POST');
  await publicPage.locator('.cofein-booking').getByRole('button', { name: 'Резервирай маса', exact: true }).click();
  const received = await bookingResponse; assert.equal(received.status(), 200); createdBooking = await received.json(); addedTableHasHistory = true;
  await publicPage.getByText('Резервацията Ви е потвърдена.', { exact: true }).waitFor();
  check('Real public booking in an added hall is approved through the tenant API and reaches a confirmation screen', createdBooking.area === newZone.id && createdBooking.tableIds.includes(tableId));
  const bookings = await api('/api/reservations');
  check('Administrator API sees the same new-hall booking', bookings.data.some(booking => booking.id === createdBooking.id && booking.area === newZone.id));
  assert.equal((await api(`/api/reservations/${createdBooking.id}/cancel`, { method: 'PATCH' })).status, 200);
  report.cleanup.push({ reservationId: createdBooking.id, cancelled: true });
  createdBooking = null;

  await halls.getByRole('button', { name: new RegExp(hallName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  await halls.getByLabel('Редактиране: Име на залата', { exact: true }).fill(renamedHall);
  await save(page);
  saved = await plan(); assert.equal(saved.zones.find(zone => zone.id === newZone.id).name, renamedHall);
  const livePublic = await publicMap(desktop, renamedHall);
  await livePublic.locator('.cofein-booking-map-header h3').filter({ hasText: renamedHall }).waitFor();
  check('Renaming preserves hall identity and updates the public view label');

  const mobile = await context(true); const mobilePublic = await publicMap(mobile, renamedHall);
  await mobilePublic.locator(tableSelector).tap();
  check('Phone can select a table in a dynamically added hall', (await mobilePublic.locator('.cofein-booking-footer-summary').innerText()).includes(tableId));
  check('Sparse-hall phone detail provides a table target at least 44 by 44 pixels', await mobilePublic.locator(tableSelector).evaluate(element => { const rect = element.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44; }));
  check('Phone public document and booking dialog have no horizontal overflow', await mobilePublic.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth));
  await mobilePublic.locator('.cofein-map-surface').scrollIntoViewIfNeeded(); await screenshot(mobilePublic, '03-phone-public-new-hall');
  const mobileAdmin = await login(mobile); await editor(mobileAdmin);
  await mobileAdmin.getByRole('region', { name: 'Зали', exact: true }).getByLabel('Редактиране: Име на залата', { exact: true }).waitFor();
  check('Phone administrator editor has no horizontal page overflow', await mobileAdmin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await chooseAdminHall(mobileAdmin, renamedHall);
  await mobileAdmin.locator('.cofein-map-surface').scrollIntoViewIfNeeded();
  check('Phone administrator map surface and viewport fit inside the visible screen', await mobileAdmin.locator('.cofein-map-explorer, .cofein-map-surface, .cofein-map-viewport').evaluateAll(elements => elements.every(element => {
    const bounds = element.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth + 1;
  })));
  await screenshot(mobileAdmin, '04-phone-hall-editor');

  await halls.getByLabel('Активна зала', { exact: true }).uncheck(); await save(page); await refresh(livePublic);
  await livePublic.locator(tableSelector).waitFor({ state: 'detached' });
  await editVisit(livePublic);
  check('Deactivating a hall removes its table and hall choice from refreshed public availability', await livePublic.locator('.cofein-booking-hall-options').getByRole('button', { name: new RegExp('^' + renamedHall) }).count() === 0 && await livePublic.locator(`[name=area] option[value="${newZone.id}"]`).count() === 0);
  const inactive = await plan();
  check('Inactive hall retains its eight-seat table for history while contributing no active capacity', inactive.tables.some(table => table.id === tableId && table.seats === 8) && inactive.zones.find(zone => zone.id === newZone.id).isActive === false);
  await halls.getByLabel('Активна зала', { exact: true }).check(); await save(page);

  await halls.getByLabel('Редактиране: Име на залата', { exact: true }).fill('Незапазена локална промяна');
  const external = await plan();
  external.zones = external.zones.map(zone => zone.id === newZone.id ? { ...zone, name: renamedHall + ' · актуална', names: { ...zone.names, bg: renamedHall + ' · актуална' } } : zone);
  assert.equal((await api('/api/floor-plan', { method: 'PUT', body: external })).status, 200);
  await save(page, 409);
  check('Concurrent API edit rejects stale browser save without overwriting the newer map', (await plan()).zones.find(zone => zone.id === newZone.id).name === renamedHall + ' · актуална');
  check('Conflict retains the unsaved hall-name draft and requires reload', await halls.getByLabel('Редактиране: Име на залата', { exact: true }).inputValue() === 'Незапазена локална промяна' && await page.getByRole('button', { name: 'Запази картата', exact: true }).isDisabled());
  await screenshot(page, '05-conflict-retained-draft');
  await page.getByRole('button', { name: 'Зареди актуалната карта', exact: true }).click();
  await halls.getByRole('button', { name: new RegExp(renamedHall) }).click();
  await halls.getByLabel('Редактиране: Име на залата', { exact: true }).fill(renamedHall); await save(page);
  await page.getByRole('button', { name: '← Назад', exact: true }).click();
  await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
  const operationalTable = page.getByRole('button', { name: `Маса ${tableId}, 8 места`, exact: true });
  await chooseAdminHall(page, renamedHall);
  await operationalTable.waitFor();
  check('Operational map displays only the added hall in section mode', await page.locator('.cofein-map-table-button').count() === 1);
  await page.locator('[data-admin-map-mode=scroll]').click();
  await page.waitForFunction(() => document.querySelector('[data-admin-map-view]')?.dataset.adminMapView === 'all');
  check('Whole operational map includes all original tables and the added hall', await page.locator('.cofein-map-table-button').count() === baseline.tables.length + 1);
  assert.deepEqual(await operationalTable.evaluate(element => ({ left: element.parentElement.style.left, top: element.parentElement.style.top, width: element.style.width, height: element.style.height })), editorPosition);
  check('Public map, layout editor and operational map share identical saved table geometry');
  await screenshot(page, '06-admin-operational-map');
  assert.deepEqual(await plan('casa-di-fratelli'), casaBefore);
  check('All Cofein hall, table and booking writes leave the Casa floor plan unchanged');
  check('No browser runtime exceptions', report.errors.length === 0);
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.message; report.stack = error.stack; process.exitCode = 1;
  if (page) await screenshot(page, 'failure').catch(() => {});
} finally {
  if (createdBooking?.id) {
    try {
      assert.equal((await api(`/api/reservations/${createdBooking.id}/cancel`, { method: 'PATCH' })).status, 200);
      report.cleanup.push({ reservationId: createdBooking.id, cancelled: true });
    } catch (error) { report.cleanup.push({ reservationId: createdBooking.id, error: error.message }); report.passed = false; process.exitCode = 1; }
  }
  await browser.close();
  if (baseline) {
    try {
      const current = await plan();
      const restorePlan = { ...baseline, revision: current.revision };
      if (addedTableHasHistory) {
        const rejected = await api('/api/floor-plan', { method: 'PUT', body: restorePlan });
        assert.equal(rejected.status, 400, 'Booked tables retain their history even after cancellation');
        assert.match(JSON.stringify(rejected.data), /reservation history/i);
        restorePlan.zones = [...baseline.zones, { ...current.zones.find(zone => zone.id === newZone.id), isActive: false }];
        restorePlan.tables = [...baseline.tables, { ...current.tables.find(table => table.id === tableId), isActive: false }];
      }
      const restored = await api('/api/floor-plan', { method: 'PUT', body: restorePlan });
      assert.equal(restored.status, 200, 'Restore original furniture and deactivate test history');
      const after = await plan();
      assert.deepEqual({ ...after, revision: current.revision }, restorePlan);
      assert.deepEqual(after.tables.filter(table => table.id !== tableId), baseline.tables);
      assert.deepEqual(await plan('casa-di-fratelli'), casaBefore);
      const bookings = (await api('/api/reservations')).data;
      for (const original of baselineBookings) assert.deepEqual(bookings.find(item => item.id === original.id), original);
      report.cleanup.push({ originalFurnitureRestored: true, testHistoryDeactivated: addedTableHasHistory, originalBookingsPreserved: baselineBookings.length, casaPlanUnchanged: true });
    } catch (error) { report.cleanup.push({ fullPlanRestored: false, error: error.message }); report.passed = false; process.exitCode = 1; }
  }
  report.fixture = { originalTablesPreserved: baseline?.tables.length, addedHallId: newZone?.id, addedTableId: tableId, testHistoryRetainedInactive: addedTableHasHistory };
  await fs.writeFile(path.join(outputRoot, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure, outputRoot }));
}
