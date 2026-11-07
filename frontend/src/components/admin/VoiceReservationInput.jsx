import React from 'react';
import { parseVoiceReservation } from '../../domain/reservations/voiceReservation';
import { startReservationSpeechSession } from '../../domain/reservations/reservationSpeechSession';

const copy = {
  bg: { title: 'Гласово попълване', start: 'Диктувай резервация', stop: 'Спри', language: 'Език на диктовката', transcript: 'Разпознат текст', review: 'Провери и поправи полетата', apply: 'Попълни формата', example: 'На името на Иван Петров. Телефонът ми е 0898123456. Утре в седем и половина вечерта. Ще бъдем шестима.', privacy: 'След натискане на бутона браузърът разпознава речта; може да я изпрати до своята услуга. Резервацията не се запазва автоматично.', unsupported: 'Този браузър няма гласово разпознаване. Въведи текста или използвай диктовката на клавиатурата.', error: 'Не успяхме да разпознаем речта. Провери разрешението за микрофон и опитай пак или въведи текста.', listening: 'Слушам… Може да правиш паузи. Натисни „Спри“, когато приключиш.', hint: 'Кажи име, телефон, дата, час и брой гости. Разпознатите данни попълват формата; провери ги преди запазване.', limit: 'Диктовката спря след 90 секунди. Може да продължиш с бутона.', details: 'Текст и проверка', filled: 'Разпознати полета', applied: 'Разпознатите полета са попълнени. Провери ги и избери масите преди запазване.', invalid: 'Има неясни или невалидни данни. Повтори съответното поле или го поправи в „Текст и проверка“.', missing: 'Празните полета няма да променят въведеното във формата.', fields: ['Име', 'Телефон', 'Дата', 'Час', 'Гости'] },
  ru: { title: 'Голосовое заполнение', start: 'Продиктовать бронь', stop: 'Стоп', language: 'Язык диктовки', transcript: 'Распознанный текст', review: 'Проверьте и исправьте поля', apply: 'Заполнить форму', example: 'Имя Иван Петров, телефон 0898123456, завтра в 19:30, шесть человек.', privacy: 'После нажатия кнопки браузер распознаёт речь и может отправить её своей службе. Бронь автоматически не сохраняется.', unsupported: 'В браузере нет распознавания речи. Введите текст или используйте диктовку клавиатуры.', error: 'Не удалось распознать речь. Проверьте разрешение микрофона и повторите попытку или введите текст.', listening: 'Слушаю… Можно делать паузы. Нажмите «Стоп», когда закончите.', hint: 'Назовите имя, телефон, дату, время и число гостей. Распознанные данные заполняют форму; проверьте их перед сохранением.', limit: 'Диктовка остановлена через 90 секунд. Можно продолжить кнопкой.', details: 'Текст и проверка', filled: 'Распознаны поля', applied: 'Распознанные поля заполнены. Проверьте их и выберите столы перед сохранением.', invalid: 'Исправьте отмеченные поля. Время должно быть среди доступных в форме.', missing: 'Пустые поля не изменят уже заполненные поля формы.', fields: ['Имя', 'Телефон', 'Дата', 'Время', 'Гости'] },
  en: { title: 'Voice fill', start: 'Dictate reservation', stop: 'Stop', language: 'Dictation language', transcript: 'Recognized text', review: 'Review and correct the fields', apply: 'Fill form', example: 'Name Ivan Petrov, phone 0898123456, tomorrow at 19:30, six guests.', privacy: 'After you press the button, the browser recognizes speech and may send it to its service. The reservation is never saved automatically.', unsupported: 'Speech recognition is unavailable. Type the transcript or use keyboard dictation.', error: 'Speech recognition failed. Check microphone permission and retry, or type the transcript.', listening: 'Listening… You can pause. Press Stop when finished.', hint: 'Say the name, phone, date, time and number of guests. Recognized details fill the form; review before saving.', limit: 'Dictation stopped after 90 seconds. Press the button to continue.', details: 'Transcript and review', filled: 'Recognized fields', applied: 'Recognized fields filled. Review them and select tables before saving.', invalid: 'Correct the highlighted fields. The time must be available in the form.', missing: 'Empty fields leave existing form values unchanged.', fields: ['Name', 'Phone', 'Date', 'Time', 'Guests'] },
};
const keys = ['guestName', 'phone', 'reservedDate', 'reservedTime', 'guestCount'];
function invalidFields(parsed, fields, currentDate, availableTimes) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const invalid = keys.filter(key => {
    const value = fields[key];
    if (!value) return false;
    if (key === 'guestName') return value.trim().length < 2 || value.length > 80;
    if (key === 'phone') return !/^\+?\d{7,15}$/.test(value);
    if (key === 'guestCount') return !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 40;
    if (key === 'reservedDate') return !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < today || Number.isNaN(Date.parse(value));
    return !(availableTimes?.(fields.reservedDate || currentDate) || []).includes(value);
  });
  const issueFields = { phone: 'phone', date: 'reservedDate', time: 'reservedTime', guests: 'guestCount' };
  for (const issue of parsed.issues) {
    const key = issueFields[issue];
    if (!fields[key] && !invalid.includes(key)) invalid.push(key);
  }
  if (invalid.includes('reservedDate') && fields.reservedTime && !invalid.includes('reservedTime')) invalid.push('reservedTime');
  return invalid;
}
export default function VoiceReservationInput({ language = 'bg', onApply, currentDate, availableTimes }) {
  const t = copy[language] || copy.bg;
  const [speechLanguage, setSpeechLanguage] = React.useState(language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-GB' : 'bg-BG');
  const [text, setText] = React.useState('');
  const [overrides, setOverrides] = React.useState({});
  const [listening, setListening] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const sessionRef = React.useRef(null);
  const voiceValuesRef = React.useRef({});
  const latestRef = React.useRef({ onApply, currentDate, availableTimes });
  React.useEffect(() => { latestRef.current = { onApply, currentDate, availableTimes }; }, [onApply, currentDate, availableTimes]);
  React.useEffect(() => () => { sessionRef.current?.abort(); sessionRef.current = null; }, []);
  const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const parsed = React.useMemo(() => parseVoiceReservation(text, new Date(), { language: speechLanguage }), [text, speechLanguage]);
  const fields = { ...parsed.fields, ...overrides };
  const invalid = invalidFields(parsed, fields, currentDate, availableTimes);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  function changeText(value) { setText(value); setOverrides({}); setNotice(''); }
  function start() {
    if (!Recognition || sessionRef.current) return;
    setError(''); setNotice(''); setListening(true);
    const previousValues = { ...parsed.fields };
    let ended = false;
    const session = startReservationSpeechSession({
      Recognition, language: speechLanguage, initialText: text,
      onTranscript: ({ text: transcript, finalText }) => {
        setText(transcript); setOverrides({});
        const result = parseVoiceReservation(finalText, new Date(), { language: speechLanguage });
        const current = latestRef.current;
        const invalid = invalidFields(result, result.fields, current.currentDate, current.availableTimes);
        const patch = Object.fromEntries(keys.filter(key => result.fields[key] && !invalid.includes(key) && previousValues[key] !== result.fields[key]).map(key => [key, result.fields[key]]));
        const clearIfMatches = {};
        if (speechLanguage === 'bg-BG') {
          for (const key of invalid) {
            if (voiceValuesRef.current[key]) {
              clearIfMatches[key] = voiceValuesRef.current[key];
              delete voiceValuesRef.current[key];
              delete previousValues[key];
            }
          }
        }
        if (Object.keys(patch).length || Object.keys(clearIfMatches).length) {
          Object.assign(previousValues, patch);
          Object.assign(voiceValuesRef.current, patch);
          current.onApply(patch, { clearIfMatches });
        }
      },
      onEnd: () => { ended = true; sessionRef.current = null; setListening(false); },
      onError: () => setError(t.error),
      onLimit: () => setNotice(t.limit),
    });
    if (!ended) sessionRef.current = session;
  }
  function apply() {
    if (listening || invalid.length) return;
    const patch = Object.fromEntries(keys.filter(key => fields[key]).map(key => [key, fields[key].trim()]));
    if (!Object.keys(patch).length) return;
    for (const key of Object.keys(patch)) delete voiceValuesRef.current[key];
    onApply(patch); setNotice(t.applied);
  }
  return (
    <div className="my-3 min-w-0 rounded-2xl border border-[#c9a56a]/30 bg-black/20 p-3" data-voice-reservation="true">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!Recognition} aria-pressed={listening} onClick={() => listening ? sessionRef.current?.stop() : start()} className="rounded-xl border border-[#c9a56a]/40 bg-[#c9a56a]/15 px-3 py-2 text-sm font-semibold text-[#f2d39a] disabled:opacity-40">{listening ? t.stop : t.start}</button>
        <select aria-label={t.language} value={speechLanguage} disabled={listening} onChange={e => setSpeechLanguage(e.target.value)} className="min-w-0 rounded-xl border border-white/20 bg-[#15110e] px-2 py-2 text-xs text-white">
          <option value="bg-BG">Български</option><option value="ru-RU">Русский</option><option value="en-GB">English</option>
        </select>
      </div>
      <p className="mt-2 text-xs text-white/60">{t.hint}</p>
      {speechLanguage === 'bg-BG' && <p className="mt-2 text-xs text-[#f2d39a]/80">Например: „На името на Иван Петров. Телефонът ми е… Утре в седем и половина вечерта. Ще бъдем шестима.“</p>}
      {listening && <p role="status" className="mt-2 text-xs text-emerald-200">{t.listening}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-200">{error}</p>}
      {!Recognition && <p className="mt-2 text-xs text-white/60">{t.unsupported}</p>}
      {text && <p className="mt-2 text-xs text-[#f2d39a]">{t.filled}: {keys.filter(key => fields[key] && !invalid.includes(key)).map(key => t.fields[keys.indexOf(key)]).join(', ') || '—'}</p>}
      {invalid.length > 0 && <p role="alert" className="mt-2 text-xs text-red-200">{t.invalid}{language === 'bg' ? ` (${invalid.map(key => t.fields[keys.indexOf(key)]).join(', ')})` : ''}</p>}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-white/60">{t.details}</summary>
        <p className="mt-2 text-xs text-white/60">{t.example}</p>
        <label className="mt-3 block text-xs text-white/65">{t.transcript}
          <textarea aria-label={t.transcript} value={text} onChange={e => changeText(e.target.value)} disabled={listening} rows={3} placeholder={t.example} className="mt-1 w-full min-w-0 rounded-xl border border-white/20 bg-black/20 p-2 text-sm text-white" />
        </label>
        {text && <>
          <div className="my-2 text-xs text-white/70">{t.review}</div>
          <div className="grid grid-cols-2 gap-2">
            {keys.map((key, i) => <label key={key} className={`min-w-0 text-[11px] ${invalid.includes(key) ? 'text-red-200' : 'text-white/60'}`}>{t.fields[i]}
              <input aria-label={`${t.review}: ${t.fields[i]}`} aria-invalid={invalid.includes(key)} type={key === 'reservedDate' ? 'date' : key === 'reservedTime' ? 'time' : key === 'guestCount' ? 'number' : 'text'} min={key === 'guestCount' ? '1' : key === 'reservedDate' ? today : undefined} max={key === 'guestCount' ? '40' : undefined} value={fields[key] || ''} disabled={listening} onChange={e => { setOverrides(previous => ({ ...previous, [key]: e.target.value })); setNotice(''); }} className="mt-1 w-full min-w-0 rounded-lg border border-white/20 bg-black/20 p-2 text-sm text-white" />
            </label>)}
          </div>
          <p className="mt-2 text-[11px] text-white/45">{t.missing}</p>
          <button type="button" onClick={apply} disabled={listening || invalid.length > 0 || !keys.some(key => fields[key])} className="mt-3 rounded-xl bg-[#c9a56a] px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">{t.apply}</button>
        </>}
      </details>
      <p className="mt-2 text-[10px] text-white/45">{t.privacy}</p>
      {notice && <p role="status" className="mt-2 text-xs text-emerald-200">{notice}</p>}
    </div>
  );
}
