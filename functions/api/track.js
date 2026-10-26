// POST /api/track — игра раз в минуту сообщает, что игрок онлайн, и его краткие показатели.
import { json, mskDay, verifyInitData, dispatchReminders } from '../_lib.js';
import { opsFor } from '../_admin.js';
import { channelTick, tourWeek } from '../_channel.js';

const num = (v, max = 1e15) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : 0; };
const str = (v, len = 40) => (typeof v === 'string' ? v.slice(0, len) : null);

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad initData' }, 401);
  const s = body.stats || {};
  const now = Date.now();
  const dt = Math.round(num(s.dt, 120));
  let referrer = null;
  const sp = typeof s.ref === 'string' ? s.ref.match(/^ref_(\d{3,15})$/) : null;
  if (sp && Number(sp[1]) !== user.id) referrer = Number(sp[1]);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO players (tg_id, username, first_name, lang, created_at, last_seen, sessions, cafe, city, level, money, earned, rooms, franchises, bankrupt, play_seconds, referrer)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5, 1, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?16)
      ON CONFLICT(tg_id) DO UPDATE SET username = ?2, first_name = ?3, lang = ?4, last_seen = ?5,
        sessions = sessions + (CASE WHEN ?15 = 1 THEN 1 ELSE 0 END), cafe = ?6, city = ?7, level = ?8, money = ?9, earned = ?10,
        rooms = ?11, franchises = ?12, bankrupt = ?13, play_seconds = play_seconds + ?14`)
      .bind(user.id, str(user.username), str(user.first_name), str(user.language_code, 8), now,
        str(s.cafe), str(s.city, 20), Math.round(num(s.level, 1e6)), num(s.money), num(s.earned), Math.round(num(s.rooms, 100)),
        Math.round(num(s.franchises, 1e4)), Math.round(num(s.bankrupt, 1e4)), dt, s.start ? 1 : 0, referrer),
    env.DB.prepare('INSERT OR IGNORE INTO days (day, tg_id) VALUES (?1, ?2)').bind(mskDay(now), user.id),
    env.DB.prepare('UPDATE players SET best_day = MAX(COALESCE(best_day,0), ?2) WHERE tg_id = ?1').bind(user.id, Math.min(num(s.best), 5e9))
  ]);
  // недельный турнир: принимаем только текущую неделю
  if (s.tw === tourWeek(now) && Number.isFinite(Number(s.tp))) {
    const tp = Math.max(-1e10, Math.min(Number(s.tp), 1e11));
    await env.DB.prepare(`INSERT INTO tour (week, tg_id, profit, cafe, city, first_name, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(week, tg_id) DO UPDATE SET profit = ?3, cafe = ?4, city = ?5, first_name = ?6, updated_at = ?7`).bind(s.tw, user.id, tp, str(s.cafe), str(s.city, 20), str(user.first_name), now).run();
  }
  const origin = new URL(request.url).origin;
  if (waitUntil) { waitUntil(dispatchReminders(env)); waitUntil(channelTick(env, origin)); } else await dispatchReminders(env);
  const me = await env.DB.prepare('SELECT banned FROM players WHERE tg_id = ?1').bind(user.id).first();
  let ops = [];
  try { ops = await opsFor(env, user.id); } catch {}
  return json({ ok: true, banned: Boolean(me && me.banned), ops });
}
