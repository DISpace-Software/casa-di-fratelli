// Local fixture only. Browser UI + multipart transport integration with injected
// MediaRecorder/mediaDevices and mocked ASR responses. No real mic or ASR claim.
// node script <private-state.json> <output-dir> <playwright-index.mjs> <chrome> [webkit]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [statePath, outputRoot, playwrightPath, chromiumPath, webkitPath] = process.argv.slice(2);
const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const url of [state.origin, state.apiUrl]) assert.equal(new URL(url).hostname, '127.0.0.1');
await fs.mkdir(outputRoot, { recursive: true });
const checks = [], errors = [], operationalWrites = [], uploads = [];
const keys = ['guestName', 'phone', 'reservedDate', 'reservedTime', 'guestCount', 'email'];
const speech = {
  guestName: 'Георги Иванов', phone: 'Телефонче: 0888 12 34 56', reservedDate: 'утре',
  reservedTime: 'седем и половина вечерта', guestCount: 'трима', email: 'georgi маймунка example точка bg',
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tomorrow = new Date(today + 'T12:00:00Z'); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const expected = { guestName: 'Георги Иванов', phone: '0888123456', reservedDate: tomorrow.toISOString().slice(0, 10), reservedTime: '19:30', guestCount: '3', email: 'georgi@example.bg' };
const browsers = [];
let currentPage;
const passed = name => { checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
const mic = (form, field) => form.locator(`button[data-voice-field="${field}"]`);
const input = (form, field) => mic(form, field).locator('..').locator('input, select');
const status = form => form.locator('[data-reservation-field-dictation]');
async function waitPhase(form, phase) {
  await status(form).evaluate((element, value) => new Promise((resolve, reject) => {
    const started = Date.now();
    function check() {
      if (element.dataset.voicePhase === value) return resolve();
      if (Date.now() - started > 5000) return reject(new Error(`Expected phase ${value}; got ${element.dataset.voicePhase}`));
      setTimeout(check, 10);
    }
    check();
  }), phase);
}
async function fieldEquals(form, key, value) {
  await input(form, key).evaluate((element, value) => new Promise((resolve, reject) => {
    const started = Date.now();
    function check() {
      if (element.value === value) return resolve();
      if (Date.now() - started > 5000) return reject(new Error(`Field ${element.name} did not receive the expected value`));
      setTimeout(check, 10);
    }
    check();
  }), value);
}
async function values(form) { return Object.fromEntries(await Promise.all(keys.map(async key => [key, await input(form, key).inputValue()]))); }
async function reservations() {
  const response = await fetch(state.apiUrl + '/api/reservations', { headers: {
    'X-Tenant-Id': 'casa-di-fratelli', 'X-Admin-Token': state.tenants['casa-di-fratelli'].auth.token,
  } });
  assert.equal(response.status, 200); return response.json();
}

async function open(browser, engine, orientation, options = {}) {
  const viewport = orientation === 'portrait' ? { width: 820, height: 1180 } : { width: 1180, height: 820 };
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, timezoneId: 'Europe/Sofia' });
  await context.addInitScript(options => {
    // These stubs never call the browser's real getUserMedia or speech service.
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
    const qa = window.qaAudio = {
      permissionCalls: 0, streams: [], recorders: [], contexts: [], pendingPermissions: [], payloads: [],
      config: { permission: 'grant', autoStart: true, autoStop: true, analysis: options.analysis || 'suspended', mime: options.mime || 'mp4' },
      level: 0,
    };
    // WebKit's automation protocol omits multipart Blob bytes in postDataBuffer.
    // Observe the actual Blob handed to native FormData without replacing fetch,
    // changing the payload, or delaying the application request.
    const formPayloads = new WeakMap();
    const append = FormData.prototype.append;
    FormData.prototype.append = function (name, value, ...rest) {
      let payload = formPayloads.get(this);
      if (!payload) { payload = {}; formPayloads.set(this, payload); qa.payloads.push(payload); }
      if (name === 'audio' && value instanceof Blob) {
        payload.ready = value.text().then(text => { payload.audioText = text; });
        payload.audioSize = value.size;
      } else if (name === 'field' || name === 'language') payload[name] = value;
      return Reflect.apply(append, this, [name, value, ...rest]);
    };
    const createStream = () => {
      const track = { readyState: 'live', stops: 0, stop() { this.stops += 1; this.readyState = 'ended'; } };
      const stream = { track, getTracks: () => [track] }; qa.streams.push(stream); return stream;
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async constraints => {
        qa.permissionCalls += 1; qa.lastConstraints = constraints;
        if (qa.config.permission === 'deny') throw new DOMException('Test permission denied', 'NotAllowedError');
        if (qa.config.permission === 'pending') return new Promise(resolve => qa.pendingPermissions.push(() => resolve(createStream())));
        return createStream();
      },
    } });
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type.startsWith(qa.config.mime === 'mp4' ? 'audio/mp4' : 'audio/webm'); }
      constructor(stream, config) {
        this.stream = stream; this.mimeType = config?.mimeType || 'audio/webm'; this.state = 'inactive';
        this.stops = 0; qa.recorders.push(this); qa.recorder = this;
      }
      start(timeslice) {
        this.state = 'recording'; this.timeslice = timeslice;
        if (qa.config.autoStart) queueMicrotask(() => this.ready());
      }
      ready() { this.onstart?.(); this.ondataavailable?.({ data: new Blob(['synthetic-audio-prefix|'], { type: this.mimeType }) }); }
      stop() {
        this.stops += 1; this.state = 'inactive';
        if (qa.config.autoStop) queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(['synthetic-audio-final'], { type: this.mimeType }) });
          this.onstop?.();
        });
      }
    };
    window.AudioContext = class {
      constructor() { this.state = qa.config.analysis; this.closed = 0; qa.contexts.push(this); }
      resume() { return Promise.resolve(); }
      close() { this.closed += 1; this.state = 'closed'; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createAnalyser() { return { getFloatTimeDomainData: samples => samples.fill(qa.level) }; }
    };
    window.webkitAudioContext = undefined;
  }, options);
  const page = await context.newPage(); currentPage = page;
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push({ engine, orientation, error: error.message }));
  const plans = [], pending = [];
  let capabilities = 0;
  const localUploads = [];
  await page.route('**/api/**', async route => {
    try {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    assert.equal(url.hostname, '127.0.0.1', 'The integration fixture must never access a production API');
    if (url.pathname.endsWith('/api/admin/reservations/voice/capabilities')) {
      capabilities += 1;
      return route.fulfill({ json: { enabled: options.enabled !== false, languages: ['bg', 'ru', 'en'] } });
    }
    if (url.pathname.endsWith('/api/admin/reservations/voice/transcribe')) {
      assert.equal(method, 'POST');
      const body = request.postDataBuffer().toString('utf8');
      const field = body.match(/name="field"\r\n\r\n([^\r]+)/)?.[1];
      const language = body.match(/name="language"\r\n\r\n([^\r]+)/)?.[1];
      const filename = body.match(/name="audio"; filename="([^"]+)"/)?.[1];
      const mimeType = body.match(/Content-Type: (audio\/[^\r]+)/i)?.[1];
      assert.ok(keys.includes(field)); assert.ok(['bg', 'ru', 'en'].includes(language));
      assert.ok(filename && mimeType);
      const payload = await page.evaluate(async field => {
        const payload = window.qaAudio.payloads.findLast(payload => payload.field === field);
        await payload?.ready;
        return { audioText: payload?.audioText, language: payload?.language, audioSize: payload?.audioSize };
      }, field);
      assert.equal(payload.audioText, 'synthetic-audio-prefix|synthetic-audio-final');
      assert.equal(payload.language, language); assert.ok(payload.audioSize > 0);
      if (engine === 'chromium') assert.ok(body.includes(payload.audioText));
      assert.equal(request.headers()['x-tenant-id'], 'casa-di-fratelli');
      assert.ok(request.headers()['x-admin-token'], 'ASR request must retain the authenticated admin transport');
      const tracksClosed = await page.evaluate(() => window.qaAudio.streams.every(stream => stream.track.readyState === 'ended'));
      assert.equal(tracksClosed, true, 'Microphone tracks close before upload begins');
      const record = { engine, orientation, field, language, filename, mimeType, tracksClosed };
      uploads.push(record); localUploads.push(record);
      const plan = plans.shift() || {};
      if (plan.hold) await new Promise(resolve => pending.push(resolve));
      return route.fulfill({ status: plan.status || 200, json: plan.code ? { code: plan.code } : { text: plan.text ?? speech[field] } }).catch(() => {});
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.pathname.endsWith('/api/admin/login')) {
      operationalWrites.push({ engine, method, path: url.pathname });
      return route.abort('blockedbyclient');
    }
    return route.continue();
    } catch (error) {
      errors.push({ engine, orientation, error: error.message });
      return route.abort('failed').catch(() => {});
    }
  });
  await page.goto(state.origin + '/r/casa-di-fratelli/admin');
  await page.locator('input[type=email]').fill(state.tenants['casa-di-fratelli'].email);
  await page.locator('input[type=password]').fill(state.tenants['casa-di-fratelli'].password);
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: /^Карта на резервациите/ }).waitFor();
  return { page, context, plans, pending, localUploads, viewport, get capabilities() { return capabilities; } };
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
async function waitEnabled(form, field = 'guestName') {
  await mic(form, field).evaluate(element => new Promise((resolve, reject) => {
    const started = Date.now();
    function check() {
      if (!element.disabled) return resolve();
      if (Date.now() - started > 5000) return reject(new Error('Dictation capability did not become available'));
      setTimeout(check, 10);
    }
    check();
  }));
}
async function start(form, field) { await waitEnabled(form, field); await mic(form, field).click(); await waitPhase(form, 'listening'); }
async function dictate(test, form, field, text, expectedValue) {
  const before = await values(form);
  test.plans.push({ text });
  await start(form, field); await mic(form, field).click(); await waitPhase(form, 'idle');
  await fieldEquals(form, field, expectedValue);
  const after = await values(form);
  // Changing date may intentionally update time; other dictated fields stay isolated.
  for (const key of keys) if (key !== field && !(field === 'reservedDate' && key === 'reservedTime')) assert.equal(after[key], before[key], `${field} must preserve ${key}`);
}
async function assertClean(page) {
  assert.equal(await page.evaluate(() => window.qaAudio.streams.every(stream => stream.track.readyState === 'ended')), true);
  assert.equal(await page.evaluate(() => window.qaAudio.contexts.every(context => context.closed === 1)), true);
  assert.equal(await page.locator('button[data-voice-field][aria-pressed="true"]').count(), 0);
}
async function heldUpload(test, form, field, text) {
  test.plans.push({ hold: true, text });
  await start(form, field); await mic(form, field).click(); await waitPhase(form, 'processing');
  // The request reaches the route asynchronously after the processing state renders.
  for (let attempt = 0; !test.pending.length && attempt < 100; attempt += 1) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(test.pending.length, 'A held ASR request should reach the mock');
}

try {
  const before = await reservations();
  for (const [engine, browserType, executablePath] of [['chromium', chromium, chromiumPath], ['webkit', webkit, webkitPath]]) {
    const browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) }); browsers.push(browser);
    for (const orientation of ['portrait', 'landscape']) {
      for (const mode of ['map', 'list']) {
        const test = await open(browser, engine, orientation, { mime: engine === 'webkit' ? 'mp4' : 'webm' });
        const { page } = test; const form = await formFor(page, mode); await waitEnabled(form);
        assert.equal(test.capabilities > 0, true); assert.equal(await form.locator('[data-voice-field]').count(), 6);
        assert.equal(await page.evaluate(() => window.qaAudio.permissionCalls), 0);
        assert.match(await status(form).innerText(), /изпраща|услуга/iu);
        for (const field of keys) {
          await dictate(test, form, field, speech[field], expected[field]);
          await mic(form, field).scrollIntoViewIfNeeded();
          const box = await mic(form, field).boundingBox();
          assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= test.viewport.width);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
        assert.deepEqual(await values(form), expected);
        assert.equal(test.localUploads.length, 6);
        assert.ok(test.localUploads.every(upload => upload.language === 'bg' && upload.filename.endsWith(engine === 'webkit' ? '.m4a' : '.webm')));
        await assertClean(page);
        await page.screenshot({ path: `${outputRoot}/${engine}-${orientation}-${mode}.png`, fullPage: true });
        passed(`${engine} ${orientation} ${mode}: six isolated Bulgarian field uploads, actual form values, 44px targets, no overflow, explicit-start privacy and track cleanup`);
        await test.context.close();
      }
    }

    const test = await open(browser, engine, 'portrait'); const { page } = test; const form = await formFor(page, 'map'); await waitEnabled(form);
    await input(form, 'guestName').fill('Проверено Име'); await input(form, 'phone').fill('0899123456');
    const original = await values(form);
    await page.evaluate(() => { window.qaAudio.config.permission = 'pending'; });
    await mic(form, 'guestName').click(); await waitPhase(form, 'starting');
    assert.match(await status(form).innerText(), /Разрешаване/);
    assert.equal(await page.evaluate(() => window.qaAudio.recorders.length), 0);
    await mic(form, 'guestName').click(); await waitPhase(form, 'idle');
    await page.evaluate(() => window.qaAudio.pendingPermissions.shift()());
    await page.waitForFunction(() => window.qaAudio.streams.every(stream => stream.track.readyState === 'ended'));
    assert.equal(test.localUploads.length, 0); assert.deepEqual(await values(form), original);
    await assertClean(page);
    passed(`${engine}: permission wait does not claim listening; cancel closes late granted tracks without upload or field changes`);

    await page.evaluate(() => { window.qaAudio.config.permission = 'grant'; window.qaAudio.config.autoStart = false; });
    await mic(form, 'guestName').click(); await waitPhase(form, 'starting');
    await page.evaluate(() => window.qaAudio.recorder.ready()); await waitPhase(form, 'listening');
    test.plans.push({ text: 'Мария Иванова' }); await mic(form, 'guestName').click(); await waitPhase(form, 'idle');
    await fieldEquals(form, 'guestName', 'Мария Иванова');
    await page.evaluate(() => { window.qaAudio.config.autoStart = true; });
    passed(`${engine}: UI reports listening only after actual MediaRecorder onstart and applies the finalized recording once`);

    await heldUpload(test, form, 'guestName', 'Нежелана Промяна');
    assert.equal(await page.evaluate(() => window.qaAudio.streams.every(stream => stream.track.readyState === 'ended')), true);
    await input(form, 'guestName').fill('Ръчно Проверено'); await waitPhase(form, 'idle');
    test.pending.shift()();
    await page.waitForTimeout(80); await fieldEquals(form, 'guestName', 'Ръчно Проверено');
    await fieldEquals(form, 'phone', '0899123456'); await assertClean(page);
    passed(`${engine}: manual typing cancels processing; a late ASR response cannot overwrite the edited field or another field`);

    await heldUpload(test, form, 'guestName', 'Стар Отговор');
    await start(form, 'phone'); test.pending.shift()();
    test.plans.push({ text: speech.phone }); await mic(form, 'phone').click(); await waitPhase(form, 'idle');
    await fieldEquals(form, 'phone', expected.phone); await fieldEquals(form, 'guestName', 'Ръчно Проверено');
    await assertClean(page);
    passed(`${engine}: switching fields cancels the old upload and routes only the new final transcript to the active field`);

    for (const plan of [{ text: 'нула осем осем' }, { text: '' }, { status: 429, code: 'busy' }, { status: 503, code: 'recognition-unavailable' }]) {
      test.plans.push(plan); await start(form, 'phone'); await mic(form, 'phone').click(); await waitPhase(form, 'idle');
      await form.getByRole('alert').waitFor(); await fieldEquals(form, 'phone', expected.phone); await assertClean(page);
    }
    passed(`${engine}: incomplete phone, empty recognition, busy and unavailable service preserve the previous valid value with visible feedback`);

    await page.evaluate(() => { window.qaAudio.config.permission = 'deny'; });
    const priorUploads = test.localUploads.length;
    await mic(form, 'guestName').click(); await form.getByRole('alert').waitFor(); await waitPhase(form, 'idle');
    assert.match(await form.getByRole('alert').innerText(), /Разреши/);
    assert.equal(test.localUploads.length, priorUploads); await fieldEquals(form, 'guestName', 'Ръчно Проверено'); await assertClean(page);
    passed(`${engine}: microphone permission denial preserves all draft data and never uploads`);

    await page.clock.install();
    await page.evaluate(() => { window.qaAudio.config.permission = 'grant'; window.qaAudio.config.analysis = 'running'; window.qaAudio.level = 0; });
    await start(form, 'guestName'); await page.clock.runFor(6100); await waitPhase(form, 'idle');
    assert.equal(test.localUploads.length, priorUploads); await fieldEquals(form, 'guestName', 'Ръчно Проверено'); await assertClean(page);
    passed(`${engine}: six seconds of measured silence stops capture without upload or fabricated field content`);

    test.plans.push({ text: 'четирима' });
    await page.evaluate(() => { window.qaAudio.level = 0.04; }); await start(form, 'guestCount');
    await page.clock.runFor(300); await page.evaluate(() => { window.qaAudio.level = 0; });
    await page.clock.runFor(1900); await waitPhase(form, 'idle'); await fieldEquals(form, 'guestCount', '4'); await assertClean(page);
    passed(`${engine}: speech followed by silence automatically finalizes and fills the intended field`);

    await page.evaluate(() => { window.qaAudio.config.analysis = 'suspended'; window.qaAudio.config.permission = 'pending'; });
    await mic(form, 'guestName').click(); await waitPhase(form, 'starting');
    await page.getByRole('button', { name: 'Close reservation form', exact: true }).click();
    await page.evaluate(() => window.qaAudio.pendingPermissions.shift()());
    await page.waitForFunction(() => window.qaAudio.streams.every(stream => stream.track.readyState === 'ended'));
    assert.equal(await page.getByRole('form', { name: 'Резервация', exact: true }).count(), 0); await assertClean(page);
    passed(`${engine}: closing the form during permission acquisition silently cancels and closes the late microphone`);
    await test.context.close();

    const offline = await open(browser, engine, 'landscape', { enabled: false });
    const offlineForm = await formFor(offline.page, 'list');
    await status(offlineForm).getByText(/не е свързана/).waitFor();
    assert.equal(await mic(offlineForm, 'guestName').isDisabled(), true);
    await input(offlineForm, 'guestName').fill('Ръчно Име'); await fieldEquals(offlineForm, 'guestName', 'Ръчно Име');
    assert.equal(await offline.page.evaluate(() => window.qaAudio.permissionCalls), 0);
    passed(`${engine}: disabled service exposes manual entry with no browser speech fallback or permission request`);
    await offline.context.close();
  }
  assert.deepEqual(await reservations(), before);
  assert.deepEqual(operationalWrites, []); assert.deepEqual(errors, []);
  passed('Fixture reservations remain identical; no operational API writes or browser runtime errors');
} catch (error) {
  checks.push({ name: 'Failure', passed: false, error: error.stack }); process.exitCode = 1;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: outputRoot + '/failure.png', fullPage: true }).catch(() => {});
} finally {
  await Promise.all(browsers.map(browser => browser.close()));
  const report = { passed: checks.every(check => check.passed), localOnly: true, simulatedMediaRecorder: true,
    actualMicrophoneTested: false, actualAudioEncodingTested: false, actualAsrAccuracyTested: false,
    checks, errors, operationalWrites, uploads };
  await fs.writeFile(outputRoot + '/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, errors, operationalWrites, uploads: uploads.length, report: outputRoot + '/report.json' }));
}
