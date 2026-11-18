// Local fixture UI -> real PCM decode -> real same-origin WASM -> real form.
// Only capture is synthetic. This does not measure a physical iPad microphone.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [statePath, outputRoot, playwrightPath, chromePath, audioRoot] = process.argv.slice(2);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const url of [state.origin, state.apiUrl]) assert.equal(new URL(url).hostname, '127.0.0.1');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Sofia' });
await context.addInitScript(() => {
  delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
  // Keep real OfflineAudioContext and Worker. Analyser/capture alone are fake.
  window.AudioContext = undefined; window.webkitAudioContext = undefined;
  window.qaTracks = [];
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: async () => {
      const track = { ended: false, stop() { this.ended = true; } };
      window.qaTracks.push(track); return { getTracks: () => [track] };
    },
  } });
  window.MediaRecorder = class {
    static isTypeSupported() { return false; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/wav'; }
    start() { this.state = 'recording'; queueMicrotask(() => this.onstart?.()); }
    stop() {
      this.state = 'inactive';
      const bytes = Uint8Array.from(atob(window.qaWave), c => c.charCodeAt(0));
      queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([bytes], { type: this.mimeType }) }); this.onstop?.(); });
    }
  };
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const results = [], errors = [], voiceRequests = [], mutations = [], modelRequests = [];
let preparationSeconds;
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => {
  const request = route.request(), url = new URL(request.url());
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
  if (url.pathname.includes('/voice/')) { voiceRequests.push(url.pathname); return route.abort(); }
  if (url.pathname.includes('/speech/')) modelRequests.push({ path: url.pathname, method: request.method() });
  if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && url.pathname !== '/api/admin/login') {
    mutations.push(url.pathname); return route.abort();
  }
  return route.continue();
});
const mic = (form, field) => form.locator(`[data-voice-field="${field}"]`);
const input = (form, field) => mic(form, field).locator('..').locator('input,select');
try {
  await page.goto(state.origin + '/r/casa-di-fratelli/admin');
  await page.locator('input[type=email]').fill(state.tenants['casa-di-fratelli'].email);
  await page.locator('input[type=password]').fill(state.tenants['casa-di-fratelli'].password);
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
  await page.locator('.admin-map-table-node').filter({ hasText: /^23$/ }).click();
  await page.getByRole('button', { name: 'Създай резервация', exact: true }).click();
  const form = page.getByRole('form', { name: 'Резервация', exact: true });
  assert.equal(await form.locator('[data-voice-prepare]').count(), 0, 'Model prepares automatically with the form');
  assert.equal(await form.locator('[data-voice-field]').count(), 2, 'Only name and phone have microphones');
  for (const field of ['reservedDate', 'reservedTime', 'guestCount', 'email']) {
    assert.equal(await mic(form, field).count(), 0, `${field} remains manual`);
  }
  const preparing = Date.now();
  await page.waitForFunction(() => !document.querySelector('[data-voice-field="guestName"]')?.disabled, null, { timeout: 180000 });
  preparationSeconds = (Date.now() - preparing) / 1000;
  const cases = [
    ['guestName', 'bg-name-raw.wav', 'георги иванов'],
    ['phone', 'bg-phone-raw.wav', '0895124615'],
    ['phone', 'bg-phone-raw.wav', '0895124615'],
  ];
  for (const [field, file, expected] of cases) {
    const bytes = await fs.readFile(audioRoot + '/' + file);
    await page.evaluate(wave => { window.qaWave = wave; }, bytes.toString('base64'));
    const previous = await input(form, field).inputValue();
    await mic(form, field).click();
    await page.waitForFunction(() => document.querySelector('[data-voice-phase="listening"]'));
    const started = Date.now();
    await mic(form, field).click();
    await page.waitForFunction(() => document.querySelector('[data-voice-phase="idle"]'));
    if (field === 'phone') {
      assert.equal(await input(form, field).inputValue(), previous, 'Phone waits for explicit acceptance');
      await form.locator('[data-voice-accept-phone]').click();
    }
    const value = await input(form, field).inputValue();
    const row = { field, expected, value, seconds: (Date.now() - started) / 1000, matches: value === expected };
    results.push(row); console.log(JSON.stringify(row));
    assert.equal(row.matches, true, `Local ASR did not fill ${field} correctly`);
    assert.equal(await page.evaluate(() => window.qaTracks.every(track => track.ended)), true);
  }
  await page.screenshot({ path: outputRoot + '/ondevice-real-form.png', fullPage: true });
  assert.deepEqual(voiceRequests, []); assert.deepEqual(mutations, []); assert.deepEqual(errors, []);
  assert.ok(modelRequests.every(request => request.method === 'GET'));
} catch (error) { errors.push(error.stack); process.exitCode = 1; }
finally {
  await browser.close();
  await fs.writeFile(outputRoot + '/report.json', JSON.stringify({ passed: results.length === 3 && results.every(row => row.matches) && errors.length === 0, localOnly: true, syntheticAudio: true, mockedMediaCapture: true, mockedAsr: false, physicalIpadTested: false, preparationSeconds, results, errors, voiceRequests, operationalMutations: mutations, modelRequests }, null, 2));
}
