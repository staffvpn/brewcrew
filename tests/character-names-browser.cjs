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
  await p.locator('#own').fill('Правильные имена'); await acceptLegal(p); await p.locator('#quick').click();
  await p.getByRole('button', { name: 'Поехали', exact: true }).click();
  await p.waitForFunction(() => !!S && window.BrewCrewStaffSkins?.ready());
  const result = await p.evaluate(() => {
    const check = (v, m) => { if (!v) throw Error(m); };
    while (modals.length) closeModal(); openSheet(null);
    S.isOpen = false; S.hours = { open: 20, close: 22 }; S.gm = 600;
    const ordinary = [
      ['Кассир', 'f', 'Анатолий'], ['Бариста', 'm', 'Екатерина'], ['Мойщица', 'f', 'Подмена Дмитрий'],
      ['Официант', 'm', 'Виктория'], ['Бариста', 'f', 'Саша'], ['Кассир', 'm', 'Женя']
    ].map(([role, sex, name]) => Object.assign(makeStaff(role, { sex, quirk: 'none' }), { name, lvl: 19, rank: 2, mood: 83, room: 'main', today: 'work' }));
    const named = LEGENDS.map((def, i) => Object.assign(makeStaff(def.role, { sex: def.sex, quirk: 'none' }), {
      name: def.name, sex: def.sex === 'f' ? 'm' : 'f', legendId: i + 1, lvl: 23, rank: 2, room: 'main', today: 'work'
    }));
    const viktor = Object.assign(makeStaff('Бариста', { sex: 'f', quirk: 'genius' }), { name: 'Виктор', room: 'main', today: 'work' });
    const flag = Object.assign(makeStaff('Бариста', { sex: 'm' }), { name: 'Виктория Флагманский', flag34: true, prize: true, room: 'main', today: 'work' });
    const nov = Object.assign(makeStaff('Бариста', { sex: 'm' }), { name: 'Шеф Ноябрина', szLeg: '2026-11', prize: true, room: 'main', today: 'work' });
    const people = [...ordinary, ...named, viktor, flag, nov];
    S.staff.push(...people);
    const candidate = Object.assign(makeStaff('Кассир', { sex: 'f' }), { name: 'Дмитрий В.' });
    S.cands.push(candidate);
    const before = people.map(s => [s.id, s.lvl, s.rank, s.mood, s.quirk, s.legendId, s.prize, s.szLeg]);
    const cash = S.money;
    normalizeStaffNames();
    ordinary.forEach((s, i) => check(personNameSex(s.name) === s.sex && s.sex === ['f', 'm', 'f', 'm', 'f', 'm'][i], 'Ordinary name mismatch: ' + s.name));
    check(ordinary[2].name.startsWith('Подмена '), 'Substitute title was lost');
    check(ordinary[4].name === 'Александра' && ordinary[5].name === 'Евгений', 'Ambiguous names were not made explicit');
    check(candidate.sex === 'f' && personNameSex(candidate.name) === 'f', 'Candidate name mismatch');
    named.forEach((s, i) => check(s.name === LEGENDS[i].name && s.sex === LEGENDS[i].sex, 'Named legend identity changed: ' + s.name));
    check(viktor.name === 'Виктор' && viktor.sex === 'm', 'Story Viktor became a woman');
    check(flag.name === 'Виктория Флагманская' && flag.sex === 'f', 'Owner-name prize gender is inconsistent');
    check(nov.name === 'Шеф Ноябрина' && nov.sex === 'f', 'November legend gender mismatch');
    people.forEach((s, i) => check(JSON.stringify(before[i]) === JSON.stringify([s.id, s.lvl, s.rank, s.mood, s.quirk, s.legendId, s.prize, s.szLeg]), 'Name fix changed staff progress'));
    for (const role of Object.keys(ROLES)) for (const sex of ['m', 'f']) for (let i = 0; i < 12; i++) {
      const s = makeStaff(role, { sex }); normalizeStaffName(s);
      check(s.sex === sex && personNameSex(s.name) === sex && sexOf(staffSpr(s)) === sex, 'New recruit name/sprite mismatch: ' + role + '/' + sex);
    }
    // A female chef must keep the female chef sprite, including her portrait.
    const grandma = named.find(s => s.name === 'Бабушка Зина'), widths = [];
    check(grandma && grandma.sex === 'f', 'Missing female chef fixture');
    const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) { widths.push(image.naturalWidth || image.width); return originalDraw.call(this, image, ...args); };
    try { drawStaff(grandma, { x: 220, y: 180, t: 0, walk: false, flip: false }, 'main'); }
    finally { CanvasRenderingContext2D.prototype.drawImage = originalDraw; }
    check(widths.includes(1400), 'Female chef still uses the male animation body');
    check(sprStyle(staffSpr(grandma), 64).includes('background-image:'), 'Female chef portrait shows a male cook');
    const r = rt('main'), seen = new Set();
    for (let i = 0; i < 180; i++) {
      r.guests = []; r.queue = []; r.pickup = []; r.seats.fill(null);
      spawnGuest('main', null, true);
      const g = r.guests[0]; check(g, 'Guest did not spawn');
      check(g.sex === sexOf(g.spr) && personNameSex(g.name) === g.sex, 'Guest name and rendered sprite disagree');
      seen.add(g.sex);
    }
    check(seen.size === 2, 'Guest generator did not cover both genders');
    for (const def of REGULARS) {
      r.guests = []; r.queue = []; r.pickup = []; r.seats.fill(null);
      spawnGuest('main', { id: def.id, spr: 34 }, true);
      const g = r.guests[0];
      check(g && g.name === def.n && g.sex === def.sex && sexOf(g.spr) === def.sex, 'Named guest identity mismatch: ' + def.n);
    }
    const wrongGirl = { gid: 1801, spr: 34, sex: 'm', name: 'Анатолий', _body: 'guestm' };
    const wrongBoy = { gid: 1802, spr: 33, sex: 'f', name: 'Екатерина', _body: 'guest' };
    r.guests = [wrongGirl, wrongBoy]; r.queue = [];
    normalizeGuestNames();
    check(wrongGirl.sex === 'f' && personNameSex(wrongGirl.name) === 'f' && !wrongGirl._body, 'Existing female guest was not repaired');
    check(wrongBoy.sex === 'm' && personNameSex(wrongBoy.name) === 'm' && !wrongBoy._body, 'Existing male guest was not repaired');
    r.guests = []; r.queue = []; r.pickup = []; r.crowd = []; r.seats.fill(null);
    check(S.money === cash, 'Identity repairs changed money');
    S.c.nameTest = people.map(s => ({ id: s.id, name: s.name, sex: s.sex, lvl: s.lvl, rank: s.rank }));
    save();
    return S.c.nameTest;
  });
  await p.reload(); await p.waitForFunction(() => S?.c.nameTest && window.BrewCrewStaffSkins?.ready());
  assert.deepEqual(await p.evaluate(() => S.c.nameTest.map(t => {
    const s = S.staff.find(x => x.id === t.id); return { id: s.id, name: s.name, sex: s.sex, lvl: s.lvl, rank: s.rank };
  })), result);
  assert.deepEqual(errors, []); await b.close();
  console.log('PASS character names: all staff roles/genders, full names, substitutes, candidates, legends, flagship/story staff, female cook visuals, 180 guests, all named regulars, cached guests and reload; progress unchanged.');
})().catch(e => { console.error(e); process.exit(1); });
