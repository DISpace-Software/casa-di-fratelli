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
const nextWednesday = new Date(tomorrow);
nextWednesday.setUTCDate(nextWednesday.getUTCDate() - 1);
nextWednesday.setUTCDate(nextWednesday.getUTCDate() + ((3 - nextWednesday.getUTCDay() + 7) % 7 || 7));
const nextWednesdayDate = nextWednesday.toISOString().slice(0, 10);
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
async function mapForm(page, actionScreenshot) {
  await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
  await page.locator('.admin-map-table-node').filter({ hasText: /^23$/ }).click();
  if (actionScreenshot) {
    const panel = page.getByRole('dialog', { name: 'Маса 23', exact: true });
    const names = ['Създай резервация', 'Настани без резервация', 'Блокирай маса за деня'];
    const buttons = names.map(name => panel.getByRole('button', { name, exact: true }));
    const viewport = page.viewportSize();
    let previousBottom = 0;
    for (const button of buttons) {
      assert.equal(await button.isVisible(), true);
      assert.equal(await button.isEnabled(), true);
      const bounds = await button.boundingBox();
      assert.ok(bounds && bounds.y >= previousBottom, 'Table actions must appear in Create / Walk-in / Block order');
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height,
        'Every table action must be fully inside the viewport');
      previousBottom = bounds.y + bounds.height;
    }
    await buttons[0].focus();
    await page.keyboard.press('Tab');
    assert.equal(await buttons[1].evaluate(element => document.activeElement === element), true);
    await page.keyboard.press('Tab');
    assert.equal(await buttons[2].evaluate(element => document.activeElement === element), true);
    await page.screenshot({ path: root + '/' + actionScreenshot, fullPage: true });
    await buttons[1].click();
    const walkIn = page.getByRole('dialog', { name: 'Настаняване', exact: true });
    await walkIn.waitFor();
    await walkIn.getByRole('button', { name: 'Close map window', exact: true }).click();
    await panel.waitFor();
    checks.push({ name: `${viewport.width}px empty map table: Create, Walk-in and Block are visible, enabled, in visual and keyboard order; Walk-in opens and closes without saving`, passed: true });
  }
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
  const { form, voice } = await mapForm(page, '05-desktop-table-action-order.png');
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

  const bulgarian = await open(false, true);
  const bg = await mapForm(bulgarian.page);
  assert.equal(await bg.voice.getByLabel('Език на диктовката', { exact: true }).inputValue(), 'bg-BG');
  await bg.voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  assert.equal(await bulgarian.page.evaluate(() => window.qaVoice.lang), 'bg-BG');
  await emit(bulgarian.page, 'Здравейте, бих искал резервация на името на Иван Петров.');
  await fieldEquals(bg.form, 'Име', 'Иван Петров');
  await emit(bulgarian.page, 'Телефонът ми е нула осем осем осем.');
  await fieldEquals(bg.form, 'Телефон', '');
  await restartAfterEnd(bulgarian.page);
  await emit(bulgarian.page, 'Дванадесет тридесет и четири петдесет и шест.');
  await fieldEquals(bg.form, 'Телефон', '0888123456');
  await emit(bulgarian.page, 'За утре в седем и половина вечерта. Ще бъдем шестима.');
  await fieldEquals(bg.form, 'Дата', tomorrowDate);
  await fieldEquals(bg.form, 'Час', '19:30');
  await fieldEquals(bg.form, 'Гости', '6');
  await emit(bulgarian.page, 'Часът е осем без четвърт вечерта.');
  await fieldEquals(bg.form, 'Час', '19:45');
  await fieldEquals(bg.form, 'Телефон', '0888123456');
  await emit(bulgarian.page, 'Петър, утре ще се чуем. Донеси две кафета. Благодаря, приятна вечер.');
  await fieldEquals(bg.form, 'Име', 'Иван Петров');
  await fieldEquals(bg.form, 'Гости', '6');
  await fieldEquals(bg.form, 'Час', '19:45');
  await stopWithoutRestart(bulgarian.page, bg.voice);
  assert.deepEqual(await api('/api/reservations'), before);
  await bulgarian.page.screenshot({ path: root + '/04-bulgarian-map-natural-speech.png', fullPage: true });
  checks.push({ name: 'Bulgarian map speech handles natural booking phrases, grouped phone digits across a recognition pause, half-past and quarter-to evening times, collective guest numbers, and unrelated chatter without saving', passed: true });
  await bulgarian.context.close();

  const conversation = await open(false, true);
  const colloquial = await mapForm(conversation.page);
  await colloquial.voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  await emit(conversation.page, 'Резервацията е на името на Елена Димитрова.');
  await fieldEquals(colloquial.form, 'Име', 'Елена Димитрова');
  await emit(conversation.page, 'Телефонче за връзка?');
  await fieldEquals(colloquial.form, 'Телефон', '');
  await restartAfterEnd(conversation.page);
  await emit(conversation.page, 'Нула осем осем осем дванадесет тридесет и четири петдесет и шест.');
  await fieldEquals(colloquial.form, 'Телефон', '0888123456');
  await emit(conversation.page, 'За утре в седем и половина вечерта, ще бъдем шестима.');
  await fieldEquals(colloquial.form, 'Дата', tomorrowDate);
  await fieldEquals(colloquial.form, 'Час', '19:30');
  await fieldEquals(colloquial.form, 'Гости', '6');
  await colloquial.form.getByLabel('Име', { exact: true }).fill('Елена Димитрова проверена');
  await restartAfterEnd(conversation.page);
  await emit(conversation.page, 'Поправка, номерчето е 0899123456.');
  await fieldEquals(colloquial.form, 'Телефон', '0899123456');
  await emit(conversation.page, 'Не шестима, а осем души.');
  await fieldEquals(colloquial.form, 'Гости', '8');
  await emit(conversation.page, 'Петър, донеси две кафета. Затвори вратата. Благодаря, приятна вечер.');
  await fieldEquals(colloquial.form, 'Име', 'Елена Димитрова проверена');
  await fieldEquals(colloquial.form, 'Телефон', '0899123456');
  await fieldEquals(colloquial.form, 'Дата', tomorrowDate);
  await fieldEquals(colloquial.form, 'Час', '19:30');
  await fieldEquals(colloquial.form, 'Гости', '8');
  await stopWithoutRestart(conversation.page, colloquial.voice);
  assert.deepEqual(await api('/api/reservations'), before);
  await conversation.page.screenshot({ path: root + '/07-bulgarian-colloquial-dialogue-corrections.png', fullPage: true });
  checks.push({ name: 'Bulgarian telephone diminutives accept question/answer across a pause; номерчето corrects the phone and не шестима, а осем corrects guests; chatter and manual name edits survive without autosaving', passed: true });
  await conversation.context.close();

  const ambiguity = await open(false, true);
  const uncertain = await mapForm(ambiguity.page);
  await uncertain.voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  await emit(ambiguity.page, 'Телефонче 0888123456 или 0898123456, не съм сигурен.');
  const phoneAlert = uncertain.voice.getByRole('alert');
  await phoneAlert.waitFor();
  assert.match(await phoneAlert.innerText(), /Телефон/);
  assert.match(await phoneAlert.innerText(), /Повтори/);
  await fieldEquals(uncertain.form, 'Телефон', '');
  await ambiguity.page.screenshot({ path: root + '/08-bulgarian-uncertain-phone.png', fullPage: true });
  await emit(ambiguity.page, 'Телефонче 0888123456.');
  await fieldEquals(uncertain.form, 'Телефон', '0888123456');
  await phoneAlert.waitFor({ state: 'hidden' });
  await stopWithoutRestart(ambiguity.page, uncertain.voice);
  assert.deepEqual(await api('/api/reservations'), before);
  checks.push({ name: 'Bulgarian ambiguous phone alternatives leave the actual phone input blank and show a phone-specific repeat prompt; explicit clarification fills the number and clears the alert without saving', passed: true });
  await ambiguity.context.close();

  const retraction = await open(false, true);
  const revised = await mapForm(retraction.page);
  await revised.voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
  await emit(retraction.page, 'Телефонче 0888123456');
  await fieldEquals(revised.form, 'Телефон', '0888123456');
  await emit(retraction.page, 'или 0898123456, не съм сигурен.');
  await revised.voice.getByRole('alert').waitFor();
  await fieldEquals(revised.form, 'Телефон', '');
  await retraction.page.screenshot({ path: root + '/09-bulgarian-later-ambiguity-clears-voice-phone.png', fullPage: true });
  await emit(retraction.page, 'Телефонче 0888123456');
  await fieldEquals(revised.form, 'Телефон', '0888123456');
  await revised.voice.getByRole('alert').waitFor({ state: 'hidden' });
  await revised.form.getByLabel('Телефон', { exact: true }).fill('0877123456');
  await emit(retraction.page, 'или 0898123456, не съм сигурен.');
  await revised.voice.getByRole('alert').waitFor();
  await fieldEquals(revised.form, 'Телефон', '0877123456');
  await stopWithoutRestart(retraction.page, revised.voice);
  assert.deepEqual(await api('/api/reservations'), before);
  checks.push({ name: 'Later Bulgarian uncertainty retracts an earlier voice-filled phone; an explicit confirmation restores it, while a subsequent manual phone correction survives new uncertainty without autosaving', passed: true });
  await retraction.context.close();

  // Synthetic contact with the same spoken grouping as the reported dialogue.
  // Both variants contain identical punctuation-free text; the second changes
  // only recognition event boundaries and introduces actual session restarts.
  const dialogueChunks = [
    'здравейте здравейте да слушам слушаме Окей',
    'на чие да е резервацията',
    'Иван Петров Добре добре',
    'за кога',
    'следващата сряда Окей Окей',
    'За колко човека',
    'трима трима човека добре',
    'може ли един телефон само',
    'да слушам Ви',
    '089 12 34 56 78 благодаря',
    'За колко часа',
    'за 10:00 Окей Всичко е добре чао чао',
  ];
  for (const fragmented of [false, true]) {
    const dialogue = await open(false, true);
    const booking = await mapForm(dialogue.page);
    await booking.voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
    if (fragmented) {
      for (const [index, chunk] of dialogueChunks.entries()) {
        await emit(dialogue.page, chunk);
        if ([1, 3, 8, 10].includes(index)) await restartAfterEnd(dialogue.page);
        if (index === 2) await fieldEquals(booking.form, 'Име', 'Иван Петров');
        if (index === 4) await fieldEquals(booking.form, 'Дата', nextWednesdayDate);
        if (index === 6) await fieldEquals(booking.form, 'Гости', '3');
        if (index === 9) await fieldEquals(booking.form, 'Телефон', '08912345678');
      }
    } else {
      await emit(dialogue.page, dialogueChunks.join(' '));
    }
    await fieldEquals(booking.form, 'Име', 'Иван Петров');
    await fieldEquals(booking.form, 'Телефон', '08912345678');
    await fieldEquals(booking.form, 'Дата', nextWednesdayDate);
    await fieldEquals(booking.form, 'Гости', '3');
    const times = await booking.form.getByLabel('Час', { exact: true }).locator('option').evaluateAll(options => options.map(option => option.value));
    if (times.includes('10:00')) {
      await fieldEquals(booking.form, 'Час', '10:00');
      assert.equal(await booking.voice.getByRole('alert').count(), 0);
    } else {
      assert.notEqual(await booking.form.getByLabel('Час', { exact: true }).inputValue(), '10:00');
      assert.match(await booking.voice.getByRole('alert').innerText(), /Час/);
      await booking.voice.locator('summary').click();
      await fieldEquals(booking.voice, 'Провери и поправи полетата: Час', '10:00');
      await booking.voice.locator('summary').click();
    }
    await dialogue.page.screenshot({ path: root + `/10-bulgarian-punctuation-free-${fragmented ? 'fragmented' : 'single'}-dialogue.png`, fullPage: true });
    await emit(dialogue.page, 'Часът е 19:30.');
    await fieldEquals(booking.form, 'Час', '19:30');
    await fieldEquals(booking.form, 'Име', 'Иван Петров');
    await fieldEquals(booking.form, 'Телефон', '08912345678');
    await fieldEquals(booking.form, 'Дата', nextWednesdayDate);
    await fieldEquals(booking.form, 'Гости', '3');
    await stopWithoutRestart(dialogue.page, booking.voice);
    assert.deepEqual(await api('/api/reservations'), before);
    checks.push({ name: `Bulgarian punctuation-free Q/A ${fragmented ? 'in fragmented results across pauses' : 'in one final result'} tolerates repeated greetings/answers and grouped phone digits, fills five actual fields, respects available times and accepts an explicit time correction without saving`, passed: true });
    await dialogue.context.close();
  }

  for (const regression of [
    { language: 'ru-RU', name: 'Анна Иванова', transcript: 'Имя Анна Иванова. Телефон +359888123456. Завтра в 20:00 четыре человека.' },
    { language: 'en-GB', name: 'Anna Ivanova', transcript: 'Name Anna Ivanova. Phone +359888123456. Tomorrow at 20:00 four guests.' },
  ]) {
    const other = await open(false, true);
    const localized = await mapForm(other.page);
    await localized.voice.getByLabel('Език на диктовката', { exact: true }).selectOption(regression.language);
    await localized.voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
    assert.equal(await other.page.evaluate(() => window.qaVoice.lang), regression.language);
    await emit(other.page, regression.transcript);
    await fieldEquals(localized.form, 'Име', regression.name);
    await fieldEquals(localized.form, 'Телефон', '+359888123456');
    await fieldEquals(localized.form, 'Дата', tomorrowDate);
    await fieldEquals(localized.form, 'Час', '20:00');
    await fieldEquals(localized.form, 'Гости', '4');
    await stopWithoutRestart(other.page, localized.voice);
    assert.deepEqual(await api('/api/reservations'), before);
    checks.push({ name: `${regression.language} recognition and existing five-field booking phrase remain unchanged and never save automatically`, passed: true });
    await other.context.close();
  }

  const mobileMap = await open(true, true);
  const mobileForm = await mapForm(mobileMap.page, '06-mobile-table-action-order.png');
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
