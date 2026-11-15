import { ADMINS, sezId } from './_lib.js';

export function adminTestEnabled(env, userId) {
  return env.ADMIN_TEST_PURCHASES !== '0' && ADMINS.includes(userId);
}

export async function purchaseState(env, userId) {
  const rows = (await env.DB.prepare('SELECT charge_id, item, stars, created_at, expires_at FROM purchases WHERE tg_id = ?1 AND refunded = 0').bind(userId).all()).results || [];
  const now = Date.now();
  const subUntil = rows.filter(r => r.item === 'sub_owner').reduce((a, r) => Math.max(a, r.expires_at || 0), 0);
  const interiors = [...new Set(rows.filter(r => r.item.startsWith('int_')).map(r => r.item).concat(rows.some(r => r.item === 'starter') ? ['int_soviet'] : []))];
  const tips = rows.filter(r => r.item.startsWith('tip_')).reduce((a, r) => a + r.stars, 0);
  const renames = rows.filter(r => r.item === 'rename').length;
  const frames = [...new Set(rows.filter(r => r.item.startsWith('frame_')).map(r => r.item))];
  const passes = rows.filter(r => r.item === 'pass' || r.item === 'pass15').map(r => ({ id: String(r.charge_id).slice(-24), season: sezId(r.created_at), plus: r.item === 'pass15' ? 15 : 0 }));
  const extras = [...new Set(rows.filter(r => ['flagship', 'uniform', 'music', 'starter'].includes(r.item)).map(r => r.item))];
  const lux = [...new Set(rows.filter(r => r.item.startsWith('lux_')).map(r => r.item.slice(4)))];
  return { ok: true, adminTest: adminTestEnabled(env, userId), lux, sub: subUntil > now ? subUntil : 0, interiors, tips, renames, passes, frames, extras };
}
