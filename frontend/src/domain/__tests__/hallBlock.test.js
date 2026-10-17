import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedSlotForSelection, getUnavailableTableIdsForSlot, isWithinHallBlock } from '../reservations/availability.js';
const block = { reservedDate: '2026-10-18', reservedTime: '18:15 - 20:45', isHallBlock: true, tableIds: ['1', '2'] };
test('public hall block covers exact chosen interval including its end', () => {
  for (const time of ['18:15', '19:00', '20:30', '20:45']) assert.equal(isBlockedSlotForSelection(block, block.reservedDate, time), true);
  for (const time of ['15:30', '18:00', '21:00', '23:00']) assert.equal(isBlockedSlotForSelection(block, block.reservedDate, time), false);
  assert.equal(isBlockedSlotForSelection(block, '2026-10-19', '19:00'), false);
});
test('admin availability and public map agree on hall block boundaries', () => {
  const reservation = { ...block, status: 'Approved', id: 1, createdByAdmin: true, phone: 'admin', guestName: 'Admin block' };
  delete reservation.isHallBlock;
  assert.deepEqual([...getUnavailableTableIdsForSlot([reservation], block.reservedDate, '20:45')], ['1', '2']);
  assert.deepEqual([...getUnavailableTableIdsForSlot([reservation], block.reservedDate, '21:00')], []);
});
test('overnight and single-slot blocks use exact times', () => {
  assert.equal(isWithinHallBlock('22:00 - 01:00', '00:30'), true);
  assert.equal(isWithinHallBlock('22:00 - 01:00', '01:15'), false);
  assert.equal(isWithinHallBlock('19:00', '19:00'), true);
  assert.equal(isWithinHallBlock('19:00', '19:15'), false);
});
