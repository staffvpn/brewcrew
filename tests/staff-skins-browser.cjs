const { chromium } = require('playwright');
const assert = require('assert');
const { acceptLegal } = require('./legal-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const p = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    window.Telegram = { WebApp: {
      initData: 'fixture', initDataUnsafe: { user: { id: 12345 } }, ready() {}, expand() {}, onEvent() {},
      setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {}, enableClosingConfirmation() {},
      BackButton: { show() {}, hide() {}, onClick() {} }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} }
    } };
  });
  await p.route('**/telegram-web-app.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  // Every server call is mocked, including when checking a deployed build.
  await p.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
    ok: true, exists: false, adminTest: false, ops: [], maint: { on: false }, interiors: [], skins: [], extras: [], passes: [], lux: [], top: []
  }) }));
  await p.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:8770/');
  await p.locator('#own').fill('Новые сотрудники');
  await acceptLegal(p);
  await p.locator('#quick').click();
  await p.getByRole('button', { name: 'Поехали', exact: true }).click();
  await p.waitForFunction(() => window.BrewCrewStaffSkins?.ready() && !!S);

  const result = await p.evaluate(() => {
    const check = (v, m) => { if (!v) throw Error(m); };
    while (modals.length) closeModal();
    S.isOpen = false; S.hours = { open: 20, close: 22 }; S.gm = 600;
    const fixtures = [
      ['Бариста', 'f', 'Лена', 'barista_f'], ['Бариста', 'f', 'Шеф Ноябрина', 'noyabrina'],
      ['Кассир', 'm', 'Егор', 'cashier_m'], ['Официант', 'f', 'Аня', 'waiter_f'],
      ['Кассир', 'f', 'Вика', 'cashier_f'], ['Мойщица', 'f', 'Света', 'washer_f']
    ];
    const people = fixtures.map(([role, sex, name, variant]) => {
      const s = makeStaff(role, { sex, quirk: 'none' });
      Object.assign(s, { name, room: 'main', today: 'work', lvl: 17, rank: 2, mood: 88 });
      if (variant === 'noyabrina') Object.assign(s, { szLeg: '2026-11', prize: true, sex: 'm' });
      return s;
    });
    S.staff.push(...people);
    const before = people.map(s => [s.id, s.name, s.lvl, s.rank, s.mood]);
    const cash = S.money;
    migrate();
    check(S.money === cash, 'Appearance migration changed money');
    people.forEach((s, i) => {
      check(JSON.stringify(before[i]) === JSON.stringify([s.id, s.name, s.lvl, s.rank, s.mood]), 'Staff progress was changed');
      check(BrewCrewStaffSkins.variant(s) === fixtures[i][3], 'Wrong visual identity');
      check(s.sex === fixtures[i][1], 'Wrong gender, including existing Noyabrina');
    });
    for (const role of ['Бариста', 'Кассир', 'Официант']) {
      const sexes = new Set(Array.from({ length: 80 }, () => makeStaff(role).sex));
      check(sexes.has('m') && sexes.has('f'), 'Recruiting excludes a gender: ' + role);
    }
    const calls = [], original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
      if (image.src?.includes('crew-20261117-r2.png')) calls.push(args);
      return original.call(this, image, ...args);
    };
    const rendered = [], portraits = new Set();
    try {
      fixtures.forEach(([role, sex, name, variant], i) => {
        const s = people[i], base = role === 'Бариста' ? 'barista' : role === 'Кассир' ? 'cashier' : role === 'Мойщица' ? 'washer' : 'waiter';
        for (const action of ['idle:south', 'walk:south', 'walk:east', 'walk:north', 'walk:north-east', 'phone:south-east',
          ...(base === 'barista' ? ['work:north', 'carry:east', 'carry:south-east'] : base === 'cashier' ? ['till:south'] : base === 'washer' ? ['wash:north', 'mop:south'] : ['wipe:north'])]) {
          const c = BrewCrewStaffSkins.clip(variant + '_' + action);
          check(c?.f.length, 'Missing animation ' + variant + '_' + action);
          const expectedFrames = action.startsWith('idle:') ? 1 : action.startsWith('phone:') ? 8 : action.startsWith('work:') ? 7 : action.startsWith('wash:') ? 5 : 6;
          check(c.f.length === expectedFrames, 'Incomplete animation ' + variant + '_' + action);
          check(c.ay >= c.h - 6 && c.ay <= c.h - 1, 'Inconsistent feet anchor');
          check(c.k > .9 && c.k < 1.7, 'Invalid sprite scale');
          c.f.forEach(([x, y]) => check(Number.isInteger(x) && Number.isInteger(y), 'Invalid atlas location'));
          if (c.hand) check(c.hand.length === c.f.length && c.hand.every(h => h.every(Number.isFinite)), 'Invalid cup attachment');
        }
        for (const mode of ['idle', 'walk', 'phone', 'work', ...(base === 'washer' ? ['mop'] : [])]) {
          calls.length = 0; rt('main').queue = [];
          const now = performance.now() / 1000;
          const pose = { x: 190, y: 185, t: 0, k: 0, flip: false, walk: false, walker: true, _px: 190, _py: 185, _ph: 0, _d: 'south' };
          s.distract = mode === 'phone' ? { kind: 'phone' } : null;
          let suffix = 'idle:south';
          if (mode === 'phone') suffix = 'phone:south-east';
          if (mode === 'walk') { pose._px = 189; pose._py = 185; pose._d = 'east'; pose._mvT = now; suffix = 'walk:east'; }
          if (mode === 'work') {
            if (base === 'barista') { pose.atMach = true; suffix = 'work:north'; }
            else if (base === 'washer') { pose.washing = true; suffix = 'wash:north'; }
            else if (base === 'waiter') { pose.job = { kind: 'table' }; suffix = 'wipe:north'; }
            else { rt('main').queue = [{ state: 'queue', prog: .5 }]; suffix = 'till:south'; }
          }
          if (mode === 'mop') { pose.job = { kind: 'mess' }; suffix = 'mop:south'; }
          drawStaff(s, pose, 'main');
          const expected = BrewCrewStaffSkins.clip(variant + '_' + suffix);
          check(calls.some(a => expected.f.some(([x, y]) => a[0] === x && a[1] === y)), 'Rendered wrong actor/action: ' + variant + '/' + mode);
          if (base === 'washer' && mode === 'mop') {
            let props = 0; const originalFill = CanvasRenderingContext2D.prototype.fillRect;
            CanvasRenderingContext2D.prototype.fillRect = function(...args) { props++; return originalFill.apply(this, args); };
            try { drawMop(pose, performance.now() / 1000); } finally { CanvasRenderingContext2D.prototype.fillRect = originalFill; }
            check(props >= 2, 'Floor-cleaning animation has no mop');
          }
          rendered.push(variant + '/' + mode);
        }
        const style = sprStyle(staffSpr(s), 64);
        check(style.includes('data:image/png'), 'Missing matching staff portrait');
        portraits.add(style);
      });
      check(portraits.size === 6, 'Different employees share the same portrait');
    } finally { CanvasRenderingContext2D.prototype.drawImage = original; }
    // Persist actual staff and confirm identities remain after real page reload.
    rt('main').queue = [];
    people.forEach(s => { s.distract = null; });
    S.c.staffSkinTest = people.map(s => ({ id: s.id, name: s.name, variant: BrewCrewStaffSkins.variant(s), lvl: s.lvl }));
    save();
    return { rendered, staff: S.c.staffSkinTest };
  });
  await p.reload();
  await p.waitForFunction(() => window.BrewCrewStaffSkins?.ready() && S?.c.staffSkinTest);
  assert.deepEqual(await p.evaluate(() => S.c.staffSkinTest.map(t => {
    const s = S.staff.find(x => x.id === t.id); return { id: s.id, name: s.name, variant: BrewCrewStaffSkins.variant(s), lvl: s.lvl };
  })), result.staff);
  if (process.env.BC_STAFF_SCREENSHOT) {
    await p.evaluate(() => {
      while (modals.length) closeModal(); openSheet(null);
      S.isOpen = true; S.hours = { open: 8, close: 22 }; S.gm = 600; S.incidents = [];
      S.staff = S.staff.filter(s => s.isYou || ['cashier_f', 'washer_f', 'barista_f'].includes(BrewCrewStaffSkins.variant(s)));
      S.staff.forEach(s => { s.room = 'main'; s.today = 'work'; s.distract = null; });
      syncScene('main');
    });
    await p.waitForTimeout(750);
    await p.screenshot({ path: process.env.BC_STAFF_SCREENSHOT });
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS staff skins: all six identities render idle, walk, work and three-quarter phone; portraits, recruitment and existing staff survive migration/reload.');
})().catch(e => { console.error(e); process.exit(1); });
