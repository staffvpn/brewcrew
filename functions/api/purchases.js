// POST /api/purchases — реальные покупки и выданные этому игроку тестовые предметы.
import { json, verifyInitData } from '../_lib.js';
import { purchaseState } from '../_purchases.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false }, 400);
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad initData' }, 401);
  return json(await purchaseState(env, user.id));
}
