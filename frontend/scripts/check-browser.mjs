import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../..');
const dir=mkdtempSync('/tmp/annsafe-browser-');
const env={...process.env,NODE_ENV:'development',DEMO_MODE:'true',ALLOW_DEMO_RESET:'true',DATABASE_URL:`file:${dir}/browser.db`,PORT:'4400',CORS_ORIGINS:'http://127.0.0.1:3300'};
for (const args of [['node_modules/prisma/build/index.js','migrate','deploy'],['dist/seed.js']]) {
 const r=spawnSync(process.execPath,args,{cwd:`${root}/backend`,env,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);
}
const backend=spawn(process.execPath,['dist/app.js'],{cwd:`${root}/backend`,env,stdio:'ignore'});
const frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3300','--strictPort'],{cwd:`${root}/frontend`,env:{...process.env,API_PROXY_TARGET:'http://127.0.0.1:4400'},stdio:'ignore'});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:3300/api/auth/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || (existsSync('/usr/bin/brave-origin') ? '/usr/bin/brave-origin' : undefined),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3300');
 await page.locator('.product-header').waitFor();
 await page.getByRole('button',{name:'Donate food',exact:true}).click();
 await page.locator('summary').filter({hasText:'Quick fill from kitchen notes'}).click();
 await page.getByRole('textbox',{name:'Kitchen notes'}).fill('50 kg of fresh vegetables safe in 45 minutes');
 const parsedResponse=page.waitForResponse(r=>r.url().endsWith('/api/ai/parse-donation') && r.request().method()==='POST');
 await page.getByRole('button',{name:'Fill in donation details',exact:true}).click();
 const parsed=await (await parsedResponse).json();
 await page.getByText(/weight is not converted automatically/).waitFor();
 assert.equal(await page.getByRole('spinbutton',{name:'Quantity in meals'}).inputValue(),'0');
 const selectedHours=Number(await page.getByLabel('Safe deadline',{exact:true}).inputValue());
 assert(selectedHours <= (Date.parse(parsed.safeDeadline)-Date.now())/3600000 + 0.002);
 console.log('PASS intake preserves extracted deadline and requires meal count for weight units');
 await page.reload();
 const users=await (await fetch('http://127.0.0.1:4400/api/auth/users')).json();
 const donor=users.find(u=>u.role==='DONOR');
 const created=await fetch('http://127.0.0.1:4400/api/donations',{method:'POST',headers:{'Content-Type':'application/json','x-user-id':donor.id},body:JSON.stringify({foodCategory:'COOKED_MEALS',foodDescription:'Fresh vegetable rice and lentils',quantity:70,safeDeadline:new Date(Date.now()+3*3600000).toISOString()})});
 assert.equal(created.status,201);const result=await created.json();
 const allocations=result.donation.allocations;
 for(const a of allocations){const receiver=users.find(u=>u.id===a.receiver.userId);assert(receiver);await fetch(`http://127.0.0.1:4400/api/allocations/${a.id}/accept`,{method:'POST',headers:{'x-user-id':receiver.id}});const selected=await fetch(`http://127.0.0.1:4400/api/allocations/${a.id}/fulfillment`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':receiver.id},body:JSON.stringify({deliveryMode:'PLATFORM_DRIVER'})});assert.equal(selected.status,201);}
 const driver=users.find(u=>u.role==='DRIVER');
 const deliveries=await (await fetch('http://127.0.0.1:4400/api/drivers/available-jobs',{headers:{'x-user-id':driver.id}})).json();
 const claimed=await fetch(`http://127.0.0.1:4400/api/deliveries/${deliveries[0].deliveryId}/claim`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':driver.id},body:'{}'});
 assert.equal(claimed.status,200);
 await page.reload();
 mkdirSync(`${root}/docs/validation`,{recursive:true});
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  for(const [role,label] of [['DONOR','Donate food'],['RECEIVER','Receive food'],['DRIVER','Deliver'],['ADMIN','Operations & impact']]){
   await page.getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(800);
   await page.waitForFunction(() => document.querySelector('.connection-indicator i')?.classList.contains('connected'));
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
   if (overflow) console.error(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({tag:e.tagName, classes:e.className, width:e.getBoundingClientRect().width,text:e.textContent?.slice(0,60)})).slice(0,15)));
   assert.equal(overflow,false,`${role} horizontal overflow at ${width}`);
   await page.screenshot({path:`${root}/docs/validation/${role.toLowerCase()}-${width}.png`,fullPage:true});
   console.log(`PASS ${role} at ${width}px`);
  }
 }
 // Exercise coordinator-owned logistics in the actual browser.
 const first=allocations[0];const owner=users.find(u=>u.id===first.receiver.userId);
 const receiverAllocations=await (await fetch('http://127.0.0.1:4400/api/receivers/my/allocations',{headers:{'x-user-id':owner.id}})).json();
 const delivery=receiverAllocations.find(a=>a.id===first.id).delivery;
 const switched=await fetch(`http://127.0.0.1:4400/api/deliveries/${delivery.id}/switch-mode`,{method:'POST',headers:{'Content-Type':'application/json','x-user-id':owner.id},body:JSON.stringify({newMode:'RECEIVER_LOGISTICS',driverName:'Community volunteer'})});
 assert.equal(switched.status,200);
 await page.setViewportSize({width:390,height:1000});
 await page.getByRole('button',{name:'Receive food',exact:true}).click();
 await page.getByText('Coordinate your pickup',{exact:true}).waitFor();
 await page.screenshot({path:`${root}/docs/validation/receiver-own-logistics-390.png`,fullPage:true});
 const pickup=await (await fetch(`http://127.0.0.1:4400/api/donations/deliveries/${delivery.id}/pickup-otp`,{headers:{'x-user-id':donor.id}})).json();
 await page.getByRole('textbox',{name:'Donor pickup verification code'}).fill(pickup.pickupOtp);
 await page.getByRole('button',{name:'Verify pickup',exact:true}).click();
 await page.getByRole('button',{name:'Confirm receipt',exact:true}).waitFor();
 const receipt=await (await fetch(`http://127.0.0.1:4400/api/receivers/deliveries/${delivery.id}/delivery-otp`,{headers:{'x-user-id':owner.id}})).json();
 await page.getByRole('textbox',{name:'Delivery verification code'}).fill(receipt.deliveryOtp);
 await page.getByRole('button',{name:'Confirm receipt',exact:true}).click();
 await page.getByText('COMPLETED',{exact:true}).first().waitFor();
 console.log('PASS receiver coordinator pickup and receipt in mobile browser');
 assert.deepEqual(errors,[]);console.log(`Browser verification passed. Database: ${dir}`);
}finally{await browser?.close();frontend.kill('SIGTERM');backend.kill('SIGTERM');}
