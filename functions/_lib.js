// Общие функции для серверной части Brew Crew (Cloudflare Pages Functions)

export const ADMINS = [929887068, 432943377];

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

// День по Москве (UTC+3) в формате YYYY-MM-DD
export function mskDay(ts = Date.now()) {
  return new Date(ts + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
}
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');

// Проверка подписи initData от Telegram Mini App. Возвращает объект user или null.
export async function verifyInitData(initData, botToken, maxAgeSec = 86400 * 7) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', botToken);
  const calc = hex(await hmac(secret, check));
  if (calc !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

export async function tgApi(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.json();
}

// Каталог покупок за Telegram Stars (цены в звёздах)
export const SHOP = {
  sub_owner: { title: 'Подписка «Владелец»', desc: 'Кофейня без тебя работает до 24 часов, офлайн-доход 80%. На 30 дней.', stars: 150, sub: true },
  int_loft: { title: 'Интерьер «Заводской лофт»', desc: 'Мягкий кирпич, бетонный пол, чёрный металл и лампы Эдисона. Средний чек +6%.', stars: 75 },
  int_scandi: { title: 'Интерьер «Фика»', desc: 'Белые стены, светлый дуб и шалфейные кресла. Гости ждут на 15% дольше.', stars: 100 },
  int_soviet: { title: 'Интерьер «Столовая №1»', desc: 'Пастельный кафель, клетчатый пол и плакат «Пей кофе». Гостей +8%.', stars: 50 },
  int_neon: { title: 'Интерьер «Не спим»', desc: 'Вечерний сиреневый зал и мягкий неон. После 20:00 гостей +30%.', stars: 150 },
  rename: { title: 'Новое название кофейни', desc: 'Одна смена названия. Новое название должно быть свободным.', stars: 50 },
  cash_s: { title: 'Конверт от инвестора', desc: 'Игровые деньги: примерно дневная выручка кофейни, не меньше 300 000 ₽.', stars: 25, cash: 1 },
  cash_m: { title: 'Мама дала в долг без процентов', desc: 'Игровые деньги: примерно три дня выручки, не меньше 1 000 000 ₽.', stars: 60, cash: 3 },
  cash_l: { title: 'Чемодан из девяностых', desc: 'Игровые деньги: примерно восемь дней выручки, не меньше 3 000 000 ₽.', stars: 150, cash: 8 },
  cash_xl: { title: 'Спонсор из Дубая', desc: 'Игровые деньги: примерно двадцать дней выручки, не меньше 8 000 000 ₽.', stars: 350, cash: 20 }
};

// Отправка накопившихся напоминаний (вызывается из трекинга и вебхука — «ленивый крон»)
export async function dispatchReminders(env, limit = 15) {
  if (!env.DB || !env.BOT_TOKEN) return 0;
  const now = Date.now();
  const h = (new Date(now + 3 * 3600000)).getUTCHours();
  if (h < 10 || h >= 22) return 0; // ночью не пишем
  const due = (await env.DB.prepare('SELECT r.id, r.tg_id, r.text FROM reminders r JOIN players p ON p.tg_id = r.tg_id WHERE r.sent = 0 AND r.at <= ?1 AND p.write_ok = 1 ORDER BY r.at LIMIT ?2').bind(now, limit).all()).results || [];
  for (const r of due) {
    // не больше одного уведомления в сутки на игрока
    const last = await env.DB.prepare('SELECT MAX(sent_at) t FROM reminders WHERE tg_id = ?1 AND sent = 1').bind(r.tg_id).first();
    if (last && last.t && now - last.t < 20 * 3600000) { await env.DB.prepare('UPDATE reminders SET sent = 2 WHERE id = ?1').bind(r.id).run(); continue; }
    await env.DB.prepare('UPDATE reminders SET sent = 1, sent_at = ?2 WHERE id = ?1').bind(r.id, now).run();
    try { await tgApi(env, 'sendMessage', { chat_id: r.tg_id, text: r.text, reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', web_app: { url: env.APP_URL || 'https://brewcrew.pages.dev' } }]] } }); } catch {}
  }
  return due.length;
}
let botInfo = null;
export async function getBot(env) {
  if (botInfo) return botInfo;
  const r = await tgApi(env, 'getMe', {});
  if (r.ok) botInfo = r.result;
  return botInfo;
}

// Рефералы. Привязка друга к пригласившему: только для новых (до 3 суток) и только один раз.
export const REF_START = 100000, REF_REWARD = 150000, REF_WINDOW = 3 * 86400000;
const escH = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export function parseRef(v) { const m = typeof v === 'string' ? v.match(/^ref_(\d{3,15})$/) : null; return m ? Number(m[1]) : null; }
async function refLog(env, uid, ref, src, res) { try { await env.DB.prepare('INSERT INTO ref_log (tg_id, ref, src, res, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(uid, ref, src || null, res, Date.now()).run(); } catch {} }
// Привязка: друг без пригласившего, новый (до 3 суток) или ещё невысокого уровня (до 5). force — ручная привязка из админки.
export async function bindReferrer(env, user, refId, src, force) {
  if (!refId || !user || !user.id) return false;
  if (refId === user.id) { await refLog(env, user.id, refId, src, 'self'); return false; }
  const inv = await env.DB.prepare('SELECT tg_id, first_name, referrer FROM players WHERE tg_id = ?1').bind(refId).first();
  if (!inv) { await refLog(env, user.id, refId, src, 'no_inviter'); return false; }
  if (inv.referrer === user.id) { await refLog(env, user.id, refId, src, 'circular'); return false; }
  const now = Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO players (tg_id, username, first_name, lang, created_at, last_seen, sessions) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0)')
    .bind(user.id, user.username || null, user.first_name || null, user.language_code || null, now).run();
  const r = force
    ? await env.DB.prepare('UPDATE players SET referrer = ?2 WHERE tg_id = ?1 AND (referrer IS NULL OR referrer != ?2)').bind(user.id, refId).run()
    : await env.DB.prepare('UPDATE players SET referrer = ?2 WHERE tg_id = ?1 AND referrer IS NULL AND (created_at > ?3 OR COALESCE(level, 1) <= 5)').bind(user.id, refId, now - REF_WINDOW).run();
  if (!(r.meta && r.meta.changes)) {
    const me = await env.DB.prepare('SELECT referrer, level FROM players WHERE tg_id = ?1').bind(user.id).first();
    if (!(me && me.referrer === refId)) await refLog(env, user.id, refId, src, me && me.referrer ? 'has_other' : 'too_old');
    return false;
  }
  await refLog(env, user.id, refId, src, 'ok');
  await env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at) VALUES (?1, 'refgift', ?2, ?3, ?4)")
    .bind(user.id, REF_START, 'Бонус за вход по приглашению: +100 000 ₽', now).run();
  try { await tgApi(env, 'sendMessage', { chat_id: refId, parse_mode: 'HTML', text: `По твоей ссылке пришёл <b>${escH(user.first_name || 'друг')}</b>. Когда он дойдёт до 3 уровня, тебе придёт 150 000 ₽.` }); } catch {}
  try { await payReferrer(env, user.id); } catch {}
  return true;
}
// Награда пригласившему, когда друг дошёл до 3 уровня. Выдаётся один раз за каждого друга.
export async function payReferrer(env, uid) {
  const r = await env.DB.prepare('UPDATE players SET ref_paid = 1, ref_claimed = ref_claimed WHERE tg_id = ?1 AND referrer IS NOT NULL AND level >= 3 AND COALESCE(ref_paid, 0) = 0').bind(uid).run();
  if (!(r.meta && r.meta.changes)) return false;
  const f = await env.DB.prepare('SELECT referrer, first_name, cafe FROM players WHERE tg_id = ?1').bind(uid).first();
  if (!f || !f.referrer) return false;
  await env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at) VALUES (?1, 'refgift', ?2, ?3, ?4)")
    .bind(f.referrer, REF_REWARD, `${f.first_name || 'Друг'} дошёл до 3 уровня: +150 000 ₽`, Date.now()).run();
  try { await tgApi(env, 'sendMessage', { chat_id: f.referrer, parse_mode: 'HTML', text: `Твой друг <b>${escH(f.first_name || '')}</b> («${escH(f.cafe || '?')}») дошёл до 3 уровня. Тебе 150 000 ₽, заберутся при входе в игру.` }); } catch {}
  return true;
}
