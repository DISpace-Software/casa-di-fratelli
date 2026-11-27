import test from 'node:test';
import assert from 'node:assert/strict';
import { todayGuestSummary } from '../reservations/todayGuestSummary.js';
const booking = { reservedDate: '2026-11-26', reservedTime: '12:00', guestCount: 4, status: 'Approved' };
const now = new Date('2026-11-26T17:00:00Z');
test('today counts guests in upcoming and current bookings, never released visits or blocks', () => {
  const rows = [booking, { ...booking, status: 'Pending', guestCount: 2, reservedTime: '22:00' },
    { ...booking, isArrived: true, guestCount: 3 },
    ...['Released', 'Cancelled', 'AwaitingEmailConfirmation'].map(status => ({ ...booking, status })),
    { ...booking, isNoShow: true }, { ...booking, hasCompletedVisit: true },
    { ...booking, isDeleted: true }, { ...booking, isHallBlock: true },
    { ...booking, reservedDate: '2026-11-27' }];
  assert.deepEqual(todayGuestSummary(rows, now), { guests: 9, reservations: 3 });
  assert.deepEqual(todayGuestSummary([{ ...booking, status: 'Released' }], now), { guests: 0, reservations: 0 });
});
test('today follows restaurant midnight rather than browser date', () => {
  assert.equal(todayGuestSummary([booking], new Date('2026-11-25T22:15:00Z')).guests, 4);
  assert.equal(todayGuestSummary([booking], new Date('2026-11-26T22:15:00Z')).guests, 0);
});
