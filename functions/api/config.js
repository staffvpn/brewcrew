// GET /api/config — имя бота для ссылок-приглашений, ссылка на канал и короткая заметка о последнем обновлении.
import { json, getBot } from '../_lib.js';
import { versionInfo, worldInfo, syncVersionCaption } from '../_channel.js';
export async function onRequestGet({ env, request, waitUntil }) {
  if (request && waitUntil) waitUntil(syncVersionCaption(env, new URL(request.url).origin).catch(() => {}));
  let bot = null, ver = null, world = null;
  try { const b = env.BOT_TOKEN ? await getBot(env) : null; bot = b ? b.username : null; } catch {}
  try { if (env.DB) ver = await versionInfo(env); } catch {}
  try { if (env.DB) world = await worldInfo(env); } catch {}
  return json({ ok: true, bot, app: env.APP_SHORT || null, channel: env.CHANNEL_URL || null, ver, world });
}
