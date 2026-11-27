// Real Chromium interactions with the actual panel and an isolated HTTP fixture.
// Run: npm run test:waitlist-browser (install Chromium: npx playwright install chromium).
// Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = `${root}.local/waitlist-browser-test`;
await mkdir(fixture, { recursive: true });
await writeFile(`${fixture}/index.html`, '<div id="root"></div><script type="module" src="./main.jsx"></script>');
await writeFile(`${fixture}/main.jsx`, `import '../../src/index.css'; import React from 'react'; import {createRoot} from 'react-dom/client'; import Panel from '../../src/components/admin/WaitlistPanel.jsx'; import AdminPage from '../../src/apps/admin/AdminPage.jsx'; if (typeof AdminPage !== 'function') throw new Error('Admin page did not initialize'); const request=(url,options)=>fetch('/fixture'+new URL(url).pathname+new URL(url).search,options);createRoot(document.getElementById('root')).render(<main style={{background:"#121018",color:"white",padding:24,minHeight:"100vh"}}><Panel adminFetch={request} language="en"/></main>);`);
const server = await createServer({root, server:{host:'127.0.0.1',port:0}});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}: {})});
  const page = await browser.newPage();
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  const writes=[], reads=[];
  let failRead=true, failJoin=false;
  const state={settings:{enabled:true,offerMinutes:5},metrics:{requests:1,waiting:0,offered:1,booked:0,arrived:0},zones:[{id:'hall',name:'Hall',isActive:true}],entries:[{guestName:'Test Guest',email:'guest@example.invalid',phone:'000',notificationAttempts:5,entry:{id:'one',status:'offered',date:'2026-12-01',guests:2,area:'hall',times:['19:00'],offerTime:'19:00',tableIds:['T1'],expiresAtUtc:new Date(Date.now()+65*60000).toISOString()}}]};
  await page.route('**/fixture/**', async route=>{
    const req=route.request();
    if(req.method()==='GET') { reads.push(req.url()); await route.fulfill(failRead ? {status:503,json:{}} : {json:{...state,serverTimeUtc:new Date(Date.now()+60*60000).toISOString()}}); return; }
    const body=req.postDataJSON(); writes.push({url:req.url(),body});
    if(req.url().endsWith('/settings')) state.settings=body;
    else if(req.url().endsWith('/cancel')) state.entries[0].entry.status='cancelled';
    else if(failJoin) {await route.fulfill({status:400,json:{code:'VERIFIED_PROFILE_REQUIRED'}}); return;}
    await route.fulfill({json:{ok:true}});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/.local/waitlist-browser-test/index.html`);
  await page.locator('summary').first().click();
  await page.getByRole('alert').waitFor();
  failRead=false; await page.getByRole('button',{name:'Retry'}).click();
  await page.getByRole('button',{name:'Pause offers'}).waitFor();
  assert.match(await page.locator('article').innerText(), /[45]:[0-5]\d/);
  assert.doesNotMatch(await page.locator('article').innerText(), /64:|65:/);
  assert.match(await page.locator('article').innerText(), /retry limit reached/);
  console.log('PASS initial fetch error/retry; server-clock countdown; exhausted email retries');
  await page.getByLabel('Minutes to confirm').fill('2');
  assert.equal(await page.getByRole('button',{name:'Save duration'}).isDisabled(),true);
  await page.getByRole('button',{name:'Pause offers'}).click();
  await page.getByRole('button',{name:'Enable offers'}).waitFor();
  assert.deepEqual(writes.at(-1).body,{enabled:false,offerMinutes:5});
  await page.getByLabel('Minutes to confirm').fill('7');
  await page.getByRole('button',{name:'Save duration'}).click();
  await page.waitForFunction(()=>document.querySelector('input[type=number]').value==='7');
  assert.deepEqual(writes.at(-1).body,{enabled:false,offerMinutes:7});
  await page.getByLabel('Minutes to confirm').fill('3.5');
  assert.equal(await page.getByRole('button',{name:'Save duration'}).isDisabled(),true);
  console.log('PASS pause ignores unsaved duration; valid save; fractional duration disabled');
  await page.getByLabel('Date',{exact:true}).first().fill('2026-12-01');
  await page.waitForResponse(r=>r.url().includes('?date=2026-12-01'));
  assert.match(reads.at(-1),/date=2026-12-01/);
  await page.getByText('Add a guest request',{exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill('guest@example.invalid');
  await page.getByLabel('Date',{exact:true}).last().fill('2026-12-01');
  await page.getByLabel('Time',{exact:true}).fill('19:15');
  await page.getByLabel('Zone').selectOption('hall');
  await page.getByLabel('Requested by the guest').check();
  failJoin=true; await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button',{name:'Retry'}).click();
  await page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/fixture/'));
  assert.equal(await page.getByRole('alert').count(),1, 'Successful reload must not hide failed mutation');
  failJoin=false; await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('input[type=email]').value==='');
  assert.deepEqual(writes.at(-1).body,{email:'guest@example.invalid',guestRequested:true,request:{date:'2026-12-01',guests:2,area:'hall',times:['19:15']}});
  console.log('PASS date filter; failed add retained after refresh; successful staff request payload');
  await page.getByRole('button',{name:'Close request'}).click();
  await page.getByLabel('Reason — recorded in the audit log').fill('Guest requested cancellation');
  await page.getByRole('button',{name:'Confirm closure'}).click();
  await page.getByText('Cancelled',{exact:true}).waitFor();
  assert.deepEqual(writes.at(-1).body,{reason:'Guest requested cancellation'});
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/seatmap-waitlist-admin-browser.png',fullPage:true});
  console.log('PASS audited cancellation rendered; no browser runtime errors');
} finally { await browser?.close(); await server.close(); await rm(fixture,{recursive:true,force:true}); }
