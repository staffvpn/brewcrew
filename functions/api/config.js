// GET /api/config — имя бота для ссылок-приглашений и ссылка на канал игры.
import { json, getBot } from '../_lib.js';
export async function onRequestGet({ env }) {
  let bot = null;
  try { const b = env.BOT_TOKEN ? await getBot(env) : null; bot = b ? b.username : null; } catch {}
  return json({ ok: true, bot, app: env.APP_SHORT || null, channel: env.CHANNEL_URL || null });
}
