// GET /api/cron?key=WEBHOOK_SECRET — можно дёргать внешним кроном раз в 5–10 минут для точных напоминаний.
import { json, dispatchReminders } from '../_lib.js';
export async function onRequestGet({ request, env }) {
  if (new URL(request.url).searchParams.get('key') !== env.WEBHOOK_SECRET) return json({ ok: false }, 403);
  const n = await dispatchReminders(env, 50);
  return json({ ok: true, sent: n });
}
