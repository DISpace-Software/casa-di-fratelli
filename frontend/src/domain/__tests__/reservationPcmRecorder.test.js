import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createReservationPcmRecorder, reservationPcmToWave } from '../reservations/reservationPcmRecorder.js';

test('PCM recording encodes a mono WAV with exact rate, samples and bounded clipping', async () => {
  const blob = reservationPcmToWave(new Float32Array([-2, -1, 0, 0.5, 1, 2]), 16000);
  const data = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, 'audio/wav');
  assert.equal(data.byteLength, 56);
  assert.equal(new TextDecoder().decode(new Uint8Array(data.buffer, 0, 4)), 'RIFF');
  assert.equal(data.getUint16(22, true), 1);
  assert.equal(data.getUint32(24, true), 16000);
  assert.equal(data.getUint32(40, true), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => data.getInt16(44 + i * 2, true)), [-32768, -32768, 0, 16384, 32767, 32767]);
  for (const samples of [new Float32Array(), new Float32Array([NaN]), new Float32Array([Infinity]), new Float32Array(16000 * 21 + 1)]) {
    assert.throws(() => reservationPcmToWave(samples, 16000), { code: 'audio-capture' });
  }
});

test('PCM trims only digital-zero edges with 50 ms context, preserving quiet samples and full silence', async () => {
  const samples = new Float32Array(16000);
  samples[8000] = 0.00000001;
  const trimmed = new DataView(await reservationPcmToWave(samples, 16000).arrayBuffer());
  assert.equal(trimmed.getUint32(40, true), (800 + 1 + 800) * 2, 'Even a tiny nonzero sample must retain its context');
  const silent = new DataView(await reservationPcmToWave(new Float32Array(16000), 16000).arrayBuffer());
  assert.equal(silent.getUint32(40, true), 32000, 'All-silent data is left for the recognizer to reject');
  const quiet = new Float32Array(2000).fill(0.00001);
  const unchanged = new DataView(await reservationPcmToWave(quiet, 16000).arrayBuffer());
  assert.equal(unchanged.getUint32(40, true), 4000, 'No amplitude threshold may delete quiet voice');
});

function harness() {
  const nodes = [];
  const graph = () => ({ connections: [], disconnected: 0, connect(target) { this.connections.push(target); }, disconnect() { this.disconnected++; } });
  const source = graph(), silent = { ...graph(), gain: { value: 1 } };
  const context = {
    sampleRate: 16000, destination: {}, moduleUrl: null,
    audioWorklet: { addModule: async url => { context.moduleUrl = String(url); } },
    createMediaStreamSource: () => source, createGain: () => silent,
  };
  class Node {
    constructor(_context, name, options) {
      Object.assign(this, graph()); this.name = name; this.options = options;
      this.port = { messages: [], closed: 0, postMessage(message) { this.messages.push(message); }, close() { this.closed++; } };
      nodes.push(this);
    }
  }
  return { context, source, silent, nodes, Node };
}

test('PCM worklet stays silent, flushes once, and disconnects its graph after Stop', async () => {
  const h = harness();
  const recorder = await createReservationPcmRecorder({ stream: {}, audioContext: h.context, AudioWorkletNode: h.Node });
  const node = h.nodes[0];
  assert.match(h.context.moduleUrl, /reservationPcmRecorder\.worklet\.js\?no-inline$/);
  assert.equal(h.silent.gain.value, 0);
  assert.equal(node.options.processorOptions.maxSamples, 320000);
  const events = [];
  recorder.onstart = () => events.push('start');
  recorder.ondataavailable = event => events.push(event.data.type);
  recorder.onstop = () => events.push('stop');
  recorder.start(); node.port.onmessage({ data: { type: 'started' } });
  recorder.stop(); recorder.stop();
  assert.deepEqual(node.port.messages, [{ type: 'start' }, { type: 'stop' }]);
  assert.equal(node.disconnected, 0, 'Stop must await the worklet final buffer');
  node.port.onmessage({ data: { type: 'stopped', samples: new Float32Array([0.1, 0.2]) } });
  assert.deepEqual(events, ['start', 'audio/wav', 'stop']);
  assert.equal(node.disconnected, 1); assert.equal(node.port.closed, 1);
  assert.equal(h.source.disconnected, 1); assert.equal(h.silent.disconnected, 1);
  recorder.dispose(); assert.equal(node.disconnected, 1);
});

test('aborted PCM preparation creates no live graph; active abort cannot emit audio', async () => {
  const h = harness(), controller = new AbortController();
  let finishLoading;
  h.context.audioWorklet.addModule = () => new Promise(resolve => { finishLoading = resolve; });
  const preparing = createReservationPcmRecorder({ stream: {}, audioContext: h.context, AudioWorkletNode: h.Node, signal: controller.signal });
  controller.abort(); finishLoading();
  await assert.rejects(preparing, { code: 'aborted' });
  assert.equal(h.nodes.length, 0);
  h.context.audioWorklet.addModule = async () => {};
  const secondController = new AbortController();
  const recorder = await createReservationPcmRecorder({ stream: {}, audioContext: h.context, AudioWorkletNode: h.Node, signal: secondController.signal });
  const node = h.nodes[0], lateMessage = node.port.onmessage;
  let audio = 0; recorder.ondataavailable = () => audio++;
  recorder.start(); secondController.abort();
  lateMessage({ data: { type: 'stopped', samples: new Float32Array([0.2]) } });
  assert.equal(audio, 0); assert.equal(node.disconnected, 1);
});

test('PCM processor averages channels and bounds an un-stopped recording in memory', async () => {
  let Processor;
  class Base { constructor() { this.port = { messages: [], postMessage(value) { this.messages.push(value); } }; } }
  const code = await fs.readFile(new URL('../reservations/reservationPcmRecorder.worklet.js', import.meta.url), 'utf8');
  vm.runInNewContext(code, { Float32Array, AudioWorkletProcessor: Base, registerProcessor: (_name, value) => { Processor = value; } });
  const processor = new Processor({ processorOptions: { maxSamples: 3 } });
  processor.port.onmessage({ data: { type: 'start' } });
  assert.equal(processor.process([[new Float32Array([0.2, 0.4]), new Float32Array([0.4, 0.6])]]), true);
  assert.equal(processor.process([[new Float32Array([0.7, 0.9])]]), false);
  const stopped = processor.port.messages.filter(message => message.type === 'stopped');
  assert.equal(stopped.length, 1);
  assert.deepEqual([...stopped[0].samples].map(value => +value.toFixed(1)), [0.3, 0.5, 0.7]);
  assert.equal(processor.samples, null);
  processor.port.onmessage({ data: { type: 'stop' } });
  assert.equal(processor.port.messages.filter(message => message.type === 'stopped').length, 1);
});
