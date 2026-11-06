// GET /api/season — снимок топ-10 сезона (по очкам), общий для всех, обновляется раз в 5 часов.
import { json, ADMINS, sezId } from '../_lib.js';
const SNAP_MS = 5 * 3600000;
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false }, 503);
  const season = sezId(), key = 'sz_' + season, now = Date.now();
  try { const c = await env.DB.prepare('SELECT val, at FROM cache WHERE key = ?1').bind(key).first(); if (c && now - c.at < SNAP_MS) return json(Object.assign({ ok: true, season, at: c.at }, JSON.parse(c.val))); } catch {}
  const rows = (await env.DB.prepare(`SELECT s.tg_id, s.cafe, s.city, s.sp, s.badge, p.badge_name, p.snap FROM season s LEFT JOIN players p ON p.tg_id = s.tg_id WHERE s.season = ?1 AND s.tg_id NOT IN (${ADMINS.join(',')}) ORDER BY s.sp DESC LIMIT 300`).bind(season).all()).results || [];
  let frs = {}; try { const t10 = rows.slice(0, 10); frs = await framesFor(env, t10.map(r => r.tg_id), t10.map(r => r.snap)); } catch {}
  const snap = { top: rows.slice(0, 10).map(r => ({ cafe: r.cafe, sp: r.sp, badge: r.badge ? 1 : 0, bname: r.badge_name || null, fr: frs[r.tg_id] || null })), sps: rows.map(r => r.sp), total: rows.length };
  try { await env.DB.prepare('INSERT INTO cache (key, val, at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET val = ?2, at = ?3').bind(key, JSON.stringify(snap), now).run(); } catch {}
  return json(Object.assign({ ok: true, season, at: now }, snap));
}

async function framesFor(env, ids, snaps){ const out = {}; const want = []; ids.forEach((id, i) => { let fr = null; try { fr = JSON.parse(snaps[i] || '{}').fr; } catch {} if (fr && /^[a-z]{2,10}$/.test(fr)) { want.push([id, fr]); } });
  if (!want.length) return out;
  const rows = (await env.DB.prepare(`SELECT tg_id, item FROM purchases WHERE refunded = 0 AND item LIKE 'frame_%' AND tg_id IN (${want.map(w => Number(w[0])).join(',')})`).all()).results || [];
  for (const [id, fr] of want) if (rows.some(r => r.tg_id === id && r.item === 'frame_' + fr)) out[id] = fr;
  return out; }
