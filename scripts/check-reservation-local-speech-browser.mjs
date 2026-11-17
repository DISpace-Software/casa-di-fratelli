// Disposable local fixture only. Real UI/client with a stub of this application's
// dedicated speech worker, synthetic capture and PCM decoding. No model accuracy,
// real microphone, physical iPad, WebGPU performance or production CSP claim.
// node script <private-state.json> <output-dir> <playwright-index.mjs> <chrome> [webkit]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [statePath, outputRoot, playwrightPath, chromiumPath, webkitPath] = process.argv.slice(2);
const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const value of [state.apiUrl, state.origin]) assert.equal(new URL(value).hostname, '127.0.0.1');
await fs.mkdir(outputRoot, { recursive: true });
const checks = [], errors = [], voiceRequests = [], runtimeRequests = [], operationalWrites = [], browsers = [];
const fields = ['guestName', 'phone'];
const manualFields = ['reservedDate', 'reservedTime', 'guestCount', 'email'];
const allFields = [...fields, ...manualFields];
const speech = { guestName: 'Георги Иванов', phone: 'Телефонче: 0888 12 34 56' };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tomorrow = new Date(today + 'T12:00:00Z'); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const expected = { guestName: 'Георги Иванов', phone: '0888123456', reservedDate: tomorrow.toISOString().slice(0, 10), reservedTime: '19:30', guestCount: '3', email: 'georgi@example.bg' };
let currentPage;
const passed = name => { checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
const mic = (form, field) => form.locator(`button[data-voice-field="${field}"]`);
const input = (form, field) => form.locator(`input[name$=".${field}"], select[name$=".${field}"]`);
const status = form => form.locator('[data-reservation-field-dictation]');
const prepareButton = form => form.locator('[data-voice-prepare]');
async function values(form) { return Object.fromEntries(await Promise.all(allFields.map(async key => [key, await input(form, key).inputValue()]))); }
async function waitPhase(form, value) {
  await status(form).evaluate((element, value) => new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (element.dataset.voicePhase === value) return resolve();
      if (Date.now() - start > 5000) return reject(new Error(`Expected ${value}, got ${element.dataset.voicePhase}`));
      setTimeout(check, 10);
    }; check();
  }), value);
}
async function reservations() {
  const response = await fetch(state.apiUrl + '/api/reservations', { headers: { 'X-Tenant-Id': 'casa-di-fratelli', 'X-Admin-Token': state.tenants['casa-di-fratelli'].auth.token } });
  assert.equal(response.status, 200); return response.json();
}
async function open(browser, engine, orientation, options = {}) {
  const viewport = orientation === 'portrait' ? { width: 820, height: 1180 } : { width: 1180, height: 820 };
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, timezoneId: 'Europe/Sofia' });
  await context.addInitScript(({ options, speech }) => {
    const qa = window.qaLocalSpeech = { workers: [], messages: [], streams: [], audioContexts: [], decoders: [], permissions: 0, gpuProbes: 0, autoReady: true, autoResult: true, nextText: null };
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => {
      qa.gpuProbes++; throw new Error('WASM dictation must not request a GPU');
    } } });
    if (options.unsupportedWasm) Object.defineProperty(WebAssembly, 'instantiate', { configurable: true, value: undefined });
    const NativeWorker = window.Worker;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('reservationLocalSpeech.worker')) return new NativeWorker(url, options);
        this.url = String(url); this.workerType = options?.type || 'classic'; this.terminated = 0; qa.workers.push(this); qa.worker = this;
      }
      postMessage(data, transfer) {
        const message = structuredClone(data, { transfer: transfer || [] });
        qa.messages.push(message); this.message = message;
        if (message.type === 'prepare') {
          queueMicrotask(() => {
            this.onmessage?.({ data: { type: 'progress', id: message.id, loaded: 10000000, total: 85507778, file: 'synthetic-model.onnx' } });
            if (qa.autoReady) this.emit({ type: 'ready', id: message.id });
          });
        } else if (message.type === 'transcribe') {
          const text = qa.nextText ?? speech[message.field]; qa.nextText = null;
          if (qa.autoResult) queueMicrotask(() => this.emit({ type: 'result', id: message.id, text }));
        }
      }
      emit(data) { this.onmessage?.({ data }); }
      terminate() { this.terminated++; }
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: options.unsupportedAudio ? {} : {
      getUserMedia: async () => {
        qa.permissions++;
        const track = { stopped: 0, stop() { this.stopped++; } };
        const stream = { track, getTracks: () => [track] }; qa.streams.push(stream); return stream;
      },
    } });
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type.startsWith('audio/mp4'); }
      constructor(stream, options) { this.stream = stream; this.mimeType = options?.mimeType || 'audio/mp4'; this.state = 'inactive'; }
      start() { this.state = 'recording'; queueMicrotask(() => this.onstart?.()); }
      stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['synthetic-audio'], { type: this.mimeType }) }); this.onstop?.(); }); }
    };
    window.AudioContext = class {
      constructor() { this.state = 'suspended'; this.closed = 0; qa.audioContexts.push(this); }
      resume() { return Promise.resolve(); }
      close() { this.closed++; this.state = 'closed'; return Promise.resolve(); }
    };
    window.OfflineAudioContext = class {
      constructor(channels, length, sampleRate) { this.sampleRate = sampleRate; qa.decoders.push(this); }
      async decodeAudioData(encoded) {
        this.byteLength = encoded.byteLength;
        return { duration: 1, sampleRate: 16000, numberOfChannels: 1, length: 16000, getChannelData: () => new Float32Array(16000).fill(0.05) };
      }
    };
    window.webkitAudioContext = undefined; window.webkitOfflineAudioContext = undefined;
  }, { options, speech });
  const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push({ engine, error: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ engine, error: message.text() }); });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (/\/speech\/|huggingface\.co|cdn-lfs|\.onnx(?:\?|$)|\.wasm(?:\?|$)|transformers[./-].*\.js|ort-wasm/i.test(url.href)) {
      runtimeRequests.push({ engine, path: url.pathname }); return route.abort('blockedbyclient');
    }
    if (url.pathname.includes('/api/admin/reservations/voice')) {
      voiceRequests.push({ engine, method: request.method(), path: url.pathname }); return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !url.pathname.endsWith('/admin/login')) {
      operationalWrites.push({ engine, method: request.method(), path: url.pathname }); return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.goto(state.origin + '/r/casa-di-fratelli/admin');
  await page.locator('input[type=email]').fill(state.tenants['casa-di-fratelli'].email);
  await page.locator('input[type=password]').fill(state.tenants['casa-di-fratelli'].password);
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: /^Карта на резервациите/ }).waitFor();
  return { page, context, viewport };
}
async function formFor(page, mode) {
  if (mode === 'map') {
    await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
    await page.locator('.admin-map-table-node').filter({ hasText: /^23$/ }).click();
    await page.getByRole('button', { name: 'Създай резервация', exact: true }).click();
    return page.getByRole('form', { name: 'Резервация', exact: true });
  }
  await page.getByRole('button', { name: /^Резервации/ }).first().click();
  await page.getByRole('button', { name: 'Нова резервация', exact: true }).click();
  return page.locator('form').filter({ has: page.getByPlaceholder('Напр. 20, 21, 22', { exact: true }) });
}
async function prepare(page, form) {
  await prepareButton(form).click();
  await page.waitForFunction(() => window.qaLocalSpeech.worker?.message?.type === 'prepare');
  await mic(form, 'guestName').evaluate(element => new Promise((resolve, reject) => {
    const start = Date.now(); const check = () => {
      if (!element.disabled) return resolve();
      if (Date.now() - start > 3000) return reject(new Error('Local preparation did not enable fields'));
      setTimeout(check, 10);
    }; check();
  }));
}
async function assertMicClosed(page) {
  assert.equal(await page.evaluate(() => window.qaLocalSpeech.streams.every(stream => stream.track.stopped === 1)), true);
  assert.equal(await page.evaluate(() => window.qaLocalSpeech.audioContexts.every(context => context.closed === 1)), true);
}
async function reopenMapForm(page) {
  await page.locator('.admin-map-table-node').filter({ hasText: /^23$/ }).click();
  await page.getByRole('button', { name: 'Създай резервация', exact: true }).click();
  return page.getByRole('form', { name: 'Резервация', exact: true });
}
async function phoneCandidate(form) {
  await mic(form, 'phone').click(); await waitPhase(form, 'listening');
  await mic(form, 'phone').click(); await waitPhase(form, 'idle');
  await form.locator('[data-voice-accept-phone]').waitFor();
}

try {
  const before = await reservations();
  for (const [engine, type, executablePath] of [['chromium', chromium, chromiumPath], ['webkit', webkit, webkitPath]]) {
    const browser = await type.launch({ headless: true, ...(executablePath ? { executablePath } : {}) }); browsers.push(browser);
    for (const orientation of ['portrait', 'landscape']) for (const mode of ['map', 'list']) {
      const { page, context, viewport } = await open(browser, engine, orientation);
      const form = await formFor(page, mode);
      await prepareButton(form).waitFor();
      assert.equal(await form.locator('[data-voice-field]').count(), 2);
      for (const field of manualFields) assert.equal(await mic(form, field).count(), 0);
      assert.equal(await form.locator('select[name=reservationDictationLanguage]').count(), 0);
      for (const key of fields) assert.equal(await mic(form, key).isDisabled(), true);
      assert.deepEqual(await page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, gpuProbes: window.qaLocalSpeech.gpuProbes, permissions: window.qaLocalSpeech.permissions })), { workers: 0, gpuProbes: 0, permissions: 0 });
      assert.match(await status(form).innerText(), /не се изпраща към сървър/);
      await page.screenshot({ path: `${outputRoot}/${engine}-${orientation}-${mode}-before-prepare.png`, fullPage: true });
      await prepare(page, form);
      assert.equal(await page.evaluate(() => window.qaLocalSpeech.permissions), 0);
      assert.equal(await page.evaluate(() => window.qaLocalSpeech.worker.workerType), 'classic');
      await input(form, 'reservedDate').fill(expected.reservedDate);
      await input(form, 'reservedTime').selectOption(expected.reservedTime);
      await input(form, 'guestCount').fill(expected.guestCount);
      await input(form, 'email').fill(expected.email);
      for (const field of fields) {
        const previous = await values(form);
        await mic(form, field).click(); await waitPhase(form, 'listening');
        await mic(form, field).click(); await waitPhase(form, 'idle');
        if (field === 'phone') {
          await form.locator('[data-voice-accept-phone]').waitFor();
          assert.deepEqual(await values(form), previous);
          assert.match(await status(form).innerText(), /0888123456/);
          await page.screenshot({ path: `${outputRoot}/${engine}-${orientation}-${mode}-phone-review.png`, fullPage: true });
          await form.locator('[data-voice-accept-phone]').click();
        }
        const next = await values(form);
        assert.equal(next[field], expected[field]);
        for (const key of allFields) if (key !== field) assert.equal(next[key], previous[key]);
        const box = await mic(form, field).boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= viewport.width);
      }
      assert.deepEqual(await values(form), expected);
      assert.equal(await page.evaluate(() => window.qaLocalSpeech.workers.length), 1);
      const messages = await page.evaluate(() => window.qaLocalSpeech.messages.filter(message => message.type === 'transcribe').map(message => ({ field: message.field, language: message.language, length: message.audio.length, float: message.audio instanceof Float32Array })));
      assert.deepEqual(messages, fields.map(field => ({ field, language: 'bg', length: 16000, float: true })));
      await assertMicClosed(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      await page.screenshot({ path: `${outputRoot}/${engine}-${orientation}-${mode}-filled.png`, fullPage: true });
      passed(`${engine} ${orientation} ${mode}: no eager worker/model/mic, explicit preparation, name and phone only; date/time/count/email remain manual and unchanged, explicit phone confirmation, classic worker PCM transfer, readable tablet layout`);
      await context.close();
    }
    const { page, context } = await open(browser, engine, 'portrait'); const form = await formFor(page, 'map');
    await input(form, 'guestName').fill('Проверено Име');
    await page.evaluate(() => { window.qaLocalSpeech.autoReady = false; });
    await prepareButton(form).click(); await form.getByRole('progressbar').waitFor();
    await page.evaluate(() => { const qa = window.qaLocalSpeech; qa.latePrepare = qa.worker.onmessage; qa.oldPrepareId = qa.worker.message.id; });
    await status(form).getByRole('button', { name: 'Отмени', exact: true }).click();
    await prepareButton(form).waitFor();
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.worker.terminated), 1);
    await page.evaluate(() => window.qaLocalSpeech.latePrepare({ data: { type: 'ready', id: window.qaLocalSpeech.oldPrepareId } }));
    assert.equal(await mic(form, 'guestName').isDisabled(), true);
    assert.equal(await input(form, 'guestName').inputValue(), 'Проверено Име');
    passed(`${engine}: preparation cancellation terminates the worker and ignores a late ready response without touching the draft`);
    await page.evaluate(() => { window.qaLocalSpeech.autoReady = true; }); await prepare(page, form);
    await page.evaluate(() => { window.qaLocalSpeech.autoResult = false; });
    await mic(form, 'guestName').click(); await waitPhase(form, 'listening'); await mic(form, 'guestName').click(); await waitPhase(form, 'processing');
    await page.waitForFunction(() => window.qaLocalSpeech.worker.message.type === 'transcribe');
    await page.evaluate(() => { const qa = window.qaLocalSpeech; qa.lateResult = qa.worker.onmessage; qa.oldTranscribeId = qa.worker.message.id; });
    await input(form, 'guestName').fill('Ръчно Проверено'); await waitPhase(form, 'idle');
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.worker.terminated), 1);
    await page.evaluate(() => window.qaLocalSpeech.lateResult({ data: { type: 'result', id: window.qaLocalSpeech.oldTranscribeId, text: 'Нежелана Промяна' } }));
    assert.equal(await input(form, 'guestName').inputValue(), 'Ръчно Проверено'); await assertMicClosed(page);
    await prepareButton(form).waitFor();
    passed(`${engine}: typing during local inference cancels/terminates it; stale result cannot overwrite a field and preparation is required again`);
    await page.evaluate(() => { window.qaLocalSpeech.autoResult = true; }); await prepare(page, form);
    await mic(form, 'phone').click(); await waitPhase(form, 'listening');
    const count = await page.evaluate(() => window.qaLocalSpeech.messages.length);
    await page.getByRole('button', { name: 'Close reservation form', exact: true }).click();
    await assertMicClosed(page);
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.messages.length), count);
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.worker.terminated), 0);
    passed(`${engine}: closing the form aborts microphone capture, sends no transcription and retains the prepared parent-owned worker`);
    const readyCounts = await page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, preparations: window.qaLocalSpeech.messages.filter(message => message.type === 'prepare').length }));
    let reopened = await reopenMapForm(page);
    assert.equal(await prepareButton(reopened).count(), 0);
    assert.equal(await mic(reopened, 'guestName').isEnabled(), true);
    await input(reopened, 'phone').fill('0899123456');
    await phoneCandidate(reopened);
    assert.equal(await input(reopened, 'phone').inputValue(), '0899123456');
    await input(reopened, 'phone').fill('0877123456');
    assert.equal(await reopened.locator('[data-voice-accept-phone]').count(), 0);
    assert.equal(await input(reopened, 'phone').inputValue(), '0877123456');
    await phoneCandidate(reopened);
    await status(reopened).getByRole('button', { name: 'Отмени', exact: true }).click();
    assert.equal(await reopened.locator('[data-voice-accept-phone]').count(), 0);
    assert.equal(await input(reopened, 'phone').inputValue(), '0877123456');
    await phoneCandidate(reopened);
    await mic(reopened, 'guestName').click(); await waitPhase(reopened, 'listening');
    assert.equal(await reopened.locator('[data-voice-accept-phone]').count(), 0);
    await mic(reopened, 'guestName').click(); await waitPhase(reopened, 'idle');
    assert.equal(await input(reopened, 'phone').inputValue(), '0877123456');
    await phoneCandidate(reopened);
    await page.getByRole('button', { name: 'Close reservation form', exact: true }).click();
    reopened = await reopenMapForm(page);
    assert.equal(await reopened.locator('[data-voice-accept-phone]').count(), 0);
    assert.equal(await prepareButton(reopened).count(), 0);
    assert.equal(await mic(reopened, 'phone').isEnabled(), true);
    passed(`${engine}: phone review leaves the contact unchanged; typing, Cancel, field switch and close/reopen discard the candidate without worker reload`);
    await page.getByRole('button', { name: 'Close reservation form', exact: true }).click();
    const closeMap = page.getByRole('button', { name: 'Затвори цял екран', exact: true });
    if (await closeMap.count()) await closeMap.first().click();
    await page.getByRole('button', { name: /^Карта на резервациите/ }).waitFor();
    const list = await formFor(page, 'list');
    assert.equal(await prepareButton(list).count(), 0);
    assert.equal(await mic(list, 'guestName').isEnabled(), true);
    await mic(list, 'guestName').click(); await waitPhase(list, 'listening');
    await mic(list, 'guestName').click(); await waitPhase(list, 'idle');
    assert.equal(await input(list, 'guestName').inputValue(), expected.guestName);
    assert.deepEqual(await page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, preparations: window.qaLocalSpeech.messages.filter(message => message.type === 'prepare').length })), readyCounts);
    await assertMicClosed(page);
    passed(`${engine}: successful close/reopen and map-to-list navigation reuse the same prepared worker without preparation or automatic retry`);
    await page.getByRole('button', { name: 'Моят профил', exact: true }).click();
    await page.getByRole('button', { name: 'Изход', exact: true }).click();
    await page.locator('input[type=password]').waitFor();
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.workers.every(worker => worker.terminated === 1)), true);
    passed(`${engine}: logout disposes the parent-owned model and leaves no active worker or microphone`);
    await context.close();
    const unsupported = await open(browser, engine, 'landscape', { unsupportedWasm: true });
    const unsupportedForm = await formFor(unsupported.page, 'list'); await prepareButton(unsupportedForm).click();
    await unsupportedForm.getByRole('alert').waitFor();
    assert.match(await unsupportedForm.getByRole('alert').innerText(), /не поддържа локалната/);
    assert.deepEqual(await unsupported.page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, permissions: window.qaLocalSpeech.permissions })), { workers: 0, permissions: 0 });
    await input(unsupportedForm, 'guestName').fill('Ръчно Име'); assert.equal(await input(unsupportedForm, 'guestName').inputValue(), 'Ръчно Име');
    await unsupported.page.screenshot({ path: `${outputRoot}/${engine}-unsupported.png`, fullPage: true });
    passed(`${engine}: unsupported WebAssembly reports manual entry before any worker or microphone starts, with no server fallback`);
    await unsupported.context.close();
    const noAudio = await open(browser, engine, 'portrait', { unsupportedAudio: true });
    const noAudioForm = await formFor(noAudio.page, 'map'); await prepareButton(noAudioForm).click();
    await noAudioForm.getByRole('alert').waitFor();
    assert.match(await noAudioForm.getByRole('alert').innerText(), /ръчно/);
    assert.deepEqual(await noAudio.page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, gpuProbes: window.qaLocalSpeech.gpuProbes, permissions: window.qaLocalSpeech.permissions })), { workers: 0, gpuProbes: 0, permissions: 0 });
    await input(noAudioForm, 'guestName').fill('Ръчно Име'); assert.equal(await input(noAudioForm, 'guestName').inputValue(), 'Ръчно Име');
    passed(`${engine}: missing microphone APIs reject preparation without creating a worker; manual fields remain usable`);
    await noAudio.context.close();
  }
  assert.deepEqual(await reservations(), before);
  assert.deepEqual(voiceRequests, []); assert.deepEqual(runtimeRequests, []); assert.deepEqual(operationalWrites, []); assert.deepEqual(errors, []);
  passed('No voice capability/upload API calls, external model/runtime downloads, operational writes or runtime errors; fixture reservations unchanged');
} catch (error) {
  checks.push({ name: 'Failure', passed: false, error: error.stack }); process.exitCode = 1;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: outputRoot + '/failure.png', fullPage: true }).catch(() => {});
} finally {
  await Promise.all(browsers.map(browser => browser.close()));
  const report = { passed: checks.every(check => check.passed), localOnly: true, mockedDedicatedWorker: true, syntheticCaptureAndDecode: true,
    actualModelTested: false, actualMicrophoneTested: false, physicalIPadTested: false, productionCspTested: false,
    checks, errors, voiceRequests, runtimeRequests, operationalWrites };
  await fs.writeFile(outputRoot + '/report.json', JSON.stringify(report, null, 2));
  if (report.passed) await fs.rm(outputRoot + '/failure.png', { force: true });
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, errors, voiceRequests, runtimeRequests, operationalWrites, report: outputRoot + '/report.json' }));
}
