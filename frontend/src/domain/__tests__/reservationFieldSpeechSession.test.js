import test from 'node:test';
import assert from 'node:assert/strict';
import { startReservationFieldSpeechSession } from '../reservations/reservationFieldSpeechSession.js';

function setup(t, { isComplete = () => true, start = mic => mic.onstart?.(), stop } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const instances = [];
  const transcripts = [];
  const errors = [];
  let ended = 0;
  let limited = 0;
  let started = 0;
  class Recognition {
    constructor() { instances.push(this); this.stopped = 0; this.aborted = 0; }
    start() { start(this); }
    stop() { this.stopped += 1; stop?.(this); }
    abort() { this.aborted += 1; }
    result(...chunks) {
      this.onresult?.({ results: chunks.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) });
    }
  }
  const session = startReservationFieldSpeechSession({
    Recognition, language: 'bg-BG',
    onStart: () => { started += 1; },
    onTranscript: value => { transcripts.push(value); return isComplete(value.finalText); },
    onEnd: () => { ended += 1; },
    onError: code => errors.push(code),
    onLimit: () => { limited += 1; },
  });
  t.after(() => session.abort());
  return { session, instances, transcripts, errors, get started() { return started; }, get ended() { return ended; }, get limited() { return limited; } };
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
  t.mock.timers.tick(250);
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
  for (const code of ['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'no-speech', 'language-not-supported', 'aborted']) {
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

test('readiness and recording cap wait for real start, including delayed permission', t => {
  const state = setup(t, { start() {} });
  const mic = state.instances[0];
  t.mock.timers.tick(11000);
  assert.equal(state.started, 0);
  assert.equal(state.limited, 0);
  mic.onstart();
  mic.onstart();
  assert.equal(state.started, 1);
  t.mock.timers.tick(19999);
  assert.equal(mic.stopped, 0);
  t.mock.timers.tick(1);
  assert.equal(state.limited, 1);
  assert.equal(mic.stopped, 1);
  t.mock.timers.tick(1500);
  assert.equal(state.ended, 1);
});

test('a silent permission/provider stall fails finitely and ignores late permission', t => {
  const state = setup(t, { start() {} });
  const mic = state.instances[0];
  const lateStart = mic.onstart;
  const lateResult = mic.onresult;
  t.mock.timers.tick(12000);
  assert.deepEqual(state.errors, ['start-timeout']);
  assert.equal(state.ended, 1);
  assert.equal(mic.aborted, 1);
  lateStart();
  lateResult({ results: [Object.assign([{ transcript: 'трима' }], { isFinal: true })] });
  assert.equal(state.started, 0);
  assert.equal(state.transcripts.length, 0);
  assert.equal(state.instances.length, 1);
});

test('Stop while permission is pending cancels without a false listening phase', t => {
  const state = setup(t, { start() {} });
  const mic = state.instances[0];
  const lateStart = mic.onstart;
  state.session.stop();
  state.session.stop();
  lateStart();
  t.mock.timers.tick(30000);
  assert.equal(mic.stopped, 0);
  assert.equal(mic.aborted, 1);
  assert.equal(state.ended, 1);
  assert.equal(state.started, 0);
  assert.deepEqual(state.errors, []);
});

test('duplicate cumulative events neither repeat field updates nor delay auto stop', t => {
  const state = setup(t);
  const mic = state.instances[0];
  mic.result(['трима', true]);
  t.mock.timers.tick(1400);
  mic.result(['трима', true]);
  t.mock.timers.tick(100);
  assert.equal(state.transcripts.length, 1);
  assert.equal(mic.stopped, 1);
});

test('repeated spoken digits at different result positions are retained', t => {
  const state = setup(t, { isComplete: () => false });
  const mic = state.instances[0];
  mic.result(['089', true], ['22', true]);
  mic.result(['089', true], ['22', true], ['22', true]);
  assert.equal(state.transcripts.at(-1).finalText, '089 22 22');
});

test('new speech activity prevents a complete name prefix from stopping the surname', t => {
  const state = setup(t, { isComplete: text => text.startsWith('Георги') });
  const mic = state.instances[0];
  mic.result(['Георги', true]);
  t.mock.timers.tick(1000);
  mic.onspeechstart();
  t.mock.timers.tick(2000);
  assert.equal(mic.stopped, 0);
  mic.onspeechend();
  t.mock.timers.tick(2000);
  assert.equal(mic.stopped, 0);
  mic.result(['Георги', true], ['Иванов', true]);
  t.mock.timers.tick(1500);
  assert.equal(mic.stopped, 1);
  assert.equal(state.transcripts.at(-1).finalText, 'Георги Иванов');
});

test('a final result delivered during speech waits for speechend before its short pause', t => {
  const state = setup(t);
  const mic = state.instances[0];
  mic.onspeechstart();
  mic.result(['трима', true]);
  t.mock.timers.tick(2000);
  assert.equal(mic.stopped, 0);
  mic.onspeechend();
  t.mock.timers.tick(1500);
  assert.equal(mic.stopped, 1);
});

test('changing/removing interim results never promotes them to the finalized value', t => {
  const state = setup(t, { isComplete: () => false });
  const mic = state.instances[0];
  mic.result(['089', true], ['56', false]);
  mic.result(['089', true], ['57 12', false]);
  mic.result(['089', true]);
  assert.deepEqual(state.transcripts.map(value => value.finalText), ['089', '089', '089']);
  assert.equal(state.transcripts.at(-1).text, '089');
});

test('an empty normal end cannot start a busy retry loop', t => {
  const state = setup(t);
  state.instances[0].onend();
  t.mock.timers.tick(30000);
  assert.equal(state.instances.length, 1);
  assert.equal(state.ended, 1);
  assert.deepEqual(state.errors, ['no-speech']);
});

test('phone continuation stops retrying if a subsequent recognizer adds no finalized speech', t => {
  const state = setup(t, { isComplete: () => false });
  state.instances[0].result(['089', true]);
  state.instances[0].onend();
  t.mock.timers.tick(250);
  state.instances[1].onend();
  t.mock.timers.tick(30000);
  assert.equal(state.instances.length, 2);
  assert.equal(state.started, 1);
  assert.equal(state.ended, 1);
  assert.equal(state.transcripts.at(-1).finalText, '089');
});

test('even progressing incomplete speech has a bounded restart budget', t => {
  const state = setup(t, { isComplete: () => false });
  for (let index = 0; index < 4; index += 1) {
    state.instances[index].result([String(index), true]);
    state.instances[index].onend();
    t.mock.timers.tick(1000);
  }
  t.mock.timers.tick(30000);
  assert.equal(state.instances.length, 4);
  assert.equal(state.ended, 1);
  assert.equal(state.transcripts.at(-1).finalText, '0 1 2 3');
});

test('Stop during restart delay finishes without creating another microphone', t => {
  const state = setup(t, { isComplete: () => false });
  state.instances[0].result(['089', true]);
  state.instances[0].onend();
  state.session.stop();
  t.mock.timers.tick(30000);
  assert.equal(state.instances.length, 1);
  assert.equal(state.ended, 1);
});

test('nomatch ends with a useful error and no automatic retry', t => {
  const state = setup(t);
  state.instances[0].onnomatch();
  t.mock.timers.tick(30000);
  assert.deepEqual(state.errors, ['no-match']);
  assert.equal(state.ended, 1);
  assert.equal(state.instances.length, 1);
});

test('a trailing nomatch does not invalidate an already finalized complete value', t => {
  const state = setup(t);
  state.instances[0].result(['трима', true]);
  state.instances[0].onnomatch();
  assert.equal(state.ended, 1);
  assert.deepEqual(state.errors, []);
  assert.equal(state.transcripts.at(-1).finalText, 'трима');
});

test('synchronous start failures or end events finish exactly once with no lingering retry', async t => {
  for (const [name, start] of [
    ['throw', () => { throw new Error('provider start failure'); }],
    ['end', mic => mic.onend()],
    ['error followed by end', mic => { const end = mic.onend; mic.onerror({ error: 'language-not-supported' }); end(); }],
  ]) {
    await t.test(name, t => {
      const state = setup(t, { start });
      t.mock.timers.tick(30000);
      assert.equal(state.ended, 1);
      assert.equal(state.started, 0);
      assert.equal(state.errors.length, 1);
      assert.equal(state.instances.length, 1);
    });
  }
});

test('constructor failure ends without starting any timers or requesting a microphone', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let ended = 0;
  const errors = [];
  const session = startReservationFieldSpeechSession({
    Recognition: class { constructor() { throw new Error('unavailable'); } },
    language: 'bg-BG', onTranscript: () => assert.fail('No transcript expected'),
    onError: code => errors.push(code), onEnd: () => { ended += 1; },
  });
  session.stop();
  session.abort();
  t.mock.timers.tick(30000);
  assert.deepEqual(errors, ['start']);
  assert.equal(ended, 1);
});

test('synchronous stop results flush before end and captured late events stay ignored', t => {
  const state = setup(t, { stop: mic => { mic.result(['трима', true]); mic.onend(); } });
  const mic = state.instances[0];
  const lateResult = mic.onresult;
  state.session.stop();
  lateResult({ results: [Object.assign([{ transcript: 'четирима' }], { isFinal: true })] });
  t.mock.timers.tick(30000);
  assert.equal(state.transcripts.length, 1);
  assert.equal(state.transcripts.at(-1).finalText, 'трима');
  assert.equal(state.ended, 1);
});

test('aborting synchronously from a transcript consumer cannot leave auto-stop timers behind', t => {
  let state;
  state = setup(t, { isComplete: () => { state.session.abort(); return true; } });
  const mic = state.instances[0];
  mic.result(['трима', true]);
  t.mock.timers.tick(30000);
  assert.equal(mic.stopped, 0);
  assert.equal(mic.aborted, 1);
  assert.equal(state.ended, 0);
  assert.equal(state.limited, 0);
});
