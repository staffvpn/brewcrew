// Продажа подтверждается сервером; повтор запроса возвращает ту же квитанцию.
import { json, verifyInitData, sezId } from '../_lib.js';
import { tourWeek } from '../_channel.js';
import { franchiseThreshold } from '../_economy.js';

const norm = value => String(value || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'Сервер не настроен' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'Открой игру из Telegram' }, 401);
  const expected = body.franchises, name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 28);
  if (!Number.isSafeInteger(expected) || expected < 0 || name.length < 2) return json({ ok: false, error: 'Некорректные данные продажи' }, 400);
  const me = await env.DB.prepare('SELECT franchises, cafe, earned, created_at FROM players WHERE tg_id = ?1').bind(user.id).first();
  if (!me) return json({ ok: false, error: 'Сначала синхронизируй игру с сервером' }, 409);
  const key = `sale_${user.id}_${me.created_at}_${expected + 1}`;
  if (Number(me.franchises || 0) === expected + 1) {
    const saved = await env.DB.prepare('SELECT val FROM cache WHERE key = ?1').bind(key).first();
    if (saved) return json(JSON.parse(saved.val));
  }
  if (Number(me.franchises || 0) !== expected) return json({ ok: false, error: 'Эта сеть уже продана. Обнови сохранение' }, 409);
  if (norm(name) === norm(me.cafe)) return json({ ok: false, error: 'Нужно новое название' }, 400);
  const need = franchiseThreshold(expected), earned = Number(me.earned || 0);
  if (!Number.isFinite(need) || !Number.isFinite(earned) || earned < need) return json({ ok: false, error: 'Сеть ещё не заработала достаточно для продажи' }, 409);
  const open = await env.DB.prepare("SELECT COUNT(*) n FROM market WHERE seller=?1 AND status='open'").bind(user.id).first();
  if(open && open.n) return json({ok:false,error:'Сначала сними сотрудников с трансферного рынка'},409);
  const pending = await env.DB.prepare('SELECT COUNT(*) n FROM market_operations WHERE tg_id=?1 AND applied_at IS NULL').bind(user.id).first();
  if(pending && pending.n) return json({ok:false,error:'Сначала восстанови незавершённые трансферы'},409);
  const now = Date.now(), receipt = { ok: true, franchises: expected + 1, shares: Math.floor(10 * Math.sqrt(earned / need)), name, soldAt: now };
  const value = JSON.stringify(receipt);
  const gate = 'EXISTS (SELECT 1 FROM cache WHERE key = ?2 AND val = ?3)';
  // batch выполняется атомарно. Квитанция создаётся только после успешного изменения версии сети.
  const result = await env.DB.batch([
    env.DB.prepare("UPDATE players SET franchises = ?2, cafe = ?3, level = 1, money = 0, earned = 0, rooms = 1, best_day = 0, snap = NULL WHERE tg_id = ?1 AND COALESCE(franchises, 0) = ?4 AND earned >= ?5 AND NOT EXISTS(SELECT 1 FROM market WHERE seller=?1 AND status='open') AND NOT EXISTS(SELECT 1 FROM market_operations WHERE tg_id=?1 AND applied_at IS NULL)").bind(user.id, expected + 1, name, expected, need),
    env.DB.prepare('INSERT OR IGNORE INTO cache (key, val, at) SELECT ?1, ?2, ?3 WHERE changes() > 0').bind(key, value, now),
    env.DB.prepare(`UPDATE market_accounts SET franchises=?4,roster='[]' WHERE tg_id=?1 AND EXISTS(SELECT 1 FROM cache WHERE key=?2 AND val=?3)`).bind(user.id,key,value,expected+1),
    env.DB.prepare(`UPDATE admin_ops SET applied_at=?4 WHERE tg_id=?1 AND op='trsold' AND applied_at IS NULL AND EXISTS(SELECT 1 FROM cache WHERE key=?2 AND val=?3)`).bind(user.id,key,value,now),
    env.DB.prepare(`DELETE FROM season WHERE tg_id = ?1 AND season = ?4 AND ${gate}`).bind(user.id, key, value, sezId(now)),
    env.DB.prepare(`DELETE FROM tour WHERE tg_id = ?1 AND week = ?4 AND ${gate}`).bind(user.id, key, value, tourWeek(now)),
    env.DB.prepare(`DELETE FROM cache WHERE key IN (?1, ?4) AND ${gate}`).bind('sz_' + sezId(now), key, value, 'top_' + tourWeek(now))
  ]);
  if (!(result[0].meta && result[0].meta.changes)) {
    const saved = await env.DB.prepare('SELECT val FROM cache WHERE key = ?1').bind(key).first();
    return saved ? json(JSON.parse(saved.val)) : json({ ok: false, error: 'Состояние сети изменилось. Обнови игру' }, 409);
  }
  return json(receipt);
}
