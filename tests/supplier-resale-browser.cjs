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




const start=await p.evaluate(()=>{const d=BrewCrewSupplier.state();BrewCrewSupplier.grantTest();const r=BrewCrewSupplier.opening('first',true);S.c.resaleProbe=1;save();return{id:r.result.id,money:S.money,earned:d.earned};});
await p.reload();await p.waitForFunction(()=>S?.c.resaleProbe&&BrewCrewSupplier?.ready());await p.evaluate(()=>{while(modals.length)closeModal();BrewCrewSupplier.open();});assert.equal(await p.getByRole('button',{name:'Выбрать место в кафе',exact:true}).count(),0);await p.getByRole('button',{name:'Продать за 3 000 ₽',exact:true}).count();
const sale=await p.evaluate(id=>{const before=S.money,d=BrewCrewSupplier.state(),old=BrewCrewSaves.writeLocal;BrewCrewSaves.writeLocal=()=>false;const failed=BrewCrewSupplier.sellPending(id);BrewCrewSaves.writeLocal=old;if(failed.ok||S.money!==before||!BrewCrewSupplier.state().owned.cups||!BrewCrewSupplier.state().pending)throw Error('Failed sale not rolled back');const r=BrewCrewSupplier.sellPending(id);return{ok:r.ok,delta:S.money-before,present:!!BrewCrewSupplier.state().owned.cups,inventory:S.inv.some(i=>i.k==='supplier'&&i.item==='cups'),again:BrewCrewSupplier.sellPending(id).ok,earned:BrewCrewSupplier.state().earned};},start.id);assert.deepEqual(sale,{ok:true,delta:3000,present:false,inventory:false,again:false,earned:start.earned});
const duplicate=await p.evaluate(()=>{const d=BrewCrewSupplier.state();d.gifts.first.tickets=2;const old=crypto.getRandomValues;crypto.getRandomValues=a=>{a[0]=0;return a;};try{const one=BrewCrewSupplier.opening('first','gift');BrewCrewSupplier.acknowledge();const before=d.seals;const two=BrewCrewSupplier.opening('first','gift');if(!two.result.duplicate)throw Error('Expected duplicate');const money=S.money;const sold=BrewCrewSupplier.sellPending(two.result.id);return{ok:sold.ok,preserved:!!d.owned.cups,seals:d.seals===before,delta:S.money-money};}finally{crypto.getRandomValues=old;}});assert.deepEqual(duplicate,{ok:true,preserved:true,seals:true,delta:3000});
await p.evaluate(()=>save());await p.reload();await p.waitForFunction(()=>S?.c.resaleProbe);assert.equal(await p.evaluate(()=>BrewCrewSupplier.state().pending),null);assert.deepEqual(errors,[]);await b.close();console.log('PASS resale: reload choice, exact-once sale, ledger income, no budget loop, atomic rollback, inventory removal, duplicate ownership retained without double seal payout.');
})().catch(e=>{console.error(e);process.exit(1);});
