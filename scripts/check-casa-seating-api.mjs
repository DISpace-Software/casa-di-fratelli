// Real HTTP/DB regression checks. Accepts ONLY a disposable local fixture.
// node scripts/check-admin-parity-api.mjs <private-state.json> <report.json>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const [statePath, reportPath] = process.argv.slice(2);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
assert.equal(new URL(state.apiUrl).hostname, '127.0.0.1');
const CASA = 'casa-di-fratelli', COFEIN = 'cofein';
const checks = [], tag = randomUUID().slice(0, 8);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
async function call(tenant, path, method = 'GET', body, token = state.tenants[tenant].auth.token, expected = 200, extra = {}) {
  const response = await fetch(state.apiUrl + path, { method, headers: {
    'Content-Type': 'application/json', 'X-Tenant-Id': tenant, Origin: state.origin,
    ...(token ? { 'X-Admin-Token': token } : {}), ...extra,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw = await response.text(); let data; try { data = JSON.parse(raw); } catch { data = raw; }
  assert.equal(response.status, expected, `${tenant} ${method} ${path}: ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); }
const req = (t, p, method, body, expected) => call(t, p, method, body, undefined, expected);
const booking = (ids, area = 'indoor') => ({ guestName: `QA parity ${tag}`, phone: '+359000000029', guestCount: 8, area, tableIds: ids, reservedDate: tomorrow, reservedTime: '12:00', createdByAdmin: true, privacyConsent: true });
try {
  // The exact saved Casa fixture includes Latin 24a and Cyrillic 29а.
  await check('Casa saved table identifiers and coordinates, including Cyrillic 29а, load without renaming', async () => {
    const plan = await req(CASA, '/api/floor-plan');
    const tables = JSON.parse(await fs.readFile(new URL('../backend/CasaDiFratelli.ReservationChecks/Fixtures/casa-layout-2026-11-03.json', import.meta.url), 'utf8'));
    const ids = new Set(tables.map(t => t.id));
    const saved = await req(CASA, '/api/floor-plan', 'PUT', { ...plan, tables, combinations: plan.combinations.filter(c => c.every(id => ids.has(id))) });
    assert.ok(saved.tables.some(t => t.id === '29а'));
    assert.ok(saved.tables.some(t => t.id === '24a'));
    assert.equal(saved.staffCombinationMode, 'same-zone');
  });
  await check('Casa staff can move 29 → 29+29а, edit, approve, arrive, release, cancel and restore; conflicts remain enforced', async () => {
    const r = await req(CASA, '/api/reservations', 'POST', booking(['29']));
    await req(CASA, `/api/reservations/${r.id}/tables`, 'PATCH', { area: 'indoor', tableIds: ['29', '29а'], guestCount: 8 });
    let row = (await req(CASA, '/api/reservations')).find(x => x.id === r.id);
    assert.deepEqual(new Set(row.tableIds), new Set(['29', '29а']));
    await req(CASA, '/api/reservations', 'POST', booking(['29а']), 409);
    await req(CASA, `/api/reservations/${r.id}`, 'PATCH', { ...booking(['29', '29а']), guestCount: 9, internalNote: 'Local parity check' });
    await req(CASA, `/api/reservations/${r.id}/approve`, 'PATCH');
    await req(CASA, `/api/reservations/${r.id}/arrive`, 'PATCH');
    await req(CASA, `/api/reservations/${r.id}/release`, 'PATCH');
    await req(CASA, `/api/reservations/${r.id}/cancel`, 'PATCH');
    await req(CASA, `/api/maintenance/reservations/${r.id}/restore`, 'POST');
    row = (await req(CASA, '/api/reservations')).find(x => x.id === r.id);
    assert.equal(row.status, 'Approved'); assert.equal(row.guestCount, 9);
    await req(CASA, `/api/reservations/${r.id}/cancel`, 'PATCH');
  });
  await check('Public Casa cannot inherit staff combination/capacity exceptions; Cofein retains configured-only combinations', async () => {
    const publicBody = { ...booking(['29', '29а']), guestCount: 4, email: 'qa-local@example.test', createdByAdmin: false };
    await call(CASA, '/api/reservations', 'POST', publicBody, null, 400);
    await call(CASA, '/api/reservations', 'POST', booking(['29', '29а']), null, 401);
    assert.equal((await req(COFEIN, '/api/floor-plan')).staffCombinationMode, 'configured');
    await req(COFEIN, '/api/reservations', 'POST', { ...booking(['T01', 'T02'], 'exterior'), guestCount: 4 }, 400);
    await req(CASA, '/api/reservations', 'POST', booking(['29', '42']), 400);
  });
} catch (error) { checks.push({ name: 'Failed scenario', passed: false, error: error.message, stack: error.stack?.split('\n').slice(0, 4).join('\n') }); process.exitCode = 1; }
const report = { localOnly: true, realHttpAndDatabases: true, passed: checks.every(c => c.passed), checks };
await fs.mkdir(new URL('.', `file://${reportPath}`).pathname, { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
