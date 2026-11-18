// No model/runtime import happens here. Only an explicit prepare() creates the
// worker, downloads the pinned model and makes local dictation available.
export const RESERVATION_LOCAL_SPEECH_MODEL = 'preslaff/bulgarian-asr-zipformer';
export const RESERVATION_LOCAL_SPEECH_REVISION = '8d2f8f4f159918a27b33c430e4fa83b10c705c28';
export const RESERVATION_LOCAL_SPEECH_MODEL_BYTES = 73635614;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SAMPLES = 21 * 16000; // 20-second recording plus container padding.
const FIELDS = new Set(['guestName', 'phone']);
const LANGUAGES = new Set(['bg']);
// Fixed-width SIMD probe: i32.const 0, i8x16.splat, i8x16.popcnt.
// Matches GoogleChromeLabs/wasm-feature-detect src/detectors/simd/module.wat.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

function failure(code) {
  const error = new Error(code);
  error.code = code;
  if (code === 'aborted') error.name = 'AbortError';
  return error;
}
function checkAbort(signal) {
  if (signal?.aborted) throw failure('aborted');
}
function validateBlob(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function' || !Number.isFinite(blob.size) || blob.size <= 0) throw failure('no-speech');
  if (blob.size > MAX_BYTES) throw failure('audio-too-large');
}

// Safe to call before prepare(): capability inspection performs no download.
export async function probeReservationLocalSpeech({
  secureContext = globalThis.isSecureContext,
  WebAssembly = globalThis.WebAssembly,
  Worker = globalThis.Worker,
  OfflineAudioContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext,
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
} = {}) {
  const supported = secureContext !== false && typeof Worker === 'function'
    && typeof WebAssembly?.instantiate === 'function'
    && (typeof OfflineAudioContext === 'function' || typeof AudioContext === 'function');
  try {
    if (supported && typeof WebAssembly.validate === 'function' && WebAssembly.validate(SIMD_PROBE)) return { supported: true };
  } catch { /* Unsupported engines must fail before downloading the model. */ }
  return { supported: false, code: 'local-unsupported' };
}

// decodeAudioData resamples to the context's rate. Prefer an offline context so
// decoding never starts playback and does not depend on an audio user gesture.
export async function decodeReservationAudioBlob(blob, {
  signal,
  OfflineAudioContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext,
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
} = {}) {
  validateBlob(blob);
  checkAbort(signal);
  if (!OfflineAudioContext && !AudioContext) throw failure('local-unsupported');
  let context;
  const close = () => {
    try { Promise.resolve(context?.close?.()).catch(() => {}); } catch { /* Already closed. */ }
  };
  try {
    context = OfflineAudioContext ? new OfflineAudioContext(1, 1, 16000) : new AudioContext({ sampleRate: 16000 });
    signal?.addEventListener('abort', close, { once: true });
    const encoded = await blob.arrayBuffer();
    checkAbort(signal);
    const decoded = await context.decodeAudioData(encoded);
    checkAbort(signal);
    if (!Number.isFinite(decoded.duration) || decoded.duration > 21) throw failure('audio-too-long');
    if (decoded.sampleRate !== 16000 || !Number.isInteger(decoded.length) || decoded.length < 1 || decoded.length > MAX_SAMPLES || !Number.isInteger(decoded.numberOfChannels) || decoded.numberOfChannels < 1 || decoded.numberOfChannels > 8) throw failure('audio-decode');
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) mono[i] += samples[i] / decoded.numberOfChannels;
    }
    if (mono.some(value => !Number.isFinite(value))) throw failure('audio-decode');
    if (mono.every(value => value === 0)) throw failure('no-speech');
    return mono;
  } catch (error) {
    checkAbort(signal);
    throw typeof error?.code === 'string' ? error : failure('audio-decode');
  } finally {
    signal?.removeEventListener('abort', close);
    close();
  }
}

export function createReservationLocalSpeech({
  workerFactory = () => new Worker(new URL('./reservationLocalSpeech.worker.js', import.meta.url)),
  probe = probeReservationLocalSpeech,
  decode = decodeReservationAudioBlob,
  onStateChange,
  prepareTimeoutMs = 180000,
  transcriptionTimeoutMs = 20000,
} = {}) {
  let worker = null;
  let pending = null;
  let serial = 0;
  let disposed = false;
  let snapshot = Object.freeze({ status: 'idle', progress: null, error: null });
  const listeners = new Set(onStateChange ? [onStateChange] : []);
  function publish(status, error = null, progress = null) {
    snapshot = Object.freeze({ status, error, progress });
    for (const listener of listeners) {
      try { listener(snapshot); } catch { /* A detached view cannot interrupt cleanup. */ }
    }
  }
  function terminate() {
    const previous = worker;
    worker = null;
    if (previous) {
      previous.onmessage = previous.onerror = previous.onmessageerror = null;
      previous.terminate();
    }
  }
  function settle(operation, error, value) {
    if (pending !== operation) return;
    pending = null;
    clearTimeout(operation.timer);
    operation.signal?.removeEventListener('abort', operation.abort);
    if (error) {
      // A bad/aborted recording does not damage an idle recognizer. Only work
      // actually dispatched to WASM must be terminated to cancel inference.
      const keepReady = !disposed && worker && operation.type === 'transcribe'
        && (error.code === 'no-speech' || (!operation.workerDispatched && !operation.workerFailed));
      if (!keepReady) terminate();
      publish(keepReady ? 'ready' : error.code === 'aborted' ? 'idle' : 'error', error.code === 'aborted' ? null : error.code);
      operation.reject(error);
    } else {
      publish('ready');
      operation.resolve(value);
    }
  }
  function begin(type, signal, start) {
    if (disposed) return Promise.reject(failure('local-disposed'));
    if (signal?.aborted) return Promise.reject(failure('aborted'));
    if (pending) return Promise.reject(failure('busy'));
    return new Promise((resolve, reject) => {
      const operation = { id: ++serial, type, signal, resolve, reject };
      pending = operation;
      operation.abort = () => settle(operation, failure('aborted'));
      signal?.addEventListener('abort', operation.abort, { once: true });
      operation.timer = setTimeout(() => settle(operation, failure(type === 'prepare' ? 'preparation-timeout' : 'transcription-timeout')), type === 'prepare' ? prepareTimeoutMs : transcriptionTimeoutMs);
      publish(type === 'prepare' ? 'preparing' : 'processing', null, type === 'prepare' ? { loaded: 0, total: RESERVATION_LOCAL_SPEECH_MODEL_BYTES, percent: 0, file: '' } : null);
      Promise.resolve().then(() => {
        if (pending === operation) return start(operation);
      }).catch(error => settle(operation, typeof error?.code === 'string' ? error : failure('recognition-unavailable')));
    });
  }
  function receive(event, source) {
    const operation = pending;
    const data = event.data;
    if (!operation || worker !== source || data?.id !== operation.id) return;
    if (data.type === 'progress' && operation.type === 'prepare') {
      const loaded = Math.max(0, Number(data.loaded) || 0);
      const total = Math.max(RESERVATION_LOCAL_SPEECH_MODEL_BYTES, Number(data.total) || 0);
      publish('preparing', null, { loaded, total, percent: Math.min(99, Math.round(loaded / total * 100)), file: typeof data.file === 'string' ? data.file : '' });
    } else if (data.type === 'ready' && operation.type === 'prepare') {
      settle(operation, null);
    } else if (data.type === 'result' && operation.type === 'transcribe') {
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      settle(operation, text ? null : failure('no-speech'), text);
    } else if (data.type === 'error') {
      const code = ['local-unsupported', 'local-model-load', 'no-speech', 'audio-too-long', 'invalid-field', 'unsupported-language'].includes(data.code) ? data.code : 'recognition-unavailable';
      settle(operation, failure(code));
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    prepare({ signal } = {}) {
      if (!disposed && !pending && snapshot.status === 'ready' && worker && !signal?.aborted) return Promise.resolve();
      return begin('prepare', signal, async operation => {
        const capability = await probe();
        if (pending !== operation) return;
        if (!capability?.supported) throw failure('local-unsupported');
        const created = workerFactory();
        worker = created;
        created.onmessage = event => receive(event, created);
        created.onerror = created.onmessageerror = () => {
          if (worker !== created) return;
          if (pending) { pending.workerFailed = true; settle(pending, failure('recognition-unavailable')); }
          else { terminate(); publish('error', 'recognition-unavailable'); }
        };
        created.postMessage({ type: 'prepare', id: operation.id, assetBase: new URL('/speech/bg-zipformer/8d2f8f4-sherpa-1.12.36/', globalThis.location?.href || 'http://localhost/').href });
      });
    },
    transcribe({ blob, language, field, signal } = {}) {
      if (disposed) return Promise.reject(failure('local-disposed'));
      if (signal?.aborted) return Promise.reject(failure('aborted'));
      if (pending) return Promise.reject(failure('busy'));
      if (snapshot.status !== 'ready' || !worker) return Promise.reject(failure('local-not-ready'));
      if (!FIELDS.has(field)) return Promise.reject(failure('invalid-field'));
      const normalizedLanguage = typeof language === 'string' ? language.toLowerCase().split('-')[0] : '';
      if (!LANGUAGES.has(normalizedLanguage)) return Promise.reject(failure('unsupported-language'));
      try { validateBlob(blob); } catch (error) { return Promise.reject(error); }
      return begin('transcribe', signal, async operation => {
        let audio = await decode(blob, { signal });
        if (pending !== operation) return;
        if (!(audio instanceof Float32Array) || !audio.length || audio.length > MAX_SAMPLES || audio.some(value => !Number.isFinite(value))) throw failure('audio-decode');
        if (audio.every(value => value === 0)) throw failure('no-speech');
        if (audio.byteOffset || audio.byteLength !== audio.buffer.byteLength) audio = audio.slice();
        operation.workerDispatched = true;
        worker.postMessage({ type: 'transcribe', id: operation.id, audio, language: normalizedLanguage, field }, [audio.buffer]);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pending) settle(pending, failure('aborted'));
      terminate();
      publish('idle');
      listeners.clear();
    },
  };
}
