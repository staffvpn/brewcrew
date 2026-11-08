const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
function source(name) {
  let start = html.indexOf(`\nfunction ${name}(`);
  if(start === -1) start = html.indexOf(`\nasync function ${name}(`);
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
    FRIDGE_WEAR_PER_DAY:10, DAY_MIN:1440, REAL_PER_GMIN:20000,
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
    assert.ok(Math.abs(c.S.rooms[0].eq.fridge - 99.97916666666667) < 1e-8);
  }
  const c = equipment(); c.equipmentTick(60);
  assert.ok(Math.abs(c.S.rooms[0].eq.fridge - 99.97916666666667) < 1e-8);
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
  assert.ok(Math.abs(r.eq.fridge - 99.97916666666667) < 1e-8);
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
  assert.ok(Math.abs(r.eq.fridge - 19.99965277777778) < 1e-8);
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

test('owner price bonus and starting capital remain bounded', () => {
  const c = load(['shareMult', 'ownerCapital'], {
    S: { shares: 1000000 }, START_CAPITAL: 1000000,
    clamp: (n, a, b) => Math.max(a, Math.min(n, b))
  });
  assert.equal(c.shareMult(), 1.1);
  c.S.shares = 10; assert.equal(c.shareMult(), 1.01);
  c.S.shares = -10; assert.equal(c.shareMult(), 1);
  assert.equal(c.ownerCapital({ capital: 1000 }), 1500000);
  assert.equal(c.ownerCapital({ capital: -1 }), 1000000);
});

test('seasonal staff collection preserves the reward baseline, not cafe training', () => {
  const c = load(['rememberSeasonStaff'], { S: {} });
  const staff = { name: 'Ноябрина', role: 'Бариста', szLeg: '2026-11', lvl: 50, rank: 3, fatigue: 99 };
  c.rememberSeasonStaff(staff, 'legend:2026-11');
  assert.equal(c.S.seasonStaffRewards['legend:2026-11'].lvl, 24);
  assert.equal(c.S.seasonStaffRewards['legend:2026-11'].rank, 2);
  assert.equal(c.S.seasonStaffRewards['legend:2026-11'].fatigue, undefined);
  assert.equal(c.S.seasonStaffUsed['legend:2026-11'], true);
});

test('seasonal gold is preserved but a gold machine bought with game money is not', () => {
  const c = load(['collectSeasonRewards'], { S: { staff: [], goldMachine: true, spends: { goldm: 1 }, sz: { claimed: { p: [] } } } });
  c.collectSeasonRewards(); assert.equal(c.S.seasonRewardAssets.goldMachine, undefined);
  c.S.sz.claimed.p.push(20); c.collectSeasonRewards(); assert.equal(c.S.seasonRewardAssets.goldMachine, true);
});

test('staff reward tickets do not duplicate unclaimed or existing collection tickets', () => {
  const c = load(['restoreSeasonRewardTickets'], {
    S: { inv: [{ uid: 10, rewardKey: 'legend:2026-11' }, { uid: 11, k: 'staff', sz: '2026-11', track: 'p', n: 45 }], seasonStaffRewards: {
      'legend:2026-11': { name: 'Ноябрина' }, 'staff:2026-11:p:45': { name: 'Легенда' }
    } }
  });
  let uid = 100;
  c.invAdd = item => c.S.inv.push({ ...item, uid: uid++ });
  c.restoreSeasonRewardTickets(); c.restoreSeasonRewardTickets();
  assert.equal(c.S.inv.length, 2);
  assert.equal(c.S.inv.filter(x => x.rewardKey === 'legend:2026-11').length, 1);
  assert.equal(c.S.inv.filter(x => x.rewardKey === 'staff:2026-11:p:45').length, 0);
});

test('a collection employee can be summoned only once per cafe, even after dismissal', () => {
  const c = load(['useSeasonStaffReward'], {
    S: { staff: [], inv: [{ uid: 1 }], seasonStaffRewards: { reward: { name: 'Ноябрина', role: 'Бариста', lvl: 24, rank: 2 } } },
    staffCap: () => 1, makeStaff: () => ({ id: 'new' }), syncScene() {}, HOOK: { struct() {} }
  });
  c.hire = s => c.S.staff.push(s);
  const ticket = { uid: 1, rewardKey: 'reward' };
  assert.equal(c.useSeasonStaffReward(ticket), null);
  assert.equal(c.S.staff.length, 1);
  assert.equal(c.S.staff[0].lvl, 24);
  c.S.staff = [];
  assert.match(c.useSeasonStaffReward(ticket), /уже приглашена/);
  assert.equal(c.S.staff.length, 0);
});

test('legacy claimed staff rewards become collection rights without duplicating unopened vouchers', () => {
  const c = load(['rememberSeasonStaff', 'collectSeasonRewards'], {
    S: { staff: [], sz: { id: '2026-11', claimed: { p: [10, 45], f: [10, 35] } }, inv: [{ k: 'staff', sz: '2026-11', track: 'f', n: 35 }] },
    sezInfo: () => ({ leg: { name: 'Ноябрина', sex: 'f' } }),
    szReward: (track, n) => ({ t: 'Легенда', v: track === 'p' ? 25 : n === 10 ? 12 : 16 })
  });
  c.collectSeasonRewards(); c.collectSeasonRewards();
  assert.equal(Object.keys(c.S.seasonStaffRewards).length, 3);
  assert.equal(c.S.seasonStaffRewards['legend:2026-11'].lvl, 24);
  assert.equal(c.S.seasonStaffRewards['staff:2026-11:p:45'].lvl, 25);
  assert.equal(c.S.seasonStaffRewards['staff:2026-11:f:35'], undefined);
  assert.equal(c.S.inv.length, 1);
  assert.equal(c.S.staff.length, 0);
});

test('one game day wears a normal fridge by ten points regardless of frame rate', () => {
  const c=equipment();c.equipmentTick(8*3600);
  assert.ok(Math.abs(c.S.rooms[0].eq.fridge-90)<1e-7);
});
test('repair charges once, clears the pending breakdown and requires available funds', () => {
  const r={broken:{machine:true},eq:{machine:20}};
  const c=load(['repairEquipment'],{S:{active:'main',money:30000,incidents:[{id:'break_machine',room:'main'}]},EQ:{machine:{fix:22000,n:'Кофемашина'}},room:()=>r,chance:()=>true});
  c.canSpend=cost=>c.S.money>=cost;c.spend=cost=>{c.S.money-=cost;};
  assert.equal(c.repairEquipment('main','machine','full',[]),true);
  assert.equal(c.S.money,8000);assert.equal(c.S.incidents.length,0);assert.equal(r.eq.machine,100);
  assert.equal(c.repairEquipment('main','machine','full',[]),false);assert.equal(c.S.money,8000);
  r.broken.machine=true;assert.equal(c.repairEquipment('main','machine','full',[]),false);assert.equal(c.S.money,8000);
});
test('ignored equipment breakdown never orders a paid repair automatically', () => {
  const incident={id:'break_fridge',room:'main'};
  const c=load(['expireIncident'],{S:{incidents:[incident]},EQ:{fridge:{fix:15000}},evDef:()=>({cat:'break',o:[{}]}),HOOK:{toast(){},struct(){}},resolveIncident:()=>assert.fail('Unexpected automatic repair')});
  c.expireIncident(incident);assert.equal(c.S.incidents.length,0);
});
test('preventive maintenance excludes broken equipment and cannot masquerade as a repair', () => {
  const r={eq:{machine:80,fridge:50},broken:{fridge:true}};let charged=0;
  const c=load(['serviceCost','doService'],{EQ:{machine:{fix:22000},fridge:{fix:15000}},canSpend:()=>true,spend:v=>{charged+=v;}});
  assert.equal(c.serviceCost(r),1500);assert.equal(c.doService(r),true);assert.equal(charged,1500);
  assert.equal(r.eq.machine,100);assert.equal(r.eq.fridge,50);assert.equal(r.broken.fridge,true);
});
test('client and server agree on every tested franchise threshold', async()=>{
  const{franchiseThreshold}=await import('../functions/_economy.js');
  const c=load(['franchiseNeed'],{S:{franchises:0}});
  for(let n=0;n<8;n++){c.S.franchises=n;assert.equal(c.franchiseNeed(),franchiseThreshold(n));}
  assert.equal(franchiseThreshold(0),10000000);assert.equal(franchiseThreshold(1),30000000);
});
test('pending seller proceeds are synchronized before a new market purchase', async()=>{
  let tracks=0;
  const c=load(['marketMutate'],{S:{money:120000,franchises:0},marketBusy:false,franchiseBusy:false,crypto:{randomUUID:()=> 'purchase-test-uuid'},save(){},toast(){}});
  c.track=async()=>{tracks++;if(tracks===1){c.S.money+=45000;return{ok:true,ops:[{op:'trsold',amount:45000}]};}return{ok:true,ops:[]};};
  c.mkApi=async()=>{assert.equal(tracks,2);assert.equal(c.S.money,165000);return{ok:true};};
  c.applyMarketReceipt=async()=>true;
  assert.equal(await c.marketMutate('buy',{id:1}),true);assert.equal(c.marketBusy,false);
});
test('a delayed old-network response cannot credit money after a franchise reset',()=>{
  const c=load(['applyTrackOnce'],{S:{franchises:1,money:1000000}});
  c.applyTrackOnce({ok:true,franchises:0,ops:[{id:1,op:'trsold',amount:90000}]},r=>assert.equal(r.ops.length,0));
  assert.equal(c.S.money,1000000);assert.equal(c.S.opsAppliedThrough,undefined);
});
