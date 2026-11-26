const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {acceptLegal} = require('./legal-fixture.cjs');

const wall = 'skin_wall_lux_rehearsal';
const floor = 'skin_floor_lux_asphalt';
const tapes = 'skin_decor_lost_tapes';
const sticker = 'skin_decor_bluti_fruti';
const owl = 'lux_jump_rope_owl';

async function main() {
  const {STORE_ITEMS} = await import('../functions/_store.js');
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors = [], invoices = [], assets = new Set();
    let lux = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if(response.ok()) assets.add(new URL(response.url()).pathname.split('/').at(-1));
    });
    await page.addInitScript(() => {
      window.Telegram={WebApp:{
        initData:'fixture',initDataUnsafe:{user:{id:32145}},ready(){},expand(){},onEvent(){},
        setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){},enableClosingConfirmation(){},
        openInvoice(_link,callback){callback('paid');},BackButton:{show(){},hide(){},onClick(){}},
        HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}
      }};
    });
    await page.route('**/telegram-web-app.js*', route => route.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/api/**', async route => {
      if(new URL(route.request().url()).pathname==='/api/invoice'){
        const {item}=route.request().postDataJSON();
        invoices.push(item);
        lux=[item.slice(4)];
        return route.fulfill({json:{ok:true,link:'https://t.me/$fixture'}});
      }
      await route.fulfill({json:{ok:true,adminTest:false,exists:false,maint:{on:false},
        ops:[],interiors:[],skins:[],extras:[],passes:[],lux,top:[]}});
    });
    await page.goto(process.env.BC_TEST_URL||'http://127.0.0.1:8770/');
    await page.locator('#own').fill('Подвальный клуб');
    await acceptLegal(page);
    await page.locator('#quick').click();
    await page.getByRole('button',{name:'Поехали',exact:true}).click();
    await page.waitForFunction(()=>S && typeof spawnGuest==='function');
    await page.evaluate(()=>{
      while(modals.length) closeModal();
      S.isOpen=false;S.gm=600;S.hours={open:20,close:22};S.money=1000000;
    });
    const catalog=await page.evaluate(()=>BrewCrewLuxuryDecor);
    assert.equal(catalog.length,8);
    for(const item of catalog){
      const product=STORE_ITEMS[item.sku];
      assert.equal(product.title,item.title);
      assert.equal(product.currency,item.currency);
      assert.equal(product.category,item.category);
      assert.equal(product[item.currency==='GAME'?'gamePrice':'stars'],item.price);
    }

    const openTab=cat=>page.evaluate(category=>{while(modals.length) closeModal();window.__shopCat=category;openSheet('hall','shop');},cat);
    const card=sku=>page.locator('#panel [data-bc-sku="'+sku+'"]');
    const modal=page.locator('#modalRoot .modal');
    async function buyForRubles(category,sku){
      await openTab(category);
      await card(sku).getByRole('button',{name:'Купить',exact:true}).click();
      await page.waitForFunction(()=>performance.now()-MODAL_AT>=450);
      await modal.getByRole('button',{name:/Купить за.*₽/}).click();
      await page.waitForFunction(item=>S.c.gameOwned[item],sku);
      await modal.getByRole('heading',{name:STORE_ITEMS[sku].title,exact:true}).waitFor({state:'hidden'});
    }
    await buyForRubles('wall',wall);
    await buyForRubles('floor',floor);
    await buyForRubles('atmosphere',tapes);
    await buyForRubles('atmosphere',sticker);
    assert.equal(await page.evaluate(()=>S.money),625000);
    assert.deepEqual(await page.evaluate(()=>{
      const k=skinS(); return [k.wall,k.floor,!!k.decor.lost_tapes,!!k.decor.bluti_fruti];
    }),['lux_rehearsal','lux_asphalt',true,true]);

    await openTab('lux');
    assert.equal(await page.locator('.bc-lux-decor-grid .bc-lux-decor-card').count(),4);
    assert.equal(await card(wall).count(),0);
    assert(await card('lux_x_cat').count()>0);
    await card(owl).getByRole('button',{name:'Купить',exact:true}).click();
    await page.waitForFunction(()=>performance.now()-MODAL_AT>=450);
    await modal.getByRole('button',{name:/Купить за 149/}).click();
    await page.waitForFunction(()=>S.skinOwned['lux:jump_rope_owl'] && skinS().lux.jump_rope_owl);
    assert.deepEqual(invoices,[owl]);
    await page.evaluate(()=>{while(modals.length)closeModal();renderSheet();});
    await card(owl).getByRole('button',{name:'Убрать',exact:true}).click();
    assert.equal(await page.evaluate(()=>skinS().lux.jump_rope_owl),0);
    await card(owl).getByRole('button',{name:'Применить',exact:true}).click();
    await page.evaluate(()=>openSheet(null));
    for(const asset of ['rehearsal-wall.png','asphalt-floor.png','lost-tapes.png','bluti-fruti.png','jump-rope-owl.png']){
      if(!assets.has(asset)) await page.waitForResponse(response=>response.ok() && response.url().endsWith('/'+asset));
    }

    const review=await page.evaluate(()=>{
      const rng=Math.random;
      const wasOpen=S.isOpen;
      S.rep=4.9;S.isOpen=true;
      try{
        Math.random=()=>.01;
        reviewTick();
        return S.reviews[0];
      }finally{Math.random=rng;S.isOpen=wasOpen;}
    });
    assert(catalog.some(item=>item.review===review.text));
    assert(review.stars>=3);
    await page.evaluate(()=>{setInteriorStyle('int_lux_violet');save();});
    assert.deepEqual(await page.evaluate(()=>{
      const k=skinS();
      return [k.wall,k.floor,!!k.decor.lost_tapes,!!k.decor.bluti_fruti,!!k.lux.jump_rope_owl,
        owns('wall','lux_rehearsal'),owns('floor','lux_asphalt'),owns('lux','jump_rope_owl')];
    }),['cream','oak',false,false,false,true,true,true]);

    const html=readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    const originalClips=JSON.parse(html.match(/^var CM=(\{.*?\});/m)[1]);
    const baseGuestClips=Object.fromEntries(Object.entries(originalClips).filter(([key])=>/^guestm?_/.test(key)));
    const guestArt=await page.evaluate(async (originalClips)=>{
      const art=BrewCrewAlternativeGuests;
      const image=new Image();image.src=art.src;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      const ids=GUESTS.filter(id=>id>=META.length-art.guests.length);
      const names=ids.map((id,i)=>{
        const g={spr:id,gid:500+i};
        normalizeGuestName(g);
        return [g.sex,g.name,RARITY['g'+id],KIDS.includes(id),sprStyle(id,50).includes(art.src)];
      });
      const frames=art.guests.map(g=>Object.entries(art.clips).filter(([name])=>name.startsWith(g.kind+'_')).map(([name,cl])=>{
        const original=originalClips[(g.sex==='f'?'guest':'guestm')+name.slice(g.kind.length)];
        if(cl.f.length!==original.f.length || cl.w!==original.w || cl.h!==original.h ||
          cl.ax!==original.ax || cl.ay!==original.ay || JSON.stringify(cl.hand)!==JSON.stringify(original.hand)){
          throw new Error('Pose or anchor changed: '+name);
        }
        for(const [x,y] of cl.f){
          if(x+cl.w>image.width || y+cl.h>image.height ||
            !ctx.getImageData(x,y,cl.w,cl.h).data.some((value,i)=>i%4===3 && value>0)) throw new Error('Blank pose: '+name);
        }
        return cl.f.length;
      }));
      const normal=GUESTS.filter(id=>RARITY['g'+id]===0);
      const observed=[];
      const rng=Math.random;
      try{
        for(const id of ids){
          const values=[.5,.9,(normal.indexOf(id)+.1)/normal.length];
          Math.random=()=>values.shift()??.8;
          const picked=pickGuestSprite();
          observed.push([picked.spr,picked.kid]);
        }
      }finally{Math.random=rng;}
      return {ids,names,observed,frames:frames.map(x=>[x.length,x.reduce((a,b)=>a+b,0)])};
    },baseGuestClips);
    assert.deepEqual(guestArt.frames,[[35,156],[35,156],[35,156]]);
    assert.deepEqual(guestArt.names.map(g=>[g[0],!!g[1],...g.slice(2)]),
      [['f',true,0,false,true],['m',true,0,false,true],['f',true,0,false,true]]);
    assert.deepEqual(guestArt.observed,guestArt.ids.map(id=>[id,false]));
    assert.deepEqual(errors,[]);
    console.log('PASS: eight decorations and both payment paths; application, removal, style reset and guest reviews; three adult guest appearances with 35 poses and 156 frames each.');
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
