// POST /api/market — трансферное окно: выставить, снять, купить сотрудника, посмотреть рынок.
import { json, verifyInitData } from '../_lib.js';

const ROLES = ['Бариста', 'Кассир', 'Официант', 'Мойщица', 'Повар'];
function cleanStaff(o) {
  if (!o || typeof o !== 'object' || o.seasonRewardKey || o.szLeg) return null;
  const s = {
    name: String(o.name || '').slice(0, 24), role: String(o.role || ''), lvl: Math.max(1, Math.min(60, Math.round(Number(o.lvl) || 1))),
    rank: Math.max(0, Math.min(3, Math.round(Number(o.rank) || 0))), quirk: String(o.quirk || 'none').slice(0, 16), sex: o.sex === 'f' ? 'f' : 'm',
    spr: Math.max(0, Math.min(200, Math.round(Number(o.spr) || 0))), legendId: Math.max(0, Math.min(20, Math.round(Number(o.legendId) || 0))),
    prize: o.prize ? 1 : 0, xp: Math.max(0, Math.round(Number(o.xp) || 0)), shifts: Math.max(0, Math.round(Number(o.shifts) || 0))
  };
  if (!s.name || !ROLES.includes(s.role)) return null;
  return s;
}
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'Сервер не настроен' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'Открой игру из Telegram' }, 401);
  const now = Date.now();
  try {
    if (body.op === 'get') {
      const list = (await env.DB.prepare("SELECT id, seller_cafe, staff, price FROM market WHERE status = 'open' AND seller != ?1 ORDER BY created_at DESC LIMIT 30").bind(user.id).all()).results || [];
      const mine = (await env.DB.prepare("SELECT id, staff, price, status, buyer_cafe FROM market WHERE seller = ?1 AND (status = 'open' OR (status = 'sold' AND sold_at > ?2)) ORDER BY created_at DESC LIMIT 10").bind(user.id, now - 3 * 86400000).all()).results || [];
      const p = r => Object.assign({}, r, { staff: JSON.parse(r.staff) });
      return json({ ok: true, list: list.map(p), mine: mine.map(p) });
    }
    if (body.op === 'list') {
      const s = cleanStaff(body.staff); if (!s) return json({ ok: false, error: 'Не тот сотрудник' });
      const price = Math.max(10000, Math.min(1e9, Math.round(Number(body.price) || 0)));
      const n = await env.DB.prepare("SELECT COUNT(*) n FROM market WHERE seller = ?1 AND status = 'open'").bind(user.id).first();
      if (n && n.n >= 3) return json({ ok: false, error: 'Можно выставить не больше трёх человек сразу' });
      await env.DB.prepare('INSERT INTO market (seller, seller_cafe, staff, price, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(user.id, String(body.cafe || '').slice(0, 40), JSON.stringify(s), price, 'open', now).run();
      return json({ ok: true });
    }
    if (body.op === 'cancel') {
      const r = await env.DB.prepare("UPDATE market SET status = 'cancelled' WHERE id = ?1 AND seller = ?2 AND status = 'open' RETURNING staff").bind(Number(body.id) || 0, user.id).first();
      if (!r) return json({ ok: false, error: 'Уже продан или снят' });
      return json({ ok: true, staff: JSON.parse(r.staff) });
    }
    if (body.op === 'buy') {
      const me = await env.DB.prepare('SELECT cafe FROM players WHERE tg_id = ?1').bind(user.id).first();
      const r = await env.DB.prepare("UPDATE market SET status = 'sold', buyer = ?2, buyer_cafe = ?3, sold_at = ?4 WHERE id = ?1 AND status = 'open' AND seller != ?2 RETURNING seller, staff, price").bind(Number(body.id) || 0, user.id, me ? me.cafe : null, now).first();
      if (!r) return json({ ok: false, error: 'Его уже купили' });
      const st = JSON.parse(r.staff);
      // продавцу — деньги минус 10% комиссии, придут при следующем отчёте
      await env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, 'trsold', ?2, ?3, ?4, 0)").bind(r.seller, Math.round(r.price * 0.9), st.name + ' (' + st.role.toLowerCase() + ')', now).run();
      return json({ ok: true, staff: st });
    }
    return json({ ok: false, error: 'Неизвестное действие' });
  } catch (e) { return json({ ok: false, error: 'Что-то сломалось. Попробуй позже' }); }
}
