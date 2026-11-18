const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {acceptLegal}=require('./legal-fixture.cjs');
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:390,height:844}}),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 await p.addInitScript(()=>{window.Telegram={WebApp:{initData:'fixture',initDataUnsafe:{user:{id:12345}},ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){},enableClosingConfirmation(){},BackButton:{show(){},hide(){},onClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};});
 await p.route('**/telegram-web-app.js*',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await p.route('**/api/**',r=>r.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},contentType:'application/json',body:JSON.stringify({ok:true,exists:false,adminTest:false,ops:[],maint:{on:false},interiors:[],skins:[],extras:[],passes:[],lux:[],top:[]})}));
 const base=process.env.BC_TEST_URL||'http://127.0.0.1:8771/';const target=new URL(base);await p.goto(target.href);
 await p.locator('#own').fill('Поставки');await acceptLegal(p);await p.locator('#quick').click();await p.getByRole('button',{name:'Поехали',exact:true}).click();
 await p.waitForFunction(()=>S&&window.BrewCrewQueues);
 await p.evaluate(()=>{while(modals.length)closeModal();openSheet(null);S.isOpen=false;S.hours={open:20,close:22};S.gm=600;});




 await p.evaluate(()=>{while(modals.length)closeModal();openSheet(null);S.isOpen=false;S.level=30;S.money=50000000;for(let i=0;i<12;i++)invAdd({k:'mod',v:1.1,t:'Ночная смена '+i,d:'Средний чек +10% на сутки. '+('ДлинноеОписаниеБезПробелов'.repeat(8)),src:'Сезон «Осенняя хандра»',track:'p'});for(let i=0;i<3;i++)badgeAdd('scroll_'+i,'Значок '+i,'Проверка');});
 const cases=[];for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1024,height:768}]){await p.setViewportSize(viewport);for(const [sheet,tab]of [['hall','inv'],['hall','team'],['hall','stock'],['hall','money'],['hall','tasks'],['hall','guests'],['hall','season'],['hall','owner'],['up'],['set'],['hall','shop']]){await p.evaluate(({sheet,tab})=>{while(modals.length)closeModal();openSheet(sheet,tab);},{sheet,tab});await p.waitForTimeout(300);
 const geometry=await p.locator('#panel').evaluate(e=>{const box=e.getBoundingClientRect(),parent=e.parentElement.getBoundingClientRect();return{overflow:getComputedStyle(e).overflowX,fits:box.left>=parent.left-1&&box.right<=parent.right+1,width:e.clientWidth,scroll:e.scrollWidth};});assert.equal(geometry.overflow,'hidden');assert(geometry.fits,JSON.stringify({sheet,tab,geometry}));if(viewport.width>600)assert((await p.locator('.sheet').boundingBox()).width<=560);
 await p.locator('#panel').evaluate(e=>{e.scrollLeft=100;e.dispatchEvent(new Event('scroll'));});assert.equal(await p.locator('#panel').evaluate(e=>e.scrollLeft),0);
 const touch=await p.locator('#panel').evaluate(e=>{const target=e.querySelector('.card')||e,point=(x,y)=>new Touch({identifier:1,target,clientX:x,clientY:y}),start=point(200,300);target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[start]}));const horizontal=new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[point(120,302)]});target.dispatchEvent(horizontal);target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[]}));target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[start]}));const vertical=new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[point(201,220)]});target.dispatchEvent(vertical);target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[]}));return{horizontal:horizontal.defaultPrevented,vertical:vertical.defaultPrevented};});assert(touch.horizontal);assert(!touch.vertical);
 if(tab==='inv'){await p.locator('#panel').evaluate(e=>e.scrollTop=150);assert(await p.locator('#panel').evaluate(e=>e.scrollTop>0));await p.screenshot({path:'/tmp/bc-inventory-scroll-'+viewport.width+'.png'});}
 if(tab==='shop'){const nav=p.locator('.bc-shop-groups');assert.equal(await nav.count(),1);const nested=await nav.evaluate(e=>{e.scrollLeft=120;const x=e.scrollLeft,target=e.firstElementChild,t=(x,y)=>new Touch({identifier:2,target,clientX:x,clientY:y});target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t(200,300)]}));const move=new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[t(100,301)]});target.dispatchEvent(move);target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[]}));return{x,blocked:move.defaultPrevented};});assert(nested.x>0);assert(!nested.blocked);assert.equal(await p.locator('#panel').evaluate(e=>e.scrollLeft),0);}
 cases.push({viewport:viewport.width,sheet,tab:tab||'',contentFits:geometry.scroll<=geometry.width+1});}}
 assert(cases.every(c=>c.contentFits),JSON.stringify(cases));assert.deepEqual(errors,[]);await b.close();console.log('PASS panel scroll: 33 mobile/desktop tab layouts fit; horizontal page gestures blocked, vertical content and horizontal shop navigation retained.');
})().catch(e=>{console.error(e);process.exit(1);});
