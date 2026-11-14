// POST /api/city — Город: районы по 4 улицы, на улице 12 участков (0 — угол, только за звёзды).
// Пока город не выпущен (cache city_on != '1'), работает только для админов.
import { json, verifyInitData, ADMINS } from '../_lib.js';
const STREETS = 4, PLOTS = 12, LV = [1, 10, 20, 30];
const COLORS = ['#c96f4a','#6f8f6a','#8a6bb0','#b5873a','#3f5c7a','#b8574a','#5b7f8f','#7d6a9e','#a47c5b','#5d8a6b','#9b5f78','#4f6f99'];
const wk = () => { const d = new Date(Date.now() + 3 * 3600000); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };
export async function cityOn(env) { const r = await env.DB.prepare("SELECT val FROM cache WHERE key = 'city_on'").first(); return !!(r && r.val === '1'); }
async function weekly(env) {
  const k = wk(); const c = await env.DB.prepare("SELECT val FROM cache WHERE key = 'city_wk'").first(); if (c && c.val === k) return;
  await env.DB.prepare("INSERT INTO cache (key, val, at) VALUES ('city_wk', ?1, ?2) ON CONFLICT(key) DO UPDATE SET val = ?1, at = ?2").bind(k, Date.now()).run();
  await env.DB.batch([
    env.DB.prepare(`UPDATE city_plots SET crown = CASE WHEN tg_id IN (SELECT tg_id FROM (SELECT c.tg_id, p.earned - c.wk_earned d,
      ROW_NUMBER() OVER (PARTITION BY c.district, c.street ORDER BY p.earned - c.wk_earned DESC) rn FROM city_plots c JOIN players p ON p.tg_id = c.tg_id) WHERE rn = 1 AND d > 0) THEN 1 ELSE 0 END`),
    env.DB.prepare('UPDATE city_plots SET wk_earned = COALESCE((SELECT earned FROM players WHERE players.tg_id = city_plots.tg_id), 0)'),
    env.DB.prepare('DELETE FROM city_plots WHERE tg_id IN (SELECT tg_id FROM players WHERE last_seen < ?1)').bind(Date.now() - 30 * 86400000)
  ]);
}
async function freePlot(env, district, street) {
  const used = new Set(((await env.DB.prepare('SELECT plot FROM city_plots WHERE district = ?1 AND street = ?2').bind(district, street).all()).results || []).map(r => r.plot));
  for (let i = 1; i < PLOTS; i++) if (!used.has(i)) return i; return -1;
}
async function join(env, me) {
  const now = Date.now(); let district = null;
  if (me.referrer) { const r = await env.DB.prepare('SELECT district FROM city_plots WHERE tg_id = ?1').bind(me.referrer).first(); if (r && await freePlot(env, r.district, 0) > 0) district = r.district; }
  if (district == null) { const r = await env.DB.prepare(`SELECT district FROM city_plots WHERE street = 0 GROUP BY district HAVING COUNT(*) < ?1 ORDER BY district LIMIT 1`).bind(PLOTS - 1).first();
    if (r) district = r.district; else { const m = await env.DB.prepare('SELECT MAX(district) m FROM city_plots').first(); district = (m && m.m != null ? m.m : 0) + 1; } }
  for (let tries = 0; tries < 3; tries++) { const plot = await freePlot(env, district, 0);
    if (plot < 0) { district++; continue; }
    const r = await env.DB.prepare('INSERT OR IGNORE INTO city_plots (tg_id, district, street, plot, wk_earned, created_at) VALUES (?1, ?2, 0, ?3, ?4, ?5)').bind(me.tg_id, district, plot, me.earned || 0, now).run();
    if (r.meta && r.meta.changes === 1) return; }
}
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN); if (!user || !user.id) return json({ ok: false }, 401);
  if (!ADMINS.includes(user.id) && !(await cityOn(env))) return json({ ok: false, error: 'Город ещё строится' }, 403);
  const me = await env.DB.prepare('SELECT tg_id, cafe, level, earned, referrer, banned FROM players WHERE tg_id = ?1').bind(user.id).first();
  if (!me || !me.cafe || me.banned) return json({ ok: false, error: 'Сначала открой кофейню' });
  await weekly(env);
  let mine = await env.DB.prepare('SELECT * FROM city_plots WHERE tg_id = ?1').bind(user.id).first();
  if (!mine) { await join(env, me); mine = await env.DB.prepare('SELECT * FROM city_plots WHERE tg_id = ?1').bind(user.id).first(); }
  if (!mine) return json({ ok: false, error: 'Не нашли свободный участок, попробуй ещё раз' });
  const owned = new Set(((await env.DB.prepare("SELECT item FROM purchases WHERE tg_id = ?1 AND refunded = 0 AND item LIKE 'city_%'").bind(user.id).all()).results || []).map(r => r.item));
  let msg = null;
  if (body.move != null) { const st = Number(body.move);
    if (!(st >= 0 && st < STREETS) || st === mine.street) return json({ ok: false, error: 'Эта улица не подходит' });
    if ((me.level || 1) < LV[st]) return json({ ok: false, error: 'Переезд сюда с ' + LV[st] + ' уровня' });
    let plot = owned.has('city_corner') && !(await env.DB.prepare('SELECT 1 FROM city_plots WHERE district = ?1 AND street = ?2 AND plot = 0').bind(mine.district, st).first()) ? 0 : await freePlot(env, mine.district, st);
    if (plot < 0) return json({ ok: false, error: 'На этой улице в твоём районе всё занято' });
    await env.DB.prepare('UPDATE city_plots SET street = ?1, plot = ?2, moved_at = ?3, crown = 0 WHERE tg_id = ?4').bind(st, plot, Date.now(), user.id).run(); msg = 'moved';
  }
  if (body.corner && owned.has('city_corner') && mine.plot !== 0) {
    const busy = await env.DB.prepare('SELECT 1 FROM city_plots WHERE district = ?1 AND street = ?2 AND plot = 0').bind(mine.district, mine.street).first();
    if (busy) return json({ ok: false, error: 'Угол на этой улице уже занят' });
    await env.DB.prepare('UPDATE city_plots SET plot = 0 WHERE tg_id = ?1').bind(user.id).run(); msg = 'corner';
  }
  if (body.color != null && owned.has('city_color')) { const c = COLORS[Number(body.color)] || null; await env.DB.prepare('UPDATE city_plots SET color = ?1 WHERE tg_id = ?2').bind(c, user.id).run(); msg = 'color'; }
  if (msg) mine = await env.DB.prepare('SELECT * FROM city_plots WHERE tg_id = ?1').bind(user.id).first();
  const rows = ((await env.DB.prepare(`SELECT c.tg_id, c.street, c.plot, c.color, c.crown, p.cafe, p.level, p.referrer, p.last_seen, v.vk,
      EXISTS(SELECT 1 FROM purchases u WHERE u.tg_id = c.tg_id AND u.item = 'city_neon' AND u.refunded = 0) neon
    FROM city_plots c JOIN players p ON p.tg_id = c.tg_id LEFT JOIN cafe_view v ON v.tg_id = c.tg_id WHERE c.district = ?1 AND p.banned = 0`).bind(mine.district).all()).results || []);
  const plots = rows.map(r => ({ s: r.street, p: r.plot, cafe: r.cafe, lv: r.level, color: r.color || COLORS[(r.tg_id % COLORS.length + COLORS.length) % COLORS.length],
    crown: r.crown ? 1 : 0, neon: r.neon ? 1 : 0, vk: r.vk || null, me: r.tg_id === user.id ? 1 : 0,
    friend: (r.referrer === user.id || me.referrer === r.tg_id) ? 1 : 0, sleep: Date.now() - r.last_seen > 7 * 86400000 ? 1 : 0 }));
  return json({ ok: true, district: mine.district, street: mine.street, plot: mine.plot, owned: [...owned], colors: COLORS, lv: LV, plots, msg, on: await cityOn(env) });
}
