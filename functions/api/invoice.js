// POST /api/invoice — создаёт ссылку на оплату звёздами для товара из каталога.
import { json, verifyInitData, tgApi, SHOP } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad initData' }, 401);
  const item = SHOP[body.item];
  if (!item) return json({ ok: false, error: 'unknown item' }, 400);
  const payload = JSON.stringify({ u: user.id, i: body.item, n: Math.random().toString(36).slice(2, 10) });
  const req = { title: item.title, description: item.desc, payload, currency: 'XTR', prices: [{ label: item.title, amount: item.stars }] };
  if (item.sub) req.subscription_period = 2592000;
  const r = await tgApi(env, 'createInvoiceLink', req);
  if (!r.ok) return json({ ok: false, error: r.description || 'telegram error' }, 502);
  return json({ ok: true, link: r.result });
}
