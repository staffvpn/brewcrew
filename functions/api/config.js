// GET /api/config — имя бота для ссылок-приглашений, ссылка на канал и короткая заметка о последнем обновлении.
import { json, getBot } from '../_lib.js';
import { versionInfo, worldInfo } from '../_channel.js';
import { rel10Off } from './league.js';
import { cityOn } from './city.js';
export async function onRequestGet({ env }) {
  let bot = null, ver = null, world = null;
  try { const b = env.BOT_TOKEN ? await getBot(env) : null; bot = b ? b.username : null; } catch {}
  try { if (env.DB) ver = await versionInfo(env); } catch {}
  try { if (env.DB) world = await worldInfo(env); } catch {}
  let flags = []; try { if (env.DB) { const c = await env.DB.prepare("SELECT val, at FROM cache WHERE key = 'flags34'").first();
    if (c && Date.now() - c.at < 3600000) flags = JSON.parse(c.val || '[]');
    else { flags = ((await env.DB.prepare("SELECT DISTINCT p.cafe FROM purchases u JOIN players p ON p.tg_id = u.tg_id WHERE u.item = 'flagship' AND u.refunded = 0 AND p.cafe IS NOT NULL LIMIT 30").all()).results || []).map(r => r.cafe);
      await env.DB.prepare("INSERT INTO cache (key, val, at) VALUES ('flags34', ?1, ?2) ON CONFLICT(key) DO UPDATE SET val = ?1, at = ?2").bind(JSON.stringify(flags), Date.now()).run(); } } } catch {}
  let rel10off = false; try { if (env.DB) rel10off = await rel10Off(env); } catch {}
  let city = false; try { if (env.DB) city = await cityOn(env); } catch {}
  return json({ ok: true, city, bot, app: env.APP_SHORT || null, channel: env.CHANNEL_URL || null, ver, world, now: Date.now(), rel10off, flags });
}
