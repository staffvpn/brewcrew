// Админка в боте: поиск игрока, карточка, деньги, подписка, бан, удаление.
// Состояние игры хранится на устройстве игрока, поэтому изменения ставятся в очередь (admin_ops)
// и применяются игрой при следующем выходе на связь (раз в минуту, пока игра открыта).
import { ADMINS, tgApi } from './_lib.js';

const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CITY = { msk: 'Москва', spb: 'Петербург', kzn: 'Казань', sochi: 'Сочи', nsk: 'Новосибирск', kgd: 'Калининград' };
const ago = ts => { if (!ts) return 'никогда'; const m = Math.round((Date.now() - ts) / 60000); if (m < 2) return 'только что'; if (m < 60) return m + ' мин назад'; const h = Math.round(m / 60); if (h < 48) return h + ' ч назад'; return Math.round(h / 24) + ' дн назад'; };
const OPN = { give: 'Начислить', take: 'Списать', set: 'Установить баланс', wipe: 'Удалить аккаунт', ent: 'Обновить покупки', msg: 'Сообщение' };

export function parseAmount(s) {
  if (!s) return NaN;
  let t = String(s).toLowerCase().replace(/\s|_/g, '').replace(',', '.');
  let mul = 1;
  if (/(млн|m|kk)$/.test(t)) { mul = 1e6; t = t.replace(/(млн|m|kk)$/, ''); }
  else if (/(к|k|тыс)$/.test(t)) { mul = 1e3; t = t.replace(/(к|k|тыс)$/, ''); }
  const n = Number(t) * mul;
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

async function findPlayers(env, q) {
  q = String(q || '').trim().replace(/^@/, '');
  if (!q) return [];
  if (/^\d{3,15}$/.test(q)) {
    const r = await env.DB.prepare('SELECT * FROM players WHERE tg_id = ?1').bind(Number(q)).first();
    if (r) return [r];
  }
  const like = '%' + q.toLowerCase() + '%';
  return (await env.DB.prepare('SELECT * FROM players WHERE lower(username) = ?1 OR lower(username) LIKE ?2 OR lower(first_name) LIKE ?2 OR lower(cafe) LIKE ?2 ORDER BY last_seen DESC LIMIT 10')
    .bind(q.toLowerCase(), like).all()).results || [];
}

async function pendingOps(env, id) {
  return (await env.DB.prepare('SELECT * FROM admin_ops WHERE tg_id = ?1 AND applied_at IS NULL ORDER BY id').bind(id).all()).results || [];
}

export async function userCard(env, id) {
  const p = await env.DB.prepare('SELECT * FROM players WHERE tg_id = ?1').bind(id).first();
  if (!p) return { text: `Игрок ${id} не найден. Возможно, аккаунт уже удалён.`, kb: [] };
  const [pend, pay, fr, hist, sub] = await Promise.all([
    pendingOps(env, id),
    env.DB.prepare('SELECT COALESCE(SUM(stars),0) s, COUNT(*) n FROM purchases WHERE tg_id = ?1 AND refunded = 0 AND stars > 0').bind(id).first(),
    env.DB.prepare('SELECT COUNT(*) n, SUM(CASE WHEN level >= 3 THEN 1 ELSE 0 END) a FROM players WHERE referrer = ?1').bind(id).first(),
    env.DB.prepare('SELECT * FROM admin_ops WHERE tg_id = ?1 ORDER BY id DESC LIMIT 4').bind(id).all(),
    env.DB.prepare("SELECT MAX(expires_at) e FROM purchases WHERE tg_id = ?1 AND item = 'sub_owner' AND refunded = 0").bind(id).first()
  ]);
  let expected = p.money; let wipe = false;
  for (const o of pend) { if (o.op === 'give') expected += o.amount; if (o.op === 'take') expected -= o.amount; if (o.op === 'set') expected = o.amount; if (o.op === 'wipe') wipe = true; }
  const lines = [
    `<b>${esc(p.first_name || 'Без имени')}</b>${p.username ? ' @' + esc(p.username) : ''} · <code>${p.tg_id}</code>${p.banned ? ' · <b>ЗАБАНЕН</b>' : ''}`,
    `Кофейня «${esc(p.cafe || '?')}», ${CITY[p.city] || p.city || '?'} · ур. ${p.level} · залов ${p.rooms}`,
    '',
    `Баланс: <b>${fmt(p.money)} ₽</b> (данные ${ago(p.last_seen)})`,
    pend.length ? `Ожидают применения: ${pend.map(o => OPN[o.op] + (o.amount != null && o.op !== 'msg' ? ' ' + fmt(o.amount) : '')).join(', ')}${wipe ? '' : ` → станет ${fmt(expected)} ₽`}` : '',
    `Заработано за всё время: ${fmt(p.earned)} ₽`,
    `Франшиз: ${p.franchises} · банкротств: ${p.bankrupt}`,
    '',
    `В игре с ${new Date(p.created_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} · заходов ${p.sessions} · всего ${Math.round(p.play_seconds / 60)} мин`,
    `Был в игре: ${ago(p.last_seen)}`,
    `Звёзды: ${pay.s} ★ (${pay.n} покупок)${sub && sub.e > Date.now() ? ' · подписка до ' + new Date(sub.e).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : ''}`,
    `Пригласил друзей: ${fr.n || 0} (активных ${fr.a || 0})${p.referrer ? ` · сам пришёл от <code>${p.referrer}</code>` : ''}`,
    `Напоминания: ${p.write_ok ? 'включены' : 'выключены'}`,
    ...(hist.results && hist.results.length ? ['', '<b>Последние действия админов</b>', ...hist.results.map(o => `${new Date(o.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ${OPN[o.op] || o.op}${o.amount != null && o.op !== 'msg' ? ' ' + fmt(o.amount) : ''}${o.applied_at ? '' : ' (ждёт)'}`)] : []),
    '',
    'Своя сумма: <code>/give ' + p.tg_id + ' 250к</code>, <code>/take ' + p.tg_id + ' 1млн</code>, <code>/set ' + p.tg_id + ' 0</code>',
    'Написать игроку: <code>/msg ' + p.tg_id + ' текст</code>'
  ].filter(x => x !== '');
  const id_ = p.tg_id;
  const kb = [
    [{ text: '+100 000', callback_data: `a:give:${id_}:100000` }, { text: '+1 000 000', callback_data: `a:give:${id_}:1000000` }, { text: '+10 000 000', callback_data: `a:give:${id_}:10000000` }],
    [{ text: '−100 000', callback_data: `a:take:${id_}:100000` }, { text: '−1 000 000', callback_data: `a:take:${id_}:1000000` }, { text: 'Обнулить', callback_data: `a:set:${id_}:0` }],
    [{ text: 'Подписка +30 дней', callback_data: `a:sub:${id_}:30` }, { text: p.banned ? 'Разбанить' : 'Забанить', callback_data: `a:ban:${id_}:${p.banned ? 0 : 1}` }],
    [{ text: 'Отменить ожидающие', callback_data: `a:cancel:${id_}:0` }, { text: 'Удалить аккаунт', callback_data: `a:del:${id_}:0` }],
    [{ text: 'Обновить', callback_data: `a:card:${id_}:0` }]
  ];
  return { text: lines.join('\n'), kb };
}

async function addOp(env, id, op, amount, text, by) {
  await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, op, amount ?? null, text ?? null, Date.now(), by).run();
}

function listText(title, rows) {
  if (!rows.length) return { text: title + '\n\nНикого не нашлось.', kb: [] };
  return {
    text: `<b>${title}</b>\n\n` + rows.map((p, i) => `${i + 1}. ${esc(p.first_name || '?')}${p.username ? ' @' + esc(p.username) : ''} — «${esc(p.cafe || '?')}», ур. ${p.level}, ${fmt(p.money)} ₽, ${ago(p.last_seen)}${p.banned ? ', бан' : ''}`).join('\n'),
    kb: rows.map((p, i) => [{ text: `${i + 1}. ${(p.first_name || '?').slice(0, 20)} · «${(p.cafe || '?').slice(0, 18)}»`, callback_data: `a:card:${p.tg_id}:0` }])
  };
}

const send = (env, chat, r) => tgApi(env, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: r.text, reply_markup: r.kb && r.kb.length ? { inline_keyboard: r.kb } : undefined, disable_web_page_preview: true });

// Текстовые команды админа. Возвращает true, если команда обработана.
export async function adminCommand(env, chat, from, text) {
  const [cmd, ...rest] = text.split(/\s+/);
  const c = cmd.toLowerCase().replace(/@\w+$/, '');
  if (!['/u', '/user', '/find', '/give', '/take', '/set', '/msg', '/ban', '/unban', '/top', '/last', '/online', '/ops'].includes(c)) return false;
  if (!ADMINS.includes(from)) { await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Эта команда только для администраторов.' }); return true; }
  if (c === '/top') { const r = (await env.DB.prepare('SELECT * FROM players ORDER BY earned DESC LIMIT 10').all()).results || []; await send(env, chat, listText('Топ-10 по заработку', r)); return true; }
  if (c === '/last') { const r = (await env.DB.prepare('SELECT * FROM players ORDER BY created_at DESC LIMIT 10').all()).results || []; await send(env, chat, listText('Последние 10 новых игроков', r)); return true; }
  if (c === '/online') { const r = (await env.DB.prepare('SELECT * FROM players WHERE last_seen >= ?1 ORDER BY last_seen DESC LIMIT 20').bind(Date.now() - 3 * 60000).all()).results || []; await send(env, chat, listText('Сейчас в игре', r)); return true; }
  if (c === '/ops') {
    const r = (await env.DB.prepare('SELECT o.*, p.first_name FROM admin_ops o LEFT JOIN players p ON p.tg_id = o.tg_id ORDER BY o.id DESC LIMIT 15').all()).results || [];
    await send(env, chat, { text: '<b>Последние действия админов</b>\n\n' + (r.length ? r.map(o => `${new Date(o.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(o.first_name || o.tg_id)} · ${OPN[o.op] || o.op}${o.amount != null && o.op !== 'msg' ? ' ' + fmt(o.amount) : ''}${o.applied_at ? '' : ' (ждёт)'} · админ ${o.by_admin}`).join('\n') : 'Пока пусто.') });
    return true;
  }
  if (c === '/u' || c === '/user' || c === '/find') {
    const q = rest.join(' ');
    if (!q) { await send(env, chat, { text: 'Напиши, кого искать: <code>/u 123456789</code>, <code>/u @username</code>, <code>/u Пенка</code> (имя или название кофейни).' }); return true; }
    const r = await findPlayers(env, q);
    if (r.length === 1) await send(env, chat, await userCard(env, r[0].tg_id)); else await send(env, chat, listText(`Поиск: ${esc(q)}`, r));
    return true;
  }
  const target = await findPlayers(env, rest[0]);
  if (target.length !== 1) { await send(env, chat, { text: target.length ? 'Нашлось несколько игроков, укажи ID.' : 'Игрок не найден. Формат: <code>' + c + ' ID сумма</code>' }); return true; }
  const id = target[0].tg_id;
  if (c === '/msg') {
    const msg = rest.slice(1).join(' ').trim();
    if (!msg) { await send(env, chat, { text: 'Формат: <code>/msg ID текст</code>' }); return true; }
    await addOp(env, id, 'msg', null, msg.slice(0, 500), from);
    const r = await tgApi(env, 'sendMessage', { chat_id: id, text: 'Сообщение от команды Brew Crew:\n\n' + msg.slice(0, 3500) });
    await send(env, chat, { text: (r.ok ? 'Отправлено в бота и покажется в игре.' : 'В бота не дошло (игрок не писал боту), но покажется в игре.') });
    return true;
  }
  if (c === '/ban' || c === '/unban') {
    await env.DB.prepare('UPDATE players SET banned = ?2 WHERE tg_id = ?1').bind(id, c === '/ban' ? 1 : 0).run();
    await send(env, chat, await userCard(env, id)); return true;
  }
  const amount = parseAmount(rest[1]);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e12) { await send(env, chat, { text: 'Не понял сумму. Примеры: 50000, 250к, 1.5млн' }); return true; }
  await addOp(env, id, c.slice(1), amount, null, from);
  await send(env, chat, await userCard(env, id));
  return true;
}

// Кнопки под карточкой игрока.
export async function adminCallback(env, cq) {
  const from = cq.from.id;
  const [, act, idS, valS] = String(cq.data || '').split(':');
  const id = Number(idS), val = Number(valS);
  const answer = text => tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: false });
  if (!ADMINS.includes(from)) { await answer('Только для администраторов'); return; }
  const chat = cq.message.chat.id, mid = cq.message.message_id;
  const edit = r => tgApi(env, 'editMessageText', { chat_id: chat, message_id: mid, parse_mode: 'HTML', text: r.text, reply_markup: { inline_keyboard: r.kb || [] }, disable_web_page_preview: true });
  if (act === 'list') {
    const sql = { online: ['SELECT * FROM players WHERE last_seen >= ?1 ORDER BY last_seen DESC LIMIT 20', 'Сейчас в игре', Date.now() - 3 * 60000], top: ['SELECT * FROM players ORDER BY earned DESC LIMIT 10', 'Топ-10 по заработку'], last: ['SELECT * FROM players ORDER BY created_at DESC LIMIT 10', 'Последние 10 новых игроков'] }[idS];
    if (!sql) { await answer(''); return; }
    const st = env.DB.prepare(sql[0]); const r = (await (sql[2] ? st.bind(sql[2]) : st).all()).results || [];
    await send(env, chat, listText(sql[1], r)); await answer(''); return;
  }
  if (act === 'card') { await send(env, chat, await userCard(env, id)); await answer(''); return; }
  if (act === 'give' || act === 'take' || act === 'set') { await addOp(env, id, act, val, null, from); await answer(`${OPN[act]}: ${fmt(val)} ₽. Применится, когда игрок будет в игре`); await edit(await userCard(env, id)); return; }
  if (act === 'sub') {
    const cur = await env.DB.prepare("SELECT MAX(expires_at) e FROM purchases WHERE tg_id = ?1 AND item = 'sub_owner' AND refunded = 0").bind(id).first();
    const base = Math.max(Date.now(), (cur && cur.e) || 0);
    await env.DB.prepare('INSERT INTO purchases (charge_id, tg_id, item, stars, created_at, expires_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)').bind('admin_' + Date.now() + '_' + id, id, 'sub_owner', Date.now(), base + val * 86400000).run();
    await addOp(env, id, 'ent', null, null, from);
    await answer('Подписка продлена на ' + val + ' дней'); await edit(await userCard(env, id)); return;
  }
  if (act === 'ban') { await env.DB.prepare('UPDATE players SET banned = ?2 WHERE tg_id = ?1').bind(id, val ? 1 : 0).run(); await answer(val ? 'Забанен' : 'Разбанен'); await edit(await userCard(env, id)); return; }
  if (act === 'cancel') { const r = await env.DB.prepare('DELETE FROM admin_ops WHERE tg_id = ?1 AND applied_at IS NULL').bind(id).run(); await answer('Отменено: ' + (r.meta && r.meta.changes || 0)); await edit(await userCard(env, id)); return; }
  if (act === 'del') {
    await answer('');
    await tgApi(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: mid, reply_markup: { inline_keyboard: [[{ text: 'Да, удалить навсегда', callback_data: `a:del2:${id}:0` }], [{ text: 'Нет, оставить', callback_data: `a:back:${id}:0` }]] } });
    return;
  }
  if (act === 'back') { await answer(''); await edit(await userCard(env, id)); return; }
  if (act === 'del2') {
    await env.DB.prepare('DELETE FROM admin_ops WHERE tg_id = ?1 AND applied_at IS NULL').bind(id).run();
    await addOp(env, id, 'wipe', null, null, from);
    await env.DB.batch([
      env.DB.prepare('UPDATE players SET money = 0, earned = 0, level = 1, rooms = 1, cafe = NULL WHERE tg_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM reminders WHERE tg_id = ?1').bind(id)
    ]);
    await answer('Аккаунт удаляется');
    await tgApi(env, 'editMessageText', { chat_id: chat, message_id: mid, text: `Аккаунт ${id} удалён. Сохранение сотрётся на устройстве игрока при следующем входе, после этого запись исчезнет из базы. Покупки за звёзды остаются в истории.` });
  }
}

// Игра забирает команды при отметке онлайн.
export async function opsFor(env, id) {
  return (await env.DB.prepare('SELECT id, op, amount, text FROM admin_ops WHERE tg_id = ?1 AND applied_at IS NULL ORDER BY id LIMIT 20').bind(id).all()).results || [];
}
export async function ackOps(env, id, ids) {
  ids = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite).slice(0, 20);
  if (!ids.length) return;
  const ph = ids.map((_, i) => '?' + (i + 2)).join(',');
  const wiped = await env.DB.prepare(`SELECT COUNT(*) n FROM admin_ops WHERE tg_id = ?1 AND op = 'wipe' AND applied_at IS NULL AND id IN (${ph})`).bind(id, ...ids).first();
  await env.DB.prepare(`UPDATE admin_ops SET applied_at = ${Date.now()} WHERE tg_id = ?1 AND applied_at IS NULL AND id IN (${ph})`).bind(id, ...ids).run();
  if (wiped && wiped.n) await env.DB.batch([
    env.DB.prepare('DELETE FROM players WHERE tg_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM days WHERE tg_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM reminders WHERE tg_id = ?1').bind(id)
  ]);
}
