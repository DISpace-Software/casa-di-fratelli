// Explicitly authorized, read-only production UI check for Cofein.
// The only permitted mutation is one exact login POST. Media capture alone is
// synthetic; Worker, PCM decoding, same-origin WASM/model and form logic are real.
// Usage: node script --allow-production-readonly <output> <playwright> <chrome> <wav-directory> <credentials-file>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [authorization, outputRoot, playwrightPath, chromePath, audioRoot, credentialsPath] = process.argv.slice(2);
assert.equal(authorization, '--allow-production-readonly');
assert.ok(outputRoot && playwrightPath && chromePath && audioRoot && credentialsPath);
const origin = 'https://seatmap-admin-eight.vercel.app';
const api = 'https://casa-di-fratelli-api.onrender.com';
const tenantId = 'cofein';
const credentials = await fs.readFile(credentialsPath, 'utf8');
const email = credentials.match(/^\s*Email\s*:\s*(.+?)\s*$/mi)?.[1];
const password = credentials.match(/^\s*Пароль\s*:\s*(.+?)\s*$/mi)?.[1];
assert.ok(email && password, 'The explicitly configured Cofein login file must contain both required keys');
const redact = value => String(value).replaceAll(password, '[redacted]').replaceAll(email, '[redacted]');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const context = await browser.newContext({
  viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true,
  timezoneId: 'Europe/Sofia', serviceWorkers: 'block',
});
await context.addInitScript(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  // Supply a synthetic MediaStream, retaining native AudioContext, worklet,
  // WAV encoding, PCM decoding and model inference. Never open a physical mic.
  window.qaTracks = [];
  window.qaPcmNodes = 0;
  window.qaPcmErrors = 0;
  window.qaMediaRecorders = 0;
  const NativeWorklet = window.AudioWorkletNode;
  window.AudioWorkletNode = class extends NativeWorklet {
    constructor(...args) {
      super(...args); window.qaPcmNodes++;
      this.addEventListener('processorerror', () => { window.qaPcmErrors++; });
    }
  };
  const NativeRecorder = window.MediaRecorder;
  window.MediaRecorder = class extends NativeRecorder {
    constructor(...args) { super(...args); window.qaMediaRecorders++; }
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: async () => {
      const sourceContext = new AudioContext();
      await sourceContext.resume();
      const bytes = Uint8Array.from(atob(window.qaWave), character => character.charCodeAt(0));
      const audio = await sourceContext.decodeAudioData(bytes.buffer);
      const source = sourceContext.createBufferSource();
      source.buffer = audio;
      const destination = sourceContext.createMediaStreamDestination();
      source.connect(destination);
      window.qaPlay = () => new Promise(resolve => {
        source.onended = resolve;
        source.start();
      });
      for (const track of destination.stream.getTracks()) {
        window.qaTracks.push(track);
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); void sourceContext.close(); };
      }
      return destination.stream;
    },
  } });
});
const results = [], checks = [], errors = [], blockedWrites = [], voiceRequests = [], modelRequests = [], externalRuntimeRequests = [];
let loginPosts = 0, preparationSeconds, tier, activeForm;
const page = await context.newPage();
page.setDefaultTimeout(25000);
page.on('pageerror', error => errors.push(redact(error.message)));
await context.route('**/*', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(request.method());
  if (url.pathname.includes('/voice/')) {
    voiceRequests.push({ method: request.method(), path: url.pathname });
    return route.abort('blockedbyclient');
  }
  if (!readOnly) {
    if (url.origin === api && url.pathname === '/api/admin/login' && request.method() === 'POST'
        && request.headers()['x-tenant-id'] === tenantId && loginPosts === 0) {
      loginPosts++;
      return route.continue();
    }
    blockedWrites.push({ origin: url.origin, method: request.method(), path: url.pathname });
    return route.abort('blockedbyclient');
  }
  if (url.pathname.includes('/speech/') || /\.(?:onnx|wasm)$/.test(url.pathname)) {
    if (url.origin !== origin) {
      externalRuntimeRequests.push({ origin: url.origin, path: url.pathname });
      return route.abort('blockedbyclient');
    }
    modelRequests.push({ method: request.method(), path: url.pathname });
  }
  return route.continue();
});
const mic = (form, field) => form.locator('button[data-voice-field="' + field + '"]');
const input = (form, field) => form.locator('input[name$=".' + field + '"],select[name$=".' + field + '"]');
const manualFields = ['reservedDate', 'reservedTime', 'guestCount', 'email'];
const values = async form => Object.fromEntries(await Promise.all(
  ['guestName', 'phone', ...manualFields].map(async field => [field, await input(form, field).inputValue()]),
));
async function assertFields(form) {
  assert.equal(await form.locator('[data-voice-field]').count(), 2);
  for (const field of ['guestName', 'phone']) assert.equal(await mic(form, field).count(), 1);
  for (const field of manualFields) assert.equal(await mic(form, field).count(), 0);
}
async function dictate(form, mode, field, file, expected) {
  const previous = await values(form);
  const bytes = await fs.readFile(audioRoot + '/' + file);
  await page.evaluate(wave => { window.qaWave = wave; }, bytes.toString('base64'));
  await mic(form, field).click();
  await form.locator('[data-voice-phase="listening"]').waitFor();
  await page.evaluate(() => window.qaPlay());
  const started = Date.now();
  await mic(form, field).click();
  await form.locator('[data-voice-phase="idle"]').waitFor();
  const processingSeconds = (Date.now() - started) / 1000;
  if (field === 'phone') {
    await form.locator('[data-voice-accept-phone]').waitFor();
    assert.deepEqual(await values(form), previous, 'Phone must remain unchanged until explicit acceptance');
    await form.screenshot({ path: outputRoot + '/' + mode + '-phone-review.png' });
    await form.locator('[data-voice-accept-phone]').click();
  }
  const next = await values(form);
  assert.equal(next[field], expected);
  for (const key of Object.keys(previous)) if (key !== field) assert.equal(next[key], previous[key]);
  assert.equal(await page.evaluate(() => window.qaTracks.every(track => track.readyState === 'ended')), true);
  const row = { mode, field, expected, value: next[field], seconds: processingSeconds, matches: true };
  results.push(row);
  console.log(JSON.stringify({ mode, field, passed: true, seconds: row.seconds }));
}

try {
  const tierResponse = page.waitForResponse(response => response.url() === api + '/api/product-tier'
    && response.request().method() === 'GET');
  // Keep a failed navigation from leaving an unhandled pending response waiter.
  tierResponse.catch(() => {});
  await page.goto(origin + '/r/cofein/admin');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  tier = await (await tierResponse).json();
  assert.ok(['Basic', 'Pro'].includes(tier.tier));
  assert.equal(tier.isPro, tier.tier === 'Pro');
  await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
  await page.locator('.cofein-map-table-button').first().click();
  assert.equal(modelRequests.length, 0, 'Dashboard/map alone must not load the model');
  const preparing = Date.now();
  await page.getByRole('button', { name: 'Създай резервация', exact: true }).click();
  activeForm = page.getByRole('form', { name: 'Резервация', exact: true });
  await assertFields(activeForm);
  assert.equal(await activeForm.locator('[data-voice-prepare]').count(), 0, 'Model prepares automatically without an initial button');
  checks.push('Actual Cofein tier verified; map contains only name/phone microphones and no initial preparation button');
  await page.waitForFunction(() => document.querySelector('[data-voice-field="guestName"]')?.disabled === false,
    null, { timeout: 180000 });
  preparationSeconds = (Date.now() - preparing) / 1000;
  assert.ok(modelRequests.some(request => request.path.endsWith('.onnx')));
  assert.ok(modelRequests.some(request => request.path.endsWith('.wasm')));
  await dictate(activeForm, 'map', 'guestName', 'bg-name-raw.wav', 'георги иванов');
  await dictate(activeForm, 'map', 'phone', 'bg-phone-raw.wav', '0895124615');
  await activeForm.screenshot({ path: outputRoot + '/map-filled.png' });
  const preparedRequestCount = modelRequests.length;
  await page.getByRole('button', { name: 'Close reservation form', exact: true }).click();
  activeForm = undefined;
  await page.getByRole('button', { name: 'Затвори цял екран', exact: true }).click();
  await page.getByRole('button', { name: /^Карта на резервациите/ }).waitFor();
  await page.getByRole('button', { name: /^Резервации/ }).first().click();
  await page.getByRole('button', { name: 'Нова резервация', exact: true }).click();
  activeForm = page.locator('form').filter({ has: page.locator('input[name="reservationCreate.tableIds"]') });
  await assertFields(activeForm);
  assert.equal(await activeForm.locator('[data-voice-prepare]').count(), 0, 'Prepared model must survive map/list navigation');
  assert.equal(await mic(activeForm, 'guestName').isEnabled(), true);
  await dictate(activeForm, 'list', 'guestName', 'bg-name-raw.wav', 'георги иванов');
  await dictate(activeForm, 'list', 'phone', 'bg-phone-raw.wav', '0895124615');
  assert.equal(modelRequests.length, preparedRequestCount, 'Ready-model reuse must not download assets again');
  await activeForm.screenshot({ path: outputRoot + '/list-filled.png' });
  checks.push('Real same-origin model recognizes name/phone in both forms, confirms phones and reuses preparation across map/list');
  assert.equal(await page.evaluate(() => window.qaPcmNodes), 4, 'Each field must use the real PCM worklet');
  assert.equal(await page.evaluate(() => window.qaPcmErrors), 0);
  assert.equal(await page.evaluate(() => window.qaMediaRecorders), 0, 'No lossy MediaRecorder fallback in this check');
  assert.equal(loginPosts, 1);
  assert.deepEqual(blockedWrites, []);
  assert.deepEqual(voiceRequests, []);
  assert.deepEqual(externalRuntimeRequests, []);
  assert.deepEqual(errors, []);
  checks.push('Exactly one login POST; no reservation/other writes, voice API calls, external model assets or runtime errors');
} catch (error) {
  errors.push(redact(error.stack));
  process.exitCode = 1;
  if (activeForm && await activeForm.isVisible().catch(() => false)) {
    await activeForm.screenshot({ path: outputRoot + '/failure-form-only.png' }).catch(() => {});
  }
} finally {
  await browser.close();
  const report = {
    passed: results.length === 4 && errors.length === 0, production: true, tenantId,
    syntheticAudio: true, mockedMediaCapture: true, nativePcmCapture: true, mockedAsr: false, physicalIpadTested: false,
    screenshotsContainOnlyDraftForm: true, preparationSeconds, tier, checks, results, errors,
    loginPosts, blockedWrites, voiceRequests, externalRuntimeRequests, modelRequests,
  };
  await fs.writeFile(outputRoot + '/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, actions: results.length, checks: checks.length,
    errors: errors.length, blockedWrites: blockedWrites.length, voiceRequests: voiceRequests.length,
    report: outputRoot + '/report.json' }));
}
