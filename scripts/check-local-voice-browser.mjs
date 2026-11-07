// Local fixture only. Speech events are simulated: this does not claim microphone/ASR accuracy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [statePath, root, playwrightPath, chromiumPath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true); assert.equal(new URL(state.apiUrl).hostname, '127.0.0.1'); assert.equal(new URL(state.origin).hostname, '127.0.0.1');
await fs.mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const checks = [], errors = [];
async function api(path) { const r = await fetch(state.apiUrl + path, { headers: { 'X-Tenant-Id': 'casa-di-fratelli', 'X-Admin-Token': state.tenants['casa-di-fratelli'].auth.token } }); assert.equal(r.status, 200); return r.json(); }
async function open(mobile, supported) {
 const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 }, isMobile: mobile, hasTouch: mobile });
 await context.addInitScript(supported => {
  delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
  if (supported) window.SpeechRecognition = class {
   start() { window.qaVoiceStarts = (window.qaVoiceStarts || 0) + 1; window.qaVoice = this; }
   stop() { this.onend?.(); }
   abort() { window.qaVoiceAborts = (window.qaVoiceAborts || 0) + 1; this.onend?.(); }
  };
 }, supported);
 const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
 await page.goto(state.origin + '/r/casa-di-fratelli/admin');
 await page.locator('input[type=email]').fill(state.tenants['casa-di-fratelli'].email); await page.locator('input[type=password]').fill(state.tenants['casa-di-fratelli'].password); await page.locator('button[type=submit]').click(); await page.getByText('Restaurant CRM', { exact: true }).waitFor();
 return { page, context };
}
try {
 const before = await api('/api/reservations');
 const { page, context } = await open(false, true);
 await page.getByRole('button', { name: /^Карта на резервациите/ }).click();
 const table = page.locator('.admin-map-table-node').filter({ hasText: /^23$/ }); await table.click();
 await page.getByRole('button', { name: 'Създай резервация', exact: true }).click();
 const form = page.getByRole('form', { name: 'Резервация', exact: true }); const voice = form.locator('[data-voice-reservation]'); await voice.locator('summary').click();
 assert.equal(await page.evaluate(() => window.qaVoiceStarts || 0), 0);
 await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
 assert.equal(await page.evaluate(() => window.qaVoice.lang), 'bg-BG');
 await page.evaluate(() => { window.qaVoice.onresult({ results: [[{ transcript: 'Иван Петров телефон 0898123456 утре в 19:30 шест души' }]] }); window.qaVoice.onend(); });
 await voice.getByRole('button', { name: 'Попълни формата', exact: true }).click();
 assert.equal(await form.getByLabel('Име', { exact: true }).inputValue(), 'Иван Петров'); assert.equal(await form.getByLabel('Телефон', { exact: true }).inputValue(), '0898123456'); assert.equal(await form.getByLabel('Гости', { exact: true }).inputValue(), '6'); assert.equal(await form.getByLabel('Час', { exact: true }).inputValue(), '19:30');
 assert.deepEqual(await api('/api/reservations'), before);
 await page.screenshot({ path: root + '/01-map-voice-review.png', fullPage: true });
 checks.push({ name: 'Map simulated BG speech populates correct fields only after review/apply; no booking is created', passed: true });
 await voice.getByRole('button', { name: 'Диктувай резервация', exact: true }).click();
 await page.getByRole('button', { name: 'Close reservation form', exact: true }).click(); assert.ok(await page.evaluate(() => window.qaVoiceAborts > 0));
 checks.push({ name: 'Closing form aborts active recognition', passed: true }); await context.close();
 const mobile = await open(true, false); const p = mobile.page;
 await p.getByRole('button', { name: /^Резервации/ }).first().click(); await p.getByRole('button', { name: 'Нова резервация', exact: true }).click();
 const list = p.locator('form').filter({ has: p.getByPlaceholder('Напр. 20, 21, 22', { exact: true }) }); const panel = list.locator('[data-voice-reservation]'); await panel.locator('summary').click();
 assert.equal(await panel.getByRole('button', { name: 'Диктувай резервация', exact: true }).isDisabled(), true);
 await panel.getByLabel('Разпознат текст', { exact: true }).fill('Имя Анна Иванова, телефон +359888123456, завтра в 20:00, четыре человека');
 await panel.getByRole('button', { name: 'Попълни формата', exact: true }).click();
 assert.equal(await list.locator('input:not([aria-label])').nth(0).inputValue(), 'Анна Иванова'); assert.equal(await list.locator('input:not([aria-label])').nth(1).inputValue(), '+359888123456'); assert.equal(await list.locator('input:not([aria-label])').nth(4).inputValue(), '4');
 assert.deepEqual(await api('/api/reservations'), before);
 assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
 await p.screenshot({ path: root + '/02-phone-fallback-filled.png', fullPage: true });
 checks.push({ name: '390px list form handles Russian transcript and unavailable recognition without saving or overflow', passed: true });
 await panel.getByLabel('Разпознат текст', { exact: true }).fill('Иван, телефон 123, утре в 25:90, 50 души');
 assert.equal(await panel.getByRole('button', { name: 'Попълни формата', exact: true }).isDisabled(), true);
 checks.push({ name: 'Invalid time/count cannot be applied', passed: true });
 await mobile.context.close(); assert.deepEqual(errors, []);
} catch (error) { checks.push({ name: 'Failure', passed: false, error: error.message }); process.exitCode = 1; }
finally { await browser.close(); const report = { passed: checks.every(c => c.passed), simulatedSpeechEvents: true, actualMicrophoneTested: false, localOnly: true, checks, errors }; await fs.writeFile(root + '/report.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); }
