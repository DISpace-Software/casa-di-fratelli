import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceReservation } from '../reservations/voiceReservation.js';

// Individually written synthetic dialogues. No case uses customer data and no
// expected value is derived from the implementation being examined.
const now = new Date('2026-11-07T18:00:00Z');
const complete = { guestName: 'Георги Иванов', phone: '0888123456', reservedDate: '2026-11-11', reservedTime: '10:00', guestCount: '3' };
const cases = [
  {
    id: 'reported-shape',
    text: 'здравейте здравейте да слушам слушаме Окей на чие да е резервацията Георги Иванов Добре добре за кога следващата сряда Окей Окей За колко човека трима трима човека добре може ли един телефон само да слушам Ви нула осем осем осем дванадесет тридесет и четири петдесет и шест благодаря За колко часа за 10:00 Окей Всичко е добре чао чао',
    fields: complete
  },
  {
    id: 'reported-numeric-phone',
    text: 'здравейте на чие да е резервацията Георги Иванов добре за кога следващата сряда за колко човека трима трима човека добре може ли един телефон само да слушам Ви 0888 123 456 благодаря за колко часа за 10:00 окей чао',
    fields: complete
  },
  {
    id: 'reordered-qa',
    text: 'ало добър ден за колко часа за 10:00 добре за колко човека трима за кога следващата сряда добре добре на чие да е резервацията Георги Иванов един телефон за връзка 0888 123 456 да благодаря',
    fields: complete
  },
  {
    id: 'same-shape-punctuation',
    text: 'Здравейте. На чие да е резервацията? Георги Иванов. Добре. За кога? Следващата сряда. За колко човека? Трима, трима човека. Може ли един телефон само? Да, слушам Ви. 0888 123 456. Благодаря. За колко часа? За 10:00. Окей, чао.',
    fields: complete
  },
  {
    id: 'spoken-phone-affirmations',
    text: 'на чие име Мария Николова добре телефонче нула осем осем осем да едно две три да четири пет шест добре за кога утре за колко часа в седем и половина вечерта добре колко души четирима',
    fields: { guestName: 'Мария Николова', phone: '0888123456', reservedDate: '2026-11-08', reservedTime: '19:30', guestCount: '4' }
  },
  {
    id: 'numeric-phone-affirmations',
    text: 'на чие име Борис Петров телефонче 0888 да 12 добре 34 да 56 добре за кога понеделник колко човека шестима за колко часа в 19:15 добре',
    fields: { guestName: 'Борис Петров', phone: '0888123456', reservedDate: '2026-11-09', reservedTime: '19:15', guestCount: '6' }
  },
  {
    id: 'named-time-spoken-date',
    text: 'добър вечер резервацията на чие име да бъде Елена Стоянова окей телефонът 0898 234 567 добре за коя дата дванадесети ноември добре колко души ще бъдете петима за колко часа осем без четвърт вечерта да благодаря',
    fields: { guestName: 'Елена Стоянова', phone: '0898234567', reservedDate: '2026-11-12', reservedTime: '19:45', guestCount: '5' }
  },
  {
    id: 'explicit-name-with-fillers',
    text: 'Име Радина Василева добре телефон 0888012003 окей дата утре добре час 20:00 окей гости шестима благодаря',
    fields: { guestName: 'Радина Василева', phone: '0888012003', reservedDate: '2026-11-08', reservedTime: '20:00', guestCount: '6' }
  },
  {
    id: 'awaiting-name',
    text: 'здравейте на чие да е резервацията секунда не знам още',
    fields: {}
  },
  {
    id: 'unanswered-name-next-fields',
    text: 'на чие да е резервацията секунда не знам още за кога утре за колко човека трима',
    fields: { reservedDate: '2026-11-08', guestCount: '3' }
  },
  {
    id: 'only-unanswered-prompts',
    text: 'на чие име ще бъде за кога за колко човека може ли един телефон за колко часа',
    fields: {}
  },
  {
    id: 'no-answer-after-name-question',
    text: 'добре на чие име да бъде момент ще попитам добре за кога петък',
    fields: { reservedDate: '2026-11-13' }
  },
  {
    id: 'phone-then-party',
    text: 'може ли един телефон само да слушам Ви 0888 123 456 добре за колко човека трима трима човека',
    fields: { phone: '0888123456', guestCount: '3' }
  },
  {
    id: 'party-confirmed-three-times',
    text: 'за колко човека трима да трима човека добре трима записвам',
    fields: { guestCount: '3' }
  },
  {
    id: 'party-and-children-once',
    text: 'за колко човека четири възрастни и две деца добре шест човека за колко часа за седем и половина вечерта',
    fields: { guestCount: '6', reservedTime: '19:30' }
  },
  {
    id: 'phone-read-back',
    text: 'може ли телефонче 0888123456 да 0888123456 точно така благодаря',
    fields: { phone: '0888123456' }
  },
  {
    id: 'international-phone',
    text: 'на чие да е резервацията Николай Колев добре телефонче плюс триста петдесет и девет осемстотин осемдесет и осем сто двадесет и три четиристотин петдесет и шест добре за кога утре за колко човека двама за колко часа за 21:00 окей',
    fields: { guestName: 'Николай Колев', phone: '+359888123456', reservedDate: '2026-11-08', reservedTime: '21:00', guestCount: '2' }
  },
  {
    id: 'clarified-name',
    text: 'на чие име Иван Петров не на името на Георги Иванов добре за кога утре',
    fields: { guestName: 'Георги Иванов', reservedDate: '2026-11-08' }
  },
  {
    id: 'unpunctuated-party-correction',
    text: 'на чие име Мария Николова за колко човека трима не гости четирима добре за колко часа за 19:30',
    fields: { guestName: 'Мария Николова', guestCount: '4', reservedTime: '19:30' }
  },
  {
    id: 'unrelated-sentence-after-fields',
    text: 'на чие име Борис Иванов добре дата утре час 19:30 добре Петър затвори вратата утре ще ти звънна благодаря',
    fields: { guestName: 'Борис Иванов', reservedDate: '2026-11-08', reservedTime: '19:30' }
  },
  {
    id: 'only-background-dialogue',
    text: 'здравейте да слушам слушаме окей добре Петър затвори вратата утре ще ти звънна трима сме в офиса добре чао чао',
    fields: {}
  },
  {
    id: 'phone-question-no-answer',
    text: 'може ли един телефон само да слушам Ви секунда ще проверя още не знам добре за кога утре',
    fields: { reservedDate: '2026-11-08' }
  },
  {
    id: 'uncertain-clock-before-other-answer',
    text: 'за колко часа седем или осем вечерта не съм сигурен добре за колко човека трима',
    fields: { guestCount: '3' },
    issues: ['time']
  },
  {
    id: 'uncertain-phone-before-other-answer',
    text: 'телефонче 0888123456 или 0898234567 не съм сигурен добре за колко човека двама',
    fields: { guestCount: '2' },
    issues: ['phone']
  },
];

for (const item of cases) {
  test(`Natural Bulgarian dialogue: ${item.id}`, () => {
    const result = parseVoiceReservation(item.text, now, { language: 'bg-BG' });
    assert.deepEqual(result.fields, item.fields);
    assert.deepEqual([...result.issues].sort(), [...(item.issues || [])].sort());
    assert.deepEqual(result.missing, ['guestName', 'phone', 'reservedDate', 'reservedTime', 'guestCount'].filter(key => !item.fields[key]));
  });
}
