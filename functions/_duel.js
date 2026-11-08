// Дуэли «Помнить заказ»: генерация заказов по зерну и подсчёт очков. Всё считает сервер.
export const DRINKS = ['Эспрессо', 'Американо', 'Капучино', 'Латте', 'Раф', 'Флэт уайт'];
export const SIZES = ['S', 'M', 'L'];
export const MILKS = ['Обычное', 'Овсяное', 'Кокосовое', 'Без лактозы'];
export const ADDS = ['Без сахара', 'Карамель', 'Ваниль', 'Лаванда'];
const NOMILK = ['Эспрессо', 'Американо'];
const SIZEW = { S: 'маленький', M: 'средний', L: 'большой' };
const MILKW = { 'Обычное': '', 'Овсяное': 'на овсяном', 'Кокосовое': 'на кокосовом', 'Без лактозы': 'на безлактозном' };
const ADDW = { 'Без сахара': 'без сахара', 'Карамель': 'с карамелью', 'Ваниль': 'с ванилью', 'Лаванда': 'с лавандой' };
const DRW = { 'Эспрессо': 'эспрессо', 'Американо': 'американо', 'Капучино': 'капучино', 'Латте': 'латте', 'Раф': 'раф', 'Флэт уайт': 'флэт уайт' };
const FILLER = ['Так, мне, пожалуйста,', 'Слушайте внимательно:', 'Я быстро, я опаздываю:', 'Можно мне', 'Короче, смотрите:', 'Здравствуйте. Значит, так:', 'Запишите, а то я забуду:'];
const TWIST = ['Нет, подождите,', 'А, и ещё:', 'Хотя нет,', 'Ой, поменяйте:'];

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function sayItem(it) { const p = [SIZEW[it.s], DRW[it.d]]; if (it.m && MILKW[it.m]) p.push(MILKW[it.m]); if (it.a) p.push(ADDW[it.a]); return p.join(' '); }

// 5 гостей: первый уже с молоком и добавкой, дальше больше позиций и подвох
export function makeGuests(seed) {
  const r = rng(seed); const pick = a => a[Math.floor(r() * a.length)];
  const item = (full) => { const d = pick(DRINKS); const it = { d, s: pick(SIZES), m: '', a: '' };
    if (!NOMILK.includes(d)) it.m = full || r() < 0.6 ? pick(MILKS.slice(1)) : 'Обычное';
    it.a = full || r() < 0.55 ? pick(ADDS) : ''; return it; };
  const plan = [[1, true, false], [2, false, false], [2, true, false], [2, true, true], [3, true, true]];
  const out = [];
  plan.forEach(([n, full, twist], gi) => {
    const items = []; for (let k = 0; k < n; k++) { let it = item(full); if (gi === 0 && NOMILK.includes(it.d)) it = Object.assign(it, { d: 'Латте', m: pick(MILKS.slice(1)) }); items.push(it); }
    let text = pick(FILLER) + ' ' + items.map(sayItem).join(', и ещё ') + '.';
    if (twist) { const j = Math.floor(r() * items.length); const old = items[j]; const ns = SIZES[(SIZES.indexOf(old.s) + 1 + Math.floor(r() * 2)) % 3];
      items[j] = Object.assign({}, old, { s: ns }); text += ' ' + pick(TWIST) + ' ' + DRW[old.d] + ' сделайте ' + SIZEW[ns] + '.'; }
    out.push({ items, text, read: Math.round((2.6 + n * 1.5 + (twist ? 1.2 : 0)) * 10) / 10, spr: Math.floor(r() * 100000) });
  });
  return out;
}
export function publicGuests(seed) { return makeGuests(seed).map(g => ({ text: g.text, read: g.read, spr: g.spr, n: g.items.length })); }

function clean(it) { if (!it || typeof it !== 'object') return null; const d = DRINKS.includes(it.d) ? it.d : null; if (!d) return null;
  return { d, s: SIZES.includes(it.s) ? it.s : '', m: NOMILK.includes(d) ? '' : (MILKS.includes(it.m) ? it.m : ''), a: ADDS.includes(it.a) ? it.a : '' }; }

// ans: [[{d,s,m,a}...] x5], ms: [время на сбор каждого гостя]
export function scoreDuel(seed, ans, ms) {
  const gs = makeGuests(seed); let total = 0; const det = [];
  gs.forEach((g, i) => {
    const got = (Array.isArray(ans && ans[i]) ? ans[i] : []).slice(0, 3).map(clean).filter(Boolean);
    const t = Number(ms && ms[i]) || 0;
    let pts = 0, max = 0; const used = new Set();
    g.items.forEach(w => { max += 4; let best = -1, bi = -1;
      got.forEach((x, k) => { if (used.has(k)) return; const sc = (x.d === w.d) + (x.s === w.s) + ((x.m || '') === (w.m || '')) + ((x.a || '') === (w.a || '')); if (sc > best) { best = sc; bi = k; } });
      if (bi >= 0) { used.add(bi); pts += best; } });
    pts = Math.max(0, pts - (got.length - used.size) * 2);
    let sc = Math.round(pts / max * 10);
    if (t < 900 * g.items.length) sc = 0; // собрать заказ быстрее, чем физически можно, нельзя
    total += sc; det.push({ want: g.items, got, sc });
  });
  return { total, det };
}
