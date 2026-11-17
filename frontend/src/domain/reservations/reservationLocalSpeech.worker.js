/* global importScripts */
// Classic worker: the pinned browser runtime is loaded only after prepare().
// Every URL is same-origin. Audio and transcripts never enter fetch or storage.
const VERSION = '8d2f8f4-sherpa-1.12.36';
const MODEL_FILES = [
  ['encoder-epoch-40-avg-8.int8.onnx', 72828389],
  ['decoder-epoch-40-avg-8.int8.onnx', 540689],
  ['joiner-epoch-40-avg-8.int8.onnx', 259417],
  ['tokens.txt', 7119],
];
const WASM_FILE = ['sherpa-runtime.wasm', 11872164];
const TOTAL_BYTES = MODEL_FILES.reduce((sum, [, bytes]) => sum + bytes, WASM_FILE[1]);
const fields = new Set(['guestName', 'phone']);
let recognizer = null;
let busy = false;

async function prepare(id, assetBase) {
  const base = new URL(assetBase);
  if (base.origin !== self.location.origin || base.pathname !== `/speech/bg-zipformer/${VERSION}/` || base.search || base.hash) throw new Error('Invalid asset path');
  let cache;
  try { cache = await self.caches?.open(`reservation-local-speech-${VERSION}`); } catch { /* Private mode may disallow persistent model cache. */ }
  let loaded = 0;
  let lastProgressAt = -Infinity;
  function progress(file, bytes = 0, force = false) {
    loaded += bytes;
    const now = Date.now();
    if (!force && now - lastProgressAt < 150) return;
    lastProgressAt = now;
    self.postMessage({ type: 'progress', id, file, loaded, total: TOTAL_BYTES });
  }
  async function asset([file, expectedBytes]) {
    const url = new URL(file, base).href;
    let response;
    try { response = await cache?.match(url); } catch { /* Fall back to same-origin static files. */ }
    const cached = Boolean(response);
    response ||= await fetch(url, { credentials: 'omit', cache: 'force-cache', redirect: 'error' });
    if (!response.ok) throw new Error('Asset unavailable');
    const copy = !cached && cache ? response.clone() : null;
    const reader = response.body?.getReader();
    let bytes;
    if (reader) {
      bytes = new Uint8Array(expectedBytes);
      let offset = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.length > expectedBytes) throw new Error('Asset length mismatch');
          bytes.set(value, offset); offset += value.length; progress(file, value.length);
        }
      } finally { reader.releaseLock(); }
      if (offset !== expectedBytes) throw new Error('Asset length mismatch');
    } else {
      bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== expectedBytes) throw new Error('Asset length mismatch');
      progress(file, bytes.byteLength);
    }
    if (copy) {
      try { await cache.put(url, copy); } catch { /* Recognition also works without disk cache. */ }
    }
    progress(file, 0, true);
    return bytes;
  }
  const models = [];
  for (const file of MODEL_FILES) models.push(await asset(file));
  const wasmBinary = await asset(WASM_FILE);
  const runtime = await new Promise((resolve, reject) => {
    self.Module = {
      wasmBinary,
      print() {}, printErr() {},
      onAbort: () => reject(new Error('Runtime unavailable')),
      onRuntimeInitialized: () => resolve(self.Module),
      preRun: [() => MODEL_FILES.forEach(([name], i) => self.reservationSherpaFS.writeFile(`/${name}`, models[i]))],
    };
    importScripts(new URL('sherpa-runtime.js', base).href, new URL('sherpa-asr.js', base).href);
  });
  try {
    const created = new self.ReservationSherpaOfflineRecognizer({
      modelConfig: {
        transducer: { encoder: `/${MODEL_FILES[0][0]}`, decoder: `/${MODEL_FILES[1][0]}`, joiner: `/${MODEL_FILES[2][0]}` },
        tokens: '/tokens.txt', numThreads: 1, provider: 'cpu', debug: 0,
      },
      decodingMethod: 'greedy_search',
    }, runtime);
    if (!created.handle) throw new Error('Model unavailable');
    recognizer = created;
  } finally {
    // ONNX sessions own the loaded weights; release the extra RAM-file copies.
    // The same greedy recognizer handles every subsequent name/phone recording.
    for (const [name] of MODEL_FILES) self.reservationSherpaFS.unlink(`/${name}`);
    models.length = 0;
    delete self.Module.wasmBinary;
  }
}

// Cancellation/timeout terminates this worker, stopping synchronous WASM work
// and dropping the private heap. There are no automatic retries or fallbacks.
self.onmessage = async ({ data }) => {
  const { id, type } = data || {};
  const fail = code => self.postMessage({ type: 'error', id, code });
  if (busy) { fail('busy'); return; }
  busy = true;
  try {
    if (type === 'prepare') {
      if (!recognizer) await prepare(id, data.assetBase);
      self.postMessage({ type: 'ready', id });
    } else if (type === 'transcribe') {
      if (!recognizer) { fail('local-not-ready'); return; }
      if (!fields.has(data.field)) { fail('invalid-field'); return; }
      if (data.language !== 'bg') { fail('unsupported-language'); return; }
      if (!(data.audio instanceof Float32Array) || !data.audio.length || data.audio.length > 21 * 16000 || data.audio.some(value => !Number.isFinite(value))) { fail('audio-too-long'); return; }
      if (data.audio.every(value => value === 0)) { fail('no-speech'); return; }
      const stream = recognizer.createStream();
      try {
        stream.acceptWaveform(16000, data.audio);
        recognizer.decode(stream);
        const result = recognizer.getResult(stream);
        const text = typeof result?.text === 'string' ? result.text.trim() : '';
        if (!text) fail('no-speech');
        else self.postMessage({ type: 'result', id, text });
      } finally { stream.free(); }
    } else fail('recognition-unavailable');
  } catch {
    fail(type === 'prepare' ? 'local-model-load' : 'recognition-unavailable');
  } finally {
    busy = false;
  }
};
