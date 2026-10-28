// POST /api/promo — ввод промокода. Работает только у подписчиков канала.
import { json, verifyInitData } from '../_lib.js';
import { redeem } from '../_promo.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'Сервер не настроен' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'Открой игру из Telegram' }, 401);
  try { return json(await redeem(env, user, body.code)); } catch (e) { return json({ ok: false, error: 'Что-то сломалось. Попробуй позже' }); }
}
