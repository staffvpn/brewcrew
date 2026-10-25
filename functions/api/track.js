// POST /api/track — игра раз в минуту сообщает, что игрок онлайн, и его краткие показатели.
import { json, mskDay, verifyInitData } from '../_lib.js';

const num = (v, max = 1e15) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : 0; };
const str = (v, len = 40) => (typeof v === 'string' ? v.slice(0, len) : null);

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad initData' }, 401);
  const s = body.stats || {};
  const now = Date.now();
  const dt = Math.round(num(s.dt, 120));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO players (tg_id, username, first_name, lang, created_at, last_seen, sessions, cafe, city, level, money, earned, rooms, franchises, bankrupt, play_seconds)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5, 1, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
      ON CONFLICT(tg_id) DO UPDATE SET username = ?2, first_name = ?3, lang = ?4, last_seen = ?5,
        sessions = sessions + (CASE WHEN ?15 = 1 THEN 1 ELSE 0 END), cafe = ?6, city = ?7, level = ?8, money = ?9, earned = ?10,
        rooms = ?11, franchises = ?12, bankrupt = ?13, play_seconds = play_seconds + ?14`)
      .bind(user.id, str(user.username), str(user.first_name), str(user.language_code, 8), now,
        str(s.cafe), str(s.city, 20), Math.round(num(s.level, 1e6)), num(s.money), num(s.earned), Math.round(num(s.rooms, 100)),
        Math.round(num(s.franchises, 1e4)), Math.round(num(s.bankrupt, 1e4)), dt, s.start ? 1 : 0),
    env.DB.prepare('INSERT OR IGNORE INTO days (day, tg_id) VALUES (?1, ?2)').bind(mskDay(now), user.id)
  ]);
  return json({ ok: true });
}
