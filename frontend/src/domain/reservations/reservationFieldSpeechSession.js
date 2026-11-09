// A short, field-specific session. Only finalized speech may update a form.
// onTranscript returns true when the finalized value is complete; incomplete
// phone/name fragments get more time before the microphone stops.
export function startReservationFieldSpeechSession({ Recognition, language, onTranscript, onEnd, onError, onLimit }) {
  let active = true;
  let finished = false;
  let recognition = null;
  let finalText = '';
  let complete = false;
  let restartTimer, silenceTimer, stopTimer, limitTimer;
  const join = (...parts) => parts.filter(Boolean).join(' ').trim();

  function detach(instance) {
    instance.onresult = null;
    instance.onerror = null;
    instance.onend = null;
  }
  function cleanup() {
    clearTimeout(restartTimer);
    clearTimeout(silenceTimer);
    clearTimeout(stopTimer);
    clearTimeout(limitTimer);
    if (recognition) {
      const previous = recognition;
      recognition = null;
      detach(previous);
      try { previous.abort(); } catch { /* The browser may already have ended. */ }
    }
  }
  function finish() {
    if (finished) return;
    finished = true;
    active = false;
    cleanup();
    onEnd();
  }
  function stop() {
    if (finished || !active) return;
    active = false;
    clearTimeout(restartTimer);
    clearTimeout(silenceTimer);
    clearTimeout(limitTimer);
    if (!recognition) { finish(); return; }
    // stop(), unlike abort(), gives the final utterance a chance to arrive.
    stopTimer = setTimeout(finish, 1500);
    try { recognition.stop(); } catch { finish(); }
  }
  function begin() {
    if (finished || !active) return;
    const baseText = finalText;
    let instance;
    try { instance = new Recognition(); } catch { onError('start'); finish(); return; }
    recognition = instance;
    instance.lang = language;
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;
    instance.onresult = event => {
      if (finished || recognition !== instance) return;
      const results = Array.from(event.results);
      finalText = join(baseText, ...results.filter(result => result.isFinal).map(result => result[0].transcript));
      complete = Boolean(onTranscript({ text: join(baseText, ...results.map(result => result[0].transcript)), finalText }));
      if (active) {
        clearTimeout(silenceTimer);
        const hasInterim = results.some(result => !result.isFinal);
        silenceTimer = setTimeout(stop, complete && !hasInterim ? 1500 : 5000);
      }
    };
    instance.onerror = event => {
      if (finished || recognition !== instance) return;
      if (!active && event.error === 'aborted') return;
      onError(event.error);
      finish();
    };
    instance.onend = () => {
      if (finished || recognition !== instance) return;
      recognition = null;
      detach(instance);
      if (active && !complete) restartTimer = setTimeout(begin, 150);
      else finish();
    };
    try { instance.start(); } catch { onError('start'); finish(); }
  }
  limitTimer = setTimeout(() => { onLimit(); stop(); }, 20000);
  begin();
  return {
    stop,
    abort() {
      if (finished) return;
      finished = true;
      active = false;
      cleanup();
    },
  };
}
