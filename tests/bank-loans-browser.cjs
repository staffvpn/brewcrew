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
  // Isolated fixtures; all API reads/writes are mocked, also against a deployed build.
  await p.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({
    ok: true, exists: false, adminTest: false, ops: [], maint: { on: false }, interiors: [], skins: [], extras: [], passes: [], lux: [], top: []
  }) }));
  await p.goto(process.env.BC_TEST_URL || 'http://127.0.0.1:8770/');
  await p.locator('#own').fill('Проверка банка'); await acceptLegal(p); await p.locator('#quick').click();
  await p.getByRole('button', { name: 'Поехали', exact: true }).click();
  await p.waitForFunction(() => !!S);
  await p.evaluate(() => {
    while (modals.length) closeModal();
    S.isOpen = false; S.hours = { open: 20, close: 22 }; S.gm = 600; S.restock = false;
    S.staff = []; S.tasks = []; S.pending = []; S.mods = []; S.incidents = []; S.level = 15;
    S.money = 50000; S.fin.today = blankFin(); S.fin.today.open = S.money; S.fin.hist = [];
    S.bank29 = null; S.bankBan29 = 0; S.c.loansPaid = 0;
    openSheet('hall', 'money');
  });
  // Reproduce the player's exact flow: borrow, spend, earn back, repay before due.
  await p.locator('[data-bank-offer="micro"]').click();
  await p.waitForSelector('[data-bank-action="repay"]');
  assert.equal(await p.evaluate(() => S.money), 150000);
  await p.evaluate(() => { spend(100000, 'supply', 'Закупка после кредита'); refreshAfford(); });
  assert(await p.locator('[data-bank-action="repay"]').isDisabled());
  await p.evaluate(() => {
    const button = document.querySelector('[data-bank-action="repay"]');
    income(150000, 'sales', 'Накоплено на возврат'); refreshAfford();
    if (button.disabled) throw Error('Existing repayment button did not become affordable');
  });
  // Real periodic affordability updater, without closing or reopening the cash screen.
  await p.waitForFunction(() => !document.querySelector('[data-bank-action="repay"]').disabled);
  assert(await p.evaluate(() => S.day < S.bank29.due));
  await p.evaluate(() => { window.__oldLoan = S.bank29; window.__oldRepay = document.querySelector('[data-bank-action="repay"]'); window.__oldRestructure = document.querySelector('[data-bank-action="restructure"]'); });
  await p.locator('[data-bank-action="repay"]').click();
  assert.equal(await p.evaluate(() => S.bank29), null);
  assert.equal(await p.evaluate(() => S.money), 0);
  assert.equal(await p.locator('[data-bank-action="repay"]').count(), 0);
  const audit = await p.evaluate(() => {
    const check = (v, m) => { if (!v) throw Error(m); };
    const near = (a, b, m) => check(Math.abs(a - b) < .01, m + ': ' + a + ' != ' + b);
    HOOK.quiet = true; HOOK.event = () => {}; HOOK.modal = () => {}; Math.random = () => .5;
    let f = S.fin.today;
    near(f.L.in.loan, 100000, 'Borrowed principal missing');
    near(f.L.out.loan, 100000, 'Returned principal missing');
    near(f.L.out.interest, 100000, 'Interest missing');
    near(opProfit(f), -50000, 'Loan changed operating profit incorrectly');
    near(f.open + finIn(f) - finOut(f), S.money, 'Cash reconciliation');
    check(S.c.loansPaid === 1, 'Early repayment not counted');
    const settled = S.money; check(bankRepay() === false, 'Closed loan repaid twice'); near(S.money, settled, 'Duplicate repayment debit');
    // Detached old buttons must not settle or restructure a different new loan.
    bankTake(BANK29[1]); const next = S.bank29, back = next.back, rep = S.rep, money = S.money;
    __oldRepay.click(); __oldRestructure.click();
    check(S.bank29 === next && next.back === back && !next.rs && S.rep === rep && S.money === money, 'Stale bank button affected a new contract');
    const reset = (cash = 1000000) => {
      S.day++; S.bank29 = null; S.bankBan29 = 0; S.c.loansPaid = 0;
      S.money = cash; S.fin.today = blankFin(); S.fin.today.open = S.money; S.fin.hist = [];
      S.debt.loan = 0; S.debt.stage = 0; S.debt.daysNeg = 0; S.isOpen = false; S.gm = 600;
    };
    for (const offer of BANK29) {
      reset(20000000); const start = S.money, activity = { rev: S.fin.today.rev, earned: S.c.earnedRun, tax: S.fin.taxAcc, level: S.level };
      check(bankTake(offer), 'Offer rejected: ' + offer.id);
      near(S.money - start, offer.sum, 'Wrong borrowed amount');
      check(S.bank29.back === offer.back && S.bank29.due === S.day + 14, 'Wrong contract terms');
      check(!bankTake(offer), 'Second concurrent credit');
      check(bankRepay(), 'Early repayment refused: ' + offer.id);
      near(S.money, start + offer.sum - offer.back, 'Wrong full repayment');
      check(S.fin.today.rev === activity.rev && S.c.earnedRun === activity.earned && S.fin.taxAcc === activity.tax && S.level === activity.level, 'Credit granted revenue, tax or level progress');
      near(S.fin.today.L.out.loan, offer.sum, 'Principal split');
      near(S.fin.today.L.out.interest, offer.back - offer.sum, 'Interest split');
      near(opProfit(S.fin.today), -(offer.back - offer.sum), 'Principal leaked into profit');
      near(S.fin.today.open + finIn(S.fin.today) - finOut(S.fin.today), S.money, 'Offer cash reconciliation');
    }
    reset(200000); S.level = 1;
    check(!bankTake(BANK29[1]) && !S.bank29 && S.money === 200000, 'Level gate bypass');
    check(!bankTake({ id: 'not-an-offer', sum: 1e12, back: 1 }), 'Unknown offer accepted');
    S.bankBan29 = S.day + 2; check(!bankTake(BANK29[0]), 'Credit ban bypass');
    renderPanel(); check([...document.querySelectorAll('[data-bank-offer]')].every(b => b.disabled), 'Banned offers look available');
    S.day = S.bankBan29; check(bankTake(BANK29[0]), 'Expired ban still blocks credit');
    // The bank can help a negative cash balance; taking credit has no affordability gate.
    reset(-50000); S.level = 15; renderPanel();
    check(!document.querySelector('[data-bank-offer="micro"]').disabled, 'Negative cash blocked a loan offer');
    check(bankTake(BANK29[0]) && S.money === 50000, 'Borrowing while negative failed');
    reset(0); bankTake(BANK29[0]); const original = S.bank29, due = original.due;
    const insufficient = S.money; check(!bankRepay(), 'Paid with insufficient funds'); near(S.money, insufficient, 'Failed repayment charged cash');
    const beforeRestructureRep = S.rep;
    check(bankRestructure(original), 'Restructure refused');
    check(original.back === 125000 && original.rs === 1 && original.due === S.day + 21, 'Wrong restructure terms');
    near(S.rep, beforeRestructureRep - .1, 'Wrong restructure reputation');
    check(!bankRestructure(original), 'Restructure repeated');
    income(25000, 'admin', 'На досрочный возврат'); check(bankRepay(), 'Restructured loan cannot repay early');
    near(S.money, 0, 'Restructured repayment');
    near(S.fin.today.L.out.loan, 100000, 'Restructured principal');
    near(S.fin.today.L.out.interest, 25000, 'Restructured interest');
    S.day = due + 30; check(!bankDue() && S.money === 0 && !S.bankBan29, 'Repaid loan charged at old deadline');
    // Automatic settlement is exactly once and counts successful repayment.
    reset(500000); bankTake(BANK29[0]); const auto = S.bank29; S.day = auto.due - 1;
    check(!bankDue(), 'Autopay ran before due day');
    renderHud(); check(document.querySelector('.pill.loan29').textContent.includes('1 дн.'), 'Tomorrow shown as today');
    S.day = auto.due; const beforeAuto = S.money;
    check(bankDue() && !S.bank29 && S.c.loansPaid === 1, 'Autopay did not settle/count');
    near(S.money, beforeAuto - 200000, 'Wrong automatic debit');
    check(!bankDue(), 'Autopay repeated'); near(S.money, beforeAuto - 200000, 'Repeated automatic debit');
    reset(0); bankTake(BANK29[0]); spend(100000, 'supply', 'Потрачен кредит'); const defaultDue = S.bank29.due; S.day = defaultDue;
    const sad = { id: 'sad', mood: 0 }, normal = { id: 'normal', mood: 50 }, owner = { id: 'owner', isYou: true, mood: 80 }; S.staff = [sad, normal, owner];
    check(bankDue() && !S.bank29 && S.money === -200000, 'Default amount wrong');
    check(S.bankBan29 === S.day + 14 && !S.c.loansPaid, 'Default history wrong');
    check(!bankDue() && S.money === -200000, 'Default charged twice');
    check(sad.mood === 0 && normal.mood === 40 && owner.mood === 80, 'Default mood penalty wrong'); S.staff = [];
    // Numeric old saves remain usable; malformed sums must never zero the wallet.
    reset(500000); S.bank29 = { id: 'micro', n: 'Старый кредит', sum: '100000', back: '200000', due: String(S.day + 14), took: String(S.day) };
    check(bankRepay() && S.money === 300000, 'Numeric legacy loan did not settle');
    for (const corrupt of [{ sum: undefined, back: 200000 }, { sum: 100000, back: NaN }, { sum: 100000, back: -10 }]) {
      const contract = { n: 'Неполный договор', ...corrupt, due: S.day }; S.bank29 = contract;
      const wallet = S.money; check(!bankRepay() && !bankDue(), 'Malformed credit was paid');
      check(S.bank29 === contract && S.money === wallet, 'Malformed credit deleted debt or money');
    }
    reset(125000.5); S.bank29 = { n: 'Договор с копейками', sum: 100000, back: 125000.5, due: S.day + 14 }; renderPanel(); refreshAfford();
    check(!document.querySelector('[data-bank-action="repay"]').disabled && bankRepay() && S.money === 0, 'Exact fractional balance cannot repay');
    // A real reload after repayment must not resurrect the previous active credit.
    reset(300000); bankTake(BANK29[0]); const finalDue = S.bank29.due; check(bankRepay(), 'Final loan failed');
    S.c.bankTest = { due: finalDue, cash: S.money, paid: S.c.loansPaid }; save();
    return S.c.bankTest;
  });
  await p.reload(); await p.waitForFunction(() => S?.c.bankTest);
  assert(await p.evaluate(expected => {
    const before = S.money; S.day = expected.due; const result = bankDue();
    return !result && !S.bank29 && before === expected.cash && S.money === before && S.c.loansPaid === expected.paid;
  }, audit));
  // The separate event loan also supports full early payment and then stops daily debits.
  await p.evaluate(() => {
    while (modals.length) closeModal();
    S.bank29 = null; S.money = 700000; S.debt.loan = 390000;
    openSheet('hall', 'money');
  });
  await p.getByRole('button', { name: 'Погасить долг', exact: true }).click();
  assert(await p.evaluate(() => {
    if (S.debt.loan !== 0 || S.money !== 310000) return false;
    S.fin.today = blankFin(); S.fin.today.open = S.money; S.isOpen = true; closeDay();
    const f = S.fin.hist[0]; return !(f.L.out.loan || f.L.out.interest);
  }));
  assert.deepEqual(errors, []); await b.close();
  console.log('PASS bank: real spend/earn/early-repay flow with live button, all offers, level/ban/negative-cash rules, one-time restructure, stale buttons, successful/default autopay, ledger reconciliation, invalid save safety no debt resurrection after reload, and event-loan early payment.');
})().catch(e => { console.error(e); process.exit(1); });
