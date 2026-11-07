// Only the Bulgarian recognition mode uses these conservative rewrites. We
// normalize booking phrases, not arbitrary conversation or people's names.
const units = { нула: 0, едно: 1, един: 1, една: 1, две: 2, два: 2, двама: 2, три: 3, трима: 3, четири: 4, четирима: 4, пет: 5, петима: 5, шест: 6, шестима: 6, седем: 7, седмина: 7, осем: 8, осмина: 8, девет: 9, деветима: 9 };
const tens = { десет: 10, единадесет: 11, единайсет: 11, дванадесет: 12, дванайсет: 12, тринадесет: 13, тринайсет: 13, четиринадесет: 14, четиринайсет: 14, петнадесет: 15, петнайсет: 15, шестнадесет: 16, шестнайсет: 16, седемнадесет: 17, седемнайсет: 17, осемнадесет: 18, осемнайсет: 18, деветнадесет: 19, деветнайсет: 19, двадесет: 20, двайсет: 20, тридесет: 30, трийсет: 30, четиридесет: 40, четирийсет: 40, петдесет: 50, шейсет: 60, шестдесет: 60, седемдесет: 70, осемдесет: 80, деветдесет: 90 };
const hundreds = { сто: 100, двеста: 200, триста: 300, четиристотин: 400, петстотин: 500, шестстотин: 600, седемстотин: 700, осемстотин: 800, деветстотин: 900 };
const values = { ...units, ...tens, ...hundreds };
const atom = new RegExp(`^(?:\\d+|${Object.keys(values).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\d])`, 'iu');
const guestUnit = '(?:души|душ|човека|човек|хора|гости|възрастни|възрастен|деца|дете)';
const endWord = '(?![\\p{L}\\d])';
const monthNames = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
const ordinalDays = { първи: 1, втори: 2, трети: 3, четвърти: 4, пети: 5, шести: 6, седми: 7, осми: 8, девети: 9, десети: 10, единадесети: 11, единайсети: 11, дванадесети: 12, дванайсети: 12, тринадесети: 13, тринайсети: 13, четиринадесети: 14, четиринайсети: 14, петнадесети: 15, петнайсети: 15, шестнадесети: 16, шестнайсети: 16, седемнадесети: 17, седемнайсети: 17, осемнадесети: 18, осемнайсети: 18, деветнадесети: 19, деветнайсети: 19, двадесети: 20, двайсети: 20, тридесети: 30, трийсети: 30 };
const weekdays = { неделя: 0, понеделник: 1, вторник: 2, сряда: 3, четвъртък: 4, петък: 5, събота: 6 };
const collective = '(?:двама|трима|четирима|петима|шестима|седмина|осмина|деветима)';
const phoneCue = '(?:телефонче(?:то)?|телефон(?:ът|а)?|номерче(?:то)?|мобил(?:ният|ния|ен)\\s+(?:(?:ми|ви)\\s+)?(?:номер|телефон)|номер(?:ът)?(?:\\s+(?:ми|ви))?\\s+за\\s+връзка|телефон(?:ният|ния|ен)\\s+(?:(?:ми|ви)\\s+)?номер)';
const dialogGap = '[\\s.,;:—!?-]*(?:(?:да|добре|ами|значи|моля|секунда|секундичка|момент|изчакайте|изчакай|само|слушам(?:е)?(?:\\s+ви)?|кажете(?:\\s+ми)?|давайте|диктувайте|ето(?:\\s+го)?)(?!\\p{L})[\\s.,;:—!?-]*)*';

function normalizeDialogue(text) {
  // A question supplies a field label; the answer still has to pass the normal
  // value parser. Never derive names or numbers from the question itself.
  text = text.replace(new RegExp(`(?<!\\p{L})(?:на\\s+(?:чие|кое)(?:\\s+име)?\\s+(?:да\\s+(?:бъде|е)|ще\\s+(?:бъде|е)|е)\\s+(?:резервацията|масата)|на\\s+(?:чие|кое)\\s+име(?:\\s+(?:да\\s+(?:бъде|е|запиша)|е|ще\\s+бъде))?|как(?:во|\\s+ви)\\s+е\\s+името)${endWord}${dialogGap}`, 'giu'), 'име ')
    .replace(new RegExp(`(?<!\\p{L})(?:за\\s+коя\\s+дата|коя\\s+дата|кой\\s+ден|за\\s+кога)(?:\\s+(?:да\\s+(?:бъде|е)|ще\\s+бъде))?${endWord}${dialogGap}`, 'giu'), 'дата ')
    .replace(new RegExp(`(?<!\\p{L})(?:за\\s+колко\\s+часа|в\\s+колко(?:\\s+часа)?|кой\\s+час)(?:\\s+(?:да\\s+(?:бъде|е)|ще\\s+дойдете))?${endWord}${dialogGap}(?:(?:в|за|от)\\s+)?`, 'giu'), 'час ')
    .replace(new RegExp(`(?<!\\p{L})(?:(?:за\\s+)?колко\\s+(?:души|човека|хора|гости)(?:\\s+(?:ще\\s+(?:бъдете|сте|дойдете)|сте|да\\s+запиша))?|колко\\s+ще\\s+(?:бъдете|сте))${endWord}${dialogGap}`, 'giu'), 'гости ')
    .replace(/(?<!\p{L})(?:запиши|запишете|запазете|запази)\s+(?:(?:резервацията|масата)\s+)?на\s+(?:името\s+на\s+)?/giu, 'име ');
  return text;
}

function normalizeCorrections(text) {
  // Corrections cannot cross another field label. In “име Иван, телефон X,
  // не, Y” only the phone changes; the guest identity remains intact.
  text = text.replace(/(?<!\p{L})(часът|датата)(?=\s+не\s)/giu, word => word.toLowerCase().startsWith('час') ? 'час' : 'дата');
  const label = '(?:име|телефон|дата|час|гости)';
  const value = `(?:(?!(?<!\\p{L})${label}${endWord})[^.;!?])+?`;
  text = text.replace(new RegExp(`(?<!\\p{L})(${label})\\s+не\\s+(?:е\\s+)?${value},?\\s+а\\s+(?:е\\s+)?`, 'giu'), '$1 ');
  text = text.replace(new RegExp(`(?<!\\p{L})(${label})\\s+${value},\\s*не\\s*[,—-]\\s*`, 'giu'), '$1 ');
  const numberWords = `(?:\\d+|${Object.keys(values).sort((a, b) => b.length - a.length).join('|')})`;
  text = text.replace(new RegExp(`(?<!\\p{L})не\\s+${numberWords}(?:\\s+${guestUnit})?\\s*,?\\s+а\\s+(${numberWords}(?:\\s+и\\s+${numberWords})?\\s+${guestUnit})${endWord}`, 'giu'), 'гости $1');
  return text;
}

function maskAmbiguousChoices(text) {
  const labels = [...text.matchAll(/(?<!\p{L})(име|телефон|дата(?:та)?|час(?:ът)?|гости|брой\s+(?:на\s+)?(?:гости|хора)|ще\s+(?:бъдем|сме))(?!\p{L})\s*/giu)];
  for (let index = labels.length - 1; index >= 0; index--) {
    const label = labels[index], start = label.index + label[0].length;
    const end = labels[index + 1]?.index ?? text.length;
    const source = text.slice(start, end);
    const boundary = source.search(/[;!?]|(?<!\d)\.|\.(?!\d)/u);
    const length = boundary < 0 ? source.length : boundary;
    if (!/(?<!\p{L})или(?!\p{L})/iu.test(source.slice(0, length))) continue;
    const field = label[1].toLowerCase();
    if (field === 'име') continue;
    // Feed the shared validator a deliberately invalid value instead of
    // silently choosing one alternative. The original transcript stays visible.
    const invalid = field.startsWith('телефон') ? 'телефон 0'
      : field.startsWith('дата') ? 'дата 0000-00-00'
        : field.startsWith('час') ? 'час 99:99' : 'гости 0';
    text = text.slice(0, label.index) + invalid + '; ' + text.slice(start + length);
  }
  return text;
}

function bookingContext(text, index) {
  const before = text.slice(0, index).split(/[.!?;,]/u).at(-1).trim();
  return !before || /(?<!\p{L})(?:резервация(?:та)?|маса|име|телефон|дата|час|гости)(?!\p{L})/iu.test(before);
}

function readNumber(source) {
  const first = atom.exec(source);
  if (!first) return null;
  let length = first[0].length;
  if (/^\d+$/u.test(first[0])) return { value: Number(first[0]), digits: first[0], length };
  let value = values[first[0].toLowerCase()];
  function nextNumber() {
    const join = /^\s+(?:и\s+)?/iu.exec(source.slice(length));
    const next = join && atom.exec(source.slice(length + join[0].length));
    return next && { value: /^\d+$/u.test(next[0]) ? Number(next[0]) : values[next[0].toLowerCase()], length: join[0].length + next[0].length };
  }
  if (value >= 100) {
    const next = nextNumber();
    if (next && next.value > 0 && next.value < 100) { value += next.value; length += next.length; }
  }
  if (value >= 20 && value % 10 === 0) {
    const next = nextNumber();
    if (next && next.value > 0 && next.value < 10) { value += next.value; length += next.length; }
  }
  return { value, digits: String(value), length };
}

function safeTail(source) {
  const tail = source.trimStart().replace(/^(?:да(?:\s+|$))+/iu, '');
  if (/^(?:$|[,.;!?]|(?:телефон|име|дата|датата|час|часът|гости|брой|на името|утре|днес|вдругиден|ще (?:бъдем|сме)|моля|благодаря)(?!\p{L}))/iu.test(tail)) return true;
  const nextField = /^(?:в|от|за)\s+/iu.exec(tail);
  const number = readNumber(tail.slice(nextField?.[0].length || 0));
  if (nextField && number) return true;
  if (number && new RegExp(`^\\s+${guestUnit}${endWord}`, 'iu').test(tail.slice(number.length))) return true;
  return /^за\s+(?:утре|днес|вдругиден|резервация|тази вечер)(?!\p{L})/iu.test(tail);
}

function normalizePhones(text) {
  return text.replace(new RegExp(`(?<!\\p{L})(?:(?:може\\s+ли)\\s+)?(?:(?:един|едно)\\s+)?${phoneCue}${endWord}\\s*(?:(?:ми|ви|за\\s+връзка)\\s*)?(?:(?:ми\\s+)?(?:е|дайте|кажете)\\s*)?${dialogGap}`, 'giu'), (label, index) => {
    const after = text.slice(index + label.length);
    return /^(?:\+|плюс\s+|не\s+)/iu.test(after) || readNumber(after) ? 'телефон ' : 'разговор ';
  });
}

function normalizePhoneNumbers(text) {
  const matches = [...text.matchAll(/(?<!\p{L})телефон\s+/giu)];
  for (const match of matches.reverse()) {
    const start = match.index + match[0].length, source = text.slice(start);
    const plus = /^(?:\+|плюс\s+)/iu.exec(source);
    let cursor = plus?.[0].length || 0, digits = '';
    while (cursor < source.length) {
      // Recognition often ends a phone fragment with a period or comma. Only
      // a following number without a guest/time/date suffix can continue it.
      const separator = /^[\s,;().-]*(?:(?:да|добре|окей)(?!\p{L})[\s,;().-]*)*/iu.exec(source.slice(cursor))[0];
      if (new RegExp(`^${collective}${endWord}`, 'iu').test(source.slice(cursor + separator.length))) break;
      const number = readNumber(source.slice(cursor + separator.length));
      if (!number) break;
      const tail = source.slice(cursor + separator.length + number.length);
      if (digits && (new RegExp(`^\\s+${guestUnit}${endWord}`, 'iu').test(tail) || /^[:./]\d/u.test(tail) || new RegExp(`^\\s+(?:${monthNames.join('|')})${endWord}`, 'iu').test(tail))) break;
      // A complete phone repeated back in a separate group confirms the
      // same number. Equal short groups (for example “88 88”) still concatenate.
      const readBack = digits.length >= 7 && number.digits === digits;
      if (!readBack) digits += number.digits;
      cursor += separator.length + number.length;
      if (digits.length > 15) break;
    }
    if (digits) text = text.slice(0, start) + (plus ? '+' : '') + digits + '; ' + source.slice(cursor);
  }
  return text;
}

function normalizeDates(text, now) {
  const ordinal = Object.keys(ordinalDays).sort((a, b) => b.length - a.length).join('|');
  const dateWords = new RegExp(`(?<!\\p{L})(?:(двадесет|двайсет|тридесет|трийсет)\\s+и\\s+)?(${ordinal})\\s+(${monthNames.join('|')})${endWord}`, 'giu');
  text = text.replace(dateWords, (_, ten, day, month) => `${(ten ? tens[ten.toLowerCase()] : 0) + ordinalDays[day.toLowerCase()]} ${month}`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const currentDate = new Date(today + 'T12:00:00Z');
  // A bare weekday means its next occurrence, including today. "Следващия"
  // explicitly means a later occurrence: today -> seven days, not zero.
  const weekday = new RegExp(`(?<!\\p{L})(дата(?:та)?\\s*(?:е\\s*)?[:—-]?\\s*|за\\s+|на\\s+|в(?:ъв)?\\s+)(?:(следващ(?:ия|ият|ата|ото)|този|тази)\\s+)?(${Object.keys(weekdays).join('|')})${endWord}`, 'giu');
  text = text.replace(weekday, (whole, cue, next, day, index) => {
    if (!safeTail(text.slice(index + whole.length))) return whole;
    const explicit = /^дата/iu.test(cue);
    if (!explicit && !bookingContext(text, index)) return whole;
    let days = (weekdays[day.toLowerCase()] - currentDate.getUTCDay() + 7) % 7;
    if (next?.toLowerCase().startsWith('следващ') && days === 0) days = 7;
    const date = new Date(currentDate); date.setUTCDate(date.getUTCDate() + days);
    return `дата ${date.toISOString().slice(0, 10)}`;
  });
  return text.replace(/(?<!\p{L})(?:за\s+)?тази вечер(?!\p{L})/giu, (whole, index) => bookingContext(text, index) && safeTail(text.slice(index + whole.length)) ? 'дата днес' : whole);
}

function normalizeTimes(text) {
  const cues = [...text.matchAll(/(?<!\p{L})(часът|часа|час|в|от)(?!\p{L})\s*(?:е\s*)?[:—-]?\s*/giu)];
  for (const cue of cues.reverse()) {
    const start = cue.index + cue[0].length, source = text.slice(start);
    const numeric = /^(\d{1,2})[:.](\d{2})(?!\d|[./]\d)/u.exec(source);
    const number = !numeric && readNumber(source);
    if (!numeric && !number) continue;
    let hour = numeric ? Number(numeric[1]) : number.value;
    let minute = numeric ? Number(numeric[2]) : 0;
    let length = numeric ? numeric[0].length : number.length;
    let subtract = false;
    if (!numeric) {
      const join = /^\s+(?:(?:часа|часът)\s+)?(и|без)\s+/iu.exec(source.slice(length));
      if (join) {
        const rest = source.slice(length + join[0].length);
        const fraction = /^(половина|четвърт)(?!\p{L})/iu.exec(rest);
        const minutes = !fraction && readNumber(rest);
        if (fraction || minutes) {
          minute = fraction ? (fraction[1].toLowerCase() === 'половина' ? 30 : 15) : minutes.value;
          subtract = join[1].toLowerCase() === 'без';
          length += join[0].length + (fraction ? fraction[0].length : minutes.length);
        }
      } else {
        const gap = /^\s+/u.exec(source.slice(length));
        const minutes = gap && readNumber(source.slice(length + gap[0].length));
        if (minutes && !new RegExp(`^\\s+${guestUnit}${endWord}`, 'iu').test(source.slice(length + gap[0].length + minutes.length))) {
          minute = minutes.value; length += gap[0].length + minutes.length;
        }
      }
    }
    const suffix = /^\s*(?:(?:часа|часът|минути)\s*)?(вечерта|вечер|следобед|сутринта|сутрин|на обяд)?(?!\p{L})/iu.exec(source.slice(length));
    if (suffix) length += suffix[0].length;
    if (suffix?.[1] && hour >= 1 && hour <= 12) {
      const daypart = suffix[1].toLowerCase();
      hour = /^(?:вечер|следобед|на обяд)/u.test(daypart) ? hour % 12 + 12 : hour % 12;
    }
    // Do not convert "в седем гледам телевизия" into a booking time.
    if (!safeTail(source.slice(length))) {
      // Mask a rejected clock phrase so the shared parser cannot reinterpret it
      // as a bare 24-hour time inside an unrelated sentence.
      text = text.slice(0, cue.index) + 'разговор ' + source.slice(length);
      continue;
    }
    if (subtract && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const total = (hour * 60 - minute + 1440) % 1440; hour = Math.floor(total / 60); minute = total % 60;
    }
    const label = /^час/iu.test(cue[1]) ? 'час' : 'в';
    text = text.slice(0, cue.index) + `${label} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}; ` + source.slice(length);
  }
  return text;
}

function normalizeGuests(text) {
  text = text.replace(new RegExp(`(^|[.!?;]\\s*)(${collective})${endWord}`, 'giu'), (whole, prefix, count, index) => safeTail(text.slice(index + whole.length)) ? `${prefix}гости ${units[count.toLowerCase()]}` : whole);
  const candidates = [...text.matchAll(/(?<!\p{L})(?:брой\s+(?:на\s+)?(?:гости|хора)|гостите\s+(?:ще\s+)?са|ще\s+(?:бъдем|сме|дойдем)(?:\s+общо)?|(?:ние\s+)?сме(?:\s+общо)?|общо\s+(?:сме|ще\s+(?:сме|бъдем))|гости|за)(?!\p{L})\s*[:—-]?\s*/giu)];
  for (const cue of candidates.reverse()) {
    const start = cue.index + cue[0].length, source = text.slice(start);
    if (!/^(?:гости|брой|гостите)/iu.test(cue[0]) && !bookingContext(text, cue.index)) continue;
    const count = readNumber(source);
    if (!count) continue;
    let countLength = count.length;
    // A repeated answer (“трима, трима човека”) is confirmation, not two
    // separate party sizes. Only collapse equal values within a guest field.
    const echoGap = /^[\s,]+/u.exec(source.slice(countLength));
    const echo = echoGap && readNumber(source.slice(countLength + echoGap[0].length));
    if (echo && echo.value === count.value) countLength += echoGap[0].length + echo.length;
    const unit = new RegExp(`^\\s+${guestUnit}${endWord}`, 'iu').exec(source.slice(countLength));
    const collective = /(?:двама|трима|четирима|петима|шестима|седмина|осмина|деветима)$/iu.test(source.slice(0, count.length));
    if (/^за\s/iu.test(cue[0]) && !unit && !collective) continue;
    let length = countLength + (unit?.[0].length || 0), value = count.value;
    if (unit && /(?:възрастни|възрастен|деца|дете)$/iu.test(unit[0])) {
      const join = /^\s+и\s+/iu.exec(source.slice(length));
      const second = join && readNumber(source.slice(length + join[0].length));
      const secondUnit = second && /^\s+(възрастни|възрастен|деца|дете)(?!\p{L})/iu.exec(source.slice(length + join[0].length + second.length));
      if (secondUnit && /^\s*възраст/iu.test(unit[0]) !== /^възраст/iu.test(secondUnit[1])) { value += second.value; length += join[0].length + second.length + secondUnit[0].length; }
    }
    if (!safeTail(source.slice(length))) continue;
    text = text.slice(0, cue.index) + `гости ${value}; ` + source.slice(length);
  }
  return text.replace(/(?<!\p{L})човек(?:а)?(?!\p{L})/giu, 'души');
}

export function normalizeBulgarianReservationTranscript(transcript, now = new Date()) {
  // Recognition may omit every punctuation mark. Standalone acknowledgements
  // still end an answer; suffixes in names such as Добрев remain untouched.
  let text = String(transcript || '').replace(/\s+/g, ' ').trim()
    .replace(/(?<!\p{L})(?:добре|окей|ок)(?!\p{L})/giu, ';');
  text = normalizeDialogue(text);
  text = text.replace(/(?<!\p{L})(?:резервацията\s+(?:е\s+)?на\s+името(?:\s+на)?|(?:на\s+)?името(?:\s+ми)?(?:\s+е|\s+на)?)(?!\p{L})\s*/giu, 'име ')
    .replace(/(?<!\p{L})(?:бих(?:ме)?\s+(?:искал[аи]?|искали|желал[аи]?|желали)|искам(?:е)?)\s+(?:(?:да\s+(?:направя|направим|запазя|запазим))\s+)?(?:една\s+)?(?:резервация|маса)(?!\p{L})/giu, 'резервация')
    .replace(/(?<!\p{L})маса(?=\s+за\s)/giu, 'резервация')
    .replace(/(?<!\p{L})(?:поправка|корекция)\s*[:—-]\s*/giu, '')
    .replace(/(?<!\p{L})име\s+(?=(?:още|трябва|нека|няма|нямам|нямаме|забравих|изчакайте|момент|секунда)(?!\p{L}))/giu, 'разговор ')
    .replace(/^(?:Аз|Ние|Той|Тя|Те|Вие|За|На|В|От)(?!\p{L})/u, pronoun => pronoun.toLowerCase())
    .replace(/(?<!\p{L})(?:моля|значи|ами|ъъ|ъъъ)\s*[,;]\s*/giu, '');
  text = normalizeCorrections(normalizePhones(text));
  text = maskAmbiguousChoices(text);
  text = normalizePhoneNumbers(text);
  text = normalizeDates(text, now);
  text = normalizeTimes(text);
  text = text.replace(/(?<!\p{L})(утре|днес|вдругиден)(?!\p{L})/giu, (word, _day, index) => {
    if (/дата\s*(?:е\s*)?[:—-]?\s*$/iu.test(text.slice(0, index)) || safeTail(text.slice(index + word.length))) return word;
    // An incidental "Петър, утре ще ти звънна" must not establish a guest's
    // identity through the shared parser's name + date fallback either.
    return 'разговор';
  });
  return normalizeGuests(text);
}
