// Keep finalized speech across browser recognition restarts. Interim text is preview only.
export function startReservationSpeechSession({ Recognition, language, initialText = '', onTranscript, onEnd, onError, onLimit }) {
  let active = true;
  let finished = false;
  let recognition = null;
  let finalText = initialText.trim();
  let restartTimer, stopTimer, limitTimer;
  const join = (...parts) => parts.filter(Boolean).join(' ').trim();

  function detach(instance) {
    instance.onresult = null; instance.onerror = null; instance.onend = null;
  }
  function finish() {
    if (finished) return;
    finished = true; active = false;
    clearTimeout(restartTimer); clearTimeout(stopTimer); clearTimeout(limitTimer);
    if (recognition) {
      const previous = recognition;
      recognition = null; detach(previous);
      try { previous.abort(); } catch { /* Already ended. */ }
    }
    onTranscript({ text: finalText, finalText });
    onEnd();
  }
  function stop() {
    if (finished || !active) return;
    active = false;
    clearTimeout(restartTimer); clearTimeout(limitTimer);
    if (!recognition) { finish(); return; }
    // Allow the browser to deliver the final result from the last utterance.
    stopTimer = setTimeout(finish, 1500);
    try { recognition.stop(); } catch { finish(); }
  }
  function begin() {
    if (!active || finished) return;
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
      onTranscript({ text: join(baseText, ...results.map(result => result[0].transcript)), finalText });
    };
    instance.onerror = event => {
      if (finished || recognition !== instance) return;
      if (event.error === 'no-speech' || (!active && event.error === 'aborted')) return;
      onError(event.error); finish();
    };
    instance.onend = () => {
      if (finished || recognition !== instance) return;
      recognition = null; detach(instance);
      if (active) restartTimer = setTimeout(begin, 250);
      else finish();
    };
    try { instance.start(); } catch { onError('start'); finish(); }
  }
  limitTimer = setTimeout(() => { onLimit(); stop(); }, 90000);
  begin();
  return {
    stop,
    abort() {
      // Unmount must not update a draft or deliver a late transcript.
      if (finished) return;
      finished = true; active = false;
      clearTimeout(restartTimer); clearTimeout(stopTimer); clearTimeout(limitTimer);
      if (recognition) {
        const previous = recognition;
        recognition = null; detach(previous);
        try { previous.abort(); } catch { /* Already ended. */ }
      }
    },
  };
}
