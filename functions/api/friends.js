// POST /api/friends — кто тебя пригласил и кого пригласил ты. Награды выдаются автоматически (см. payReferrer).
import { json, verifyInitData } from '../_lib.js';
const COLS = 'tg_id, first_name, cafe, city, level, earned, last_seen, created_at, sessions, play_seconds, rooms, ref_paid, snap';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const me = await env.DB.prepare('SELECT referrer FROM players WHERE tg_id = ?1').bind(user.id).first();
  const friends = (await env.DB.prepare(`SELECT ${COLS} FROM players WHERE referrer = ?1 ORDER BY created_at DESC LIMIT 50`).bind(user.id).all()).results || [];
  let inviter = null;
  if (me && me.referrer) inviter = await env.DB.prepare(`SELECT ${COLS} FROM players WHERE tg_id = ?1`).bind(me.referrer).first();
  const parse = x => { if (x) { try { x.snap = x.snap ? JSON.parse(x.snap) : null; } catch { x.snap = null; } } return x; };
  friends.forEach(parse); parse(inviter);
  const paid = friends.filter(f => f.ref_paid).length;
  return json({ ok: true, id: user.id, inviter, friends, paid, earned: paid * 150000, unclaimed: 0, granted: 0 });
}
