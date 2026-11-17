import React from 'react';
import { parseVoiceReservationField } from '../../domain/reservations/voiceReservationField';
import { startReservationFieldSpeechSession } from '../../domain/reservations/reservationFieldSpeechSession';
import { startReservationAudioSession } from '../../domain/reservations/reservationAudioSession';
import { getReservationSpeechCapabilities, transcribeReservationAudio } from '../../domain/reservations/reservationSpeechTransport';

const VoiceFieldContext = React.createContext(null);
const copy = {
  bg: {
    dictate: 'Диктувай', stop: 'Спри', language: 'Език на диктовката', title: 'Диктовка', listening: 'Слушам', filled: 'Попълнено', heard: 'Разпознат текст',
    hint: 'Натисни микрофона до полето и кажи стойността. Провери преди запис.',
    privacy: 'Записът започва само с натискане и се изпраща до нашата услуга за разпознаване. Не се запазва в резервацията.',
    starting: 'Разрешаване на микрофона', processing: 'Разпознавам', checking: 'Проверявам диктовката…', offline: 'Диктовката още не е свързана. Можеш да попълниш полетата ръчно.',
    timeout: 'Няма отговор от услугата. Опитай отново.', busy: 'Диктовката е заета. Изчакай малко и опитай отново.', cancel: 'Отмени', pastDate: 'Датата е в миналото. Избери предстояща дата.',
    manualHint: 'Кажи стойността и натисни стоп.',
    recordingHint: 'Кажи стойността и натисни стоп. Записът приключва и след пауза.',
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
    privacy: 'Запись начинается только по нажатию и отправляется нашему сервису распознавания. В брони она не сохраняется.',
    starting: 'Доступ к микрофону', processing: 'Распознаю', checking: 'Проверяю диктовку…', offline: 'Диктовка пока не подключена. Поля можно заполнить вручную.',
    timeout: 'Сервис не ответил. Повторите попытку.', busy: 'Диктовка занята. Подождите немного и повторите.', cancel: 'Отменить', pastDate: 'Дата уже прошла. Выберите будущую дату.',
    manualHint: 'Назовите значение и нажмите стоп.',
    recordingHint: 'Назовите значение и нажмите стоп. Запись также завершится после паузы.',
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
    privacy: 'Recording starts only when pressed and is sent to our speech service. Audio is not saved in the reservation.',
    starting: 'Allow microphone access', processing: 'Recognizing', checking: 'Checking dictation…', offline: 'Dictation is not connected yet. You can type into every field.',
    timeout: 'The speech service did not respond. Please try again.', busy: 'Dictation is busy. Please wait a moment and try again.', cancel: 'Cancel', pastDate: 'This date has passed. Choose an upcoming date.',
    manualHint: 'Say the value and press stop.',
    recordingHint: 'Say the value and press stop. Recording also ends after a pause.',
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

export default function ReservationFieldDictation({ enabled, language = 'bg', currentDate, minDate, availableTimes, onApply, request, baseUrl, allowBrowserRecognition = false, children }) {
  const t = copy[language.split('-')[0]] || copy.bg;
  const id = React.useId();
  const [speechLanguage, setSpeechLanguage] = React.useState(language.startsWith('ru') ? 'ru-RU' : language.startsWith('en') ? 'en-GB' : 'bg-BG');
  const [service, setService] = React.useState({ enabled: false, languages: [], loading: true });
  const [activeField, setActiveField] = React.useState(null);
  const [phase, setPhase] = React.useState('idle');
  const [silenceDetection, setSilenceDetection] = React.useState(false);
  const [targetField, setTargetField] = React.useState(null);
  const [transcript, setTranscript] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const sessionRef = React.useRef(null);
  const sessionTokenRef = React.useRef(0);
  const activeFieldRef = React.useRef(null);
  const latestRef = React.useRef({ onApply, currentDate, minDate, availableTimes });
  React.useEffect(() => { latestRef.current = { onApply, currentDate, minDate, availableTimes }; }, [onApply, currentDate, minDate, availableTimes]);

  const cancel = React.useCallback((field) => {
    if (field && activeFieldRef.current !== field) return;
    sessionTokenRef.current += 1;
    sessionRef.current?.abort();
    sessionRef.current = null;
    activeFieldRef.current = null;
    setActiveField(null);
    setPhase('idle');
    setTargetField(null);
    setTranscript('');
    setNotice('');
    setError('');
  }, []);

  React.useEffect(() => {
    if (!enabled || !request) return;
    let disposed = false;
    setService({ enabled: false, languages: [], loading: true });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    getReservationSpeechCapabilities(request, baseUrl, controller.signal)
      .then(result => { if (!disposed && !controller.signal.aborted) setService({ ...result, loading: false }); })
      .catch(() => { if (!disposed) setService({ enabled: false, languages: [], loading: false }); })
      .finally(() => clearTimeout(timeout));
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [enabled, request, baseUrl]);

  React.useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    const pageHide = () => cancel();
    const otherSession = event => { if (event.detail !== id) cancel(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('reservation-dictation-start', otherSession);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('reservation-dictation-start', otherSession);
      sessionTokenRef.current += 1;
      sessionRef.current?.abort();
      sessionRef.current = null;
    };
  }, [cancel, id]);
  React.useEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);

  const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const audioSupported = typeof window !== 'undefined' && Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia && window.isSecureContext);
  const serverMode = service.enabled && service.languages.includes(speechLanguage.split('-')[0]);
  const browserMode = !serverMode && allowBrowserRecognition && Boolean(Recognition);
  const supported = serverMode ? audioSupported : browserMode;
  const checking = Boolean(request && service.loading && !allowBrowserRecognition);

  function toggle(field) {
    if (!enabled) return;
    if (activeFieldRef.current === field && sessionRef.current) {
      if (phase === 'processing' || phase === 'starting') cancel(field);
      else sessionRef.current.stop();
      return;
    }
    cancel();
    window.dispatchEvent(new CustomEvent('reservation-dictation-start', { detail: id }));
    setTargetField(field);
    if (!supported) { setError(serverMode ? t.unsupported : t.offline); return; }
    const token = sessionTokenRef.current;
    const isCurrent = () => sessionTokenRef.current === token;
    let ended = false;
    let lastFinal = '';
    let candidate = null;
    let lastIssue = '';
    let sessionError = false;
    activeFieldRef.current = field;
    setActiveField(field);
    setPhase('starting');
    const callbacks = {
      language: speechLanguage,
      onStart: (metadata) => { if (isCurrent()) { setPhase('listening'); setSilenceDetection(Boolean(metadata?.silenceDetection)); } },
      onProcessing: () => { if (isCurrent()) setPhase('processing'); },
      onTranscript: ({ text, finalText }) => {
        if (!isCurrent()) return false;
        setTranscript(text);
        if (!finalText || lastFinal === finalText) return Boolean(candidate && !lastIssue);
        lastFinal = finalText;
        const parsed = parseVoiceReservationField(field, finalText, new Date(), { language: speechLanguage });
        const current = latestRef.current;
        const unavailable = field === 'reservedTime' && parsed.value && current.availableTimes && !(current.availableTimes(current.currentDate) || []).includes(parsed.value);
        const pastDate = field === 'reservedDate' && parsed.value && current.minDate && parsed.value < current.minDate;
        lastIssue = unavailable ? t.unavailable : pastDate ? t.pastDate : (parsed.issue || !parsed.value) ? t.invalid[field] || t.error : '';
        candidate = lastIssue ? null : parsed.value;
        return Boolean(candidate);
      },
      onError: code => {
        if (!isCurrent()) return;
        sessionError = true;
        const errors = {
          'not-allowed': t.permission, 'service-not-allowed': t.permission,
          'network': t.network, 'recognition-unavailable': t.network, 'unavailable': t.network,
          'audio-capture': t.audio, 'no-speech': t.empty, 'no-match': t.empty,
          'language-not-supported': t.unsupported, 'unsupported': t.unsupported,
          'start-timeout': t.timeout, 'timeout': t.timeout, 'transcription-timeout': t.timeout,
          'busy': t.busy, 'rate-limited': t.busy,
        };
        setError(errors[code] || t.error);
      },
      onLimit: () => { if (isCurrent()) setNotice(t.limit); },
      onEnd: () => {
        ended = true;
        if (!isCurrent()) return;
        sessionRef.current = null;
        activeFieldRef.current = null;
        setActiveField(null);
        setPhase('idle');
        if (sessionError) return;
        // Commit the complete utterance once; never leave a valid prefix behind
        // when the remainder is ambiguous, cancelled, or typed over manually.
        if (candidate && !lastIssue) {
          const current = latestRef.current;
          if (field === 'reservedTime' && current.availableTimes && !(current.availableTimes(current.currentDate) || []).includes(candidate)) {
            setError(t.unavailable); return;
          }
          current.onApply({ [field]: candidate });
          setNotice(`${t.filled}: ${t.fields[field]} — ${candidate}`);
          setError('');
        } else setError(lastIssue || t.empty);
      },
    };
    const session = serverMode
      ? startReservationAudioSession({
        ...callbacks, field,
        mediaDevices: navigator.mediaDevices,
        MediaRecorder: window.MediaRecorder,
        AudioContext: window.AudioContext || window.webkitAudioContext,
        transcribe: audio => transcribeReservationAudio(request, baseUrl, audio),
      })
      : startReservationFieldSpeechSession({ ...callbacks, Recognition });
    if (!ended) sessionRef.current = session;
  }
  const context = { enabled, id, t, speechLanguage, setSpeechLanguage, activeField, phase, silenceDetection, targetField, transcript, notice, error, supported, checking, serverMode, toggle, cancel };
  return <VoiceFieldContext.Provider value={context}><div className="contents" onSubmitCapture={() => cancel()} onKeyDown={event => { if (event.key === 'Escape') cancel(); }}>{children}</div></VoiceFieldContext.Provider>;
}

export function ReservationVoiceField({ field, label, children }) {
  const voice = React.useContext(VoiceFieldContext);
  if (!voice?.enabled) return children;
  const listening = voice.activeField === field;
  const action = `${listening ? (voice.phase === 'processing' || voice.phase === 'starting' ? voice.t.cancel : voice.t.stop) : voice.t.dictate}: ${label || voice.t.fields[field]}`;
  return (
    <div className="flex min-w-0 items-center gap-1.5" onChangeCapture={() => voice.cancel(field)}>
      <div className="min-w-0 flex-1 [&>input]:w-full [&>select]:w-full">{children}</div>
      <button type="button" data-voice-field={field} aria-label={action} title={action} aria-pressed={listening} aria-describedby={`${voice.id}-status`} disabled={!listening && (voice.checking || !voice.supported)} onClick={() => voice.toggle(field)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e1bf82] ${listening ? 'border-red-300/55 bg-red-500/20 text-red-200' : 'border-[#c9a56a]/25 bg-[#c9a56a]/5 text-[#d6b57c] hover:border-[#c9a56a]/60 hover:bg-[#c9a56a]/15'}`}>
        {listening ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg> : <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3.5M8.5 21.5h7" /></svg>}
      </button>
    </div>
  );
}

export function ReservationFieldVoiceStatus() {
  const voice = React.useContext(VoiceFieldContext);
  if (!voice?.enabled) return null;
  const { t, activeField, phase, silenceDetection, targetField, transcript, notice, error } = voice;
  return (
    <div id={`${voice.id}-status`} data-reservation-field-dictation="true" data-voice-phase={phase} className="min-w-0 space-y-1.5 py-1">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
        <span>{t.title}</span>
        <select name="reservationDictationLanguage" aria-label={t.language} value={voice.speechLanguage} disabled={Boolean(activeField)} onChange={event => voice.setSpeechLanguage(event.target.value)} className="min-w-0 rounded-lg border border-white/15 bg-[#15110e] px-2 py-1.5 text-xs text-white/80 disabled:opacity-50"><option value="bg-BG">Български</option><option value="ru-RU">Русский</option><option value="en-GB">English</option></select>
      </div>
      {!activeField && !notice && !error && <p className="text-[11px] leading-relaxed text-white/50">{voice.checking ? t.checking : voice.supported ? t.hint : t.offline}</p>}
      {activeField && <p role="status" className="break-words text-xs text-[#e1bf82]">{phase === 'starting' ? t.starting : phase === 'processing' ? t.processing : t.listening}: {t.fields[activeField]}… {transcript}</p>}
      {activeField && phase === 'listening' && voice.serverMode && <p className="text-[11px] text-white/55">{silenceDetection ? t.recordingHint : t.manualHint}</p>}
      {!activeField && notice && <p role="status" className="break-words text-xs text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="text-xs text-red-200">{targetField && `${t.fields[targetField]}: `}{error}</p>}
      {!activeField && error && transcript && <p className="break-words text-[11px] text-white/55">{t.heard}: {transcript}</p>}
      <p className="text-[10px] leading-relaxed text-white/35">{voice.serverMode ? t.privacy : voice.supported ? "Local preview · browser speech service" : ""}</p>
    </div>
  );
}
