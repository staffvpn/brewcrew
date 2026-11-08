// End-to-end stake recovery with two actual game clients and real local D1 handlers.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const{database,initData}=require('../tests/helpers/d1.cjs');
(async()=>{
const f=database(),errors=[],originalFetch=global.fetch;
f.sql.exec("INSERT INTO players(tg_id,franchises,cafe,money,level,created_at) VALUES(24680,0,'Вторая',120000,8,2)");
global.fetch=async url=>{assert.ok(String(url).startsWith('https://api.telegram.org/botlocal-test-token/'));return{json:async()=>({ok:true,result:{username:'local_test_bot'}})};};
const handlers={};for(const name of ['track','market','ack','duel'])handlers[name]=(await import('../functions/api/'+name+'.js')).onRequestPost;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});let loseNew=true,loseAccept=true;
try{
 async function client(uid){
  const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{requestAnimationFrame=()=>0;});
  await p.route('https://telegram.org/**',r=>r.fulfill({body:'window.Telegram={WebApp:{initData:'+JSON.stringify(initData(uid))+',initDataUnsafe:{user:{id:'+uid+'}},isVersionAtLeast:()=>false,ready(){},expand(){}}};'}));
  await p.route('**/api/**',async r=>{
   const name=new URL(r.request().url()).pathname.split('/').pop(),handler=handlers[name];if(!handler)return r.fulfill({contentType:'application/json',body:'{"ok":false}'});
   const raw=r.request().postData(),body=raw?JSON.parse(raw):{};
   const response=await handler({env:f.env,request:new Request('https://test.invalid/api/'+name,{method:'POST',body:raw}),waitUntil:p=>p.catch(()=>{})});
   if(name==='duel'&&body.op==='new'&&loseNew&&response.status===200){loseNew=false;return r.abort('failed');}
   if(name==='duel'&&body.op==='accept'&&loseAccept&&response.status===200){loseAccept=false;return r.abort('failed');}
   return r.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
  });
  await p.goto(process.env.BALANCE_BASE_URL||'http://127.0.0.1:8767');await p.evaluate(()=>document.querySelector('#boot')?.remove());
  await p.getByText('Мне есть 18',{exact:true}).click();await p.getByText('Дальше: обставить зал',{exact:true}).click();await p.getByText('Открыть двери',{exact:true}).click();
  await p.evaluate(()=>track(true,true));return p;
 }
 const a=await client(12345),b=await client(24680),pid=(24680*3+7).toString(36);
 const start=await a.evaluate(pid=>duelTransact({op:'new',pid,stake:10000,rematch:0}),pid);assert.equal(start.ok,false);
 await a.waitForFunction(()=>S.marketVersion===1);assert.equal(await a.evaluate(()=>S.money),110000);
 const row=f.sql.prepare('SELECT * FROM duel').get();assert.equal(f.sql.prepare('SELECT money FROM players WHERE tg_id=12345').get().money,110000);
 await a.reload();await a.waitForFunction(()=>S&&S.marketVersion===1);await a.evaluate(()=>duelLoad(true));
 assert.equal(await a.evaluate(()=>DUEL.data.playing[0].id),row.id);
 const{makeGuests}=await import('../functions/_duel.js');const ans=makeGuests(row.seed).map(g=>g.items),ms=ans.map(x=>x.length*2000);
 assert.equal((await a.evaluate(x=>duelApi({op:'submit',...x}),{id:row.id,ans,ms})).ok,true);
 const accepted=await b.evaluate(id=>duelTransact({op:'accept',id}),row.id);assert.equal(accepted.ok,false);
 await b.waitForFunction(()=>S.marketVersion===1);assert.equal(await b.evaluate(()=>S.money),110000);
 await b.reload();await b.waitForFunction(()=>S&&S.marketVersion===1);await b.evaluate(()=>duelLoad(true));assert.equal(await b.evaluate(()=>DUEL.data.playing[0].role),'b');
 const finish={op:'submit',id:row.id,ans:[[],[],[],[],[]],ms:[3000,6000,6000,6000,9000]};
 assert.equal((await b.evaluate(x=>duelApi(x),finish)).ok,true);assert.equal((await b.evaluate(x=>duelApi(x),finish)).ok,false);
 await a.evaluate(()=>track(true,true));assert.equal(await a.evaluate(()=>S.money),128000);await a.evaluate(()=>track(true,true));assert.equal(await a.evaluate(()=>S.money),128000);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM admin_ops WHERE op='duelpay'").get().n,1);
 assert.equal(await b.evaluate(()=>S.money),110000);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({lostCreationRecovered:true,lostAcceptanceRecovered:true,roundsResumable:true,winnerBalance:128000,opponentBalance:110000,payoutExactlyOnce:true,errors},null,2));
}finally{global.fetch=originalFetch;await browser.close();f.sql.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
