import React from 'react';
import { parseVoiceReservationField } from '../../domain/reservations/voiceReservationField';
import { startReservationFieldSpeechSession } from '../../domain/reservations/reservationFieldSpeechSession';
import { startReservationAudioSession } from '../../domain/reservations/reservationAudioSession';
import { getReservationSpeechCapabilities, transcribeReservationAudio } from '../../domain/reservations/reservationSpeechTransport';
import { createReservationLocalSpeech } from '../../domain/reservations/reservationLocalSpeech';

const VoiceFieldContext = React.createContext(null);
const DICTATION_FIELDS = new Set(['guestName', 'phone']);
const copy = {
  bg: {
    dictate: 'Диктувай', stop: 'Спри', language: 'Език на диктовката', title: 'Диктовка', listening: 'Слушам', filled: 'Попълнено', heard: 'Разпознат текст',
    hint: 'Натисни микрофона до полето и кажи стойността. Провери преди запис.',
    privacy: 'Записът започва само с натискане и се изпраща до нашата услуга за разпознаване. Не се запазва в резервацията.',
    starting: 'Разрешаване на микрофона', processing: 'Разпознавам', checking: 'Проверявам диктовката…', offline: 'Диктовката още не е свързана. Можеш да попълниш полетата ръчно.',
    timeout: 'Няма отговор от услугата. Опитай отново.', busy: 'Диктовката е заета. Изчакай малко и опитай отново.', cancel: 'Отмени', pastDate: 'Датата е в миналото. Избери предстояща дата.',
    manualHint: 'Кажи стойността и натисни стоп.',
    phoneHint: 'Кажи цифрите една по една, с кратка пауза. После натисни стоп.',
    prepareLocal: 'Подготви диктовката на устройството', preparingLocal: 'Подготвям диктовката',
    localHint: 'Без платена услуга. Първата подготовка изтегля около 100 MB — използвай Wi-Fi. После моделът може да се използва от кеша на браузъра.',
    localPrivacy: 'Аудиото се разпознава на това устройство и не се изпраща към сървър.',
    localReview: 'Провери името и телефона. Останалите полета се попълват ръчно.',
    reviewPhone: 'Разпознат телефон', usePhone: 'Използвай този номер',
    localUnsupported: 'Това устройство не поддържа локалната диктовка. Полетата остават достъпни за ръчно въвеждане.',
    localFailed: 'Диктовката не успя да се подготви. Провери връзката и свободната памет, след което опитай отново.',
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
    phoneHint: 'Называйте цифры по одной, с короткой паузой. Затем нажмите стоп.',
    prepareLocal: 'Подготовить диктовку на устройстве', preparingLocal: 'Подготавливаю диктовку',
    localHint: 'Без платного сервиса. Первая подготовка загружает около 100 МБ — используйте Wi-Fi. Затем модель может загружаться из кэша браузера.',
    localPrivacy: 'Звук распознаётся на этом устройстве и не отправляется на сервер.',
    localReview: 'Проверьте имя и телефон. Остальные поля заполняются вручную.',
    reviewPhone: 'Распознанный телефон', usePhone: 'Использовать этот номер',
    localUnsupported: 'Это устройство не поддерживает локальную диктовку. Поля можно заполнить вручную.',
    localFailed: 'Не удалось подготовить диктовку. Проверьте соединение и свободную память, затем повторите попытку.',
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
    phoneHint: 'Say each digit separately, with a short pause. Then press stop.',
    prepareLocal: 'Prepare dictation on this device', preparingLocal: 'Preparing dictation',
    localHint: 'No paid service. Initial preparation downloads about 100 MB — use Wi-Fi. The model can then be reused from the browser cache.',
    localPrivacy: 'Audio is recognized on this device and is not sent to a server.',
    localReview: 'Review the name and phone number. Fill in the remaining fields manually.',
    reviewPhone: 'Recognized phone number', usePhone: 'Use this number',
    localUnsupported: 'This device does not support local dictation. You can still type into every field.',
    localFailed: 'Dictation could not be prepared. Check your connection and available memory, then try again.',
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

export default function ReservationFieldDictation({ enabled, language = 'bg', currentDate, minDate, availableTimes, onApply, request, baseUrl, allowBrowserRecognition = false, localRecognition = false, localSpeechClient, children }) {
  const t = copy[language.split('-')[0]] || copy.bg;
  const id = React.useId();
  const [speechLanguage, setSpeechLanguage] = React.useState(localRecognition ? 'bg-BG' : language.startsWith('ru') ? 'ru-RU' : language.startsWith('en') ? 'en-GB' : 'bg-BG');
  const [service, setService] = React.useState({ enabled: false, languages: [], loading: true });
  const [localState, setLocalState] = React.useState({ status: 'idle', progress: null, error: null });
  const localRef = React.useRef(null);
  const preparationRef = React.useRef(null);
  const [activeField, setActiveField] = React.useState(null);
  const [phase, setPhase] = React.useState('idle');
  const [silenceDetection, setSilenceDetection] = React.useState(false);
  const [targetField, setTargetField] = React.useState(null);
  const [transcript, setTranscript] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const [phoneReview, setPhoneReview] = React.useState(null);
  const phoneReviewRef = React.useRef(null);
  const sessionRef = React.useRef(null);
  const sessionTokenRef = React.useRef(0);
  const activeFieldRef = React.useRef(null);
  const latestRef = React.useRef({ onApply, currentDate, minDate, availableTimes });
  React.useEffect(() => { latestRef.current = { onApply, currentDate, minDate, availableTimes }; }, [onApply, currentDate, minDate, availableTimes]);

  const cancel = React.useCallback((field) => {
    if (field && activeFieldRef.current !== field && !(field === 'phone' && phoneReviewRef.current)) return;
    sessionTokenRef.current += 1;
    preparationRef.current?.abort();
    preparationRef.current = null;
    sessionRef.current?.abort();
    sessionRef.current = null;
    activeFieldRef.current = null;
    setActiveField(null);
    setPhase('idle');
    setTargetField(null);
    setTranscript('');
    setNotice('');
    setError('');
    phoneReviewRef.current = null;
    setPhoneReview(null);
  }, []);

  React.useEffect(() => {
    if (!enabled || !localRecognition) return;
    const client = localSpeechClient || createReservationLocalSpeech();
    localRef.current = client;
    setLocalState(client.getSnapshot());
    const unsubscribe = client.subscribe(setLocalState);
    return () => {
      preparationRef.current?.abort();
      preparationRef.current = null;
      unsubscribe();
      if (!localSpeechClient) client.dispose();
      if (localRef.current === client) localRef.current = null;
    };
  }, [enabled, localRecognition, localSpeechClient]);

  async function prepareLocal() {
    if (!enabled || !localRecognition || !localRef.current) return;
    if (!audioSupported) { setError(t.unsupported); return; }
    cancel();
    window.dispatchEvent(new CustomEvent('reservation-dictation-start', { detail: id }));
    const controller = new AbortController();
    preparationRef.current = controller;
    try { await localRef.current.prepare({ signal: controller.signal }); }
    catch (error) {
      if (!controller.signal.aborted) setError(error?.code === 'local-unsupported' ? t.localUnsupported : t.localFailed);
    } finally { if (preparationRef.current === controller) preparationRef.current = null; }
  }

  React.useEffect(() => {
    if (!enabled || !request || localRecognition) return;
    let disposed = false;
    setService({ enabled: false, languages: [], loading: true });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    getReservationSpeechCapabilities(request, baseUrl, controller.signal)
      .then(result => { if (!disposed && !controller.signal.aborted) setService({ ...result, loading: false }); })
      .catch(() => { if (!disposed) setService({ enabled: false, languages: [], loading: false }); })
      .finally(() => clearTimeout(timeout));
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [enabled, request, baseUrl, localRecognition]);

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
      preparationRef.current?.abort();
      sessionRef.current?.abort();
      sessionRef.current = null;
    };
  }, [cancel, id]);
  React.useEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);

  const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const audioSupported = typeof window !== 'undefined' && Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia && window.isSecureContext);
  const serverMode = !localRecognition && service.enabled && service.languages.includes(speechLanguage.split('-')[0]);
  const browserMode = !localRecognition && !serverMode && allowBrowserRecognition && Boolean(Recognition);
  const supported = localRecognition ? audioSupported && ['ready', 'processing'].includes(localState.status) : serverMode ? audioSupported : browserMode;
  const checking = !localRecognition && Boolean(request && service.loading && !allowBrowserRecognition);

  function toggle(field) {
    if (!enabled || !DICTATION_FIELDS.has(field)) return;
    if (activeFieldRef.current === field && sessionRef.current) {
      if (phase === 'processing' || phase === 'starting') cancel(field);
      else sessionRef.current.stop();
      return;
    }
    cancel();
    if (localRecognition && localRef.current?.getSnapshot().status !== 'ready') return;
    window.dispatchEvent(new CustomEvent('reservation-dictation-start', { detail: id }));
    setTargetField(field);
    if (!supported) { setError(localRecognition ? t.localUnsupported : serverMode ? t.unsupported : t.offline); return; }
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
          'local-unsupported': t.localUnsupported, 'local-not-ready': t.localFailed,
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
          if (localRecognition && field === 'phone') {
            // Real local-model tests showed plausible wrong digits. The admin
            // must explicitly accept the visible number before it edits a contact.
            phoneReviewRef.current = candidate;
            setPhoneReview(candidate);
            setNotice('');
            setError('');
            return;
          }
          current.onApply({ [field]: candidate });
          setNotice(`${t.filled}: ${t.fields[field]} — ${candidate}`);
          setError('');
        } else setError(lastIssue || t.empty);
      },
    };
    const session = serverMode || localRecognition
      ? startReservationAudioSession({
        ...callbacks, field,
        mediaDevices: navigator.mediaDevices,
        MediaRecorder: window.MediaRecorder,
        AudioContext: window.AudioContext || window.webkitAudioContext,
        transcribe: audio => localRecognition ? localRef.current.transcribe(audio) : transcribeReservationAudio(request, baseUrl, audio),
      })
      : startReservationFieldSpeechSession({ ...callbacks, Recognition });
    if (!ended) sessionRef.current = session;
  }
  function acceptPhone() {
    const value = phoneReviewRef.current;
    if (!value || activeFieldRef.current) return;
    phoneReviewRef.current = null;
    setPhoneReview(null);
    latestRef.current.onApply({ phone: value });
    setNotice(`${t.filled}: ${t.fields.phone} — ${value}`);
  }
  const context = { enabled, id, t, speechLanguage, setSpeechLanguage, activeField, phase, silenceDetection, targetField, transcript, notice, error, supported, checking, serverMode, audioSupported, localRecognition, localState, prepareLocal, phoneReview, acceptPhone, toggle, cancel };
  return <VoiceFieldContext.Provider value={context}><div className="contents" onSubmitCapture={() => cancel()} onKeyDown={event => { if (event.key === 'Escape') cancel(); }}>{children}</div></VoiceFieldContext.Provider>;
}

export function ReservationVoiceField({ field, label, children }) {
  const voice = React.useContext(VoiceFieldContext);
  if (!voice?.enabled || !DICTATION_FIELDS.has(field)) return children;
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
        {voice.localRecognition ? <span className="rounded-lg border border-white/15 px-2 py-1.5 text-white/80">Български</span> : <select name="reservationDictationLanguage" aria-label={t.language} value={voice.speechLanguage} disabled={Boolean(activeField)} onChange={event => voice.setSpeechLanguage(event.target.value)} className="min-w-0 rounded-lg border border-white/15 bg-[#15110e] px-2 py-1.5 text-xs text-white/80 disabled:opacity-50"><option value="bg-BG">Български</option><option value="ru-RU">Русский</option><option value="en-GB">English</option></select>}
      </div>
      {voice.localRecognition && !['ready', 'processing'].includes(voice.localState.status) && <div className="space-y-2 rounded-xl border border-[#c9a56a]/20 p-3">
        <p className="text-xs leading-relaxed text-white/65">{voice.audioSupported ? t.localHint : t.unsupported}</p>
        {voice.localState.status === 'preparing' ? <>
          <p role="status" className="text-xs text-[#e1bf82]">{t.preparingLocal}{Number.isFinite(voice.localState.progress?.percent) ? ` · ${Math.round(voice.localState.progress.percent)}%` : '…'}</p>
          <progress aria-label={t.preparingLocal} max="100" value={voice.localState.progress?.percent ?? undefined} className="block h-1.5 w-full accent-[#c9a56a]" />
          <button type="button" onClick={() => voice.cancel()} className="min-h-11 rounded-xl border border-white/20 px-4 text-xs text-white/75">{t.cancel}</button>
        </> : <button type="button" data-voice-prepare="true" onClick={voice.prepareLocal} className="min-h-11 rounded-xl border border-[#c9a56a]/40 bg-[#c9a56a]/10 px-4 py-2 text-left text-xs text-[#e1bf82]">{t.prepareLocal}</button>}
      </div>}
      {!activeField && !notice && !error && !voice.phoneReview && (!voice.localRecognition || voice.supported) && <p className="text-[11px] leading-relaxed text-white/50">{voice.checking ? t.checking : voice.supported ? t.hint : t.offline}</p>}
      {activeField && <p role="status" className="break-words text-xs text-[#e1bf82]">{phase === 'starting' ? t.starting : phase === 'processing' ? t.processing : t.listening}: {t.fields[activeField]}… {transcript}</p>}
      {activeField && phase === 'listening' && (voice.serverMode || voice.localRecognition) && <p className="text-[11px] text-white/55">{voice.localRecognition && activeField === 'phone' ? t.phoneHint : silenceDetection ? t.recordingHint : t.manualHint}</p>}
      {!activeField && notice && <p role="status" className="break-words text-sm font-medium text-emerald-200">{notice}</p>}
      {voice.phoneReview && <div role="status" className="space-y-2 rounded-xl border border-[#c9a56a]/35 bg-[#c9a56a]/5 p-3">
        <p className="text-xs text-white/65">{t.reviewPhone}</p>
        <p className="break-all font-mono text-lg text-[#e1bf82]">{voice.phoneReview}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-voice-accept-phone="true" onClick={voice.acceptPhone} className="min-h-11 rounded-xl bg-[#c9a56a] px-4 text-sm font-medium text-[#15110e]">{t.usePhone}</button>
          <button type="button" onClick={() => voice.cancel()} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm text-white/75">{t.cancel}</button>
        </div>
      </div>}
      {voice.localRecognition && voice.supported && <p className="text-xs leading-relaxed text-white/65">{t.localReview}</p>}
      {error && <p role="alert" className="text-xs text-red-200">{targetField && `${t.fields[targetField]}: `}{error}</p>}
      {!error && voice.localRecognition && voice.localState.status === 'error' && <p role="alert" className="text-xs text-red-200">{voice.localState.error === 'local-unsupported' ? t.localUnsupported : t.localFailed}</p>}
      {!activeField && error && transcript && <p className="break-words text-[11px] text-white/55">{t.heard}: {transcript}</p>}
      <p className="text-[10px] leading-relaxed text-white/35">{voice.localRecognition ? t.localPrivacy : voice.serverMode ? t.privacy : voice.supported ? "Local preview · browser speech service" : ""}</p>
    </div>
  );
}
