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
  await p.evaluate(() => {
    while (modals.length) closeModal();
    S.isOpen = false; S.hours = { open: 20, close: 22 }; S.gm = 600;
    const cases = [
      ['Бариста', 'm', 'Егор'], ['Бариста', 'f', 'Лена'],
      ['Кассир', 'm', 'Денис'], ['Кассир', 'f', 'Марина'],
      ['Официант', 'm', 'Стас'], ['Официант', 'f', 'Вера'],
      ['Мойщица', 'm', 'Паша'], ['Мойщица', 'f', 'Света'],
      ['Повар', 'm', 'Макс'], ['Повар', 'f', 'Катя']
    ];
    S.cands = cases.map(([role, sex, name]) => Object.assign(makeStaff(role, { sex, quirk: 'none' }), { name, lvl: 3, room: null }));
    S.cands.push(Object.assign(makeStaff('Бариста', { sex: 'm' }), { name: 'Шеф Ноябрина', szLeg: '2026-11', prize: true }));
    S.cands.push(Object.assign(makeStaff('Повар', { sex: 'm' }), { name: 'Бабушка Зина', legendId: LEGENDS.findIndex(l => l.name === 'Бабушка Зина') + 1 }));
    S.candsAt = Date.now() + 600000;
    S.c.candidatePortraitTest = S.cands.map(s => ({ id: s.id, name: s.name, sex: s.sex, role: s.role }));
    openSheet('hall', 'team');
  });
  const inspectCards = () => p.evaluate(() => {
    const check = (v, m) => { if (!v) throw Error(m); };
    const cards = [...document.querySelectorAll('.u8cand')];
    check(cards.length === S.cands.length, 'Wrong number of actual candidate cards');
    S.cands.forEach((candidate, i) => {
      const card = cards[i], portrait = card.querySelector('.u8cp .spr') || card.querySelector('.u8cp');
      check(card.querySelector('.u8ci .t').textContent === candidate.name, 'Wrong candidate name in card');
      check(personNameSex(candidate.name) === candidate.sex, 'Name gender mismatch');
      const expected = document.createElement('div');
      expected.className = 'spr'; expected.style.cssText = sprStyle(staffSpr(candidate), 74);
      expected.style.position = 'absolute'; expected.style.visibility = 'hidden'; document.body.append(expected);
      const actualStyle = getComputedStyle(portrait), expectedStyle = getComputedStyle(expected);
      for (const field of ['backgroundImage', 'backgroundPosition', 'backgroundSize']) {
        check(actualStyle[field] === expectedStyle[field], 'Candidate portrait differs from staff portrait: ' + candidate.role + '/' + candidate.sex + '/' + field);
      }
      expected.remove();
    });
    return cards.length;
  });
  assert.equal(await inspectCards(), 12);
  // A stale candidate can arrive while the game is already open, after migration.
  const fixed = await p.evaluate(() => {
    S.cands[3].name = 'Дмитрий';
    const before = { id: S.cands[3].id, lvl: S.cands[3].lvl, money: S.money };
    renderPanel();
    const after = S.cands[3];
    if (after.sex !== 'f' || personNameSex(after.name) !== 'f' || after.id !== before.id || after.lvl !== before.lvl || S.money !== before.money) throw Error('Rendering failed to repair a stale candidate safely');
    S.c.candidatePortraitTest = S.cands.map(s => ({ id: s.id, name: s.name, sex: s.sex, role: s.role }));
    save(); return S.c.candidatePortraitTest;
  });
  assert.equal(await inspectCards(), 12);
  await p.reload();
  await p.waitForFunction(() => S?.c.candidatePortraitTest && window.BrewCrewStaffSkins?.ready());
  await p.evaluate(() => openSheet('hall', 'team'));
  assert.equal(await inspectCards(), 12);
  assert.deepEqual(await p.evaluate(() => S.cands.map(s => ({ id: s.id, name: s.name, sex: s.sex, role: s.role }))), fixed);
  // The portrait shown before hiring must be the same person in the crew card.
  const hired = await p.evaluate(() => {
    const c = S.cands[3], image = document.querySelectorAll('.u8cand')[3].querySelector('.u8cp .spr');
    return { id: c.id, name: c.name, sex: c.sex, image: getComputedStyle(image).backgroundImage };
  });
  await p.locator('.u8cand').nth(3).locator('.u8y').click();
  await p.waitForFunction(id => S.staff.some(s => s.id === id), hired.id);
  assert(await p.evaluate(expected => {
    const s = S.staff.find(s => s.id === expected.id);
    const card = [...document.querySelectorAll('button.card.staff.badge-card')].find(c => c.querySelector('.t')?.textContent === expected.name);
    return s?.name === expected.name && s.sex === expected.sex && card && getComputedStyle(card.querySelector('.spr')).backgroundImage === expected.image;
  }, hired));
  assert.deepEqual(errors, []); await b.close();
  console.log('PASS candidate cards: actual DOM portraits match names/gender for both genders in all five roles, including female chef; stale candidates repair on render and survive reload.');
})().catch(e => { console.error(e); process.exit(1); });
