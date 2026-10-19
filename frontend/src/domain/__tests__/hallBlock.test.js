import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedSlotForSelection, getUnavailableTableIdsForSlot, isWithinHallBlock } from '../reservations/availability.js';
const block = { reservedDate: '2026-10-18', reservedTime: '18:15 - 20:45', isHallBlock: true, tableIds: ['1', '2'] };
test('public hall block covers exact chosen interval including its end', () => {
  for (const time of ['18:15', '19:00', '20:30', '20:45']) assert.equal(isBlockedSlotForSelection(block, block.reservedDate, time), true);
  for (const time of ['15:30', '18:00', '21:00', '23:00']) assert.equal(isBlockedSlotForSelection(block, block.reservedDate, time), false);
  assert.equal(isBlockedSlotForSelection(block, '2026-10-19', '19:00'), false);
});
test('public hall blocks do not restrict admin table selection', () => {
  const reservation = { ...block, status: 'Approved', id: 1, createdByAdmin: true, phone: 'admin', guestName: 'Admin block' };
  delete reservation.isHallBlock;
  assert.deepEqual([...getUnavailableTableIdsForSlot([reservation], block.reservedDate, '20:45')], []);
  assert.equal(isBlockedSlotForSelection(block, block.reservedDate, '20:45'), true);
  assert.deepEqual([...getUnavailableTableIdsForSlot([reservation], block.reservedDate, '21:00')], []);
});
test('overnight and single-slot blocks use exact times', () => {
  assert.equal(isWithinHallBlock('22:00 - 01:00', '00:30'), true);
  assert.equal(isWithinHallBlock('22:00 - 01:00', '01:15'), false);
  assert.equal(isWithinHallBlock('19:00', '19:00'), true);
  assert.equal(isWithinHallBlock('19:00', '19:15'), false);
});

import { buildTimeRange } from '../reservations/hallBlockRules.js';
test('24 October hall block uses 10:00 through 22:00 without clearing early hours', () => {
  const times = buildTimeRange('10:00', '22:00');
  assert.equal(times.length, 13);
  assert.equal(times[0], '10:00');
  assert.equal(times.at(-1), '22:00');
});
test('hall block preserves quarter-hour end and rejects missing times', () => {
  assert.deepEqual(buildTimeRange('18:00', '20:45'), ['18:00', '19:00', '20:00', '20:45']);
  assert.deepEqual(buildTimeRange('', '22:00'), []);
  assert.deepEqual(buildTimeRange('10:00', ''), []);
});
