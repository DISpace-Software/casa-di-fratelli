import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createReservationLocalSpeech, decodeReservationAudioBlob, probeReservationLocalSpeech, RESERVATION_LOCAL_SPEECH_MODEL_BYTES } from '../reservations/reservationLocalSpeech.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const input = () => ({ blob: new Blob(['recording'], { type: 'audio/mp4' }), language: 'bg-BG', field: 'phone' });
function harness(options = {}) {
  const workers = [];
  const states = [];
  let probes = 0;
  let decodes = 0;
  const adapter = createReservationLocalSpeech({
    probe: async () => { probes++; return { supported: true }; },
    decode: async () => { decodes++; return new Float32Array([0.1, -0.1]); },
    workerFactory: () => {
      const worker = {
        messages: [], terminated: false,
        postMessage(data, transfer) { this.messages.push({ data, transfer }); },
        terminate() { this.terminated = true; },
        emit(data) { this.onmessage?.({ data }); },
      };
      workers.push(worker);
      return worker;
    },
    onStateChange: state => states.push(state),
    ...options,
  });
  return { adapter, workers, states, counts: () => ({ probes, decodes }), async ready() {
    const pending = adapter.prepare();
    await flush();
    const worker = workers.at(-1);
    worker.emit({ type: 'ready', id: worker.messages.at(-1).data.id });
    await pending;
    return worker;
  } };
}

test('constructing/subscribing/attempting dictation never downloads or creates a worker', async () => {
  const h = harness();
  const snapshots = [];
  const unsubscribe = h.adapter.subscribe(state => snapshots.push(state));
  assert.equal(h.adapter.getSnapshot().status, 'idle');
  await assert.rejects(h.adapter.transcribe(input()), { code: 'local-not-ready' });
  assert.deepEqual(h.counts(), { probes: 0, decodes: 0 });
  assert.equal(h.workers.length, 0);
  unsubscribe();
  h.adapter.dispose();
  assert.deepEqual(snapshots, []);
});

test('local capability probe requires a secure worker/WASM/audio environment, never WebGPU', async () => {
  const environment = { secureContext: true, Worker: class {}, WebAssembly: { instantiate() {}, validate: bytes => globalThis.WebAssembly.validate(bytes) }, OfflineAudioContext: class {}, AudioContext: null };
  assert.deepEqual(await probeReservationLocalSpeech(environment), { supported: true });
  for (const changed of [{ secureContext: false }, { Worker: null }, { WebAssembly: null }, { WebAssembly: { instantiate() {}, validate: () => false } }, { WebAssembly: { instantiate() {}, validate() { throw new Error('SIMD unavailable'); } } }, { OfflineAudioContext: null }]) {
    assert.deepEqual(await probeReservationLocalSpeech({ ...environment, ...changed }), { supported: false, code: 'local-unsupported' });
  }
  assert.deepEqual(await probeReservationLocalSpeech({ ...environment, OfflineAudioContext: null, AudioContext: class {} }), { supported: true });
});

test('unsupported hardware fails before creating the worker and never falls back', async () => {
  const h = harness({ probe: async () => ({ supported: false }) });
  await assert.rejects(h.adapter.prepare(), { code: 'local-unsupported' });
  assert.equal(h.workers.length, 0);
  assert.equal(h.adapter.getSnapshot().status, 'error');
});

test('explicit preparation reports bounded progress and a prepared worker is reused', async () => {
  const h = harness();
  const preparing = h.adapter.prepare();
  await flush();
  const worker = h.workers[0];
  const id = worker.messages[0].data.id;
  worker.emit({ type: 'progress', id, loaded: RESERVATION_LOCAL_SPEECH_MODEL_BYTES / 2, total: 1, file: 'encoder.onnx' });
  assert.equal(h.adapter.getSnapshot().progress.percent, 50);
  assert.equal(h.adapter.getSnapshot().status, 'preparing');
  worker.emit({ type: 'ready', id });
  await preparing;
  await h.adapter.prepare();
  assert.equal(h.workers.length, 1);
  assert.equal(worker.messages.length, 1);
  const transcribing = h.adapter.transcribe(input());
  await flush();
  const message = worker.messages.at(-1);
  assert.equal(message.data.field, 'phone');
  assert.equal(message.data.language, 'bg');
  assert.deepEqual(message.transfer, [message.data.audio.buffer]);
  assert.equal(h.adapter.getSnapshot().status, 'processing');
  worker.emit({ type: 'result', id: message.data.id, text: ' 08956124615 ' });
  assert.equal(await transcribing, '08956124615');
  assert.equal(h.adapter.getSnapshot().status, 'ready');
  h.adapter.dispose();
});

test('only one preparation or transcription can be in flight', async () => {
  const h = harness();
  const preparing = h.adapter.prepare();
  await assert.rejects(h.adapter.prepare(), { code: 'busy' });
  await assert.rejects(h.adapter.transcribe(input()), { code: 'busy' });
  await flush();
  const worker = h.workers[0];
  worker.emit({ type: 'ready', id: worker.messages[0].data.id });
  await preparing;
  const transcribing = h.adapter.transcribe(input());
  await assert.rejects(h.adapter.transcribe(input()), { code: 'busy' });
  await assert.rejects(h.adapter.prepare(), { code: 'busy' });
  await flush();
  worker.emit({ type: 'result', id: worker.messages.at(-1).data.id, text: 'Иван' });
  await transcribing;
  h.adapter.dispose();
});

test('date/time/count/email are rejected before decoding or worker messages; invalid languages/blobs also preserve readiness', async () => {
  const h = harness();
  const worker = await h.ready();
  for (const field of ['all', 'reservedDate', 'reservedTime', 'guestCount', 'email']) await assert.rejects(h.adapter.transcribe({ ...input(), field }), { code: 'invalid-field' });
  for (const language of ['de', 'ru', 'en']) await assert.rejects(h.adapter.transcribe({ ...input(), language }), { code: 'unsupported-language' });
  await assert.rejects(h.adapter.transcribe({ ...input(), blob: { size: 5 * 1024 * 1024 + 1, arrayBuffer() {} } }), { code: 'audio-too-large' });
  assert.equal(worker.messages.length, 1);
  assert.equal(h.counts().decodes, 0);
  assert.equal(h.adapter.getSnapshot().status, 'ready');
  h.adapter.dispose();
});

test('digital silence never reaches model inference and preserves the prepared worker', async () => {
  const h = harness({ decode: async () => new Float32Array(16000) });
  const worker = await h.ready();
  await assert.rejects(h.adapter.transcribe(input()), { code: 'no-speech' });
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.terminated, false);
  assert.equal(h.adapter.getSnapshot().status, 'ready');
  h.adapter.dispose();
});

test('AAC decode/length failures preserve the healthy model for the next recording', async () => {
  let errorCode = 'audio-decode';
  const h = harness({ decode: async () => {
    if (errorCode) throw Object.assign(new Error(errorCode), { code: errorCode });
    return new Float32Array([0.1]);
  } });
  const worker = await h.ready();
  for (const code of ['audio-decode', 'audio-too-long']) {
    errorCode = code;
    await assert.rejects(h.adapter.transcribe(input()), { code });
    assert.equal(h.adapter.getSnapshot().status, 'ready');
    assert.equal(worker.terminated, false);
    assert.equal(worker.messages.length, 1);
  }
  errorCode = null;
  const retry = h.adapter.transcribe(input());
  await flush();
  worker.emit({ type: 'result', id: worker.messages.at(-1).data.id, text: 'нула осем осем осем едно две три четири пет шест' });
  assert.ok(await retry);
  assert.equal(h.workers.length, 1);
  h.adapter.dispose();
});

test('cancel during capability inspection never starts a late worker', async () => {
  let finishProbe;
  const h = harness({ probe: () => new Promise(resolve => { finishProbe = resolve; }) });
  const controller = new AbortController();
  const preparing = h.adapter.prepare({ signal: controller.signal });
  const rejection = assert.rejects(preparing, { name: 'AbortError', code: 'aborted' });
  await flush();
  controller.abort();
  await rejection;
  finishProbe({ supported: true });
  await flush();
  assert.equal(h.workers.length, 0);
  assert.equal(h.adapter.getSnapshot().status, 'idle');
});

test('cancel preparation kills downloads; stale results cannot ready a new worker', async () => {
  const h = harness();
  const controller = new AbortController();
  const preparing = h.adapter.prepare({ signal: controller.signal });
  const rejection = assert.rejects(preparing, { code: 'aborted' });
  await flush();
  const old = h.workers[0];
  const oldHandler = old.onmessage;
  controller.abort();
  await rejection;
  assert.equal(old.terminated, true);
  assert.equal(h.adapter.getSnapshot().status, 'idle');
  const next = h.adapter.prepare();
  await flush();
  const worker = h.workers[1];
  oldHandler({ data: { type: 'ready', id: old.messages[0].data.id } });
  assert.equal(h.adapter.getSnapshot().status, 'preparing');
  worker.emit({ type: 'ready', id: worker.messages[0].data.id });
  await next;
  h.adapter.dispose();
});

test('cancel transcription terminates actual worker inference and requires explicit prepare again', async () => {
  const h = harness();
  const worker = await h.ready();
  const controller = new AbortController();
  const transcribing = h.adapter.transcribe({ ...input(), signal: controller.signal });
  const rejection = assert.rejects(transcribing, { code: 'aborted' });
  await flush();
  const handler = worker.onmessage;
  const id = worker.messages.at(-1).data.id;
  controller.abort();
  await rejection;
  assert.equal(worker.terminated, true);
  handler({ data: { type: 'result', id, text: 'late private text' } });
  assert.equal(h.adapter.getSnapshot().status, 'idle');
  await assert.rejects(h.adapter.transcribe(input()), { code: 'local-not-ready' });
  assert.equal(h.workers.length, 1);
});

test('cancel before inference preserves the ready worker and ignores late decoded audio', async () => {
  let finishDecode;
  const h = harness({ decode: () => new Promise(resolve => { finishDecode = resolve; }) });
  const worker = await h.ready();
  const controller = new AbortController();
  const transcribing = h.adapter.transcribe({ ...input(), signal: controller.signal });
  const rejection = assert.rejects(transcribing, { code: 'aborted' });
  await flush();
  controller.abort();
  await rejection;
  assert.equal(worker.terminated, false);
  assert.equal(h.adapter.getSnapshot().status, 'ready');
  const next = await h.ready();
  finishDecode(new Float32Array([0.2]));
  await flush();
  assert.equal(worker.messages.length, 1);
  assert.equal(next.messages.length, 1);
  assert.equal(next, worker);
  h.adapter.dispose();
});

test('both preparation and transcription time out and terminate work', async () => {
  const h = harness({ prepareTimeoutMs: 15, transcriptionTimeoutMs: 15 });
  await assert.rejects(h.adapter.prepare(), { code: 'preparation-timeout' });
  assert.equal(h.workers[0].terminated, true);
  const worker = await h.ready();
  await assert.rejects(h.adapter.transcribe(input()), { code: 'transcription-timeout' });
  assert.equal(worker.terminated, true);
  assert.equal(h.adapter.getSnapshot().status, 'error');
});

test('empty transcript retains ready model; worker failures are sanitized and terminate it', async () => {
  const h = harness();
  const worker = await h.ready();
  let transcribing = h.adapter.transcribe(input());
  let rejection = assert.rejects(transcribing, { code: 'no-speech' });
  await flush();
  worker.emit({ type: 'result', id: worker.messages.at(-1).data.id, text: ' ' });
  await rejection;
  assert.equal(h.adapter.getSnapshot().status, 'ready');
  assert.equal(worker.terminated, false);
  transcribing = h.adapter.transcribe(input());
  rejection = assert.rejects(transcribing, { code: 'recognition-unavailable' });
  await flush();
  worker.emit({ type: 'error', id: worker.messages.at(-1).data.id, code: 'private runtime details' });
  await rejection;
  assert.equal(worker.terminated, true);
  assert.equal(h.adapter.getSnapshot().error, 'recognition-unavailable');
});

test('dispose aborts pending work and prevents later preparation or subscriptions', async () => {
  const h = harness();
  const preparing = h.adapter.prepare();
  const rejection = assert.rejects(preparing, { code: 'aborted' });
  await flush();
  h.adapter.dispose();
  await rejection;
  assert.equal(h.workers[0].terminated, true);
  await assert.rejects(h.adapter.prepare(), { code: 'local-disposed' });
  await assert.rejects(h.adapter.transcribe(input()), { code: 'local-disposed' });
  h.adapter.dispose();
});

function decodedAudio({ duration = 1, sampleRate = 16000, channels = [new Float32Array([1, 0]), new Float32Array([0, 1])] } = {}) {
  return { duration, sampleRate, length: channels[0].length, numberOfChannels: channels.length, getChannelData: i => channels[i] };
}

test('browser decode requests 16kHz offline and averages channels without playback', async () => {
  const events = [];
  class Offline {
    constructor(...args) { events.push(args); }
    async decodeAudioData(encoded) { assert.equal(encoded.byteLength, 9); return decodedAudio(); }
  }
  const mono = await decodeReservationAudioBlob(input().blob, { OfflineAudioContext: Offline });
  assert.deepEqual(events, [[1, 1, 16000]]);
  assert.deepEqual(mono, new Float32Array([0.5, 0.5]));
});

test('decoded duration includes one second padding tolerance, never accepts longer or nonfinite samples', async () => {
  let decoded = decodedAudio({ duration: 20.05 });
  class Offline { async decodeAudioData() { return decoded; } }
  await decodeReservationAudioBlob(input().blob, { OfflineAudioContext: Offline });
  decoded = decodedAudio({ duration: 21.001 });
  await assert.rejects(decodeReservationAudioBlob(input().blob, { OfflineAudioContext: Offline }), { code: 'audio-too-long' });
  decoded = decodedAudio({ channels: [new Float32Array([NaN])] });
  await assert.rejects(decodeReservationAudioBlob(input().blob, { OfflineAudioContext: Offline }), { code: 'audio-decode' });
  decoded = decodedAudio({ channels: [new Float32Array(100)] });
  await assert.rejects(decodeReservationAudioBlob(input().blob, { OfflineAudioContext: Offline }), { code: 'no-speech' });
  decoded = decodedAudio({ sampleRate: 48000 });
  await assert.rejects(decodeReservationAudioBlob(input().blob, { OfflineAudioContext: Offline }), { code: 'audio-decode' });
});

test('decoder does not allocate on oversize/preaborted inputs and closes live fallback context', async () => {
  let contexts = 0;
  let closed = 0;
  class Context {
    constructor(options) { contexts++; assert.equal(options.sampleRate, 16000); }
    async decodeAudioData() { return decodedAudio(); }
    close() { closed++; }
  }
  const options = { AudioContext: Context, OfflineAudioContext: null };
  await assert.rejects(decodeReservationAudioBlob({ size: 6 * 1024 * 1024, arrayBuffer() {} }, options), { code: 'audio-too-large' });
  await assert.rejects(decodeReservationAudioBlob(input().blob, { ...options, signal: AbortSignal.abort() }), { code: 'aborted' });
  assert.equal(contexts, 0);
  await decodeReservationAudioBlob(input().blob, options);
  assert.equal(contexts, 1);
  assert.equal(closed, 1);
});
