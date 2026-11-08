// POST /api/gift — кому можно подарить: друзья, соперники по дуэлям и поиск по названию кофейни.
import { json, verifyInitData, giftOwned, GIFTABLE } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'Сервер не настроен' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'Открой игру из Telegram' }, 401);
  const me = user.id, item = String(body.item || '');
  if (!GIFTABLE(item)) return json({ ok: false, error: 'Это нельзя подарить' });
  try {
    const q = String(body.q || '').trim().slice(0, 30);
    let rows;
    if (q.length >= 2) {
      rows = (await env.DB.prepare("SELECT tg_id, cafe, level FROM players WHERE banned = 0 AND tg_id != ?1 AND cafe IS NOT NULL AND cafe != '' AND lower(cafe) LIKE ?2 ORDER BY last_seen DESC LIMIT 15")
        .bind(me, '%' + q.toLowerCase() + '%').all()).results || [];
    } else {
      // друзья по приглашениям и соперники по дуэлям, потом просто недавние
      rows = (await env.DB.prepare(`SELECT p.tg_id, p.cafe, p.level, 1 k FROM players p WHERE p.banned = 0 AND p.cafe IS NOT NULL AND p.cafe != '' AND p.tg_id != ?1 AND (p.referrer = ?1 OR p.tg_id = (SELECT referrer FROM players WHERE tg_id = ?1))
        UNION SELECT p.tg_id, p.cafe, p.level, 2 k FROM players p JOIN duel d ON (d.a = ?1 AND d.b = p.tg_id) OR (d.b = ?1 AND d.a = p.tg_id) WHERE p.banned = 0 AND p.cafe IS NOT NULL AND p.cafe != ''
        ORDER BY k LIMIT 15`).bind(me).all()).results || [];
      const seen = new Set(); rows = rows.filter(r => !seen.has(r.tg_id) && seen.add(r.tg_id));
      if (rows.length < 15) {
        const more = (await env.DB.prepare("SELECT tg_id, cafe, level FROM players WHERE banned = 0 AND tg_id != ?1 AND cafe IS NOT NULL AND cafe != '' AND last_seen > ?2 ORDER BY last_seen DESC LIMIT 20").bind(me, Date.now() - 3 * 86400000).all()).results || [];
        for (const r of more) { if (!seen.has(r.tg_id) && rows.length < 15) { rows.push(r); seen.add(r.tg_id); } }
      }
    }
    const list = [];
    for (const r of rows) list.push({ id: r.tg_id, cafe: r.cafe, lvl: r.level || 1, friend: r.k === 1 ? 1 : 0, rival: r.k === 2 ? 1 : 0, has: await giftOwned(env, r.tg_id, item) ? 1 : 0 });
    return json({ ok: true, list });
  } catch (e) { return json({ ok: false, error: 'Что-то сломалось. Попробуй позже' }); }
}
