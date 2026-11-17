import { normalizeBulgarianReservationTranscript } from './bulgarianReservationVoice.js';
import { parseVoiceReservation } from './voiceReservation.js';

const labels = { guestName: 'име', phone: 'телефон', reservedDate: 'дата', reservedTime: 'час', guestCount: 'гости' };
const issues = { guestName: 'name', phone: 'phone', reservedDate: 'date', reservedTime: 'time', guestCount: 'guests', email: 'email' };
const edgePunctuation = /^[\s,.;:!?—-]+|[\s,.;:!?—-]+$/gu;
const filler = '(?:здравейте|здравей|да|добре|окей|ами|значи|моля|благодаря(?: ви)?|само|ето|поправка|корекция|извинете|момент|секундичка|секунда|хорошо|пожалуйста|спасибо|okay|ok|please|thanks|thank you)';
const opening = new RegExp(`^${filler}(?![\\p{L}@])[\\s,.;:!?—-]*`, 'iu');
const closing = new RegExp(`[\\s,.;:!?—-]+${filler}[\\s,.;:!?—-]*$`, 'iu');
const introductions = {
  guestName: /^(?:на (?:чие|кое)(?: име)?(?: да (?:е|бъде)| е)?(?: резервацията)?|(?:на )?името(?: ми)?(?: е| на)?|на името на|име(?: на гост)?(?: е)?|казвам се|на имя|меня зовут|имя|my name is|(?:guest )?name(?: is)?)(?!\p{L})[\s,.;:!?—-]*/iu,
  phone: /^(?:(?:може ли )?(?:един |едно )?)?(?:телефонче(?:то)?|номерче(?:то)?|телефон(?:ът|а|ният номер|ен номер|ный номер)?|номер(?:ът)?(?: за връзка| телефона)?|мобилен (?:телефон|номер)|phone(?: number)?)(?!\p{L})(?:\s+(?:ми|ви|за връзка))?(?:\s+(?:е|is))?[\s,.;:!?—-]*/iu,
  reservedDate: /^(?:за (?:кога|коя дата)|коя дата|датата(?: е)?|дата(?: е)?|date(?: is)?|за|на|във|в|on|for)(?!\p{L})[\s,.;:!?—-]*/iu,
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

function validEmail(email) {
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(email)
    && email.split('@')[0].length <= 64 && !email.startsWith('.') && !email.includes('..') && !email.includes('.@');
}

function parseEmail(value, bulgarian) {
  // Literal contacts may themselves contain words such as "at" or "dash".
  // Speech substitutions must never change an already complete address.
  const literal = value.toLowerCase();
  if (validEmail(literal)) return literal;
  let email = literal;
  if (bulgarian && !email.includes('@')) {
    // Whisper can render the explicitly spoken @ marker as a Latin word with
    // dots around it. Accept exactly one marker; never guess a similar spelling.
    const parts = email.split(/(?:^|(?<=[.\s]))maimunka(?=[.\s]|$)/u);
    if (parts.length > 2) return null;
    if (parts.length === 2) {
      email = `${parts[0].replace(/\s*\.?\s*$/u, '')}@${parts[1].replace(/^\s*\.?\s*/u, '')}`;
    }
  }
  email = email.replace(/(?<!\p{L})(?:маймунка|кльомба|собака|at)(?!\p{L})/giu, '@')
    .replace(/(?<!\p{L})(?:точка|dot)(?!\p{L})/giu, '.')
    .replace(/(?<!\p{L})(?:долна черта|подчертавка|underscore)(?!\p{L})/giu, '_')
    .replace(/(?<!\p{L})(?:тире|dash|hyphen)(?!\p{L})/giu, '-')
    .toLowerCase();
  if (bulgarian) {
    // These are explicit spoken domain names, not guesses about the guest's
    // identity. Never transliterate a Cyrillic local-part or supply a missing TLD.
    email = email.replace(/(@\s*)(?:джимейл|джи[ -]?мейл)(?=\s*\.)/gu, '$1gmail')
      .replace(/(@\s*)(?:абв|а\s+б\s+в)(?=\s*\.)/gu, '$1abv')
      .replace(/(\.[\s]*)(ком|бг|нет|орг)\s*$/gu, (_whole, separator, tld) => `${separator}${{ ком: 'com', бг: 'bg', нет: 'net', орг: 'org' }[tld]}`);
  }
  // Removing all spaces would invent contacts: "ivan petrov@gmail.com" or
  // "ivan@gmail.com for tomorrow" must not become plausible new addresses.
  email = email.replace(/\s*([@._+-])\s*/gu, '$1').trim();
  return validEmail(email) ? email : null;
}

function normalizeFieldNotation(field, value) {
  if (field === 'reservedDate') {
    return value.replace(/^(\d{1,2})-(?:ви|ри|ти)(?=\s+\p{L})/iu, '$1')
      .replace(/(\d{4})\s*г(?:одина)?\.?$/iu, '$1');
  }
  if (field === 'reservedTime') {
    return value.replace(/(?<!\p{L})след обяд(?!\p{L})/giu, 'следобед')
      .replace(/^(\d{1,2}),\s*(\d{2})(?=\s|$)/u, '$1:$2')
      .replace(/(\s(?:и|без)\s+)(?:1\/2|½)(?=\s|$)/gu, '$1половина')
      .replace(/(\s(?:и|без)\s+)(?:1\/4|¼)(?=\s|$)/gu, '$1четвърт');
  }
  return value;
}

function parseCompleteField(field, transcript, now, language) {
  const issue = issues[field] || 'field';
  const failure = { value: null, issue };
  if (!Object.hasOwn(issues, field)) return failure;
  const bulgarian = language === 'bg' || language === 'bg-BG';
  const cleaned = cleanValue(field, transcript);
  const value = bulgarian ? normalizeFieldNotation(field, cleaned) : cleaned;
  if (!value || uncertain.test(value)) return failure;
  if (bulgarian && field === 'phone') {
    // Actual short-clip ASR confused "осем" with "осемстотин", creating
    // plausible 080… contacts. Ask for digits rather than inventing a grouping.
    // Preserve the explicitly spoken Bulgarian international country code.
    const subscriber = value.replace(/^плюс\s+триста\s+(?:и\s+)?петдесет\s+(?:и\s+)?девет\s+/iu, '');
    if (/(?<!\p{L})(?:сто|двеста|триста|четиристотин|петстотин|шестстотин|седемстотин|осемстотин|деветстотин|хиляда|хиляди)(?!\p{L})/iu.test(subscriber)) return failure;
  }
  // A decimal headcount is invalid even when its two digits happen to match;
  // it must not be mistaken for an identical read-back ("2,2" -> "2").
  if (field === 'guestCount' && /^\d+\s*[.,]\s*\d+(?:\s+\p{L}+)?$/u.test(value)) return failure;
  if (field === 'email') {
    const email = parseEmail(value, bulgarian);
    return email ? { value: email, issue: null } : failure;
  }

  const labelled = `${labels[field]} ${value}`;
  const normalized = bulgarian ? normalizeBulgarianReservationTranscript(labelled, now) : labelled;
  const body = normalized.slice(labels[field].length).replace(edgePunctuation, '');
  const parsed = parseVoiceReservation(labelled, now, { language });
  const result = parsed.fields[field];
  if (!result || parsed.issues.includes(issue)) return failure;
  // Bulgarian 87/88/89 mobile numbers have nine national significant digits.
  // Reject missing AND extra digits: ASR can turn "пет" into "петстотин".
  // Other/international prefixes retain the shared checks; never trim a number.
  if (bulgarian && field === 'phone' && ((/^08[789]/u.test(result) && result.length !== 10)
    || (/^\+3598[789]/u.test(result) && result.length !== 13))) return failure;

  if (field === 'guestName') {
    // The shared parser may stop at a second field or chatter. A field dictation
    // must consist of the complete name, not a name found inside a conversation.
    const noise = /(?<!\p{L})(?:слушам|слушаме|секунда|момент|няма|нямам|трябва|още|нека|разговор|говорим|кажете|поръчах|поръчайте|сметката|менюто|не|да|съм|си|е|ли|само|днес|утре|вчера|tomorrow|today|wait|hello|hi)(?!\p{L})/iu;
    // Observed ASR failure on short clips: a video outro instead of speech.
    // Reject these phrases; capitalized words alone do not establish a name.
    const outro = /(?<!\p{L})(?:абонирайте|субтитри|гледахте|подписывайтесь|подпишитесь|субтитры|просмотр|subscribe|subtitles|watching)(?!\p{L})/iu;
    if (result !== value || noise.test(value) || outro.test(value)) return failure;
  } else if (field === 'reservedDate') {
    if (!dateShape.test(body)) return failure;
  } else if (bulgarian) {
    const shape = field === 'phone' ? /^\+?\d{7,15}$/u
      : field === 'reservedTime' ? /^\d{2}:\d{2}$/u : /^\d{1,2}$/u;
    if (!normalized.startsWith(`${labels[field]} `) || !shape.test(body)) return failure;
  } else if (!foreignShapes[field].test(value)) return failure;
  return { value: result, issue: null };
}

/** Parse a short utterance addressed to one field. It never returns a patch for
 * another field, and rejects extra conversation instead of guessing its value. */
export function parseVoiceReservationField(field, transcript, now = new Date(), { language = 'bg-BG' } = {}) {
  const failure = { value: null, issue: issues[field] || 'field' };
  if (!Object.hasOwn(issues, field)) return failure;
  const bulgarian = language === 'bg' || language === 'bg-BG';
  const cleaned = cleanValue(field, transcript);
  const value = bulgarian ? normalizeFieldNotation(field, cleaned) : cleaned;
  if (!value || uncertain.test(value)) return failure;
  if (field === 'guestCount' && /^\d+\s*[.,]\s*\d+(?:\s+\p{L}+)?$/u.test(value)) return failure;
  const parse = text => parseCompleteField(field, text, now, language);
  if (bulgarian) {
    // A correction needs two independently complete values and an explicit
    // correction marker. Chatter before "не" must not disappear into a value.
    const correction = /^не\s+(?:е\s+)?(.+?),?\s+а\s+(?:е\s+)?(.+)$/iu.exec(value)
      || /^(.+?)(?:[,;.!?]\s*не\s*[,;—-]\s*|(?:[,;.!?]\s*|\s+)(?:поправка|корекция)\s*[:—-]?\s*)(.+)$/iu.exec(value);
    if (correction) {
      const previous = parse(correction[1]), next = parse(correction[2]);
      return previous.value && next.value ? next : failure;
    }
    // Read-backs are common on the phone. Collapse only complete, equal values;
    // commas inside phone digit groups never pass as complete phone numbers.
    const repeated = value.split(/[,;!?]\s*|\.\s+/u);
    if (repeated.length > 1) {
      const answers = repeated.map(parse);
      if (answers.every(answer => answer.value && answer.value === answers[0].value)) return answers[0];
    }
  }
  return parse(value);
}
