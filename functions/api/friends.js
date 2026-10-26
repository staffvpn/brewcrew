// POST /api/friends — кто тебя пригласил, кого пригласил ты, сколько наград можно забрать.
import { json, verifyInitData } from '../_lib.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const me = await env.DB.prepare('SELECT referrer, ref_claimed FROM players WHERE tg_id = ?1').bind(user.id).first();
  const friends = (await env.DB.prepare('SELECT tg_id, first_name, cafe, city, level, earned, last_seen, snap FROM players WHERE referrer = ?1 ORDER BY earned DESC LIMIT 30').bind(user.id).all()).results || [];
  let inviter = null;
  if (me && me.referrer) inviter = await env.DB.prepare('SELECT tg_id, first_name, cafe, city, level, earned, last_seen, snap FROM players WHERE tg_id = ?1').bind(me.referrer).first();
  const parse = x => { if (x) { try { x.snap = x.snap ? JSON.parse(x.snap) : null; } catch { x.snap = null; } } return x; };
  friends.forEach(parse); parse(inviter);
  const active = friends.filter(f => f.level >= 3).length;
  let claimed = (me && me.ref_claimed) || 0;
  let granted = 0;
  if (body.claim && active > claimed) { granted = active - claimed; claimed = active; await env.DB.prepare('UPDATE players SET ref_claimed = ?2 WHERE tg_id = ?1').bind(user.id, claimed).run(); }
  return json({ ok: true, id: user.id, inviter, friends, unclaimed: Math.max(0, active - claimed), granted });
}
