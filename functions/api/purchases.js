// POST /api/purchases — список покупок игрока: активная подписка, интерьеры, сумма чаевых.
import { json, verifyInitData, sezId } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad initData' }, 401);
  const rows = (await env.DB.prepare('SELECT charge_id, item, stars, created_at, expires_at FROM purchases WHERE tg_id = ?1 AND refunded = 0').bind(user.id).all()).results || [];
  const now = Date.now();
  const subUntil = rows.filter(r => r.item === 'sub_owner').reduce((a, r) => Math.max(a, r.expires_at || 0), 0);
  const interiors = [...new Set(rows.filter(r => r.item.startsWith('int_')).map(r => r.item))];
  const tips = rows.filter(r => r.item.startsWith('tip_')).reduce((a, r) => a + r.stars, 0);
  const renames = rows.filter(r => r.item === 'rename').length;
  const passes = rows.filter(r => r.item === 'pass' || r.item === 'pass15').map(r => ({ id: String(r.charge_id).slice(-24), season: sezId(r.created_at), plus: r.item === 'pass15' ? 15 : 0 }));
  return json({ ok: true, sub: subUntil > now ? subUntil : 0, interiors, tips, renames, passes });
}
