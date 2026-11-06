// node scripts/check-reservation-trash-browser.mjs <local-state.json> <output-dir> <playwright-index.mjs> <chromium>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [statePath, output, playwrightPath, chromiumPath] = process.argv.slice(2);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const url of [state.apiUrl, state.origin]) assert.equal(new URL(url).hostname, '127.0.0.1');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const checks = [], errors = [], created = [];
page.on('pageerror', e => errors.push(e.message));
async function api(tenant, path, method = 'GET', body) {
  const response = await fetch(state.apiUrl + path, { method, headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenant, 'X-Admin-Token': state.tenants[tenant].auth.token }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await response.clone().text()}`);
  return response.status === 204 ? null : response.json();
}
const casa = 'casa-di-fratelli', cofein = 'cofein';
async function booking(tenant, table, cancelled) {
  const r = await api(tenant, '/api/reservations', 'POST', { guestName: 'QA local bulk trash', phone: '+359000000093', guestCount: 6, tableIds: [table], area: tenant === casa ? 'indoor' : 'exterior', reservedDate: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10), reservedTime: '19:00', createdByAdmin: true, privacyConsent: true });
  created.push([tenant, r.id]);
  if (cancelled) await api(tenant, `/api/reservations/${r.id}/cancel`, 'PATCH');
  return r.id;
}
try {
  await fs.mkdir(output, { recursive: true });
  const conflict = await booking(casa, '23', true);
  const free = await booking(casa, '24', true);
  const active = await booking(casa, '23', false);
  await booking(cofein, 'T01', true);
  const otherTrash = await api(cofein, '/api/maintenance/reservations/deleted');
  await page.goto(`${state.origin}/r/${casa}/admin`);
  await page.locator('input[type=email]').fill(state.tenants[casa].email);
  await page.locator('input[type=password]').fill(state.tenants[casa].password);
  await page.locator('button[type=submit]').click();
  await page.getByText('Restaurant CRM', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Кошче с резервации', exact: true }).click();
  const restore = page.getByRole('button', { name: 'Възстанови всички', exact: true });
  const empty = page.getByRole('button', { name: 'Изчисти всички', exact: true });
  await restore.waitFor();
  await page.screenshot({ path: `${output}/01-mobile-trash-actions.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  page.once('dialog', d => d.dismiss());
  await empty.click();
  assert.equal((await api(casa, '/api/maintenance/reservations/deleted')).length, 2);
  checks.push({ name: 'Phone basket shows both bulk actions, fits viewport and cancelling deletion preserves trash', passed: true });
  page.once('dialog', d => d.accept());
  const restoring = page.waitForResponse(r => r.url().endsWith('/api/maintenance/reservations/deleted/restore') && r.request().method() === 'POST');
  await restore.click();
  const result = await restoring;
  assert.equal(result.status(), 200);
  const summary = await result.json(); assert.equal(summary.succeeded, 1); assert.equal(summary.failed, 1);
  await page.getByText('Възстановени: 1. Останали необработени: 1.', { exact: true }).last().waitFor();
  assert.deepEqual((await api(casa, '/api/maintenance/reservations/deleted')).map(r => r.id), [conflict]);
  assert.equal((await api(casa, '/api/reservations')).find(r => r.id === free).status, 'Approved');
  await page.screenshot({ path: `${output}/02-partial-restore-conflict.png`, fullPage: true });
  checks.push({ name: 'Restore all persists available booking, leaves conflict in trash and reports exact counts', passed: true });
  await empty.waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Изчисти всички' && !b.disabled));
  page.once('dialog', d => d.accept());
  const deleting = page.waitForResponse(r => r.url().endsWith('/api/maintenance/reservations/deleted/permanent') && r.request().method() === 'DELETE');
  await empty.click(); assert.equal((await deleting).status(), 200);
  await page.getByText('Няма отменени или изтрити резервации.', { exact: true }).waitFor();
  assert.equal((await api(casa, '/api/maintenance/reservations/deleted')).length, 0);
  assert.ok((await api(casa, '/api/reservations')).some(r => r.id === active));
  assert.deepEqual(await api(cofein, '/api/maintenance/reservations/deleted'), otherTrash);
  assert.equal(await restore.isDisabled(), true); assert.equal(await empty.isDisabled(), true);
  await page.reload(); await page.getByText('Restaurant CRM', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Кошче с резервации', exact: true }).click();
  await page.getByText('Няма отменени или изтрити резервации.', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/03-empty-trash-after-reload.png`, fullPage: true });
  checks.push({ name: 'Empty trash persists after reload, disables empty actions, preserves active bookings and Cofein trash', passed: true });
  assert.deepEqual(errors, []);
} catch (error) {
  checks.push({ name: 'Failure', passed: false, error: error.message }); process.exitCode = 1;
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
} finally {
  for (const [tenant, id] of created) {
    const rows = await api(tenant, '/api/reservations');
    const r = rows.find(r => r.id === id);
    if (r && r.status !== 'Cancelled') await api(tenant, `/api/reservations/${id}/cancel`, 'PATCH');
  }
  await browser.close();
  const report = { localOnly: true, realBrowser: true, passed: checks.every(c => c.passed), checks, errors };
  await fs.writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
