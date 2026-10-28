// POST /api/track — игра раз в минуту сообщает, что игрок онлайн, и его краткие показатели.
import { json, mskDay, verifyInitData, dispatchReminders, ADMINS, parseRef, bindReferrer, payReferrer, sezId } from '../_lib.js';
import { promoWatch } from '../_promo.js';
import { opsFor } from '../_admin.js';
import { channelTick, tourWeek, post as channelPost } from '../_channel.js';

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
  const referrer = null, refId = parseRef(s.ref);
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
    env.DB.prepare('UPDATE players SET best_day = MAX(COALESCE(best_day,0), ?2) WHERE tg_id = ?1').bind(user.id, Math.min(num(s.best), 5e9)),
    env.DB.prepare('UPDATE players SET snap = ?2 WHERE tg_id = ?1').bind(user.id, s.snap && typeof s.snap === 'object' ? JSON.stringify(s.snap).slice(0, 400) : null)
  ]);
  // рефералы: привязка нового игрока и награда пригласившему за 3 уровень
  try { if (refId) await bindReferrer(env, user, refId, 'app'); await payReferrer(env, user.id); } catch {}
  // недельный турнир: принимаем только текущую неделю
  // «Кофейня недели района» — пост в канал, раз в неделю на игрока
  if (s.star && env.CHANNEL_ID) {
    const key = 'star_' + user.id + '_' + tourWeek(now);
    const was = await env.DB.prepare('SELECT key FROM posts WHERE key = ?1').bind(key).first();
    if (!was) {
      const name = str(s.cafe) || 'Без названия';
      const okp = await channelPost(env, new URL(request.url).origin, 'events.jpg', `<b>Кофейня недели района</b>\n\n«${name.replace(/[&<>]/g, '')}» отработала три золотые смены подряд: ни одного скандала, чистый зал, все задания сделаны.\n\nРайон говорит только о ней. Кто следующий?`);
      await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, msg_id, caption) VALUES (?1, ?2, ?3, ?4, ?5)').bind(key, now, okp ? 1 : 0, okp && okp.id ? okp.id : null, 'Кофейня недели: ' + name).run();
    }
  }
  if (!ADMINS.includes(user.id) && s.tw === tourWeek(now) && Number.isFinite(Number(s.tp))) {
    const tp = Math.max(-1e10, Math.min(Number(s.tp), 1e11));
    await env.DB.prepare(`INSERT INTO tour (week, tg_id, profit, cafe, city, first_name, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(week, tg_id) DO UPDATE SET profit = ?3, cafe = ?4, city = ?5, first_name = ?6, updated_at = ?7`).bind(s.tw, user.id, tp, str(s.cafe), str(s.city, 20), str(user.first_name), now).run();
  }
  // сезон: очки за месяц
  if (!ADMINS.includes(user.id) && s.sz === sezId(now) && Number.isFinite(Number(s.sp))) {
    await env.DB.prepare(`INSERT INTO season (season, tg_id, sp, cafe, city, first_name, badge, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(season, tg_id) DO UPDATE SET sp = ?3, cafe = ?4, city = ?5, first_name = ?6, badge = ?7, updated_at = ?8`).bind(s.sz, user.id, Math.max(0, Math.min(1e7, Math.round(Number(s.sp)))), str(s.cafe), str(s.city, 20), str(user.first_name), s.bd ? 1 : 0, now).run();
  }
  // трофей: первый владелец золотой кофемашины попадает в канал
  if (s.trophy && env.CHANNEL_ID) {
    const was = await env.DB.prepare("SELECT key FROM posts WHERE key = 'trophy_first'").first();
    if (!was) { const name = (str(s.cafe) || 'Без названия').replace(/[&<>]/g, ''); const okp = await channelPost(env, new URL(request.url).origin, 'events.jpg', `<b>Первая золотая кофемашина района</b>\n\nКофейня «${name}» купила трофей за 50 миллионов. Кофе от этого не стал вкуснее, но фотографируют его теперь чаще, чем бариста.`);
      await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, msg_id, caption) VALUES (?1, ?2, ?3, ?4, ?5)').bind('trophy_first', now, okp ? 1 : 0, okp && okp.id ? okp.id : null, 'Золотая кофемашина: ' + name).run(); }
  }
  const origin = new URL(request.url).origin;
  if (waitUntil) waitUntil(promoWatch(env, user.id).catch(() => {})); else { try { await promoWatch(env, user.id); } catch {} }
  if (waitUntil) { waitUntil(dispatchReminders(env)); waitUntil(channelTick(env, origin)); } else await dispatchReminders(env);
  const me = await env.DB.prepare('SELECT banned FROM players WHERE tg_id = ?1').bind(user.id).first();
  let ops = [];
  try { ops = await opsFor(env, user.id); } catch {}
  return json({ ok: true, banned: Boolean(me && me.banned), ops });
}
