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
  const data=await p.evaluate(()=>{
    while(modals.length)closeModal();S.isOpen=false;S.hours={open:20,close:22};S.gm=600;S.staff=[makeYou()];
    for(let i=0;i<9;i++){const legendary=i===3?LEGENDS.findIndex(l=>l.name==='Бариста-бариста')+1:i===4?2:0;const def=legendary?LEGENDS[legendary-1]:null;const s=makeStaff(def?def.role:i%2?'Кассир':'Бариста',{sex:def?def.sex:i%2?'f':'m',quirk:def?def.quirk:'none'});Object.assign(s,{id:'nine-'+i,room:'main',today:'work',lvl:18,rank:1});if(def){s.name=def.name;s.legendId=legendary;}S.staff.push(s);}
    S.staff.find(s=>s.id==='nine-3').wish={k:'legacy_wish',by:S.day+2};
    let error=null;try{openSheet('hall','team');}catch(e){error=e.message;}
    return {working:workingStaff('main').length,stored:S.staff.filter(s=>!s.isYou).length,cards:document.querySelectorAll('#panel [data-staff-id]').length,error};
  });
  console.log(data);assert.equal(data.working,9);assert.equal(data.stored,9);assert.equal(data.cards,9,'Nine saved workers must render nine cards even with an old wish');assert.equal(data.error,null);
  assert.equal(await p.locator('[data-staff-fallback]').count(),0,'Old wish must render a full card');
  assert((await p.locator('[data-staff-id="nine-3"]').innerText()).includes('Бариста-бариста'));
  assert((await p.locator('[data-staff-id="nine-4"]').innerText()).includes('Шеф Эдуард'));
  for(const id of ['nine-3','nine-4']){
    await p.locator('[data-staff-id="'+id+'"]').click();
    await p.waitForFunction(id=>modals.some(m=>m.kind==='staff'&&m.sid===id),id);
    assert(await p.locator('#modalRoot .mood').count()>0,'Legendary employee details did not open');
    await p.evaluate(()=>{while(modals.length)closeModal();});
  }
  const expected=await p.evaluate(()=>{const records=S.staff.filter(s=>!s.isYou).map(s=>({id:s.id,name:s.name,legendId:s.legendId||0,lvl:s.lvl,rank:s.rank}));S.c.nineTest={money:S.money,records};save();return S.c.nineTest;});
  await p.reload();await p.waitForFunction(()=>S?.c.nineTest&&BrewCrewStaffSkins.ready());
  await p.evaluate(()=>{while(modals.length)closeModal();openSheet('hall','team');});
  assert.equal(await p.locator('[data-staff-id]').count(),9);
  const restored=await p.evaluate(()=>({money:S.money,records:S.staff.filter(s=>!s.isYou).map(s=>({id:s.id,name:s.name,legendId:s.legendId||0,lvl:s.lvl,rank:s.rank}))}));assert.deepEqual(restored,expected,'Reload changed staff identity, level or money');
  assert.equal(await p.evaluate(()=>S.staff.find(s=>s.id==='nine-3').wish.k),'legacy_wish','Rendering discarded old saved data');
  await p.screenshot({path:'/tmp/bc-team-nine-fixed.png'});
  // An independently damaged row must remain visible and cannot hide later employees.
  await p.evaluate(()=>{const s=makeStaff('Бариста',{quirk:'none'});Object.assign(s,{id:'old-role',name:'Старый сотрудник',role:'Устаревшая роль',room:'main',today:'off'});S.staff.splice(3,0,s);renderPanel();});
  assert.equal(await p.locator('[data-staff-id]').count(),10);assert.equal(await p.locator('[data-staff-fallback]').count(),1);
  assert(await p.locator('[data-staff-id="nine-4"]').isVisible());
  assert.equal(await p.evaluate(()=>S.staff.filter(s=>!s.isYou).length),10,'Rendering deleted a damaged employee');
  assert.deepEqual(errors,[]);await b.close();console.log('PASS team nine: 9 saved/working employees render 9 full cards, old wish retained, legendary barista and Eduard details open, reload retains IDs/levels/money, damaged row cannot hide following employees.');
})().catch(e=>{console.error(e);process.exit(1);});
