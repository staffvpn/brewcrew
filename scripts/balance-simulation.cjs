// Runs the actual game in isolated seeded browser saves; production API calls are stubbed.
// See docs/balance-v2.md for scenarios, commands and limitations.
const {chromium}=require('playwright');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{
  requestAnimationFrame=()=>0;
  window.__simNow=Date.UTC(2026,10,8,12);const NativeDate=Date;
  window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__simNow]));}static now(){return window.__simNow;}};
  let seed=42;Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
 });
 await page.route('https://telegram.org/**',r=>r.fulfill({body:''}));
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":false}'}));
 const config={days:Number(process.env.BALANCE_DAYS)||60,seeds:Number(process.env.BALANCE_SEEDS)||5,strategies:process.env.BALANCE_STRATEGIES?process.env.BALANCE_STRATEGIES.split(','):['idle','early_team','demand_hiring'],active:process.env.BALANCE_ACTIVE==='1',events:process.env.BALANCE_EVENTS==='1',bonuses:process.env.BALANCE_BONUSES==='1',hours:process.env.BALANCE_CLOSE?{open:Number(process.env.BALANCE_OPEN)||0,close:Number(process.env.BALANCE_CLOSE)}:null};
 const result={days:config.days,mode:config.active?'active':'offline',events:config.events,bonuses:config.bonuses,seeds:config.seeds,rows:[],simulationErrors:[]};
 for(const strategy of config.strategies)for(let seed=1;seed<=config.seeds;seed++){
  await page.goto(process.env.BALANCE_BASE_URL||'http://127.0.0.1:8765');
  // Fresh globals, quests and random pools for every seed and policy.
  await page.evaluate(()=>{S=null;localStorage.clear();});await page.reload();
  await page.evaluate(()=>{document.querySelector('#boot')?.remove();sfx=()=>{};unlockAudio=()=>{};});
  await page.getByText('Мне есть 18',{exact:true}).click();
  await page.getByText('Дальше: обставить зал',{exact:true}).click();
  await page.getByText('Открыть двери',{exact:true}).click();
  const sourceHash=createHash('sha256').update((await page.locator('script:not([src])').allTextContents()).join('\n')).digest('hex');
  if(result.sourceHash && result.sourceHash!==sourceHash)throw Error('Game source changed during the experiment');
  result.sourceHash=sourceHash;
  const batch=await page.evaluate((config)=>{
const days=config.days;
const simulationErrors=[];let timerId=0;const timers=new Map();
if(config.active){window.setTimeout=(fn,delay=0)=>{const id=++timerId;timers.set(id,{fn,at:clock+Number(delay)});return id;};window.clearTimeout=id=>timers.delete(id);}
const base=JSON.stringify(S),originalNow=Date.now,start=Date.UTC(2026,10,8,12),rows=[];let clock=start,random=1;
let totalIn={},totalOut={};const oldLedgerNote=ledgerNote;ledgerNote=function(delta){const c=MONEY_CTX||{};if(delta>0){const k=c.cat||(c.out?'refunds':null)||INCOME_DEF||'misc';totalIn[k]=(totalIn[k]||0)+delta;}else{const k=c.out||'other';totalOut[k]=(totalOut[k]||0)-delta;}return oldLedgerNote(delta);};
Date.now=()=>clock;Math.random=()=>{random=(Math.imul(1664525,random)+1013904223)>>>0;return random/4294967296;};
flyMoney=()=>{};sfx=()=>{};bubble2=()=>{};tapFx=()=>{};angryZoom=()=>{};
HOOK.toast=()=>{};HOOK.modal=()=>{};HOOK.sfx=()=>{};HOOK.struct=()=>{};queueModal=()=>{};
for(const strategy of (config.strategies||['idle','early_team','demand_hiring']))for(let seed=config.seedStart;seed<=config.seeds;seed++){
timers.clear();nextDistract=0;rzT=null;surpriseDay=-1;S=JSON.parse(base);if(config.hours)S.hours=config.hours;ledgerize(S);gAcc=0;for(const k in RT)delete RT[k];modals=[];quietModals=[];clock=start;window.__simNow=clock;random=seed;totalIn={};totalOut={};let negative=null,level8=null,firstMillion=null,franchise=null,maintenance=0;const trace=[],inspections=[];const inspectImpl=inspectionResult;inspectionResult=function(kind,mode){const result=inspectImpl(kind,mode);inspections.push({d:S.day,kind,mode,dirt:dirtLevel(S.active),chaos:S.meters.chaos,text:result.txt});return result;};
const recruit=role=>{const s=makeStaff(role,{quirk:'none'});const cost=hireCost({...s,contract:'white'});if(S.money<cost+30000)return false;spend(cost,'invest','Найм: '+role);hire(s,'main','white');return true;};
if(strategy==='early_team')for(const role of ['Бариста','Кассир','Мойщица'])recruit(role);
if(config.active)syncScene('main');
for(let d=1;d<=days;d++){
const chunks=strategy==='idle'?1:24,ms=8*3600000/chunks;
for(let chunk=0;chunk<chunks;chunk++){
if(strategy!=='idle'){
 if(config.bonuses){streakCheck();chapterCheck();}if(config.active){for(const inc of S.incidents.slice()){const def=evDef(inc);if(def && def.o){const i=def.o.findIndex(o=>(!o.req||o.req(S,inc))&&(!o.cond||o.cond(inc)));if(i>=0)resolveIncident(inc,i);}}const r=rt('main');while((r.mess||[]).length){r.mess.pop();meter('chaos',-1);addXp(2);taskProg('clean',1);}for(const key of Object.keys(r.dirty||{})){cleanDirty('main',key);addXp(2);taskProg('clean',1);}while(dishCount('main')>0){S.dishes.main=Math.max(0,dishCount('main')-4);addXp(1);}}
 for(const r of S.rooms){for(const k in r.broken)if(r.broken[k]&&S.money>EQ[k].fix+30000){spend(EQ[k].fix,'repairs','Ремонт: '+k);maintenance+=EQ[k].fix;r.broken[k]=false;r.eq[k]=100;}if(Math.min(...Object.values(r.eq))<70){const c=serviceCost(r);if(S.money>c+30000){doService(r);maintenance+=c;}}}
 if(strategy==='demand_hiring'){
  const st=stats('main'),real=S.staff.filter(x=>!x.isYou&&x.room==='main');
  if(st.load>0.8&&!real.some(x=>x.role==='Бариста'))recruit('Бариста');
  else if(st.load>0.8&&real.some(x=>x.role==='Бариста')&&!real.some(x=>x.role==='Кассир'))recruit('Кассир');
  const rm=room('main');for(const id of ['menu','sign','machine','register']){const u=UPG.find(x=>x.id===id),L=rm.upg[id],c=upCost(u,L,'main');if(L>=Math.min(6,upgCap())||S.money<c+100000+closingCosts().total)continue;if((id==='machine'||id==='register')&&st.load<0.8)continue;spend(c,'invest','Улучшение: '+id);rm.upg[id]++;break;}
 }
}
if(config.active){
 HOOK.quiet=true;syncScene('main');let remaining=ms;
 while(remaining>0){
  const dt=Math.min(remaining/1000,S.isOpen?1:20);remaining-=dt*1000;clock+=dt*1000;window.__simNow=clock;
  gAcc+=dt*1000/REAL_PER_GMIN;const whole=Math.floor(gAcc);gAcc-=whole;advanceGameMinutes(whole);
  if(S.isOpen || rt('main').guests.length)simRoom('main',dt);
  equipmentTick(dt);if(config.events){scheduleEvents(clock);maybeDistract();}
  for(const inc of S.incidents.slice())if(Date.now()-inc.at>20*60000)expireIncident(inc);
  for(const[id,t]of [...timers])if(t.at<=clock){timers.delete(id);try{t.fn();}catch(e){simulationErrors.push(String(e));}}
 }
 HOOK.quiet=false;
}else{clock+=ms;window.__simNow=clock;simulateOffline(ms);}
if(S.money<0&&negative===null)negative=d;if(S.level>=8&&level8===null)level8=d;if(S.money>=1000000&&firstMillion===null)firstMillion=d;if(franchiseShares()>0&&franchise===null)franchise=d;
}
trace.push({d,money:Math.round(S.money),level:S.level,earned:Math.round(S.c.earnedRun),staff:S.staff.length-1,broken:Object.keys(room('main').broken).filter(k=>room('main').broken[k]),day:S.day,guests:S.c.guests,rep:+S.rep.toFixed(3),awareness:+(S.awareness||0).toFixed(1),machine:room('main').upg.machine,xp:Math.round(S.xp)});
}
const costs={...totalOut,rev:totalIn.sales||0},reconciliation=S.money-(JSON.parse(base).money+Object.values(totalIn).reduce((a,b)=>a+b,0)-Object.values(totalOut).reduce((a,b)=>a+b,0));
rows.push({strategy,seed,money:Math.round(S.money),level:S.level,negative,level8,firstMillion,franchise,maintenance,inspections,earned:Math.round(S.c.earnedRun),costs,income:totalIn,reconciliation,trace});inspectionResult=inspectImpl;
}
Date.now=originalNow;return{days,mode:config.active?'active':'offline',events:config.events,bonuses:config.bonuses,seeds:config.seeds,simulationErrors,gameDayHours:REAL_PER_GMIN*1440/3600000,rows};
  },{...config,strategies:[strategy],seedStart:seed,seeds:seed});
  result.rows.push(...batch.rows);result.simulationErrors.push(...batch.simulationErrors);
  result.gameDayHours=batch.gameDayHours;
 }
 if(result.rows.some(r=>Math.abs(r.reconciliation)>0.01))throw Error('Cash ledger does not reconcile');
 if(result.simulationErrors.length)throw Error(result.simulationErrors[0]);
 fs.writeFileSync(process.argv[2]||'/tmp/brewcrew-balance.json',JSON.stringify(result,null,2));
 for(const strategy of config.strategies){
  const rows=result.rows.filter(r=>r.strategy===strategy),median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  console.log(JSON.stringify({strategy,money:median(rows.map(r=>r.money)),level:median(rows.map(r=>r.level)),negative:rows.map(r=>r.negative),level12:rows.map(r=>r.trace.find(t=>t.level>=12)?.d||null),firstSale:rows.map(r=>r.franchise)}));
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
