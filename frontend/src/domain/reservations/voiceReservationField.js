import { normalizeBulgarianReservationTranscript } from './bulgarianReservationVoice.js';
import { parseVoiceReservation } from './voiceReservation.js';

const labels = { guestName: 'име', phone: 'телефон', reservedDate: 'дата', reservedTime: 'час', guestCount: 'гости' };
const issues = { guestName: 'name', phone: 'phone', reservedDate: 'date', reservedTime: 'time', guestCount: 'guests', email: 'email' };
const edgePunctuation = /^[\s,.;:!?—-]+|[\s,.;:!?—-]+$/gu;
const filler = '(?:здравейте|здравей|да|добре|окей|ами|значи|моля|благодаря(?: ви)?|само|ето|поправка|корекция|хорошо|пожалуйста|спасибо|okay|ok|please|thanks|thank you)';
const opening = new RegExp(`^${filler}(?![\\p{L}@])[\\s,.;:!?—-]*`, 'iu');
const closing = new RegExp(`[\\s,.;:!?—-]+${filler}[\\s,.;:!?—-]*$`, 'iu');
const introductions = {
  guestName: /^(?:на (?:чие|кое)(?: име)?(?: да (?:е|бъде)| е)?(?: резервацията)?|(?:на )?името(?: ми)?(?: е| на)?|на името на|име(?: на гост)?(?: е)?|казвам се|на имя|меня зовут|имя|my name is|(?:guest )?name(?: is)?)(?!\p{L})[\s,.;:!?—-]*/iu,
  phone: /^(?:(?:може ли )?(?:един |едно )?)?(?:телефонче(?:то)?|номерче(?:то)?|телефон(?:ът|а|ният номер|ен номер|ный номер)?|номер(?:ът)?(?: за връзка| телефона)?|мобилен (?:телефон|номер)|phone(?: number)?)(?!\p{L})(?:\s+(?:ми|ви|за връзка))?(?:\s+(?:е|is))?[\s,.;:!?—-]*/iu,
  reservedDate: /^(?:за (?:кога|коя дата)|коя дата|датата(?: е)?|дата(?: е)?|date(?: is)?|за|на|on|for)(?!\p{L})[\s,.;:!?—-]*/iu,
  reservedTime: /^(?:за колко часа|в колко(?: часа)?|часът(?: е)?|час(?: е)?|время|time(?: is)?|в|от|за|at)(?!\p{L})[\s,.;:!?—-]*/iu,
  guestCount: /^(?:(?:за )?колко (?:души|човека|хора|гости)(?: ще бъдете)?|брой(?: на)?(?: гости|хора)?|гостите(?: ще)? са|гости(?: са)?|ще (?:бъдем|сме)|(?:ние )?сме|количество (?:гостей|людей)|нас(?: будет)?|гостей|guests(?: are)?|people|we are|there will be|за|for)(?!\p{L})[\s,.;:!?—-]*/iu,
  email: /^(?:имейл(?:ът|а)?(?: е)?|електронна поща|email(?: address)?(?: is)?|e-mail|почта)(?!\p{L})[\s,.;:!?—-]*/iu,
};
const uncertain = /(?<!\p{L})(?:или|or|може би|не съм сигур(?:ен|на)|не знам|не знаю|не уверен|maybe|not sure|don't know)(?!\p{L})/iu;
const numberWords = 'нула|ноль|нуль|zero|oh|едно|един|една|один|одна|one|две|два|двама|двое|two|три|трима|трое|three|четири|четирима|четыре|four|пет|петима|пять|five|шест|шестима|шесть|six|седем|семь|seven|осем|восемь|eight|девет|девять|nine|десет|десять|ten|единадесет|одиннадцать|eleven|дванадесет|двенадцать|twelve|тринадесет|тринадцать|thirteen|четиринадесет|четырнадцать|fourteen|петнадесет|пятнадцать|fifteen|шестнадесет|шестнадцать|sixteen|седемнадесет|семнадцать|seventeen|осемнадесет|восемнадцать|eighteen|деветнадесет|девятнадцать|nineteen|двадесет|двадцать|twenty|тридесет|тридцать|thirty|четиридесет|сорок|forty|петдесет|пятьдесят|fifty';
const number = `(?:\\d+|(?:${numberWords})(?:\\s+(?:(?:и|and)\\s+)?(?:${numberWords}))?)`;
const month = '(?:януари|января|january|февруари|февраля|february|март|марта|march|април|апреля|april|май|мая|may|юни|июня|june|юли|июля|july|август|августа|august|септември|сентября|september|октомври|октября|october|ноември|ноября|november|декември|декабря|december)';
const dateShape = new RegExp(`^(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./]\\d{1,2}(?:[./]\\d{4})?|днес|утре|вдругиден|сегодня|завтра|послезавтра|today|tomorrow|day after tomorrow|${number}\\s+${month}(?:\\s+\\d{4})?)$`, 'iu');
const foreignShapes = {
  phone: new RegExp(`^(?:\\+|plus\\s+|плюс\\s+)?(?:\\d+|${numberWords})(?:[\\s().-]+(?:\\d+|${numberWords}))*$`, 'iu'),
  reservedTime: new RegExp(`^(?:\\d{1,2}[:.]\\d{2}|${number}(?:\\s+(?:(?:часа|часов|час|hours?|o'clock)\\s*)?(?:(?:и|and)\\s+)?(?:${number}|половиной|половина|half))?)(?:\\s+(?:часа|часов|час|hours?|o'clock))?(?:\\s*(?:вечера|вечерта|вечер|следобед|утра|сутринта|сутрин|am|pm|a\\.m\\.|p\\.m\\.))?$`, 'iu'),
  guestCount: new RegExp(`^${number}(?:\\s+(?:души|душ|хора|човека|човек|гости|гостей|человека|человек|people|guests))?$`, 'iu'),
};

function cleanValue(field, transcript) {
  let value = String(transcript || '').replace(/\s+/gu, ' ').trim();
  const edges = field === 'email' ? /^[\s,;:!?—]+|[\s,.;:!?—]+$/gu : edgePunctuation;
  // Trim only complete conversational words at the edges: Добрев and names
  // containing similar syllables must retain their spelling and capitalization.
  let previous;
  do {
    previous = value;
    value = value.replace(edges, '').replace(opening, '').replace(closing, '')
      .replace(introductions[field], '').trim();
  } while (value !== previous);
  if (field === 'guestCount') value = value.replace(/(\d)(?=\p{L})/gu, '$1 ');
  return value;
}

function parseEmail(value) {
  const email = value.replace(/(?<!\p{L})(?:маймунка|кльомба|at)(?!\p{L})/giu, '@')
    .replace(/(?<!\p{L})(?:точка|dot)(?!\p{L})/giu, '.')
    .replace(/\s+/gu, '').toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(email)
    && !email.startsWith('.') && !email.includes('..') && !email.includes('.@') ? email : null;
}

/** Parse a short utterance addressed to one field. It never returns a patch for
 * another field, and rejects extra conversation instead of guessing its value. */
export function parseVoiceReservationField(field, transcript, now = new Date(), { language = 'bg-BG' } = {}) {
  const issue = issues[field] || 'field';
  const failure = { value: null, issue };
  if (!Object.hasOwn(issues, field)) return failure;
  const value = cleanValue(field, transcript);
  if (!value || uncertain.test(value)) return failure;
  if (field === 'email') {
    const email = parseEmail(value);
    return email ? { value: email, issue: null } : failure;
  }

  const bulgarian = language === 'bg' || language === 'bg-BG';
  const labelled = `${labels[field]} ${value}`;
  const normalized = bulgarian ? normalizeBulgarianReservationTranscript(labelled, now) : labelled;
  const body = normalized.slice(labels[field].length).replace(edgePunctuation, '');
  const parsed = parseVoiceReservation(labelled, now, { language });
  const result = parsed.fields[field];
  if (!result || parsed.issues.includes(issue)) return failure;
  // Keep short 087/088/089 dictation fragments out of the form while the
  // remaining digits arrive. Other numbers retain the shared length checks.
  if (bulgarian && field === 'phone' && ((/^08[789]/u.test(result) && result.length < 10)
    || (/^\+3598[789]/u.test(result) && result.length < 13))) return failure;

  if (field === 'guestName') {
    // The shared parser may stop at a second field or chatter. A field dictation
    // must consist of the complete name, not a name found inside a conversation.
    const noise = /(?<!\p{L})(?:слушам|слушаме|секунда|момент|няма|нямам|трябва|още|нека|разговор|говорим|кажете|не|да|съм|си|е|ли|само|днес|утре|вчера|tomorrow|today|wait|hello|hi)(?!\p{L})/iu;
    if (result !== value || noise.test(value)) return failure;
  } else if (field === 'reservedDate') {
    if (!dateShape.test(body)) return failure;
  } else if (bulgarian) {
    const shape = field === 'phone' ? /^\+?\d{7,15}$/u
      : field === 'reservedTime' ? /^\d{2}:\d{2}$/u : /^\d{1,2}$/u;
    if (!normalized.startsWith(`${labels[field]} `) || !shape.test(body)) return failure;
  } else if (!foreignShapes[field].test(value)) return failure;
  return { value: result, issue: null };
}
