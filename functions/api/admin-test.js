// Админские покупки только себе: Telegram-подпись и allowlist проверяются при каждом запросе.
import { json, verifyInitData, SHOP, sezId } from '../_lib.js';
import { adminTestEnabled, purchaseState } from '../_purchases.js';
import { TEST_SKINS, TEST_UPGRADES } from '../_test-catalog.js';

async function grantPremium(env, userId, item, style = false) {
  const now = Date.now(), product = style ? {} : SHOP[item];
  const consumable = !product.once && (product.cash || item === 'rename');
  const period = ['pass', 'pass15', 'sub_owner'].includes(item) ? ':' + sezId(now) : '';
  const charge = 'admin_test:' + userId + ':' + item + (consumable ? ':' + crypto.randomUUID() : period);
  const expires = item === 'sub_owner' ? now + 30 * 86400000 : null;
  const writes = [env.DB.prepare('INSERT OR IGNORE INTO purchases (charge_id, tg_id, item, stars, created_at, expires_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)').bind(charge, userId, item, now, expires)];
  if (product.cash) {
    // Повторная выдача once-товара не создаёт второе начисление в той же транзакции.
    writes.push(env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) SELECT ?1, ?2, ?3, ?4, ?5, ?1 WHERE changes() = 1").bind(userId,product.cashAmount?'give':'cash',product.cashAmount||product.cash,(product.cashAmount?'Stars · ':'Тест: ')+product.title,now));
  }
  await env.DB.batch(writes);
  return purchaseState(env, userId);
}

export async function onRequestPost({ request, env }) {
  if (!env.BOT_TOKEN) return json({ ok: false, error: 'not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'bad JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false }, 400);
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'bad initData' }, 401);
  const enabled = adminTestEnabled(env, user.id);
  if (body.kind === 'status') return json({ ok: true, adminTest: enabled });
  if (!enabled) return json({ ok: false, error: 'Только для администраторов' }, 403);
  if (body.gift || body.to || body.tg_id) return json({ ok: false, error: 'Тестовые покупки доступны только себе' }, 400);
  if (body.kind === 'skin') {
    const { category, id } = body;
    if (!Array.isArray(TEST_SKINS[category]) || !TEST_SKINS[category].includes(id)) return json({ ok: false, error: 'unknown item' }, 400);
    const grant = { kind: 'skin', category, id };
    if (category === 'style') {
      if (!env.DB) return json({ ok: false, error: 'not configured' }, 503);
      return json({ ok: true, adminTest: true, grant, entitlements: await grantPremium(env, user.id, id, true) });
    }
    return json({ ok: true, adminTest: true, grant });
  }
  if (body.kind === 'upgrade') {
    if (!TEST_UPGRADES.includes(body.id) || !Number.isInteger(body.count) || body.count < 1 || body.count > (body.id==='tables'?28:20)) return json({ ok: false, error: 'unknown upgrade' }, 400);
    return json({ ok: true, adminTest: true, grant: { kind: 'upgrade', id: body.id, count: body.count } });
  }
  if (body.kind === 'premium') {
    if (typeof body.item !== 'string' || !Object.hasOwn(SHOP, body.item)) return json({ ok: false, error: 'unknown item' }, 400);
    if (!env.DB) return json({ ok: false, error: 'not configured' }, 503);
    return json({ ok: true, adminTest: true, grant: { kind: 'premium', item: body.item }, entitlements: await grantPremium(env, user.id, body.item) });
  }
  return json({ ok: false, error: 'unknown action' }, 400);
}
