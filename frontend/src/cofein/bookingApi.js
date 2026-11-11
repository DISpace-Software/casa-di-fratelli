// Cofein is deliberately isolated from the legacy Casa providers and API defaults.
const TENANT_PATH = '/api/v1/restaurants/cofein';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validDate = (value) => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const minutes = (value) => TIME.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const selectionKey = (ids) => JSON.stringify([...ids].sort());
const stringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim());

export class BookingError extends Error {
  constructor(kind, status = 0) {
    super(kind);
    this.name = 'BookingError';
    this.kind = kind;
    this.status = status;
  }
}

export function bookingErrorMessage(error) {
  if (error?.status === 409) return 'Наличността се промени. Проверете отново свободните маси и изберете друга възможност.';
  if (error?.status === 429) return 'Достигнат е дневният лимит за резервации с тези данни.';
  if (error?.status === 400) return 'Проверете данните, датата и избраната маса, след което опитайте отново.';
  if (error?.kind === 'configuration') return 'Онлайн резервациите все още не са активни.';
  return 'В момента не можем да проверим свободните маси. Моля, опитайте отново.';
}

export function normalizeBookingPolicy(brand) {
  if (!isRecord(brand) || typeof brand.name !== 'string' || !/^cofein\b/i.test(brand.name.trim()) ||
      !Number.isInteger(brand.publicLeadMinutes) || brand.publicLeadMinutes < 0 || brand.publicLeadMinutes > 1440 ||
      !Number.isInteger(brand.publicMaxReservationDaysAhead) || brand.publicMaxReservationDaysAhead < 1 || brand.publicMaxReservationDaysAhead > 365 ||
      !TIME.test(brand.walkInOpeningTime) || !TIME.test(brand.publicLatestReservationTime) ||
      minutes(brand.publicLatestReservationTime) < minutes(brand.walkInOpeningTime) || typeof brand.timeZoneId !== 'string') {
    throw new BookingError('configuration');
  }
  try { new Intl.DateTimeFormat('en', { timeZone: brand.timeZoneId }).format(); }
  catch { throw new BookingError('configuration'); }
  return {
    name: brand.name.trim(), timeZone: brand.timeZoneId, openingTime: brand.walkInOpeningTime,
    latestTime: brand.publicLatestReservationTime, leadMinutes: brand.publicLeadMinutes,
    maxDays: brand.publicMaxReservationDaysAhead,
    phone: typeof brand.phone === 'string' && /^\+?[\d\s()-]{6,30}$/.test(brand.phone) ? brand.phone : '',
  };
}

export function normalizeFloorPlan(plan) {
  if (!isRecord(plan) || plan.schemaVersion !== 1 || typeof plan.revision !== 'string' || !plan.revision.trim() || plan.revision.startsWith('legacy-') ||
      !Array.isArray(plan.zones) || !Array.isArray(plan.tables) || !Array.isArray(plan.combinations) ||
      !Number.isInteger(plan.publicMaxGuests) || plan.publicMaxGuests < 1 || plan.publicMaxGuests > 500 ||
      !Number.isInteger(plan.publicMaxTables) || plan.publicMaxTables < 1 || plan.publicMaxTables > 50 ||
      plan.zones.length > 50 || plan.tables.length > 500 || plan.combinations.length > 2000) throw new BookingError('configuration');
  if (plan.zones.some((zone) => !isRecord(zone) || typeof zone.id !== 'string' || !zone.id || typeof zone.name !== 'string' || !zone.name.trim() ||
      typeof zone.isActive !== 'boolean' || zone.presentation !== 'plain' ||
      (zone.names != null && (!isRecord(zone.names) || Object.values(zone.names).some((name) => typeof name !== 'string' || !name.trim())))) || new Set(plan.zones.map((zone) => zone.id.toLowerCase())).size !== plan.zones.length) throw new BookingError('configuration');
  const zoneIds = new Set(plan.zones.map((zone) => zone.id));
  if (plan.tables.some((table) => !isRecord(table) || typeof table.id !== 'string' || !table.id.trim() || table.id.length > 20 ||
      !zoneIds.has(table.area) || !Number.isInteger(table.seats) || table.seats < 1 || table.seats > 500 || typeof table.isActive !== 'boolean' ||
      !Number.isFinite(table.x) || table.x < 5 || table.x > 95 || !Number.isFinite(table.y) || table.y < 5 || table.y > 95) ||
      new Set(plan.tables.map((table) => table.id.toLowerCase())).size !== plan.tables.length) throw new BookingError('configuration');
  const tableMap = new Map(plan.tables.map((table) => [table.id, table]));
  if (plan.combinations.some((group) => !stringList(group) || group.length < 2 || group.length > 50 || new Set(group).size !== group.length ||
      group.some((id) => !tableMap.has(id)) || new Set(group.map((id) => tableMap.get(id).area)).size !== 1)) throw new BookingError('configuration');
  if (!plan.tables.some((table) => table.isActive && plan.zones.some((zone) => zone.id === table.area && zone.isActive))) throw new BookingError('configuration');
  return plan;
}

export function restaurantClock(policy, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: policy.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const lastDay = new Date(`${today}T12:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + policy.maxDays);
  return { today, lastDate: lastDay.toISOString().slice(0, 10), minute: Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60 };
}

export function bookingTimes(policy, date, now = new Date()) {
  const clock = restaurantClock(policy, now);
  if (!validDate(date) || date < clock.today || date > clock.lastDate) return [];
  const times = [];
  for (let minute = minutes(policy.openingTime); minute <= minutes(policy.latestTime); minute += 15) {
    if (date === clock.today && (minute <= clock.minute || minute < clock.minute + policy.leadMinutes)) continue;
    times.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  return times;
}

export function validBookingSearch(search, policy, plan, now = new Date()) {
  return Number.isInteger(search.guests) && search.guests >= 1 && search.guests <= plan.publicMaxGuests && bookingTimes(policy, search.date, now).includes(search.time);
}

function timeRanges(value) {
  if (typeof value !== 'string' || !value.trim()) throw new BookingError('invalid');
  return value.split(',').map((part) => {
    const bounds = part.trim().split(' - ');
    if (bounds.length > 2 || bounds.some((bound) => !TIME.test(bound))) throw new BookingError('invalid');
    return bounds.map(minutes);
  });
}

export function blockedTableIds(blocked, date, time) {
  if (!Array.isArray(blocked)) throw new BookingError('invalid');
  const target = minutes(time);
  if (target === null) throw new BookingError('invalid');
  const ids = new Set();
  for (const slot of blocked) {
    if (!isRecord(slot) || !validDate(slot.reservedDate) || !stringList(slot.tableIds) ||
        ['isHallBlock', 'isPublicHold'].some((flag) => slot[flag] !== undefined && typeof slot[flag] !== 'boolean')) throw new BookingError('invalid');
    const ranges = timeRanges(slot.reservedTime);
    if (slot.reservedDate !== date) continue;
    const overlaps = slot.isPublicHold === true || ranges.some(([start, end = start]) => {
      if (slot.isHallBlock === true) return start <= end ? target >= start && target <= end : target >= start || target <= end;
      const last = end < start ? end + 1440 : end;
      for (let value = start; value <= last; value += 60) {
        const distance = Math.abs(value % 1440 - target);
        if (Math.min(distance, 1440 - distance) < 180) return true;
      }
      return false;
    });
    if (overlaps) slot.tableIds.forEach((id) => ids.add(id.toLowerCase()));
  }
  return ids;
}

export function tableOptions(plan, blocked, closedAreas, search) {
  if (!stringList(closedAreas)) throw new BookingError('invalid');
  const unavailable = blockedTableIds(blocked, search.date, search.time);
  const zones = plan.zones.filter((zone) => zone.isActive && !closedAreas.includes(zone.id));
  const tables = plan.tables.filter((table) => table.isActive && zones.some((zone) => zone.id === table.area));
  const available = new Map(tables.filter((table) => !unavailable.has(table.id.toLowerCase())).map((table) => [table.id, table]));
  const groups = [...tables.map((table) => [table.id]), ...plan.combinations];
  const options = groups.filter((group) => group.length <= plan.publicMaxTables && group.every((id) => available.has(id)))
    .map((group) => ({ key: selectionKey(group), tableIds: [...group], area: available.get(group[0]).area, seats: group.reduce((sum, id) => sum + available.get(id).seats, 0) }))
    .filter((option) => option.seats >= search.guests);
  return { zones, tables, unavailable: [...unavailable], options: [...new Map(options.map((option) => [option.key, option])).values()] };
}

// Preserve the saved percentage positions while giving each table a full hit target.
// Growing either axis only increases separation, so earlier pair checks stay valid.
export function floorMapDimensions(tables) {
  const gap = 12;
  const tableWidth = (table) => table.wide ? 78 : 52;
  let width = 820, height = 380;
  for (const table of tables) {
    const edgeX = Math.min(table.x, 100 - table.x) / 100;
    const edgeY = Math.min(table.y, 100 - table.y) / 100;
    if (edgeX > 0) width = Math.max(width, (tableWidth(table) / 2 + gap) / edgeX);
    if (edgeY > 0) height = Math.max(height, (26 + gap) / edgeY);
  }
  for (let index = 0; index < tables.length; index += 1) {
    const first = tables[index];
    for (const second of tables.slice(index + 1)) {
      const dx = Math.abs(first.x - second.x) / 100;
      const dy = Math.abs(first.y - second.y) / 100;
      const requiredX = (tableWidth(first) + tableWidth(second)) / 2 + gap;
      const requiredY = 52 + gap;
      if (dx * width >= requiredX || dy * height >= requiredY || (!dx && !dy)) continue;
      const nextWidth = dx ? requiredX / dx : Infinity;
      const nextHeight = dy ? requiredY / dy : Infinity;
      if (nextWidth / width < nextHeight / height) width = nextWidth;
      else height = nextHeight;
    }
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

export function validateBookingResult(result, payload) {
  if (!isRecord(result) || !Number.isInteger(result.id) || result.id < 1 ||
      !['Approved', 'AwaitingEmailConfirmation'].includes(result.status) ||
      result.requiresEmailConfirmation !== (result.status === 'AwaitingEmailConfirmation') ||
      result.reservedDate !== payload.reservedDate || result.reservedTime !== payload.reservedTime ||
      result.guestCount !== payload.guestCount || result.area !== payload.area || !stringList(result.tableIds) ||
      selectionKey(result.tableIds) !== selectionKey(payload.tableIds)) throw new BookingError('unknown-result');
  return result;
}

export function createCofeinBookingApi(env = import.meta.env ?? {}, fetcher = globalThis.fetch) {
  let base = '';
  if (env.VITE_COFEIN_BOOKINGS_ENABLED === 'true' && typeof env.VITE_COFEIN_API_BASE_URL === 'string') {
    try {
      const url = new URL(env.VITE_COFEIN_API_BASE_URL);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/') base = url.origin;
    } catch { /* An explicit API origin is required. Never fall back to Casa. */ }
  }
  const enabled = Boolean(base);
  async function request(path, { signal, payload } = {}) {
    if (!enabled) throw new BookingError('configuration');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 15000);
    try {
      const response = await fetcher(`${base}${TENANT_PATH}${path}`, {
        method: payload ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', 'X-Tenant-Id': 'cofein', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok) throw new BookingError('http', response.status);
      try { return await response.json(); }
      catch { throw new BookingError(payload ? 'unknown-result' : 'invalid'); }
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (error instanceof BookingError) throw error;
      throw new BookingError('network');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }
  async function loadSetup(signal) {
    const [brand, rawPlan] = await Promise.all([request('/branding', { signal }), request('/floor-plan', { signal })]);
    return { policy: normalizeBookingPolicy(brand), plan: normalizeFloorPlan(rawPlan) };
  }
  async function loadAvailability(search, signal) {
    const [setup, blocked, zones, closure] = await Promise.all([
      loadSetup(signal), request('/reservations/blocked-slots', { signal }), request('/zones', { signal }), request('/closure', { signal }),
    ]);
    if (!validBookingSearch(search, setup.policy, setup.plan)) throw new BookingError('invalid');
    if (!isRecord(zones) || !stringList(zones.closedAreas) || !isRecord(closure) || typeof closure.enabled !== 'boolean' ||
        (closure.enabled && (!validDate(closure.startDate) || !validDate(closure.endDate) || closure.endDate < closure.startDate))) throw new BookingError('invalid');
    const closed = closure.enabled && search.date >= closure.startDate && search.date <= closure.endDate;
    const availability = tableOptions(setup.plan, blocked, zones.closedAreas, search);
    return { ...setup, ...availability, options: closed ? [] : availability.options, closed, checkedAt: Date.now() };
  }
  return { enabled, loadSetup, loadAvailability, async create(payload, signal) { return validateBookingResult(await request('/reservations', { signal, payload }), payload); } };
}
