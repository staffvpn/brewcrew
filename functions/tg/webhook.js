// POST /tg/webhook — сюда Telegram присылает сообщения боту. Команды: /start, /admin (только для админов).
import { ADMINS, json, mskDay, tgApi, SHOP, dispatchReminders } from '../_lib.js';

const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function adminReport(env) {
  const now = Date.now();
  const today = mskDay(now);
  const day7 = mskDay(now - 6 * 86400000), day30 = mskDay(now - 29 * 86400000);
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
  const [total, newToday, dau, wau, mau, online, avg, cities, top, days, pay] = await Promise.all([
    q('SELECT COUNT(*) n FROM players'),
    q('SELECT COUNT(*) n FROM players WHERE created_at >= ?1', Date.parse(today + 'T00:00:00+03:00')),
    q('SELECT COUNT(*) n FROM days WHERE day = ?1', today),
    q('SELECT COUNT(DISTINCT tg_id) n FROM days WHERE day >= ?1', day7),
    q('SELECT COUNT(DISTINCT tg_id) n FROM days WHERE day >= ?1', day30),
    q('SELECT COUNT(*) n FROM players WHERE last_seen >= ?1', now - 3 * 60000),
    q('SELECT AVG(level) lvl, AVG(play_seconds) sec, SUM(franchises) fr, SUM(bankrupt) bk, AVG(sessions) ses FROM players'),
    env.DB.prepare('SELECT city, COUNT(*) n FROM players GROUP BY city ORDER BY n DESC LIMIT 6').all(),
    env.DB.prepare('SELECT cafe, first_name, username, level, earned FROM players ORDER BY earned DESC LIMIT 5').all(),
    env.DB.prepare('SELECT day, COUNT(*) n FROM days WHERE day >= ?1 GROUP BY day ORDER BY day').bind(day7).all(),
    q("SELECT COALESCE(SUM(stars),0) s, COUNT(*) n, COUNT(DISTINCT tg_id) u, COALESCE(SUM(CASE WHEN created_at >= ?1 THEN stars ELSE 0 END),0) t, SUM(CASE WHEN item = 'sub_owner' AND expires_at > ?2 THEN 1 ELSE 0 END) subs FROM purchases WHERE refunded = 0", Date.parse(today + 'T00:00:00+03:00'), now)
  ]);
  const cityName = { msk: 'Москва', spb: 'Петербург', kzn: 'Казань', sochi: 'Сочи', nsk: 'Новосибирск', kgd: 'Калининград' };
  const lines = [
    '<b>Brew Crew · статистика</b>',
    '',
    `Онлайн сейчас: <b>${online.n}</b>`,
    `Всего игроков: <b>${total.n}</b>`,
    `Новых сегодня: <b>${newToday.n}</b>`,
    `Заходили сегодня: <b>${dau.n}</b>`,
    `За 7 дней: <b>${wau.n}</b> · за 30 дней: <b>${mau.n}</b>`,
    '',
    `Средний уровень: ${(avg.lvl || 0).toFixed(1)}`,
    `Среднее время в игре: ${Math.round((avg.sec || 0) / 60)} мин`,
    `Сессий на игрока: ${(avg.ses || 0).toFixed(1)}`,
    `Франшиз продано: ${avg.fr || 0} · банкротств: ${avg.bk || 0}`,
    '',
    '<b>Звёзды</b>',
    `Всего: ${pay.s} ★ · сегодня: ${pay.t} ★`,
    `Покупок: ${pay.n} · платящих: ${pay.u} · активных подписок: ${pay.subs || 0}`,
    '',
    '<b>По дням</b>',
    ...(days.results || []).map(d => `${d.day.slice(5)}: ${d.n}`),
    '',
    '<b>Города</b>',
    ...(cities.results || []).map(c => `${cityName[c.city] || c.city || 'не выбран'}: ${c.n}`),
    '',
    '<b>Топ по заработку</b>',
    ...(top.results || []).map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}» — ${esc(t.first_name || '')}${t.username ? ' @' + esc(t.username) : ''}, ур. ${t.level}, ${fmt(t.earned)} ₽`)
  ];
  return lines.join('\n');
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (waitUntil) waitUntil(dispatchReminders(env));
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

  if (text.startsWith('/admin')) {
    if (!ADMINS.includes(from)) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Эта команда только для администраторов.' });
    } else if (!env.DB) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'База не подключена: добавьте привязку DB в настройках Cloudflare Pages.' });
    } else {
      await tgApi(env, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: await adminReport(env),
        reply_markup: { inline_keyboard: [[{ text: 'Открыть игру', web_app: { url: origin } }]] } });
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
