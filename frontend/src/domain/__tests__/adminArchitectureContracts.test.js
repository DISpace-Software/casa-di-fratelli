import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReservation, normalizeDiningOrder } from '../../admin/api/reservationMappers.js';
import { canActorManageAdminUser } from '../../admin/presentation/roles.js';
import { hasWaiterAttentionItems, getDiningItemStatusLabel } from '../../admin/presentation/diningOrders.js';
import { remainingOfferSeconds, isValidOfferDuration, canCloseWaitlistEntry } from '../../admin/waitlist/waitlistPresentation.js';

test('reservation boundary accepts old PascalCase tables without dropping false values', () => {
  const mapped = normalizeReservation({ Id: 42, GuestCount: 0, IsArrived: false, Tables: [{ TableCode: 'T1' }, 'T2', {}] });
  assert.equal(mapped.id, 42);
  assert.equal(mapped.guestCount, 0);
  assert.equal(mapped.isArrived, false);
  assert.deepEqual(mapped.tableIds, ['T1', 'T2']);
});

test('dining boundary retains item provenance and call kind for waiter attention', () => {
  const mapped = normalizeDiningOrder({ Id: 9, Source: 'GuestOnline', Items: [{ Id: 1, Kind: 'WaiterCall', Quantity: '1', UnitPrice: '0' }] });
  assert.equal(mapped.items[0].source, 'GuestOnline');
  assert.equal(mapped.items[0].unitPrice, 0);
  assert.equal(hasWaiterAttentionItems(mapped), true);
  assert.equal(getDiningItemStatusLabel(mapped.items[0], 'en'), 'Waiter called');
  mapped.items[0].waiterSeenAtUtc = '2026-11-26T12:00:00Z';
  assert.equal(hasWaiterAttentionItems(mapped), false);
});

test('role UI preserves management hierarchy; it is not server authorization', () => {
  assert.equal(canActorManageAdminUser('Owner', 'Developer'), false);
  assert.equal(canActorManageAdminUser('Administrator', 'Owner'), false);
  assert.equal(canActorManageAdminUser('Administrator', 'Waiter'), true);
  assert.equal(canActorManageAdminUser('Waiter', 'Waiter'), false);
  assert.equal(canActorManageAdminUser('Developer', 'Owner'), true);
});

test('waitlist countdown uses server time and clamps expired offers', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  assert.equal(remainingOfferSeconds('2026-11-26T13:05:00Z', now, 3_600_000), 300);
  assert.equal(remainingOfferSeconds('2026-11-26T12:59:59Z', now, 3_600_000), 0);
  assert.equal(isValidOfferDuration('3.5'), false);
  assert.equal(isValidOfferDuration('7'), true);
  assert.equal(canCloseWaitlistEntry('offered'), true);
  assert.equal(canCloseWaitlistEntry('booked'), false);
});
