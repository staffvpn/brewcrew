const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { acceptLegal } = require('./legal-fixture.cjs');

const paidStyle = 'int_lux_art_deco';
const grand = 'int_winter_grand';

async function main() {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors = [];
    const invoices = [];
    const art = new Set();
    let receipt = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if(response.ok() && response.url().includes('/img/interiors/')) art.add(response.url().split('/').at(-1));
    });
    await page.addInitScript(() => {
      const NativeDate = Date;
      const december = NativeDate.parse('2026-12-10T12:00:00+03:00');
      const timestamp = () => Number(sessionStorage.getItem('test-date')) || december;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [timestamp()])); }
        static now() { return timestamp(); }
      };
      window.Telegram = {WebApp:{
        initData:'fixture',initDataUnsafe:{user:{id:12345}},ready(){},expand(){},onEvent(){},
        setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){},enableClosingConfirmation(){},
        openInvoice(_link, callback){ callback('paid'); },
        BackButton:{show(){},hide(){},onClick(){}},
        HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}
      }};
    });
    await page.route('**/telegram-web-app.js*', route => route.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if(path==='/api/invoice') {
        const item = route.request().postDataJSON().item;
        invoices.push(item);
        receipt = [item];
        await route.fulfill({json:{ok:true,link:'https://t.me/$testinvoice'}});
        return;
      }
      await route.fulfill({json:{ok:true,exists:false,adminTest:false,ops:[],maint:{on:false},
        interiors:receipt,skins:[],extras:[],passes:[],lux:[],top:[]}});
    });
    await page.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:8770/');
    await page.locator('#own').fill('Награды сезона');
    await acceptLegal(page);
    await page.locator('#quick').click();
    await page.getByRole('button',{name:'Поехали',exact:true}).click();
    await page.waitForFunction(() => !!S);
    await page.evaluate(() => {
      S.hours={open:20,close:22};S.isOpen=false;S.gm=600;
      S.nw={off:true};
      while(modals.length) closeModal();
      skinS();
      Object.assign(S.skinOwned,{'floor:herr':1,'table:dark':1,'art:a_big1':1,'lux:x_cat':1,'room:wide':1});
      S.goldMachine=true;
      equip('room','wide');equip('floor','herr');equip('table','dark');
      equip('art','a_big1');equip('lux','x_cat');
      openShop();
    });

    const collection = page.locator('.bc-luxury-grid');
    assert.equal(await collection.locator('.bc-luxury-card').count(),14);
    const luxTab = page.locator('[data-shop-group="lux"]');
    const luxStar = luxTab.locator('img');
    assert.equal(await luxStar.count(),1);
    const [tabBox,starBox] = await Promise.all([luxTab.boundingBox(),luxStar.boundingBox()]);
    assert(Math.abs(tabBox.y+tabBox.height/2-starBox.y-starBox.height/2)<1,'Lux star is vertically centered');
    const groups=page.locator('[data-shop-cat="lux-interiors"], [data-shop-cat="lux"]');
    assert.deepEqual(await groups.allTextContents(),['Интерьеры','Предметы декора']);
    await page.locator('[data-shop-cat="lux"]').click();
    assert.equal(await collection.count(),0);
    assert(await page.locator('#panel .u6it').count()>0);
    await page.locator('[data-shop-cat="lux-interiors"]').click();
    assert.equal(await collection.locator('[data-bc-sku="int_lux_observatory"]').count(),1);
    assert.equal(await collection.locator('[data-bc-sku="int_lux_coral"]').count(),1);
    assert.equal(await collection.locator(`[data-bc-sku="${grand}"]`).count(),0);
    const first = collection.locator(`[data-bc-sku="${paidStyle}"]`);
    assert.match(await first.innerText(),/599/);
    await first.getByRole('button',{name:/Посмотреть интерьер/}).click();
    const dialog = page.locator('dialog[open]');
    const previewSize = await dialog.locator('img').evaluate(async image => {await image.decode();return [image.naturalWidth,image.naturalHeight];});
    assert.deepEqual(previewSize,[320,360]);
    await dialog.getByRole('button',{name:'Закрыть'}).click();
    await dialog.waitFor({state:'detached'});
    await page.evaluate(() => {while(modals.length) closeModal();});
    assert.equal(await page.evaluate(id => (S.szStyles||[]).includes(id),paidStyle),false);
    await first.getByRole('button',{name:'Купить',exact:true}).click();
    const checkout = page.locator('#modalRoot .modal');
    await checkout.waitFor();
    await page.waitForFunction(() => performance.now()-MODAL_AT>=450);
    await checkout.getByRole('button',{name:/Купить за 599/}).click();
    await page.waitForFunction(id => interiorOf('main')===id,paidStyle);
    assert.deepEqual(invoices,[paidStyle]);
    assert.deepEqual(await page.evaluate(() => {
      const k=skinS();
      return [k.floor,k.table,k.art.a_big1,k.lux.x_cat,k.mach,k.room,
        owns('floor','herr'),owns('table','dark'),owns('art','a_big1'),S.skinOwned['lux:x_cat']];
    }), ['oak','light',0,0,'std','wide',true,true,true,1]);

    await page.evaluate(() => {
      window.__shopCat='floor';openSheet('hall','shop');
    });
    await page.locator('[data-bc-sku="skin_floor_herr"]').getByRole('button',{name:'Применить',exact:true}).click();
    await page.evaluate(() => {
      window.__shopCat='table';openSheet('hall','shop');
    });
    await page.locator('[data-bc-sku="skin_table_dark"]').getByRole('button',{name:'Применить',exact:true}).click();
    assert.deepEqual(await page.evaluate(() => [interiorOf('main'),skinS().floor,skinS().table]),
      [paidStyle,'herr','dark']);

    await page.evaluate(() => {
      while(modals.length) closeModal();
      S.sz={id:sezId(),sp:49*SZ_TIER,acc:0,claimed:{f:[],p:[]},login:null,profit:0,v50:true};
      openSheet('hall','season');
    });
    const finale = page.locator('.sz-row').last().locator('.sz-cell.p');
    assert.match(await finale.innerText(),/Зимний гранд/);
    assert.equal(await finale.getByRole('button',{name:/Посмотреть зал|Примерить/}).count(),0);
    assert.equal(await page.evaluate(() => szClaim('p',50,true)),'Ещё не открыто');
    assert.equal(await page.evaluate(() => {S.sz.sp=50*SZ_TIER;return szClaim('p',50,true);}), 'Нужен пропуск сезона');
    await page.evaluate(() => {
      while(modals.length) closeModal();
      S.ent.passes=[{id:'fixture-pass',season:sezId()}];renderSheet();
    });
    await finale.getByRole('button',{name:'Забрать',exact:true}).click();
    assert.equal(await page.evaluate(id => S.szStyles.filter(k => k===id).length,grand),1);
    assert.equal(await page.evaluate(() => S.inv.filter(i => i.n===50 && i.track==='p' && i.k==='money').length),1);
    assert.equal(await page.evaluate(() => szClaim('p',50,true)),'Уже забрано');
    await finale.getByRole('button',{name:'К стилям зала'}).click();
    const reward = page.locator(`[data-bc-sku="${grand}"]`);
    const files = ['winter_machine.png','winter_grinder.png','winter_garland.png','winter_tree.png','winter_shelf.png','winter_window.png'];
    const sceneAssets = Promise.all(files.filter(file=>!art.has(file)).map(file=>
      page.waitForResponse(response=>response.ok() && response.url().endsWith('/'+file))));
    await reward.getByRole('button',{name:'Поставить',exact:true}).click();
    assert.equal(await page.evaluate(() => interiorOf('main')),grand);
    assert.match(await reward.innerText(),/Стоит/);
    await page.evaluate(() => openSheet(null));
    await sceneAssets;
    assert.deepEqual(await page.evaluate(() => [skinS().floor,skinS().table,skinS().mach]),
      ['oak','light','std']);

    await page.evaluate(() => {window.__shopCat='mach';openSheet('hall','shop');});
    await page.locator('.bc-season-machine').getByRole('button',{name:'Применить',exact:true}).click();
    assert.deepEqual(await page.evaluate(() => [interiorOf('main'),window.MACH_SKIN,window.GRIND_SKIN]),
      [grand,'m_season_gold','std']);
    await page.evaluate(() => {window.__shopCat='style';openSheet('hall','shop');});
    await reward.getByRole('button',{name:'Восстановить стиль',exact:true}).click();
    assert.equal(await page.evaluate(() => window.MACH_SKIN),'std');
    assert.equal(await page.locator('.bc-season-machine').count(),0);

    await page.evaluate(() => {
      sessionStorage.setItem('test-date',Date.parse('2027-01-10T12:00:00+03:00'));
      szState();pathDaily();save();
    });
    assert.equal(await page.evaluate(() => szReward('p',50).finalStyle),undefined);
    await page.reload();
    await page.waitForFunction(id => !!S && interiorOf('main')===id,grand);
    assert.equal(await page.evaluate(id => S.szStyles.filter(k => k===id).length,grand),1);
    assert.deepEqual(errors,[]);
    console.log('PASS: full styles, reapplying owned items, restoring a style, December tier 50, rollover and reload.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error);process.exitCode=1; });
