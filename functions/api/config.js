// GET /api/config — имя бота для ссылок-приглашений, ссылка на канал и короткая заметка о последнем обновлении.
import { json, getBot } from '../_lib.js';
import { versionInfo, worldInfo } from '../_channel.js';
import { rel10Off } from './league.js';
export async function onRequestGet({ env }) {
  let bot = null, ver = null, world = null;
  try { const b = env.BOT_TOKEN ? await getBot(env) : null; bot = b ? b.username : null; } catch {}
  try { if (env.DB) ver = await versionInfo(env); } catch {}
  try { if (env.DB) world = await worldInfo(env); } catch {}
  let rel10off = false; try { if (env.DB) rel10off = await rel10Off(env); } catch {}
  return json({ ok: true, bot, app: env.APP_SHORT || null, channel: env.CHANNEL_URL || null, ver, world, now: Date.now(), rel10off });
}
