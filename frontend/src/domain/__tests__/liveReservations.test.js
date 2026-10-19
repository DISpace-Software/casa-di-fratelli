import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveReservationCandidates, buildReservationsByTableForDate } from '../adminMap/liveReservations.js';

const booking = { id: 1, reservedDate: '2026-10-17', reservedTime: '12:00', status: 'Approved', isArrived: true, tableIds: ['1'] };

test('seated and late guests remain on the map after 90 minutes and throughout the day', () => {
  for (const isArrived of [true, false]) {
    for (const hour of [13, 14, 18, 23]) {
      const reservation = { ...booking, isArrived };
      assert.deepEqual(getLiveReservationCandidates([reservation], new Date(2026, 9, 17, hour, 59)), [reservation]);
    }
  }
});

test('manual release, cancellation and no-show clear the map while other bookings remain', () => {
  const reservations = [booking, { ...booking, id: 2, status: 'Released' }, { ...booking, id: 3, status: 'Cancelled' }, { ...booking, id: 4, isNoShow: true }, { ...booking, id: 5, reservedDate: '2026-10-18' }];
  assert.deepEqual(getLiveReservationCandidates(reservations, new Date(2026, 9, 17, 22)), [booking]);
});

test('occupied table takes priority over a later booking and input stays unchanged', () => {
  const future = { ...booking, id: 2, isArrived: false, reservedTime: '21:00' };
  const reservations = [future, booking];
  const before = structuredClone(reservations);
  assert.deepEqual(getLiveReservationCandidates(reservations, new Date(2026, 9, 17, 20)), [booking, future]);
  assert.deepEqual(reservations, before);
});

 test('hall and restaurant blocks never replace guest bookings on the admin map', () => {
  const hallBlock = { ...booking, id: 99, createdByAdmin: true, phone: 'admin', guestName: 'Admin block', reservedTime: '10:00 - 22:00' };
  const singleTimeBlock = { ...hallBlock, id: 100, reservedTime: '12:00', area: 'all' };
  assert.deepEqual(getLiveReservationCandidates([hallBlock, singleTimeBlock, booking], new Date(2026, 9, 17, 20)), [booking]);
 });

test('future-date admin map retains guests when hall block sorts first', () => {
  const block = { ...booking, id: 99, createdByAdmin: true, phone: 'admin', guestName: 'Admin block', reservedTime: '10:00 - 22:00' };
  const byTable = buildReservationsByTableForDate([block, booking], booking.reservedDate);
  assert.equal(byTable.get('1'), booking);
});
