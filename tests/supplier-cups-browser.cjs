const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {acceptLegal}=require('./legal-fixture.cjs');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 await p.addInitScript(()=>{window.Telegram={WebApp:{initData:'fixture',initDataUnsafe:{user:{id:929887068}},ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){},enableClosingConfirmation(){},BackButton:{show(){},hide(){},onClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};});
 await p.route('**/telegram-web-app.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await p.route('**/api/**',r=>r.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},contentType:'application/json',body:JSON.stringify({ok:true,exists:false,adminTest:true,ops:[],maint:{on:false},interiors:[],skins:[],extras:[],passes:[],lux:[],top:[]})}));
 const base=process.env.BC_TEST_URL||'http://127.0.0.1:8771/';const target=new URL(base);target.searchParams.set('lab','1');await p.goto(target.href);
 await p.locator('#own').fill('Поставки');await acceptLegal(p);await p.locator('#quick').click();await p.getByRole('button',{name:'Поехали',exact:true}).click();
 await p.waitForFunction(()=>S&&window.BrewCrewSupplier?.ready());
 await p.evaluate(()=>{while(modals.length)closeModal();openSheet(null);S.isOpen=false;S.hours={open:20,close:22};S.gm=600;});



 const result=await p.evaluate(()=>{const d=BrewCrewSupplier.state();S.isOpen=false;S.level=30;S.money=50000000;S.staff=S.staff.filter(s=>s.isYou);S.staff[0].mood=100;S.staff[0].fatigue=0;S.staff[0].pat=100;Object.assign(d,BrewCrewSupplier.rules.fresh());d.seconds=21*3600;d.testExpansion=true;d.freeUsed=true;const sale=()=>{for(const[k,v]of Object.entries(STOCK))S.stock[k]=v.perish?[{q:1000000,exp:S.day+100}]:1000000;const r=sellOne('main');if(r.fail||!r.item.need.cups)throw Error('Cup was not sold');};
 for(let i=0;i<59;i++)sale();const first59=structuredClone(d.gifts);taskProg('sell',200,'espresso');if(JSON.stringify(first59)!==JSON.stringify(d.gifts))throw Error('Task-only progress credited cups');sale();const first=BrewCrewSupplier.opening('first','gift');if(!first.ok||first.result.tier!=='first'||d.gifts.first.tickets!==0)throw Error('First cup reward failed');BrewCrewSupplier.acknowledge();
 for(let i=0;i<80;i++)sale();if(d.gifts.hall.tickets!==1)throw Error('140 cup reward missing');const low=d.gifts.first.tickets,high=d.gifts.author.tickets,m=S.money;const hall=BrewCrewSupplier.opening('hall','gift');if(!hall.ok||hall.result.cost!==0||d.gifts.first.tickets!==low||d.gifts.author.tickets!==high||d.gifts.hall.tickets!==0)throw Error('Typed reward consumed wrong wallet');BrewCrewSupplier.acknowledge();
 for(let i=0;i<160;i++)sale();if(d.gifts.author.tickets!==1||d.gifts.author.progress!==0)throw Error('300 cup reward missing');
 const gifts=JSON.stringify(d.gifts);HOOK.quiet=true;try{sale();}finally{HOOK.quiet=false;}if(JSON.stringify(d.gifts)!==gifts)throw Error('Quiet/offline cup counted');Object.defineProperty(document,'hidden',{configurable:true,value:true});try{sale();}finally{delete document.hidden;}if(JSON.stringify(d.gifts)!==gifts)throw Error('Hidden cup counted');Telegram.WebApp.isActive=false;try{sale();}finally{delete Telegram.WebApp.isActive;}if(JSON.stringify(d.gifts)!==gifts)throw Error('Inactive Telegram cup counted');
 S.isOpen=true;simulateOffline(180000);S.isOpen=false;if(JSON.stringify(d.gifts)!==gifts)throw Error('Offline simulation counted cups');
 const next=newState('Новая кофейня');if(JSON.stringify(next.supplierDrops.gifts)!==gifts)throw Error('Cafe sale lost progress');S.c.cupsProbe=1;save();return{first59,gifts:d.gifts};});assert.deepEqual(result.first59,{first:{progress:59,tickets:0},hall:{progress:59,tickets:0},author:{progress:59,tickets:0}});
 await p.reload();await p.waitForFunction(()=>S?.c.cupsProbe&&window.BrewCrewSupplier?.ready());assert.deepEqual(await p.evaluate(()=>BrewCrewSupplier.state().gifts),result.gifts);await p.evaluate(()=>{while(modals.length)closeModal();openSheet(null);BrewCrewSupplier.open();});
 for(const [id,goal]of [['first',60],['hall',140],['author',300]]){await p.locator('[data-tier="'+id+'"]').click();assert.equal(await p.locator('.sup-progress [role="progressbar"]').getAttribute('aria-valuemax'),String(goal));assert((await p.locator('.sup-progress').innerText()).includes(String(goal)));}
 await p.screenshot({path:'/tmp/bc-supplier-cup-goals.png'});assert.deepEqual(errors,[]);await b.close();console.log('PASS supplier cup goals: actual cup sales only, independent 60/140/300 goals and typed gifts, no task-only/quiet/hidden/Telegram-inactive/offline progress, exact wallet use, cafe sale and reload retained, all three UI meters.');
})().catch(e=>{console.error(e);process.exit(1);});
