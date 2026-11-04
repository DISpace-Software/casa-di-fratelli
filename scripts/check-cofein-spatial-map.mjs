// Real local API + simulated DOM checks. This is not browser/screenshot evidence.
// node scripts/check-cofein-spatial-map.mjs <happy-dom module> <esbuild module> <private fixture state> <report> [baseline checkout]
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [happyPath, esbuildPath, statePath, reportPath, baselinePath] = process.argv.slice(2);
assert.ok(reportPath, 'Expected four CLI arguments');
const { Window } = await import(pathToFileURL(path.resolve(happyPath)).href);
const { build } = await import(pathToFileURL(path.resolve(esbuildPath)).href);
const state = JSON.parse(await readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(state.apiUrl).hostname));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(os.tmpdir(), 'cofein-spatial-check-'));
const nativeFetch = globalThis.fetch;
const originalError = console.error;
const checks = [];
const check = (name, details = {}) => checks.push({ name, passed: true, ...details });
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
let cleanupBookingId = null;
let originalPlan;
let planDirty = false;

async function api(endpoint, { tenant = 'cofein', method = 'GET', body, expected = 200, authenticated = false } = {}) {
  const headers = { 'X-Tenant-Id': tenant, Origin: state.origin, 'Content-Type': 'application/json' };
  if (authenticated) headers['X-Admin-Token'] = state.tenants[tenant].auth.token;
  const response = await nativeFetch(state.apiUrl + endpoint, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, expected, `${method} ${endpoint}`);
  if (response.status === 204) return null;
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function savePlan(plan) {
  const current = await api('/api/floor-plan');
  return api('/api/floor-plan', { method: 'PUT', body: { ...plan, revision: current.revision }, authenticated: true });
}

async function compile(name, baseline = false) {
  const source = baseline ? path.resolve(baselinePath || path.join(repo, '..', 'shared-restaurant-admin-20261104')) : repo;
  const extra = baseline ? '' : `export {default as CofeinBooking} from './src/cofein/CofeinBooking.jsx';
    export {default as CofeinMapExplorer} from './src/components/floorplan/CofeinMapExplorer.jsx';
    export * as geometry from './src/domain/floorPlans/cofeinGeometry.js';`;
  const outfile = path.join(temp, name + '.mjs');
  await build({ stdin: { contents: `export {default as AdminPage} from './src/pages/AdminPage.jsx';
    export {default as TenantBrandingProvider} from './src/context/TenantBrandingProvider.jsx';
    export {default as SeasonalZonesProvider} from './src/context/SeasonalZonesProvider.jsx';
    export {act, StrictMode, createElement} from 'react'; export {createRoot} from 'react-dom/client'; ${extra}`,
    resolveDir: path.join(source, 'frontend'), sourcefile: 'spatial-check-entry.jsx', loader: 'jsx' },
    nodePaths: [path.join(repo, 'frontend/node_modules')], bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile,
    loader: { '.css': 'empty' }, logLevel: 'silent', define: { 'import.meta.env': JSON.stringify({
      VITE_SHARED_ADMIN: 'true', VITE_API_BASE_URL: state.apiUrl,
      VITE_COFEIN_BOOKINGS_ENABLED: 'true', VITE_COFEIN_API_BASE_URL: state.apiUrl,
    }) },
  });
  return outfile;
}

async function session(bundle, tenant = 'cofein', intercept = () => null) {
  const window = new Window({ url: `${state.origin}/r/${tenant}/admin` });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'SVGElement', 'Node', 'Element', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'ResizeObserver']) {
    Object.defineProperty(globalThis, key, { value: key === 'window' ? window : key === 'document' ? window.document : window[key], configurable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  let pending = 0;
  const errors = [];
  const requests = [];
  console.error = (...args) => errors.push(args.map(String).join(' '));
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.origin, state.apiUrl, 'No external API during verification');
    const headers = new Headers(options.headers);
    assert.equal(headers.get('X-Tenant-Id'), tenant, 'Tenant must be explicit');
    assert.equal(options.method || 'GET', 'GET', 'DOM checks do not submit writes');
    headers.set('Origin', state.origin);
    requests.push(url.pathname);
    pending++;
    try { return await intercept(url, options) || await nativeFetch(url, { ...options, headers }); }
    finally { pending--; }
  };
  class Notification { static permission = 'default'; static async requestPermission() { throw new Error('Unexpected notification permission request'); } }
  Object.defineProperty(window, 'Notification', { value: Notification, configurable: true });
  Object.defineProperty(globalThis, 'Notification', { value: Notification, configurable: true });
  const module = await import(`${pathToFileURL(bundle).href}?run=${Date.now()}-${Math.random()}`);
  const container = window.document.createElement('div');
  window.document.body.append(container);
  const root = module.createRoot(container);
  const settle = async () => {
    for (let i = 0; i < 160; i++) {
      await module.act(async () => { await tick(15); });
      if (!pending) { await module.act(async () => { await tick(25); }); if (!pending) return; }
    }
    throw new Error('DOM did not settle');
  };
  const render = async element => { await module.act(async () => { root.render(element); await tick(0); }); await settle(); };
  const click = async element => { assert.ok(element, 'Required button exists'); await module.act(async () => { element.click(); await tick(0); }); await settle(); };
  const button = label => [...window.document.querySelectorAll('button')].find(item => item.textContent.trim() === label || [...item.querySelectorAll('span')].some(span => span.textContent.trim() === label));
  const change = async (element, value) => {
    assert.ok(element, 'Required form control exists');
    await module.act(async () => {
      const prototype = element instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
      element.dispatchEvent(new window.Event('change', { bubbles: true }));
      await tick(0);
    });
    await settle();
  };
  const tableButtons = () => [...window.document.querySelectorAll('button.cofein-map-table-button')];
  const tableId = button => button.dataset.tableId || button.getAttribute('aria-label')?.match(/(?:Маса|Table|Стол)\s+([^,\s]+)/)?.[1];
  const byTable = id => tableButtons().find(button => tableId(button) === id);
  return { ...module, window, container, errors, requests, render, settle, click, button, change, tableButtons, tableId, byTable,
    async close() { await module.act(async () => root.unmount()); window.happyDOM.abort(); globalThis.fetch = nativeFetch; console.error = originalError; },
  };
}

async function publicScenario(bundle, { expectedIds, search, occupiedId = null, setupError = false, closed = false, changedTable = null }) {
  let failAvailability = false;
  const s = await session(bundle, 'cofein', url => {
    if (setupError && url.pathname.endsWith('/branding')) return new Response('{}', { status: 503 });
    if (failAvailability && url.pathname.endsWith('/reservations/blocked-slots')) return new Response('{}', { status: 503 });
    if (closed && url.pathname.endsWith('/closure')) return json({ enabled: true, startDate: search.date, endDate: search.date });
    return null;
  });
  try {
    await s.render(s.createElement(s.StrictMode, null, s.createElement(s.CofeinBooking)));
    if (setupError) {
      assert.equal(s.tableButtons().length, 0);
      assert.match(s.container.textContent, /не можем да проверим|опитайте отново/i);
      check('Public setup API failure shows an error without fabricated tables or availability');
      return;
    }
    assert.deepEqual(s.tableButtons().map(s.tableId).sort(), [...expectedIds].sort());
    assert.ok(s.tableButtons().every(item => item.disabled), 'No booking selection before time availability');
    check('Public setup renders every active API table once and prevents selection before fresh availability', { tables: expectedIds.length });
    if (changedTable) {
      assert.match(s.byTable(changedTable.id).getAttribute('aria-label'), new RegExp(`${changedTable.seats} места`));
      const point = s.geometry.projectCofeinTable(changedTable);
      const style = s.byTable(changedTable.id).style;
      assert.ok(Math.abs(parseFloat(style.left) - point.x) < 0.01 && Math.abs(parseFloat(style.top) - point.y) < 0.01, 'Map uses current saved coordinates');
      check('Public architectural map reflects edited API capacity/coordinates and a new table ID');
    }
    await s.change(s.container.querySelector('input[type="date"]'), search.date);
    await s.change(s.container.querySelector('select[id$="-time"]'), search.time);
    assert.equal(s.container.querySelector('select[id$="-time"]').value, search.time);
    if (closed) {
      assert.equal(s.tableButtons().length, expectedIds.length);
      assert.ok(s.tableButtons().every(item => item.disabled));
      assert.match(s.container.textContent, /не приема резервации/);
      check('A closed restaurant retains its architectural map but disables every table');
      return;
    }
    assert.ok(s.tableButtons().some(item => !item.disabled), 'Fresh availability enables suitable tables');
    if (occupiedId) {
      assert.equal(s.byTable(occupiedId).disabled, true);
      assert.match(s.byTable(occupiedId).getAttribute('aria-label'), /заета|недостъпна/i);
      check('A real occupied API slot is disabled on the public map', { table: occupiedId });
    }
    const available = s.tableButtons().find(item => !item.disabled);
    const selectedId = s.tableId(available);
    await s.click(available);
    assert.equal(s.byTable(selectedId).getAttribute('aria-pressed'), 'true');
    await s.click([...s.container.querySelectorAll('button')].find(item => item.textContent.includes('Продължи')));
    assert.match(s.container.querySelector('.cofein-booking-selection')?.textContent || '', new RegExp(selectedId));
    check('A real table selection carries its ID into the existing reservation contact form');
    await s.click(s.button('Назад към масите'));
    failAvailability = true;
    await s.click([...s.container.querySelectorAll('button')].find(item => item.textContent.includes('Обнови наличността')));
    assert.ok(s.tableButtons().every(item => item.disabled));
    const proceed = [...s.container.querySelectorAll('button')].find(item => item.textContent.includes('Продължи'));
    assert.ok(!proceed || proceed.disabled);
    check('Availability failure clears actionable selection and cannot continue with stale data');
    assert.deepEqual(s.errors, [], 'No React/runtime errors');
  } finally { await s.close(); }
}

async function adminScenario(bundle, tenant, baseline = false) {
  const s = await session(bundle, tenant);
  try {
    const { auth } = state.tenants[tenant];
    await s.render(s.createElement(s.StrictMode, null, s.createElement(s.TenantBrandingProvider, null,
      s.createElement(s.SeasonalZonesProvider, null, s.createElement(s.AdminPage, {
        adminToken: auth.token, adminUser: auth.user, onAdminLogout() {}, onMenuChanged() {}, onEventsChanged() {}, theme: 'dark', onToggleTheme() {},
      })))));
    const shell = {
      header: ['.admin-page', '.admin-hero-panel', '.admin-hero-title', '.admin-header-controls'].map(selector => s.container.querySelector(selector)?.className),
      controls: [...s.container.querySelectorAll('.admin-hero-panel button')].map(item => ({ className: item.className, text: item.textContent.trim(), label: item.getAttribute('aria-label') })),
      nav: [...s.container.querySelectorAll('section button')].filter(item => item.querySelector('span.block.truncate')).map(item => ({ className: item.className, text: item.textContent.trim() })),
    };
    if (tenant === 'cofein') {
      await s.click(s.button('Карта'));
      assert.equal(s.tableButtons().length, 30);
      await s.click(s.byTable('T13'));
      const capacity = s.container.querySelector('input[type="number"][min="1"][max="500"]');
      assert.equal(capacity?.value, '4');
      await s.change(capacity, '6');
      assert.match(s.byTable('T13').getAttribute('aria-label'), /6 места/);
      check('Existing admin editor shows the architecture and reflects an unsaved capacity edit immediately');
      await s.click(s.button('← Назад'));
    }
    await s.click(s.button('Карта на резервациите'));
    if (tenant === 'cofein') {
      assert.equal(s.tableButtons().length, 30);
      assert.equal(new Set(s.tableButtons().map(s.tableId)).size, 30);
      assert.match(s.byTable('T13').getAttribute('aria-label'), /4 /);
      check('An unsaved editor capacity change never leaks into the operational map');
      assert.ok(s.window.document.querySelector('.cofein-architecture') || s.window.document.querySelector('svg[data-cofein-architecture]') || s.window.document.querySelector('.cofein-map-architecture'));
      await s.click(s.byTable('T13'));
      const dialog = s.window.document.querySelector('[role="dialog"]');
      assert.ok(dialog);
      assert.match(dialog.getAttribute('aria-label'), /T13/);
      assert.match(dialog.textContent, /T13/);
      check('Shared admin renders all 30 Cofein tables and opens the existing operational table dialog');
      await s.click(s.window.document.querySelector('button[aria-label="Close map window"]'));
      assert.equal(s.window.document.querySelector('[role="dialog"]'), null);
      check('Cofein table dialog closes using the shared admin overlay control');
    } else {
      assert.equal(s.tableButtons().length, 0, 'Casa does not acquire Cofein furniture rendering');
      assert.equal(s.container.querySelectorAll('.admin-map-table-node').length, 41);
      if (!baseline) check('Casa retains its 41 legacy operational map buttons and no Cofein architecture');
    }
    assert.deepEqual(s.errors, [], 'No React/runtime errors in admin');
    return shell;
  } finally { await s.close(); }
}

async function editorBoundary(bundle) {
  const s = await session(bundle);
  let moved;
  const table = { id: 'QA99', area: 'exterior', x: 35, y: 40, seats: 4, special: false, wide: false, isActive: true };
  try {
    await s.render(s.createElement(s.CofeinMapExplorer, {
      tables: [table], states: { QA99: { status: 'available', selectable: true } },
      onTableMove: (item, point) => { moved = { ...item, ...point }; },
    }));
    const viewport = s.container.querySelector('.cofein-map-viewport');
    await s.act(async () => {
      s.byTable('QA99').dispatchEvent(new s.window.PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 }));
      viewport.dispatchEvent(new s.window.PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10000, clientY: 10000 }));
      viewport.dispatchEvent(new s.window.PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10000, clientY: 10000 }));
      await tick(0);
    });
    assert.ok(moved, 'Editor gesture emits a moved table');
    assert.equal(moved.x, 95); assert.equal(moved.y, 95);
    check('Dragging an editor table beyond the canvas clamps to API bounds 5..95');
    const boundary = moved;
    await s.render(s.createElement(s.CofeinMapExplorer, {
      tables: [boundary], states: { QA99: { status: 'available', selectable: true } },
      onTableMove: (item, point) => { moved = { ...item, ...point }; },
    }));
    await s.act(async () => { s.byTable('QA99').dispatchEvent(new s.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await tick(0); });
    assert.equal(moved.x, 95);
    check('Keyboard table movement cannot escape the same API bounds');
    assert.deepEqual(s.errors, []);
    return boundary;
  } finally { await s.close(); }
}

try {
  originalPlan = await api('/api/floor-plan');
  const originalCasa = await api('/api/floor-plan', { tenant: 'casa-di-fratelli' });
  assert.equal(originalPlan.tables.length, 30);
  const bundle = await compile('current');
  const baselineBundle = await compile('baseline', true);
  const { createCofeinBookingApi } = await import(pathToFileURL(path.join(repo, 'frontend/src/cofein/bookingApi.js')).href);
  const client = createCofeinBookingApi({ VITE_COFEIN_BOOKINGS_ENABLED: 'true', VITE_COFEIN_API_BASE_URL: state.apiUrl }, nativeFetch);
  const date = new Date(); date.setUTCDate(date.getUTCDate() + 2);
  const search = { date: date.toISOString().slice(0, 10), time: '12:00', guests: 4 };
  const setup = await client.loadSetup();
  assert.equal(setup.plan.tables.length, 30);
  const availability = await client.loadAvailability(search);
  assert.ok(availability.options.some(option => option.tableIds[0] === 'T13'));
  check('Existing public client loads real Cofein floor-plan and availability from isolated API');
  const boundaryTable = await editorBoundary(bundle);

  const changed = structuredClone(originalPlan);
  const moved = changed.tables.find(table => table.id === 'T13');
  moved.x -= 1; moved.y -= 1; moved.seats = 6;
  changed.tables.find(table => table.id === 'F04').isActive = false;
  changed.tables.push(boundaryTable);
  planDirty = true;
  const saved = await savePlan(changed);
  assert.equal(saved.tables.find(table => table.id === 'QA99').x, 95);
  assert.equal(saved.tables.find(table => table.id === 'QA99').y, 95);
  check('A boundary drag result is accepted and round-trips through the real floor-plan API');
  saved.tables.find(table => table.id === 'QA99').id = 'QA98';
  const renamed = await savePlan(saved);
  assert.equal(renamed.tables.find(table => table.id === 'T13').seats, 6);
  const liveEdited = await client.loadAvailability({ ...search, guests: 6 });
  assert.ok(liveEdited.options.some(option => option.tableIds[0] === 'T13'));
  assert.equal(liveEdited.tables.some(table => table.id === 'F04'), false);
  assert.equal(liveEdited.tables.some(table => table.id === 'QA98'), true);
  check('Capacity, position, inactive and added/renamed tables survive real API round trips and affect booking eligibility');
  await publicScenario(bundle, { expectedIds: renamed.tables.filter(table => table.isActive).map(table => table.id), search, changedTable: moved });
  await savePlan(originalPlan); planDirty = false;

  const payload = { guestName: 'Локален тест на картата', phone: '+359000000002', email: 'map-check@example.test', guestCount: 4, area: 'exterior', reservedDate: search.date, reservedTime: search.time, privacyConsent: true, marketingConsent: false, tableIds: ['T13'] };
  const booking = await client.create(payload);
  cleanupBookingId = booking.id;
  assert.equal(booking.status, 'Approved');
  assert.equal((await client.loadAvailability(search)).options.some(option => option.tableIds.includes('T13')), false);
  await api('/api/v1/restaurants/cofein/reservations', { method: 'POST', body: payload, expected: 409 });
  check('Real local reservation makes its table unavailable and a duplicate booking is rejected');
  await publicScenario(bundle, { expectedIds: originalPlan.tables.map(table => table.id), search, occupiedId: 'T13' });
  await api(`/api/reservations/${cleanupBookingId}/cancel`, { method: 'PATCH', authenticated: true }); cleanupBookingId = null;
  assert.ok((await client.loadAvailability(search)).options.some(option => option.tableIds[0] === 'T13'));
  check('Admin cancellation frees the real table for public availability again');
  await publicScenario(bundle, { expectedIds: originalPlan.tables.map(table => table.id), search, closed: true });
  await publicScenario(bundle, { expectedIds: [], search, setupError: true });

  const baselineShell = await adminScenario(baselineBundle, 'casa-di-fratelli', true);
  const casaShell = await adminScenario(bundle, 'casa-di-fratelli');
  assert.deepEqual(casaShell, baselineShell);
  check('Existing Casa dashboard header, controls and navigation classes/text match the pre-change component');
  const cofeinShell = await adminScenario(bundle, 'cofein');
  assert.deepEqual(cofeinShell, casaShell);
  check('Cofein continues using the same shared administration shell as Casa');
  assert.deepEqual(await api('/api/floor-plan', { tenant: 'casa-di-fratelli' }), originalCasa);
  check('Cofein test writes leave the Casa floor plan unchanged');
} catch (error) {
  checks.push({ name: 'Verification failure', passed: false, error: error.message, causes: error.errors?.map(cause => ({ message: cause.message, stack: cause.stack?.split('\n').slice(0, 3).join('\n') })), stack: error.stack?.split('\n').slice(0, 4).join('\n') });
  process.exitCode = 1;
} finally {
  globalThis.fetch = nativeFetch; console.error = originalError;
  try {
    if (cleanupBookingId) await api(`/api/reservations/${cleanupBookingId}/cancel`, { method: 'PATCH', authenticated: true });
    if (planDirty && originalPlan) await savePlan(originalPlan);
  } catch (error) { checks.push({ name: 'Fixture cleanup', passed: false, error: error.message }); process.exitCode = 1; }
  const report = { simulatedDom: true, visualBrowserTest: false, localApiOnly: true, disposableDatabaseWrites: true, passed: checks.every(item => item.passed), checks };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, report: reportPath, ...(report.passed ? {} : { failure: checks.find(item => !item.passed) }) }));
  await rm(temp, { recursive: true, force: true });
}
process.exit(process.exitCode || 0);
