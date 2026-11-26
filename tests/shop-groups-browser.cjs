const { chromium } = require('playwright');
const assert = require('assert');
const { acceptLegal } = require('./legal-fixture.cjs');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    window.Telegram = { WebApp: { initData: 'fixture', initDataUnsafe: { user: { id: 12345 } },
      ready() {}, expand() {}, onEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {}, enableClosingConfirmation() {},
      BackButton: { show() {}, hide() {}, onClick() {} }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }
    } };
  });
  await p.route('**/telegram-web-app.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await p.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
    ok: true, exists: false, adminTest: false, ops: [], maint: { on: false }, interiors: [], skins: [], extras: [], passes: [], lux: [], top: []
  }) }));
  await p.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:8770/');
  await p.locator('#own').fill('Кандидаты'); await acceptLegal(p); await p.locator('#quick').click();
  await p.getByRole('button', { name: 'Поехали', exact: true }).click();
  await p.waitForFunction(() => S && window.BrewCrewStaffSkins?.ready());
  const before=await p.evaluate(()=>{while(modals.length)closeModal();S.isOpen=false;S.hours={open:20,close:22};S.gm=600;S.money=100000000;openShop();return {money:S.money,owned:JSON.stringify(S.skinOwned),cats:['style','lux-interiors','lux','atmosphere','floor','backfloor','wall','win','table','chair','bstool','bar','barf','mach','grind','art','sign','font','uni','room','p:frames','p:pass','p:money','p:more','terminal']};});
  assert.equal(await p.locator('[data-shop-cat="lux-interiors"]').getAttribute('aria-pressed'),'true');
  await p.locator('[data-shop-back]').click();
  const top=p.locator('[data-shop-group]');assert.equal(await top.count(),14,'Incorrect main sections');
  assert.equal((await top.first().innerText()).trim(),'Люкс');
  assert(await p.locator('.bc-shop-groups').evaluate(n=>getComputedStyle(n).overflowX==='auto'&&n.scrollWidth>n.clientWidth),'Main shop sections lost horizontal scrolling');
  const seen=[],counts={},groups=await top.evaluateAll(buttons=>buttons.map(b=>b.dataset.shopGroup));
  async function openGroup(group){if(await p.locator('[data-shop-back]').count())await p.locator('[data-shop-back]').click();await p.locator('[data-shop-group="'+group+'"]').click();}
  for(const group of groups){
    await openGroup(group);
    const children=p.locator('[data-shop-cat]');
    if(await children.count()){
      const values=await children.evaluateAll(buttons=>buttons.map(b=>b.dataset.shopCat));
      assert.equal(await p.locator('[data-shop-group]').count(),1,'Other shop sections appear inside a group');
      assert.equal(await p.locator('[data-shop-back]').count(),1);
      if(group==='lux')assert.deepEqual(values,['lux-interiors','lux']);
      if(group==='equipment')assert.deepEqual(values,['mach','grind','terminal']);
      if(group==='furniture')assert.deepEqual(values,['table','chair','floor','backfloor','wall','win','bar','barf']);
      if(group==='furniture')assert(await p.locator('.bc-shop-subnav').evaluate(n=>getComputedStyle(n).overflowX==='auto'&&n.scrollWidth>n.clientWidth),'Furniture categories lost horizontal scrolling');
      for(const cat of values){await p.locator('[data-shop-cat="'+cat+'"]').click();assert.equal(await p.evaluate(()=>window.__shopCat),cat);seen.push(cat);counts[cat]=await p.locator('#panel .u6it, #panel .sc29').count();assert(counts[cat]>0,'Empty catalog '+cat);}
    }else{seen.push(group);assert(await p.locator('#panel .sc29, #panel .u6it').count()>0,'Empty section '+group);}
    assert(await p.locator('#panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Mobile overflow in '+group);
  }
  assert.deepEqual([...seen].sort(),before.cats.sort(),'Some categories were lost or duplicated');
  assert.deepEqual(await p.evaluate(()=>({money:S.money,owned:JSON.stringify(S.skinOwned)})),{money:before.money,owned:before.owned},'Navigation changed purchases or cash');
  await openGroup('furniture');await p.locator('[data-shop-cat="floor"]').click();
  await p.locator('[data-bc-sku="skin_floor_herr"]').getByRole('button',{name:'Купить',exact:true}).click();
  await p.waitForTimeout(600);
  await p.getByRole('button',{name:/Купить за.*₽/}).click();await p.waitForFunction(()=>!!S.skinOwned['floor:herr']);
  assert.equal(await p.evaluate(()=>S.money),before.money-450000,'Cash purchase price changed');
  await p.evaluate(()=>{while(modals.length)closeModal();renderPanel();});
  assert.equal(await p.locator('[data-shop-cat="floor"]').getAttribute('aria-pressed'),'true');
  await p.screenshot({path:'/tmp/bc-shop-furniture.png'});
  await p.locator('#panel').evaluate(p=>p.scrollTop=300);
  await openGroup('equipment');
  await p.screenshot({path:'/tmp/bc-shop-equipment.png'});
  await p.locator('[data-bc-sku="skin_mach_m_steam"]').getByRole('button',{name:'Примерить',exact:true}).click();
  await p.locator('.u9b0').click();
  assert.equal(await p.locator('[data-shop-group="equipment"]').getAttribute('aria-pressed'),'true','Preview return lost parent section');
  assert.equal(await p.locator('[data-shop-cat="mach"]').getAttribute('aria-pressed'),'true','Preview return lost category');
  await p.locator('[data-bc-sku="skin_mach_m_steam"]').getByRole('button',{name:'Купить',exact:true}).click();
  assert(await p.locator('#modalRoot .bc-currency-star').count()>0,'Stars checkout lost');
  await p.evaluate(()=>{while(modals.length)closeModal();openSheet(null);openShop();});
  assert.equal(await p.locator('[data-shop-group="lux"]').getAttribute('aria-pressed'),'true');
  assert.equal(await p.locator('[data-shop-cat="lux-interiors"]').getAttribute('aria-pressed'),'true');
  assert.equal(await p.locator('[data-shop-cat]').count(),2);
  assert.deepEqual(errors,[]);await b.close();console.log('PASS grouped shop: exact eight furniture categories, isolated group screens, separate styles/bar-stools/decor/frames/expansions, every existing category reachable and nonempty, cash buy and Stars checkout preserved, unchanged ownership during navigation, mobile layout, default first section.');
})().catch(e=>{console.error(e);process.exit(1);});
