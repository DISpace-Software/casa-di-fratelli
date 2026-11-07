// Synthetic Bulgarian transcripts, not recordings. Expected values are declared
// here from booking facts; this fixture never imports or runs the parser.
export const corpusNow = '2026-11-07T18:00:00Z';
export const bookingKeys = ['guestName', 'phone', 'reservedDate', 'reservedTime', 'guestCount'];

const names = ['Иван Петров', 'Мария Николова', 'Георги Димитров', 'Елена Стоянова', 'Борис Иванов', 'Даниела Тодорова', 'Петър Георгиев', 'Радина Василева', 'Николай Колев', 'Силвия Попова', 'Александър Маринов', 'Мария Николова-Петрова'];
const phones = [
  ['0888123456', '0888123456'],
  ['0898 234 567', '0898234567'],
  ['0877-345-678', '0877345678'],
  ['+359 888 123 456', '+359888123456'],
  ['нула осем осем осем едно две три четири пет шест', '0888123456'],
  ['нула осем девет осем две три четири пет шест седем', '0898234567'],
  ['нула осем осем осем, дванадесет, тридесет и четири, петдесет и шест', '0888123456'],
  ['0888 012 003', '0888012003'],
  ['нула осем осем осем нула едно две нула нула три', '0888012003'],
  ['плюс триста петдесет и девет осемстотин осемдесет и осем сто двадесет и три четиристотин петдесет и шест', '+359888123456'],
];
const dates = [
  ['утре', '2026-11-08'], ['вдругиден', '2026-11-09'], ['днес', '2026-11-07'],
  ['12.11.2026', '2026-11-12'], ['2026-11-21', '2026-11-21'], ['15/11/2026', '2026-11-15'],
  ['дванадесети ноември', '2026-11-12'], ['двайсет и първи ноември', '2026-11-21'],
  ['понеделник', '2026-11-09'], ['петък', '2026-11-13'], ['следващата събота', '2026-11-14'],
  ['тридесет и първи декември 2026', '2026-12-31'], ['първи януари 2027', '2027-01-01'],
];
const times = [
  ['19:30', '19:30'], ['деветнадесет и петнадесет', '19:15'], ['седем и половина вечерта', '19:30'],
  ['осем без четвърт вечерта', '19:45'], ['седем и четвърт сутринта', '07:15'],
  ['двайсет и три и петнайсет', '23:15'], ['осем без петнайсет вечерта', '19:45'],
  ['дванадесет на обяд', '12:00'], ['шест следобед', '18:00'], ['20.30', '20:30'],
  ['седем и половина', '07:30'], ['двайсет и трийсет', '20:30'],
];
const counts = [
  ['двама', '2'], ['трима', '3'], ['четирима', '4'], ['шестима', '6'], ['осмина', '8'],
  ['двайсет и двама', '22'], ['трийсет и двама', '32'], ['четирийсет', '40'], ['един', '1'],
  ['четири възрастни и две деца', '6'], ['двама възрастни и едно дете', '3'], ['дванайсет', '12'],
];
const nameLabels = ['Име', 'На името на', 'Името ми е', 'Резервацията е на името на', 'Запиши на', 'На чие име?'];
const phoneLabels = ['Телефон', 'Телефонче', 'Телефончето е', 'Номерче', 'Номер за връзка', 'Телефонът ми е', 'Мобилният ми номер е', 'Едно телефонче?', 'Може ли телефон за връзка?'];
const dateLabels = ['Дата', 'Датата е', 'За', 'За коя дата?', 'Кой ден?'];
const timeLabels = ['Час', 'Часът е', 'В', 'От', 'За колко часа?'];
const countLabels = ['Гости', 'Ще бъдем', 'Ще сме', 'Брой на гости', 'Колко души ще бъдете?'];
const orders = [[0, 1, 2, 3, 4], [2, 3, 4, 0, 1], [0, 4, 2, 3, 1], [1, 0, 2, 4, 3], [4, 3, 2, 1, 0], [3, 2, 0, 1, 4]];
const introductions = ['', 'Здравейте. ', 'Добър ден. ', 'Бих искал резервация. ', 'Моля, запазете ни маса. ', 'За резервацията. '];
const endings = ['', ' Благодаря.', ' Благодаря, приятна вечер.', ' Добре, до скоро.', ' Моля, потвърдете резервацията.'];
const unrelated = [
  'Петър, затвори вратата.', 'Донеси две кафета.', 'Касовият код е 12345678.',
  'Утре ще ти звънна.', 'В петък доставят шест стола.', 'В седем вечерта гледам телевизия.',
  'Купих билети за двама.', 'Ние сме шестима в офиса.', 'Телефонът ми звъни, изчакай.',
  'Отивам на кино тази вечер.', 'Вчера бяхме шестима.', 'Изчакай, проверявам нещо.',
  'Сметката е двайсет и три лева.', 'Поръчката е за четири кафета.', 'Мария, отвори прозореца.',
];

function facts(index) {
  const name = names[index % names.length];
  const phone = phones[(index * 3 + Math.floor(index / 10)) % phones.length];
  const date = dates[(index * 5 + Math.floor(index / 13)) % dates.length];
  const time = times[(index * 7 + Math.floor(index / 12)) % times.length];
  const count = counts[(index * 5 + Math.floor(index / 12)) % counts.length];
  return { name, phone, date, time, count, fields: { guestName: name, phone: phone[1], reservedDate: date[1], reservedTime: time[1], guestCount: count[1] } };
}

function clauses(data, index, questions = true) {
  const parts = [
    `${nameLabels[index % (questions ? nameLabels.length : 5)]} ${data.name}`,
    `${phoneLabels[(index * 2 + 1) % (questions ? phoneLabels.length : 7)]} ${data.phone[0]}`,
    `${dateLabels[index % (questions ? dateLabels.length : 3)]} ${data.date[0]}`,
    `${timeLabels[(index + 1) % (questions ? timeLabels.length : 4)]} ${data.time[0]}`,
    `${countLabels[(index * 3 + 2) % (questions ? countLabels.length : 4)]} ${data.count[0]}`,
  ];
  // Hesitations happen after a spoken admin question as well as between fields.
  return parts.map((part, fieldIndex) => part.includes('?') && (index + fieldIndex) % 3 === 0
    ? part.replace('? ', `? ${['Секунда. Да, ето: ', 'Секундичка. Да, ', 'Изчакайте. '][index % 3]}`) : part);
}

const corpus = [];
function add(category, transcript, fields, options = {}) {
  corpus.push({ id: `${category}-${String(corpus.filter(item => item.category === category).length + 1).padStart(3, '0')}`, category, transcript, now: corpusNow, expected: { fields, issues: [], missing: bookingKeys.filter(key => !fields[key]) }, ...options });
}

// 300 complete bookings: independent combinations of field order, question/
// answer labels, phone grouping, ordinal/relative dates, clocks and party sizes.
for (let i = 0; i < 300; i++) {
  const data = facts(i), parts = clauses(data, i), order = orders[Math.floor(i / 7) % orders.length];
  const separator = i % 4 === 0 ? '; ' : '. ';
  add('complete', introductions[i % introductions.length] + order.map(index => parts[index]).join(separator) + '.' + endings[Math.floor(i / 6) % endings.length], data.fields);
}

// 150 streams, with expectations after EACH final speech fragment. This tests
// accumulation rather than merely parsing a fully dictated first name.
for (let i = 0; i < 150; i++) {
  const data = facts(i + 300), order = orders[i % orders.length], parts = clauses(data, i, false);
  const noPunctuation = i % 3 === 0;
  const fragments = order.map(index => parts[index] + (noPunctuation ? '' : '.'));
  const fields = {}, steps = fragments.map((_, index) => {
    const key = bookingKeys[order[index]]; fields[key] = data.fields[key];
    return { transcript: fragments.slice(0, index + 1).join(' '), fields: { ...fields } };
  });
  add('stream', fragments.join(' '), data.fields, { fragments, steps });
}

// 100 explicitly corrected bookings: all five fields, valid-to-valid and
// invalid-to-valid corrections. Later explicit answers are authoritative.
for (let i = 0; i < 100; i++) {
  const before = facts(i + 450), after = facts(i + 451), fieldIndex = i % 5, key = bookingKeys[fieldIndex];
  const initial = clauses(before, i, false);
  if (i % 2 === 0) initial[fieldIndex] = ['Име Иван', 'Телефон 123', 'Дата 31.11.2026', 'Час 25:90', 'Гости 41'][fieldIndex];
  const correction = clauses(after, i + 1, false)[fieldIndex];
  const prefixes = ['Не, ', 'Поправка: ', 'Извинете, ', 'Всъщност, ', 'Корекция: '];
  add('correction', initial.join('. ') + '. ' + unrelated[i % unrelated.length] + ' ' + prefixes[Math.floor(i / 5) % prefixes.length] + correction + '.', { ...before.fields, [key]: after.fields[key] });
}

// 75 pure irrelevant conversations and 75 booking conversations interrupted by
// irrelevant numeric/date/name chatter. None uses real customer information.
for (let i = 0; i < 75; i++) {
  const first = unrelated[i % unrelated.length], second = unrelated[(i * 7 + 3) % unrelated.length];
  add('noise', introductions[Math.floor(i / 15) % introductions.length] + first + ' ' + second + endings[Math.floor(i / 15) % endings.length], {});
}
for (let i = 0; i < 75; i++) {
  const data = facts(i + 550), parts = clauses(data, i, false);
  add('noise', unrelated[i % unrelated.length] + ' ' + parts.slice(0, 2).join('. ') + '. ' + unrelated[(i * 7 + 4) % unrelated.length] + ' ' + parts.slice(2).join('. ') + '. ' + endings[i % endings.length], data.fields);
}

const invalid = [
  ['Телефон 123', 'phone'], ['Телефон 1234567890123456', 'phone'],
  ['Дата 31.11.2026', 'date'], ['Дата 29.02.2027', 'date'], ['Дата 06.11.2026', 'date'],
  ['Час 24:00', 'time'], ['Час 19:60', 'time'], ['Час двайсет и пет и трийсет', 'time'],
  ['Гости нула', 'guests'], ['Гости четирийсет и един', 'guests'],
];
for (let i = 0; i < 60; i++) {
  const [phrase, issue] = invalid[i % invalid.length];
  const name = names[Math.floor(i / 10)];
  const fields = i % 2 ? { guestName: name } : {};
  add('invalid-ambiguous', `${i % 2 ? `Име ${name}. ` : introductions[Math.floor(i / 10) % introductions.length]}${phrase}. ${unrelated[Math.floor(i / 10)]}`, fields, { expected: { fields, issues: [issue], missing: bookingKeys.filter(key => !fields[key]) } });
}
const unanswered = ['На чие име да бъде?', 'Може ли едно телефонче?', 'За коя дата желаете?', 'За колко часа да запиша?', 'Колко души ще бъдете?'];
for (let i = 0; i < 20; i++) {
  const phrase = unanswered[i % unanswered.length];
  add('invalid-ambiguous', `${introductions[Math.floor(i / 5)]}${phrase} ${['Изчакайте, ще проверя.', 'Още не знам.', 'Трябва да попитам.', 'Нека първо уточним.'][Math.floor(i / 5)]}`, {});
}
const alternatives = [
  ['Телефонче 0888123456 или 0898123456, не съм сигурен', 'phone'],
  ['Час седем или осем вечерта, не съм сигурен', 'time'],
  ['Дата петък или събота, още не знаем', 'date'],
  ['Ще бъдем шестима или осмина, още уточняваме', 'guests'],
];
for (let i = 0; i < 20; i++) {
  const [phrase, issue] = alternatives[i % alternatives.length];
  add('invalid-ambiguous', `${introductions[Math.floor(i / 4)]}${phrase}. ${unrelated[Math.floor(i / 4)]}`, {}, { expected: { fields: {}, issues: [issue], missing: [...bookingKeys] } });
}

// 100 partial requests: missing fields stay missing; date/time/party fragments
// must not invent a customer name or borrow unrelated numeric contact data.
const partialSets = [[0], [1], [2], [3], [4], [0, 1], [2, 3], [2, 4], [0, 3, 4], [1, 2, 3, 4]];
for (let i = 0; i < 100; i++) {
  const data = facts(i + 700), parts = clauses(data, i), selected = partialSets[i % partialSets.length];
  const fields = Object.fromEntries(selected.map(index => [bookingKeys[index], data.fields[bookingKeys[index]]]));
  add('partial', selected.map(index => parts[index]).join('. ') + '. ' + unrelated[Math.floor(i / 10)], fields);
}

// Fixed answers around Sofia's midnight, leap days, month/year ends, guest and
// phone length limits. Calendar facts below are literal independently specified
// values, never computed using the parsing implementation.
const boundaryFacts = [
  ['2026-12-31T21:00:00Z', 'Дата утре', { reservedDate: '2027-01-01' }, []],
  ['2026-12-31T22:30:00Z', 'Дата днес', { reservedDate: '2027-01-01' }, []],
  ['2026-11-07T23:30:00Z', 'Дата днес', { reservedDate: '2026-11-08' }, []],
  ['2026-11-07T21:59:00Z', 'Дата днес', { reservedDate: '2026-11-07' }, []],
  ['2028-02-28T12:00:00Z', 'Дата утре', { reservedDate: '2028-02-29' }, []],
  ['2028-02-29T12:00:00Z', 'Дата утре', { reservedDate: '2028-03-01' }, []],
  ['2027-02-28T12:00:00Z', 'Дата утре', { reservedDate: '2027-03-01' }, []],
  ['2026-11-30T12:00:00Z', 'Дата вдругиден', { reservedDate: '2026-12-02' }, []],
  [corpusNow, 'Гости един', { guestCount: '1' }, []],
  [corpusNow, 'Брой на гости четирийсет', { guestCount: '40' }, []],
  [corpusNow, 'Гости четирийсет и един', {}, ['guests']],
  [corpusNow, 'Час нула', { reservedTime: '00:00' }, []],
  [corpusNow, 'Час 23:59', { reservedTime: '23:59' }, []],
  [corpusNow, 'Час 24:00', {}, ['time']],
  [corpusNow, 'Телефон 0123456', { phone: '0123456' }, []],
  [corpusNow, 'Телефон +123456789012345', { phone: '+123456789012345' }, []],
  [corpusNow, 'Телефон 012345', {}, ['phone']],
  [corpusNow, 'Телефон 1234567890123456', {}, ['phone']],
  [corpusNow, 'Дата следващата събота', { reservedDate: '2026-11-14' }, []],
  [corpusNow, 'Дата събота', { reservedDate: '2026-11-07' }, []],
];
for (let i = 0; i < 100; i++) {
  const [now, phrase, fields, issues] = boundaryFacts[i % boundaryFacts.length];
  const variant = Math.floor(i / boundaryFacts.length);
  const prefix = ['', 'За резервацията. ', 'Здравейте. ', 'Моля. ', 'Добре. '][variant];
  add('boundary', prefix + phrase + '. ' + unrelated[(variant * 3 + i) % unrelated.length], fields, { now, expected: { fields, issues, missing: bookingKeys.filter(key => !fields[key]) } });
}

export const bulgarianVoiceConversations = corpus;
export const corpusCategories = { complete: 300, stream: 150, correction: 100, noise: 150, 'invalid-ambiguous': 100, partial: 100, boundary: 100 };
