// POST /api/league — лига кофеен: бронза, серебро, золото по прибыли за неделю (пн–вс по Москве).
// op:'push' {w, p} — прибыль за неделю от игрока; op:'get' — моя лига и таблица.
import { json, verifyInitData, ADMINS, sezId } from '../_lib.js';
import { tourWeek } from '../_channel.js';
export const REL10_AT = Date.parse('2026-12-01T09:00:00Z');
export async function rel10Off(env) { try { const r = await env.DB.prepare("SELECT val FROM cache WHERE key = 'rel10_off'").first(); return !!(r && r.val === '1'); } catch { return false; } }
const UP = n => n >= 3 ? Math.max(1, Math.floor(n * 0.2)) : 0;
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS league (tg_id INTEGER PRIMARY KEY, tier INTEGER NOT NULL DEFAULT 0, updated_at INTEGER)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS league_week (week TEXT NOT NULL, tg_id INTEGER NOT NULL, tier INTEGER NOT NULL DEFAULT 0, profit REAL NOT NULL DEFAULT 0, cafe TEXT, updated_at INTEGER, PRIMARY KEY (week, tg_id))').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS snowball (from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, day TEXT NOT NULL, from_cafe TEXT, at INTEGER NOT NULL, PRIMARY KEY (from_id, day))').run();
  ready = true;
}
const mskDay = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
async function hasPass(env, id) {
  if (ADMINS.includes(id)) return true;
  const rows = (await env.DB.prepare("SELECT created_at FROM purchases WHERE tg_id = ?1 AND refunded = 0 AND item IN ('pass','pass15')").bind(id).all()).results || [];
  const cur = sezId(); return rows.some(r => sezId(r.created_at) === cur);
}
function prevWeek(w) { const d = new Date(w + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); }
// итоги прошлой недели: подъём, спуск и корона. Один раз на неделю.
async function rollover(env) {
  const cur = tourWeek(), prev = prevWeek(cur);
  const done = await env.DB.prepare("SELECT val FROM cache WHERE key = 'league_rolled'").first();
  if (done && done.val >= cur) return;
  await env.DB.prepare("INSERT INTO cache (key, val, at) VALUES ('league_rolled', ?1, ?2) ON CONFLICT(key) DO UPDATE SET val = ?1, at = ?2").bind(cur, Date.now()).run();
  const noAdm = 'AND tg_id NOT IN (' + ADMINS.join(',') + ')';
  let crown = null;
  for (let t = 0; t <= 2; t++) {
    const rows = (await env.DB.prepare(`SELECT tg_id, cafe, profit FROM league_week WHERE week = ?1 AND tier = ?2 ${noAdm} ORDER BY profit DESC`).bind(prev, t).all()).results || [];
    const n = rows.length, up = t < 2 ? UP(n) : 0, down = t > 0 ? UP(n) : 0;
    for (let i = 0; i < n; i++) {
      let nt = t; if (i < up) nt = t + 1; else if (down && i >= n - down) nt = t - 1;
      if (nt !== t) await env.DB.prepare('INSERT INTO league (tg_id, tier, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(tg_id) DO UPDATE SET tier = ?2, updated_at = ?3').bind(rows[i].tg_id, nt, Date.now()).run();
    }
    if (t === 2 && n) crown = { tg: rows[0].tg_id, cafe: rows[0].cafe, week: cur, from: prev };
  }
  await env.DB.prepare("INSERT INTO cache (key, val, at) VALUES ('league_crown', ?1, ?2) ON CONFLICT(key) DO UPDATE SET val = ?1, at = ?2").bind(JSON.stringify(crown), Date.now()).run();
}
async function view(env, me) {
  const week = tourWeek(); const noAdm = 'AND tg_id NOT IN (' + ADMINS.join(',') + ')';
  const lr = await env.DB.prepare('SELECT tier FROM league WHERE tg_id = ?1').bind(me).first(); const tier = lr ? lr.tier : 0;
  const rows = (await env.DB.prepare(`SELECT tg_id, cafe, profit FROM league_week WHERE week = ?1 AND tier = ?2 ${noAdm} ORDER BY profit DESC LIMIT 200`).bind(week, tier).all()).results || [];
  const n = rows.length, idx = rows.findIndex(r => r.tg_id === me);
  const mine = idx >= 0 ? rows[idx] : await env.DB.prepare('SELECT profit FROM league_week WHERE week = ?1 AND tg_id = ?2').bind(week, me).first();
  let crown = null; try { const c = await env.DB.prepare("SELECT val FROM cache WHERE key = 'league_crown'").first(); const v = c && JSON.parse(c.val); if (v && v.week === week) crown = { cafe: v.cafe, me: v.tg === me, week: v.week, from: v.from }; } catch {}
  const hour = Date.now() - 3600000; let hits = [], hitSet = new Set(), thrown = false;
  try {
    hits = ((await env.DB.prepare('SELECT from_cafe, at FROM snowball WHERE to_id = ?1 AND at > ?2 ORDER BY at DESC LIMIT 5').bind(me, hour).all()).results || []).map(h => ({ cafe: h.from_cafe || 'Кофейня', at: h.at }));
    const ids = rows.slice(0, 10).map(r => r.tg_id);
    if (ids.length) ((await env.DB.prepare('SELECT DISTINCT to_id FROM snowball WHERE at > ?1 AND to_id IN (' + ids.join(',') + ')').bind(hour).all()).results || []).forEach(r => hitSet.add(r.to_id));
    thrown = !!(await env.DB.prepare('SELECT 1 FROM snowball WHERE from_id = ?1 AND day = ?2').bind(me, mskDay()).first());
  } catch {}
  return { week, tier, n, hits, thrown, up: tier < 2 ? Math.max(1, UP(n)) : 0, down: tier > 0 ? Math.max(1, UP(n)) : 0, rank: idx >= 0 ? idx + 1 : null, me: mine ? Math.round(mine.profit) : null,
    top: rows.slice(0, 10).map(r => ({ cafe: r.cafe, p: Math.round(r.profit), me: r.tg_id === me, snow: hitSet.has(r.tg_id) })), crown };
}
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const adm = ADMINS.includes(user.id);
  if ((!adm && Date.now() < REL10_AT) || await rel10Off(env)) return json({ ok: true, off: true });
  try {
    await ensure(env); if (Date.now() >= REL10_AT) await rollover(env);
    if (body.op === 'push') {
      const w = tourWeek();
      if (body.w === w) {
        const p = await env.DB.prepare('SELECT cafe, best_day, banned FROM players WHERE tg_id = ?1').bind(user.id).first();
        if (p && !p.banned) {
          const cap = Math.max(300000, (p.best_day || 0) * 8);
          const profit = Math.max(-cap, Math.min(cap, Number(body.p) || 0));
          const lr = await env.DB.prepare('SELECT tier FROM league WHERE tg_id = ?1').bind(user.id).first();
          if (!lr) await env.DB.prepare('INSERT OR IGNORE INTO league (tg_id, tier, updated_at) VALUES (?1, 0, ?2)').bind(user.id, Date.now()).run();
          await env.DB.prepare('INSERT INTO league_week (week, tg_id, tier, profit, cafe, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(week, tg_id) DO UPDATE SET profit = ?4, cafe = ?5, updated_at = ?6')
            .bind(w, user.id, lr ? lr.tier : 0, profit, p.cafe || 'Кофейня', Date.now()).run();
        }
      }
    }
    if (body.op === 'snow') {
      const i = Number(body.i);
      if (!(await hasPass(env, user.id))) return json({ ok: false, error: 'Снежки есть только в пропуске сезона' });
      const week = tourWeek(); const noAdm = 'AND tg_id NOT IN (' + ADMINS.join(',') + ')';
      const lr = await env.DB.prepare('SELECT tier FROM league WHERE tg_id = ?1').bind(user.id).first(); const tier = lr ? lr.tier : 0;
      const rows = (await env.DB.prepare(`SELECT tg_id, cafe FROM league_week WHERE week = ?1 AND tier = ?2 ${noAdm} ORDER BY profit DESC LIMIT 10`).bind(week, tier).all()).results || [];
      const t = rows[i];
      if (!t || t.tg_id === user.id) return json({ ok: false, error: 'В эту кофейню не попасть' });
      const me = await env.DB.prepare('SELECT cafe FROM players WHERE tg_id = ?1').bind(user.id).first();
      const r = await env.DB.prepare('INSERT OR IGNORE INTO snowball (from_id, to_id, day, from_cafe, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(user.id, t.tg_id, mskDay(), (me && me.cafe) || 'Кофейня', Date.now()).run();
      if (!r.meta || !r.meta.changes) return json({ ok: false, error: 'Снежок на сегодня уже брошен', d: await view(env, user.id) });
      return json({ ok: true, hit: t.cafe, d: await view(env, user.id) });
    }
    return json({ ok: true, d: await view(env, user.id) });
  } catch (e) { return json({ ok: false, error: 'Лига временно недоступна' }); }
}
