// Seeded offline simulation: 3 policies x 5 seeds. No production API calls.
// Requires Playwright and a local static server; see docs/balance-review.md.
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});const p=await b.newPage();await p.addInitScript(()=>{requestAnimationFrame=()=>0;window.__simNow=Date.UTC(2026,10,8,12);const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__simNow]));}static now(){return window.__simNow;}};let seed=42;Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};});await p.route('https://telegram.org/**',r=>r.fulfill({body:''}));await p.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":false}'}));await p.goto(process.env.BALANCE_BASE_URL||'http://127.0.0.1:8765');await p.evaluate(()=>document.querySelector('#boot')?.remove());await p.getByText('Мне есть 18',{exact:true}).click();await p.getByText('Дальше: обставить зал',{exact:true}).click();await p.getByText('Открыть двери',{exact:true}).click();
const result=await p.evaluate((days)=>{
const base=JSON.stringify(S),originalNow=Date.now,start=Date.UTC(2026,10,8,12),rows=[];let clock=start,random=1;
let totalIn={},totalOut={};const oldLedgerNote=ledgerNote;ledgerNote=function(delta){const c=MONEY_CTX||{};if(delta>0){const k=c.cat||(c.out?'refunds':null)||INCOME_DEF||'misc';totalIn[k]=(totalIn[k]||0)+delta;}else{const k=c.out||'other';totalOut[k]=(totalOut[k]||0)-delta;}return oldLedgerNote(delta);};
Date.now=()=>clock;Math.random=()=>{random=(Math.imul(1664525,random)+1013904223)>>>0;return random/4294967296;};
HOOK.toast=()=>{};HOOK.modal=()=>{};HOOK.sfx=()=>{};HOOK.struct=()=>{};queueModal=()=>{};
for(const strategy of ['idle','early_team','demand_hiring'])for(let seed=1;seed<=5;seed++){
S=JSON.parse(base);ledgerize(S);gAcc=0;for(const k in RT)delete RT[k];modals=[];quietModals=[];clock=start;window.__simNow=clock;random=seed;totalIn={};totalOut={};let negative=null,level8=null,firstMillion=null,franchise=null,maintenance=0;const trace=[];
const recruit=role=>{const s=makeStaff(role,{quirk:'none'});const cost=hireCost({...s,contract:'white'});if(S.money<cost+30000)return false;spend(cost,'invest','Найм: '+role);hire(s,'main','white');return true;};
if(strategy==='early_team')for(const role of ['Бариста','Кассир','Мойщица'])recruit(role);
for(let d=1;d<=days;d++){
const chunks=strategy==='idle'?1:24,ms=8*3600000/chunks;
for(let chunk=0;chunk<chunks;chunk++){
if(strategy!=='idle'){
 for(const r of S.rooms){for(const k in r.broken)if(r.broken[k]&&S.money>EQ[k].fix+30000){spend(EQ[k].fix,'repairs','Ремонт: '+k);maintenance+=EQ[k].fix;r.broken[k]=false;r.eq[k]=100;}if(Math.min(...Object.values(r.eq))<70){const c=serviceCost(r);if(S.money>c+30000){doService(r);maintenance+=c;}}}
 if(strategy==='demand_hiring'){
  const st=stats('main'),real=S.staff.filter(x=>!x.isYou&&x.room==='main');
  if(st.load>0.8&&!real.some(x=>x.role==='Бариста'))recruit('Бариста');
  else if(st.load>0.8&&real.some(x=>x.role==='Бариста')&&!real.some(x=>x.role==='Кассир'))recruit('Кассир');
  const rm=room('main');for(const id of ['menu','sign','machine','register']){const u=UPG.find(x=>x.id===id),L=rm.upg[id],c=upCost(u,L,'main');if(L>=Math.min(6,upgCap())||S.money<c+100000+closingCosts().total)continue;if((id==='machine'||id==='register')&&st.load<0.8)continue;spend(c,'invest','Улучшение: '+id);rm.upg[id]++;break;}
 }
}
clock+=ms;window.__simNow=clock;simulateOffline(ms);
if(S.money<0&&negative===null)negative=d;if(S.level>=8&&level8===null)level8=d;if(S.money>=1000000&&firstMillion===null)firstMillion=d;if(franchiseShares()>0&&franchise===null)franchise=d;
}
trace.push({d,money:Math.round(S.money),level:S.level,earned:Math.round(S.c.earnedRun),staff:S.staff.length-1,broken:Object.keys(room('main').broken).filter(k=>room('main').broken[k]),day:S.day});
}
const costs={...totalOut,rev:totalIn.sales||0},reconciliation=S.money-(120000+Object.values(totalIn).reduce((a,b)=>a+b,0)-Object.values(totalOut).reduce((a,b)=>a+b,0));
rows.push({strategy,seed,money:Math.round(S.money),level:S.level,negative,level8,firstMillion,franchise,maintenance,earned:Math.round(S.c.earnedRun),costs,income:totalIn,reconciliation,trace});
}
Date.now=originalNow;return{days,gameDayHours:REAL_PER_GMIN*1440/3600000,rows};},Number(process.env.BALANCE_DAYS)||60);
if(result.rows.some(r=>Math.abs(r.reconciliation)>0.01))throw new Error('Cash ledger does not reconcile');
const output=process.argv[2]||'/tmp/brewcrew-balance.json';fs.writeFileSync(output,JSON.stringify(result,null,2));for(const strategy of ['idle','early_team','demand_hiring']){const a=result.rows.filter(r=>r.strategy===strategy),med=k=>a.map(r=>r[k]).sort((x,y)=>x-y)[2];console.log(JSON.stringify({strategy,money:med('money'),level:med('level'),maintenance:med('maintenance'),negative:a.map(r=>r.negative),earned:med('earned'),costs:Object.fromEntries([...new Set(a.flatMap(r=>Object.keys(r.costs)))].map(k=>[k,a.map(r=>r.costs[k]||0).sort((x,y)=>x-y)[2]]))}));}await b.close();})().catch(e=>{console.error(e);process.exit(1)});
