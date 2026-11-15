import {restrictions} from './_admin-assets.js';
import { STORE_ITEMS } from './_store.js';
import { ADMINS, sezId } from './_lib.js';

export function adminTestEnabled(env, userId) {
  return env.ADMIN_TEST_PURCHASES !== '0' && ADMINS.includes(userId);
}

export async function purchaseState(env, userId) {
  const blocked=await restrictions(env,userId);
  const rows = (await env.DB.prepare('SELECT charge_id, item, stars, created_at, expires_at FROM purchases WHERE tg_id = ?1 AND refunded = 0').bind(userId).all()).results || [];
  const active=rows.filter(r=>!blocked[r.item]);
  rows.splice(0,rows.length,...active);
  const now = Date.now();
  const subUntil = rows.filter(r => r.item === 'sub_owner').reduce((a, r) => Math.max(a, r.expires_at || 0), 0);
  const interiors = [...new Set(rows.filter(r => r.item.startsWith('int_')).map(r => r.item).concat(rows.some(r => r.item === 'starter') ? ['int_soviet'] : []))].filter(k=>!blocked[k]);
  const tips = rows.filter(r => r.item.startsWith('tip_')).reduce((a, r) => a + r.stars, 0);
  const renames = rows.filter(r => r.item === 'rename').length;
  const frames = [...new Set(rows.filter(r => r.item.startsWith('frame_')).map(r => r.item))];
  const passes = rows.filter(r => r.item === 'pass' || r.item === 'pass15').map(r => ({ id: String(r.charge_id).slice(-24), season: sezId(r.created_at), plus: r.item === 'pass15' ? 15 : 0 }));
  if (adminTestEnabled(env, userId)&&!blocked.pass&&!blocked.pass15) passes.push({ id: 'admin_full:' + userId + ':' + sezId(now), season: sezId(now), plus: 0, full: true });
  const extras = [...new Set(rows.filter(r => ['flagship', 'uniform', 'music', 'starter'].includes(r.item)).map(r => r.item))];
  const skins = [...new Set(rows.map(r=>r.item))].map(k=>STORE_ITEMS[k]).filter(p=>p&&p.category!=='style'&&p.category!=='lux').map(p=>({category:p.category,id:p.skin,at:Math.max(0,...rows.filter(r=>STORE_ITEMS[r.item]===p).map(r=>r.created_at||0))}));
  const lux = [...new Set(rows.filter(r => r.item.startsWith('lux_')).map(r => r.item.slice(4)))];
  return { ok: true, adminTest: adminTestEnabled(env, userId), skins, rewards:['reward_gold','reward_pet'].filter(k=>Object.hasOwn(blocked,k)&&!blocked[k]), blocked:Object.keys(blocked).filter(k=>blocked[k]), lux, sub: subUntil > now ? subUntil : 0, interiors, tips, renames, passes, frames, extras };
}
