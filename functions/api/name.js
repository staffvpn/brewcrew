// POST /api/name — свободно ли название кофейни; если занято — предлагает вариант с улицей.
import { json, verifyInitData } from '../_lib.js';
const STREETS = { msk: ['на Тверской', 'у Патриарших', 'на Арбате', 'на Покровке', 'у Чистых прудов', 'на Таганке', 'в Сокольниках', 'на Пятницкой'], spb: ['на Лиговском', 'на Рубинштейна', 'у Невы', 'на Васильевском', 'на Петроградке', 'у Фонтанки', 'в Коломне', 'на Литейном'] };
const norm = s => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const name = String(body.name || '').trim().slice(0, 28);
  if (name.length < 2) return json({ ok: false, error: 'short' }, 400);
  const taken = async n => !!(await env.DB.prepare('SELECT 1 FROM players WHERE lower(replace(cafe, \'ё\', \'е\')) = ?1 AND tg_id != ?2').bind(norm(n), user.id).first());
  if (!(await taken(name))) return json({ ok: true, free: true });
  const me = await env.DB.prepare('SELECT city FROM players WHERE tg_id = ?1').bind(user.id).first();
  const list = STREETS[(me && me.city) || body.city] || STREETS.msk;
  for (const st of list.sort(() => Math.random() - 0.5)) { const v = (name + ' ' + st).slice(0, 40); if (!(await taken(v))) return json({ ok: true, free: false, suggest: v }); }
  return json({ ok: true, free: false, suggest: name + ' №' + Math.floor(Math.random() * 900 + 100) });
}
