// Only finalized speech may update a field. onTranscript returns true when the
// complete value is valid; interim hypotheses are for display only.
// onStart signals real microphone readiness, not merely a requested permission.
export function startReservationFieldSpeechSession({ Recognition, language, onStart, onTranscript, onEnd, onError, onLimit }) {
  const startWaitMs = 12000;
  const recordingLimitMs = 20000;
  const flushWaitMs = 1500;
  const completePauseMs = 1500;
  const incompletePauseMs = 5000;
  const maxRestarts = 3;
  let active = true;
  let finished = false;
  let recognition = null;
  let instanceStarted = false;
  let sessionStarted = false;
  let restartCount = 0;
  let finalText = '';
  let complete = false;
  let lastTranscript = null;
  let restartTimer, startTimer, silenceTimer, stopTimer, limitTimer;
  const join = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();

  function detach(instance) {
    instance.onstart = null;
    instance.onspeechstart = null;
    instance.onspeechend = null;
    instance.onresult = null;
    instance.onnomatch = null;
    instance.onerror = null;
    instance.onend = null;
  }
  function cleanup() {
    clearTimeout(restartTimer);
    clearTimeout(startTimer);
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
    onEnd?.();
  }
  function fail(code) {
    if (finished) return;
    onError?.(code);
    finish();
  }
  function stop() {
    if (finished || !active) return;
    active = false;
    clearTimeout(restartTimer);
    clearTimeout(startTimer);
    clearTimeout(silenceTimer);
    clearTimeout(limitTimer);
    // Cancelling a permission request has no recorded utterance to flush.
    if (!recognition || !instanceStarted) { finish(); return; }
    // stop(), unlike abort(), lets the engine finalize already captured audio.
    // A provider that never emits end cannot keep the field stuck in this state.
    stopTimer = setTimeout(finish, flushWaitMs);
    try { recognition.stop(); } catch { finish(); }
  }
  function begin() {
    if (finished || !active) return;
    const baseText = finalText;
    let instance;
    try { instance = new Recognition(); } catch { fail('start'); return; }
    recognition = instance;
    instanceStarted = false;
    const isCurrent = () => !finished && recognition === instance;
    let speechInProgress = false;
    let awaitingFinal = false;
    function waitForSilence() {
      clearTimeout(silenceTimer);
      if (isCurrent() && active && !speechInProgress)
        silenceTimer = setTimeout(stop, complete && !awaitingFinal ? completePauseMs : incompletePauseMs);
    }
    instance.onstart = () => {
      if (!isCurrent() || !active || instanceStarted) return;
      instanceStarted = true;
      clearTimeout(startTimer);
      if (!sessionStarted) {
        sessionStarted = true;
        limitTimer = setTimeout(() => {
          if (finished || !active) return;
          onLimit?.();
          stop();
        }, recordingLimitMs);
        onStart?.();
      }
    };
    instance.onspeechstart = () => {
      if (!isCurrent() || !active) return;
      speechInProgress = true;
      awaitingFinal = true;
      clearTimeout(silenceTimer);
    };
    instance.onspeechend = () => {
      if (!isCurrent() || !active) return;
      speechInProgress = false;
      waitForSilence();
    };
    instance.onresult = event => {
      if (!isCurrent()) return;
      // SpeechRecognitionEvent.results is cumulative for this recognizer, not
      // just its latest chunk. Rebuild it so repeated events never append twice.
      const results = Array.from(event.results || []);
      const transcript = {
        text: join(baseText, ...results.map(result => result[0]?.transcript)),
        finalText: join(baseText, ...results.filter(result => result.isFinal).map(result => result[0]?.transcript)),
      };
      if (lastTranscript?.text === transcript.text && lastTranscript.finalText === transcript.finalText) return;
      lastTranscript = transcript;
      finalText = transcript.finalText;
      complete = Boolean(onTranscript(transcript));
      // A consumer may cancel/switch fields synchronously while applying text.
      if (!isCurrent() || !active) return;
      awaitingFinal = results.some(result => !result.isFinal);
      waitForSilence();
    };
    instance.onnomatch = () => {
      if (!isCurrent()) return;
      if (complete) finish();
      else fail('no-match');
    };
    instance.onerror = event => {
      if (!isCurrent()) return;
      if (!active && event.error === 'aborted') { finish(); return; }
      fail(event.error || 'start');
    };
    instance.onend = () => {
      if (!isCurrent()) return;
      recognition = null;
      detach(instance);
      clearTimeout(startTimer);
      clearTimeout(silenceTimer);
      // A normal engine disconnect may split a spoken phone number. Continue
      // only when this run added useful finalized text; never retry empty ends
      // or replay a blocked permission/service indefinitely.
      if (active && !complete && finalText !== baseText && restartCount < maxRestarts) {
        restartCount += 1;
        restartTimer = setTimeout(begin, 250 * restartCount);
      } else if (active && !finalText) {
        fail(instanceStarted ? 'no-speech' : 'start');
      } else finish();
    };
    startTimer = setTimeout(() => {
      if (isCurrent() && !instanceStarted) fail('start-timeout');
    }, startWaitMs);
    try {
      instance.lang = language;
      instance.continuous = true;
      instance.interimResults = true;
      instance.maxAlternatives = 1;
      instance.start();
    } catch { if (isCurrent()) fail('start'); }
  }
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
