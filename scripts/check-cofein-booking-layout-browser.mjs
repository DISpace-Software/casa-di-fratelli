// Read-only final visual/navigation regression after the booking layout polish.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [statePath, outputRoot, playwrightPath, chromiumPath] = process.argv.slice(2);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true); assert.equal(new URL(state.origin).hostname, '127.0.0.1');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const report = { localOnly: true, realBrowser: true, checks: [], metrics: [], errors: [], mutations: [] };
await fs.mkdir(outputRoot, { recursive: true });
const check = (name, condition = true) => { assert(condition, name); report.checks.push({ name, passed: true }); console.log('PASS ' + name); };
const frame = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
let page;
try {
  for (const size of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'phone390', width: 390, height: 844 }, { name: 'phone360', width: 360, height: 740 }, { name: 'landscape', width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.width < 600, hasTouch: size.width < 600, locale: 'bg-BG', timezoneId: 'Europe/Sofia' });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => report.errors.push(e.message)); page.on('request', r => { if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) report.mutations.push({ method: r.method(), path: new URL(r.url()).pathname }); });
    await page.goto(state.origin + '/cofein-preview.html#booking'); await page.locator('.cofein-booking[data-step=visit]').waitFor();
    await page.locator('dialog').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    const measure = async label => {
      const result = await page.evaluate(() => {
        const rect = selector => { const e = document.querySelector(selector); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.querySelector('.cofein-booking-body').scrollWidth,
          bodyClientWidth: document.querySelector('.cofein-booking-body').clientWidth, footer: rect('.cofein-booking-footer'), action: rect('.cofein-booking-footer .cofein-booking-primary'), map: rect('.cofein-map-viewport'), table: rect('[data-table-id=T13]'), email: rect('[name=email]') };
      });
      report.metrics.push({ label: size.name + '-' + label, ...result });
      check(`${size.name} ${label}: visible footer and no horizontal overflow`, result.documentWidth <= result.width && result.bodyWidth <= result.bodyClientWidth && result.action.left >= 0 && result.action.right <= result.width + 1 && result.action.top >= 0 && result.action.bottom <= result.height + 1);
      return result;
    };
    await measure('visit'); await page.screenshot({ path: path.join(outputRoot, size.name + '-01-visit.png'), animations: 'disabled' });
    const min = await page.locator('input[type=date]').getAttribute('min'); const date = new Date(min + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + 3);
    await page.locator('input[type=date]').fill(date.toISOString().slice(0, 10)); await page.locator('.cofein-booking-search select').first().selectOption('19:00');
    await page.getByRole('button', { name: 'Покажи масите', exact: true }).click(); await page.locator('.cofein-map-table-button:enabled').first().waitFor();
    await page.locator('.cofein-map-views').getByRole('button', { name: 'Външна · долна', exact: true }).click(); await page.locator('[data-table-id=T13]').click(); await frame(page);
    await measure('selected'); await page.screenshot({ path: path.join(outputRoot, size.name + '-02-selected.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Продължи', exact: true }).click(); await page.locator('.cofein-booking[data-step=contact]').waitFor(); await frame(page);
    check(`${size.name} contact: one selection summary, clean entry and heading focus`, await page.locator('.cofein-booking-visit-summary, .cofein-booking-feedback, .cofein-field-error').count() === 0 && await page.locator('.cofein-booking-selection').count() === 1 && await page.locator('#dialog-title').evaluate(e => e === document.activeElement));
    await measure('contact'); await page.screenshot({ path: path.join(outputRoot, size.name + '-03-contact.png'), animations: 'disabled' });
    await page.locator('[name=guestName]').fill('Локална чернова');
    await page.locator('.cofein-booking-selection').getByRole('button', { name: 'Промени', exact: true }).click(); await page.locator('.cofein-booking[data-step=table]').waitFor();
    await page.getByRole('button', { name: 'Продължи', exact: true }).click(); await page.locator('.cofein-booking[data-step=contact]').waitFor();
    check(`${size.name} contact: back/forward retains draft without validation or submission`, await page.locator('[name=guestName]').inputValue() === 'Локална чернова' && await page.locator('.cofein-field-error').count() === 0);
    await context.close();
  }
  // Fresh server policy must be recoverable with native controls, while keeping
  // the contact draft. This intercept changes a read response only.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'bg-BG', timezoneId: 'Europe/Sofia' });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.errors.push(e.message)); page.on('request', r => { if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) report.mutations.push({ method: r.method(), path: new URL(r.url()).pathname }); });
  await page.goto(state.origin + '/cofein-preview.html#booking'); await page.locator('.cofein-booking[data-step=visit]').waitFor();
  const min = await page.locator('input[type=date]').getAttribute('min'); const date = new Date(min + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + 3);
  await page.locator('input[type=date]').fill(date.toISOString().slice(0, 10)); await page.locator('.cofein-booking-search select').first().selectOption('19:00');
  await page.getByRole('button', { name: 'Покажи масите', exact: true }).click(); await page.locator('.cofein-map-table-button:enabled').first().waitFor();
  const views = page.locator('.cofein-map-views');
  await views.getByRole('button', { name: 'Външна · долна', exact: true }).click(); await page.locator('[data-table-id=T13]').click();
  check('Cross-hall check starts with selected T13', await page.getByRole('button', { name: 'Продължи', exact: true }).isEnabled());
  await views.getByRole('button', { name: 'Вътрешна · основна', exact: true }).click();
  check('Explicit cross-hall map switch clears prior selection and disables continuation', await page.getByRole('button', { name: 'Продължи', exact: true }).isDisabled() && await page.locator('[data-table-id][aria-pressed=true]').count() === 0);
  await views.getByRole('button', { name: 'Външна · долна', exact: true }).click(); await page.locator('[data-table-id=T13]').click();
  await page.getByRole('button', { name: 'Продължи', exact: true }).click(); await page.locator('.cofein-booking[data-step=contact]').waitFor();
  const draft = { guestName: 'Запазена чернова', phone: '0888123456', email: 'local-policy-test@example.com' };
  for (const [name, value] of Object.entries(draft)) await page.locator(`[name=${name}]`).fill(value);
  let policyResponses = 0;
  await page.route('**/api/v1/restaurants/cofein/floor-plan', async route => {
    const response = await route.fetch(); const plan = await response.json();
    policyResponses += 1; await route.fulfill({ response, json: { ...plan, publicMaxGuests: 1 } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.locator('.cofein-booking[data-step=visit]').waitFor();
  await page.getByText('Избраното посещение вече не е достъпно. Проверете датата, часа и броя гости.', { exact: true }).first().waitFor();
  const guests = page.locator('.cofein-booking-search select').nth(1);
  const options = await guests.locator('option').evaluateAll(items => items.filter(item => item.value !== '' && !item.disabled).map(item => item.value));
  check('Fresh maximum-guests policy returns contact to visit with visible error and only one valid guest option', policyResponses > 0 && JSON.stringify(options) === '["1"]');
  const policySelection = await guests.evaluate(element => ({ value: element.value, disabledOption: element.selectedOptions[0]?.disabled }));
  report.policySelection = policySelection;
  check('Unavailable party size remains explicit until the guest chooses a new value', policySelection.value === '2' && policySelection.disabledOption && await page.getByRole('button', { name: 'Покажи масите', exact: true }).isDisabled());
  // Native type-ahead works in macOS headless Chrome's select controls.
  // selectOption would emit change even for an already selected option and
  // could hide the original stale controlled-state bug.
  await guests.focus(); await guests.press('1'); await guests.press('Tab');
  check('Policy recovery permits native selection of one guest', await guests.inputValue() === '1' && await page.getByRole('button', { name: 'Покажи масите', exact: true }).isEnabled());
  await page.screenshot({ path: path.join(outputRoot, 'policy-change.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Покажи масите', exact: true }).click(); await page.locator('.cofein-map-table-button:enabled').first().waitFor();
  check('Policy refresh clears the old table selection', await page.getByRole('button', { name: 'Продължи', exact: true }).isDisabled());
  await views.getByRole('button', { name: 'Външна · долна', exact: true }).click(); await page.locator('[data-table-id=T13]').click();
  await page.getByRole('button', { name: 'Продължи', exact: true }).click(); await page.locator('.cofein-booking[data-step=contact]').waitFor();
  for (const [name, value] of Object.entries(draft)) assert.equal(await page.locator(`[name=${name}]`).inputValue(), value, `Policy recovery preserves ${name}`);
  check('Policy recovery preserves name, phone and email without POST or pending marker', report.mutations.length === 0 && await page.evaluate(() => sessionStorage.getItem('cofein:booking:pending:v1')) === null);
  await context.close();
  check('Final visual regression sends no mutation requests', report.mutations.length === 0);
  check('Final visual regression has no browser runtime errors', report.errors.length === 0); report.passed = true;
} catch (error) { report.passed = false; report.failure = error.message; process.exitCode = 1; await page?.screenshot({ path: path.join(outputRoot, 'layout-failure.png'), animations: 'disabled' }).catch(() => {}); }
finally { await browser.close(); await fs.writeFile(path.join(outputRoot, 'layout-report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure, outputRoot })); }
