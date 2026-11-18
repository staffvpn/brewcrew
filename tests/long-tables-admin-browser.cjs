const { chromium } = require('playwright');
const assert = require('assert');
const { acceptLegal } = require('./legal-fixture.cjs');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    window.Telegram = { WebApp: { initData: 'fixture', initDataUnsafe: { user: { id: 929887068 } },
      ready() {}, expand() {}, onEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {}, enableClosingConfirmation() {},
      BackButton: { show() {}, hide() {}, onClick() {} }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }
    } };
  });
  await p.route('**/telegram-web-app.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await p.route('**/api/**', r => r.fulfill({ headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},contentType: 'application/json', body: JSON.stringify({
    ok: true, exists: false, adminTest: true, ops: [], maint: { on: false }, interiors: [], skins: [], extras: [], passes: [], lux: [], top: []
  }) }));
  const target=new URL(process.env.BC_TEST_URL||'http://127.0.0.1:8770/');target.searchParams.set('lab','1');await p.goto(target.href);
  await p.locator('#own').fill('Кандидаты'); await acceptLegal(p); await p.locator('#quick').click();
  await p.getByRole('button', { name: 'Поехали', exact: true }).click();
  await p.waitForFunction(() => S && window.BrewCrewStaffSkins?.ready());
  await p.waitForFunction(()=>window.BrewCrewLongTables?.ready());
  await p.evaluate(()=>{while(modals.length)closeModal();S.isOpen=false;S.hours={open:20,close:22};S.gm=600;S.level=30;room('main').upg.tables=28;delete S.skinOwned['room:wide'];delete S.skinOwned['room:deep'];delete S.c.labLongTable;window.bcLongTableFit();syncScene('main');window.__shopCat='table';openSheet('hall','shop');});
  assert.equal(await p.locator('[data-long-table]').count(),7);
  assert.equal(await p.locator('[data-long-table] button:disabled').count(),7);
  assert.equal(await p.evaluate(()=>BrewCrewLongTables.place('home')),false);
  await p.evaluate(()=>{S.skinOwned['room:wide']=1;applySkins();window.bcLongTableFit();syncScene('main');renderPanel();});
  assert.equal(await p.locator('[data-long-table] button:disabled').count(),7,'One expansion unlocked big tables');
  await p.evaluate(()=>{S.skinOwned['room:deep']=1;applySkins();window.bcLongTableFit();syncScene('main');renderPanel();});
  const before=await p.evaluate(()=>({money:S.money,capacity:seatTotal('main'),level:room('main').upg.tables}));
  for(const style of ['home','loft','scandi','soviet','neon','autumn','winter']){
    await p.locator('[data-long-table="'+style+'"]').getByRole('button',{name:'Поставить',exact:true}).click();
    assert.equal(await p.evaluate(()=>S.c.labLongTable),style);
    assert(await p.evaluate(()=>BrewCrewLongTables.active()));
    assert.equal(await p.evaluate(()=>seatTotal('main')),before.capacity+2);
  }
  const scene=await p.evaluate(()=>{
    while(modals.length)closeModal();openSheet(null);const r=rt('main');r.guests=[];r.queue=[];r.seats.fill(null);
    const indices=[];for(let i=0;i<seatTotal('main');i++){const q=slotOf('main',i);if(q[2]==='table'&&[8,9,10].includes(q[3]))indices.push(i);}
    for(const i of indices){spawnGuest('main',null,true);const g=r.guests[r.guests.length-1],q=slotOf('main',i);Object.assign(g,{state:'sit',seat:i,x:q[0],y:q[1],item:'Эспрессо',walk:false,pet:null,sit:1000,_has:true});r.seats[i]=g;}
    r.queue=[];return {count:indices.length,points:indices.map(i=>slotOf('main',i).slice(0,2).join(',')),money:S.money,level:room('main').upg.tables};
  });
  assert.equal(scene.count,6);assert.equal(new Set(scene.points).size,6);assert.equal(scene.money,before.money);assert.equal(scene.level,before.level);
  await p.waitForTimeout(600);await p.screenshot({path:'/tmp/bc-long-table-admin-room.png'});
  const routes=await p.evaluate(()=>rt('main').guests.map(g=>{const q=slotOf('main',g.seat);g.x=300;g.y=540;g.state='toSeat';g._nav=null;let arrived=false;for(let n=0;n<1400&&!arrived;n++)arrived=moveTo(g,q[0],q[1],46,.04);g.state='sit';return arrived;}));
  assert(routes.every(Boolean),'Some large-table seats cannot be reached');

  await p.evaluate(()=>{S.c.longTableTest={style:S.c.labLongTable,money:S.money};save();});
  await p.reload();await p.waitForFunction(()=>S?.c.longTableTest&&BrewCrewLongTables?.ready());
  assert.equal(await p.evaluate(()=>S.c.labLongTable),'winter');assert(await p.evaluate(()=>BrewCrewLongTables.active()));
  await p.evaluate(()=>{while(modals.length)closeModal();window.__shopCat='table';openSheet('hall','shop');});
  await p.locator('[data-long-table="winter"]').getByRole('button',{name:'Убрать',exact:true}).click();
  assert.equal(await p.evaluate(()=>BrewCrewLongTables.active()),false);assert.equal(await p.evaluate(()=>seatTotal('main')),before.capacity);
  await p.evaluate(()=>{delete S.skinOwned['room:deep'];S.c.labLongTable='home';layoutSlots();});
  assert.equal(await p.evaluate(()=>BrewCrewLongTables.active()),false,'Saved selection bypasses expansion gate');
  assert.deepEqual(errors,[]);await b.close();console.log('PASS Admin big tables: seven models, strict two-expansion gate, placement/removal and reload, six unique seats after upgrades, unchanged cash/levels, old selection cannot bypass gate.');
})().catch(e=>{console.error(e);process.exit(1);});
