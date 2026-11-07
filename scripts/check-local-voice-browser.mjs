// Local fixture only. Speech events are simulated: this does not claim microphone/ASR accuracy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [statePath, root, playwrightPath, chromiumPath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
assert.equal(new URL(state.apiUrl).hostname, '127.0.0.1');
assert.equal(new URL(state.origin).hostname, '127.0.0.1');
await fs.mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const checks = [], errors = [];
let currentPage;
const tomorrow = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) + 'T12:00:00Z');
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const tomorrowDate = tomorrow.toISOString().slice(0, 10);
async function api(path) {
  const response = await fetch(state.apiUrl + path, { headers: { 'X-Tenant-Id': 'casa-di-fratelli', 'X-Admin-Token': state.tenants['casa-di-fratelli'].auth.token } });
  assert.equal(response.status, 200);
  return response.json();
}
async function open(mobile, supported) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 }, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript(supported => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    window.qaVoiceInstances = [];
    if (supported) window.SpeechRecognition = class {
      constructor() { this.results = []; window.qaVoiceInstances.push(this); }
      start() { window.qaVoiceStarts = (window.qaVoiceStarts || 0) + 1; window.qaVoice = this; }
      stop() { window.qaVoiceStops = (window.qaVoiceStops || 0) + 1; this.onend?.(); }
      abort() { window.qaVoiceAborts = (window.qaVoiceAborts || 0) + 1; this.onend?.(); }
      emit(transcript, final = true) {
        // Web Speech results are cumulative within one recognition instance.
        if (this.results.at(-1)?.isFinal === false) this.results.pop();
        const result = [{ transcript }]; result.isFinal = final;
        this.results.push(result);
        this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
      }
    };
  }, supported);
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(state.origin + '/r/casa-di-fratelli/admin');
  await page.locator('input[type=email]').fill(state.tenants['casa-di-fratelli'].email);
  await page.locator('input[type=password]').fill(state.tenants['casa-di-fratelli'].password);
  await page.locator('button[type=submit]').click();
  await page.getByText('Restaurant CRM', { exact: true }).waitFor();
  return { page, context };
}
async function mapForm(page) {
  await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
  await page.locator('.admin-map-table-node').filter({ hasText: /^23$/ }).click();
  await page.getByRole('button', { name: 'Създай резервация', exact: true }).click();
  const form = page.getByRole('form', { name: 'Резервация', exact: true });
  return { form, voice: form.locator('[data-voice-reservation]') };
}
async function emit(page, text, final = true) {
  await page.evaluate(({ text, final }) => window.qaVoice.emit(text, final), { text, final });
}
async function fieldEquals(form, label, expected) {
  await form.getByLabel(label, { exact: true }).evaluate((element, value) => {
    if (element.value === value) return;
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (element.value === value) { clearInterval(timer); resolve(); }
        else if (Date.now() - start > 3000) { clearInterval(timer); reject(new Error(`${element.getAttribute('aria-label')}: expected ${value}, received ${element.value}`)); }
      }, 20);
    });
  }, expected);
  assert.equal(await form.getByLabel(label, { exact: true }).inputValue(), expected);
}
async function restartAfterEnd(page) {
  const starts = await page.evaluate(() => window.qaVoiceStarts);
  await page.evaluate(() => window.qaVoice.onend?.());
  await page.waitForFunction(previous => window.qaVoiceStarts === previous + 1, starts);
}
async function stopWithoutRestart(page, voice) {
  const starts = await page.evaluate(() => window.qaVoiceStarts);
  await voice.getByRole('button', { name: 'Спри', exact: true }).click();
  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), starts);
}
try {
  const before = await api('/api/reservations');
  const desktop = await open(false, true); const { page } = desktop;
  const { form, voice } = await mapForm(page);
  assert.equal(await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).isVisible(), true);
  assert.equal(await voice.locator('details').getAttribute('open'), null);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts || 0), 0);
  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => ({ language: window.qaVoice.lang, continuous: window.qaVoice.continuous, interim: window.qaVoice.interimResults })), { language: 'bg-BG', continuous: true, interim: true });
  await emit(page, 'Здравейте, кафе ли искате?');
  await fieldEquals(form, 'Име', '');
  await emit(page, 'Име Иван Петров.', false);
  await fieldEquals(form, 'Име', '');
  await emit(page, 'Име Иван Петров.');
  await fieldEquals(form, 'Име', 'Иван Петров');
  await form.getByLabel('Име', { exact: true }).fill('Иван Петров проверен');
  await restartAfterEnd(page);
  await emit(page, 'Телефон 0898123456.');
  await fieldEquals(form, 'Телефон', '0898123456');
  await fieldEquals(form, 'Име', 'Иван Петров проверен');
  await emit(page, 'Петър, затвори вратата. За резервацията утре в 19:30 шест души. Благодаря, кафето е готово.');
  await fieldEquals(form, 'Дата', tomorrowDate);
  await fieldEquals(form, 'Час', '19:30');
  await fieldEquals(form, 'Гости', '6');
  await fieldEquals(form, 'Име', 'Иван Петров проверен');
  await stopWithoutRestart(page, voice);
  await voice.locator('summary').click();
  const transcript = await voice.getByLabel('Разпознат текст', { exact: true }).inputValue();
  assert.equal(transcript.match(/Име Иван Петров/g)?.length, 1);
  assert.ok(transcript.includes('0898123456') && transcript.includes('19:30'));
  await voice.locator('summary').click();
  assert.deepEqual(await api('/api/reservations'), before);
  await page.screenshot({ path: root + '/01-desktop-map-live-fields.png', fullPage: true });
  checks.push({ name: 'Desktop map voice button is visible; final chunks fill five fields across a pause, interim/noise do not overwrite fields, manual name correction survives, no reservation is saved', passed: true });

  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  await emit(page, 'Гости осем.');
  await fieldEquals(form, 'Гости', '8');
  await fieldEquals(form, 'Телефон', '0898123456');
  await stopWithoutRestart(page, voice);
  checks.push({ name: 'Restarting dictation retains earlier fields, accepts a corrected guest count, and Stop prevents automatic restart', passed: true });

  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  await page.evaluate(() => window.qaVoice.onerror?.({ error: 'no-speech' }));
  await restartAfterEnd(page);
  await emit(page, 'Час 20:00.');
  await fieldEquals(form, 'Час', '20:00');
  const startsBeforePermissionError = await page.evaluate(() => window.qaVoiceStarts);
  await page.evaluate(() => window.qaVoice.onerror?.({ error: 'not-allowed' }));
  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), startsBeforePermissionError);
  assert.equal(await voice.getByRole('alert').count(), 1);
  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  const startsBeforeNetworkError = await page.evaluate(() => window.qaVoiceStarts);
  await page.evaluate(() => window.qaVoice.onerror?.({ error: 'network' }));
  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), startsBeforeNetworkError);
  assert.equal(await voice.getByRole('alert').count(), 1);
  checks.push({ name: 'No-speech pauses recover; permission denial and network errors stop recognition without a retry loop', passed: true });

  await page.clock.install();
  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  const startsBeforeLimit = await page.evaluate(() => window.qaVoiceStarts);
  await page.clock.fastForward(90500);
  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).waitFor();
  assert.equal(await voice.getByText(/Диктовката спря след 90 секунди/).count(), 1);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), startsBeforeLimit);
  checks.push({ name: 'Dictation stops at the 90-second limit without a restart', passed: true });

  await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  await page.evaluate(() => { window.qaLateResult = window.qaVoice.onresult; window.qaLateEnd = window.qaVoice.onend; });
  const startsBeforeClose = await page.evaluate(() => window.qaVoiceStarts);
  const abortsBeforeClose = await page.evaluate(() => window.qaVoiceAborts || 0);
  await page.getByRole('button', { name: 'Close reservation form', exact: true }).click();
  assert.ok(await page.evaluate(() => window.qaVoiceAborts) > abortsBeforeClose);
  await page.evaluate(() => { const result = [{ transcript: 'Име Нежелана Промяна.' }]; result.isFinal = true; window.qaLateResult({ results: [result] }); window.qaLateEnd(); });
  await page.clock.fastForward(1000);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), startsBeforeClose);
  assert.equal(await page.getByRole('form', { name: 'Резервация', exact: true }).count(), 0);
  assert.deepEqual(await api('/api/reservations'), before);
  checks.push({ name: 'Closing the map form aborts recognition; stale result/end events cannot reopen or update it', passed: true });
  await desktop.context.close();

  const mobileMap = await open(true, true);
  const mobileForm = await mapForm(mobileMap.page);
  assert.equal(await mobileForm.voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).isVisible(), true);
  await mobileForm.voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  await emit(mobileMap.page, 'Име Мария Иванова. Телефон 0888123456. Утре в 20:00 четири души.');
  await fieldEquals(mobileForm.form, 'Име', 'Мария Иванова');
  await fieldEquals(mobileForm.form, 'Телефон', '0888123456');
  await fieldEquals(mobileForm.form, 'Дата', tomorrowDate);
  await fieldEquals(mobileForm.form, 'Час', '20:00');
  await fieldEquals(mobileForm.form, 'Гости', '4');
  await stopWithoutRestart(mobileMap.page, mobileForm.voice);
  assert.ok(await mobileMap.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await mobileMap.page.screenshot({ path: root + '/02-mobile-map-live-fields.png', fullPage: true });
  assert.deepEqual(await api('/api/reservations'), before);
  checks.push({ name: '390px map modal exposes dictation immediately and fills the actual reservation inputs without overflow or saving', passed: true });
  await mobileMap.context.close();

  const mobile = await open(true, false); const p = mobile.page;
  await p.getByRole('button', { name: /^Резервации/ }).first().click();
  await p.getByRole('button', { name: 'Нова резервация', exact: true }).click();
  const list = p.locator('form').filter({ has: p.getByPlaceholder('Напр. 20, 21, 22', { exact: true }) });
  const panel = list.locator('[data-voice-reservation]');
  assert.equal(await panel.getByRole('button', { name: 'Диктувай резервация', exact: true }).isDisabled(), true);
  await panel.locator('summary').click();
  await panel.getByLabel('Разпознат текст', { exact: true }).fill('Имя Анна Иванова, телефон +359888123456, завтра в 20:00, четыре человека');
  await panel.getByRole('button', { name: 'Попълни формата', exact: true }).click();
  assert.equal(await list.locator('input:not([aria-label])').nth(0).inputValue(), 'Анна Иванова');
  assert.equal(await list.locator('input:not([aria-label])').nth(1).inputValue(), '+359888123456');
  assert.equal(await list.locator('input:not([aria-label])').nth(3).inputValue(), tomorrowDate);
  assert.equal(await list.locator('input:not([aria-label])').nth(4).inputValue(), '4');
  assert.equal(await list.locator('select:not([aria-label])').first().inputValue(), '20:00');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await p.screenshot({ path: root + '/03-mobile-list-fallback.png', fullPage: true });
  assert.deepEqual(await api('/api/reservations'), before);
  checks.push({ name: '390px list form offers typed Russian transcript fallback when recognition is unavailable and fills actual inputs without saving or overflow', passed: true });
  await panel.getByLabel('Разпознат текст', { exact: true }).fill('Иван, телефон 123, утре в 25:90, 50 души');
  assert.equal(await panel.getByRole('button', { name: 'Попълни формата', exact: true }).isDisabled(), true);
  checks.push({ name: 'Invalid phone/time/count cannot be applied', passed: true });
  await mobile.context.close();
  assert.deepEqual(errors, []);
} catch (error) {
  checks.push({ name: 'Failure', passed: false, error: error.stack }); process.exitCode = 1;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: root + '/failure.png', fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  const report = { passed: checks.every(check => check.passed), simulatedSpeechEvents: true, actualMicrophoneTested: false, localOnly: true, checks, errors };
  await fs.writeFile(root + '/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
