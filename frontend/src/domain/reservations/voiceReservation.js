// Conservative local parsing of a reviewed transcript; never creates a booking.
const numbers = {
  нула: 0, ноль: 0, zero: 0, едно: 1, един: 1, один: 1, одна: 1, one: 1,
  две: 2, два: 2, двама: 2, двое: 2, two: 2, три: 3, трима: 3, трое: 3, three: 3,
  четири: 4, четирима: 4, четыре: 4, four: 4, пет: 5, петима: 5, пять: 5, five: 5,
  шест: 6, шестима: 6, шесть: 6, six: 6, седем: 7, семь: 7, seven: 7,
  осем: 8, восемь: 8, eight: 8, девет: 9, девять: 9, nine: 9,
  десет: 10, десять: 10, ten: 10, единадесет: 11, одиннадцать: 11, eleven: 11,
  дванадесет: 12, двенадцать: 12, twelve: 12, тринадесет: 13, тринадцать: 13,
  четиринадесет: 14, четырнадцать: 14, петнадесет: 15, пятнадцать: 15,
  шестнадесет: 16, шестнадцать: 16, седемнадесет: 17, семнадцать: 17,
  осемнадесет: 18, восемнадцать: 18, деветнадесет: 19, девятнадцать: 19,
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
function numberValue(text) {
  const words = text.trim().toLowerCase().split(/\s+/).filter(w => !['и', 'and'].includes(w));
  if (/^\d+$/.test(text.trim())) return Number(text);
  const parts = words.map(w => numbers[w]);
  if (parts.some(n => n === undefined) || !parts.length || parts.length > 2) return null;
  if (parts.length === 2 && !(parts[0] >= 20 && parts[0] % 10 === 0 && parts[1] < 10)) return null;
  return parts.reduce((a, b) => a + b, 0);
}
function validDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? date.toISOString().slice(0, 10) : null;
}
export function parseVoiceReservation(transcript, now = new Date()) {
  const text = String(transcript || '').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const fields = {}, issues = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const phoneMatch = /(?:телефон(?:ен номер)?|номер(?: телефона)?|phone(?: number)?)\s*[:—-]?\s*(.+?)(?=[,;]|\s+(?:дата|час|утре|завтра|сегодня|днес|вдругиден|послезавтра|tomorrow|today|за|на|гости|гостей|хора|души|people|guests)\s|$)/iu.exec(text);
  let phoneSource = phoneMatch?.[1];
  if (!phoneSource) phoneSource = text.match(/\+?\d[\d ()-]{6,}\d/u)?.[0];
  if (phoneSource && /^\d{4}-\d{2}-\d{2}$/.test(phoneSource.trim())) phoneSource = undefined;
  if (phoneSource) {
    const converted = phoneSource.toLowerCase().split(/\s+/).map(w => {
      if (w === 'плюс' || w === 'plus') return '+';
      return numbers[w] !== undefined && numbers[w] < 10 ? String(numbers[w]) : w;
    }).join('');
    if (/^\+?[\d ()-]+$/.test(converted)) {
      const phone = converted.replace(/[ ()-]/g, '');
      if (/^\+?\d{7,15}$/.test(phone)) fields.phone = phone;
      else issues.push('phone');
    } else issues.push('phone');
  }
  const numericDate = lower.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/u);
  let localDate = lower.match(/(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?![\d./])/u);
  if (localDate && !localDate[3] && /(?:час(?:ът)?|в|at)\s*$/u.test(lower.slice(0, localDate.index))) localDate = null;
  if (numericDate) fields.reservedDate = validDate(numericDate[1], numericDate[2], numericDate[3]);
  else if (localDate) fields.reservedDate = validDate(localDate[3] || today.slice(0, 4), localDate[2], localDate[1]);
  else {
    const namedDate = lower.match(new RegExp(`(?<![\\p{L}\\d])(\\d{1,2})\\s+(${Object.keys(months).join('|')})(?:\\s+(\\d{4}))?(?!\\p{L})`, 'u'));
    if (namedDate) fields.reservedDate = validDate(namedDate[3] || today.slice(0, 4), months[namedDate[2]], namedDate[1]);
    else {
      const relative = lower.match(/(?<!\p{L})(послезавтра|вдругиден|day after tomorrow|завтра|утре|tomorrow|сегодня|днес|today)(?!\p{L})/u);
      if (relative) {
        const days = ['послезавтра', 'вдругиден', 'day after tomorrow'].includes(relative[1]) ? 2 : ['завтра', 'утре', 'tomorrow'].includes(relative[1]) ? 1 : 0;
        const date = new Date(today + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days); fields.reservedDate = date.toISOString().slice(0, 10);
      }
    }
  }
  if ('reservedDate' in fields && !fields.reservedDate) { delete fields.reservedDate; issues.push('date'); }
  if (fields.reservedDate && fields.reservedDate < today) { delete fields.reservedDate; issues.push('date'); }
  const time = lower.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/u)
    || lower.match(/(?:час(?:ът)?|в|at)\s+(\d{1,2})(?:[.\s](\d{2}))?(?:\s*(?:часа|часов|hours))?(?!\d)/u);
  if (time) {
    const hour = Number(time[1]), minute = Number(time[2] || 0);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) fields.reservedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    else issues.push('time');
  }
  const guest = lower.match(/(?<![\p{L}\d])([\p{L}\d]+(?:\s+(?:и\s+)?[\p{L}]+)?)\s+(?:души|душ|хора|гости|гостей|человека|человек|people|guests)(?!\p{L})/u)
    || lower.match(/(?:гости|гостей|guests)\s*[:—-]?\s*(\d{1,3}|[\p{L}]+(?:\s+и\s+[\p{L}]+)?)/u);
  if (guest) {
    let count = numberValue(guest[1]);
    // An ordinary preceding word may be captured with a one-word number.
    if (count === null) count = numberValue(guest[1].split(' ').at(-1));
    if (Number.isInteger(count) && count > 0 && count <= 40) fields.guestCount = String(count);
    else issues.push('guests');
  }
  const nameLabel = /(?:на името(?: на)?|на имя|име(?: на гост)?|имя|name)\s*[:—-]?\s*/iu.exec(text);
  const nameStart = nameLabel ? nameLabel.index + nameLabel[0].length : 0;
  const tail = text.slice(nameStart);
  const end = tail.search(/[,;]|\s+(?:телефон|номер|phone|дата|час|утре|завтра|сегодня|днес|tomorrow|today|за|на|в|at)(?!\p{L})|\s+\d/iu);
  const name = (end < 0 ? tail : tail.slice(0, end)).replace(/[.,:]+$/g, '').trim();
  if (/^[\p{L}][\p{L}'’ -]{1,79}$/u.test(name) && name.split(' ').length <= 4 && !/резервац|reservation|челов|гости|души|телефон|^(?:утре|завтра|сегодня|днес|вдругиден|послезавтра|tomorrow|today|дата|час)$/iu.test(name)) fields.guestName = name;
  return { fields, issues: [...new Set(issues)], missing: ['guestName', 'phone', 'reservedDate', 'reservedTime', 'guestCount'].filter(key => !fields[key]) };
}
