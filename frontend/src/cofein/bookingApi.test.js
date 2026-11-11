import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedTableIds, bookingTimes, createCofeinBookingApi, floorMapDimensions, normalizeBookingPolicy, normalizeFloorPlan, restaurantClock, tableOptions, validateBookingResult } from './bookingApi.js';

const brand = { name: 'Cofein', timeZoneId: 'Europe/Sofia', walkInOpeningTime: '10:00', publicLatestReservationTime: '21:00', publicLeadMinutes: 15, publicMaxReservationDaysAhead: 10, phone: '' };
const policy = normalizeBookingPolicy(brand);
const plan = {
  schemaVersion: 1, revision: 'explicitly-saved-test-plan', publicMaxGuests: 8, publicMaxTables: 2,
  zones: [{ id: 'test', name: 'Test zone', presentation: 'plain', isActive: true }, { id: 'closed', name: 'Closed test zone', presentation: 'plain', isActive: true }],
  tables: [
    { id: 'A', area: 'test', seats: 4, x: 25, y: 25, isActive: true },
    { id: 'B', area: 'test', seats: 4, x: 75, y: 25, isActive: true },
    { id: 'C', area: 'closed', seats: 8, x: 50, y: 50, isActive: true },
  ], combinations: [['A', 'B']],
};
const tomorrow = restaurantClock(policy).today;
const next = new Date(`${tomorrow}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
const search = { date: next.toISOString().slice(0, 10), time: '12:00', guests: 2 };
const env = { VITE_COFEIN_BOOKINGS_ENABLED: 'true', VITE_COFEIN_API_BASE_URL: 'https://api.example.test' };
const success = (value) => ({ ok: true, status: 200, json: async () => value });
const responseFor = (url) => url.endsWith('/branding') ? brand : url.endsWith('/floor-plan') ? plan : url.endsWith('/zones') ? { closedAreas: [] } : url.endsWith('/closure') ? { enabled: false } : [];

test('disabled/missing/relative API configuration never makes a request or falls back to Casa', async () => {
  let calls = 0;
  for (const config of [{}, { ...env, VITE_COFEIN_BOOKINGS_ENABLED: 'false' }, { VITE_COFEIN_BOOKINGS_ENABLED: 'true' }, { ...env, VITE_COFEIN_API_BASE_URL: '/api' }, { ...env, VITE_COFEIN_API_BASE_URL: 'https://api.example.test/api' }]) {
    const api = createCofeinBookingApi(config, async () => { ++calls; });
    assert.equal(api.enabled, false);
    await assert.rejects(api.loadSetup(), { kind: 'configuration' });
  }
  assert.equal(calls, 0);
});

test('every read is v1 Cofein scoped, no-store, credential-free and cannot follow a redirect', async () => {
  const requests = [];
  const api = createCofeinBookingApi(env, async (url, options) => { requests.push({ url, options }); return success(responseFor(url)); });
  const data = await api.loadAvailability(search);
  assert.equal(data.options.length, 4);
  assert.equal(requests.length, 5);
  for (const { url, options } of requests) {
    assert.ok(url.startsWith('https://api.example.test/api/v1/restaurants/cofein/'));
    assert.equal(options.headers['X-Tenant-Id'], 'cofein');
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  }
});

test('rejects another restaurant, missing policy and malformed time zones without defaults', () => {
  for (const value of [{ ...brand, name: 'Casa di Fratelli' }, { name: 'Cofein' }, { ...brand, timeZoneId: 'Invalid/Zone' }, { ...brand, publicLeadMinutes: -1 }]) assert.throws(() => normalizeBookingPolicy(value));
});

test('requires an explicitly saved complete Cofein floor plan', () => {
  for (const value of [{ ...plan, revision: 'legacy-abc' }, { ...plan, tables: [], combinations: [] }, { ...plan, zones: [{ ...plan.zones[0], presentation: 'casa-indoor' }] }, { ...plan, combinations: [['A', 'X']] }, { ...plan, tables: [...plan.tables, plan.tables[0]] }]) assert.throws(() => normalizeFloorPlan(value));
  assert.equal(normalizeFloorPlan(plan), plan);
});

test('restaurant timezone, inclusive date window and exact lead boundary do not use browser timezone', () => {
  const now = new Date('2026-11-03T08:00:00Z');
  assert.deepEqual(restaurantClock(policy, now), { today: '2026-11-03', lastDate: '2026-11-13', minute: 600 });
  assert.equal(bookingTimes(policy, '2026-11-03', now)[0], '10:15');
  assert.equal(bookingTimes(policy, '2026-11-03', new Date('2026-11-03T08:00:01Z'))[0], '10:30');
  assert.equal(bookingTimes(policy, '2026-11-14', now).length, 0);
  assert.equal(bookingTimes(policy, '2026-02-30', now).length, 0);
  assert.equal(bookingTimes(policy, '2026-11-13', now).at(-1), '21:00');
});

test('180 minute conflicts match backend boundary and table IDs case-insensitively', () => {
  const slots = [{ reservedDate: search.date, reservedTime: '12:00', tableIds: ['A'] }];
  assert.ok(blockedTableIds(slots, search.date, '14:59').has('a'));
  assert.equal(blockedTableIds(slots, search.date, '15:00').size, 0);
  assert.equal(blockedTableIds(slots, '2026-01-01', '12:00').size, 0);
});

test('hall ranges are inclusive and wrap midnight; public holds occupy the entire date', () => {
  const hall = [{ reservedDate: search.date, reservedTime: '22:00 - 02:00', tableIds: ['A'], isHallBlock: true }];
  assert.ok(blockedTableIds(hall, search.date, '02:00').has('a'));
  assert.equal(blockedTableIds(hall, search.date, '02:01').size, 0);
  assert.ok(blockedTableIds([{ ...hall[0], isHallBlock: false, isPublicHold: true }], search.date, '12:00').has('a'));
});

test('malformed availability fails closed instead of becoming an empty blocked list', async () => {
  assert.throws(() => blockedTableIds(null, search.date, search.time));
  assert.throws(() => blockedTableIds([{ reservedDate: search.date, reservedTime: 'broken', tableIds: ['A'] }], search.date, search.time));
  const api = createCofeinBookingApi(env, async (url) => success(url.endsWith('/zones') ? {} : responseFor(url)));
  await assert.rejects(api.loadAvailability(search));
});

test('only active open-zone tables and explicitly allowed combinations meet party capacity', () => {
  const result = tableOptions(plan, [], ['closed'], { ...search, guests: 6 });
  assert.deepEqual(result.options.map((option) => option.tableIds), [['A', 'B']]);
  assert.equal(tableOptions({ ...plan, publicMaxTables: 1 }, [], ['closed'], { ...search, guests: 6 }).options.length, 0);
  assert.equal(tableOptions(plan, [{ reservedDate: search.date, reservedTime: '12:00', tableIds: ['b'] }], ['closed'], { ...search, guests: 6 }).options.length, 0);
});

test('an enabled closure returns no bookable options', async () => {
  const api = createCofeinBookingApi(env, async (url) => success(url.endsWith('/closure') ? { enabled: true, startDate: search.date, endDate: search.date } : responseFor(url)));
  const availability = await api.loadAvailability(search);
  assert.equal(availability.closed, true); assert.equal(availability.options.length, 0);
});

test('failed network/HTTP/invalid JSON cannot report success or availability', async () => {
  for (const fetcher of [async () => { throw new TypeError('network'); }, async () => ({ ok: false, status: 503 }), async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })]) {
    await assert.rejects(createCofeinBookingApi(env, fetcher).loadSetup());
  }
});

test('POST stays tenant-scoped and accepts only a matching server confirmation', async () => {
  const payload = { guestName: 'Test Guest', phone: '0000000000', email: 'qa@example.invalid', guestCount: 2, area: 'test', reservedDate: search.date, reservedTime: '12:00', tableIds: ['A'], privacyConsent: true, marketingConsent: false };
  const result = { ...payload, id: 19, status: 'Approved', requiresEmailConfirmation: false };
  const api = createCofeinBookingApi(env, async (url, options) => {
    assert.equal(url, 'https://api.example.test/api/v1/restaurants/cofein/reservations');
    assert.equal(options.method, 'POST'); assert.equal(options.headers['X-Tenant-Id'], 'cofein');
    assert.deepEqual(JSON.parse(options.body), payload); return success(result);
  });
  assert.equal((await api.create(payload)).status, 'Approved');
  for (const invalid of [{}, { ...result, status: 'Pending' }, { ...result, tableIds: ['B'] }, { ...result, requiresEmailConfirmation: true }]) assert.throws(() => validateBookingResult(invalid, payload));
  assert.equal(validateBookingResult({ ...result, status: 'AwaitingEmailConfirmation', requiresEmailConfirmation: true }, payload).status, 'AwaitingEmailConfirmation');
});


test('table selection keys cannot collide when a table ID contains a separator', () => {
  const special = { ...plan, tables: [...plan.tables, { id: 'A|B', area: 'test', seats: 8, x: 50, y: 75, isActive: true }] };
  const options = tableOptions(special, [], ['closed'], { ...search, guests: 6 }).options;
  assert.equal(options.length, 2); assert.notEqual(options[0].key, options[1].key);
  const payload = { reservedDate: search.date, reservedTime: '12:00', guestCount: 6, area: 'test', tableIds: ['A', 'B'] };
  assert.throws(() => validateBookingResult({ ...payload, id: 1, status: 'Approved', requiresEmailConfirmation: false, tableIds: ['A|B'] }, payload));
});

test('malformed blocking flags and translated zone names fail closed', () => {
  assert.throws(() => blockedTableIds([{ reservedDate: search.date, reservedTime: '12:00', tableIds: ['A'], isHallBlock: 'true' }], search.date, '12:00'));
  assert.throws(() => normalizeFloorPlan({ ...plan, zones: [{ ...plan.zones[0], names: { bg: {} } }] }));
});


test('dense map columns and edge tables keep fixed touch targets separated without moving percentage centers', () => {
  const tables = Array.from({ length: 12 }, (_, index) => ({ id: String(index), x: 5, y: 5 + index * 7.5, wide: index % 2 === 0 }));
  tables.push({ id: 'edge', x: 95, y: 95, wide: true });
  const size = floorMapDimensions(tables);
  assert.ok(Number.isFinite(size.width) && Number.isFinite(size.height));
  for (let index = 0; index < tables.length; index++) {
    const a = tables[index], aw = a.wide ? 78 : 52;
    assert.ok(a.x / 100 * size.width - aw / 2 >= 12 - 1e-6);
    assert.ok(size.width - a.x / 100 * size.width - aw / 2 >= 12 - 1e-6);
    assert.ok(a.y / 100 * size.height - 26 >= 12 - 1e-6);
    assert.ok(size.height - a.y / 100 * size.height - 26 >= 12 - 1e-6);
    for (const b of tables.slice(index + 1)) {
      const gapX = Math.abs(a.x - b.x) / 100 * size.width - (aw + (b.wide ? 78 : 52)) / 2;
      const gapY = Math.abs(a.y - b.y) / 100 * size.height - 52;
      assert.ok(Math.max(gapX, gapY) >= 12 - 1e-6);
    }
  }
});
