const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {acceptLegal}=require('./legal-fixture.cjs');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 await p.addInitScript(()=>{window.Telegram={WebApp:{initData:'fixture',initDataUnsafe:{user:{id:12345}},ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){},enableClosingConfirmation(){},BackButton:{show(){},hide(){},onClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};});
 await p.route('**/telegram-web-app.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await p.route('**/api/**',r=>r.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},contentType:'application/json',body:JSON.stringify({ok:true,exists:false,adminTest:true,ops:[],maint:{on:false},interiors:[],skins:[],extras:[],passes:[],lux:[],top:[]})}));
 const base=process.env.BC_TEST_URL||'http://127.0.0.1:8771/';const target=new URL(base);target.searchParams.set("lab","1");await p.goto(target.href);
 await p.locator('#own').fill('Поставки');await acceptLegal(p);await p.locator('#quick').click();await p.getByRole('button',{name:'Поехали',exact:true}).click();
 await p.waitForFunction(()=>S&&window.BrewCrewQueues);
 await p.evaluate(()=>{while(modals.length)closeModal();openSheet(null);S.isOpen=false;S.hours={open:20,close:22};S.gm=600;});




 const checkout=await p.evaluate(()=>{while(modals.length)closeModal();openSheet(null);S.isOpen=false;S.gm=600;S.level=30;S.money=50000000;S.staff=S.staff.filter(s=>s.isYou);for(const role of ['Кассир','Бариста']){const s=makeStaff(role,{quirk:'none'});Object.assign(s,{today:'work',room:'main',mood:100,pat:100,fatigue:0});S.staff.push(s);}S.restock=false;const fill=()=>{for(const[k,v]of Object.entries(STOCK))S.stock[k]=v.perish?[{q:1000000,exp:S.day+100}]:1000000;};fill();syncScene('main');const r=rt('main');r.queue=[];r.guests=[];r.jobs=[];r.pickup=[];r.seats.fill(null);
 const out=[];for(const stale of [false,true]){fill();spawnGuest('main');const g=r.queue[0];if(!g)throw Error('Guest not spawned');Object.assign(g,{state:'queue',x:QUEUE_X,y:QUEUE_Y,prog:1,kind:'norm',patience:1e6});if(stale){g.stallUntil=Date.now()+600000;g.stallDone=true;}const before=S.c.guests;completeOrder('main',g,false);if(r.queue.includes(g)||g.state!=='toPick'||!r.jobs.some(j=>j.g===g)||S.c.guests!==before+1)throw Error('Completed checkout remained stuck');const money=S.money,orders=r.jobs.length;completeOrder('main',g,true);if(S.money!==money||r.jobs.length!==orders)throw Error('Stale checkout charged twice');out.push({stale,served:true});}
 fill();r.queue=[];r.guests=[];r.pickup=[];r.jobs=[];spawnGuest('main');const g=r.queue[0];Object.assign(g,{state:'queue',x:QUEUE_X,y:QUEUE_Y,prog:0,kind:'legacy-unknown',patience:1e6});g.prog=NaN;r.spawnT=r.courierT=1e9;S.isOpen=true;S.hours={open:0,close:24};for(let i=0;i<500&&r.queue.includes(g);i++)simRoom('main',.1);S.isOpen=false;if(r.queue.includes(g))throw Error('Cashier failed automatic checkout');return out;});console.log('CHECKOUT',JSON.stringify(checkout));
 assert.deepEqual(errors,[]);await b.close();console.log('PASS cashier: immediate completed orders, old future stall removed, duplicate calls cannot charge again, actual simulated automatic service continues.');
})().catch(e=>{console.error(e);process.exit(1);});
