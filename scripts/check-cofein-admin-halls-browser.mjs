// Read-only Chromium regression against a disposable local fixture.
// Args: private state, evidence directory, Playwright module, Chromium executable.
// Inactive furniture and cross-part reservations are GET-only browser mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [statePath, dir, playwrightPath, chromiumPath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(state.localOnly, true);
for (const value of [state.apiUrl, state.origin]) assert.equal(new URL(value).hostname, '127.0.0.1');
await fs.mkdir(dir, { recursive: true });
const report={localOnly:true,realBrowser:true,simulatedCases:['Arrived cross-part reservation with a configured cross-part target pair','Inactive hall and table'],checks:[],errors:[],screenshots:[],writes:[]};
const check=(name,value=true)=>{assert(value,name); report.checks.push(name);console.log('PASS',name)};
const api=async(route,tenant='cofein')=>{const response=await fetch(state.apiUrl+route,{headers:{'X-Tenant-Id':tenant,'X-Admin-Token':state.tenants[tenant].auth.token}}); assert(response.ok); return response.json()};
const plans=Object.fromEntries(await Promise.all(['cofein','casa-di-fratelli'].map(async t=>[t,await api('/api/floor-plan',t)])));
const browser=await chromium.launch({headless:true,executablePath:chromiumPath});
async function page(size={width:1440,height:1000},tenant='cofein',setup){
const p=await browser.newPage({viewport:size,locale:'bg-BG',timezoneId:'Europe/Sofia',reducedMotion:'reduce'});p.setDefaultTimeout(8000);p.on('pageerror',e=>report.errors.push(e.message));p.on('request',r=>{if(r.method()!=='GET'&&/floor-plan|reservations(?:[/?]|$)/.test(r.url()))report.writes.push({method:r.method(),url:r.url()})});
if (setup) await setup(p);
await p.goto(state.origin+'/r/'+tenant+'/admin');await p.locator('input[type=email]').fill(state.tenants[tenant].email);await p.locator('input[type=password]').fill(state.tenants[tenant].password);await p.locator('button[type=submit]').click();await p.getByText('Restaurant CRM',{exact:true}).waitFor();return p;}
const screenshot=async(p,name)=>{await p.screenshot({path:dir+'/'+name+'.png',animations:'disabled'});report.screenshots.push(name+'.png')};
try{
for(const size of [{width:1440,height:1000},{width:390,height:844}]){
 const p=await page(size);await p.getByRole('button',{name:/^Карта на резервациите/}).first().click();await p.locator('[data-admin-map-zone]').waitFor();
 check(`${size.width}: one hall navigator with no global all-plan choice`,await p.locator('.cofein-admin-halls').count()===1 && await p.getByRole('button',{name:'Цялата карта',exact:true}).count()===0);
 const allIds=[];
 for(const hall of ['Интериор','Екстериор']){
 await p.locator('.cofein-admin-hall-buttons').getByRole('button',{name:hall,exact:true}).click();
 const partIds=await p.locator('[data-admin-map-part]').evaluateAll(ns=>ns.map(n=>n.dataset.adminMapPart));check(`${size.width}: ${hall} has two own parts`,partIds.length===2);
 for(const partId of partIds){
 await p.locator(`[data-admin-map-part="${partId}"]`).click();await p.waitForTimeout(100);
 const hallId=await p.locator('[data-admin-map-zone]').getAttribute('data-admin-map-zone');
 const labels=await p.locator('.cofein-map-table-button').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label')));
 const ids=labels.map(s=>s.match(/\b(?:T\d+|F\d+)\b/)[0]);allIds.push(...ids);
 check(`${size.width}: ${partId} contains only selected hall tables`,ids.length>0 && ids.every(id=>plans.cofein.tables.find(t=>t.id===id)?.area===hallId));
 const layout=await p.evaluate(()=>{const v=document.querySelector('.admin-unified-map-viewport').getBoundingClientRect(); const ns=[...document.querySelectorAll('.cofein-map-table-button')].map(n=>{const r=n.getBoundingClientRect();return r.x>=v.x-1&&r.y>=v.y-1&&r.right<=v.right+1&&r.bottom<=v.bottom+1});return {fit:ns.every(Boolean),overflow:document.documentElement.scrollWidth>innerWidth,mapHeight:v.height}});
 check(`${size.width}: ${partId} fits every table and has no page overflow`,layout.fit&&!layout.overflow);if(partId==='exterior-lower')await screenshot(p,`admin-${size.width}-street`);
 }
 }
 check(`${size.width}: all original active tables reachable exactly once`,new Set(allIds).size===plans.cofein.tables.filter(t=>t.isActive!==false).length && allIds.length===new Set(allIds).size);
 await p.locator('.cofein-map-table-button').filter({hasText:'T13'}).click();await p.getByRole('button',{name:'Създай резервация',exact:true}).click();
 check(`${size.width}: table opens existing reservation form`,await p.getByRole('textbox',{name:'Име',exact:true}).isVisible());
 await screenshot(p,`admin-${size.width}-create`);await p.getByRole('button',{name:'Close map window',exact:true}).last().click();
 await screenshot(p,`admin-${size.width}-after-form-close`); if(await p.getByRole('button',{name:'Затвори цял екран',exact:true}).isVisible())await p.getByRole('button',{name:'Затвори цял екран',exact:true}).click();
 await p.getByRole('button',{name:/^Карта\s*Контрол$/i}).click();await p.locator('.cofein-admin-halls').waitFor();
 check(`${size.width}: editor keeps one hall navigator and whole-plan overview`,await p.locator('.cofein-admin-halls').count()===1 && await p.getByRole('button',{name:'Общ план',exact:true}).isVisible() && await p.getByText('Изглед на оперативната карта',{exact:true}).count()===0);
 await p.locator('.cofein-admin-hall-buttons').getByRole('button',{name:'Екстериор',exact:true}).click();await p.locator('[data-admin-map-part=exterior-lower]').click();
 await p.locator('[data-table-id=T13]').click();await screenshot(p,`editor-${size.width}-street`);
 await p.getByRole('button',{name:'Общ план',exact:true}).click();check(`${size.width}: editor overview retains full scene`,await p.locator('[data-table-id]').count()===plans.cofein.tables.length);
 await p.close();
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date());
const group = { id: 987654321, guestName: 'QA cross-part group', phone: '0890000000', email: 'local-hall-check@example.test', guestCount: 8, area: 'exterior', reservedDate: today, reservedTime: '12:00', tableIds: ['T01', 'T08'], status: 'Approved', isArrived: true, isNoShow: false, internalNote: '', createdAt: new Date().toISOString() };
const groupPage = await page({ width: 1440, height: 1000 }, 'cofein', async p => {
 await p.route('**/api/floor-plan', async route => {
   assert.equal(route.request().method(), 'GET');
   const response = await route.fetch(); const plan = await response.json();
   // Exercise the existing configured-pair rule without changing the real plan.
   await route.fulfill({ response, json: { ...plan, combinations: [...plan.combinations, ['T13', 'T02']] } });
 });
 await p.route('**/api/reservations', async route => {
   assert.equal(route.request().method(), 'GET');
   const response = await route.fetch(); const rows = await response.json();
   await route.fulfill({ response, json: [...rows, group] });
 });
});
await groupPage.getByRole('button', { name: /^Карта на резервациите/ }).first().click();
await groupPage.locator('.cofein-admin-hall-buttons').getByRole('button', { name: 'Екстериор', exact: true }).click();
await groupPage.locator('[data-admin-map-part=exterior-lower]').click();
const marker = groupPage.locator('.admin-reservation-guest-marker').filter({ hasText: group.guestName });
await marker.waitFor();
const markerFits = await marker.evaluate(e => { const r = e.getBoundingClientRect(); const v = document.querySelector('.admin-unified-map-viewport').getBoundingClientRect(); return r.x >= v.x && r.right <= v.right && r.y >= v.y && r.bottom <= v.bottom; });
check('Arrived cross-part group marker is visible in street part', markerFits);
await marker.click();
check('Opening cross-part group keeps street part and original table IDs', await groupPage.locator('[data-admin-map-view]').getAttribute('data-admin-map-view') === 'exterior-lower' && (await groupPage.locator('.admin-map-overlay-panel').innerText()).includes('T01, T08'));
await screenshot(groupPage, 'cross-part-arrived-actions');
await groupPage.getByRole('dialog', { name: group.guestName, exact: true }).getByRole('button', { name: 'Премести', exact: true }).click();
check('Starting move keeps the selected street part', await groupPage.locator('[data-admin-map-view]').getAttribute('data-admin-map-view') === 'exterior-lower');
await groupPage.locator('.cofein-map-table-button').filter({ hasText: 'T13' }).click();
await groupPage.locator('[data-admin-map-part=exterior-upper]').click();
await groupPage.locator('.cofein-map-table-button').filter({ hasText: 'T02' }).click();
check('Move selection survives switching between parts', (await groupPage.locator('.cofein-admin-hall-selection').innerText()).includes('T13, T02'));
await groupPage.locator('.admin-map-overlay-floating input[type=number]').fill('40');
check('Staff can retain two tables across parts and set 40 guests', await groupPage.locator('.admin-map-overlay-floating input[type=number]').inputValue() === '40' && await groupPage.locator('.admin-map-overlay-floating').getByRole('button', { name: 'Запази', exact: true }).isEnabled());
const visiblySelectedIds = await groupPage.locator('.cofein-map-table-button svg[data-status=selected]').evaluateAll(nodes => nodes.map(node => node.closest('button').getAttribute('aria-label').match(/\b(?:T\d+|F\d+)\b/)[0]).sort());
assert.deepEqual(visiblySelectedIds, ['T02']);
check('Gold selected-table visuals match the visible move draft only; candidates are not selected');
await screenshot(groupPage, 'cross-part-move-draft');
await groupPage.locator('.cofein-admin-hall-buttons').getByRole('button', { name: 'Интериор', exact: true }).click();
check('Changing actual destination hall clears the previous move table selection', await groupPage.locator('.cofein-admin-hall-selection').count() === 0);
await groupPage.close();
const inactivePlan = structuredClone(plans.cofein);
inactivePlan.zones.find(z => z.id === 'exterior').isActive = false;
inactivePlan.tables.find(t => t.id === 'T13').isActive = false;
const inactivePage = await page({ width: 1440, height: 1000 }, 'cofein', async p => {
 await p.route('**/api/floor-plan', async route => { assert.equal(route.request().method(), 'GET'); const response = await route.fetch(); await route.fulfill({ response, json: inactivePlan }); });
});
await inactivePage.getByRole('button', { name: /^Карта\s*Контрол$/i }).click();
await inactivePage.locator('.cofein-admin-hall-buttons').getByRole('button', { name: 'Екстериор', exact: true }).click();
await inactivePage.locator('[data-admin-map-part=exterior-lower]').click();
await inactivePage.locator('[data-table-id=T13]').click();
check('Editor keeps inactive hall and inactive table accessible', await inactivePage.locator('[data-table-id=T13]').isVisible() && await inactivePage.getByLabel('Активна', { exact: true }).isChecked() === false);
await screenshot(inactivePage, 'editor-inactive-hall-table');
await inactivePage.close();
for(const tenant of Object.keys(plans))assert.deepEqual(await api('/api/floor-plan',tenant),plans[tenant]);check('Both complete floor plan documents unchanged');check('No floor-plan or reservation writes from navigation',report.writes.length===0);check('No browser runtime errors',report.errors.length===0);
}catch(error){report.failure=error.stack;throw error}finally{await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));await browser.close()}
