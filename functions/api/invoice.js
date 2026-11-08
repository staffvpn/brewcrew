// POST /api/invoice — создаёт ссылку на оплату звёздами для товара из каталога.
import { json, verifyInitData, tgApi, SHOP, giftCheck } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad initData' }, 401);
  const item = SHOP[body.item];
  if (!item) return json({ ok: false, error: 'unknown item' }, 400);
  // подарок другому игроку: проверяем получателя и что у него этого ещё нет
  let g = 0, gName = '';
  if (body.gift) {
    if (!env.DB) return json({ ok: false, error: 'not configured' }, 503);
    const chk = await giftCheck(env, user.id, Number(body.gift) || 0, body.item);
    if (!chk.ok) return json({ ok: false, error: chk.error });
    g = chk.id; gName = chk.cafe;
  }
  const payload = JSON.stringify(g ? { u: user.id, i: body.item, g, n: Math.random().toString(36).slice(2, 8) } : { u: user.id, i: body.item, n: Math.random().toString(36).slice(2, 10) });
  const title = g ? ('Подарок: ' + item.title).slice(0, 32) : item.title;
  const desc = g ? ('Подарок для кофейни «' + gName + '». ' + item.desc).slice(0, 255) : item.desc;
  const req = { title, description: desc, payload, currency: 'XTR', prices: [{ label: title, amount: item.stars }] };
  if (item.sub) req.subscription_period = 2592000;
  const r = await tgApi(env, 'createInvoiceLink', req);
  if (!r.ok) return json({ ok: false, error: r.description || 'telegram error' }, 502);
  return json({ ok: true, link: r.result });
}
