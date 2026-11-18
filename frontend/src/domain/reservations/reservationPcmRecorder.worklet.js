/* global AudioWorkletProcessor, registerProcessor */
// One bounded mono buffer for this explicitly started recording. Samples remain
// in memory and are transferred once, after Stop or the twenty-second cap.
class ReservationPcmCapture extends AudioWorkletProcessor {
  constructor({ processorOptions } = {}) {
    super();
    const maxSamples = Number(processorOptions?.maxSamples);
    this.samples = new Float32Array(Number.isInteger(maxSamples) && maxSamples > 0 && maxSamples <= 96000 * 20 ? maxSamples : 16000 * 20);
    this.length = 0;
    this.active = false;
    this.done = false;
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'start' && !this.done) {
        this.active = true;
        this.port.postMessage({ type: 'started' });
      } else if (data?.type === 'stop') this.finish();
    };
  }
  finish() {
    if (this.done) return;
    this.active = false; this.done = true;
    const samples = this.samples.slice(0, this.length);
    this.samples = null;
    this.port.postMessage({ type: 'stopped', samples }, [samples.buffer]);
  }
  process(inputs) {
    if (this.done) return false;
    const channels = inputs[0];
    if (!this.active || !channels?.length || !channels[0]?.length) return true;
    const frames = Math.min(channels[0].length, this.samples.length - this.length);
    for (let frame = 0; frame < frames; frame++) {
      let sample = 0;
      for (const channel of channels) sample += channel[frame] || 0;
      this.samples[this.length++] = sample / channels.length;
    }
    if (this.length === this.samples.length) this.finish();
    return !this.done;
  }
}
registerProcessor('reservation-pcm-capture', ReservationPcmCapture);
