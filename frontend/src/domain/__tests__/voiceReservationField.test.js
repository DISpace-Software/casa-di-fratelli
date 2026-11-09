import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceReservationField } from '../reservations/voiceReservationField.js';

const now = new Date('2026-11-09T12:00:00Z');
const accepted = [
  ['guestName', 'Георги Иванов', 'Георги Иванов'],
  ['guestName', 'Здравейте, името е Георги Иванов, благодаря', 'Георги Иванов'],
  ['guestName', 'добре, на името на Анна-Мария Добрева', 'Анна-Мария Добрева'],
  ['guestName', 'Име: георги иванов', 'георги иванов'],
  ['guestName', 'На чие да е резервацията? Георги Иванов', 'Георги Иванов'],
  ['guestName', "Sean O’Connor", 'Sean O’Connor'],
  ['phone', '089 56 12 46 15', '08956124615'],
  ['phone', 'Телефонче: 0888 12 34 56', '0888123456'],
  ['phone', 'номерчето е 0888 12 34 56, благодаря', '0888123456'],
  ['phone', 'нула осем осем осем дванадесет тридесет и четири петдесет и шест', '0888123456'],
  ['phone', 'нула осемдесет и девет петдесет и шест дванадесет четиридесет и шест петнадесет', '08956124615'],
  ['phone', 'плюс триста петдесет и девет осем осем осем дванадесет тридесет и четири петдесет и шест', '+359888123456'],
  ['phone', '+359 (888) 12-34-56', '+359888123456'],
  ['reservedDate', 'следващата сряда', '2026-11-11'],
  ['reservedDate', 'утре', '2026-11-10'],
  ['reservedDate', 'вдругиден', '2026-11-11'],
  ['reservedDate', 'за утре, моля', '2026-11-10'],
  ['reservedDate', 'Датата е 12.11.2026', '2026-11-12'],
  ['reservedDate', '11/11', '2026-11-11'],
  ['reservedDate', 'двадесет и девети ноември', '2026-11-29'],
  ['reservedDate', 'петнадесет ноември', '2026-11-15'],
  ['reservedTime', 'десет', '10:00'],
  ['reservedTime', 'в 10:00', '10:00'],
  ['reservedTime', 'За колко часа? За десет', '10:00'],
  ['reservedTime', 'седем и половина вечерта', '19:30'],
  ['reservedTime', 'осем без четвърт вечерта', '19:45'],
  ['reservedTime', 'десет часа', '10:00'],
  ['reservedTime', '19:15', '19:15'],
  ['guestCount', 'трима', '3'],
  ['guestCount', '3човека', '3'],
  ['guestCount', 'Колко човека? Трима човека', '3'],
  ['guestCount', 'Брой гости: двадесет и двама', '22'],
  ['guestCount', 'двама възрастни и две деца', '4'],
  ['guestCount', 'не трима, а четирима', '4'],
  ['guestCount', 'четиридесет', '40'],
  ['email', 'georgi.ivanov@example.com', 'georgi.ivanov@example.com'],
  ['email', 'georgi маймунка gmail точка com', 'georgi@gmail.com'],
  ['email', 'Имейлът е georgi кльомба example точка bg', 'georgi@example.bg'],
];
for (const [field, transcript, value] of accepted) {
  test(`single-field Bulgarian ${field}: ${transcript}`, () => {
    assert.deepEqual(parseVoiceReservationField(field, transcript, now), { value, issue: null });
  });
}

const rejected = [
  ['guestName', '', 'name'],
  ['guestName', 'здравейте здравейте добре благодаря', 'name'],
  ['guestName', 'само момент', 'name'],
  ['guestName', 'не знам', 'name'],
  ['guestName', 'Георги Иванов или Иван Георгиев', 'name'],
  ['guestName', 'Георги Иванов телефон 0888123456', 'name'],
  ['guestName', 'За утре ще сме трима', 'name'],
  ['phone', 'нула осем осем осем', 'phone'],
  ['phone', '08956', 'phone'],
  ['phone', '089 56 12', 'phone'],
  ['phone', '088812345', 'phone'],
  ['phone', '+35988812345', 'phone'],
  ['phone', '0', 'phone'],
  ['phone', '1234567890123456', 'phone'],
  ['phone', '0888123456 или 0899123456', 'phone'],
  ['phone', '0888123456 не съм сигурен', 'phone'],
  ['phone', '0888123456 за утре', 'phone'],
  ['phone', 'Георги Иванов', 'phone'],
  ['reservedDate', '8.11.2026', 'date'],
  ['reservedDate', '31.11.2026', 'date'],
  ['reservedDate', 'утре или вдругиден', 'date'],
  ['reservedDate', 'утре ще ти звънна', 'date'],
  ['reservedDate', 'не разбрах', 'date'],
  ['reservedDate', 'час 10:00', 'date'],
  ['reservedTime', '24:00', 'time'],
  ['reservedTime', '19:60', 'time'],
  ['reservedTime', 'седем или осем', 'time'],
  ['reservedTime', 'десет ябълки', 'time'],
  ['reservedTime', 'трима човека', 'time'],
  ['reservedTime', 'утре', 'time'],
  ['guestCount', 'нула', 'guests'],
  ['guestCount', '41', 'guests'],
  ['guestCount', 'три ябълки', 'guests'],
  ['guestCount', 'трима или четирима', 'guests'],
  ['guestCount', 'трима човека утре', 'guests'],
  ['guestCount', 'в 10:00', 'guests'],
  ['guestCount', 'не съм сигурен', 'guests'],
  ['email', 'georgi gmail com', 'email'],
  ['email', 'георги маймунка джимейл точка ком', 'email'],
  ['email', '.georgi@example.com', 'email'],
  ['email', 'georgi..ivanov@example.com', 'email'],
  ['email', 'georgi@example', 'email'],
  ['email', 'georgi@gmail.com или ivan@gmail.com', 'email'],
];
for (const [field, transcript, issue] of rejected) {
  test(`single-field rejects ${field}: ${transcript || '(empty)'}`, () => {
    assert.deepEqual(parseVoiceReservationField(field, transcript, now), { value: null, issue });
  });
}

test('a partial spoken phone becomes valid only when the cumulative digits are complete enough', () => {
  const parts = ['нула осем осем осем', 'дванадесет', 'тридесет и четири', 'петдесет и шест'];
  const heard = [];
  const values = [null, null, null, '0888123456'];
  for (const [index, part] of parts.entries()) {
    heard.push(part);
    assert.equal(parseVoiceReservationField('phone', heard.join(' '), now).value, values[index]);
  }
});

test('dates follow Sofia calendar, including midnight and next occurrence of the same weekday', () => {
  assert.equal(parseVoiceReservationField('reservedDate', 'утре', new Date('2026-11-08T22:30:00Z')).value, '2026-11-10');
  assert.equal(parseVoiceReservationField('reservedDate', 'следващия понеделник', now).value, '2026-11-16');
  assert.equal(parseVoiceReservationField('reservedDate', 'понеделник', now).value, '2026-11-09');
});

const otherLanguages = [
  ['ru-RU', 'guestName', 'Имя Иван Петров', 'Иван Петров'],
  ['ru-RU', 'phone', 'ноль восемь восемь восемь один два три четыре пять шесть', '0888123456'],
  ['ru-RU', 'reservedDate', 'завтра', '2026-11-10'],
  ['ru-RU', 'reservedTime', 'семь вечера', '19:00'],
  ['ru-RU', 'guestCount', 'три человека', '3'],
  ['en-US', 'guestName', 'Name John Smith', 'John Smith'],
  ['en-US', 'phone', 'zero eight eight eight one two three four five six', '0888123456'],
  ['en-US', 'reservedDate', 'tomorrow', '2026-11-10'],
  ['en-US', 'reservedTime', 'seven pm', '19:00'],
  ['en-US', 'guestCount', 'three people', '3'],
  ['en-US', 'email', 'john at example dot com', 'john@example.com'],
];
for (const [language, field, transcript, value] of otherLanguages) {
  test(`single-field ${language} ${field}: ${transcript}`, () => {
    assert.deepEqual(parseVoiceReservationField(field, transcript, now, { language }), { value, issue: null });
  });
}

test('unsupported fields cannot produce a value', () => {
  assert.deepEqual(parseVoiceReservationField('tableIds', 'пет', now), { value: null, issue: 'field' });
});
