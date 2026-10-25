// POST /api/ack — игра сообщает, какие команды админа она применила.
import { json, verifyInitData } from '../_lib.js';
import { ackOps } from '../_admin.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  await ackOps(env, user.id, body.ids);
  return json({ ok: true });
}
