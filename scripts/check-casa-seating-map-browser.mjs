// Usage: node scripts/check-casa-seating-map-browser.mjs <private-local-state.json> <output-directory> <playwright-index.mjs> <chromium-executable>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [statePath, output, playwrightPath, chromiumPath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const state=JSON.parse(await fs.readFile(statePath,'utf8'));
assert.equal(state.localOnly,true);assert.equal(new URL(state.apiUrl).hostname,'127.0.0.1');assert.equal(new URL(state.origin).hostname,'127.0.0.1');
const tenant='casa-di-fratelli', auth=state.tenants[tenant], checks=[], errors=[], created=[];
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const record=(name,details={})=>checks.push({name,passed:true,...details});
async function api(path,method='GET',body,authenticated=true){
 const r=await fetch(state.apiUrl+path,{method,headers:{'Content-Type':'application/json','X-Tenant-Id':tenant,...(authenticated?{'X-Admin-Token':auth.auth.token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text(); let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:r.status,data};
}
const browser=await chromium.launch({headless:true,executablePath:chromiumPath});
const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const shot=name=>page.screenshot({path:`${output}/${name}.png`,fullPage:true});
const mapTable=id=>page.locator('.admin-map-table-node').filter({hasText:new RegExp(`^${id}$`)});
const form=()=>page.getByRole('form',{name:'Резервация',exact:true});
const basePayload={guestName:'QA Local Casa 23',phone:'+359000000023',email:'',reservedDate:date,reservedTime:'19:00',guestCount:6,area:'indoor',tableIds:['23'],createdByAdmin:true,privacyConsent:true};
async function fillMap(name='QA Local Casa 23'){
 await form().getByLabel('Име',{exact:true}).fill(name);
 await form().getByLabel('Телефон',{exact:true}).fill(basePayload.phone);
 await form().getByLabel('Дата',{exact:true}).fill(date);
 await form().getByLabel('Час',{exact:true}).selectOption('19:00');
 await form().getByLabel('Гости',{exact:true}).fill('6');
}
try{
 await fs.mkdir(output,{recursive:true});
 const plan=(await api('/api/floor-plan')).data;
 const table23=plan.tables.find(t=>t.id==='23');assert.equal(table23.seats,4);basePayload.area=table23.area;
 await page.goto(`${state.origin}/r/casa-di-fratelli/admin`);
 await page.locator('input[type=email]').fill(auth.email);await page.locator('input[type=password]').fill(auth.password);await page.locator('button[type=submit]').click();
 await page.getByText('Restaurant CRM',{exact:true}).waitFor();
 await page.getByRole('button',{name:/^Карта на резервациите/}).click();
 await mapTable('23').click();await page.getByRole('button',{name:'Създай резервация',exact:true}).click();
 await fillMap();await shot('01-map-create-six-before-save');
 const createResponse=page.waitForResponse(r=>r.url().endsWith('/api/reservations')&&r.request().method()==='POST');
 await form().getByRole('button',{name:'Запази',exact:true}).click();
 const cr=await createResponse;assert.equal(cr.status(),200);const reservation=await cr.json();created.push(reservation.id);
 await form().waitFor({state:'hidden'});
 assert.equal((await api('/api/reservations')).data.find(r=>r.id===reservation.id).guestCount,6);
 await shot('02-map-created-six');record('Map creates six guests at nominal four-seat Casa table23 through real authenticated API',{status:200,id:reservation.id});
 await mapTable('23').focus();await mapTable('23').press('Enter');await page.getByRole('button',{name:'Създай резервация',exact:true}).click();await fillMap('QA Duplicate Casa 23');
 await form().getByRole('button',{name:'Запази',exact:true}).click();
 await form().getByRole('alert').waitFor();const conflictText=await form().getByRole('alert').innerText();assert.match(conflictText,/23.*заета/);assert.equal(await form().getByLabel('Име',{exact:true}).inputValue(),'QA Duplicate Casa 23');
 await shot('03-map-duplicate-visible-error');record('Map preflight duplicate shows specific table23 conflict and retains entered fields',{message:conflictText});
 await page.getByRole('button',{name:'Close reservation form',exact:true}).click();
 // Exercise edit using the same shared map dialog.
 await mapTable('23').focus();await mapTable('23').press('Enter');
 await page.getByRole('button',{name:/QA Local Casa 23/}).last().click();
 await page.getByRole('dialog',{name:'QA Local Casa 23',exact:true}).getByRole('button',{name:'Редактирай',exact:true}).click();
 await form().getByLabel('Гости',{exact:true}).fill('7');
 const editResponse=page.waitForResponse(r=>r.url().endsWith(`/api/reservations/${reservation.id}`)&&r.request().method()==='PATCH');
 await form().getByRole('button',{name:'Запази',exact:true}).click();assert.equal((await editResponse).status(),200);await form().waitFor({state:'hidden'});
 assert.equal((await api('/api/reservations')).data.find(r=>r.id===reservation.id).guestCount,7);
 record('Existing map edit retains staff capacity override for seven guests');

 // Move onto an undersized table, then select the exact Cyrillic custom-table pair.
 async function openMove(id) {
   await mapTable(id).focus(); await mapTable(id).press('Enter');
   await page.getByRole('button',{name:/QA Local Casa 23/}).last().click();
   await page.getByRole('dialog',{name:'QA Local Casa 23',exact:true}).getByRole('button',{name:'Премести',exact:true}).click();
 }
 async function saveMove(ids) {
   for(const id of ids) {assert.equal(await mapTable(id).isEnabled(),true); await mapTable(id).focus(); await mapTable(id).press('Enter');}
   const panel=page.getByRole('dialog',{name:'Премести резервация',exact:true});
   const response=page.waitForResponse(r=>r.url().endsWith(`/api/reservations/${reservation.id}/tables`)&&r.request().method()==='PATCH');
   await panel.getByRole('button',{name:'Запази',exact:true}).click(); assert.equal((await response).status(),200);
   await panel.waitFor({state:'hidden'});
   const row=(await api('/api/reservations')).data.find(r=>r.id===reservation.id);
   assert.deepEqual(new Set(row.tableIds),new Set(ids));assert.equal(row.guestCount,7);
 }
 await openMove('23'); await saveMove(['29']);
 record('Browser map move permits seven guests on nominal six-seat table29');
 await openMove('29'); await saveMove(['29','29а']);
 await shot('03-moved-custom-cyrillic-pair');
 record('Browser map selects and saves 29 + Cyrillic 29а without configured public combination');
 await page.reload();await page.getByText('Restaurant CRM',{exact:true}).waitFor();
 const persisted=(await api('/api/reservations')).data.find(r=>r.id===reservation.id);
 assert.deepEqual(new Set(persisted.tableIds),new Set(['29','29а']));assert.equal(persisted.guestCount,7);
 record('Edited guest count and custom combined seating survive reload');
 assert.deepEqual(errors,[]);record('No browser JavaScript errors');
}catch(e){checks.push({name:'Failure',passed:false,error:e.message,stack:e.stack?.split('\n').slice(0,4).join('\n')});await shot('failure').catch(()=>{});process.exitCode=1;}
finally{
 for(const id of created){const r=await api(`/api/reservations/${id}/cancel`,'PATCH');if(r.status!==200)checks.push({name:`Cleanup${id}`,passed:false,status:r.status});}
 await context.close();await browser.close();
 const report={localOnly:true,realBrowser:true,browser:'Chromium1243 via Playwright',passed:checks.every(c=>c.passed),checks,errors};await fs.writeFile(`${output}/browser-report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
