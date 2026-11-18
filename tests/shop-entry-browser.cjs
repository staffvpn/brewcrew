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
  await p.evaluate(() => { while(modals.length)closeModal(); S.isOpen=false; S.hours={open:20,close:22}; S.gm=600; openSheet(null); window.__shopCat='p:frames'; window.__shopSc=900; });
  await p.locator('[data-s="shop"]').click();
  await p.waitForFunction(() => document.querySelector('.u6cats .u6cat.on'));
  assert(await p.evaluate(() => {const cats=[...document.querySelectorAll('.u6cats .u6cat')];return cats[0].classList.contains('on')&&window.__shopSc===0;}),'Shop must open on its first category');
  // Choose a later category, close and reopen through the actual dock button.
  await p.locator('.u6cats .u6cat').last().click();
  await p.locator('[data-s="shop"]').click();
  await p.locator('[data-s="shop"]').click();
  await p.waitForFunction(() => document.querySelector('.u6cats .u6cat.on'));
  assert(await p.evaluate(() => document.querySelector('.u6cats .u6cat').classList.contains('on')),'Reopening retained the old category');
  await p.evaluate(() => {window.__shopCat='mach';renderPanel();});
  await p.locator('[data-bc-sku="skin_mach_m_steam"]').getByRole('button',{name:'Купить',exact:true}).click();
  await p.waitForFunction(() => document.querySelector('#modalRoot .btn>.bc-money-price'));
  const spacing=await p.evaluate(() => {const price=document.querySelector('#modalRoot .btn>.bc-money-price'),button=price.parentElement,node=[...button.childNodes].find(n=>n.nodeType===3&&n.textContent.includes('Купить за'));const r=document.createRange();r.selectNodeContents(node);return {gap:price.getBoundingClientRect().left-r.getBoundingClientRect().right,margin:parseFloat(getComputedStyle(price).marginInlineStart),text:button.textContent};});
  assert(spacing.gap>=3&&spacing.margin>=3,'Purchase label and price touch: '+JSON.stringify(spacing));
  await p.screenshot({path:process.env.BC_SHOP_SCREENSHOT||'/tmp/bc-shop-spacing.png'});
  assert.deepEqual(errors,[]);await b.close();console.log('PASS shop: first category on every dock opening; Stars checkout has visible label/price spacing.');
})().catch(e=>{console.error(e);process.exit(1);});
