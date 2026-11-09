import test from 'node:test';
import assert from 'node:assert/strict';
import { startReservationFieldSpeechSession } from '../reservations/reservationFieldSpeechSession.js';

function setup(t, { isComplete = () => true } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const instances = [];
  const transcripts = [];
  const errors = [];
  let ended = 0;
  let limited = 0;
  class Recognition {
    constructor() { instances.push(this); this.stopped = 0; this.aborted = 0; }
    start() {}
    stop() { this.stopped += 1; }
    abort() { this.aborted += 1; }
    result(...chunks) {
      this.onresult?.({ results: chunks.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) });
    }
  }
  const session = startReservationFieldSpeechSession({
    Recognition, language: 'bg-BG',
    onTranscript: value => { transcripts.push(value); return isComplete(value.finalText); },
    onEnd: () => { ended += 1; },
    onError: code => errors.push(code),
    onLimit: () => { limited += 1; },
  });
  t.after(() => session.abort());
  return { session, instances, transcripts, errors, get ended() { return ended; }, get limited() { return limited; } };
}

test('field session keeps interim speech separate and exposes finalized value immediately', t => {
  const state = setup(t, { isComplete: text => text === 'Георги Иванов' });
  const mic = state.instances[0];
  assert.equal(mic.lang, 'bg-BG');
  assert.equal(mic.continuous, true);
  mic.result(['Георги', false]);
  assert.deepEqual(state.transcripts.at(-1), { text: 'Георги', finalText: '' });
  mic.result(['Георги Иванов', true]);
  assert.deepEqual(state.transcripts.at(-1), { text: 'Георги Иванов', finalText: 'Георги Иванов' });
  t.mock.timers.tick(1499);
  assert.equal(mic.stopped, 0);
  t.mock.timers.tick(1);
  assert.equal(mic.stopped, 1);
  mic.onend();
  assert.equal(state.ended, 1);
});

test('incomplete phone fragments survive engine restart and get a longer pause', t => {
  const state = setup(t, { isComplete: text => text.replace(/\s/g, '').length === 10 });
  state.instances[0].result(['089', true]);
  t.mock.timers.tick(2000);
  assert.equal(state.instances[0].stopped, 0);
  state.instances[0].onend();
  t.mock.timers.tick(150);
  assert.equal(state.instances.length, 2);
  state.instances[1].result(['56 12', true]);
  assert.equal(state.transcripts.at(-1).finalText, '089 56 12');
  state.instances[1].result(['56 12', true], ['461', true]);
  assert.equal(state.transcripts.at(-1).finalText, '089 56 12 461');
  t.mock.timers.tick(1500);
  assert.equal(state.instances[1].stopped, 1);
});

test('pressing Stop flushes a last final result without restarting recognition', t => {
  const state = setup(t, { isComplete: text => Boolean(text) });
  const mic = state.instances[0];
  mic.result(['Георги Иванов', false]);
  state.session.stop();
  mic.result(['Георги Иванов', true]);
  mic.onend();
  t.mock.timers.tick(5000);
  assert.deepEqual(state.transcripts.at(-1), { text: 'Георги Иванов', finalText: 'Георги Иванов' });
  assert.equal(state.ended, 1);
  assert.equal(state.instances.length, 1);
});

test('abort on field switch or unmount ignores captured late browser events', t => {
  const state = setup(t);
  const mic = state.instances[0];
  const lateResult = mic.onresult;
  const lateError = mic.onerror;
  const lateEnd = mic.onend;
  state.session.abort();
  lateResult({ results: [Object.assign([{ transcript: 'Георги Иванов' }], { isFinal: true })] });
  lateError({ error: 'network' });
  lateEnd();
  t.mock.timers.tick(30000);
  assert.equal(mic.aborted, 1);
  assert.equal(state.transcripts.length, 0);
  assert.deepEqual(state.errors, []);
  assert.equal(state.ended, 0);
  assert.equal(state.instances.length, 1);
});

test('permission and network errors stop without microphone retry loops', async t => {
  for (const code of ['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'no-speech']) {
    await t.test(code, t => {
      const state = setup(t);
      state.instances[0].onerror({ error: code });
      t.mock.timers.tick(30000);
      assert.deepEqual(state.errors, [code]);
      assert.equal(state.ended, 1);
      assert.equal(state.instances.length, 1);
    });
  }
});

test('twenty-second cap stops and still accepts the final utterance', t => {
  const state = setup(t);
  t.mock.timers.tick(20000);
  assert.equal(state.limited, 1);
  assert.equal(state.instances[0].stopped, 1);
  state.instances[0].result(['трима', true]);
  state.instances[0].onend();
  assert.equal(state.transcripts.at(-1).finalText, 'трима');
  assert.equal(state.ended, 1);
});

test('missing browser end event cannot leave Stop stuck indefinitely', t => {
  const state = setup(t);
  state.session.stop();
  t.mock.timers.tick(1500);
  assert.equal(state.ended, 1);
  assert.equal(state.instances[0].aborted, 1);
});
