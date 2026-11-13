import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_ATTEMPT_KEY, createBookingAttemptStore, isDefinitiveBookingFailure } from './bookingAttempt.js';

function memoryStorage(initial = []) {
  const data = new Map(initial);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}

test('pending POST persists only one tenant-scoped bit and survives a new module/session instance', () => {
  const storage = memoryStorage([['casa-di-fratelli:booking:pending:v1', 'keep']]);
  const first = createBookingAttemptStore(storage);
  assert.equal(first.getAttempt(), false);
  assert.deepEqual(first.startAttempt(), { persistent: true });
  assert.equal(first.getAttempt(), true);
  assert.deepEqual([...storage.data], [['casa-di-fratelli:booking:pending:v1', 'keep'], [BOOKING_ATTEMPT_KEY, '1']]);
  const reopened = createBookingAttemptStore(storage);
  assert.equal(reopened.getAttempt(), true);
  assert.deepEqual(reopened.clearAttempt(), { persistent: true });
  assert.equal(reopened.getAttempt(), false);
  assert.equal(createBookingAttemptStore(storage).getAttempt(), false);
  assert.equal(storage.getItem('casa-di-fratelli:booking:pending:v1'), 'keep');
});

test('an unknown or old marker never expires or silently permits another POST', () => {
  for (const marker of ['1', '', 'invalid', '2020-01-01']) {
    const storage = memoryStorage([[BOOKING_ATTEMPT_KEY, marker]]);
    const attempts = createBookingAttemptStore(storage);
    assert.equal(attempts.getAttempt(), true);
    assert.equal(attempts.getAttempt(), true);
    assert.equal(storage.getItem(BOOKING_ATTEMPT_KEY), marker);
  }
});

test('unavailable storage retains protection in memory until a definitive resolution', () => {
  const disabled = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  for (const storage of [undefined, null, disabled, () => { throw new Error('getter denied'); }]) {
    const attempts = createBookingAttemptStore(storage);
    assert.equal(attempts.getAttempt(), false);
    assert.deepEqual(attempts.startAttempt(), { persistent: false });
    assert.equal(attempts.getAttempt(), true);
    assert.equal(attempts.getAttempt(), true);
    assert.deepEqual(attempts.clearAttempt(), { persistent: false });
    assert.equal(attempts.getAttempt(), false);
  }
});

test('failed persistence cannot be mistaken for a cleared memory marker', () => {
  const storage = memoryStorage();
  storage.setItem = () => { throw new Error('quota'); };
  const attempts = createBookingAttemptStore(storage);
  assert.deepEqual(attempts.startAttempt(), { persistent: false });
  assert.equal(storage.getItem(BOOKING_ATTEMPT_KEY), null);
  assert.equal(attempts.getAttempt(), true);
});

test('confirmed result clears current memory even if storage removal fails, while a reload stays conservative', () => {
  const storage = memoryStorage();
  const attempts = createBookingAttemptStore(storage);
  attempts.startAttempt();
  storage.removeItem = () => { throw new Error('denied'); };
  assert.deepEqual(attempts.clearAttempt(), { persistent: false });
  assert.equal(attempts.getAttempt(), false);
  assert.equal(createBookingAttemptStore(storage).getAttempt(), true);
  assert.deepEqual(attempts.startAttempt(), { persistent: true });
  assert.equal(attempts.getAttempt(), true);
});

test('only explicit HTTP rejection can clear a failed attempt; uncertain results stay pending', () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429]) assert.equal(isDefinitiveBookingFailure({ kind: 'http', status }), true);
  for (const error of [null, new Error('lost'), { kind: 'network' }, { kind: 'unknown-result' }, { kind: 'http', status: 408 }, { kind: 'http', status: 500 }, { kind: 'http', status: 503 }, { kind: 'http', status: 200 }, { kind: 'network', status: 400 }]) {
    const attempts = createBookingAttemptStore(memoryStorage());
    attempts.startAttempt();
    if (isDefinitiveBookingFailure(error)) attempts.clearAttempt();
    assert.equal(attempts.getAttempt(), true);
  }
});
