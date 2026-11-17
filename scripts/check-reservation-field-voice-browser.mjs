// Local fixture only. Recognition events are simulated; real microphone/ASR accuracy is not tested.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [statePath, outputRoot, playwrightPath, chromiumPath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const url of [state.apiUrl, state.origin]) assert.equal(new URL(url).hostname, '127.0.0.1');
await fs.mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const checks = [], errors = [], reservationMutations = [];
const labels = { guestName: 'Име', phone: 'Телефон', reservedDate: 'Дата', reservedTime: 'Час', guestCount: 'Гости', email: 'Имейл' };
const tomorrow = new Date(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()) + 'T12:00:00Z');
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const tomorrowDate = tomorrow.toISOString().slice(0, 10);
let currentPage;

async function reservations() {
  const response = await fetch(state.apiUrl + '/api/reservations', { headers: {
    'X-Tenant-Id': 'casa-di-fratelli', 'X-Admin-Token': state.tenants['casa-di-fratelli'].auth.token,
  } });
  assert.equal(response.status, 200);
  return response.json();
}
async function open({ mobile = false, supported = true } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 },
    isMobile: mobile, hasTouch: mobile,
  });
  await context.addInitScript(supported => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    window.qaVoiceInstances = [];
    if (supported) window.SpeechRecognition = class {
      constructor() { this.results = []; window.qaVoiceInstances.push(this); }
      start() { window.qaVoiceStarts = (window.qaVoiceStarts || 0) + 1; window.qaVoice = this; this.onstart?.(); }
      stop() {
        window.qaVoiceStops = (window.qaVoiceStops || 0) + 1;
        if (window.qaStopFinal) { this.emit(window.qaStopFinal); window.qaStopFinal = null; }
        this.onend?.();
      }
      abort() { window.qaVoiceAborts = (window.qaVoiceAborts || 0) + 1; this.onend?.(); }
      emit(transcript, final = true) {
        // Chrome results accumulate within an instance; an interim result is replaced.
        if (this.results.at(-1)?.isFinal === false) this.results.pop();
        const result = [{ transcript }]; result.isFinal = final;
        this.results.push(result);
        this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
      }
    };
  }, supported);
  const page = await context.newPage(); currentPage = page;
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === state.apiUrl && url.pathname.startsWith('/api/reservations') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      reservationMutations.push({ method: request.method(), path: url.pathname });
    }
  });
  await page.route('**/api/admin/reservations/voice/capabilities', route => route.fulfill({ json: { enabled: false, languages: [] } }));
  await page.goto(state.origin + '/r/casa-di-fratelli/admin');
  await page.locator('input[type=email]').fill(state.tenants['casa-di-fratelli'].email);
  await page.locator('input[type=password]').fill(state.tenants['casa-di-fratelli'].password);
  await page.locator('button[type=submit]').click();
  await page.getByRole('button', { name: /^Карта на резервациите/ }).waitFor();
  return { page, context };
}
async function mapForm(page) {
  await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
  await page.locator('.admin-map-table-node').filter({ hasText: /^23$/ }).click();
  await page.getByRole('button', { name: 'Създай резервация', exact: true }).click();
  return page.getByRole('form', { name: 'Резервация', exact: true });
}
async function listForm(page) {
  await page.getByRole('button', { name: /^Резервации/ }).first().click();
  await page.getByRole('button', { name: 'Нова резервация', exact: true }).click();
  return page.locator('form').filter({ has: page.getByPlaceholder('Напр. 20, 21, 22', { exact: true }) });
}
const mic = (form, key) => form.locator(`button[data-voice-field="${key}"]`);
// The list form uses longer visible labels (e.g. Име на гост / Email по желание).
// Scope to the actual control paired with this field's microphone in either form.
const input = (form, key) => mic(form, key).locator('..').locator('input, select');
async function fieldEquals(form, key, expected) {
  await input(form, key).evaluate((element, expectedValue) => new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (element.value === expectedValue) return resolve();
      if (Date.now() - start > 3000) return reject(new Error(`${element.getAttribute('aria-label')}: expected ${expectedValue}, received ${element.value}`));
      setTimeout(check, 20);
    };
    check();
  }), expected);
}
async function emit(page, text, final = true) {
  await page.evaluate(({ text, final }) => window.qaVoice.emit(text, final), { text, final });
}
async function start(page, form, key) {
  await mic(form, key).click();
  assert.equal(await mic(form, key).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.qaVoice.lang), 'bg-BG');
}
async function stop(page, form, key) {
  // Scrolling a long mobile form can outlast the valid-value silence timer.
  // Recheck after scrolling so Stop cannot accidentally become a fresh Start.
  await mic(form, key).scrollIntoViewIfNeeded();
  if (await mic(form, key).getAttribute('aria-pressed') === 'true') await mic(form, key).click();
  await mic(form, key).locator('xpath=.').evaluate(element => new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (element.getAttribute('aria-pressed') !== 'true') return resolve();
      if (Date.now() - start > 2500) return reject(new Error('Microphone did not stop'));
      setTimeout(check, 20);
    };
    check();
  }));
  assert.equal(await page.locator('button[data-voice-field][aria-pressed="true"]').count(), 0);
}
async function restartAfterPause(page) {
  const starts = await page.evaluate(() => window.qaVoiceStarts);
  await page.evaluate(() => window.qaVoice.onend?.());
  await page.waitForFunction(previous => window.qaVoiceStarts === previous + 1, starts);
}
async function dictate(page, form, key, text, expected) {
  await start(page, form, key); await emit(page, text); await fieldEquals(form, key, expected); await stop(page, form, key);
}
async function assertIcons(form) {
  assert.equal(await form.locator('button[data-voice-field]').count(), 6);
  for (const [key, label] of Object.entries(labels)) {
    assert.equal(await mic(form, key).isVisible(), true);
    assert.equal(await mic(form, key).getAttribute('type'), 'button');
    assert.match(await mic(form, key).getAttribute('aria-label'), key === 'email' ? /Имейл|Email/iu : new RegExp(label));
  }
  assert.equal(await form.locator('[data-voice-reservation]').count(), 0);
  assert.equal(await form.locator('[data-reservation-field-dictation]').count(), 1);
}
function passed(name) { checks.push({ name, passed: true }); }

try {
  const before = await reservations();
  const desktop = await open(); const { page } = desktop; const form = await mapForm(page);
  await assertIcons(form);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts || 0), 0);
  await page.screenshot({ path: outputRoot + '/01-map-field-microphones.png', fullPage: true });
  passed('Map form exposes six named microphone buttons next to actual fields with compact feedback; recognition starts only after a click');

  await start(page, form, 'guestName');
  await emit(page, 'Иван Петров', false);
  await fieldEquals(form, 'guestName', '');
  await emit(page, 'Иван Петров');
  await fieldEquals(form, 'guestName', 'Иван Петров');
  await stop(page, form, 'guestName');
  await fieldEquals(form, 'phone', '');
  passed('Bulgarian bare name updates the real name input only after a final result; interim text and other fields remain untouched');

  await start(page, form, 'phone');
  await emit(page, 'нула осем осем осем');
  await fieldEquals(form, 'phone', '');
  await restartAfterPause(page);
  await emit(page, 'дванадесет');
  await fieldEquals(form, 'phone', '');
  await emit(page, 'тридесет и четири');
  await fieldEquals(form, 'phone', '');
  await emit(page, 'петдесет и шест', false);
  await fieldEquals(form, 'phone', '');
  await emit(page, 'петдесет и шест');
  await fieldEquals(form, 'phone', '0888123456');
  await stop(page, form, 'phone');
  passed('Partial phone digits stay uncommitted; cumulative final groups across a recognition pause fill the complete phone without duplication');

  await dictate(page, form, 'reservedDate', 'утре', tomorrowDate);
  await dictate(page, form, 'reservedTime', 'седем и половина вечерта', '19:30');
  await dictate(page, form, 'guestCount', 'трима', '3');
  await dictate(page, form, 'email', 'support at example dot com', 'support@example.com');
  await fieldEquals(form, 'guestName', 'Иван Петров');
  await fieldEquals(form, 'phone', '0888123456');
  await page.screenshot({ path: outputRoot + '/02-map-bulgarian-fields-filled.png', fullPage: true });
  assert.deepEqual(await reservations(), before);
  passed('Separate Bulgarian date, time and guest-count plus spoken-email dictation fills the actual map inputs while preserving the name and phone and never saving');

  await start(page, form, 'guestName');
  await page.evaluate(() => { window.qaLateResult = window.qaVoice.onresult; window.qaLateEnd = window.qaVoice.onend; });
  const abortsBeforeSwitch = await page.evaluate(() => window.qaVoiceAborts || 0);
  await start(page, form, 'phone');
  assert.ok(await page.evaluate(() => window.qaVoiceAborts) > abortsBeforeSwitch);
  const startsAfterSwitch = await page.evaluate(() => window.qaVoiceStarts);
  await page.evaluate(() => {
    const result = [{ transcript: 'Нежелана Промяна' }]; result.isFinal = true;
    window.qaLateResult?.({ resultIndex: 0, results: [result] }); window.qaLateEnd?.();
  });
  await fieldEquals(form, 'guestName', 'Иван Петров');
  await emit(page, '0899123456');
  await fieldEquals(form, 'phone', '0899123456');
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), startsAfterSwitch);
  await stop(page, form, 'phone');
  passed('Switching microphone fields aborts the old recognition; late results cannot change the old field, leak into the new field, or restart the old session');

  await start(page, form, 'guestName');
  await emit(page, 'Мария Иванова', false);
  await fieldEquals(form, 'guestName', 'Иван Петров');
  await page.evaluate(() => { window.qaStopFinal = 'Мария Иванова'; });
  await stop(page, form, 'guestName');
  await fieldEquals(form, 'guestName', 'Мария Иванова');
  passed('The same microphone button stops dictation and accepts the final result delivered by stop without applying the earlier interim result');

  await start(page, form, 'guestName');
  await page.evaluate(() => { window.qaLateResult = window.qaVoice.onresult; window.qaLateEnd = window.qaVoice.onend; });
  const abortsBeforeManualEdit = await page.evaluate(() => window.qaVoiceAborts || 0);
  await input(form, 'guestName').fill('Мария Иванова проверена');
  assert.equal(await mic(form, 'guestName').getAttribute('aria-pressed'), 'false');
  assert.ok(await page.evaluate(() => window.qaVoiceAborts) > abortsBeforeManualEdit);
  await page.evaluate(() => {
    const result = [{ transcript: 'Нежелана Промяна' }]; result.isFinal = true;
    window.qaLateResult?.({ resultIndex: 0, results: [result] }); window.qaLateEnd?.();
  });
  await fieldEquals(form, 'guestName', 'Мария Иванова проверена');
  passed('Editing an actively dictated field manually cancels recognition and protects the typed correction from late voice results');

  await start(page, form, 'reservedTime');
  await emit(page, 'шест сутринта');
  await fieldEquals(form, 'reservedTime', '19:30');
  await stop(page, form, 'reservedTime');
  await form.getByRole('alert').waitFor();
  assert.match(await form.getByRole('alert').innerText(), /час|достъпен/iu);
  await dictate(page, form, 'reservedTime', 'осем без четвърт вечерта', '19:45');
  assert.equal(await form.getByRole('alert').count(), 0);
  passed('A dictated time outside the available options preserves the existing selection and explains the issue; a valid correction clears the error');

  await start(page, form, 'guestName');
  const startsBeforeError = await page.evaluate(() => window.qaVoiceStarts);
  await page.evaluate(() => window.qaVoice.onerror?.({ error: 'not-allowed' }));
  await form.getByRole('alert').waitFor();
  assert.equal(await mic(form, 'guestName').getAttribute('aria-pressed'), 'false');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), startsBeforeError);
  await fieldEquals(form, 'guestName', 'Мария Иванова проверена');
  await start(page, form, 'phone');
  await page.evaluate(() => window.qaVoice.onerror?.({ error: 'network' }));
  await form.getByRole('alert').waitFor();
  assert.equal(await mic(form, 'phone').getAttribute('aria-pressed'), 'false');
  passed('Permission denial and network failure show feedback, stop recording, preserve existing fields and avoid automatic retries');

  await page.clock.install();
  await start(page, form, 'guestCount');
  await emit(page, 'четирима');
  await page.clock.fastForward(2500);
  await fieldEquals(form, 'guestCount', '4');
  assert.equal(await mic(form, 'guestCount').getAttribute('aria-pressed'), 'false');
  const startsAfterAutoStop = await page.evaluate(() => window.qaVoiceStarts);
  await page.clock.fastForward(2000);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), startsAfterAutoStop);
  passed('A complete field value stops after a short silence without restarting the microphone');

  await start(page, form, 'phone');
  await emit(page, 'нула осем');
  await page.clock.fastForward(20500);
  assert.equal(await mic(form, 'phone').getAttribute('aria-pressed'), 'false');
  await fieldEquals(form, 'phone', '0899123456');
  passed('Incomplete recognition stops within the field recording limit and preserves the previous valid phone');

  await start(page, form, 'guestName');
  await page.evaluate(() => { window.qaLateResult = window.qaVoice.onresult; window.qaLateEnd = window.qaVoice.onend; });
  const startsBeforeClose = await page.evaluate(() => window.qaVoiceStarts);
  const abortsBeforeClose = await page.evaluate(() => window.qaVoiceAborts || 0);
  await page.getByRole('button', { name: 'Close reservation form', exact: true }).click();
  assert.ok(await page.evaluate(() => window.qaVoiceAborts) > abortsBeforeClose);
  await page.evaluate(() => {
    const result = [{ transcript: 'Нежелана Промяна' }]; result.isFinal = true;
    window.qaLateResult?.({ resultIndex: 0, results: [result] }); window.qaLateEnd?.();
  });
  await page.clock.fastForward(1500);
  assert.equal(await page.evaluate(() => window.qaVoiceStarts), startsBeforeClose);
  assert.equal(await page.getByRole('form', { name: 'Резервация', exact: true }).count(), 0);
  assert.deepEqual(await reservations(), before);
  passed('Closing the reservation form aborts the microphone and ignores stale callbacks without reopening, updating or saving a reservation');
  await desktop.context.close();

  for (const mode of ['map', 'list']) {
    const mobile = await open({ mobile: true }); const p = mobile.page;
    const mobileForm = mode === 'map' ? await mapForm(p) : await listForm(p);
    await assertIcons(mobileForm);
    await dictate(p, mobileForm, 'guestName', 'Елена Димитрова', 'Елена Димитрова');
    await dictate(p, mobileForm, 'phone', '0888123456', '0888123456');
    await dictate(p, mobileForm, 'reservedDate', 'утре', tomorrowDate);
    await dictate(p, mobileForm, 'reservedTime', 'двадесет часа', '20:00');
    await dictate(p, mobileForm, 'guestCount', 'шестима', '6');
    await dictate(p, mobileForm, 'email', 'support@example.com', 'support@example.com');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    for (const key of Object.keys(labels)) {
      await mic(mobileForm, key).scrollIntoViewIfNeeded();
      const bounds = await mic(mobileForm, key).boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, `${key} microphone must remain inside the 390px viewport`);
    }
    await p.screenshot({ path: outputRoot + `/03-mobile-${mode}-field-microphones.png`, fullPage: true });
    assert.deepEqual(await reservations(), before);
    passed(`390px ${mode} form exposes all six field microphones, accepts bare Bulgarian values plus email into actual inputs and has no horizontal overflow or autosave`);
    await mobile.context.close();
  }

  const unsupported = await open({ mobile: true, supported: false });
  const unsupportedForm = await mapForm(unsupported.page);
  await assertIcons(unsupportedForm);
  assert.equal(await mic(unsupportedForm, 'guestName').isDisabled(), true);
  assert.equal(await unsupported.page.evaluate(() => window.qaVoiceStarts || 0), 0);
  assert.match(await unsupportedForm.locator('[data-reservation-field-dictation]').innerText(), /браузър|разпознаване|микрофон|диктовка/iu);
  await input(unsupportedForm, 'guestName').fill('Ръчно въведено име');
  await fieldEquals(unsupportedForm, 'guestName', 'Ръчно въведено име');
  assert.deepEqual(await reservations(), before);
  passed('Unsupported browsers show readable voice feedback without recording and retain ordinary manual field editing');
  await unsupported.context.close();

  assert.deepEqual(reservationMutations, []);
  assert.deepEqual(errors, []);
} catch (error) {
  checks.push({ name: 'Failure', passed: false, error: error.stack }); process.exitCode = 1;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: outputRoot + '/failure.png', fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  const report = {
    passed: checks.every(check => check.passed), localOnly: true, simulatedSpeechEvents: true,
    actualMicrophoneTested: false, checks, errors, reservationMutations,
  };
  await fs.writeFile(outputRoot + '/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
