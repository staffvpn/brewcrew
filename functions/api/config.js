// GET /api/config — имя бота для ссылок-приглашений, ссылка на канал и короткая заметка о последнем обновлении.
import { json, getBot } from '../_lib.js';
import { versionInfo } from '../_channel.js';
export async function onRequestGet({ env }) {
  let bot = null, ver = null;
  try { const b = env.BOT_TOKEN ? await getBot(env) : null; bot = b ? b.username : null; } catch {}
  try { if (env.DB) ver = await versionInfo(env); } catch {}
  return json({ ok: true, bot, app: env.APP_SHORT || null, channel: env.CHANNEL_URL || null, ver });
}
