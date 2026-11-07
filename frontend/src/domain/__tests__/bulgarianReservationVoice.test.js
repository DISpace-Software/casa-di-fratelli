import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceReservation } from '../reservations/voiceReservation.js';
import { normalizeBulgarianReservationTranscript } from '../reservations/bulgarianReservationVoice.js';

const now = new Date('2026-11-07T18:00:00Z');
const parse = (text, time = now) => parseVoiceReservation(text, time, { language: 'bg-BG' });

test('Bulgarian natural booking request fills all fields across speech pauses', () => {
  const chunks = [
    'Здравейте, бих искал резервация на името на Иван Петров.',
    'Телефонът ми е нула осем осем осем.',
    'Дванадесет тридесет и четири петдесет и шест.',
    'За утре в седем и половина вечерта.',
    'Ще бъдем шестима.',
  ];
  assert.deepEqual(parse(chunks[0]).fields, { guestName: 'Иван Петров' });
  assert.equal(parse(chunks.slice(0, 2).join(' ')).fields.phone, undefined);
  assert.deepEqual(parse(chunks.join(' ')), {
    fields: { guestName: 'Иван Петров', phone: '0888123456', reservedDate: '2026-11-08', reservedTime: '19:30', guestCount: '6' },
    issues: [], missing: [],
  });
});

test('Bulgarian name and phone labels support everyday wording without rewriting names', () => {
  const result = parse('Името ми е Мария Николова-Петрова. Номер за връзка 0898123456. Дата утре. Часът е деветнадесет и петнадесет. За четирима човека.');
  assert.deepEqual(result.fields, { guestName: 'Мария Николова-Петрова', phone: '0898123456', reservedDate: '2026-11-08', reservedTime: '19:15', guestCount: '4' });
  assert.equal(parse('Резервацията е на името на Борис Иванов.').fields.guestName, 'Борис Иванов');
});

test('labeled Bulgarian phone groups preserve zeros and explicit international prefixes', () => {
  assert.equal(parse('Телефон нула осем осем осем, дванадесет, тридесет и четири, петдесет и шест.').fields.phone, '0888123456');
  assert.equal(parse('Мобилният ми номер е плюс триста петдесет и девет осемстотин осемдесет и осем сто двадесет и три четиристотин петдесет и шест.').fields.phone, '+359888123456');
  assert.equal(parse('Телефон нула осемдесет и осем осемстотин двадесет и три четиристотин петдесет и шест.').fields.phone, '088823456');
  assert.equal(parse('Телефон 0888 012 003.').fields.phone, '0888012003');
  assert.deepEqual(parse('Телефон нула осем осем.').fields, {});
});

test('guest counts and dates following a phone never become extra phone digits', () => {
  assert.deepEqual(parse('Телефон 0888123456. Шестима.').fields, { phone: '0888123456', guestCount: '6' });
  assert.deepEqual(parse('Телефон 0888123456 шест души.').fields, { phone: '0888123456', guestCount: '6' });
  assert.equal(parse('Телефон 0888123456. Дата 12 ноември.').fields.phone, '0888123456');
});

test('Bulgarian collective counts and colloquial tens work in booking phrases', () => {
  for (const [text, count] of [['Маса за двама.', '2'], ['За трима.', '3'], ['За четирима човека.', '4'], ['Ще бъдем шестима.', '6'], ['Гости двайсет и двама.', '22'], ['За трийсет и двама човека.', '32'], ['Брой на гости четирийсет.', '40']]) {
    assert.deepEqual(parse(text).fields, { guestCount: count }, text);
  }
  assert.ok(parse('Гости четирийсет и един.').issues.includes('guests'));
});

test('explicit adult and child counts add up to the reservation party size', () => {
  assert.deepEqual(parse('Маса за четири възрастни и две деца.').fields, { guestCount: '6' });
  assert.deepEqual(parse('Гости двама възрастни и едно дете.').fields, { guestCount: '3' });
});

test('Bulgarian colloquial clocks use the spoken daypart and do not assume evening', () => {
  for (const [text, time] of [
    ['В седем и половина вечерта.', '19:30'],
    ['Часът е осем без четвърт вечерта.', '19:45'],
    ['В осем без петнайсет вечерта.', '19:45'],
    ['В седем и четвърт сутринта.', '07:15'],
    ['Часът е деветнайсет и петнайсет.', '19:15'],
    ['В двайсет и три и петнайсет.', '23:15'],
    ['От 19:30.', '19:30'],
    ['В седем и половина.', '07:30'],
  ]) assert.equal(parse(text).fields.reservedTime, time, text);
  assert.ok(parse('Часът е двадесет и пет и деветдесет.').issues.includes('time'));
});

test('ordinal Bulgarian dates retain explicit year and do not roll past dates forward', () => {
  assert.equal(parse('За дванадесети ноември.').fields.reservedDate, '2026-11-12');
  assert.equal(parse('Дата двайсет и първи ноември 2026.').fields.reservedDate, '2026-11-21');
  assert.equal(parse('Дата тридесет и първи декември 2026.').fields.reservedDate, '2026-12-31');
  assert.equal(parse('Дата първи януари.').fields.reservedDate, undefined);
  assert.ok(parse('Дата тридесет и първи ноември.').issues.includes('date'));
});

test('weekdays use the next Sofia occurrence and explicit next excludes today', () => {
  assert.equal(parse('За събота.').fields.reservedDate, '2026-11-07');
  assert.equal(parse('За следващата събота.').fields.reservedDate, '2026-11-14');
  assert.equal(parse('За петък в седем и петнайсет вечерта, ще бъдем шестима.').fields.reservedDate, '2026-11-13');
  const late = new Date('2026-11-07T23:30:00Z');
  assert.equal(parse('За неделя.', late).fields.reservedDate, '2026-11-08');
  assert.equal(parse('За следващата неделя.', late).fields.reservedDate, '2026-11-15');
  assert.equal(parse('За тази вечер в седем и половина вечерта.').fields.reservedDate, '2026-11-07');
  assert.deepEqual(parse('Маса за двама в седем и половина вечерта в петък.').fields, { reservedDate: '2026-11-13', reservedTime: '19:30', guestCount: '2' });
});

test('Bulgarian explicit corrections replace earlier values while chatter is ignored', () => {
  const result = parse('Името ми е Иван Петров. Телефон 0888123456. Дата утре. Часът е седем и половина вечерта. Ще бъдем шестима. Петър, утре ще се чуем. Донеси две кафета. Не, дата понеделник. Часът е осем без четвърт вечерта. Гости четирима.');
  assert.deepEqual(result.fields, { guestName: 'Иван Петров', phone: '0888123456', reservedDate: '2026-11-09', reservedTime: '19:45', guestCount: '4' });
  assert.deepEqual(result.issues, []);
});

test('unrelated Bulgarian conversation does not establish booking fields', () => {
  for (const text of [
    'Купи кафе за двама.', 'Купих билети за двама.', 'Ние сме шестима в офиса.', 'Вчера бяхме шестима.',
    'Отивам на кино тази вечер.', 'Ще се видим тази вечер.', 'В седем вечерта гледам телевизия.',
    'Утре в седем вечерта гледам телевизия.', 'Аз утре в седем гледам мач.', 'В петък доставят шест стола.',
    'В петък работя до седем.', 'Телефонът ми звъни, изчакай.', 'Утре ще ти звънна.',
    'Петър, утре ще се чуем. Донеси две кафета. Благодаря, приятна вечер.',
  ]) {
    const result = parse(text);
    assert.deepEqual(result.fields, {}, text);
    assert.deepEqual(result.issues, [], text);
  }
});

test('Bulgarian normalization is opt-in and leaves Russian and English modes intact', () => {
  const text = 'Името ми е Мария. Ще бъдем шестима.';
  for (const language of ['ru-RU', 'en-GB']) assert.deepEqual(parseVoiceReservation(text, now, { language }), parseVoiceReservation(text, now));
  assert.equal(parseVoiceReservation(text, now, { language: 'bg' }).fields.guestCount, '6');
  assert.equal(typeof normalizeBulgarianReservationTranscript(undefined, now), 'string');
});

test('Bulgarian diminutives and administrator questions retain the field across pauses', () => {
  for (const label of ['Телефонче', 'Телефончето', 'Номерче', 'Номерчето', 'Телефон за връзка']) {
    assert.equal(parse(`${label} 0888123456.`).fields.phone, '0888123456', label);
  }
  const text = 'На чие име да запиша? Секундичка. Да, Иван Петров. Може ли едно телефонче? Секунда. Ето го: нула осем осем осем. Дванадесет тридесет и четири петдесет и шест. Кой ден? Утре. За колко часа? В седем и половина вечерта. Колко души ще бъдете? Шестима.';
  assert.deepEqual(parse(text).fields, { guestName: 'Иван Петров', phone: '0888123456', reservedDate: '2026-11-08', reservedTime: '19:30', guestCount: '6' });
  for (const prompt of ['На чие име?', 'Може ли едно телефонче?', 'За коя дата?', 'За колко часа?', 'Колко души ще бъдете?']) assert.deepEqual(parse(prompt).fields, {}, prompt);
});

test('Bulgarian explicit correction scope replaces only the intended reservation field', () => {
  assert.equal(parse('Часът не е седем, а осем вечерта.').fields.reservedTime, '20:00');
  assert.equal(parse('Име не Иван, а Петър Иванов.').fields.guestName, 'Петър Иванов');
  assert.equal(parse('Телефон не 0888123456, а 0899123456.').fields.phone, '0899123456');
  assert.equal(parse('Гости шест. Не шестима, а осем души.').fields.guestCount, '8');
  assert.equal(parse('Гости шест. Не, осем.').fields.guestCount, '6');
  assert.equal(parse('Запишете резервацията на името на Мария Николова.').fields.guestName, 'Мария Николова');
});

test('a correction cannot consume a neighboring labeled field', () => {
  assert.deepEqual(parse('Име Иван Петров, телефон 0888123456, не, 0898123456.').fields, { guestName: 'Иван Петров', phone: '0898123456' });
  assert.deepEqual(parse('Име Иван Петров, час седем, не, осем вечерта.').fields, { guestName: 'Иван Петров', reservedTime: '20:00' });
  assert.deepEqual(parse('Име Иван Петров, телефон не 0888123456, а 0898123456.').fields, { guestName: 'Иван Петров', phone: '0898123456' });
});

test('alternatives require review instead of silently selecting a booking value', () => {
  for (const [text, issue] of [
    ['Телефонче 0888123456 или 0898123456, не съм сигурен.', 'phone'],
    ['Час седем или осем вечерта, още уточняваме.', 'time'],
    ['Дата петък или събота, още не знаем.', 'date'],
    ['Ще бъдем шестима или осмина, още уточняваме.', 'guests'],
  ]) {
    assert.deepEqual(parse(text).fields, {}, text);
    assert.deepEqual(parse(text).issues, [issue], text);
  }
  assert.deepEqual(parse('Телефон 0888123456. Телефонче 0898123456 или 0877123456, не съм сигурен.').fields, {});
  assert.deepEqual(parse('Име Иван Петров, дата петък или събота, още не знаем. Гости шест.').fields, { guestName: 'Иван Петров', guestCount: '6' });
});

test('unanswered name questions and reservation prepositions do not become guest names', () => {
  for (const answer of ['Още не знам.', 'Трябва да попитам.', 'Нека първо уточним.', 'Трябва да проверя.', 'Нека помисля.', 'Нямам идея.', 'Забравих фамилията.']) assert.deepEqual(parse(`На чие име да бъде? ${answer}`).fields, {}, answer);
  assert.deepEqual(parse('За утре. Донеси две кафета.').fields, { reservedDate: '2026-11-08' });
  assert.deepEqual(parse('Датата е петък. Корекция: За понеделник.').fields, { reservedDate: '2026-11-09' });
});
