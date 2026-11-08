// POST /tg/webhook — сюда Telegram присылает сообщения боту. Команды: /start, /admin (только для админов).
import { ADMINS, json, mskDay, tgApi, SHOP, dispatchReminders, parseRef, bindReferrer, GIFTABLE } from '../_lib.js';
import { adminCommand, adminCallback, adminInput } from '../_admin.js';
import { channelTick } from '../_channel.js';
import { inlineAnswer } from '../_inline.js';

const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

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
    try { const p = JSON.parse(q.invoice_payload); ok = Boolean(SHOP[p.i]) && p.u === q.from.id && q.currency === 'XTR' && q.total_amount === SHOP[p.i].stars && (!p.g || (GIFTABLE(p.i) && p.g !== p.u)); } catch {}
    await tgApi(env, 'answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: 'Товар не найден, попробуй ещё раз из игры' });
    return json({ ok: true });
  }
  if (upd.inline_query) { try { await inlineAnswer(env, upd.inline_query, new URL(request.url).origin); } catch {} return json({ ok: true }); }
  if (upd.callback_query) {
    if (/^[pa]:/.test(String(upd.callback_query.data || '')) && env.DB) await adminCallback(env, upd.callback_query);
    else await tgApi(env, 'answerCallbackQuery', { callback_query_id: upd.callback_query.id });
    return json({ ok: true });
  }
  const msg = upd.message;
  if (msg && msg.successful_payment && env.DB) {
    const p = msg.successful_payment; let item = '?', gift = 0;
    try { const pl = JSON.parse(p.invoice_payload); item = pl.i; gift = Number(pl.g) || 0; } catch {}
    if (gift && GIFTABLE(item)) {
      const now = Date.now();
      await env.DB.prepare('INSERT OR IGNORE INTO purchases (charge_id, tg_id, item, stars, created_at, expires_at, gift_from) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)')
        .bind(p.telegram_payment_charge_id, gift, item, p.total_amount, now, msg.from.id).run();
      const from = await env.DB.prepare('SELECT cafe FROM players WHERE tg_id = ?1').bind(msg.from.id).first();
      const to = await env.DB.prepare('SELECT cafe, write_ok FROM players WHERE tg_id = ?1').bind(gift).first();
      const fromCafe = (from && from.cafe) || msg.from.first_name || 'Друг', toCafe = (to && to.cafe) || 'друга';
      const title = SHOP[item] ? SHOP[item].title : 'подарок';
      if (SHOP[item] && SHOP[item].cash) await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, ?3, ?4, ?5, 0)').bind(gift, 'cash', SHOP[item].cash, 'Подарок от «' + fromCafe + '»', now).run();
      else await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, 0, ?3, ?4, 0)').bind(gift, 'ent', '', now).run();
      await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, 0, ?3, ?4, 0)').bind(gift, 'giftin', JSON.stringify({ from: fromCafe, item, title }), now).run();
      try { await tgApi(env, 'sendMessage', { chat_id: gift, text: 'Тебе подарок! Кофейня «' + fromCafe + '» дарит: ' + title + '. Зайди в игру, он уже там.' }); } catch {}
      await tgApi(env, 'sendMessage', { chat_id: msg.chat.id, text: 'Подарок отправлен кофейне «' + toCafe + '»: ' + title + '. Мы им уже написали.' });
      return json({ ok: true });
    }
    const exp = item === 'sub_owner' ? (p.subscription_expiration_date ? p.subscription_expiration_date * 1000 : Date.now() + 30 * 86400000) : null;
    await env.DB.prepare('INSERT OR IGNORE INTO purchases (charge_id, tg_id, item, stars, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(p.telegram_payment_charge_id, msg.from.id, item, p.total_amount, Date.now(), exp).run();
    if (SHOP[item] && SHOP[item].cash) await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, ?3, ?4, ?5, 0)').bind(msg.from.id, 'cash', SHOP[item].cash, SHOP[item].title, Date.now()).run();
    const thanks = SHOP[item] && SHOP[item].cash ? 'Готово! Деньги уже летят в кассу кофейни.' : (item === 'pass' || item === 'pass15') ? 'Пропуск сезона активирован. Открой игру: всё пройденное заберётся сразу.' : 'Готово! Покупка уже в игре.';
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

  if (env.DB && ADMINS.includes(from) && !text.startsWith('/') && await adminInput(env, chat, from, msg.message_id, text)) return json({ ok: true });
  if (text.startsWith('/admin')) {
    if (!env.DB) { await tgApi(env, 'sendMessage', { chat_id: chat, text: 'База не подключена.' }); return json({ ok: true }); }
    if (ADMINS.includes(from) && waitUntil && env.WEBHOOK_SECRET) waitUntil(Promise.all([
      tgApi(env, 'setWebhook', { url: origin + '/tg/webhook', secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'pre_checkout_query', 'callback_query', 'inline_query'] }),
      tgApi(env, 'setMyCommands', { scope: { type: 'chat', chat_id: chat }, commands: [{ command: 'admin', description: 'Админка' }, { command: 'start', description: 'Открыть кофейню' }] })
    ]));
    await adminCommand(env, chat, from, text, origin);
  } else if ((text.startsWith('/rel10off') || text.startsWith('/rel10on')) && ADMINS.includes(from) && env.DB) {
    const off = text.startsWith('/rel10off');
    await env.DB.prepare("INSERT INTO cache (key, val, at) VALUES ('rel10_off', ?1, ?2) ON CONFLICT(key) DO UPDATE SET val = ?1, at = ?2").bind(off ? '1' : '0', Date.now()).run();
    await tgApi(env, 'sendMessage', { chat_id: chat, text: off ? 'Обновление 10 выключено. Игроки вернутся к прежней игре в течение 10 минут (или сразу после перезапуска игры). Пост об обновлении не выйдет. Включить обратно: /rel10on' : 'Обновление 10 включено (после 1 декабря 12:00 МСК — у всех, до этого — только у админов). Выключить: /rel10off' });
  } else if (text.startsWith('/paysupport')) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Проблема с покупкой? Напиши, что купил и когда, мы разберёмся и при необходимости вернём звёзды.' });
  } else if (text.startsWith('/start') || text.startsWith('/play')) {
    try { const rid = parseRef(text.split(' ')[1]); if (rid && env.DB && msg.from) await bindReferrer(env, msg.from, rid, 'bot'); } catch {}
    await tgApi(env, 'sendMessage', { chat_id: chat,
      text: 'Brew Crew — кофейня, где все на грани. Нанимай команду, прокачивай зал, разбирайся с проверками, прогулами и гусями. 18+',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', web_app: { url: origin + (text.split(' ')[1] ? '?tgWebAppStartParam=' + encodeURIComponent(text.split(' ')[1]) : '') } }]] } });
  }
  return json({ ok: true });
}
