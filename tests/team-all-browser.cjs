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
  const baseline=await p.evaluate(() => {
    while(modals.length)closeModal();S.isOpen=false;S.hours={open:20,close:22};S.gm=600;
    S.staff=[makeYou()];
    const cases=[['work','main'],['sub','main'],['off','main'],['training','main'],['absent','main'],['off',null],['off','retired_room']];
    cases.forEach(([today,room],i)=>{const s=makeStaff(i%2?'Кассир':'Бариста',{sex:i%2?'f':'m',quirk:'none'});Object.assign(s,{id:'team-fixture-'+i,today,room,lvl:i+2});if(i===2)s.vacation=S.day+3;S.staff.push(s);});
    const snapshot=()=>({money:S.money,staff:S.staff.map(s=>({id:s.id,room:s.room,today:s.today,lvl:s.lvl,mood:s.mood})),present:workingStaff('main').map(s=>s.id)});
    window.__teamSnapshot=snapshot;const before=snapshot();openSheet('hall','team');return before;
  });
  const ids=()=>p.locator('#panel [data-staff-id]').evaluateAll(cards=>cards.map(c=>c.dataset.staffId));
  assert.deepEqual(await ids(),['team-fixture-0','team-fixture-1']);
  await p.getByRole('button',{name:/Показать всех/}).click();
  assert.equal((await ids()).length,7,'Employees on leave, training, absent and without room must remain reachable');
  assert.equal(await p.locator('[data-team-filter]').getAttribute('aria-pressed'),'true');
  assert((await p.locator('[data-staff-id="team-fixture-2"]').innerText()).includes('В отпуске'));
  assert((await p.locator('[data-staff-id="team-fixture-3"]').innerText()).includes('На обучении'));
  assert((await p.locator('[data-staff-id="team-fixture-5"]').innerText()).includes('Выходной'));
  assert.deepEqual(await p.evaluate(()=>window.__teamSnapshot()),baseline,'Filtering changed employees, presence or money');
  await p.locator('[data-staff-id="team-fixture-2"]').click();
  await p.waitForFunction(()=>modals.some(m=>m.kind==='staff'&&m.sid==='team-fixture-2'));
  await p.evaluate(()=>{while(modals.length)closeModal();renderPanel();});
  assert.equal((await ids()).length,7,'Selection lost after reopening employee card');
  await p.getByRole('button',{name:/Только на смене/}).click();assert.equal((await ids()).length,2);
  await p.evaluate(()=>{S.staff.filter(s=>!s.isYou).forEach(s=>s.today='off');renderPanel();});
  assert.equal((await ids()).length,0);assert((await p.locator('#panel').innerText()).includes('Сейчас на смене никого нет'));
  await p.getByRole('button',{name:/Показать всех/}).click();assert.equal((await ids()).length,7);
  assert(await p.locator('#panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Team controls overflow mobile screen');
  await p.screenshot({path:'/tmp/bc-team-all.png'});
  await p.evaluate(()=>{S.staff=S.staff.filter(s=>s.isYou);renderPanel();});
  assert.equal(await p.locator('[data-team-filter]').count(),0);assert((await p.locator('#panel').innerText()).includes('Команды пока нет'));
  assert.deepEqual(errors,[]);await b.close();console.log('PASS team: show all statuses and unassigned employees, employee details, stable toggle, empty-shift/empty-team states, unchanged money and scene presence.');
})().catch(e=>{console.error(e);process.exit(1);});
