// Real browser capture (AudioWorklet PCM or MediaRecorder AAC/MP4), audio decode
// and local WASM recognition. AAC mode preserves a diagnostic reproduction.
// Audio comes from a synthetic WAV played into a real MediaStreamDestination;
// no microphone hardware, production API, credentials or remote ASR is used.
// node script <output> <playwright-index.mjs> <chrome> <webkit> <audio-root> [aac|pcm]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVoiceReservationField } from '../frontend/src/domain/reservations/voiceReservationField.js';

const [outputRoot, playwrightPath, chromePath, webkitPath, audioRoot, capture = 'aac'] = process.argv.slice(2);
assert.ok(['aac', 'pcm'].includes(capture));
assert.ok(outputRoot && playwrightPath && chromePath && webkitPath && audioRoot);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
await fs.mkdir(outputRoot, { recursive: true });
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><button id="record">Record synthetic sample</button>');
      return;
    }
    let file;
    if (pathname.startsWith('/speech/')) file = path.join(repo, 'frontend/public', pathname);
    else if (pathname.startsWith('/src/domain/')) file = path.join(repo, 'frontend', pathname);
    else if (pathname === '/sample/bg-name-raw.wav' || pathname === '/sample/bg-phone-raw.wav') file = path.join(audioRoot, path.basename(pathname));
    else { response.writeHead(404).end(); return; }
    if (pathname.includes('..')) { response.writeHead(400).end(); return; }
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream';
    response.setHeader('Content-Type', type);
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [], errors = [];
try {
  for (const [engine, launcher, executablePath] of [['chromium', chromium, chromePath], ['webkit', webkit, webkitPath]]) {
    const browser = await launcher.launch({ headless: true, executablePath });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(180000);
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      page.on('pageerror', error => errors.push({ engine, error: error.message }));
      await page.goto(origin);
      const preparation = await page.evaluate(async () => {
        const { createReservationLocalSpeech } = await import('/src/domain/reservations/reservationLocalSpeech.js');
        const { startReservationAudioSession } = await import('/src/domain/reservations/reservationAudioSession.js');
        window.qaClient = createReservationLocalSpeech();
        window.qaStart = startReservationAudioSession;
        const started = performance.now();
        await window.qaClient.prepare();
        return { seconds: (performance.now() - started) / 1000, status: window.qaClient.getSnapshot().status };
      });
      for (const [field, file, expected, preRollMs] of [['guestName', 'bg-name-raw.wav', 'георги иванов', 0], ['phone', 'bg-phone-raw.wav', '0895124615', 0], ['phone', 'bg-phone-raw.wav', '0895124615', 300]]) {
        await page.evaluate(({ field, file, preRollMs, capture }) => {
          window.qaResult = null;
          document.getElementById('record').onclick = async () => {
            const sourceContext = new AudioContext();
            const resume = sourceContext.resume();
            let session;
            const result = { field, mimeType: null, bytes: null, transcript: null, error: null, silenceDetection: null, tracksStopped: false };
            try {
              await resume;
              const audio = await sourceContext.decodeAudioData(await (await fetch('/sample/' + file)).arrayBuffer());
              const source = sourceContext.createBufferSource();
              source.buffer = audio;
              const destination = sourceContext.createMediaStreamDestination();
              source.connect(destination);
              const tracks = destination.stream.getTracks();
              let timer;
              await new Promise(resolve => {
                session = window.qaStart({
                  mediaDevices: { getUserMedia: async () => destination.stream },
                  MediaRecorder, AudioContext, language: 'bg-BG', field, preferPcm: capture === 'pcm',
                  onStart: metadata => {
                    result.silenceDetection = metadata.silenceDetection;
                    source.start(sourceContext.currentTime + preRollMs / 1000);
                    timer = setTimeout(() => session.stop(), (audio.duration + 0.35) * 1000 + preRollMs);
                  },
                  transcribe: async request => {
                    result.mimeType = request.blob.type;
                    result.bytes = request.blob.size;
                    const bytes = new Uint8Array(await request.blob.arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); result.recordedBase64 = btoa(binary);
                    return window.qaClient.transcribe(request);
                  },
                  onTranscript: value => { result.transcript = value.finalText; },
                  onError: code => { result.error = code; },
                  onEnd: () => { clearTimeout(timer); resolve(); },
                });
              });
              result.tracksStopped = tracks.every(track => track.readyState === 'ended');
            } catch (error) { result.error = error.code || error.message; }
            finally {
              session?.abort();
              await sourceContext.close().catch(() => {});
              result.clientState = window.qaClient.getSnapshot();
              window.qaResult = result;
            }
          };
        }, { field, file, preRollMs, capture });
        await page.locator('#record').click();
        await page.waitForFunction(() => window.qaResult, null, { timeout: 45000 });
        const result = await page.evaluate(() => window.qaResult);
        const { recordedBase64, ...metadata } = result;
        if (recordedBase64) await fs.writeFile(path.join(outputRoot, `${engine}-${field}-${preRollMs}.${capture === 'pcm' ? 'wav' : 'm4a'}`), Buffer.from(recordedBase64, 'base64'));
        const parsed = parseVoiceReservationField(field, result.transcript || '', new Date(), { language: 'bg-BG' });
        results.push({ engine, preparation, expected, preRollMs, parsed, matches: parsed.value === expected, ...metadata });
        console.log(JSON.stringify(results.at(-1)));
        assert.equal(result.error, null, `${engine} ${field} native capture must decode`);
        assert.match(result.mimeType, capture === 'pcm' ? /^audio\/wav/ : /^audio\/mp4/);
        assert.equal(result.tracksStopped, true);
        assert.equal(result.clientState.status, 'ready');
        assert.ok(result.transcript?.length > 0, `${engine} ${field} produced no transcript`);
      }
      await page.evaluate(() => window.qaClient.dispose());
      await context.close();
    } catch (error) { errors.push({ engine, error: error.stack }); }
    finally { await browser.close(); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  const capturePassed = results.length === 6 && results.every(result => !result.error) && errors.length === 0;
  const passed = capturePassed && results.every(result => result.matches);
  await fs.writeFile(path.join(outputRoot, 'report.json'), JSON.stringify({ passed, capturePassed, capture, syntheticAudio: true, realMediaRecorder: capture === 'aac', realAudioWorklet: capture === 'pcm', realDecoder: true, realAsr: true, physicalIpadTested: false, results, errors }, null, 2));
  if (!passed) process.exitCode = 1;
}
