// Read the running game's actual catalogue and formulas. No production requests.
// BALANCE_BASE_URL=http://127.0.0.1:8766 CHROMIUM_PATH=/usr/bin/chromium node scripts/economy-audit.cjs /tmp/economy-audit.json
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
 await page.addInitScript(()=>{requestAnimationFrame=()=>0;});
 await page.route('https://telegram.org/**',r=>r.fulfill({body:''}));
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":false}'}));
 await page.goto(process.env.BALANCE_BASE_URL||'http://127.0.0.1:8766');
 await page.evaluate(()=>document.querySelector('#boot')?.remove());
 await page.getByText('Мне есть 18',{exact:true}).click();
 await page.getByText('Дальше: обставить зал',{exact:true}).click();
 await page.getByText('Открыть двери',{exact:true}).click();
 const result=await page.evaluate(()=>{
 const base=JSON.stringify(S),r=room('main'),levels=[0,1,2,4,5,9,10,14,15,19];
 const upgrades=UPG.map(u=>({id:u.id,name:u.n,costs:Object.fromEntries(levels.map(L=>[L+'→'+(L+1),upCost(u,L,'main')])),effects:[0,1,5,10,20].map(L=>({L,text:u.eff(L)}))}));
 const training=[1,5,8,15,28,49].map(lvl=>({from:lvl,price:trainCost({lvl}),speed:1+0.06*(lvl-1),nextSpeed:1+0.06*lvl}));
 const pass={}; for(const track of ['f','p']){const rewards=Array.from({length:50},(_,i)=>szReward(track,i+1));pass[track]={money:rewards.filter(r=>r.k==='money').reduce((a,r)=>a+r.v,0),xp:rewards.filter(r=>r.k==='xp').reduce((a,r)=>a+r.v,0)};}
 const wages=Object.keys(ROLES).map(role=>({role,hourly:ROLES[role].rate,shift:shiftPay({role,rank:0,contract:'white'}),hire:hireCost({role,rank:0,contract:'white'})}));
 const xp=[];let total=0;for(let L=1;L<=26;L++){S.level=L;xp.push({level:L,toNext:xpNeed(),cumulative:total,levelGift:5000*L});total+=xpNeed();}
 S=JSON.parse(base);ledgerize(S);
 const menus=MENU.filter(m=>!m.season).map(m=>({id:m.id,name:m.n,price:m.price,ingredients:needCost(m.need),margin:m.price-needCost(m.need)}));
 const demand=[];S.mods=[];S.weather='sun';S.rush=null;S.rep=3;S.isOpen=true;S.closedUntil=0;
 for(const L of [1,5,8,12]){S.level=L;for(const h of [8,11,15,20]){S.gm=h*60;const s=stats('main'),lam=s.lambda;const bounded= Math.max(lam,0.002);const mean=0.6+(Math.exp(-bounded*0.6)-Math.exp(-bounded*90))/bounded;demand.push({level:L,hour:h,expectedArrivalsPerRealHour:lam*3600,actualTimerArrivalsPerRealHour:lam>0?3600/mean:0,capacityPerRealHour:s.through*3600,load:s.load});}}
 S=JSON.parse(base);ledgerize(S);S.mods=[];S.weather='sun';S.rush=null;S.rep=3;S.isOpen=true;S.closedUntil=0;S.level=1;S.gm=8*60;
 const impacts=[];for(const id of ['machine','register','menu','sign','decor']){const rm=room('main'),L=rm.upg[id],before=stats('main'),check=estCheck('main');rm.upg[id]++;const after=stats('main');impacts.push({id,from:L,price:upCost(UPG.find(u=>u.id===id),L,'main'),capacityBefore:before.through*3600,capacityAfter:after.through*3600,demandBefore:before.lambda*3600,demandAfter:after.lambda*3600,checkBefore:check,checkAfter:estCheck('main')});rm.upg[id]--;}
 S=JSON.parse(base);ledgerize(S);
 return{pass,opening:{hours:S.hours,money:S.money,build:S.build,quality:S.q,upgrades:room('main').upg,costs:closingCosts()},upgrades,training,wages,xp,menus,demand,impacts,startup:BUILD.map(b=>({id:b.id,options:b.opts})),rooms:ROOMS.map(r=>({id:r.id,cost:r.cost,rent:r.rent})),realSecondsPerGameMinute:REAL_PER_GMIN/1000};
 });
 fs.writeFileSync(process.argv[2]||'/tmp/economy-audit.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({pass:result.pass,opening:result.opening,training:result.training,wages:result.wages,xp:result.xp.filter(r=>[2,5,8,12,16,26].includes(r.level)),demand:result.demand,impacts:result.impacts},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
