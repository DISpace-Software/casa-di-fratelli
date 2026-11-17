import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalReservationDictationEnabled } from '../reservations/reservationDictationPolicy.js';

const policy = { enabled: true, mode: 'on-device', languages: ['bg'], fields: ['guestName', 'phone'] };
test('shared API enables name/phone dictation for existing and future restaurants at either tier', () => {
  for (const tenantId of ['casa-di-fratelli', 'cofein', 'future-bistro']) {
    for (const productTier of ['Basic', 'Pro']) {
      assert.equal(isLocalReservationDictationEnabled({ tenantId, productTier, reservationDictation: policy }, tenantId), true);
    }
  }
});
test('missing, disabled, unsupported and cross-tenant policies fail closed', () => {
  const tenantId = 'cofein';
  for (const reservationDictation of [undefined, null, {}, { ...policy, enabled: false },
    { ...policy, enabled: 'true' }, { ...policy, mode: 'server' },
    { ...policy, languages: 'bg' }, { ...policy, languages: ['en'] },
    { ...policy, fields: ['guestName'] }, { ...policy, fields: ['guestName', 'phone', 'email'] }]) {
    assert.equal(isLocalReservationDictationEnabled({ tenantId, reservationDictation }, tenantId), false);
  }
  assert.equal(isLocalReservationDictationEnabled({ tenantId: 'casa-di-fratelli', reservationDictation: policy }, tenantId), false);
  assert.equal(isLocalReservationDictationEnabled(undefined, tenantId), false);
  assert.equal(isLocalReservationDictationEnabled({ tenantId: '', reservationDictation: policy }, ''), false);
});
