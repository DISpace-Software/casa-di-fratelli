// Usage: node scripts/check-casa-seating-picker-browser.mjs <private-local-state.json> <output-directory> <playwright-index.mjs> <chromium-executable>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [statePath, output, playwrightPath, chromiumPath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const state=JSON.parse(await fs.readFile(statePath,'utf8'));assert.equal(state.localOnly,true);assert.equal(new URL(state.apiUrl).hostname,'127.0.0.1');assert.equal(new URL(state.origin).hostname,'127.0.0.1');
const browser=await chromium.launch({headless:true,executablePath:chromiumPath});
const contexts=[],checks=[],errors=[];let page,bookingId;
const record=(name,details={})=>checks.push({name,passed:true,...details});
async function api(path,method='GET',body){const r=await fetch(state.apiUrl+path,{method,headers:{'Content-Type':'application/json','X-Tenant-Id':'casa-di-fratelli','X-Admin-Token':state.tenants['casa-di-fratelli'].auth.token},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,`${method} ${path}:${r.status}`);return r.status===204?null:r.json();}
async function open(tenant='casa-di-fratelli',mobile=false){const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});contexts.push(context);const p=await context.newPage();page=p;p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(`${state.origin}/r/${tenant}/admin`);await p.locator('input[type=email]').fill(state.tenants[tenant].email);await p.locator('input[type=password]').fill(state.tenants[tenant].password);await p.locator('button[type=submit]').click();await p.getByText('Restaurant CRM',{exact:true}).waitFor();return p;}
async function list(p){await p.getByRole('button',{name:/^Резервации/}).first().click();}
async function form(p){await p.getByRole('button',{name:'Нова резервация',exact:true}).click();return p.locator('form').filter({has:p.getByPlaceholder('Напр. 20, 21, 22',{exact:true})});}
async function fill(f){const inputs=f.locator('input');await inputs.nth(0).fill('QA PARITY PICKER');await inputs.nth(1).fill('+359000000023');await inputs.nth(3).fill(new Date(Date.now()+2*86400000).toISOString().slice(0,10));await f.locator('select').selectOption('19:00');await inputs.nth(4).fill('6');}
async function shot(p,name){await p.screenshot({path:`${output}/${name}.png`,fullPage:true});}
async function noOverflow(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));}
try{
 await fs.mkdir(output,{recursive:true});
 const p=await open();await list(p);const f=await form(p);await fill(f);
 const chip=f.getByRole('button',{name:'23',exact:true});assert.equal(await chip.isEnabled(),true);await chip.click();assert.equal(await p.getByPlaceholder('Напр. 20, 21, 22',{exact:true}).inputValue(),'23');
 await shot(p,'01-list-six-at-four-seat-chip');
 const creating=p.waitForResponse(r=>r.url().endsWith('/api/reservations')&&r.request().method()==='POST');await f.getByRole('button',{name:'Създай резервация',exact:true}).click();const response=await creating;assert.equal(response.status(),200);bookingId=(await response.json()).id;await f.waitFor({state:'hidden'});
 record('List picker selects four-seat Casa23 for six guests and creates booking through API200');
 await p.getByRole('button',{name:/^QA PARITY PICKER/}).filter({visible:true}).click();
 const details=p.locator('tr').filter({has:p.getByRole('button',{name:'Запази масите',exact:true})});
 await details.getByLabel('Гости',{exact:true}).fill('7');const editChip=details.getByRole('button',{name:'23',exact:true});assert.equal(await editChip.isEnabled(),true);await editChip.click();assert.equal(await editChip.isEnabled(),true);await editChip.click();
 const saving=p.waitForResponse(r=>r.url().endsWith(`/api/reservations/${bookingId}/tables`)&&r.request().method()==='PATCH');await details.getByRole('button',{name:'Запази масите',exact:true}).click();assert.equal((await saving).status(),200);
 assert.equal((await api('/api/reservations')).find(r=>r.id===bookingId).guestCount,7);await shot(p,'02-list-edit-seven-saved');
 await p.reload();await p.getByText('Restaurant CRM',{exact:true}).waitFor();await list(p);await p.getByRole('button',{name:/^QA PARITY PICKER/}).filter({visible:true}).click();
 const reloaded=p.locator('tr').filter({has:p.getByRole('button',{name:'Запази масите',exact:true})});assert.equal(await reloaded.getByLabel('Гости',{exact:true}).inputValue(),'7');record('Full list edit can deselect/reselect nominally undersized table; seven guests persist after reload');
 const casa=await open('casa-di-fratelli',true);await noOverflow(casa);const shell=await casa.locator('.admin-hero-panel').evaluate(e=>({className:e.className,buttons:[...e.querySelectorAll('button')].map(b=>b.textContent.trim())}));await shot(casa,'03-casa-phone-dashboard');await list(casa);await casa.getByRole('button',{name:/^QA PARITY PICKER/}).filter({visible:true}).click();const article=casa.locator('article').filter({has:casa.getByRole('button',{name:'Запази масите',exact:true})});assert.equal(await article.getByLabel('Гости',{exact:true}).inputValue(),'7');assert.equal(await article.getByRole('button',{name:'23',exact:true}).isEnabled(),true);await noOverflow(casa);await shot(casa,'04-casa-phone-list-edit');record('Phone Casa list editor keeps seven guests and enabled table23 within390px');
 const cofein=await open('cofein',true);await noOverflow(cofein);const cfShell=await cofein.locator('.admin-hero-panel').evaluate(e=>({className:e.className,buttons:[...e.querySelectorAll('button')].map(b=>b.textContent.trim())}));assert.deepEqual(cfShell,shell);await shot(cofein,'05-cofein-phone-dashboard');await list(cofein);const cfForm=await form(cofein);await fill(cfForm);await cfForm.getByRole('button',{name:/Екстериор/}).click();const t01=cfForm.getByRole('button',{name:'T01',exact:true});assert.equal(await t01.isEnabled(),true);await t01.tap();assert.equal(await cfForm.getByRole('button',{name:'T02',exact:true}).isEnabled(),false);await noOverflow(cofein);await shot(cofein,'06-cofein-phone-configured-picker');record('Phone Cofein shares original admin shell; staff may override capacity for one table but unconfigured second table stays disabled');
 assert.deepEqual(errors,[]);record('No browser JavaScript errors');
}catch(e){checks.push({name:'Failure',passed:false,error:e.message,stack:e.stack?.split('\n').slice(0,4).join('\n')});if(page)await shot(page,'failure').catch(()=>{});process.exitCode=1;}
finally{if(bookingId)await api(`/api/reservations/${bookingId}/cancel`,'PATCH');for(const c of contexts)await c.close();await browser.close();const report={passed:checks.every(c=>c.passed),localOnly:true,realBrowser:true,browser:'Chromium1243 via Playwright',checks,errors};await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
