import test from 'node:test';
import assert from 'node:assert/strict';
import { startReservationAudioSession } from '../reservations/reservationAudioSession.js';

const settle = async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); };
function advance(t, milliseconds) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) t.mock.timers.tick(Math.min(100, milliseconds - elapsed));
}
function setup(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const events = [];
  const errors = [];
  const transcripts = [];
  const uploads = [];
  const recorders = [];
  const contexts = [];
  const track = { stopped: 0, stop() { this.stopped += 1; } };
  const stream = { getTracks: () => [track] };
  let level = 0;
  let permissionCalls = 0;
  class Recorder {
    static isTypeSupported(type) { return options.supported ? options.supported.includes(type) : type.startsWith('audio/mp4'); }
    constructor(source, config) {
      if (options.constructorError) throw options.constructorError;
      this.stream = source;
      this.mimeType = config?.mimeType || 'audio/webm';
      this.state = 'inactive';
      this.stopped = 0;
      recorders.push(this);
    }
    start() {
      if (options.startError) throw options.startError;
      this.state = 'recording';
      if (options.emitStart !== false) this.onstart?.();
    }
    stop() {
      this.stopped += 1;
      this.state = 'inactive';
      if (options.stopError) throw options.stopError;
      if (options.emitStop !== false) {
        if (options.emitFinal !== false) this.ondataavailable?.({ data: new Blob(['last audio'], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    data(blob) { this.ondataavailable?.({ data: blob }); }
  }
  class Audio {
    constructor() {
      this.state = options.suspended ? 'suspended' : 'running';
      this.closed = 0;
      this.connected = 0;
      contexts.push(this);
    }
    resume() { return Promise.resolve(); }
    close() { this.closed += 1; this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamSource() {
      return { connect: () => { this.connected += 1; }, disconnect: () => { this.connected -= 1; } };
    }
    createAnalyser() {
      if (options.analysisError) throw new Error('analysis unavailable');
      return options.byteSamples
        ? { getByteTimeDomainData: samples => samples.fill(128 + Math.round(level * 128)) }
        : { getFloatTimeDomainData: samples => samples.fill(level) };
    }
  }
  const session = startReservationAudioSession({
    mediaDevices: {
      getUserMedia: constraints => {
        permissionCalls += 1;
        assert.equal(constraints.video, false);
        return options.permission ? options.permission(stream) : Promise.resolve(stream);
      },
    },
    MediaRecorder: Recorder,
    AudioContext: options.noAnalysis ? undefined : Audio,
    preferPcm: options.preferPcm,
    ...(options.createPcmRecorder ? { createPcmRecorder: config => options.createPcmRecorder(config, Recorder) } : {}),
    language: 'bg-BG', field: options.field || 'guestName',
    transcribe: async request => {
      assert.equal(track.stopped, 1, 'microphone must close before upload');
      uploads.push(request);
      return options.transcribe ? options.transcribe(request) : 'Георги Иванов';
    },
    onStart: data => events.push(['start', data]),
    onProcessing: () => { assert.equal(track.stopped, 1); events.push(['processing']); options.onProcessing?.(); },
    onTranscript: value => { transcripts.push(value); options.onTranscript?.(); },
    onError: code => errors.push(code),
    onEnd: () => events.push(['end']),
    onLimit: () => events.push(['limit']),
  });
  t.after(() => session.abort());
  return { session, events, errors, transcripts, uploads, recorders, contexts, stream, track,
    setLevel(value) { level = value; }, get permissionCalls() { return permissionCalls; } };
}

test('MP4 recording uploads finalized chunks once, after the microphone closes', async t => {
  const state = setup(t);
  await settle();
  const mic = state.recorders[0];
  assert.equal(mic.mimeType, 'audio/mp4;codecs=mp4a.40.2');
  assert.deepEqual(state.events[0], ['start', { silenceDetection: true }]);
  mic.data(new Blob(['first audio'], { type: mic.mimeType }));
  state.setLevel(0.04);
  advance(t, 300);
  state.session.stop();
  await settle();
  assert.equal(state.uploads.length, 1);
  assert.equal(await state.uploads[0].blob.text(), 'first audiolast audio');
  assert.equal(state.uploads[0].language, 'bg-BG');
  assert.equal(state.uploads[0].field, 'guestName');
  assert.deepEqual(state.transcripts, [{ text: 'Георги Иванов', finalText: 'Георги Иванов' }]);
  assert.deepEqual(state.events.map(event => event[0]), ['start', 'processing', 'end']);
  assert.equal(state.contexts[0].closed, 1);
  assert.deepEqual(state.errors, []);
});

test('WebM fallback and absent analyser expose manual-stop mode honestly', async t => {
  const state = setup(t, { noAnalysis: true, supported: ['audio/webm;codecs=opus'] });
  await settle();
  assert.equal(state.recorders[0].mimeType, 'audio/webm;codecs=opus');
  assert.deepEqual(state.events[0], ['start', { silenceDetection: false }]);
  advance(t, 7000);
  assert.equal(state.uploads.length, 0);
  assert.equal(state.recorders[0].stopped, 0);
  state.session.stop();
  await settle();
  assert.equal(state.uploads.length, 1);
});

test('an unsupported preferred MIME uses the browser default', async t => {
  const state = setup(t, { noAnalysis: true, supported: [] });
  await settle();
  assert.equal(state.recorders[0].mimeType, 'audio/webm');
  state.session.stop();
  await settle();
  assert.equal(state.uploads[0].blob.type, 'audio/webm');
});

test('phone pauses between digit groups keep recording until explicit Stop', async t => {
  const state = setup(t, { field: 'phone' });
  await settle();
  assert.deepEqual(state.events[0], ['start', { silenceDetection: false }]);
  state.setLevel(0.04);
  advance(t, 300);
  state.setLevel(0);
  advance(t, 4000);
  assert.equal(state.recorders[0].stopped, 0);
  state.setLevel(0.04);
  advance(t, 300);
  state.setLevel(0);
  advance(t, 6000);
  assert.equal(state.recorders[0].stopped, 0);
  assert.equal(state.uploads.length, 0);
  state.session.stop();
  await settle();
  assert.equal(state.recorders[0].stopped, 1);
  assert.equal(state.uploads.length, 1);
});

test('phone capture retains the twenty-second cap when Stop is forgotten', async t => {
  const state = setup(t, { field: 'phone' });
  await settle();
  state.setLevel(0.04);
  advance(t, 300);
  state.setLevel(0);
  advance(t, 19600);
  assert.equal(state.recorders[0].stopped, 0);
  advance(t, 100);
  await settle();
  assert.equal(state.recorders[0].stopped, 1);
  assert.equal(state.uploads.length, 1);
  assert.equal(state.events.filter(event => event[0] === 'limit').length, 1);
  assert.deepEqual(state.errors, []);
});

test('quiet phone recording survives six seconds without an analyser false-negative', async t => {
  const state = setup(t, { field: 'phone' });
  await settle();
  state.setLevel(0.001); advance(t, 6500);
  assert.equal(state.recorders[0].stopped, 0);
  assert.deepEqual(state.errors, []);
  state.session.stop(); await settle();
  assert.equal(state.uploads.length, 1, 'Phone audio reaches recognition even below the name VAD threshold');
});

test('PCM Stop closes the microphone immediately but retains the graph until final buffer flush', async t => {
  let flush, disposed = 0;
  const state = setup(t, { preferPcm: true, noAnalysis: false, createPcmRecorder: async (_config, Recorder) => {
    const recorder = new Recorder({}, { mimeType: 'audio/wav' });
    recorder.dispose = () => { disposed++; };
    recorder.stop = () => {
      recorder.state = 'inactive'; recorder.stopped++;
      flush = () => { recorder.ondataavailable?.({ data: new Blob(['pcm'], { type: 'audio/wav' }) }); recorder.onstop?.(); };
    };
    return recorder;
  } });
  await settle();
  state.setLevel(0.04); advance(t, 300);
  state.session.stop();
  assert.equal(state.track.stopped, 1);
  assert.equal(state.contexts[0].closed, 0);
  assert.equal(state.uploads.length, 0);
  flush(); await settle();
  assert.equal(state.contexts[0].closed, 1);
  assert.equal(state.uploads.length, 1);
  assert.equal(state.uploads[0].blob.type, 'audio/wav');
  assert.equal(disposed, 1);
});

test('PCM setup failure can use MediaRecorder, while active PCM failure never starts a fallback', async t => {
  for (const failure of ['setup', 'capture']) await t.test(failure, async t => {
    let attempts = 0;
    const state = setup(t, { preferPcm: true, createPcmRecorder: async (_config, Recorder) => {
      attempts++;
      if (failure === 'setup') throw new Error('Unsupported worklet');
      const recorder = new Recorder({}, { mimeType: 'audio/wav' }); recorder.dispose = () => {};
      return recorder;
    } });
    await settle();
    assert.equal(attempts, 1); assert.equal(state.recorders.length, 1);
    if (failure === 'setup') assert.match(state.recorders[0].mimeType, /^audio\/mp4/);
    else {
      state.recorders[0].onerror(); await settle();
      assert.deepEqual(state.errors, ['recording']);
      assert.equal(state.recorders.length, 1); assert.equal(state.uploads.length, 0);
    }
  });
});

test('six seconds of measured silence never uploads audio', async t => {
  const state = setup(t);
  await settle();
  advance(t, 6000);
  await settle();
  assert.deepEqual(state.errors, ['no-speech']);
  assert.equal(state.uploads.length, 0);
  assert.equal(state.track.stopped, 1);
  assert.equal(state.contexts[0].closed, 1);
});

test('a single transient click is not accepted as speech', async t => {
  const state = setup(t);
  await settle();
  state.setLevel(0.1);
  advance(t, 100);
  state.setLevel(0);
  advance(t, 5900);
  await settle();
  assert.deepEqual(state.errors, ['no-speech']);
  assert.equal(state.uploads.length, 0);
});

test('manual stop without detected speech skips upload even when the container has bytes', async t => {
  const state = setup(t);
  await settle();
  state.session.stop();
  await settle();
  assert.deepEqual(state.errors, ['no-speech']);
  assert.equal(state.uploads.length, 0);
});

test('byte waveform analysis supports browsers without float waveform sampling', async t => {
  const state = setup(t, { byteSamples: true });
  await settle();
  state.setLevel(0.05);
  advance(t, 300);
  state.setLevel(0);
  advance(t, 1800);
  await settle();
  assert.equal(state.uploads.length, 1);
  assert.deepEqual(state.errors, []);
});

test('unavailable or suspended audio analysis remains bounded in manual-stop mode', async t => {
  for (const option of [{ suspended: true }, { analysisError: true }]) {
    await t.test(JSON.stringify(option), async t => {
      const state = setup(t, option);
      await settle();
      assert.deepEqual(state.events[0], ['start', { silenceDetection: false }]);
      advance(t, 20000);
      await settle();
      assert.equal(state.uploads.length, 1);
      assert.equal(state.events.filter(event => event[0] === 'limit').length, 1);
      assert.equal(state.track.stopped, 1);
    });
  }
});

test('permission is pending until recorder start, and late granted tracks close after abort', async t => {
  let grant;
  const state = setup(t, { permission: () => new Promise(resolve => { grant = resolve; }) });
  assert.equal(state.permissionCalls, 1);
  assert.equal(state.events.length, 0);
  state.session.abort();
  grant(state.stream);
  await settle();
  assert.equal(state.track.stopped, 1);
  assert.equal(state.recorders.length, 0);
  assert.equal(state.events.length, 0);
  assert.deepEqual(state.errors, []);
});

test('permission timeout ends once and releases a microphone granted later', async t => {
  let grant;
  const state = setup(t, { permission: () => new Promise(resolve => { grant = resolve; }) });
  t.mock.timers.tick(12000);
  assert.deepEqual(state.errors, ['start-timeout']);
  grant(state.stream);
  await settle();
  assert.equal(state.track.stopped, 1);
  assert.equal(state.recorders.length, 0);
  assert.deepEqual(state.events, [['end']]);
});

test('Stop while permission is pending cancels without upload or error', async t => {
  let grant;
  const state = setup(t, { permission: () => new Promise(resolve => { grant = resolve; }) });
  state.session.stop();
  grant(state.stream);
  await settle();
  assert.equal(state.track.stopped, 1);
  assert.deepEqual(state.events, [['end']]);
  assert.deepEqual(state.errors, []);
});

test('permission/device denial does not start a recorder', async t => {
  for (const [name, code] of [['NotAllowedError', 'not-allowed'], ['NotFoundError', 'audio-capture']]) {
    await t.test(name, async t => {
      const state = setup(t, { permission: () => Promise.reject(Object.assign(new Error('denied'), { name })) });
      await settle();
      assert.deepEqual(state.errors, [code]);
      assert.equal(state.recorders.length, 0);
      assert.deepEqual(state.events, [['end']]);
    });
  }
});

test('a recorder that never starts is aborted after the start deadline', async t => {
  const state = setup(t, { emitStart: false });
  await settle();
  const lateStart = state.recorders[0].onstart;
  t.mock.timers.tick(12000);
  lateStart();
  assert.deepEqual(state.errors, ['start-timeout']);
  assert.deepEqual(state.events, [['end']]);
  assert.equal(state.track.stopped, 1);
  assert.equal(state.uploads.length, 0);
});

test('an unexpected recorder end before readiness never uploads an unstarted recording', async t => {
  const state = setup(t, { emitStart: false, noAnalysis: true });
  await settle();
  state.recorders[0].data(new Blob(['invalid early data']));
  state.recorders[0].onstop();
  await settle();
  assert.deepEqual(state.errors, ['start']);
  assert.equal(state.uploads.length, 0);
  assert.equal(state.track.stopped, 1);
});

test('recording error discards collected audio instead of transcribing a failed capture', async t => {
  const state = setup(t, { noAnalysis: true });
  await settle();
  state.recorders[0].data(new Blob(['partial data']));
  state.recorders[0].onerror();
  await settle();
  assert.deepEqual(state.errors, ['recording']);
  assert.equal(state.uploads.length, 0);
  assert.equal(state.track.stopped, 1);
});

test('twenty-second cap flushes the last Blob and closes capture before processing', async t => {
  const state = setup(t, { noAnalysis: true });
  await settle();
  t.mock.timers.tick(20000);
  await settle();
  assert.deepEqual(state.events.map(event => event[0]), ['start', 'limit', 'processing', 'end']);
  assert.equal(await state.uploads[0].blob.text(), 'last audio');
});

test('missing recorder stop event is bounded and never uploads a truncated recording', async t => {
  const state = setup(t, { noAnalysis: true, emitStop: false });
  await settle();
  state.session.stop();
  assert.equal(state.track.stopped, 1);
  t.mock.timers.tick(2000);
  assert.deepEqual(state.errors, ['stop-timeout']);
  assert.equal(state.uploads.length, 0);
});

test('oversized recording fails before upload and closes the microphone', async t => {
  const state = setup(t, { noAnalysis: true });
  await settle();
  state.recorders[0].data(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]));
  await settle();
  assert.deepEqual(state.errors, ['audio-too-large']);
  assert.equal(state.track.stopped, 1);
  assert.equal(state.uploads.length, 0);
});

test('abort during capture ignores captured late recorder callbacks', async t => {
  const state = setup(t, { noAnalysis: true });
  await settle();
  const mic = state.recorders[0];
  const lateData = mic.ondataavailable;
  const lateStop = mic.onstop;
  const lateError = mic.onerror;
  state.session.abort();
  lateData({ data: new Blob(['late']) });
  lateStop();
  lateError();
  t.mock.timers.tick(50000);
  await settle();
  assert.equal(state.track.stopped, 1);
  assert.deepEqual(state.events.map(event => event[0]), ['start']);
  assert.deepEqual(state.errors, []);
  assert.equal(state.uploads.length, 0);
});

test('abort during transcription cancels the request and ignores its eventual result', async t => {
  let resolve;
  const state = setup(t, { noAnalysis: true, transcribe: () => new Promise(done => { resolve = done; }) });
  await settle();
  state.session.stop();
  await settle();
  state.session.abort();
  assert.equal(state.uploads[0].signal.aborted, true);
  resolve('Георги Иванов');
  await settle();
  assert.equal(state.transcripts.length, 0);
  assert.deepEqual(state.events.map(event => event[0]), ['start', 'processing']);
  assert.deepEqual(state.errors, []);
});

test('transcription deadline aborts a stalled request and ignores a late response', async t => {
  let resolve;
  const state = setup(t, { noAnalysis: true, transcribe: () => new Promise(done => { resolve = done; }) });
  await settle();
  state.session.stop();
  await settle();
  t.mock.timers.tick(20000);
  assert.equal(state.uploads[0].signal.aborted, true);
  assert.deepEqual(state.errors, ['transcription-timeout']);
  resolve('Късен резултат');
  await settle();
  assert.equal(state.transcripts.length, 0);
  assert.equal(state.events.filter(event => event[0] === 'end').length, 1);
});

test('empty transcription or provider failure produces no field update', async t => {
  for (const [name, transcribe, code] of [
    ['empty', async () => '  ', 'no-speech'],
    ['invalid', async () => ({}), 'transcription'],
    ['network', async () => { throw new Error('network'); }, 'transcription'],
    ['adapter code', async () => { throw Object.assign(new Error('rate limit'), { code: 'rate-limited' }); }, 'rate-limited'],
  ]) {
    await t.test(name, async t => {
      const state = setup(t, { noAnalysis: true, transcribe });
      await settle();
      state.session.stop();
      await settle();
      assert.deepEqual(state.errors, [code]);
      assert.equal(state.transcripts.length, 0);
      assert.equal(state.track.stopped, 1);
    });
  }
});

test('abort from processing callback prevents even starting an upload', async t => {
  let state;
  state = setup(t, { noAnalysis: true, onProcessing: () => state.session.abort() });
  await settle();
  state.session.stop();
  await settle();
  assert.equal(state.uploads.length, 0);
  assert.equal(state.track.stopped, 1);
  assert.deepEqual(state.events.map(event => event[0]), ['start', 'processing']);
});

test('missing recording APIs report unsupported without requesting permission', () => {
  const errors = [];
  let ended = 0;
  const session = startReservationAudioSession({
    mediaDevices: { getUserMedia: () => assert.fail('No permission request expected') },
    onError: code => errors.push(code), onEnd: () => { ended += 1; },
  });
  session.stop();
  session.abort();
  assert.deepEqual(errors, ['unsupported']);
  assert.equal(ended, 1);
});

test('constructor, start, and recording failures close tracks without upload', async t => {
  for (const option of [
    { constructorError: Object.assign(new Error('MIME unavailable'), { name: 'NotSupportedError' }) },
    { startError: new Error('cannot start') },
    { stopError: new Error('cannot stop') },
  ]) {
    await t.test(Object.keys(option)[0], async t => {
      const state = setup(t, { noAnalysis: true, ...option });
      await settle();
      if (option.stopError) state.session.stop();
      await settle();
      assert.equal(state.errors.length, 1);
      assert.equal(state.track.stopped, 1);
      assert.equal(state.uploads.length, 0);
    });
  }
});
