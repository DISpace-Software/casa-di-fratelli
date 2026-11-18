// Disposable local fixture only. Real UI/client with a stub of this application's
// dedicated speech worker, synthetic capture and PCM decoding. No model accuracy,
// real microphone, physical iPad, WebGPU performance or production CSP claim.
// node script <private-state.json> <output-dir> <playwright-index.mjs> <chrome> [webkit] [tenant,tenant] [all|policy|matrix]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [statePath, outputRoot, playwrightPath, chromiumPath, webkitPath, tenantList, scenario = 'all'] = process.argv.slice(2);
assert.ok(['all', 'policy', 'matrix'].includes(scenario));
const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const value of [state.apiUrl, state.origin]) assert.equal(new URL(value).hostname, '127.0.0.1');
await fs.mkdir(outputRoot, { recursive: true });
const tenantIds = tenantList?.split(',') || state.voiceTenants || ['casa-di-fratelli'];
for (const tenant of tenantIds) assert.ok(state.tenants[tenant], 'Each test tenant must exist in the disposable fixture');
const checks = [], errors = [], voiceRequests = [], runtimeRequests = [], operationalWrites = [], browsers = [], tenantRequests = [], verifiedTiers = [];
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
async function reservations(tenant = 'casa-di-fratelli') {
  const response = await fetch(state.apiUrl + '/api/reservations', { headers: { 'X-Tenant-Id': tenant, 'X-Admin-Token': state.tenants[tenant].auth.token } });
  assert.equal(response.status, 200); return response.json();
}
async function open(browser, engine, orientation, options = {}) {
  const tenantId = options.tenantId || 'casa-di-fratelli';
  const viewport = orientation === 'portrait' ? { width: 820, height: 1180 } : { width: 1180, height: 820 };
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, timezoneId: 'Europe/Sofia' });
  await context.addInitScript(({ options, speech }) => {
    const qa = window.qaLocalSpeech = { workers: [], messages: [], streams: [], audioContexts: [], decoders: [], permissions: 0, gpuProbes: 0, autoReady: !options.holdPrepare, autoResult: true, nextText: null, failNextDecode: false };
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
        if (qa.failNextDecode) { qa.failNextDecode = false; throw new Error('Synthetic unsupported audio container'); }
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
    if (url.origin === state.apiUrl && url.pathname.startsWith('/api/')) {
      tenantRequests.push({ engine, expected: tenantId, actual: request.headers()['x-tenant-id'], path: url.pathname });
    }
    if (/\/speech\/|huggingface\.co|cdn-lfs|\.onnx(?:\?|$)|\.wasm(?:\?|$)|transformers[./-].*\.js|ort-wasm/i.test(url.href)) {
      runtimeRequests.push({ engine, path: url.pathname }); return route.abort('blockedbyclient');
    }
    if (url.pathname.includes('/api/admin/reservations/voice')) {
      voiceRequests.push({ engine, method: request.method(), path: url.pathname }); return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !url.pathname.endsWith('/admin/login')) {
      operationalWrites.push({ engine, method: request.method(), path: url.pathname }); return route.abort('blockedbyclient');
    }
    if (options.policyDisabled && url.pathname === '/api/admin/context' && request.method() === 'GET') {
      const response = await route.fetch();
      const json = await response.json();
      json.reservationDictation = { ...json.reservationDictation, enabled: false };
      return route.fulfill({ response, json });
    }
    return route.continue();
  });
  const tierResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/product-tier' && response.request().method() === 'GET');
  await page.goto(state.origin + '/r/' + tenantId + '/admin');
  await page.locator('input[type=email]').fill(state.tenants[tenantId].email);
  await page.locator('input[type=password]').fill(state.tenants[tenantId].password);
  await page.locator('button[type=submit]').click();
  const tier = await (await tierResponse).json();
  if (state.tenants[tenantId].tier) assert.equal(tier.tier, state.tenants[tenantId].tier);
  assert.equal(tier.isPro, tier.tier === 'Pro');
  verifiedTiers.push({ engine, tenantId, tier: tier.tier, responseMocked: false });
  await page.getByRole('button', { name: /^Карта на резервациите/ }).waitFor();
  assert.deepEqual(await page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, permissions: window.qaLocalSpeech.permissions })), { workers: 0, permissions: 0 }, 'The dashboard must not prepare the model or open a microphone');
  return { page, context, viewport };
}
async function formFor(page, mode, tenantId = 'casa-di-fratelli') {
  if (mode === 'map') {
    await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
    if (tenantId === 'casa-di-fratelli') await page.locator('.admin-map-table-node').filter({ hasText: /^23$/ }).click();
    else await page.locator('.cofein-map-table-button, .admin-map-table-node').first().click();
    await page.getByRole('button', { name: 'Създай резервация', exact: true }).click();
    return page.getByRole('form', { name: 'Резервация', exact: true });
  }
  await page.getByRole('button', { name: /^Резервации/ }).first().click();
  await page.getByRole('button', { name: 'Нова резервация', exact: true }).click();
  return page.locator('form').filter({ has: page.locator('input[name="reservationCreate.tableIds"]') });
}
async function prepare(page, form) {
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
  const before = Object.fromEntries(await Promise.all(tenantIds.map(async tenant => [tenant, await reservations(tenant)])));
  for (const [engine, type, executablePath] of [['chromium', chromium, chromiumPath], ['webkit', webkit, webkitPath]]) {
    const browser = await type.launch({ headless: true, ...(executablePath ? { executablePath } : {}) }); browsers.push(browser);
    if (scenario !== 'policy') for (const tenantId of tenantIds) for (const orientation of ['portrait', 'landscape']) for (const mode of ['map', 'list']) {
      const { page, context, viewport } = await open(browser, engine, orientation, { tenantId });
      const form = await formFor(page, mode, tenantId);
      await prepare(page, form);
      assert.equal(await prepareButton(form).count(), 0, 'Initial preparation has no action button');
      assert.equal(await form.locator('[data-voice-field]').count(), 2);
      for (const field of manualFields) assert.equal(await mic(form, field).count(), 0);
      assert.equal(await form.locator('select[name=reservationDictationLanguage]').count(), 0);
      for (const key of fields) assert.equal(await mic(form, key).isEnabled(), true);
      assert.deepEqual(await page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, gpuProbes: window.qaLocalSpeech.gpuProbes, permissions: window.qaLocalSpeech.permissions })), { workers: 1, gpuProbes: 0, permissions: 0 });
      assert.doesNotMatch(await status(form).innerText(), /100 МВ|100 MB|Подготви диктовката|използвай Wi-Fi/);
      assert.equal((await status(form).locator(':scope > :not(.sr-only)').allInnerTexts()).join('').trim(), '', 'Ready local dictation adds no visible instruction banner');
      if (tenantId === 'cofein' && orientation === 'portrait') await form.screenshot({ path: `${outputRoot}/${engine}-cofein-${mode}-empty-ready-form.png` });
      await page.screenshot({ path: `${outputRoot}/${engine}-${tenantId}-${orientation}-${mode}-auto-prepared.png`, fullPage: true });
      await prepare(page, form);
      assert.equal(await page.evaluate(() => window.qaLocalSpeech.permissions), 0);
      assert.equal(await page.evaluate(() => window.qaLocalSpeech.worker.workerType), 'classic');
      assert.equal(await page.evaluate(() => new URL(window.qaLocalSpeech.worker.url, location.href).origin === location.origin), true);
      assert.equal(await page.evaluate(() => {
        const url = new URL(window.qaLocalSpeech.messages.find(message => message.type === 'prepare').assetBase);
        return url.origin === location.origin && url.pathname.startsWith('/speech/');
      }), true, 'The model must use the current admin origin for every tenant');
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
          assert.equal(await form.locator('[data-voice-phone-review]').inputValue(), '0888123456');
          await page.screenshot({ path: `${outputRoot}/${engine}-${tenantId}-${orientation}-${mode}-phone-review.png`, fullPage: true });
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
      if (tenantId === 'cofein' && orientation === 'portrait' && mode === 'map') {
        await page.evaluate(() => { window.qaLocalSpeech.nextText = 'Телефонче нула осем осем осем едно две'; });
        await phoneCandidate(form);
        assert.equal(await form.locator('[data-voice-phone-review]').inputValue(), '088812');
        assert.equal(await form.locator('[data-voice-accept-phone]').isDisabled(), true);
        assert.equal(await input(form, 'phone').inputValue(), expected.phone);
        await form.screenshot({ path: `${outputRoot}/${engine}-cofein-map-partial-phone-review.png` });
        await form.locator('[data-voice-phone-review]').fill(expected.phone);
        await form.locator('[data-voice-accept-phone]').click();
        assert.deepEqual(await values(form), expected);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      await page.screenshot({ path: `${outputRoot}/${engine}-${tenantId}-${orientation}-${mode}-filled.png`, fullPage: true });
      passed(`${engine} ${tenantId} ${orientation} ${mode}: real tier verified; no dashboard model/mic; form auto-prepares without a button or microphone permission, same-origin preparation, name and phone only; date/time/count/email remain manual and unchanged, explicit phone confirmation, classic worker PCM transfer, readable tablet layout`);
      await context.close();
    }
    if (scenario === 'matrix') continue;
    const disabledTenant = tenantIds.includes('cofein') ? 'cofein' : tenantIds[0];
    for (const mode of ['map', 'list']) {
      const disabled = await open(browser, engine, 'portrait', { tenantId: disabledTenant, policyDisabled: true });
      const disabledForm = await formFor(disabled.page, mode, disabledTenant);
      await input(disabledForm, 'guestName').fill('Ръчно Име');
      assert.equal(await disabledForm.locator('[data-voice-field], [data-voice-prepare]').count(), 0);
      assert.equal(await input(disabledForm, 'guestName').inputValue(), 'Ръчно Име');
      assert.deepEqual(await disabled.page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, permissions: window.qaLocalSpeech.permissions })), { workers: 0, permissions: 0 });
      passed(engine + ' ' + disabledTenant + ' ' + mode + ': API policy disabled removes all speech controls before any worker/model/microphone starts; manual entry works');
      await disabled.context.close();
    }
    const dynamicPolicy = { tenantId: disabledTenant };
    const rollback = await open(browser, engine, 'portrait', dynamicPolicy);
    const rollbackForm = await formFor(rollback.page, 'map', disabledTenant);
    await prepare(rollback.page, rollbackForm);
    await input(rollbackForm, 'guestName').fill('Запазено Име');
    await input(rollbackForm, 'phone').fill('0899123456');
    await input(rollbackForm, 'reservedDate').fill(expected.reservedDate);
    await input(rollbackForm, 'reservedTime').selectOption(expected.reservedTime);
    await input(rollbackForm, 'guestCount').fill(expected.guestCount);
    await input(rollbackForm, 'email').fill(expected.email);
    const rollbackValues = await values(rollbackForm);
    dynamicPolicy.policyDisabled = true;
    await rollback.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await mic(rollbackForm, 'guestName').waitFor({ state: 'detached' });
    assert.equal(await rollbackForm.locator('[data-voice-field], [data-voice-prepare]').count(), 0);
    assert.deepEqual(await values(rollbackForm), rollbackValues);
    assert.equal(await rollback.page.evaluate(() => window.qaLocalSpeech.workers.length === 1 && window.qaLocalSpeech.workers.every(worker => worker.terminated === 1)), true);
    assert.equal(await rollback.page.evaluate(() => window.qaLocalSpeech.permissions), 0);
    passed(engine + ' ' + disabledTenant + ': runtime API disable on focus disposes the prepared worker, removes microphones and preserves all six manual values');
    await rollback.context.close();
    if (scenario === 'policy') continue;
    const { page, context } = await open(browser, engine, 'portrait', { holdPrepare: true });
    let form = await formFor(page, 'map');
    await input(form, 'guestName').fill('Проверено Име');
    await page.waitForFunction(() => window.qaLocalSpeech.worker?.message?.type === 'prepare');
    assert.equal(await prepareButton(form).count(), 0);
    assert.match(await status(form).innerText(), /Подготвям|Зареждам/);
    assert.equal(await mic(form, 'guestName').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.permissions), 0);
    await page.evaluate(() => { const qa = window.qaLocalSpeech; qa.latePrepare = qa.worker.onmessage; qa.oldPrepareId = qa.worker.message.id; });
    await page.getByRole('button', { name: 'Close reservation form', exact: true }).click();
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.worker.terminated), 1);
    await page.evaluate(() => window.qaLocalSpeech.latePrepare({ data: { type: 'ready', id: window.qaLocalSpeech.oldPrepareId } }));
    await page.evaluate(() => { window.qaLocalSpeech.autoReady = true; });
    form = await reopenMapForm(page);
    await prepare(page, form);
    assert.equal(await prepareButton(form).count(), 0);
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.workers.length), 2);
    passed(`${engine}: model preparation starts with the form, never the microphone; close cancels preparation, ignores late readiness, and reopening prepares automatically`);
    await page.evaluate(() => { window.qaLocalSpeech.autoResult = false; });
    await mic(form, 'guestName').click(); await waitPhase(form, 'listening'); await mic(form, 'guestName').click(); await waitPhase(form, 'processing');
    await page.waitForFunction(() => window.qaLocalSpeech.worker.message.type === 'transcribe');
    await page.evaluate(() => { const qa = window.qaLocalSpeech; qa.inferenceWorker = qa.worker; qa.lateResult = qa.worker.onmessage; qa.oldTranscribeId = qa.worker.message.id; });
    await input(form, 'guestName').fill('Ръчно Проверено'); await waitPhase(form, 'idle');
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.inferenceWorker.terminated), 1);
    await page.evaluate(() => window.qaLocalSpeech.lateResult({ data: { type: 'result', id: window.qaLocalSpeech.oldTranscribeId, text: 'Нежелана Промяна' } }));
    assert.equal(await input(form, 'guestName').inputValue(), 'Ръчно Проверено'); await assertMicClosed(page);
    await page.evaluate(() => { window.qaLocalSpeech.autoResult = true; });
    await prepare(page, form);
    assert.equal(await prepareButton(form).count(), 0);
    passed(`${engine}: typing during local inference cancels/terminates it; stale result cannot overwrite a field and automatic model recovery needs no preparation button`);
    const healthyWorkerCount = await page.evaluate(() => window.qaLocalSpeech.workers.length);
    await page.evaluate(() => { window.qaLocalSpeech.failNextDecode = true; });
    await mic(form, 'phone').click(); await waitPhase(form, 'listening');
    await mic(form, 'phone').click(); await waitPhase(form, 'idle');
    assert.match(await status(form).getByRole('alert').innerText(), /прочета записа/);
    assert.equal(await mic(form, 'phone').isEnabled(), true);
    assert.equal(await prepareButton(form).count(), 0);
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.workers.length), healthyWorkerCount);
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.worker.terminated), 0);
    await phoneCandidate(form);
    await form.locator('[data-voice-accept-phone]').click();
    assert.equal(await input(form, 'phone').inputValue(), expected.phone);
    assert.equal(await page.evaluate(() => window.qaLocalSpeech.workers.length), healthyWorkerCount);
    passed(`${engine}: an audio container decode failure keeps the healthy model; the next phone recording works without another preparation`);
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
    await page.evaluate(() => { window.qaLocalSpeech.nextText = 'Телефонче нула осем осем осем едно две'; });
    await phoneCandidate(reopened);
    assert.equal(await input(reopened, 'phone').inputValue(), '0899123456');
    assert.equal(await reopened.locator('[data-voice-phone-review]').inputValue(), '088812');
    assert.equal(await reopened.locator('[data-voice-accept-phone]').isDisabled(), true);
    await reopened.locator('[data-voice-phone-review]').fill('0888123456');
    assert.equal(await reopened.locator('[data-voice-accept-phone]').isEnabled(), true);
    assert.equal(await input(reopened, 'phone').inputValue(), '0899123456');
    await reopened.locator('[data-voice-accept-phone]').click();
    assert.equal(await input(reopened, 'phone').inputValue(), '0888123456');
    assert.equal(await reopened.locator('[data-voice-phone-review]').count(), 0);
    passed(`${engine}: an incomplete phone result stays editable, cannot be accepted until corrected, and never replaces the existing contact before confirmation`);
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
    const unsupportedForm = await formFor(unsupported.page, 'list');
    await unsupportedForm.getByRole('alert').waitFor();
    assert.match(await unsupportedForm.getByRole('alert').innerText(), /не поддържа локалната/);
    assert.deepEqual(await unsupported.page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, permissions: window.qaLocalSpeech.permissions })), { workers: 0, permissions: 0 });
    await input(unsupportedForm, 'guestName').fill('Ръчно Име'); assert.equal(await input(unsupportedForm, 'guestName').inputValue(), 'Ръчно Име');
    await unsupported.page.screenshot({ path: `${outputRoot}/${engine}-unsupported.png`, fullPage: true });
    passed(`${engine}: unsupported WebAssembly reports manual entry before any worker or microphone starts, with no server fallback`);
    await unsupported.context.close();
    const noAudio = await open(browser, engine, 'portrait', { unsupportedAudio: true });
    const noAudioForm = await formFor(noAudio.page, 'map');
    assert.match(await status(noAudioForm).innerText(), /ръчно/);
    assert.equal(await prepareButton(noAudioForm).count(), 0);
    assert.deepEqual(await noAudio.page.evaluate(() => ({ workers: window.qaLocalSpeech.workers.length, gpuProbes: window.qaLocalSpeech.gpuProbes, permissions: window.qaLocalSpeech.permissions })), { workers: 0, gpuProbes: 0, permissions: 0 });
    await input(noAudioForm, 'guestName').fill('Ръчно Име'); assert.equal(await input(noAudioForm, 'guestName').inputValue(), 'Ръчно Име');
    passed(`${engine}: missing microphone APIs reject preparation without creating a worker; manual fields remain usable`);
    await noAudio.context.close();
  }
  assert.deepEqual(Object.fromEntries(await Promise.all(tenantIds.map(async tenant => [tenant, await reservations(tenant)]))), before);
  assert.ok(tenantRequests.length > 0 && tenantRequests.every(request => request.expected === request.actual), 'Every API request keeps its own tenant selector');
  assert.deepEqual(voiceRequests, []); assert.deepEqual(runtimeRequests, []); assert.deepEqual(operationalWrites, []); assert.deepEqual(errors, []);
  passed('No voice capability/upload API calls, external model/runtime downloads, operational writes or runtime errors; fixture reservations unchanged');
} catch (error) {
  checks.push({ name: 'Failure', passed: false, error: error.stack }); process.exitCode = 1;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: outputRoot + '/failure.png', fullPage: true }).catch(() => {});
} finally {
  await Promise.all(browsers.map(browser => browser.close()));
  const report = { passed: checks.every(check => check.passed), localOnly: true, mockedDedicatedWorker: true, syntheticCaptureAndDecode: true,
    actualModelTested: false, actualMicrophoneTested: false, physicalIPadTested: false, productionCspTested: false,
    scenario, tenantIds, verifiedTiers, tenantSelectorChecks: tenantRequests.length,
    checks, errors, voiceRequests, runtimeRequests, operationalWrites };
  await fs.writeFile(outputRoot + '/report.json', JSON.stringify(report, null, 2));
  if (report.passed) await fs.rm(outputRoot + '/failure.png', { force: true });
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, errors, voiceRequests, runtimeRequests, operationalWrites, report: outputRoot + '/report.json' }));
}
