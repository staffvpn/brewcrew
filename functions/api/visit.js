// POST /api/visit — зайти в гости к другу: похвалить, оставить чаевые или подкинуть таракана. Раз в день на пару.
import { json, verifyInitData } from '../_lib.js';
const ACT = { praise: { op: 'fpraise', text: 'Ты оставил другу 5 звёзд. Его рейтинг подрос.' }, gift: { op: 'fgift', amount: 5000, cost: 5000, text: 'Ты оставил другу 5 000 ₽ чаевых.' }, prank: { op: 'fprank', text: 'Таракан доставлен. Ждём реакции.' } };
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false }, 401);
  const to = Number(body.to), a = ACT[body.action];
  if (!a || !Number.isFinite(to) || to === user.id) return json({ ok: false, error: 'Нельзя' }, 400);
  const pair = await env.DB.prepare('SELECT 1 FROM players WHERE (tg_id = ?1 AND referrer = ?2) OR (tg_id = ?2 AND referrer = ?1)').bind(to, user.id).first();
  if (!pair) return json({ ok: false, error: 'Это не твой друг' }, 403);
  const recent = await env.DB.prepare("SELECT COUNT(*) n FROM admin_ops WHERE tg_id = ?1 AND by_admin = ?2 AND op IN ('fpraise','fgift','fprank') AND created_at > ?3").bind(to, user.id, Date.now() - 20 * 3600000).first();
  if (recent && recent.n) return json({ ok: false, error: 'К этому другу уже заходил сегодня' });
  await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(to, a.op, a.amount ?? null, String(user.first_name || 'Друг').slice(0, 40), Date.now(), user.id).run();
  return json({ ok: true, text: a.text, cost: a.cost || 0 });
}
