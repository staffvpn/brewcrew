// POST /api/cafecard — данные карточки кофейни для виджета в чате. Только чтение, по initData.
import { json, verifyInitData, sezId } from '../_lib.js';
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const p = await env.DB.prepare(
    'SELECT cafe, level, money, earned, best_day, duel_r, duel_w, duel_l FROM players WHERE tg_id = ?1'
  ).bind(user.id).first();
  if (!p) return json({ ok: false, error: 'no player' }, 404);
  const season = sezId(Date.now());
  const me = await env.DB.prepare('SELECT sp FROM season WHERE season = ?1 AND tg_id = ?2').bind(season, user.id).first();
  const sp = me ? me.sp || 0 : 0;
  const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM season WHERE season = ?1 AND sp > ?2').bind(season, sp).first();
  return json({
    ok: true,
    cafe: p.cafe || 'Моя кофейня',
    level: p.level || 1,
    money: Math.round(p.money || 0),
    earned: Math.round(p.earned || 0),
    best_day: Math.round(p.best_day || 0),
    duel: { r: p.duel_r || 1000, w: p.duel_w || 0, l: p.duel_l || 0 },
    season: { id: season, sp, place: sp > 0 ? (above.n || 0) + 1 : null }
  });
}
