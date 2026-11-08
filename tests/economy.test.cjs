const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf(`\nfunction ${name}(`);
  assert.notEqual(start, -1, `Missing function: ${name}`);
  for (let end = html.indexOf('}', start); end !== -1; end = html.indexOf('}', end + 1)) {
    const candidate = html.slice(start, end + 1);
    try { new vm.Script(candidate); return candidate; } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  assert.fail(`Missing function end: ${name}`);
}
function load(names, globals) {
  const context = vm.createContext(globals);
  vm.runInContext(names.map(source).join('\n'), context);
  return context;
}

test('build estimate includes fees and matches the actual opening debit', () => {
  const room = { upg: { machine: 0, storage: 0 } };
  const context = load(['buildCost', 'applyBuild'], {
    START_FEES: 150000,
    BUILD: [
      { id: 'machine', opts: [{ price: 70000, set: { machine: 0 }, q: { wear: 2 } }, { price: 220000, set: { machine: 2 }, q: {} }] },
      { id: 'storage', opts: [{ price: 30000, set: { storage: 0 }, q: {} }, { price: 110000, set: { storage: 2 }, q: {} }] }
    ],
    S: { money: 1000000, fin: { today: { invest: 0 } } },
    room: () => room
  });
  for (const machine of [0, 1]) for (const storage of [0, 1]) {
    const choice = { machine, storage };
    context.S.money = 1000000;
    const expected = 150000 + [70000, 220000][machine] + [30000, 110000][storage];
    assert.equal(context.buildCost(choice), expected);
    assert.equal(context.applyBuild(choice), expected);
    assert.equal(context.S.money, 1000000 - expected);
  }
});

test('expiry removes all perishable stock, preserves fresh batches and counts loss once', () => {
  const stock = Object.fromEntries(['milk', 'desserts', 'food', 'sandwiches', 'pastry'].map(k => [k, [{ q: 10, exp: 9 }, { q: 3, exp: 11 }]]));
  stock.beans = 50;
  const context = load(['spoilCheck'], {
    STOCK: Object.fromEntries(Object.keys(stock).map(k => [k, { perish: k !== 'beans', n: k }])),
    S: { day: 10, rooms: [{ broken: {} }], stock, fin: { today: { spoil: 0 } }, flags: {} },
    unitCost: () => 2,
    HOOK: { toast() {} }, fmtR: String, chance: () => false
  });
  context.spoilCheck();
  for (const k of ['milk', 'desserts', 'food', 'sandwiches', 'pastry']) {
    assert.equal(context.S.stock[k].length, 1);
    assert.equal(context.S.stock[k][0].q, 3);
  }
  assert.equal(context.S.stock.beans, 50);
  assert.equal(context.S.fin.today.spoil, 100);
  context.spoilCheck();
  assert.equal(context.S.fin.today.spoil, 100);
  delete context.S.stock.pastry;
  assert.doesNotThrow(() => context.spoilCheck());
});

function equipment() {
  return load(['equipmentFailureChance', 'equipmentTick'], {
    S: { isOpen: true, closedUntil: 0, serviceContract: false, q: { fridge: 1 }, rooms: [{ id: 'main', eq: { machine: 100, terminal: 100, kkt: 100, fridge: 100 }, broken: {} }] },
    clamp: (n, a, b) => Math.max(a, Math.min(n, b)),
    absNow: () => 100,
    chance: () => false,
    breakdown() {}
  });
}
test('equal elapsed time gives equal wear at 30, 60, 120 Hz and in offline-sized steps', () => {
  for (const hz of [30, 60, 120]) {
    const c = equipment();
    for (let i = 0; i < hz * 60; i++) c.equipmentTick(1 / hz);
    assert.ok(Math.abs(c.S.rooms[0].eq.fridge - 97.84) < 1e-8);
  }
  const c = equipment(); c.equipmentTick(60);
  assert.ok(Math.abs(c.S.rooms[0].eq.fridge - 97.84) < 1e-8);
});
test('failure probability compounds by elapsed time instead of frame count', () => {
  const c = equipment(), p = c.equipmentFailureChance(20, 1 / 60);
  assert.ok(Math.abs(p - 20 / 400 / 60) < 1e-12);
  assert.ok(Math.abs((1 - c.equipmentFailureChance(20, 1)) ** 60 - (1 - c.equipmentFailureChance(20, 60))) < 1e-12);
  assert.equal(c.equipmentFailureChance(100, 60), 0);
  assert.equal(c.equipmentFailureChance(20, 0), 0);
});
test('wear respects service, quality, closure and broken equipment', () => {
  const c = equipment(), r = c.S.rooms[0];
  c.S.serviceContract = true; c.S.q.fridge = 2; c.equipmentTick(60);
  assert.ok(Math.abs(r.eq.fridge - 97.84) < 1e-8);
  const before = r.eq.fridge;
  c.S.isOpen = false; c.equipmentTick(60); assert.equal(r.eq.fridge, before);
  c.S.isOpen = true; c.S.closedUntil = 200; c.equipmentTick(60); assert.equal(r.eq.fridge, before);
  c.S.closedUntil = 0; r.broken.fridge = true; c.equipmentTick(60); assert.equal(r.eq.fridge, before);
  r.broken.fridge = false;
  for (const seconds of [0, -1, NaN, Infinity]) c.equipmentTick(seconds);
  assert.equal(r.eq.fridge, before);
});
test('offline step can trigger a worn machine failure and stops wearing a broken fridge', () => {
  const c = equipment(), r = c.S.rooms[0], failures = [];
  r.eq.machine = 20; r.eq.fridge = 20;
  c.chance = () => true;
  c.breakdown = (id, key) => { failures.push(key); r.broken[key] = true; };
  c.equipmentTick(60);
  assert.deepEqual(failures, ['machine', 'fridge']);
  assert.ok(Math.abs(r.eq.fridge - 19.964) < 1e-8);
});

test('server operations are applied once, survive reload and retry acknowledgements', () => {
  const acks = [], applied = [];
  let saved;
  const c = load(['applyTrackOnce'], {
    S: { money: 0 },
    apiPost: (url, body) => { acks.push({ url, ids: [...body.ids] }); return Promise.resolve({ ok: true }); }
  });
  const apply = response => {
    assert.equal(response.goal.total, 99);
    for (const op of response.ops) { c.S.money += op.amount; applied.push(op.id); }
    saved = JSON.stringify(c.S);
  };
  const response = { ok: true, goal: { total: 99 }, ops: [
    { id: 12, amount: 2000 }, { id: 11, amount: 1000 }, { id: 11, amount: 1000 }
  ] };
  c.applyTrackOnce(response, apply);
  assert.equal(c.S.money, 3000);
  assert.deepEqual(applied, [11, 12]);
  c.S = JSON.parse(saved);
  c.applyTrackOnce(response, apply);
  assert.equal(c.S.money, 3000);
  assert.deepEqual(applied, [11, 12]);
  assert.equal(acks[0].url, '/api/ack');
  assert.ok(acks[0].ids.includes(11) && acks[0].ids.includes(12));
  c.applyTrackOnce({ ...response, ops: [{ id: 13, amount: 500 }] }, apply);
  assert.equal(c.S.money, 3500);
  assert.equal(c.S.opsAppliedThrough, 13);
});

test('failed responses do not advance the operation checkpoint', () => {
  const c = load(['applyTrackOnce'], { S: { opsAppliedThrough: 10 } });
  const response = { ok: false, ops: [{ id: 20 }] };
  c.applyTrackOnce(response, r => assert.equal(r, response));
  assert.equal(c.S.opsAppliedThrough, 10);
});

test('fully owned premises pay no turnover rent; leased premises keep the existing rate', () => {
  const c = load(['balRamp', 'leasedRevenue', 'turnoverRent'], {
    S: { level: 12, rooms: [{ id: 'main' }], fin: { hist: [{ rev: 1000000 }] } },
    roomDef: () => ({ rent: 0 }), modMul: () => 1
  });
  assert.equal(c.turnoverRent({ rev: 0 }), 0);
  c.roomDef = () => ({ rent: 8000 });
  assert.equal(c.turnoverRent({ rev: 0 }), 180000);
  assert.equal(c.turnoverRent({ rev: 2000000 }), 360000);
  c.S.level = 4;
  assert.equal(c.turnoverRent({ rev: 2000000 }), 0);
});

test('owning the main cafe excludes its revenue from rent on the remaining leased hall', () => {
  const c = load(['balRamp', 'leasedRevenue', 'turnoverRent'], {
    S: { level: 12, rooms: [{ id: 'main' }, { id: 'hall2' }], fin: { hist: [] } },
    roomDef: id => ({ rent: id === 'main' ? 0 : 10000 }), modMul: () => 1
  });
  assert.equal(c.turnoverRent({ rev: 1100000, byRoom: { main: 1000000, hall2: 100000 } }), 18000);
  assert.equal(c.turnoverRent({ rev: 1000000 }), 0);
});

test('capital refunds increase cash but do not count as operating profit', () => {
  const c = load(['opProfit', 'decorRefund26'], {
    S: { money: 1000, c: {}, decor: { items: [{ id: 'ficus' }, { id: 'season' }] }, fin: { today: { L: { in: { sales: 1000, refunds: 200 }, out: { supply: 300 } } } } },
    NON_OP_IN: vm.runInNewContext(html.match(/^const NON_OP_IN = (.+);$/m)[1]),
    decorDef: id => ({ price: id === 'ficus' ? 150000 : 0 }),
    queueModal() {}, fmt: String, HOOK: { struct() {} }
  });
  c.income = (amount, category) => {
    c.S.money += amount;
    const incoming = c.S.fin.today.L.in;
    incoming[category] = (incoming[category] || 0) + amount;
  };
  c.decorRefund26();
  assert.equal(c.S.money, 151000);
  assert.equal(c.opProfit(c.S.fin.today), 900);
  assert.equal(c.S.decor.items.length, 1);
  c.decorRefund26();
  assert.equal(c.S.money, 151000);
});

test('returning twice without new elapsed time does not repeat offline earnings', () => {
  let runs = 0;
  const c = load(['catchUp'], {
    S: { savedAt: Date.now() - 3600000, money: 1000, day: 1, staff: [], c: { angry: 0, absurd: 0 }, evLast: {}, reviews: [] },
    RT: {}, quietModals: [], ownerSub: () => false, queueModal() {}
  });
  c.simulateOffline = () => { runs++; c.S.money += 100; return { money: 100, guests: 0, mins: 60, expired: 0 }; };
  c.save = () => { c.S.savedAt = Date.now(); };
  c.catchUp(); c.catchUp();
  assert.equal(runs, 1);
  assert.equal(c.S.money, 1100);
});

test('partial offline minutes obey 1:3 time ratio and preserve the remainder', () => {
  const c = load(['simulateOffline'], {
    S: { money: 1000, c: { guests: 0 }, isOpen: false, closedUntil: 0, incidents: [] },
    REAL_PER_GMIN: Number(html.match(/const REAL_PER_GMIN = (\d+)/)[1]),
    gAcc: 0, HOOK: { quiet: false }, ownerSub: () => false, equipmentTick() {}
  });
  let minutes = 0;
  c.advanceGameMinutes = n => { minutes += n; };
  c.simulateOffline(60000);
  assert.equal(minutes, 3);
  c.simulateOffline(10000); c.simulateOffline(10000);
  assert.equal(minutes, 4);
  assert.equal(c.gAcc, 0);
  c.simulateOffline(24 * 3600000);
  assert.equal(minutes, 4 + 12 * 60 * 3); // бесплатный офлайн ограничен 12 часами
  assert.equal(c.HOOK.quiet, false);
});

test('turnover pay is due only when a hired employee worked the shift', () => {
  const c = load(['balRamp', 'turnoverStaffPay'], { S: { level: 12, staff: [{ isYou: true, today: 'work' }, { today: 'off' }] } });
  assert.equal(c.turnoverStaffPay({ rev: 100000 }), 0);
  c.S.staff[1].today = 'work';
  assert.equal(c.turnoverStaffPay({ rev: 100000 }), 10000);
});
