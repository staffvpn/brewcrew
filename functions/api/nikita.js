// POST /api/nikita — шифр Никиты: {action:'state'} или {action:'answer', answer}
import { json, verifyInitData } from '../_lib.js';
import { nkState, nkAnswer } from '../_nikita.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'Сервер не настроен' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'Открой игру из Telegram' }, 401);
  try {
    if (body.action === 'answer') return json(await nkAnswer(env, user.id, String(body.answer || '').slice(0, 40)));
    return json(await nkState(env, user.id));
  } catch (e) { return json({ ok: false, error: 'Что-то сломалось. Попробуй позже' }); }
}
