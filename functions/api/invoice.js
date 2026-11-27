// POST /api/invoice — создаёт ссылку на оплату звёздами для товара из каталога.
import { json, verifyInitData, tgApi, SHOP, giftCheck, weekendStart } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.BOT_TOKEN || !env.DB) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  if (!body || typeof body !== "object") return json({ok:false},400);
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad initData' }, 401);
  if (!body || typeof body !== 'object' || typeof body.item !== 'string') return json({ok:false},400);
  const item = Object.hasOwn(SHOP, body.item) ? SHOP[body.item] : null;
  if (!item) return json({ ok: false, error: 'unknown item' }, 400);
  if (item.archived) return json({ ok: false, error: 'Предмет снят с продажи' }, 400);
  if(body.shopVersion!==2)return json({ok:false,error:'Цены магазина обновились. Перезапусти игру перед покупкой.'},409);
  if (item.weekend) {
    const ws = weekendStart(); if (!ws) return json({ ok: false, error: 'Набор выходных продаётся с пятницы 18:00 до воскресенья 23:59' });
    if (body.gift) return json({ ok: false, error: 'Набор выходных нельзя подарить' });
    const had = await env.DB.prepare("SELECT 1 x FROM purchases WHERE tg_id = ?1 AND item = 'weekend' AND refunded = 0 AND created_at >= ?2").bind(user.id, ws).first();
    if (had) return json({ ok: false, error: 'Набор этих выходных уже куплен' });
  }
  if(item.currency==='GAME')return json({ok:false,error:'Этот предмет покупается за игровые деньги в магазине'},400);
  if (item.once && env.DB && !body.gift) { const had = await env.DB.prepare('SELECT 1 x FROM purchases WHERE tg_id = ?1 AND item = ?2 AND refunded = 0').bind(user.id, body.item).first(); if (had) return json({ ok: false, error: 'Этот набор уже куплен' }); }
  // подарок другому игроку: проверяем получателя и что у него этого ещё нет
  let g = 0, gName = '';
  if (body.gift) {
    if (!env.DB) return json({ ok: false, error: 'not configured' }, 503);
    const chk = await giftCheck(env, user.id, Number(body.gift) || 0, body.item);
    if (!chk.ok) return json({ ok: false, error: chk.error });
    g = chk.id; gName = chk.cafe;
  }
  const n=crypto.randomUUID().replaceAll('-','').slice(0,16);
  const payload=JSON.stringify(g?{u:user.id,i:body.item,g,n}:{u:user.id,i:body.item,n});
  await env.DB.prepare('INSERT OR REPLACE INTO cache (key,val,at) VALUES (?1,?2,?3)').bind('invoice_'+n,JSON.stringify({u:user.id,i:body.item,g,amount:item.stars,...(item.cashAmount?{cashVersion:2,cashAmount:item.cashAmount}:{})}),Date.now()).run();
  const title = g ? ('Подарок: ' + item.title).slice(0, 32) : item.title;
  const desc = g ? ('Подарок для кофейни «' + gName + '». ' + item.desc).slice(0, 255) : item.desc;
  const req = { title, description: desc, payload, currency: 'XTR', prices: [{ label: title, amount: item.stars }] };
  if (item.sub) req.subscription_period = 2592000;
  const r = await tgApi(env, 'createInvoiceLink', req);
  if (!r.ok) return json({ ok: false, error: r.description || 'telegram error' }, 502);
  return json({ ok: true, link: r.result });
}
