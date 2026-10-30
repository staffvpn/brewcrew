// Общая цель района: миллион стаканов кофе, проданных вживую, до конца ноября.
import { ADMINS } from './_lib.js';

export const GOAL = { id: 'm1', target: 1000000, until: Date.parse('2026-12-01T00:00:00+03:00'), ms: [250000, 500000, 750000] };

// игрок присылает накопленный счётчик gc; прибавляем только прирост с прошлого раза
export async function goalTrack(env, uid, gc, dt) {
  if (ADMINS.includes(uid) || Date.now() >= GOAL.until) return;
  const n = Math.round(Number(gc)); if (!Number.isFinite(n) || n < 0) return;
  const row = await env.DB.prepare('SELECT goal_last FROM players WHERE tg_id = ?1').bind(uid).first();
  const last = row && row.goal_last != null ? Number(row.goal_last) : null;
  if (last == null || n < last) { await env.DB.prepare('UPDATE players SET goal_last = ?2 WHERE tg_id = ?1').bind(uid, n).run(); return; }
  // защита от накрутки: не больше 6 стаканов в секунду с прошлого отчёта
  const add = Math.min(n - last, Math.max(60, (Number(dt) || 60) * 6));
  if (add <= 0) return;
  await env.DB.batch([
    env.DB.prepare('UPDATE players SET goal_last = ?2, goal_cups = COALESCE(goal_cups,0) + ?3 WHERE tg_id = ?1').bind(uid, n, add),
    env.DB.prepare('INSERT INTO goal (id, total, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET total = total + ?2, updated_at = ?3').bind(GOAL.id, add, Date.now())
  ]);
}

export async function goalInfo(env, withTop) {
  const g = await env.DB.prepare('SELECT total FROM goal WHERE id = ?1').bind(GOAL.id).first();
  const out = { total: g ? Number(g.total) || 0 : 0, target: GOAL.target, until: GOAL.until };
  if (withTop) {
    const top = (await env.DB.prepare(`SELECT cafe, goal_cups cups FROM players WHERE goal_cups > 0 AND tg_id NOT IN (${ADMINS.join(',')}) ORDER BY goal_cups DESC LIMIT 3`).all()).results || [];
    const pl = await env.DB.prepare('SELECT COUNT(*) n FROM players WHERE goal_cups > 0').first();
    out.top = top; out.players = pl ? pl.n : 0;
  }
  return out;
}
