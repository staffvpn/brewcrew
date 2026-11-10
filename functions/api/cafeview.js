// POST /api/cafeview — витрина чужой кофейни по ключу vk: зал, команда, вывеска. Можно один раз в день похвалить.
import { json, verifyInitData } from '../_lib.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const vk = typeof body.vk === 'string' && /^[0-9a-f]{12}$/.test(body.vk) ? body.vk : null;
  if (!vk && !body.me) return json({ ok: false, error: 'bad key' }, 400);
  const Q = 'SELECT v.tg_id, v.vk, v.data, v.at, v.views, v.likes, p.cafe, p.level, p.badge_name FROM cafe_view v JOIN players p ON p.tg_id = v.tg_id WHERE ';
  const row = body.me ? await env.DB.prepare(Q + 'v.tg_id = ?1').bind(user.id).first() : await env.DB.prepare(Q + 'v.vk = ?1 AND p.banned = 0').bind(vk).first();
  if (!row) return json({ ok: false, error: 'Кофейня закрыта для гостей' }, 404);
  const mine = row.tg_id === user.id;
  if (body.like && !mine) {
    const key = 'like_' + user.id + '_' + row.tg_id + '_' + new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    const r = await env.DB.prepare("INSERT OR IGNORE INTO cache (key, val, at) VALUES (?1, '1', ?2)").bind(key, Date.now()).run();
    if (!r.meta || r.meta.changes !== 1) return json({ ok: false, error: 'Сегодня ты уже хвалил эту кофейню' });
    await env.DB.prepare('UPDATE cafe_view SET likes = likes + 1 WHERE tg_id = ?1').bind(row.tg_id).run();
    return json({ ok: true, likes: (row.likes || 0) + 1 });
  }
  if (!mine) await env.DB.prepare('UPDATE cafe_view SET views = views + 1 WHERE tg_id = ?1').bind(row.tg_id).run();
  let data = null; try { data = JSON.parse(row.data || 'null'); } catch {}
  return json({ ok: true, mine, vk: mine ? row.vk : undefined, cafe: row.cafe, level: row.level, badge: row.badge_name || null, views: (row.views || 0) + (mine ? 0 : 1), likes: row.likes || 0, at: row.at, data });
}
