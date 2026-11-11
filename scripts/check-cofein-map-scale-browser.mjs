// Bounded local fixture scale check. Preserves all existing IDs/history and restores
// the previous document using a fresh revision. No production URLs are accepted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [statePath, outputRoot, playwrightPath, chromiumPath] = process.argv.slice(2);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const value of [state.apiUrl, state.origin]) assert.equal(new URL(value).hostname, '127.0.0.1');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const report = { localOnly: true, realBrowser: true, capacity: { halls: 50, tables: 500 }, checks: [], timingsMs: {}, errors: [] };
const check = (name, condition = true) => { assert(condition, name); report.checks.push({ name, passed: true }); console.log(`PASS ${report.checks.length}: ${name}`); };
let baseline, mutated = false, browser;
await fs.mkdir(outputRoot, { recursive: true });
async function api(method = 'GET', body) {
  const response = await fetch(state.apiUrl + '/api/floor-plan', { method, headers: {
    'Content-Type': 'application/json', 'X-Tenant-Id': 'cofein', 'X-Admin-Token': state.tenants.cofein.auth.token,
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, 200, `Floor-plan ${method} status`); return response.json();
}
async function rendered(page, count) {
  await page.waitForFunction(count => document.querySelectorAll('.cofein-map-table-button').length === count, count);
}

try {
  baseline = await api(); const candidate = structuredClone(baseline);
  const newZones = [];
  for (let i = candidate.zones.length; i < 50; i++) {
    const zone = { id: `scale-hall-${i}`, name: `Тестова зала ${i + 1}`, names: { bg: `Тестова зала ${i + 1}` }, presentation: 'plain', isActive: true };
    newZones.push(zone); candidate.zones.push(zone);
  }
  const extraCount = 500 - candidate.tables.length;
  for (let i = 0; i < extraCount; i++) {
    const slot = Math.floor(i / newZones.length);
    candidate.tables.push({ id: `SCALE-${i + 1}`, area: newZones[i % newZones.length].id, x: 15 + slot % 4 * 22, y: 20 + Math.floor(slot / 4) * 25, seats: 4, special: false, wide: false, isActive: true });
  }
  const saveStart = Date.now(); const saved = await api('PUT', candidate); mutated = true;
  report.timingsMs.apiSave = Date.now() - saveStart;
  check('Real tenant API accepts a valid document containing 50 halls and 500 tables', saved.zones.length === 50 && saved.tables.length === 500);
  const targetHall = newZones.at(-1); const targetTable = candidate.tables.find(table => table.area === targetHall.id);
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' });
  ctx.on('page', page => { page.setDefaultTimeout(30000); page.on('pageerror', error => report.errors.push(error.message)); });
  let started = Date.now(); const publicPage = await ctx.newPage();
  await publicPage.goto(state.origin + '/cofein-preview.html#booking'); await rendered(publicPage, 500);
  report.timingsMs.publicFirstRender = Date.now() - started;
  check('Public map renders all 500 API tables without discarding added halls');
  const date = new Date((await publicPage.locator('input[type=date]').inputValue()) + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + 4);
  await publicPage.locator('input[type=date]').fill(date.toISOString().slice(0, 10));
  started = Date.now(); await publicPage.locator('.cofein-booking-search select').first().selectOption('19:00');
  await publicPage.locator(`.cofein-map-table-button[data-table-id="${targetTable.id}"]:enabled`).waitFor();
  report.timingsMs.publicAvailability = Date.now() - started;
  await publicPage.locator('.cofein-map-views').getByRole('button', { name: targetHall.name, exact: true }).click();
  await publicPage.locator(`.cofein-map-table-button[data-table-id="${targetTable.id}"]`).click();
  check('A table in the fiftieth hall remains selectable with real API availability', await publicPage.locator('.cofein-booking-choice h3').innerText() === targetTable.id);
  check('Desktop public page has no horizontal overflow at 50 halls', await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth));
  await publicPage.locator('.cofein-map-surface').scrollIntoViewIfNeeded();
  await publicPage.screenshot({ path: path.join(outputRoot, '01-public-50-halls.png') });

  const admin = await ctx.newPage(); await admin.goto(state.origin + '/r/cofein/admin');
  await admin.locator('input[type=email]').fill(state.tenants.cofein.email); await admin.locator('input[type=password]').fill(state.tenants.cofein.password);
  await admin.locator('button[type=submit]').click(); await admin.getByText('Restaurant CRM', { exact: true }).waitFor();
  started = Date.now(); await admin.getByRole('button', { name: /^Карта на резервациите/ }).click(); await rendered(admin, 500);
  report.timingsMs.adminOperationalRender = Date.now() - started;
  check('Administrator operational map renders all 500 tables through the same Cofein presentation');
  await admin.getByRole('button', { name: new RegExp(`^${targetHall.name}`) }).first().click();
  const targetAdmin = admin.getByRole('button', { name: `Маса ${targetTable.id}, 4 места`, exact: true });
  await targetAdmin.click();
  check('Administrator can open the table action dialog in the fiftieth hall', await admin.getByRole('button', { name: 'Създай резервация', exact: true }).isVisible());
  await admin.screenshot({ path: path.join(outputRoot, '02-admin-50-halls.png') });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'bg-BG', timezoneId: 'Europe/Sofia' });
  const phone = await mobile.newPage(); phone.on('pageerror', error => report.errors.push(error.message));
  started = Date.now(); await phone.goto(state.origin + '/cofein-preview.html#booking'); await rendered(phone, 500);
  report.timingsMs.phoneFirstRender = Date.now() - started;
  await phone.locator('.cofein-map-views').getByRole('button', { name: targetHall.name, exact: true }).tap();
  check('Phone navigation reaches the fiftieth hall without horizontal page overflow', await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth));
  await phone.locator('.cofein-map-surface').scrollIntoViewIfNeeded(); await phone.screenshot({ path: path.join(outputRoot, '03-phone-50-halls.png') });
  check('No browser runtime exceptions during 50-hall / 500-table scenario', report.errors.length === 0);
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = error.message; report.stack = error.stack; process.exitCode = 1;
} finally {
  if (mutated) {
    try {
      const current = await api(); const restored = await api('PUT', { ...baseline, revision: current.revision });
      assert.deepEqual(restored.zones, baseline.zones); assert.deepEqual(restored.tables, baseline.tables);
      report.restored = true;
    } catch (error) { report.restored = false; report.restoreError = error.message; report.passed = false; process.exitCode = 1; }
  }
  await browser?.close();
  await fs.writeFile(path.join(outputRoot, 'scale-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure, restored: report.restored, timingsMs: report.timingsMs, outputRoot }));
}
