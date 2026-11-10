// POST /api/premium — редкое премиум-помещение: раз в 4 недели на 48 часов выставляется один лот на весь сервер, его забирает первый.
import { json, verifyInitData } from '../_lib.js';
export const PREM_ANCHOR = Date.parse('2026-11-14T09:00:00Z'), PREM_PERIOD = 28 * 86400000, PREM_WINDOW = 48 * 3600000;
export const PREM_LOTS = [
  { id: 'embank', n: 'Особняк на набережной', price: 300000000 },
  { id: 'roof', n: 'Крыша с видом на город', price: 350000000 },
  { id: 'bank', n: 'Бывший банк с хранилищем', price: 400000000 },
  { id: 'station', n: 'Зал ожидания старого вокзала', price: 320000000 }
];
export function premNow(now) { const k = Math.floor((now - PREM_ANCHOR) / PREM_PERIOD); const from = PREM_ANCHOR + Math.max(0, k) * PREM_PERIOD;
  const n = Math.max(0, k); const lot = PREM_LOTS[n % PREM_LOTS.length];
  const open = now >= from && now < from + PREM_WINDOW; const next = now < PREM_ANCHOR ? PREM_ANCHOR : (open ? from : from + PREM_PERIOD);
  return { key: 'prem_' + n, lot, open, from, until: from + PREM_WINDOW, next }; }
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const now = Date.now(), P = premNow(now);
  const owner = await env.DB.prepare("SELECT c.val, p.cafe FROM cache c LEFT JOIN players p ON p.tg_id = CAST(c.val AS INTEGER) WHERE c.key = ?1").bind(P.key).first();
  const base = { ok: true, lot: P.lot, open: P.open && !owner, until: P.until, next: P.next, owner: owner ? owner.cafe || 'кофейня' : null, mine: owner ? Number(owner.val) === user.id : false };
  if (body.op !== 'buy') return json(base);
  if (!P.open) return json({ ok: false, error: 'Лот сейчас не продаётся' });
  if (owner) return json({ ok: false, error: 'Помещение уже купили: «' + (owner.cafe || 'кофейня') + '»' });
  const me = await env.DB.prepare('SELECT money, level FROM players WHERE tg_id = ?1').bind(user.id).first();
  if (!me || (me.money || 0) < P.lot.price * 0.95) return json({ ok: false, error: 'Не хватает денег' });
  const r = await env.DB.prepare("INSERT OR IGNORE INTO cache (key, val, at) VALUES (?1, ?2, ?3)").bind(P.key, String(user.id), now).run();
  if (!r.meta || r.meta.changes !== 1) return json({ ok: false, error: 'Кто-то успел раньше' });
  return json(Object.assign(base, { open: false, owner: 'ты', mine: true, bought: P.lot }));
}
