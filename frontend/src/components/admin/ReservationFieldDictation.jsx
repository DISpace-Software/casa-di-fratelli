import React from 'react';
import { parseVoiceReservationField } from '../../domain/reservations/voiceReservationField';
import { startReservationFieldSpeechSession } from '../../domain/reservations/reservationFieldSpeechSession';

const VoiceFieldContext = React.createContext(null);
const copy = {
  bg: {
    dictate: 'Диктувай', stop: 'Спри', language: 'Език на диктовката', title: 'Диктовка', listening: 'Слушам', filled: 'Попълнено', heard: 'Разпознат текст',
    hint: 'Натисни микрофона до полето и кажи стойността. Провери преди запис.',
    privacy: 'Микрофонът се включва само с натискане. Браузърът може да използва услуга за разпознаване.',
    unsupported: 'Този браузър няма гласово разпознаване. Полетата могат да се попълват ръчно.',
    permission: 'Разреши достъп до микрофона в браузъра и опитай отново.',
    network: 'Гласовата услуга не е достъпна. Провери връзката или въведи полето ръчно.',
    audio: 'Микрофонът не е достъпен. Провери дали е свързан и опитай отново.',
    empty: 'Не чух стойност. Натисни микрофона и опитай отново.',
    error: 'Диктовката не успя. Опитай отново или въведи полето ръчно.',
    limit: 'Диктовката спря след 20 секунди. Натисни микрофона, за да продължиш.',
    unavailable: 'Този час не е достъпен за избраната дата. Избери час от списъка.',
    fields: { guestName: 'Име', phone: 'Телефон', reservedDate: 'Дата', reservedTime: 'Час', guestCount: 'Гости', email: 'Имейл' },
    invalid: { guestName: 'Кажи само името, например „Георги Иванов“.', phone: 'Номерът не е пълен или ясен. Продиктувай целия телефон.', reservedDate: 'Неясна дата. Кажи например „следващата сряда“.', reservedTime: 'Неясен час. Кажи например „деветнадесет и тридесет“.', guestCount: 'Кажи брой гости от 1 до 40.', email: 'Неясен имейл. Повтори адреса или го въведи ръчно.' },
  },
  ru: {
    dictate: 'Продиктовать', stop: 'Стоп', language: 'Язык диктовки', title: 'Диктовка', listening: 'Слушаю', filled: 'Заполнено', heard: 'Распознанный текст',
    hint: 'Нажмите микрофон у поля и назовите значение. Проверьте перед сохранением.',
    privacy: 'Микрофон включается только по нажатию. Браузер может использовать службу распознавания.',
    unsupported: 'В браузере нет распознавания речи. Поля можно заполнить вручную.',
    permission: 'Разрешите доступ к микрофону в браузере и повторите попытку.',
    network: 'Служба распознавания недоступна. Проверьте соединение или заполните поле вручную.',
    audio: 'Микрофон недоступен. Проверьте подключение и повторите попытку.',
    empty: 'Значение не распознано. Нажмите микрофон и повторите попытку.',
    error: 'Диктовка не удалась. Повторите попытку или заполните поле вручную.',
    limit: 'Диктовка остановлена через 20 секунд. Нажмите микрофон, чтобы продолжить.',
    unavailable: 'Это время недоступно для выбранной даты. Выберите время из списка.',
    fields: { guestName: 'Имя', phone: 'Телефон', reservedDate: 'Дата', reservedTime: 'Время', guestCount: 'Гости', email: 'Email' },
    invalid: { guestName: 'Назовите только имя, например «Иван Петров».', phone: 'Номер неполный или неясный. Продиктуйте телефон целиком.', reservedDate: 'Дата неясна. Назовите день и месяц или скажите «завтра».', reservedTime: 'Время неясно. Скажите, например, «девятнадцать тридцать».', guestCount: 'Назовите число гостей от 1 до 40.', email: 'Адрес неясен. Повторите email или введите его вручную.' },
  },
  en: {
    dictate: 'Dictate', stop: 'Stop', language: 'Dictation language', title: 'Dictation', listening: 'Listening', filled: 'Filled', heard: 'Recognized text',
    hint: 'Press the microphone beside a field and say its value. Review before saving.',
    privacy: 'The microphone starts only when pressed. Your browser may use a speech recognition service.',
    unsupported: 'Speech recognition is unavailable in this browser. You can type into every field.',
    permission: 'Allow microphone access in your browser and try again.',
    network: 'The speech service is unavailable. Check your connection or type the value.',
    audio: 'The microphone is unavailable. Check its connection and try again.',
    empty: 'No value was recognized. Press the microphone and try again.',
    error: 'Dictation failed. Try again or type the value.',
    limit: 'Dictation stopped after 20 seconds. Press the microphone to continue.',
    unavailable: 'This time is unavailable for the selected date. Choose a time from the list.',
    fields: { guestName: 'Name', phone: 'Phone', reservedDate: 'Date', reservedTime: 'Time', guestCount: 'Guests', email: 'Email' },
    invalid: { guestName: 'Say only the name, for example “Ivan Petrov”.', phone: 'The number is incomplete or unclear. Say the whole phone number.', reservedDate: 'The date is unclear. Say a day and month, or “tomorrow”.', reservedTime: 'The time is unclear. Say, for example, “nineteen thirty”.', guestCount: 'Say the number of guests, from 1 to 40.', email: 'The email is unclear. Repeat it or type the address.' },
  },
};

export default function ReservationFieldDictation({ enabled, language = 'bg', currentDate, availableTimes, onApply, children }) {
  const t = copy[language.split('-')[0]] || copy.bg;
  const [speechLanguage, setSpeechLanguage] = React.useState(language.startsWith('ru') ? 'ru-RU' : language.startsWith('en') ? 'en-GB' : 'bg-BG');
  const [activeField, setActiveField] = React.useState(null);
  const [targetField, setTargetField] = React.useState(null);
  const [transcript, setTranscript] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const sessionRef = React.useRef(null);
  const sessionTokenRef = React.useRef(0);
  const activeFieldRef = React.useRef(null);
  const latestRef = React.useRef({ onApply, currentDate, availableTimes });
  React.useEffect(() => { latestRef.current = { onApply, currentDate, availableTimes }; }, [onApply, currentDate, availableTimes]);
  React.useEffect(() => () => {
    sessionTokenRef.current += 1;
    sessionRef.current?.abort();
    sessionRef.current = null;
  }, []);
  React.useEffect(() => {
    if (!enabled) {
      sessionTokenRef.current += 1;
      sessionRef.current?.abort();
      sessionRef.current = null;
      activeFieldRef.current = null;
    }
  }, [enabled]);
  const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  function cancel(field) {
    if (activeFieldRef.current !== field) return;
    sessionTokenRef.current += 1;
    sessionRef.current?.abort();
    sessionRef.current = null;
    activeFieldRef.current = null;
    setActiveField(null);
    setTargetField(null);
    setTranscript('');
    setNotice('');
    setError('');
  }
  function toggle(field) {
    if (!enabled) return;
    if (activeFieldRef.current === field && sessionRef.current) {
      sessionRef.current.stop();
      return;
    }
    sessionTokenRef.current += 1;
    sessionRef.current?.abort();
    sessionRef.current = null;
    activeFieldRef.current = null;
    setActiveField(null);
    setTargetField(field);
    setTranscript('');
    setNotice('');
    setError('');
    if (!Recognition) { setError(t.unsupported); return; }
    const token = sessionTokenRef.current;
    const isCurrent = () => sessionTokenRef.current === token;
    let ended = false;
    let lastFinal = '';
    let lastValue = null;
    let lastIssue = '';
    let sessionError = false;
    activeFieldRef.current = field;
    setActiveField(field);
    const session = startReservationFieldSpeechSession({
      Recognition,
      language: speechLanguage,
      onTranscript: ({ text, finalText }) => {
        if (!isCurrent()) return false;
        setTranscript(text);
        if (!finalText || lastFinal === finalText) return Boolean(lastValue && !lastIssue);
        lastFinal = finalText;
        const parsed = parseVoiceReservationField(field, finalText, new Date(), { language: speechLanguage });
        const current = latestRef.current;
        const unavailable = field === 'reservedTime' && parsed.value && current.availableTimes && !(current.availableTimes(current.currentDate) || []).includes(parsed.value);
        lastIssue = unavailable ? t.unavailable : (parsed.issue || !parsed.value) ? t.invalid[field] || t.error : '';
        if (lastIssue) { setNotice(''); return false; }
        if (lastValue !== parsed.value) {
          lastValue = parsed.value;
          current.onApply({ [field]: parsed.value });
        }
        setError('');
        setNotice(`${t.filled}: ${t.fields[field]} — ${parsed.value}`);
        return true;
      },
      onError: code => {
        if (!isCurrent()) return;
        sessionError = true;
        setError(code === 'not-allowed' || code === 'service-not-allowed' ? t.permission : code === 'network' ? t.network : code === 'audio-capture' ? t.audio : code === 'no-speech' ? t.empty : t.error);
      },
      onLimit: () => { if (isCurrent()) setNotice(t.limit); },
      onEnd: () => {
        ended = true;
        if (!isCurrent()) return;
        sessionRef.current = null;
        activeFieldRef.current = null;
        setActiveField(null);
        if (!sessionError && (lastIssue || !lastValue)) setError(lastIssue || t.empty);
      },
    });
    if (!ended) sessionRef.current = session;
  }
  const context = { enabled, t, speechLanguage, setSpeechLanguage, activeField, targetField, transcript, notice, error, supported: Boolean(Recognition), toggle, cancel };
  return <VoiceFieldContext.Provider value={context}>{children}</VoiceFieldContext.Provider>;
}

export function ReservationVoiceField({ field, label, children }) {
  const voice = React.useContext(VoiceFieldContext);
  if (!voice?.enabled) return children;
  const listening = voice.activeField === field;
  const action = `${listening ? voice.t.stop : voice.t.dictate}: ${label || voice.t.fields[field]}`;
  return (
    <div className="flex min-w-0 items-center gap-1.5" onChangeCapture={() => voice.cancel(field)}>
      <div className="min-w-0 flex-1 [&>input]:w-full [&>select]:w-full">{children}</div>
      <button type="button" data-voice-field={field} aria-label={action} title={action} aria-pressed={listening} onClick={() => voice.toggle(field)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e1bf82] ${listening ? 'border-red-300/55 bg-red-500/20 text-red-200' : 'border-[#c9a56a]/25 bg-[#c9a56a]/5 text-[#d6b57c] hover:border-[#c9a56a]/60 hover:bg-[#c9a56a]/15'}`}>
        {listening ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg> : <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3.5M8.5 21.5h7" /></svg>}
      </button>
    </div>
  );
}

export function ReservationFieldVoiceStatus() {
  const voice = React.useContext(VoiceFieldContext);
  if (!voice?.enabled) return null;
  const { t, activeField, targetField, transcript, notice, error } = voice;
  return (
    <div data-reservation-field-dictation="true" className="min-w-0 space-y-1.5 py-1">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
        <span>{t.title}</span>
        <select aria-label={t.language} value={voice.speechLanguage} disabled={Boolean(activeField)} onChange={event => voice.setSpeechLanguage(event.target.value)} className="min-w-0 rounded-lg border border-white/15 bg-[#15110e] px-2 py-1.5 text-xs text-white/80 disabled:opacity-50"><option value="bg-BG">Български</option><option value="ru-RU">Русский</option><option value="en-GB">English</option></select>
      </div>
      {!activeField && !notice && !error && <p className="text-[11px] leading-relaxed text-white/50">{voice.supported ? t.hint : t.unsupported}</p>}
      {activeField && <p role="status" className="break-words text-xs text-[#e1bf82]">{t.listening}: {t.fields[activeField]}… {transcript}</p>}
      {!activeField && notice && <p role="status" className="break-words text-xs text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="text-xs text-red-200">{targetField && `${t.fields[targetField]}: `}{error}</p>}
      {!activeField && error && transcript && <p className="break-words text-[11px] text-white/55">{t.heard}: {transcript}</p>}
      <p className="text-[10px] leading-relaxed text-white/35">{t.privacy}</p>
    </div>
  );
}
