// POST /tg/webhook — сюда Telegram присылает сообщения боту. Команды: /start, /admin (только для админов).
import { ADMINS, json, mskDay, tgApi, SHOP, dispatchReminders } from '../_lib.js';
import { adminCommand, adminCallback } from '../_admin.js';
import { channelTick } from '../_channel.js';

const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function adminReport(env) {
  const now = Date.now();
  const today = mskDay(now);
  const day7 = mskDay(now - 6 * 86400000), day30 = mskDay(now - 29 * 86400000);
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
  const [total, newToday, wau, mau, online, avg, cities, top, pay] = await Promise.all([
    q('SELECT COUNT(*) n FROM players'),
    q('SELECT COUNT(*) n FROM players WHERE created_at >= ?1', Date.parse(today + 'T00:00:00+03:00')),
    q('SELECT COUNT(DISTINCT tg_id) n FROM days WHERE day >= ?1', day7),
    q('SELECT COUNT(DISTINCT tg_id) n FROM days WHERE day >= ?1', day30),
    q('SELECT COUNT(*) n FROM players WHERE last_seen >= ?1', now - 3 * 60000),
    q('SELECT AVG(play_seconds) sec, SUM(franchises) fr, SUM(bankrupt) bk, SUM(banned) ban FROM players'),
    env.DB.prepare('SELECT city, COUNT(*) n FROM players GROUP BY city ORDER BY n DESC LIMIT 6').all(),
    env.DB.prepare('SELECT cafe, first_name, username, level, earned FROM players ORDER BY earned DESC LIMIT 5').all(),
    q("SELECT COALESCE(SUM(stars),0) s, COUNT(*) n, COUNT(DISTINCT tg_id) u, COALESCE(SUM(CASE WHEN created_at >= ?1 THEN stars ELSE 0 END),0) t, SUM(CASE WHEN item = 'sub_owner' AND expires_at > ?2 THEN 1 ELSE 0 END) subs FROM purchases WHERE refunded = 0 AND stars > 0", Date.parse(today + 'T00:00:00+03:00'), now)
  ]);
  const cityName = { msk: 'Москва', spb: 'Петербург', kzn: 'Казань', sochi: 'Сочи', nsk: 'Новосибирск', kgd: 'Калининград' };
  const lines = [
    '<b>Brew Crew · статистика</b>',
    '',
    `Онлайн сейчас: <b>${online.n}</b>`,
    `Всего игроков: <b>${total.n}</b>`,
    `Новых сегодня: <b>${newToday.n}</b>`,
    `За 7 дней: <b>${wau.n}</b> · за 30 дней: <b>${mau.n}</b>`,
    '',
    `Среднее время в игре: ${Math.round((avg.sec || 0) / 60)} мин`,
    `Франшиз продано: ${avg.fr || 0} · банкротств: ${avg.bk || 0} · в бане: ${avg.ban || 0}`,
    '',
    '<b>Звёзды</b>',
    `Всего: ${pay.s} ★ · сегодня: ${pay.t} ★`,
    `Покупок: ${pay.n} · платящих: ${pay.u} · активных подписок: ${pay.subs || 0}`,
    '',
    '<b>Города</b>',
    ...(cities.results || []).map(c => `${cityName[c.city] || c.city || 'не выбран'}: ${c.n}`),
    '',
    '<b>Топ по заработку</b>',
    ...(top.results || []).map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}» — ${esc(t.first_name || '')}${t.username ? ' @' + esc(t.username) : ''}, ур. ${t.level}, ${fmt(t.earned)} ₽`),
    '',
    '<b>Управление игроками</b>',
    '<code>/u</code> ID, @username, имя или кофейня — карточка игрока',
    '<code>/give ID сумма</code> · <code>/take ID сумма</code> · <code>/set ID сумма</code>',
    '<code>/msg ID текст</code> · <code>/ban ID</code> · <code>/unban ID</code>',
    '<code>/online</code> · <code>/top</code> · <code>/last</code> · <code>/ops</code> — журнал действий',
    '',
    '<b>Рассылка и канал</b>',
    '<code>/all текст</code> — всем: в игре и в бота',
    '<code>/posts</code> · <code>/post</code> · <code>/editpost</code> · <code>/delpost</code> — посты канала'
  ];
  return lines.join('\n');
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (waitUntil) { waitUntil(dispatchReminders(env)); waitUntil(channelTick(env, new URL(request.url).origin)); }
  if (env.WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return json({ ok: false }, 403);
  }
  let upd;
  try { upd = await request.json(); } catch { return json({ ok: true }); }
  // оплата звёздами: подтверждаем счёт и записываем покупку
  if (upd.pre_checkout_query) {
    const q = upd.pre_checkout_query; let ok = false;
    try { const p = JSON.parse(q.invoice_payload); ok = Boolean(SHOP[p.i]) && p.u === q.from.id && q.currency === 'XTR' && q.total_amount === SHOP[p.i].stars; } catch {}
    await tgApi(env, 'answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: 'Товар не найден, попробуй ещё раз из игры' });
    return json({ ok: true });
  }
  if (upd.callback_query) {
    if (String(upd.callback_query.data || '').startsWith('a:') && env.DB) await adminCallback(env, upd.callback_query);
    else await tgApi(env, 'answerCallbackQuery', { callback_query_id: upd.callback_query.id });
    return json({ ok: true });
  }
  const msg = upd.message;
  if (msg && msg.successful_payment && env.DB) {
    const p = msg.successful_payment; let item = '?';
    try { item = JSON.parse(p.invoice_payload).i; } catch {}
    const exp = item === 'sub_owner' ? (p.subscription_expiration_date ? p.subscription_expiration_date * 1000 : Date.now() + 30 * 86400000) : null;
    await env.DB.prepare('INSERT OR IGNORE INTO purchases (charge_id, tg_id, item, stars, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(p.telegram_payment_charge_id, msg.from.id, item, p.total_amount, Date.now(), exp).run();
    const thanks = item.startsWith('tip_') ? 'Спасибо! Команда кофейни передаёт привет.' : 'Готово! Покупка уже в игре.';
    await tgApi(env, 'sendMessage', { chat_id: msg.chat.id, text: thanks });
    return json({ ok: true });
  }
  if (msg && msg.refunded_payment && env.DB) {
    await env.DB.prepare('UPDATE purchases SET refunded = 1 WHERE charge_id = ?1').bind(msg.refunded_payment.telegram_payment_charge_id).run();
    return json({ ok: true });
  }
  if (!msg || !msg.text) return json({ ok: true });
  const chat = msg.chat.id, from = msg.from && msg.from.id;
  const text = msg.text.trim();
  const origin = new URL(request.url).origin;

  if (text.startsWith('/') && env.DB && await adminCommand(env, chat, from, text, origin)) return json({ ok: true });
  if (text.startsWith('/admin')) {
    if (!ADMINS.includes(from)) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Эта команда только для администраторов.' });
    } else if (!env.DB) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'База не подключена: добавьте привязку DB в настройках Cloudflare Pages.' });
    } else {
      // кнопкам админки нужны callback_query: включаем их в вебхуке и показываем админу его команды
      if (waitUntil && env.WEBHOOK_SECRET) waitUntil(Promise.all([
        tgApi(env, 'setWebhook', { url: origin + '/tg/webhook', secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'pre_checkout_query', 'callback_query'] }),
        tgApi(env, 'setMyCommands', { scope: { type: 'chat', chat_id: chat }, commands: [
          { command: 'admin', description: 'Статистика' }, { command: 'u', description: 'Найти игрока' }, { command: 'online', description: 'Кто сейчас в игре' },
          { command: 'top', description: 'Топ по заработку' }, { command: 'last', description: 'Новые игроки' }, { command: 'ops', description: 'Журнал действий' }, { command: 'start', description: 'Открыть кофейню' }] })
      ]));
      await tgApi(env, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: await adminReport(env),
        reply_markup: { inline_keyboard: [[{ text: 'Сейчас в игре', callback_data: 'a:list:online:0' }, { text: 'Топ-10', callback_data: 'a:list:top:0' }, { text: 'Новые', callback_data: 'a:list:last:0' }], [{ text: 'Открыть игру', web_app: { url: origin } }]] } });
    }
  } else if (text.startsWith('/digest')) {
    if (!ADMINS.includes(from)) return json({ ok: true });
    if (!env.CHANNEL_ID) { await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Добавьте CHANNEL_ID (например @brewcrew_news) в переменные Cloudflare и сделайте бота админом канала.' }); return json({ ok: true }); }
    const top = (await env.DB.prepare('SELECT cafe, city, level, earned FROM players ORDER BY earned DESC LIMIT 5').all()).results || [];
    const week = await env.DB.prepare('SELECT COUNT(*) n FROM players WHERE created_at >= ?1').bind(Date.now() - 7 * 86400000).first();
    const total = await env.DB.prepare('SELECT COUNT(*) n FROM players').first();
    const cityName = { msk: 'Москва', spb: 'Петербург', kzn: 'Казань', sochi: 'Сочи', nsk: 'Новосибирск', kgd: 'Калининград' };
    const body = ['<b>Районные вести · итоги недели</b>', '', `В городе ${total.n} кофеен, за неделю открылось ${week.n} новых.`, '', '<b>Самые прибыльные</b>',
      ...top.map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}», ${cityName[t.city] || ''}, ур. ${t.level} — ${fmt(t.earned)} ₽`), '', 'А у тебя как дела за стойкой?'].join('\n');
    const r = await tgApi(env, 'sendMessage', { chat_id: env.CHANNEL_ID, parse_mode: 'HTML', text: body, reply_markup: { inline_keyboard: [[{ text: 'Открыть свою кофейню', url: `https://t.me/${(await tgApi(env, 'getMe', {})).result.username}?start=channel` }]] } });
    await tgApi(env, 'sendMessage', { chat_id: chat, text: r.ok ? 'Дайджест опубликован в канале.' : 'Не получилось: ' + (r.description || '') });
  } else if (text.startsWith('/paysupport')) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Проблема с покупкой? Напиши, что купил и когда, мы разберёмся и при необходимости вернём звёзды.' });
  } else if (text.startsWith('/start') || text.startsWith('/play')) {
    await tgApi(env, 'sendMessage', { chat_id: chat,
      text: 'Brew Crew — кофейня, где все на грани. Нанимай команду, прокачивай зал, разбирайся с проверками, прогулами и гусями. 18+',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', web_app: { url: origin + (text.split(' ')[1] ? '?tgWebAppStartParam=' + encodeURIComponent(text.split(' ')[1]) : '') } }]] } });
  }
  return json({ ok: true });
}
