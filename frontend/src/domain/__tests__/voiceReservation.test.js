import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceReservation } from '../reservations/voiceReservation.js';
const now = new Date('2026-11-07T18:00:00Z');
test('Bulgarian and Russian full dictation populate only recognized fields', () => {
  assert.deepEqual(parseVoiceReservation('Иван Петров, телефон 0898123456, утре в 19:30, шест души', now).fields,
    { guestName: 'Иван Петров', phone: '0898123456', reservedDate: '2026-11-08', reservedTime: '19:30', guestCount: '6' });
  assert.deepEqual(parseVoiceReservation('Имя Анна Иванова, телефон +359 888 123 456, завтра в 20:00, четыре человека', now).fields,
    { guestName: 'Анна Иванова', phone: '+359888123456', reservedDate: '2026-11-08', reservedTime: '20:00', guestCount: '4' });
});
test('spoken phone digits preserve leading zero and never become a guest count', () => {
  const r = parseVoiceReservation('Име Мария, телефон нула осем осем осем едно две три четири пет шест, дата 10.11.2026, час 19:00, гости 6', now);
  assert.equal(r.fields.phone, '0888123456'); assert.equal(r.fields.guestCount, '6');
  assert.equal(r.fields.guestName, 'Мария'); assert.equal(r.fields.reservedDate, '2026-11-10');
});
test('invalid or past dates, invalid time and excessive guests require manual correction', () => {
  const r = parseVoiceReservation('Иван, телефон 123, дата 31.11.2026, час 25:90, 41 души', now);
  assert.deepEqual(r.fields, { guestName: 'Иван' }); assert.ok(r.issues.includes('date')); assert.ok(r.issues.includes('time')); assert.ok(r.issues.includes('guests'));
  assert.equal(parseVoiceReservation('дата 01.11.2026', now).fields.reservedDate, undefined);
});
test('relative dates use restaurant timezone and work across year boundaries', () => {
  assert.equal(parseVoiceReservation('утре', new Date('2026-12-31T21:00:00Z')).fields.reservedDate, '2027-01-01');
  assert.equal(parseVoiceReservation('днес', new Date('2026-11-07T23:00:00Z')).fields.reservedDate, '2026-11-08');
});
test('named dates and partial dictation do not invent missing contact fields', () => {
  const r = parseVoiceReservation('Име Борис, дата 12 ноември, в 19:00, двадесет и две души', now);
  assert.equal(r.fields.reservedDate, '2026-11-12'); assert.equal(r.fields.guestCount, '22'); assert.ok(r.missing.includes('phone'));
  assert.deepEqual(parseVoiceReservation('', now).fields, {});
});


test('punctuation-free dictation and date-only fragments do not invent contact data', () => {
  const r = parseVoiceReservation('Иван Петров телефон 0898123456 утре в 19:30 шест души', now);
  assert.equal(r.fields.guestName, 'Иван Петров'); assert.equal(r.fields.phone, '0898123456');
  assert.equal(r.fields.reservedTime, '19:30'); assert.equal(r.fields.guestCount, '6');
  assert.deepEqual(parseVoiceReservation('утре', now).fields, { reservedDate: '2026-11-08' });
  assert.equal(parseVoiceReservation('2026-11-08', now).fields.phone, undefined);
});


test('a dotted time after a time cue is not mistaken for an invalid date', () => {
  const r = parseVoiceReservation('Иван, утре в 19.30, шест души', now);
  assert.equal(r.fields.reservedTime, '19:30'); assert.equal(r.fields.reservedDate, '2026-11-08'); assert.deepEqual(r.issues, []);
});
