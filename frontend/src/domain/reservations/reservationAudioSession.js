// Short, explicitly started recording for server transcription. Audio stays in
// memory and is handed only to the injected transcribe adapter after capture ends.
export function startReservationAudioSession({
  mediaDevices, MediaRecorder, AudioContext, language, field, transcribe,
  onStart, onProcessing, onTranscript, onError, onEnd, onLimit,
}) {
  const maxBytes = 5 * 1024 * 1024;
  const maxRecordingMs = 20000;
  const sampleMs = 100;
  const silenceMs = field === 'phone' ? 2000 : 1800;
  let finished = false;
  let phase = 'starting';
  let stream = null;
  let recorder = null;
  let audioContext = null;
  let source = null;
  let analyser = null;
  let samples = null;
  let useFloatSamples = true;
  let hasSpeech = false;
  let loudSamples = 0;
  let lastSpeechAt = 0;
  let recordingStartedAt = 0;
  let chunks = [];
  let bytes = 0;
  let startTimer, recordingTimer, stopTimer, processingTimer, sampleTimer;
  const controller = new AbortController();
  const stopTracks = value => {
    for (const track of value?.getTracks?.() || []) {
      try { track.stop(); } catch { /* A disconnected device may already be gone. */ }
    }
  };

  function closeAudio() {
    clearTimeout(sampleTimer);
    try { source?.disconnect(); } catch { /* Already disconnected. */ }
    source = null;
    analyser = null;
    samples = null;
    if (audioContext) {
      const previous = audioContext;
      audioContext = null;
      try { Promise.resolve(previous.close()).catch(() => {}); } catch { /* Already closed. */ }
    }
    const previous = stream;
    stream = null;
    stopTracks(previous);
  }
  function detachRecorder() {
    if (!recorder) return;
    recorder.onstart = null;
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;
  }
  function cleanup() {
    clearTimeout(startTimer);
    clearTimeout(recordingTimer);
    clearTimeout(stopTimer);
    clearTimeout(processingTimer);
    detachRecorder();
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* stop may have raced a device failure. */ }
    }
    recorder = null;
    closeAudio();
    chunks = [];
    controller.abort();
  }
  function end() {
    if (finished) return;
    finished = true;
    cleanup();
    onEnd?.();
  }
  function fail(code) {
    if (finished) return;
    onError?.(code);
    end();
  }
  function stop() {
    if (finished || phase === 'stopping' || phase === 'processing') return;
    if (phase === 'starting') { end(); return; }
    phase = 'stopping';
    clearTimeout(recordingTimer);
    clearTimeout(sampleTimer);
    stopTimer = setTimeout(() => fail('stop-timeout'), 2000);
    try { recorder.stop(); }
    catch { fail('recording'); }
    // Closing tracks is immediate, even when final Blob/stop events are delayed.
    closeAudio();
  }
  function sampleAudio() {
    if (finished || phase !== 'recording' || !analyser) return;
    try {
      if (useFloatSamples) analyser.getFloatTimeDomainData(samples);
      else analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const raw of samples) {
        const value = useFloatSamples ? raw : (raw - 128) / 128;
        energy += value * value;
      }
      const loud = Math.sqrt(energy / samples.length) >= 0.012;
      loudSamples = loud ? loudSamples + 1 : 0;
      if (loudSamples >= 2) hasSpeech = true;
      if (loud) lastSpeechAt = Date.now();
      if (!hasSpeech && Date.now() - recordingStartedAt >= 6000) { fail('no-speech'); return; }
      if (hasSpeech && Date.now() - lastSpeechAt >= silenceMs) { stop(); return; }
    } catch { fail('audio-capture'); return; }
    sampleTimer = setTimeout(sampleAudio, sampleMs);
  }
  function prepareAnalysis() {
    if (!audioContext || audioContext.state !== 'running') return false;
    try {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      useFloatSamples = typeof analyser.getFloatTimeDomainData === 'function';
      if (!useFloatSamples && typeof analyser.getByteTimeDomainData !== 'function') throw new Error('No waveform');
      samples = useFloatSamples ? new Float32Array(analyser.fftSize) : new Uint8Array(analyser.fftSize);
      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      // The analyser is deliberately not connected to speakers: no mic feedback.
      return true;
    } catch {
      try { source?.disconnect(); } catch { /* No live connection. */ }
      source = null;
      analyser = null;
      samples = null;
      return false;
    }
  }
  async function processAudio(silenceDetection) {
    if (finished || phase === 'processing') return;
    phase = 'processing';
    clearTimeout(startTimer);
    clearTimeout(recordingTimer);
    clearTimeout(stopTimer);
    const type = recorder?.mimeType || chunks.find(chunk => chunk.type)?.type || '';
    detachRecorder();
    closeAudio();
    if (silenceDetection && !hasSpeech) { fail('no-speech'); return; }
    if (!bytes) { fail('no-speech'); return; }
    const blob = new Blob(chunks, { type });
    chunks = [];
    processingTimer = setTimeout(() => fail('transcription-timeout'), 20000);
    onProcessing?.();
    if (finished) return;
    try {
      const text = await transcribe({ blob, language, field, signal: controller.signal });
      if (finished) return;
      if (typeof text !== 'string') { fail('transcription'); return; }
      if (!text.trim()) { fail('no-speech'); return; }
      onTranscript?.({ text: text.trim(), finalText: text.trim() });
      end();
    } catch (error) {
      if (!finished) fail(typeof error?.code === 'string' ? error.code : 'transcription');
    }
  }
  async function acquireMicrophone() {
    let granted;
    try {
      granted = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (error) {
      if (!finished) fail(['NotAllowedError', 'SecurityError'].includes(error?.name) ? 'not-allowed' : 'audio-capture');
      return;
    }
    if (finished) { stopTracks(granted); return; }
    stream = granted;
    try {
      const candidates = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
      const mimeType = candidates.find(type => MediaRecorder.isTypeSupported?.(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const current = recorder;
      const isCurrent = () => !finished && recorder === current;
      const silenceDetection = prepareAnalysis();
      current.onstart = () => {
        if (!isCurrent() || phase !== 'starting') return;
        clearTimeout(startTimer);
        phase = 'recording';
        recordingStartedAt = Date.now();
        recordingTimer = setTimeout(() => {
          if (!isCurrent() || phase !== 'recording') return;
          onLimit?.();
          stop();
        }, maxRecordingMs);
        onStart?.({ silenceDetection });
        if (isCurrent() && phase === 'recording' && silenceDetection) sampleAudio();
      };
      current.ondataavailable = event => {
        if (!isCurrent() || phase === 'processing' || !event.data?.size) return;
        bytes += event.data.size;
        if (bytes > maxBytes) { fail('audio-too-large'); return; }
        chunks.push(event.data);
      };
      current.onerror = () => { if (isCurrent()) fail('recording'); };
      current.onstop = () => {
        if (!isCurrent()) return;
        if (phase === 'starting') fail('start');
        else void processAudio(silenceDetection);
      };
      current.start(250);
    } catch (error) {
      if (!finished) fail(error?.name === 'NotSupportedError' ? 'unsupported' : 'start');
    }
  }

  if (!mediaDevices?.getUserMedia || typeof MediaRecorder !== 'function' || typeof transcribe !== 'function') {
    fail('unsupported');
  } else {
    // Construct/resume within the original click gesture, before permission's
    // async boundary. A suspended/unavailable analyser uses explicit tap-stop.
    if (typeof AudioContext === 'function') {
      try {
        audioContext = new AudioContext();
        Promise.resolve(audioContext.resume?.()).catch(() => {});
      } catch {
        try { Promise.resolve(audioContext?.close()).catch(() => {}); } catch { /* Already closed. */ }
        audioContext = null;
      }
    }
    startTimer = setTimeout(() => fail('start-timeout'), 12000);
    void acquireMicrophone();
  }
  return {
    stop,
    abort() {
      if (finished) return;
      finished = true;
      cleanup();
    },
  };
}
