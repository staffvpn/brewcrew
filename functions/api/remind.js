// POST /api/remind — игра, уходя в фон, оставляет до трёх напоминаний; бот пришлёт их, если игрок разрешил.
import { json, verifyInitData } from '../_lib.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  if (typeof body.enable === 'boolean') await env.DB.prepare('UPDATE players SET write_ok = ?2 WHERE tg_id = ?1').bind(user.id, body.enable ? 1 : 0).run();
  await env.DB.prepare('DELETE FROM reminders WHERE tg_id = ?1 AND sent = 0').bind(user.id).run();
  const now = Date.now();
  const items = Array.isArray(body.items) ? body.items.slice(0, 3) : [];
  for (const it of items) {
    const at = Number(it.at); const text = String(it.text || '').slice(0, 300);
    if (!text || !(at > now + 10 * 60000) || at > now + 3 * 86400000) continue;
    await env.DB.prepare('INSERT INTO reminders (tg_id, at, text) VALUES (?1, ?2, ?3)').bind(user.id, Math.round(at), text).run();
  }
  return json({ ok: true });
}
