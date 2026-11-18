const { chromium } = require('playwright');
const assert = require('assert');
const { acceptLegal } = require('./legal-fixture.cjs');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const errors = [];let invoices=[],receipts=[];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    window.Telegram = { WebApp: { initData: 'fixture', initDataUnsafe: { user: { id: 12345 } },
      openInvoice(link,cb){window.__invoiceCallback=cb;}, ready() {}, expand() {}, onEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {}, enableClosingConfirmation() {},
      BackButton: { show() {}, hide() {}, onClick() {} }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }
    } };
  });
  await p.route('**/telegram-web-app.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await p.route('**/api/**',r=>{const path=new URL(r.request().url()).pathname;if(path==='/api/invoice'){invoices.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,link:'https://t.me/fixture-invoice'})});}return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,exists:false,adminTest:false,ops:[],maint:{on:false},interiors:[],skins:receipts,extras:[],passes:[],lux:[],top:[]})});});
  await p.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:8770/');
  await p.locator('#own').fill('Кандидаты'); await acceptLegal(p); await p.locator('#quick').click();
  await p.getByRole('button', { name: 'Поехали', exact: true }).click();
  await p.waitForFunction(() => S && window.BrewCrewStaffSkins?.ready());
  await p.evaluate(()=>{while(modals.length)closeModal();S.isOpen=false;S.hours={open:8,close:22};S.gm=600;S.level=30;S.money=100000000;room('main').upg.register=14;});
  assert.equal(await p.evaluate(()=>S.c.terminalShopV1),1,'New saves must not qualify as legacy');
  await p.evaluate(async()=>{await buyUpg(UPG.find(u=>u.id==='register'),'main',1);});
  assert.equal(await p.evaluate(()=>room('main').upg.register),15);assert.equal(await p.evaluate(()=>kioskOn()),false,'Register upgrade still grants kiosk');
  await p.evaluate(()=>{room('main').upg.register=20;migrate();});assert.equal(await p.evaluate(()=>kioskOn()),false,'Later migrations grant a free kiosk');
  await p.evaluate(()=>{room('main').upg.register=0;window.__shopCat='terminal';openSheet('hall','shop');});
  assert.equal(await p.locator('[data-shop-group="equipment"]').getAttribute('aria-pressed'),'true');
  assert.equal(await p.locator('.bc-shop-subcategory select').inputValue(),'terminal');
  const card=p.locator('[data-bc-sku="skin_terminal_self_service"]');assert((await card.innerText()).includes('999'));assert.equal(await card.locator('.u9try').count(),0,'Functional kiosk must not be granted by try-on');
  await card.getByRole('button',{name:'Купить',exact:true}).click();await p.waitForTimeout(500);
  const wallet=await p.evaluate(()=>S.money);await p.getByRole('button',{name:/Купить за/}).click();
  await p.waitForFunction(()=>typeof window.__invoiceCallback==='function');assert.equal(invoices.length,1);assert.equal(invoices[0].item,'skin_terminal_self_service');assert.equal(invoices[0].shopVersion,2);
  assert.equal(await p.evaluate(()=>kioskOn()),false,'Invoice creation grants an unpaid kiosk');assert.equal(await p.evaluate(()=>S.money),wallet);
  receipts=[{category:'terminal',id:'self_service',at:Date.now()}];await p.evaluate(()=>refreshEntitlements());await p.waitForFunction(()=>kioskOn());
  assert.equal(await p.evaluate(()=>room('main').upg.register),0,'Purchase changed register level');assert.equal(await p.evaluate(()=>S.money),wallet,'Stars purchase debits game cash');
  await p.evaluate(()=>{
    while(modals.length)closeModal();openSheet(null);S.staff=[];const r=rt('main');r.guests=[];r.queue=[];r.pickup=[];r.jobs=[];r._kg=null;spawnGuest('main',null,true);spawnGuest('main',null,true);
  });
  await p.waitForTimeout(350);assert.equal(await p.evaluate(()=>!!rt('main')._kg),false,'Closed cafe accepts kiosk orders');
  await p.evaluate(()=>{S.isOpen=true;});await p.waitForFunction(()=>!!rt('main')._kg);
  await p.evaluate(()=>{const g=rt('main')._kg;window.__boughtKioskGuest=g;g.x=kioskPos()[0]+1;g.y=kioskPos()[1]+13;g._kat=true;});
  await p.waitForFunction(()=>window.__boughtKioskGuest.orders===1,{},{timeout:15000});
  assert(await p.evaluate(()=>rt('main').jobs.some(j=>j.g===window.__boughtKioskGuest)||rt('main').pickup.includes(window.__boughtKioskGuest)),'Kiosk did not create a real paid order');
  await p.evaluate(()=>{S.isOpen=false;});
  await p.evaluate(()=>{S.c.terminalPaidTest=1;save();});await p.reload();await p.waitForFunction(()=>S?.c.terminalPaidTest&&kioskOn());assert.equal(await p.evaluate(()=>room('main').upg.register),0);
  // Existing level-15 cafes retain the feature once, with no deductions or level changes.
  const old=await p.evaluate(()=>{while(modals.length)closeModal();S.isOpen=false;room('main').upg.register=15;delete S.skinOwned['terminal:self_service'];delete S.c.terminalShopV1;const before={cash:S.money,staff:S.staff.map(s=>[s.id,s.lvl,s.name])};migrate();return {before,after:{cash:S.money,staff:S.staff.map(s=>[s.id,s.lvl,s.name])},owned:hasSelfServiceTerminal(),level:room('main').upg.register};});
  assert.deepEqual(old.after,old.before);assert(old.owned);assert.equal(old.level,15);
  assert(await p.evaluate(()=>newState('Следующая','spb').skinOwned['terminal:self_service']===1),'Permanent kiosk lost on a new cafe');
  await p.evaluate(()=>{delete S.skinOwned['terminal:self_service'];room('main').upg.register=20;migrate();});assert.equal(await p.evaluate(()=>kioskOn()),false,'Migration regranted a removed item');
  assert.deepEqual(errors,[]);await b.close();console.log('PASS terminal: upgrades 15/20 no longer grant kiosk, 999-Star checkout, no unpaid grant/game-cash debit, server receipt and reload at register 0, real queue/order flow, closed cafe paused, one-time legacy retention and permanent cafe carry.');
})().catch(e=>{console.error(e);process.exit(1);});
