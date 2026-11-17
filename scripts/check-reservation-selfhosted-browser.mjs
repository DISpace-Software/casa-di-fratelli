// Local-only browser -> real API -> real private Whisper -> real form check.
// Audio is prerecorded synthetic speech; this does not test a physical iPad mic.
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
const results = [], errors = [], mutations = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/**', route => {
  const request = route.request();
  const { hostname, pathname } = new URL(request.url());
  assert.equal(hostname, '127.0.0.1');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !['/api/admin/login', '/api/admin/reservations/voice/transcribe'].includes(pathname)) {
    mutations.push(pathname); return route.abort();
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
  const cases = [
    ['guestName', 'bg-name-raw.wav', 'Георги Иванов'],
    ['phone', 'bg-phone-raw.wav', '0895124615'],
    ['reservedDate', 'bg-reservedDate-raw.wav', '2026-11-18'],
    ['reservedTime', 'bg-reservedTime-raw.wav', '19:30'],
    ['guestCount', 'bg-guestCount-raw.wav', '3'],
    ['email', 'bg-email-raw.wav', 'georgi.ivanov@gmail.com'],
  ];
  // Relative dates use the real test day; freeze only the expected calendar value.
  const weekday = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) + 'T12:00:00Z');
  const untilWednesday = (3 - weekday.getUTCDay() + 7) % 7 || 7;
  weekday.setUTCDate(weekday.getUTCDate() + untilWednesday);
  cases[2][2] = weekday.toISOString().slice(0, 10);
  for (const [field, file, expected] of cases) {
    const bytes = await fs.readFile(audioRoot + '/' + file);
    await page.evaluate(wave => { window.qaWave = wave; }, bytes.toString('base64'));
    const previous = await input(form, field).inputValue();
    await mic(form, field).click();
    await page.waitForFunction(() => document.querySelector('[data-voice-phase="listening"]'));
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/voice/transcribe'), { timeout: 30000 }).catch(() => null);
    const started = Date.now();
    await mic(form, field).click();
    const response = await responsePromise;
    const body = response ? await response.json() : null;
    await page.waitForFunction(() => document.querySelector('[data-voice-phase="idle"]'), null, { timeout: 30000 });
    const value = await input(form, field).inputValue();
    const row = { field, expected, text: body?.text || null, httpStatus: response?.status() || null, value, seconds: (Date.now() - started) / 1000, preservedOnRejection: value === previous, matches: expected === null ? value === previous : value === expected };
    results.push(row); console.log(JSON.stringify(row));
    assert.equal(row.matches, true, `Real ASR did not fill ${field} correctly`);
    assert.equal(await page.evaluate(() => window.qaTracks.every(track => track.ended)), true);
  }
  await page.screenshot({ path: outputRoot + '/real-worker-tablet.png', fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(mutations, []);
} catch (error) { errors.push(error.stack); process.exitCode = 1; }
finally {
  await browser.close();
  await fs.writeFile(outputRoot + '/report.json', JSON.stringify({ passed: results.length === 6 && results.every(row => row.matches) && errors.length === 0, localOnly: true, syntheticAudio: true, mockedMediaCapture: true, mockedAsr: false, physicalIpadTested: false, results, errors, operationalMutations: mutations }, null, 2));
}
