// POST /api/tour — таблица недельного турнира района и место игрока.
import { json, verifyInitData, ADMINS } from '../_lib.js';
import { tourWeek } from '../_channel.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const week = tourWeek();
  const noAdm = 'AND tg_id NOT IN (' + ADMINS.join(',') + ')';
  const top = ((await env.DB.prepare(`SELECT tg_id, cafe, city, profit FROM tour WHERE week = ?1 ${noAdm} ORDER BY profit DESC LIMIT 10`).bind(week).all()).results || [])
    .map(r => ({ cafe: r.cafe, city: r.city, profit: r.profit, me: r.tg_id === user.id }));
  const mine = await env.DB.prepare('SELECT profit FROM tour WHERE week = ?1 AND tg_id = ?2').bind(week, user.id).first();
  let me = null;
  if (mine) { const above = await env.DB.prepare(`SELECT COUNT(*) n FROM tour WHERE week = ?1 AND profit > ?2 ${noAdm}`).bind(week, mine.profit).first(); me = { profit: mine.profit, rank: (above ? above.n : 0) + 1 }; }
  return json({ ok: true, week, top, me });
}

// GET /api/tour — снимок топ-10 недели, общий для всех, обновляется раз в 5 часов.
const SNAP_MS = 5 * 3600000;
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false }, 503);
  const week = tourWeek(), key = 'top_' + week, now = Date.now();
  try {
    const c = await env.DB.prepare('SELECT val, at FROM cache WHERE key = ?1').bind(key).first();
    if (c && now - c.at < SNAP_MS) return json(Object.assign({ ok: true, week, at: c.at, next: c.at + SNAP_MS }, JSON.parse(c.val)));
  } catch {}
  const noAdm = 'AND tg_id NOT IN (' + ADMINS.join(',') + ')';
  const rows = (await env.DB.prepare(`SELECT t.tg_id, t.cafe, t.city, t.profit, p.badge_name, p.snap FROM tour t LEFT JOIN players p ON p.tg_id = t.tg_id WHERE t.week = ?1 AND t.tg_id NOT IN (${ADMINS.join(',')}) ORDER BY t.profit DESC LIMIT 300`).bind(week).all()).results || [];
  let frs = {}; try { const t10 = rows.slice(0, 10); frs = await framesFor(env, t10.map(r => r.tg_id), t10.map(r => r.snap)); } catch {}
  const snap = { top: rows.slice(0, 10).map(r => ({ cafe: r.cafe, profit: Math.round(r.profit), badge: r.badge_name || null, fr: frs[r.tg_id] || null })), profits: rows.map(r => Math.round(r.profit)), total: rows.length };
  try { await env.DB.prepare('INSERT INTO cache (key, val, at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET val = ?2, at = ?3').bind(key, JSON.stringify(snap), now).run(); } catch {}
  return json(Object.assign({ ok: true, week, at: now, next: now + SNAP_MS }, snap));
}

async function framesFor(env, ids, snaps){ const out = {}; const want = []; ids.forEach((id, i) => { let fr = null; try { fr = JSON.parse(snaps[i] || '{}').fr; } catch {} if (fr && /^[a-z]{2,10}$/.test(fr)) { want.push([id, fr]); } });
  if (!want.length) return out;
  const rows = (await env.DB.prepare(`SELECT tg_id, item FROM purchases WHERE refunded = 0 AND item LIKE 'frame_%' AND tg_id IN (${want.map(w => Number(w[0])).join(',')})`).all()).results || [];
  for (const [id, fr] of want) if (rows.some(r => r.tg_id === id && r.item === 'frame_' + fr)) out[id] = fr;
  return out; }
