// Lossless, device-local recording for speech recognition. The worklet never
// sends microphone audio to a server or connects it audibly to the speakers.
const PROCESSOR = 'reservation-pcm-capture';

function failure(code) { return Object.assign(new Error(code), { code }); }

export function reservationPcmToWave(samples, sampleRate) {
  if (!(samples instanceof Float32Array) || !samples.length || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000 || samples.length > sampleRate * 21) throw failure('audio-capture');
  // AudioWorklet startup and Stop can add digital zeroes. Retain 50 ms around
  // the captured signal, touching no nonzero sample (including quiet speech).
  // Silence-only buffers stay intact so the recognizer can reject them.
  let first = 0, last = samples.length - 1;
  while (first < samples.length && samples[first] === 0) first++;
  if (first < samples.length) {
    while (last > first && samples[last] === 0) last--;
    const contextSamples = Math.ceil(sampleRate * 0.05);
    samples = samples.subarray(Math.max(0, first - contextSamples), Math.min(samples.length, last + 1 + contextSamples));
  }
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) throw failure('audio-capture');
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function createReservationPcmRecorder({
  stream, audioContext, maxRecordingMs = 20000, signal,
  AudioWorkletNode = globalThis.AudioWorkletNode,
} = {}) {
  if (signal?.aborted) throw failure('aborted');
  if (!audioContext?.audioWorklet?.addModule || typeof AudioWorkletNode !== 'function'
    || typeof audioContext.createMediaStreamSource !== 'function' || typeof audioContext.createGain !== 'function'
    || !Number.isFinite(audioContext.sampleRate) || audioContext.sampleRate > 96000) throw failure('pcm-unsupported');
  await audioContext.audioWorklet.addModule(new URL('./reservationPcmRecorder.worklet.js?no-inline', import.meta.url));
  if (signal?.aborted) throw failure('aborted');
  let node, source, silent;
  let active = false;
  let disposed = false;
  const disconnect = () => {
    for (const target of [source, node, silent]) { try { target?.disconnect(); } catch { /* Already detached. */ } }
    source = silent = null;
    if (node) { node.onprocessorerror = null; node.port.onmessage = null; node.port.close(); node = null; }
  };
  const recorder = {
    state: 'inactive', mimeType: 'audio/wav', onstart: null, ondataavailable: null, onstop: null, onerror: null,
    start() {
      if (disposed || active || signal?.aborted) throw failure('audio-capture');
      active = true; recorder.state = 'recording';
      node.port.postMessage({ type: 'start' });
    },
    stop() {
      if (!active || disposed) return;
      active = false; recorder.state = 'inactive';
      // All PCM is retained in the worklet until this explicit flush. Stopping
      // the input tracks now cannot discard the final captured samples.
      node.port.postMessage({ type: 'stop' });
    },
    dispose() {
      if (disposed) return;
      disposed = true; active = false; recorder.state = 'inactive';
      signal?.removeEventListener('abort', recorder.dispose);
      disconnect();
    },
  };
  try {
    node = new AudioWorkletNode(audioContext, PROCESSOR, {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { maxSamples: Math.ceil(audioContext.sampleRate * maxRecordingMs / 1000) },
    });
    source = audioContext.createMediaStreamSource(stream);
    silent = audioContext.createGain(); silent.gain.value = 0;
    source.connect(node); node.connect(silent); silent.connect(audioContext.destination);
    node.onprocessorerror = () => { if (!disposed) { recorder.onerror?.(); recorder.dispose(); } };
    node.port.onmessage = event => {
      if (disposed) return;
      const data = event.data;
      if (data?.type === 'started' && active) recorder.onstart?.();
      else if (data?.type === 'stopped') {
        active = false; recorder.state = 'inactive';
        try {
          const blob = reservationPcmToWave(data.samples, audioContext.sampleRate);
          recorder.ondataavailable?.({ data: blob });
          recorder.onstop?.();
        } catch { recorder.onerror?.(); }
        recorder.dispose();
      }
    };
    signal?.addEventListener('abort', recorder.dispose, { once: true });
    return recorder;
  } catch (error) { recorder.dispose(); throw error; }
}
