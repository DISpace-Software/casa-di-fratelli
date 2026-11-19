import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_LIMITS, validateBookingContact } from './bookingForm.js';

const valid = { guestName: 'Георги Иванов', phone: '089 330 0305', email: 'georgi@example.test', notes: '', privacyConsent: true };

test('Bulgarian names and formatted domestic/international phones need no rewriting', () => {
  for (const phone of ['089 330 0305', '+359 893 300 305', '00359 (893) 300-305', '02/1234567', '+44 (20) 1234 5678']) {
    const contact = { ...valid, guestName: '  Георги Иванов  ', phone, email: '  Guest+table@Example.test  ' };
    const original = { ...contact };
    assert.deepEqual(validateBookingContact(contact), {});
    assert.deepEqual(contact, original);
  }
  assert.deepEqual(validateBookingContact({ ...valid, guestName: 'Ли' }), {});
});

test('empty fields report each field separately in Bulgarian, with consent required', () => {
  for (const contact of [undefined, null, {}, { guestName: ' ', phone: '\t', email: '\n', privacyConsent: 'true' }]) {
    const errors = validateBookingContact(contact);
    assert.deepEqual(Object.keys(errors), ['guestName', 'phone', 'email', 'privacyConsent']);
    assert.ok(Object.values(errors).every(message => /[А-Яа-я]/u.test(message)));
  }
});

test('reservation name and email exactly fit database limits, with overlong input rejected before POST', () => {
  assert.deepEqual(CONTACT_LIMITS, { guestName: 120, phone: 50, email: 120, notes: 2000 });
  const email = 'g'.repeat(108) + '@example.com';
  assert.equal(email.length, 120);
  assert.deepEqual(validateBookingContact({ ...valid, guestName: 'Г'.repeat(120), email }), {});
  assert.deepEqual(Object.keys(validateBookingContact({ ...valid, guestName: 'Г'.repeat(121), email: `g${email}` })), ['guestName', 'email']);
  assert.deepEqual(Object.keys(validateBookingContact({ ...valid, guestName: ' Г ' })), ['guestName']);
});

test('phone validation identifies mistyped text, missing digits, and overlong values', () => {
  for (const phone of ['12345', 'обадете се 0893300305', '089+3300305', '++359893300305', '------', '0'.repeat(51)]) {
    assert.deepEqual(Object.keys(validateBookingContact({ ...valid, phone })), ['phone']);
  }
  const formattedAtLimit = '0'.repeat(10).split('').join('    ') + '    ';
  assert.ok(formattedAtLimit.length <= CONTACT_LIMITS.phone);
  assert.deepEqual(validateBookingContact({ ...valid, phone: formattedAtLimit }), {});
});

test('email typo messages remain attached to the email field', () => {
  for (const email of ['guest', 'guest@', '@example.test', 'guest@example', 'guest @example.test', 'guest@@example.test']) {
    assert.deepEqual(Object.keys(validateBookingContact({ ...valid, email })), ['email']);
  }
});

test('optional notes respect the backend editing limit without changing other valid fields', () => {
  assert.deepEqual(validateBookingContact({ ...valid, notes: 'а'.repeat(2000) }), {});
  assert.deepEqual(Object.keys(validateBookingContact({ ...valid, notes: 'а'.repeat(2001) })), ['notes']);
  assert.deepEqual(validateBookingContact({ ...valid, notes: null }), {});
});
