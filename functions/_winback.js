// Возврат ушедших (13-15.11): одно личное сообщение тем, кто не заходил 2-5 дней и разрешил писать боту.
import { tgApi } from './_lib.js';
const CAMPAIGN = 'wb1113', UNTIL = Date.parse('2026-11-15T19:00:00Z');
const TEXT = 'Твоя кофейня скучает. В субботу и воскресенье чаевые в банке вдвое больше, а гости ждут за стойкой. Заходи, пока выходные.';
export async function winbackTick(env) {
  if (!env.DB || !env.BOT_TOKEN) return 0;
  const now = Date.now(); if (now > UNTIL) return 0;
  const h = (new Date(now + 3 * 3600000)).getUTCHours(); if (h < 11 || h >= 21) return 0;
  const lock = await env.DB.prepare('SELECT val FROM cache WHERE key = ?1').bind(CAMPAIGN + '_lock').first();
  if (lock && now - Number(lock.val) < 60000) return 0;
  await env.DB.prepare('INSERT OR REPLACE INTO cache (key, val, at) VALUES (?1, ?2, ?3)').bind(CAMPAIGN + '_lock', String(now), now).run();
  const rows = (await env.DB.prepare(`SELECT tg_id FROM players WHERE write_ok = 1 AND COALESCE(banned,0) = 0 AND cafe IS NOT NULL AND last_seen BETWEEN ?1 AND ?2
    AND NOT EXISTS (SELECT 1 FROM cache c WHERE c.key = ?3 || '_' || players.tg_id) LIMIT 15`).bind(now - 5 * 86400000, now - 2 * 86400000, CAMPAIGN).all()).results || [];
  let n = 0;
  for (const r of rows) {
    await env.DB.prepare('INSERT OR IGNORE INTO cache (key, val, at) VALUES (?1, ?2, ?3)').bind(CAMPAIGN + '_' + r.tg_id, '1', now).run();
    try { const x = await tgApi(env, 'sendMessage', { chat_id: r.tg_id, text: TEXT, reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', web_app: { url: env.APP_URL || 'https://brewcrew.pages.dev' } }]] } }); if (x && x.ok) n++; } catch {}
  }
  return n;
}
