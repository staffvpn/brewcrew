const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf(`\nfunction ${name}(`);
  assert.notEqual(start, -1, `Missing function: ${name}`);
  const end = html.indexOf('\n}', start);
  assert.notEqual(end, -1, `Missing function end: ${name}`);
  return html.slice(start, end + 2);
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
