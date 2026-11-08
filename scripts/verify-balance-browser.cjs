// Browser regression for the actual inline game: startup, queue capacity and saved progress.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{requestAnimationFrame=()=>0;Date.now=()=>Date.UTC(2026,10,8,12);});
 await page.route('https://telegram.org/**',r=>r.fulfill({body:''}));
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":false}'}));
 await page.goto(process.env.BALANCE_BASE_URL||'http://127.0.0.1:8767');
 await page.evaluate(()=>document.querySelector('#boot')?.remove());
 await page.getByText('Мне есть 18',{exact:true}).click();await page.getByText('Дальше: обставить зал',{exact:true}).click();await page.getByText('Открыть двери',{exact:true}).click();
 const result=await page.evaluate(()=>{
 const base=JSON.stringify(S),limits=[];for(const level of [1,3,5,6,8,9,10,12,14,15,26]){S.level=level;S.kitchen.tier=2;for(const role of Object.keys(ROLES))limits.push({level,role,limit:staffCap(role)});}S=JSON.parse(base);ledgerize(S);sfx=()=>{};prepSound=()=>{};
 const opening={cash:S.money,hours:S.hours,safety:room('main').upg.safety,build:buildCost(S.build)};
 const demand=stats('main').lambda;S.level=12;const highLevelDemand=stats('main').lambda;S.level=1;
 S.regs=[];S.rush=null;S.youAwayUntil=0;const r=rt('main'),you=S.staff.find(s=>s.isYou);
 r.spawnT=1e9;r.guests=[];r.queue=[];r.jobs=[];r.mess=[];r.dirty={};S.dishes={main:0};
 spawnGuest('main');const first=r.queue[0];completeOrder('main',first,false);
 spawnGuest('main');const head=r.queue[0];head.x=QUEUE_X;head.y=QUEUE_Y;head.state='queue';head.prog=0;head.patience=10000;
 const job=r.jobs[0];job.by=you.id;const expected=0.1*staffSpeed(you)*machinePower(room('main').upg.machine)/12;
 const p0=job.p;simRoom('main',0.1);
 const shared={head:head.prog,prep:job.p-p0,expected};
 r.jobs=[];simRoom('main',0.1);const orderProgress=head.prog;
 const employee=makeStaff('Бариста',{quirk:'none'});hire(employee,'main','white');syncScene('main');
 const prepIds=stats('main').prepWorkers.map(s=>s.id);
 S.isOpen=false;const q0=head.prog;simRoom('main',0.1);const closedOrderDelta=head.prog-q0;
 S=JSON.parse(base);ledgerize(S);S.money=2000000;S.bank29={back:1250000,due:S.day,n:'Тестовый банк'};
 const bankExpected=closingCosts().total,bankBefore=Object.values(S.fin.today.L.out).reduce((a,b)=>a+b,0);HOOK.quiet=true;closeDay();
 const bank={expected:bankExpected,paid:Object.values(S.fin.hist[0].L.out).reduce((a,b)=>a+b,0)-bankBefore,reported:S.fin.hist[0].loan,carried:S.fin.today.loan||0};
 const afterClose=S.money;closeDay();bank.repeatedCharge=afterClose-S.money;HOOK.quiet=false;
 S=JSON.parse(base);ledgerize(S);
 S.money=7654321;S.level=12;const oldNeed=Math.round(Math.round(130*1.42**11)*(1+0.12*4));S.xp=oldNeed/2;S.rep=4.6;delete S.rating;delete S.economyVersion;
 S.hours={open:0,close:24};room('main').upg.machine=19;
 S.inv=[{uid:55555,k:'money',v:123456,sz:sezId(),track:'p',n:50}];S.ent={sub:Date.now()+86400000,interiors:['int_loft'],passes:[]};S.sz.claimed={f:[5,10],p:[5,20,50]};S.szPet=true;S.goldMachine=true;
 S.streak={last:new Date(Date.now()+3*3600000).toISOString().slice(0,10),n:1};S.flags.expired=1;
 const assets=JSON.stringify({inv:S.inv,ent:S.ent,claims:S.sz.claimed,pet:S.szPet,gold:S.goldMachine});
 save();return{bank,limits,opening,demand,highLevelDemand,shared,orderProgress,prepIds,youId:you.id,employeeId:employee.id,closedOrderDelta,assets};
 });
 const {marketRoleLimit}=await import('../functions/_market.js');for(const row of result.limits)assert.equal(row.limit,marketRoleLimit(row.role,row.level,2),row.role+' '+row.level);
 assert.equal(result.bank.paid,result.bank.expected);assert.equal(result.bank.reported,1250000);assert.equal(result.bank.carried,0);assert.equal(result.bank.repeatedCharge,0);
 assert.equal(result.opening.cash,120000);assert.equal(result.opening.build,480000);assert.equal(result.opening.safety,1);assert.deepEqual(result.opening.hours,{open:8,close:20});
 assert.equal(result.demand,result.highLevelDemand);assert.equal(result.shared.head,0);assert.ok(Math.abs(result.shared.prep-result.shared.expected)<1e-9);assert.ok(result.orderProgress>0);
 assert.deepEqual(result.prepIds,[result.employeeId]);assert.equal(result.closedOrderDelta,0);
 await page.reload();await page.waitForFunction(()=>S&&S.economyVersion===2);
 const migrated=await page.evaluate(()=>({money:S.money,level:S.level,rep:S.rep,xp:S.xp,need:xpNeed(),machine:room('main').upg.machine,hours:S.hours,expired:S.flags.expired,assets:JSON.stringify({inv:S.inv,ent:S.ent,claims:S.sz.claimed,pet:S.szPet,gold:S.goldMachine})}));
 assert.equal(migrated.money,7654321);assert.equal(migrated.level,12);assert.equal(migrated.rep,4.6);assert.equal(migrated.xp,Math.round(migrated.need/2));assert.equal(migrated.machine,19);assert.equal(migrated.expired,0);assert.equal(migrated.assets,result.assets);assert.deepEqual(migrated.hours,{open:8,close:20});
 await page.evaluate(()=>save());await page.reload();await page.waitForFunction(()=>S&&S.economyVersion===2);assert.equal(await page.evaluate(()=>S.money),7654321);assert.equal(await page.evaluate(()=>S.xp),migrated.xp);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({startup:result.opening,queueCapacity:true,ownerCannotDoubleWork:true,noExtraBarista:true,noOrdersAfterClosing:true,bankPaymentReportedOnce:true,migrationPreservesAssets:true,repeatReload:true,errors},null,2));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
