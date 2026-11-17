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
  ['guestName', 'Само момент, Георги Иванов', 'Георги Иванов'],
  ['guestName', 'Георги Иванов. Поправка: Георги Петров', 'Георги Петров'],
  ['guestName', 'Не Георги Иванов, а Иван Петров', 'Иван Петров'],
  ['guestName', 'Георги Иванов. Георги Иванов.', 'Георги Иванов'],
  ['phone', '089 5 12 46 15', '0895124615'],
  ['phone', 'Телефонче: 0888 12 34 56', '0888123456'],
  ['phone', 'номерчето е 0888 12 34 56, благодаря', '0888123456'],
  ['phone', 'нула осем осем осем дванадесет тридесет и четири петдесет и шест', '0888123456'],
  ['phone', 'нула осемдесет и девет пет дванадесет четиридесет и шест петнадесет', '0895124615'],
  ['phone', 'плюс триста петдесет и девет осем осем осем дванадесет тридесет и четири петдесет и шест', '+359888123456'],
  ['phone', '+359 (888) 12-34-56', '+359888123456'],
  ['phone', '0888, дванайсет, трийсет и четири, петдесет и шест', '0888123456'],
  ['phone', '0888 12 34 56. 0888 12 34 56.', '0888123456'],
  ['phone', '0888 12 34 56, не, 0899 12 34 56', '0899123456'],
  ['reservedDate', 'следващата сряда', '2026-11-11'],
  ['reservedDate', 'утре', '2026-11-10'],
  ['reservedDate', 'вдругиден', '2026-11-11'],
  ['reservedDate', 'за утре, моля', '2026-11-10'],
  ['reservedDate', 'Датата е 12.11.2026', '2026-11-12'],
  ['reservedDate', '11/11', '2026-11-11'],
  ['reservedDate', 'двадесет и девети ноември', '2026-11-29'],
  ['reservedDate', 'петнадесет ноември', '2026-11-15'],
  ['reservedDate', 'в сряда', '2026-11-11'],
  ['reservedDate', 'във вторник', '2026-11-10'],
  ['reservedDate', 'на 18-ти ноември', '2026-11-18'],
  ['reservedDate', '17.11.2026 г.', '2026-11-17'],
  ['reservedDate', 'утре, не, вдругиден', '2026-11-11'],
  ['reservedTime', 'десет', '10:00'],
  ['reservedTime', 'в 10:00', '10:00'],
  ['reservedTime', 'За колко часа? За десет', '10:00'],
  ['reservedTime', 'седем и половина вечерта', '19:30'],
  ['reservedTime', 'осем без четвърт вечерта', '19:45'],
  ['reservedTime', 'десет часа', '10:00'],
  ['reservedTime', '19:15', '19:15'],
  ['reservedTime', 'в 19,30', '19:30'],
  ['reservedTime', '19,19', '19:19'],
  ['reservedTime', 'седем и половина след обяд', '19:30'],
  ['reservedTime', '7 и 1/2 вечерта', '19:30'],
  ['reservedTime', '8 без ¼ вечерта', '19:45'],
  ['reservedTime', '19:30, 19:30', '19:30'],
  ['reservedTime', 'седем, не, осем вечерта', '20:00'],
  ['guestCount', 'трима', '3'],
  ['guestCount', '3човека', '3'],
  ['guestCount', 'Колко човека? Трима човека', '3'],
  ['guestCount', 'Брой гости: двадесет и двама', '22'],
  ['guestCount', 'двама възрастни и две деца', '4'],
  ['guestCount', 'не трима, а четирима', '4'],
  ['guestCount', 'четиридесет', '40'],
  ['guestCount', '3 човека. 3 човека.', '3'],
  ['guestCount', 'двама възрастни и 2 деца', '4'],
  ['email', 'georgi.ivanov@example.com', 'georgi.ivanov@example.com'],
  ['email', 'georgi маймунка gmail точка com', 'georgi@gmail.com'],
  ['email', 'Имейлът е georgi кльомба example точка bg', 'georgi@example.bg'],
  ['email', 'georgi маймунка джимейл точка ком', 'georgi@gmail.com'],
  ['email', 'georgi собака абв точка бг', 'georgi@abv.bg'],
  ['email', 'georgi точка ivanov маймунка джи мейл точка ком', 'georgi.ivanov@gmail.com'],
  ['email', 'georgi долна черта ivanov маймунка а б в точка бг', 'georgi_ivanov@abv.bg'],
  ['email', 'georgi тире ivanov собака абв точка бг', 'georgi-ivanov@abv.bg'],
  ['email', 'Ivan+reservations@Gmail.com', 'ivan+reservations@gmail.com'],
  ['email', 'at.dash@example.com', 'at.dash@example.com'],
  ['email', 'georgi.ivanov.maimunka.gmail.com', 'georgi.ivanov@gmail.com'],
  ['email', 'georgi.ivanov maimunka gmail.com', 'georgi.ivanov@gmail.com'],
  ['email', 'georgi.ivanov . MAIMUNKA . gmail.com', 'georgi.ivanov@gmail.com'],
  ['email', 'georgi maimunka джимейл точка ком', 'georgi@gmail.com'],
  ['email', 'georgi.maimunka@gmail.com', 'georgi.maimunka@gmail.com'],
  ['email', 'georgi@maimunka.gmail.com', 'georgi@maimunka.gmail.com'],
  ['email', 'ivan@gmail.com, поправка: petar@gmail.com', 'petar@gmail.com'],
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
  ['guestName', 'Георги Иванов. Иван Петров.', 'name'],
  ['guestName', 'поръчах пица, поправка: Георги Петров', 'name'],
  ['guestName', 'Абонирайте се!', 'name'],
  ['guestName', 'Субтитри Георги Иванов', 'name'],
  ['guestName', 'Благодаря за гледането, абонирайте се', 'name'],
  ['phone', 'нула осем осем осем', 'phone'],
  ['phone', '08956', 'phone'],
  ['phone', '089 56 12', 'phone'],
  ['phone', '088812345', 'phone'],
  ['phone', '+35988812345', 'phone'],
  ['phone', '08812345067', 'phone'],
  ['phone', '089 56 12 46 15', 'phone'],
  ['phone', 'нула осемдесет и девет петдесет и шест дванадесет четиридесет и шест петнадесет', 'phone'],
  ['phone', '+3598881234567', 'phone'],
  ['phone', 'нула осем осем едно две три четири петстотин шест седем', 'phone'],
  ['phone', 'нула осемстотин осем един един два', 'phone'],
  ['phone', 'нула осемстотин деветстотин деветстотин едно', 'phone'],
  ['phone', 'плюс триста петдесет и девет осем осем осем двеста тридесет и четири', 'phone'],
  ['phone', '0', 'phone'],
  ['phone', '1234567890123456', 'phone'],
  ['phone', '0888123456 или 0899123456', 'phone'],
  ['phone', '0888123456 не съм сигурен', 'phone'],
  ['phone', '0888123456 за утре', 'phone'],
  ['phone', 'Георги Иванов', 'phone'],
  ['phone', '0888123456, 0899123456', 'phone'],
  ['reservedDate', '8.11.2026', 'date'],
  ['reservedDate', '31.11.2026', 'date'],
  ['reservedDate', 'утре или вдругиден', 'date'],
  ['reservedDate', 'утре ще ти звънна', 'date'],
  ['reservedDate', 'не разбрах', 'date'],
  ['reservedDate', 'час 10:00', 'date'],
  ['reservedDate', 'утре, вдругиден', 'date'],
  ['reservedDate', 'на 31-ви ноември', 'date'],
  ['reservedTime', '24:00', 'time'],
  ['reservedTime', '19:60', 'time'],
  ['reservedTime', 'седем или осем', 'time'],
  ['reservedTime', 'десет ябълки', 'time'],
  ['reservedTime', 'трима човека', 'time'],
  ['reservedTime', 'утре', 'time'],
  ['reservedTime', '19:30, 20:30', 'time'],
  ['reservedTime', '19,60', 'time'],
  ['reservedTime', '7,5', 'time'],
  ['guestCount', 'нула', 'guests'],
  ['guestCount', '41', 'guests'],
  ['guestCount', 'три ябълки', 'guests'],
  ['guestCount', 'трима или четирима', 'guests'],
  ['guestCount', 'трима човека утре', 'guests'],
  ['guestCount', 'в 10:00', 'guests'],
  ['guestCount', 'не съм сигурен', 'guests'],
  ['guestCount', 'поръчах пица, не, четирима', 'guests'],
  ['guestCount', 'трима, четирима', 'guests'],
  ['guestCount', 'три и половина', 'guests'],
  ['guestCount', '2.5', 'guests'],
  ['guestCount', '2,5', 'guests'],
  ['guestCount', '2,2', 'guests'],
  ['guestCount', '3, 3 човека', 'guests'],
  ['guestCount', '2 1/2', 'guests'],
  ['email', 'georgi gmail com', 'email'],
  ['email', 'георги маймунка джимейл точка ком', 'email'],
  ['email', '.georgi@example.com', 'email'],
  ['email', 'georgi..ivanov@example.com', 'email'],
  ['email', 'georgi@example', 'email'],
  ['email', 'georgi@gmail.com или ivan@gmail.com', 'email'],
  ['email', 'ivan petrov@gmail.com', 'email'],
  ['email', 'ivan@gmail.com for tomorrow', 'email'],
  ['email', 'ivan маймунка джимейл', 'email'],
  ['email', 'georgi.ivanov.maimanka.gmail.com', 'email'],
  ['email', 'георги.иванов.maimunka.gmail.com', 'email'],
  ['email', 'georgi.maimunka.gmail', 'email'],
  ['email', 'georgi.maimunka.maimunka.gmail.com', 'email'],
  ['email', 'georgi.maimunka.gmail.maimunka', 'email'],
  ['email', 'georgi..maimunka.gmail.com', 'email'],
  ['email', 'georgi.maimunka..gmail.com', 'email'],
  ['email', 'georgi maimunka@gmail.com', 'email'],
  ['email', 'ivan@gmail.com, petar@gmail.com', 'email'],
  ['email', `${'a'.repeat(65)}@gmail.com`, 'email'],
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
  ['ru-RU', 'email', 'ivan собака example точка com', 'ivan@example.com'],
];
for (const [language, field, transcript, value] of otherLanguages) {
  test(`single-field ${language} ${field}: ${transcript}`, () => {
    assert.deepEqual(parseVoiceReservationField(field, transcript, now, { language }), { value, issue: null });
  });
}

test('unsupported fields cannot produce a value', () => {
  assert.deepEqual(parseVoiceReservationField('tableIds', 'пет', now), { value: null, issue: 'field' });
});
