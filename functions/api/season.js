// GET /api/season — снимок топ-10 сезона (по очкам), общий для всех, обновляется раз в 5 часов.
import { json, ADMINS, sezId } from '../_lib.js';
const SNAP_MS = 5 * 3600000;
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false }, 503);
  const season = sezId(), key = 'sz_' + season, now = Date.now();
  try { const c = await env.DB.prepare('SELECT val, at FROM cache WHERE key = ?1').bind(key).first(); if (c && now - c.at < SNAP_MS) return json(Object.assign({ ok: true, season, at: c.at }, JSON.parse(c.val))); } catch {}
  const rows = (await env.DB.prepare(`SELECT s.cafe, s.city, s.sp, s.badge, p.badge_name FROM season s LEFT JOIN players p ON p.tg_id = s.tg_id WHERE s.season = ?1 AND s.tg_id NOT IN (${ADMINS.join(',')}) ORDER BY s.sp DESC LIMIT 300`).bind(season).all()).results || [];
  const snap = { top: rows.slice(0, 10).map(r => ({ cafe: r.cafe, city: r.city, sp: r.sp, badge: r.badge ? 1 : 0, bname: r.badge_name || null })), sps: rows.map(r => r.sp), total: rows.length };
  try { await env.DB.prepare('INSERT INTO cache (key, val, at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET val = ?2, at = ?3').bind(key, JSON.stringify(snap), now).run(); } catch {}
  return json(Object.assign({ ok: true, season, at: now }, snap));
}
