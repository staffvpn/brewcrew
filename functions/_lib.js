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
  int_loft: { title: 'Интерьер «Лофт»', desc: 'Кирпич, бетон и лампочки Эдисона. Только внешний вид.', stars: 75 },
  int_scandi: { title: 'Интерьер «Скандинавский»', desc: 'Светлое дерево и много воздуха. Только внешний вид.', stars: 100 },
  int_soviet: { title: 'Интерьер «Столовая»', desc: 'Кафель, клеёнка и плакаты. Только внешний вид.', stars: 100 },
  int_neon: { title: 'Интерьер «Неон»', desc: 'Тёмный зал и розовый неон. Только внешний вид.', stars: 150 },
  rename: { title: 'Новое название кофейни', desc: 'Одна смена названия. Новое название должно быть свободным.', stars: 50 },
  tip_50: { title: 'Угостить бариста кофе', desc: 'Чаевые разработчику. Спасибо!', stars: 50 },
  tip_150: { title: 'Угостить всю смену', desc: 'Чаевые разработчику. Огромное спасибо!', stars: 150 },
  tip_500: { title: 'Купить команде кофемашину', desc: 'Чаевые разработчику. Ты лучший.', stars: 500 }
};

// Отправка накопившихся напоминаний (вызывается из трекинга и вебхука — «ленивый крон»)
export async function dispatchReminders(env, limit = 15) {
  if (!env.DB || !env.BOT_TOKEN) return 0;
  const now = Date.now();
  const due = (await env.DB.prepare('SELECT r.id, r.tg_id, r.text FROM reminders r JOIN players p ON p.tg_id = r.tg_id WHERE r.sent = 0 AND r.at <= ?1 AND p.write_ok = 1 ORDER BY r.at LIMIT ?2').bind(now, limit).all()).results || [];
  for (const r of due) {
    await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?1').bind(r.id).run();
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
