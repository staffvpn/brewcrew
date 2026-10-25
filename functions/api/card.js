// POST /api/card — сохраняет картинку-карточку (PNG от игры) и, по желанию, присылает её игроку в чат с ботом.
import { json, verifyInitData, tgApi, getBot } from '../_lib.js';
export async function onRequestPost({ request, env }) {
  if (!env.CARDS || !env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const m = typeof body.png === 'string' ? body.png.match(/^data:image\/(png|jpeg);base64,(.+)$/) : null;
  if (!m || m[2].length > 1400000) return json({ ok: false, error: 'bad image' }, 400);
  const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await env.CARDS.put(id, bin, { expirationTtl: 60 * 60 * 24 * 14, metadata: { type: 'image/' + m[1] } });
  const origin = new URL(request.url).origin;
  const url = `${origin}/card/${id}`;
  if (body.send) {
    const bot = await getBot(env);
    const link = bot ? `https://t.me/${bot.username}?start=ref_${user.id}` : origin;
    const caption = String(body.caption || '').slice(0, 900) + `\n\nИграть: ${link}`;
    await tgApi(env, 'sendPhoto', { chat_id: user.id, photo: url, caption });
  }
  return json({ ok: true, url });
}
