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
