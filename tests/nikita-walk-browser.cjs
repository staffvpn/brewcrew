const { chromium } = require('playwright');
const assert = require('assert');
const { acceptLegal } = require('./legal-fixture.cjs');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const errors = [];let admin=false;
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    window.Telegram = { WebApp: { initData: 'fixture', initDataUnsafe: { user: { id: 12345 } },
      ready() {}, expand() {}, onEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {}, enableClosingConfirmation() {},
      BackButton: { show() {}, hide() {}, onClick() {} }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }
    } };
  });
  await p.route('**/telegram-web-app.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await p.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
    ok: true, exists: false, adminTest: admin, ops: [], maint: { on: false }, interiors: [], skins: [], extras: [], passes: [], lux: [], top: []
  }) }));
  await p.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:8770/');
  await p.locator('#own').fill('Кандидаты'); await acceptLegal(p); await p.locator('#quick').click();
  await p.getByRole('button', { name: 'Поехали', exact: true }).click();
  await p.waitForFunction(() => S && window.BrewCrewStaffSkins?.ready());
  await p.waitForFunction(()=>window.BrewCrewNikita?.ready());
  await p.evaluate(async()=>{window.__nkOldImage=new Image();window.__nkOldImage.src='img/bloggers/nikita-filya-20261117.png';window.__nkNewImage=new Image();window.__nkNewImage.src=BrewCrewNikitaArt.src;await Promise.all([window.__nkOldImage.decode(),window.__nkNewImage.decode()]);});
  const rendering=await p.evaluate(()=>{
    const check=(v,m)=>{if(!v)throw Error(m);};while(modals.length)closeModal();S.isOpen=false;S.hours={open:20,close:22};S.gm=600;
    S.nik={n:2,next:Date.now()+999999,nextDay:100,solved:{'test-week':true},drink:true};
    const progress=JSON.stringify({money:S.money,rep:S.rep,sz:S.sz,nik:S.nik,staff:S.staff.map(s=>[s.id,s.lvl])});
    const old=window.__nkOldImage,im=window.__nkNewImage;let preserved=0;
    const crop=(image,c,x,y)=>{const canvas=document.createElement('canvas');canvas.width=c.w;canvas.height=c.h;const g=canvas.getContext('2d');g.drawImage(image,x,y,c.w,c.h,0,0,c.w,c.h);return g.getImageData(0,0,c.w,c.h).data;};
    const height=(c,point)=>{const rgba=crop(im,c,...point);let top=c.h,bottom=0;for(let y=0;y<c.h;y++)for(let x=0;x<c.w;x++)if(rgba[(y*c.w+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y+1);}return (bottom-top)*c.k;};
    const idle=BrewCrewNikitaArt.clips['nikita_idle:south'],idleHeights=idle.f.map(point=>height(idle,point)),maxIdle=Math.max(...idleHeights),minIdle=Math.min(...idleHeights);
    for(const [name,c] of Object.entries(BrewCrewNikitaArt.clips)){
      if(name.startsWith('nikita_walk:')){check(c.f.length===6&&c.stride===4.3,'Nikita must use the standard six-frame distance cycle');for(const point of c.f){const h=height(c,point);check(h<=maxIdle*1.06&&h>=minIdle*.93,'Nikita changes size: '+name+' '+h);}}
      else for(const [x,y]of c.f){const a=crop(old,c,x,y),b=crop(im,c,x,y);check(a.length===b.length&&a.every((v,i)=>v===b[i]),'Idle or Filya pixels changed: '+name);preserved++;}
    }
    const dirs={south:['south',false],'south-east':['south-east',false],east:['east',false],'north-east':['north-east',false],north:['north',false],'north-west':['north-east',true],west:['east',true],'south-west':['south-east',true]};
    const original=CanvasRenderingContext2D.prototype.drawImage;let rendered=0;
    try{for(const [direction,[clip,mirror]]of Object.entries(dirs))for(let frame=0;frame<6;frame++){
      const c=BrewCrewNikitaArt.clips['nikita_walk:'+clip];let actual=-1,flipped=false;
      CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image.src?.includes(BrewCrewNikitaArt.src)){actual=c.f.findIndex(([x,y])=>x===args[0]&&y===args[1]);flipped=this.getTransform().a<0;}return original.call(this,image,...args);};
      const actor={_kind:'nikita',x:140,y:350,_px:140,_py:350,_ph:0,_d:direction,_mvT:performance.now()/1000,_dist:(frame+.15)*4.3};ctx.save();ctx.setTransform(1,0,0,1,0,0);check(nikitaDraw(actor),'Nikita not drawn');ctx.restore();check(actual===frame&&flipped===mirror,'Wrong pose/direction at '+direction+'/'+frame);rendered++;
    }}finally{CanvasRenderingContext2D.prototype.drawImage=original;}
    check(JSON.stringify({money:S.money,rep:S.rep,sz:S.sz,nik:S.nik,staff:S.staff.map(s=>[s.id,s.lvl])})===progress,'Drawing changed account/story progress');return {rendered,preserved};
  });
  admin=true;await p.evaluate(async()=>{window.BrewCrewLab=true;await apiPost('/api/admin-test',{kind:'status'});});
  const tours=await p.evaluate(()=>{const results=[];for(const wide of [false,true]){BrewCrewNikita.stopPreview();if(wide)S.skinOwned['room:wide']=1;else delete S.skinOwned['room:wide'];room('main').upg.tables=20;layoutSlots();syncScene('main');drawRoom('main');const r=rt('main');r.guests=[];r.crowd=[];r.staff={};r.queue=[];if(!BrewCrewNikita.startPreview())throw Error('Preview did not start');let moved=0,catMoved=0,out=false;
    const active=new Set(TABLE_SLOTS.slice(0,tableCount(room('main').upg.tables)).filter(t=>t[2]==='table').map(t=>t[3]));
    for(let i=0;i<4500&&BrewCrewNikita.actor();i++){const a=BrewCrewNikita.actor(),before=[a.x,a.y,a.cat.x,a.cat.y];BrewCrewNikita.stepPreview(.1);if(Math.hypot(a.x-before[0],a.y-before[1])>.01)moved++;if(Math.hypot(a.cat.x-before[2],a.cat.y-before[3])>.01)catMoved++;if(a.stage==='out')out=true;for(const actor of [a,a.cat])if(actor.x<BrewCrewNikita.geometry().width-4)for(const id of active){const t=TABLES[id];if(Math.abs(actor.x-t.x)<=39.49&&actor.y>=t.y-9.49&&actor.y<=t.y+21.49)throw Error('Visitor walked through furniture');}}
    if(moved<40||catMoved<40||!out||BrewCrewNikita.actor())throw Error('Tour stalled');results.push({wide,moved,catMoved});}return results;});
  assert.equal(rendering.rendered,48);assert(rendering.preserved>0);assert.deepEqual(errors,[]);await b.close();console.log('PASS Nikita walk: 6 standard frames in all 8 headings, distance pacing/mirroring/scale, identical idle and Filya pixels, unchanged story/finances/staff, both actors complete furniture-aware tours.',rendering,tours);
})().catch(e=>{console.error(e);process.exit(1);});
