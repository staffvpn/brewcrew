// GET /tg/setup?key=WEBHOOK_SECRET — один раз открыть в браузере после настройки переменных.
// Подключает вебхук бота, кнопку меню и список команд.
import { json, tgApi } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) return json({ ok: false, error: 'Добавьте BOT_TOKEN и WEBHOOK_SECRET в переменные проекта' }, 503);
  if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return json({ ok: false, error: 'Неверный ключ' }, 403);
  const origin = url.origin;
  const webhook = await tgApi(env, 'setWebhook', { url: origin + '/tg/webhook', secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'pre_checkout_query', 'callback_query', 'inline_query'], drop_pending_updates: true });
  const menu = await tgApi(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть кофейню', web_app: { url: origin } } });
  const cmds = await tgApi(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Открыть кофейню' }, { command: 'paysupport', description: 'Помощь с покупками' }] });
  return json({ ok: webhook.ok && menu.ok, webhook, menu, commands: cmds, db: Boolean(env.DB) });
}
