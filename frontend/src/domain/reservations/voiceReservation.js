// Extract booking facts from a reviewed transcript. This is a text parser, not a
// speaker filter: unsupported or ambiguous speech stays available for review.
import { normalizeBulgarianReservationTranscript } from './bulgarianReservationVoice.js';

const numbers = {
  нула: 0, ноль: 0, нуль: 0, zero: 0, oh: 0, едно: 1, един: 1, один: 1, одна: 1, one: 1,
  две: 2, два: 2, двама: 2, двое: 2, two: 2, три: 3, трима: 3, трое: 3, three: 3,
  четири: 4, четирима: 4, четыре: 4, four: 4, пет: 5, петима: 5, пять: 5, five: 5,
  шест: 6, шестима: 6, шесть: 6, six: 6, седем: 7, семь: 7, seven: 7,
  осем: 8, восемь: 8, eight: 8, девет: 9, девять: 9, nine: 9,
  десет: 10, десять: 10, ten: 10, единадесет: 11, одиннадцать: 11, eleven: 11,
  дванадесет: 12, двенадцать: 12, twelve: 12, тринадесет: 13, тринадцать: 13, thirteen: 13,
  четиринадесет: 14, четырнадцать: 14, fourteen: 14, петнадесет: 15, пятнадцать: 15, fifteen: 15,
  шестнадесет: 16, шестнадцать: 16, sixteen: 16, седемнадесет: 17, семнадцать: 17, seventeen: 17,
  осемнадесет: 18, восемнадцать: 18, eighteen: 18, деветнадесет: 19, девятнадцать: 19, nineteen: 19,
  двадесет: 20, двадцать: 20, twenty: 20, тридесет: 30, тридцать: 30, thirty: 30,
  четиридесет: 40, сорок: 40, forty: 40, петдесет: 50, пятьдесят: 50, fifty: 50,
};
const months = {
  януари: 1, января: 1, january: 1, февруари: 2, февраля: 2, february: 2,
  март: 3, марта: 3, march: 3, април: 4, апреля: 4, april: 4,
  май: 5, мая: 5, may: 5, юни: 6, июня: 6, june: 6,
  юли: 7, июля: 7, july: 7, август: 8, августа: 8, august: 8,
  септември: 9, сентября: 9, september: 9, октомври: 10, октября: 10, october: 10,
  ноември: 11, ноября: 11, november: 11, декември: 12, декабря: 12, december: 12,
};
const wordBoundary = '(?![\\p{L}\\d])';
const numberAtom = `(?:\\d+|${Object.keys(numbers).sort((a, b) => b.length - a.length).join('|')})${wordBoundary}`;
const numberStart = new RegExp(`^(${numberAtom})`, 'iu');
const numberAnywhere = new RegExp(`(?<![\\p{L}\\d])${numberAtom}`, 'giu');
const phoneLabel = '(?:телефон(?:ен номер|ный номер)?|номер(?:\\s+телефона)?|phone(?:\\s+number)?)';
const nameLabel = '(?:на името(?: на)?|на имя|име(?: на гост)?|имя|меня зовут|казвам се|my name is|(?:guest\\s+)?name)';
const dateLabel = '(?:дата|датата|date)';
const timeLabel = '(?:часът|час|время|time)';
const guestLabel = '(?:брой(?:\\s+(?:гости|хора))?|количество\\s+(?:гостей|людей)|гости|гостей|guests|people)';
const guestUnit = '(?:души|душ|хора|гости|гостей|человека|человек|people|guests)';
const relativeDate = '(?:послезавтра|вдругиден|day after tomorrow|завтра|утре|tomorrow|сегодня|днес|today)';
const fieldStop = new RegExp(`[,;!?\\n]|(?<!\\d)\\.|\\s+(?:${phoneLabel}|${dateLabel}|${timeLabel}|${guestLabel}|${relativeDate}|за|на|в|at|for|on)${wordBoundary}|\\s+\\d`, 'iu');
// Common conversational words are intentionally not accepted as names. A real
// name containing one of these can still be entered in the ordinary name field.
const chatter = /(?<!\p{L})(?:добрый|доброе|день|вечер|утро|здравейте|здравей|привет|алло|ало|hello|hi|good|morning|afternoon|evening|спасибо|благодаря|thanks|thank|пожалуйста|моля|please|подождите|подожди|чакай|изчакай|wait|секунда|минутку|хорошо|добре|okay|ok|да|нет|не|no|yes|сейчас|сега|now|посмотрю|виж|смотри|виждам|слышишь|чуеш|я|мы|мне|меня|это|этот|как|ще|щехме|щех|ама|ако|имаме|искам|искаме|можно|нужно|хочу|резервация|резервацию|бронь|reservation|booking|до|встречи|чао|bye|just|you|i|we|can|would|like|the|a|is|are)(?!\p{L})/iu;

function readNumber(source) {
  const first = numberStart.exec(source);
  if (!first) return null;
  const value = /^\d+$/.test(first[1]) ? Number(first[1]) : numbers[first[1].toLowerCase()];
  const join = /^\s+(?:(?:и|and)\s+)?/iu.exec(source.slice(first[0].length));
  const second = join && numberStart.exec(source.slice(first[0].length + join[0].length));
  const unit = second && (/^\d+$/.test(second[1]) ? Number(second[1]) : numbers[second[1].toLowerCase()]);
  if (value >= 20 && value % 10 === 0 && unit > 0 && unit < 10) {
    return { value: value + unit, length: first[0].length + join[0].length + second[0].length };
  }
  return { value, length: first[0].length };
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? date.toISOString().slice(0, 10) : null;
}

function readTime(source) {
  const numeric = /^(\d{1,2})[:.](\d{2})(?!\d|[./]\d)/u.exec(source);
  let hour, minute = 0, length;
  if (numeric) {
    hour = Number(numeric[1]); minute = Number(numeric[2]); length = numeric[0].length;
  } else {
    const first = readNumber(source);
    if (!first) return null;
    hour = first.value; length = first.length;
    const separator = /^\s+(?:(?:часа|часов|час|hours?|o'clock)\s*)?(?:(?:и|and)\s+)?/iu.exec(source.slice(length));
    if (separator) {
      const remainder = source.slice(length + separator[0].length);
      const half = /^(?:половина|половиной|half)(?!\p{L})/iu.exec(remainder);
      const next = readNumber(remainder);
      const unit = next && new RegExp(`^\\s+${guestUnit}${wordBoundary}`, 'iu').exec(remainder.slice(next.length));
      const nextIsGuestCount = unit && !readNumber(remainder.slice(next.length + unit[0].length).trimStart()) && !/(?:и|and)\s+$/iu.test(separator[0]);
      // A number followed by a guest unit belongs to the next field.
      if (half) { minute = 30; length += separator[0].length + half[0].length; }
      else if (next && !nextIsGuestCount) {
        minute = next.value; length += separator[0].length + next.length;
      }
    }
  }
  const suffix = /^\s*(?:(?:часа|часов|час|hours?|o'clock|минути|минут|minutes?)\s*)?(вечера|вечерта|вечер|следобед|pm|p\.m\.|утра|сутринта|сутрин|am|a\.m\.)?(?!\p{L})/iu.exec(source.slice(length));
  if (suffix?.[1]) {
    const evening = /^(?:веч|следобед|p)/iu.test(suffix[1]);
    if (hour >= 1 && hour <= 12) hour = evening ? (hour % 12) + 12 : hour % 12;
    length += suffix[0].length;
  }
  return { hour, minute, length };
}

export function parseVoiceReservation(transcript, now = new Date(), { language } = {}) {
  const source = language === 'bg' || language === 'bg-BG'
    ? normalizeBulgarianReservationTranscript(transcript, now) : transcript;
  const text = String(source || '').replace(/\s+/g, ' ').trim();
  const fields = {}, issues = new Set(), spans = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  function assign(key, value, issue) {
    delete fields[key];
    if (value !== null && value !== undefined) { fields[key] = String(value); issues.delete(issue); }
    else issues.add(issue);
  }
  function remember(start, end) { spans.push([start, end]); }
  function maskedBefore(index) {
    const masked = text.slice(0, index).split('');
    for (const [start, end] of spans) for (let i = start; i < Math.min(end, masked.length); i++) masked[i] = ' ';
    return masked.join('').split(/[!?;]|(?<!\d)[.,]|[.,](?!\d)/u).at(-1).trim();
  }
  function bookingPrefix(index) {
    return /^(?:(?:резервация|резервацию|резервацията|бронь|брониране|reservation|booking|book|table|искам|искаме|хочу|хотим|направи|создай|моля|пожалуйста|please|за|на|в|for|on|at|и|and|a|the)\s*)*$/iu.test(maskedBefore(index));
  }
  function usableName(raw) {
    const end = raw.search(fieldStop);
    let name = (end < 0 ? raw : raw.slice(0, end)).trim().replace(/[.,:]+$/g, '');
    const noise = chatter.exec(name);
    if (noise) name = name.slice(0, noise.index).trim();
    const fieldWords = new RegExp(`(?<!\\p{L})(?:${phoneLabel}|${dateLabel}|${timeLabel}|${guestLabel}|${guestUnit}|${relativeDate})${wordBoundary}`, 'iu');
    return /^[\p{L}][\p{L}'’ -]{1,79}$/u.test(name) && !fieldWords.test(name) && name.split(/\s+/).length <= 4 && !name.split(/\s+/).some(word => numbers[word.toLowerCase()] !== undefined)
      ? name : null;
  }

  // Explicit labels can occur anywhere in the conversation. Repeated labels
  // are processed in speech order, making a later correction win.
  const explicitNames = [...text.matchAll(new RegExp(`(?<!\\p{L})${nameLabel}${wordBoundary}\\s*(?:(?:е|is)\\s+)?[:—-]?\\s*`, 'giu'))];
  if (explicitNames.length) {
    for (const match of explicitNames) {
      const start = match.index + match[0].length, name = usableName(text.slice(start));
      if (name) { fields.guestName = name; remember(match.index, start + name.length); }
    }
  } else {
    const name = usableName(text);
    // An unlabelled fallback is deliberately narrower than an explicit name:
    // ordinary sentence fragments must not establish a person's identity.
    const followingField = name && new RegExp(`^[\\s,;:.—-]*(?:${phoneLabel}|${dateLabel}|${timeLabel}|${guestLabel}|${relativeDate}|\\+?\\d)${wordBoundary}`, 'iu').test(text.slice(name.length));
    if (name && followingField && name.split(/\s+/).every(word => /^\p{Lu}[\p{L}'’-]*$/u.test(word))) {
      fields.guestName = name; remember(0, name.length);
    }
  }

  const phoneMatches = [...text.matchAll(new RegExp(`(?<!\\p{L})${phoneLabel}${wordBoundary}\\s*(?:(?:е|is)\\s+)?[:—-]?\\s*`, 'giu'))];
  for (const match of phoneMatches) {
    const start = match.index + match[0].length;
    const source = text.slice(start);
    const plus = /^(?:\+|плюс\s+|plus\s+)/iu.exec(source);
    let cursor = plus?.[0].length || 0, digits = '';
    while (cursor < source.length) {
      const separator = /^[\s()-]*/u.exec(source.slice(cursor))[0];
      const token = numberStart.exec(source.slice(cursor + separator.length));
      if (!token) break;
      const tail = source.slice(cursor + separator.length + token[0].length);
      if (digits && (new RegExp(`^\\s+${guestUnit}${wordBoundary}`, 'iu').test(tail) || /^[:.]\d/u.test(tail))) break;
      const value = /^\d+$/.test(token[1]) ? token[1] : String(numbers[token[1].toLowerCase()]);
      digits += value; cursor += separator.length + token[0].length;
      if (digits.length > 15) break;
    }
    const phone = `${plus ? '+' : ''}${digits}`;
    assign('phone', /^\+?\d{7,15}$/u.test(phone) ? phone : null, 'phone');
    remember(match.index, start + cursor);
  }
  if (!phoneMatches.length) {
    for (const match of text.matchAll(/(?<![\p{L}\d])\+?\d[\d ()-]{6,}\d(?!\d)/gu)) {
      if (/^\d{4}-\d{2}-\d{2}$/u.test(match[0]) || !bookingPrefix(match.index)) continue;
      const phone = match[0].replace(/[ ()-]/g, '');
      if (/^\+?\d{7,15}$/u.test(phone)) { fields.phone = phone; remember(match.index, match.index + match[0].length); }
    }
  }

  const namedDate = `${numberAtom}(?:\\s+(?:(?:и|and)\\s+)?${numberAtom})?\\s+(?:${Object.keys(months).join('|')})(?:\\s+\\d{4})?`;
  const dateExpression = new RegExp(`(?<![\\p{L}\\d])(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./]\\d{1,2}(?:[./]\\d{4})?|${namedDate}|${relativeDate})${wordBoundary}`, 'giu');
  for (const match of text.matchAll(dateExpression)) {
    const prefix = text.slice(0, match.index);
    const label = new RegExp(`${dateLabel}${wordBoundary}\\s*(?:(?:е|is)\\s+)?[:—-]?\\s*(?:(?:за|на|for|on)\\s+)?$`, 'iu').exec(prefix);
    if (!label && (!bookingPrefix(match.index) || new RegExp(`(?:${timeLabel}|в|at)\\s*$`, 'iu').test(prefix))) continue;
    const value = match[0].toLowerCase();
    let date = null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
    const local = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/u.exec(value);
    const relative = new RegExp(`^${relativeDate}$`, 'iu').test(value);
    if (iso) date = validDate(iso[1], iso[2], iso[3]);
    else if (local) date = validDate(local[3] || today.slice(0, 4), local[2], local[1]);
    else if (relative) {
      // "Tomorrow I'll call you" is conversation, while "tomorrow at 7" or a
      // standalone date fragment can be reservation data.
      const after = text.slice(match.index + match[0].length);
      if (!label && !new RegExp(`^(?:\\s*$|\\s*[,.;!?]|\\s+(?:в|at|${timeLabel}|${guestLabel}|${numberAtom})${wordBoundary})`, 'iu').test(after)) continue;
      const days = ['послезавтра', 'вдругиден', 'day after tomorrow'].includes(value) ? 2 : ['завтра', 'утре', 'tomorrow'].includes(value) ? 1 : 0;
      const shifted = new Date(today + 'T12:00:00Z'); shifted.setUTCDate(shifted.getUTCDate() + days); date = shifted.toISOString().slice(0, 10);
    } else {
      const day = readNumber(value), rest = value.slice(day.length).trim().split(/\s+/);
      date = validDate(rest[1] || today.slice(0, 4), months[rest[0]], day.value);
    }
    assign('reservedDate', date && date >= today ? date : null, 'date');
    remember(label ? prefix.length - label[0].length : match.index, match.index + match[0].length);
  }

  const timeCandidates = [];
  for (const match of text.matchAll(new RegExp(`(?<!\\p{L})(?:${timeLabel}|в|at)${wordBoundary}\\s*(?:(?:е|is)\\s+)?[:—-]?\\s*`, 'giu'))) {
    const explicit = new RegExp(`^${timeLabel}${wordBoundary}`, 'iu').test(match[0]);
    if (!explicit && !bookingPrefix(match.index)) continue;
    timeCandidates.push({ index: match.index, start: match.index + match[0].length });
  }
  for (const match of text.matchAll(/(?<!\d)\d{1,2}:\d{2}(?!\d)/gu)) {
    if (bookingPrefix(match.index) && !timeCandidates.some(candidate => candidate.start === match.index)) timeCandidates.push({ index: match.index, start: match.index });
  }
  for (const candidate of timeCandidates.sort((a, b) => a.index - b.index)) {
    const time = readTime(text.slice(candidate.start));
    if (!time) continue;
    const value = time.hour >= 0 && time.hour <= 23 && time.minute >= 0 && time.minute <= 59
      ? `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : null;
    assign('reservedTime', value, 'time'); remember(candidate.index, candidate.start + time.length);
  }

  const guestCandidates = [];
  for (const match of text.matchAll(new RegExp(`(?<!\\p{L})${guestLabel}${wordBoundary}\\s*(?:(?:будет|ще са|са|е|is|are)\\s+)?[:—-]?\\s*`, 'giu'))) {
    const count = readNumber(text.slice(match.index + match[0].length));
    if (count) guestCandidates.push({ index: match.index, count: count.value });
  }
  for (const match of text.matchAll(numberAnywhere)) {
    const count = readNumber(text.slice(match.index));
    if (!new RegExp(`^\\s+${guestUnit}${wordBoundary}`, 'iu').test(text.slice(match.index + count.length))) continue;
    const prefix = maskedBefore(match.index);
    if (!bookingPrefix(match.index) && !/^(?:(?:за|на|for)\s+)?(?:(?:нас(?:\s+будет)?|будем|будет|ще сме|сме|we are|there will be)\s*)?$/iu.test(prefix)) continue;
    guestCandidates.push({ index: match.index, count: count.value });
  }
  for (const candidate of guestCandidates.sort((a, b) => a.index - b.index)) {
    assign('guestCount', Number.isInteger(candidate.count) && candidate.count >= 1 && candidate.count <= 40 ? candidate.count : null, 'guests');
  }
  return { fields, issues: [...issues], missing: ['guestName', 'phone', 'reservedDate', 'reservedTime', 'guestCount'].filter(key => !fields[key]) };
}
