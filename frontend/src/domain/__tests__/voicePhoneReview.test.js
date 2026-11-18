import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVoicePhoneReview, parseVoiceReservationField } from '../reservations/voiceReservationField.js';

const complete = [
  ['0888.12.34.56', '0888123456'],
  ['0.8.8.8.1.2.3.4.5.6', '0888123456'],
  ['0888/12/34/56', '0888123456'],
  ['0888–12–34–56', '0888123456'],
  ['+359.888.12.34.56', '+359888123456'],
  ['+359.895.12.46.15', '+359895124615'],
  ['+8801812345678', '+8801812345678'],
  ['Телефончето е нула осем осем три нули две единици две двойки', '0880001122'],
  ['нула осем осем тройна нула едно едно две две', '0880001122'],
  ['нула осем осем три пъти нула едно едно две две', '0880001122'],
  ['нула осем осем 3 пъти 0 едно едно две две', '0880001122'],
  ['нула двойно осем тройно нула двойно едно двойно две', '0880001122'],
  ['нула осем осем нула нула нула единица единица двойка двойка', '0880001122'],
  ['нула осем две осмици дванайсет трийсет и четири петдесет и шест', '0888123456'],
  ['0888.12.34.56. 0888.12.34.56.', '0888123456'],
  ['0888123456, не, 0899123456', '0899123456'],
];

for (const [utterance, expected] of complete) {
  test(`phone accepts explicit notation without guessing: ${utterance}`, () => {
    assert.deepEqual(parseVoiceReservationField('phone', utterance), { value: expected, issue: null });
    assert.equal(extractVoicePhoneReview(utterance), expected);
  });
}

const drafts = [
  // Observed native Zipformer holdout: the recognizer omitted one or more zeros.
  ['нула осем седем един два три нула', '0871230'],
  ['нула осем осем един един два', '088112'],
  ['нула осем осем два четири шест осем два четири', '088246824'],
  // The user's earlier grouped example has eleven digits. Keep all eleven;
  // deleting the sixth digit would invent a different guest contact.
  ['089 56 12 46 15', '08956124615'],
  ['нула осемдесет и девет петдесет и шест дванадесет четиридесет и шест петнадесет', '08956124615'],
  ['+359 888 12 34 5', '+35988812345'],
  ['0888.12.34.5', '088812345'],
  ['088', '088'],
  // Observed WebKit AAC/PCM capture: do not accept a dropped leading zero as
  // a complete number, and do not guess it back into the contact automatically.
  ['895124615', '895124615'],
  ['осем девет пет едно две четири шест едно пет', '895124615'],
  ['881234567', '881234567'],
  ['871234567', '871234567'],
];

for (const [utterance, expected] of drafts) {
  test(`incomplete phone stays a review-only draft: ${utterance}`, () => {
    assert.equal(extractVoicePhoneReview(utterance), expected);
    assert.deepEqual(parseVoiceReservationField('phone', utterance), { value: null, issue: 'phone' });
    assert.deepEqual(parseVoiceReservationField('phone', expected), { value: null, issue: 'phone' });
  });
}

const unsafe = [
  '', 'нула', 'нула осем', 'Георги Иванов',
  '088112 или 088113', '088112 не съм сигурен',
  '088112 за утре', '088112 час 19:00', '088112 19:00',
  '088112 име Георги', '088112 и още нещо',
  '0888123456, 0899123456', '0888123456, не, 0899123',
  '08.12.2026', '08/12/2026',
  'нула осемстотин осем един един два',
  'нула осем деветстотин деветдесет девет',
  'нула осем осем два пъти дванадесет',
  '088112345678901234',
];

for (const utterance of unsafe) {
  test(`phone review refuses unsafe extraction: ${utterance || '(empty)'}`, () => {
    assert.equal(extractVoicePhoneReview(utterance), null);
  });
}

test('Bulgarian phone notation does not reinterpret names or another recognition language', () => {
  assert.deepEqual(parseVoiceReservationField('guestName', 'Георги Иванов'), { value: 'Георги Иванов', issue: null });
  assert.equal(extractVoicePhoneReview('нула осем осем три нули две единици две двойки', { language: 'en-US' }), null);
  assert.equal(extractVoicePhoneReview('zero eight eight eight one two three four five six', { language: 'en-US' }), '0888123456');
});
