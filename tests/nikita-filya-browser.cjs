const { chromium } = require('playwright');
const assert = require('assert');
const { acceptLegal } = require('./legal-fixture.cjs');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  let admin = false;
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
  await p.goto('http://127.0.0.1:8770/');
  await p.locator('#own').fill('Никита и Филя');
  await acceptLegal(p);
  await p.locator('#quick').click();
  await p.getByRole('button', { name: 'Поехали', exact: true }).click();
  await p.waitForFunction(() => !!S && window.BrewCrewNikita?.ready());
  await p.evaluate(() => {
    if (BrewCrewNikita.actor() !== null || BrewCrewNikita.startPreview()) throw Error('A regular player can start the draft event');
    for (const who of ['nikita', 'filya']) {
      for (const direction of ['south', 'south-east', 'east', 'north-east', 'north']) {
        const clip = BrewCrewNikita.clip(who + '_walk:' + direction);
        if (!clip || clip.f.length !== 8) throw Error('Missing eight-frame walk: ' + who + '/' + direction);
      }
      if (BrewCrewNikita.clip(who + '_idle:south').f.length !== 4) throw Error('Missing idle animation');
    }
    while (modals.length) closeModal();
    const host = document.createElement('div');
    sub = 'book'; renderMore(host); document.body.append(host); host.id = 'nikita-test-card';
    const tile = host.querySelector('[data-blogger="nikita"]');
    if (!tile || !tile.textContent.includes('Событие появится позже')) throw Error('Missing draft card');
    tile.click();
  });
  assert.equal(await p.getByRole('button', { name: 'Посмотреть прогулку', exact: true }).count(), 0);
  admin = true;
  await p.evaluate(async () => {
    while (modals.length) closeModal();
    document.querySelector('#nikita-test-card').remove();
    window.BrewCrewLab = true;
    await apiPost('/api/admin-test', { kind: 'status' });
  });
  const result = await p.evaluate(() => {
    const check = (v, m) => { if (!v) throw Error(m); };
    while (modals.length) closeModal(); openSheet(null);
    S.isOpen = false; S.hours = { open: 20, close: 22 }; S.gm = 600;
    const money = S.money, reputation = S.rep, season = JSON.stringify(S.sz);
    const results = [];
    for (const expanded of [false, true]) {
      BrewCrewNikita.stopPreview();
      if (expanded) { skinS(); S.skinOwned['room:wide'] = 1; skinS().room = 'wide'; room('main').upg.tables = 20; }
      layoutSlots(); syncScene('main'); drawRoom('main');
      const r = rt('main'); r.guests = []; r.crowd = []; r.staff = {}; r.queue = [];
      if (expanded) r.guests.push({ x: BrewCrewNikita.geometry().width / 2, y: H - 38, spr: GUESTS[0], state: 'wait', h: 64 });
      check(BrewCrewNikita.startPreview(), 'Admin cannot start preview');
      const actor = BrewCrewNikita.actor(), cat = actor.cat;
      check(actor !== cat && cat._kind === 'filya' && actor._kind === 'nikita', 'Cat must be an independent actor');
      const activeTables = new Set(TABLE_SLOTS.slice(0, tableCount(room('main').upg.tables)).filter(t => t[2] === 'table').map(t => t[3]));
      const blocked = p => [...activeTables].some(id => {
        const t = TABLES[id]; return t && Math.abs(p.x - t.x) <= 39.49 && p.y >= t.y - 9.49 && p.y <= t.y + 21.49;
      });
      let moved = 0, catMoved = 0, arrived = false;
      for (let i = 0; i < 4500 && BrewCrewNikita.actor(); i++) {
        const a = BrewCrewNikita.actor(), old = [a.x, a.y, a.cat.x, a.cat.y];
        BrewCrewNikita.stepPreview(.1);
        if (Math.hypot(a.x - old[0], a.y - old[1]) > .01) moved++;
        const step = Math.hypot(a.cat.x - old[2], a.cat.y - old[3]);
        if (step > .01) catMoved++;
        check(step < 6, 'Cat teleports instead of walking');
        for (const who of [a, a.cat]) if (who.x < BrewCrewNikita.geometry().width - 4) {
          check(!blocked(who), 'Visitor walked through a table');
          for (const guest of r.guests) check(Math.hypot(who.x - guest.x, who.y - guest.y) >= 7.99, 'Visitor walked through a regular guest');
        }
        if (a.stage === 'out') arrived = true;
      }
      check(moved > 40 && catMoved > 40, 'Both visitors must actually walk '+JSON.stringify({expanded,moved,catMoved,actor:BrewCrewNikita.actor(),sheet,modals:modals.map(m=>m.kind)}));
      check(arrived, 'Visitors stalled before completing the cafe tour');
      check(!BrewCrewNikita.actor(), 'Both visitors must leave through the door '+JSON.stringify({expanded,actor:BrewCrewNikita.actor()}));
      results.push({ expanded, moved, catMoved });
    }
    check(S.money === money && S.rep === reputation && JSON.stringify(S.sz) === season, 'Preview changed economic or seasonal progress');
    check(!S.nikita && !S.filya, 'Preview created a story state');
    return results;
  });
  // Let real animation frames draw both independent actors into the live room.
  await p.evaluate(() => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    window.__nkDrawn = { person: false, cat: false };
    window.__nkRestore = () => { CanvasRenderingContext2D.prototype.drawImage = original; };
    const keys = kind => new Set(Object.entries(BrewCrewNikitaArt.clips).filter(([k]) => k.startsWith(kind + '_')).flatMap(([, c]) => c.f.map(p => p.join(','))));
    const person = keys('nikita'), cat = keys('filya');
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
      if (image.src?.includes('nikita-filya-20261117.png')) {
        const key = args[0] + ',' + args[1];
        if (person.has(key)) window.__nkDrawn.person = true;
        if (cat.has(key)) window.__nkDrawn.cat = true;
      }
      return original.call(this, image, ...args);
    };
    if (!BrewCrewNikita.startPreview()) throw Error('Cannot start live rendering check');
  });
  await p.waitForFunction(() => window.__nkDrawn?.person && window.__nkDrawn.cat);
  await p.waitForFunction(() => { const a = BrewCrewNikita.actor(); return a && a.x < BrewCrewNikita.geometry().width - 35 && a.cat.x < BrewCrewNikita.geometry().width - 10; });
  await p.screenshot({ path: '/tmp/bc-nikita-scene.png' });
  await p.evaluate(() => { BrewCrewNikita.stopPreview(); window.__nkRestore(); });
  assert.deepEqual(errors, []);
  await b.close();
  console.log('PASS Nikita/Filya: separate PixelLab actors, 5-direction walks/idles, draft without event, admin-only preview, furniture navigation and following in both cafe sizes, no progress changes.', result);
})().catch(e => { console.error(e); process.exit(1); });
