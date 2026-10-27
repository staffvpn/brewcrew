// POST /tg/webhook — сюда Telegram присылает сообщения боту. Команды: /start, /admin (только для админов).
import { ADMINS, json, mskDay, tgApi, SHOP, dispatchReminders } from '../_lib.js';
import { adminCommand, adminCallback, adminInput } from '../_admin.js';
import { channelTick } from '../_channel.js';

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
    try { const p = JSON.parse(q.invoice_payload); ok = Boolean(SHOP[p.i]) && p.u === q.from.id && q.currency === 'XTR' && q.total_amount === SHOP[p.i].stars; } catch {}
    await tgApi(env, 'answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: 'Товар не найден, попробуй ещё раз из игры' });
    return json({ ok: true });
  }
  if (upd.callback_query) {
    if (/^[pa]:/.test(String(upd.callback_query.data || '')) && env.DB) await adminCallback(env, upd.callback_query);
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

  if (env.DB && ADMINS.includes(from) && !text.startsWith('/') && await adminInput(env, chat, from, msg.message_id, text)) return json({ ok: true });
  if (text.startsWith('/admin')) {
    if (!env.DB) { await tgApi(env, 'sendMessage', { chat_id: chat, text: 'База не подключена.' }); return json({ ok: true }); }
    if (ADMINS.includes(from) && waitUntil && env.WEBHOOK_SECRET) waitUntil(Promise.all([
      tgApi(env, 'setWebhook', { url: origin + '/tg/webhook', secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'pre_checkout_query', 'callback_query'] }),
      tgApi(env, 'setMyCommands', { scope: { type: 'chat', chat_id: chat }, commands: [{ command: 'admin', description: 'Админка' }, { command: 'start', description: 'Открыть кофейню' }] })
    ]));
    await adminCommand(env, chat, from, text, origin);
  } else if (text.startsWith('/paysupport')) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Проблема с покупкой? Напиши, что купил и когда, мы разберёмся и при необходимости вернём звёзды.' });
  } else if (text.startsWith('/start') || text.startsWith('/play')) {
    await tgApi(env, 'sendMessage', { chat_id: chat,
      text: 'Brew Crew — кофейня, где все на грани. Нанимай команду, прокачивай зал, разбирайся с проверками, прогулами и гусями. 18+',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', web_app: { url: origin + (text.split(' ')[1] ? '?tgWebAppStartParam=' + encodeURIComponent(text.split(' ')[1]) : '') } }]] } });
  }
  return json({ ok: true });
}
