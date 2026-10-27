// Админка в боте: одна панель-сообщение с кнопками, которое редактируется на месте.
// Состояние игры хранится на устройстве игрока, поэтому изменения ставятся в очередь (admin_ops)
// и применяются игрой при следующем выходе на связь.
import { ADMINS, tgApi, mskDay, SHOP } from './_lib.js';
import { post as channelPost, tourWeek } from './_channel.js';

const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CITY = { msk: 'Москва', spb: 'Петербург', kzn: 'Казань', sochi: 'Сочи', nsk: 'Новосибирск', kgd: 'Калининград' };
const ago = ts => { if (!ts) return 'никогда'; const m = Math.round((Date.now() - ts) / 60000); if (m < 2) return 'только что'; if (m < 60) return m + ' мин назад'; const h = Math.round(m / 60); if (h < 48) return h + ' ч назад'; return Math.round(h / 24) + ' дн назад'; };
const short = ts => { if (!ts) return '—'; const m = Math.round((Date.now() - ts) / 60000); if (m < 3) return 'в игре'; if (m < 60) return m + ' мин'; const h = Math.round(m / 60); if (h < 48) return h + ' ч'; return Math.round(h / 24) + ' дн'; };
const when = ts => new Date(ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const OPN = { give: 'Начислено', take: 'Списано', set: 'Баланс', wipe: 'Удаление', ent: 'Покупки обновлены', msg: 'Сообщение', fpraise: 'Похвала от друга', fgift: 'Чаевые от друга', fprank: 'Таракан от друга', rename: 'Переименование', staff: 'Легенда в команду' };
const STYLES = [['int_soviet', 'Столовая №1'], ['int_loft', 'Заводской лофт'], ['int_scandi', 'Фика'], ['int_neon', 'Не спим']];
const COVERS = [['updates.jpg', 'Обновления'], ['events.jpg', 'События'], ['banner.jpg', 'Баннер'], ['hall.jpg', 'Новый зал']];
const PAGE = 10;
const ONLINE_MS = 3 * 60000;
const B = (text, data) => ({ text, callback_data: data });
const HOME = [B('Главное', 'p:home')];

export function parseAmount(s) {
  if (!s) return NaN;
  let t = String(s).toLowerCase().replace(/\s|_/g, '').replace(',', '.');
  let mul = 1;
  if (/(млн|m|kk)$/.test(t)) { mul = 1e6; t = t.replace(/(млн|m|kk)$/, ''); }
  else if (/(к|k|тыс)$/.test(t)) { mul = 1e3; t = t.replace(/(к|k|тыс)$/, ''); }
  const n = Number(t) * mul;
  return Number.isFinite(n) ? Math.round(n) : NaN;
}
async function addOp(env, id, op, amount, text, by) {
  await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, op, amount ?? null, text ?? null, Date.now(), by).run();
}
async function findPlayers(env, q) {
  q = String(q || '').trim().replace(/^@/, '');
  if (!q) return [];
  if (/^\d{3,15}$/.test(q)) { const r = await env.DB.prepare('SELECT * FROM players WHERE tg_id = ?1').bind(Number(q)).first(); if (r) return [r]; }
  // lower() в SQLite не понимает кириллицу, поэтому фильтруем в коде
  const ql = q.toLowerCase();
  const all = (await env.DB.prepare('SELECT tg_id, username, first_name, cafe FROM players ORDER BY last_seen DESC LIMIT 5000').all()).results || [];
  const ids = all.filter(p => [p.username, p.first_name, p.cafe].some(v => v && String(v).toLowerCase().includes(ql))).slice(0, 10).map(p => p.tg_id);
  if (!ids.length) return [];
  return (await env.DB.prepare(`SELECT * FROM players WHERE tg_id IN (${ids.join(',')}) ORDER BY last_seen DESC`).all()).results || [];
}
const playerBtn = p => B(`${(p.first_name || '?').slice(0, 16)} · «${(p.cafe || '?').slice(0, 16)}» · ур. ${p.level} · ${short(p.last_seen)}${p.banned ? ' · бан' : ''}`, 'p:u:' + p.tg_id);

/* ---------- состояние ожидания ввода ---------- */
async function getState(env, id) { return await env.DB.prepare('SELECT * FROM admin_state WHERE tg_id = ?1').bind(id).first(); }
async function setState(env, id, mode, data, chat, msg) { await env.DB.prepare('INSERT OR REPLACE INTO admin_state (tg_id, mode, data, chat, msg_id, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(id, mode, data ? JSON.stringify(data) : null, chat, msg, Date.now()).run(); }
async function clearState(env, id) { await env.DB.prepare('UPDATE admin_state SET mode = NULL, data = NULL WHERE tg_id = ?1').bind(id).run(); }
const ask = (title, hint, back) => ({ text: `<b>${title}</b>\n\n${hint}\n\n<i>Жду сообщение. Можно нажать «Отмена».</i>`, kb: [[B('Отмена', back || 'p:home')]] });

/* ---------- экраны ---------- */
async function vHome(env) {
  const now = Date.now(), today = Date.parse(mskDay(now) + 'T00:00:00+03:00');
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
  const [total, online, newT, actT, pay, top] = await Promise.all([
    q('SELECT COUNT(*) n FROM players'), q('SELECT COUNT(*) n FROM players WHERE last_seen >= ?1', now - ONLINE_MS),
    q('SELECT COUNT(*) n FROM players WHERE created_at >= ?1', today), q('SELECT COUNT(*) n FROM players WHERE last_seen >= ?1', today),
    q('SELECT COALESCE(SUM(CASE WHEN created_at >= ?1 THEN stars ELSE 0 END),0) t, COALESCE(SUM(CASE WHEN created_at >= ?2 THEN stars ELSE 0 END),0) w, COALESCE(SUM(stars),0) a FROM purchases WHERE refunded = 0 AND stars > 0', today, now - 7 * 86400000),
    env.DB.prepare('SELECT cafe, first_name, level, earned FROM players ORDER BY earned DESC LIMIT 5').all()
  ]);
  const lines = ['<b>Brew Crew · админка</b>', '',
    `Сейчас в игре: <b>${online.n}</b>`, `Заходили сегодня: <b>${actT.n}</b> · новых: <b>${newT.n}</b>`, `Всего игроков: <b>${total.n}</b>`, '',
    `Звёзды: сегодня <b>${pay.t}</b> · за неделю <b>${pay.w}</b> · всего <b>${pay.a}</b>`, '',
    '<b>Топ-5 кофеен</b>', ...((top.results || []).map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}» — ${esc(t.first_name || '')}, ур. ${t.level}, ${fmt(t.earned)} ₽`))];
  return { text: lines.join('\n'), kb: [
    [B('Все игроки', 'p:pl:last:0'), B('Найти игрока', 'p:find')],
    [B('Сейчас в игре', 'p:pl:on:0'), B('Новые', 'p:pl:new:0')],
    [B('Рассылка всем', 'p:all'), B('Канал', 'p:ch')],
    [B('Турнир', 'p:tour'), B('Покупки', 'p:buy')],
    [B('Журнал', 'p:log'), B('Обновить', 'p:home')]
  ] };
}
const SORTS = { last: ['По последнему входу', 'ORDER BY last_seen DESC'], new: ['Новые', 'ORDER BY created_at DESC'], rich: ['По заработку', 'ORDER BY earned DESC'], lvl: ['По уровню', 'ORDER BY level DESC, earned DESC'], on: ['Сейчас в игре', 'ORDER BY last_seen DESC'] };
async function vPlayers(env, sort, page) {
  const s = SORTS[sort] ? sort : 'last'; page = Math.max(0, page | 0);
  const where = s === 'on' ? 'WHERE last_seen >= ' + (Date.now() - ONLINE_MS) : '';
  const total = (await env.DB.prepare(`SELECT COUNT(*) n FROM players ${where}`).first()).n;
  const rows = (await env.DB.prepare(`SELECT * FROM players ${where} ${SORTS[s][1]} LIMIT ${PAGE} OFFSET ${page * PAGE}`).all()).results || [];
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const kb = rows.map(p => [playerBtn(p)]);
  const nav = []; if (page > 0) nav.push(B('‹ Назад', `p:pl:${s}:${page - 1}`)); nav.push(B(`${page + 1} из ${pages}`, `p:pl:${s}:${page}`)); if (page < pages - 1) nav.push(B('Дальше ›', `p:pl:${s}:${page + 1}`));
  kb.push(nav);
  kb.push(Object.keys(SORTS).filter(k => k !== s && k !== 'on').slice(0, 3).map(k => B(SORTS[k][0], `p:pl:${k}:0`)));
  kb.push([B('Найти игрока', 'p:find'), ...HOME]);
  return { text: `<b>${SORTS[s][0]}</b> · ${s === 'on' ? 'в игре' : 'всего'}: ${total}${rows.length ? '' : '\n\nНикого.'}\n\nНажми на игрока, чтобы открыть карточку.`, kb };
}
async function vCard(env, id, note) {
  const p = await env.DB.prepare('SELECT * FROM players WHERE tg_id = ?1').bind(id).first();
  if (!p) return { text: `Игрок <code>${id}</code> не найден. Возможно, аккаунт удалён.`, kb: [[B('‹ К списку', 'p:pl:last:0'), ...HOME]] };
  const [pend, pay, fr, sub, ints] = await Promise.all([
    env.DB.prepare('SELECT op, amount FROM admin_ops WHERE tg_id = ?1 AND applied_at IS NULL ORDER BY id').bind(id).all(),
    env.DB.prepare('SELECT COALESCE(SUM(stars),0) s, COUNT(*) n FROM purchases WHERE tg_id = ?1 AND refunded = 0 AND stars > 0').bind(id).first(),
    env.DB.prepare('SELECT COUNT(*) n FROM players WHERE referrer = ?1').bind(id).first(),
    env.DB.prepare("SELECT MAX(expires_at) e FROM purchases WHERE tg_id = ?1 AND item = 'sub_owner' AND refunded = 0").bind(id).first(),
    env.DB.prepare("SELECT item FROM purchases WHERE tg_id = ?1 AND item LIKE 'int_%' AND refunded = 0").bind(id).all()
  ]);
  const pd = pend.results || []; let expected = p.money;
  for (const o of pd) { if (o.op === 'give') expected += o.amount; if (o.op === 'take') expected -= o.amount; if (o.op === 'set') expected = o.amount; }
  const owned = (ints.results || []).map(r => r.item); const styles = STYLES.filter(s => owned.includes(s[0])).map(s => s[1]);
  const lines = [
    note ? `<i>${esc(note)}</i>\n` : '',
    `<b>${esc(p.first_name || 'Без имени')}</b>${p.username ? ' @' + esc(p.username) : ''}${p.banned ? ' · <b>ЗАБАНЕН</b>' : ''}`,
    `ID <code>${p.tg_id}</code>`, '',
    '<b>Кофейня</b>', `«${esc(p.cafe || '?')}», ${CITY[p.city] || p.city || '?'} · уровень ${p.level} · залов ${p.rooms}`,
    `Баланс <b>${fmt(p.money)} ₽</b>${pd.some(o => ['give', 'take', 'set'].includes(o.op)) ? ` → станет ${fmt(expected)} ₽` : ''}`,
    `Заработано всего ${fmt(p.earned)} ₽ · франшиз ${p.franchises} · банкротств ${p.bankrupt}`, '',
    '<b>Активность</b>', `Был в игре: ${ago(p.last_seen)} · заходов ${p.sessions} · ${Math.round(p.play_seconds / 60)} мин всего`,
    `С нами с ${new Date(p.created_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} · друзей привёл ${fr.n || 0}`, '',
    '<b>Покупки</b>', `${pay.s} звёзд (${pay.n})${sub && sub.e > Date.now() ? ' · «Владелец» до ' + new Date(sub.e).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : ''}${styles.length ? ' · стили: ' + styles.join(', ') : ''}`,
    pd.length ? `\nЖдут применения: ${pd.length}. Применятся при входе игрока.` : ''
  ].filter(x => x !== '');
  return { text: lines.join('\n'), kb: [
    [B('Деньги', 'p:um:' + id), B('Написать', 'p:umsg:' + id)],
    [B('Стили и подписка', 'p:ust:' + id), B('Легенда в команду', 'p:uleg:' + id)],
    [B('Переименовать', 'p:uren:' + id), B('История', 'p:uh:' + id)],
    [B(p.banned ? 'Разбанить' : 'Забанить', 'p:uban:' + id), B('Удалить аккаунт', 'p:udel:' + id)],
    ...(pd.length ? [[B('Отменить ожидающие (' + pd.length + ')', 'p:ucan:' + id)]] : []),
    [B('‹ Все игроки', 'p:pl:last:0'), B('Обновить', 'p:u:' + id), ...HOME]
  ] };
}
const vMoney = id => ({ text: '<b>Деньги игрока</b>\n\nКнопки сразу ставят операцию в очередь. «Своя сумма» — пришли число: 50000, 250к, 1.5млн.', kb: [
  [B('+100 тыс', `p:mg:${id}:100000`), B('+1 млн', `p:mg:${id}:1000000`), B('+10 млн', `p:mg:${id}:10000000`)],
  [B('−100 тыс', `p:mt:${id}:100000`), B('−1 млн', `p:mt:${id}:1000000`), B('Обнулить', `p:mz:${id}`)],
  [B('Начислить свою', `p:mc:${id}:give`), B('Списать свою', `p:mc:${id}:take`), B('Поставить ровно', `p:mc:${id}:set`)],
  [B('‹ Карточка', 'p:u:' + id), ...HOME]] });
async function vStyles(env, id) {
  const owned = ((await env.DB.prepare("SELECT item FROM purchases WHERE tg_id = ?1 AND item LIKE 'int_%' AND refunded = 0").bind(id).all()).results || []).map(r => r.item);
  return { text: '<b>Стили и подписка</b>\n\nВыданное появится у игрока при входе. Стиль включается в Настройках игры.', kb: [
    ...STYLES.map(([k, n]) => [B(owned.includes(k) ? n + ' · уже есть' : 'Выдать «' + n + '»', owned.includes(k) ? 'p:ust:' + id : `p:gi:${id}:${k}`)]),
    [B('Подписка «Владелец» +30 дней', `p:gs:${id}`)],
    [B('‹ Карточка', 'p:u:' + id), ...HOME]] };
}
async function vHistory(env, id) {
  const r = (await env.DB.prepare('SELECT * FROM admin_ops WHERE tg_id = ?1 ORDER BY id DESC LIMIT 15').bind(id).all()).results || [];
  return { text: '<b>История операций</b>\n\n' + (r.length ? r.map(o => `${when(o.created_at)} · ${OPN[o.op] || o.op}${o.amount != null && o.op !== 'msg' ? ' ' + fmt(o.amount) : ''}${o.text && o.op !== 'msg' ? ' · ' + esc(o.text).slice(0, 40) : ''}${o.applied_at ? '' : ' · ждёт'}`).join('\n') : 'Пусто.'), kb: [[B('‹ Карточка', 'p:u:' + id), ...HOME]] };
}
async function vChannel(env) {
  if (!env.CHANNEL_ID) return { text: 'Канал не подключён: нет CHANNEL_ID в настройках Cloudflare.', kb: [HOME] };
  const r = (await env.DB.prepare("SELECT key, at, msg_id, caption FROM posts WHERE key != 'record' AND msg_id IS NOT NULL ORDER BY at DESC LIMIT 10").all()).results || [];
  return { text: '<b>Канал</b>\n\nПосты бота, которые можно править или удалять. Старые посты без номера здесь не показываются.', kb: [
    ...r.map(p => [B(`${when(p.at)} · ${String(p.caption || p.key).replace(/<[^>]+>/g, '').slice(0, 34)}`, 'p:po:' + p.key.slice(0, 50))]),
    [B('Новый пост', 'p:pn')], [...HOME]] };
}
async function vPost(env, key) {
  const p = await env.DB.prepare('SELECT * FROM posts WHERE key = ?1').bind(key).first();
  if (!p) return { text: 'Пост не найден.', kb: [[B('‹ Канал', 'p:ch'), ...HOME]] };
  return { text: `<b>Пост от ${when(p.at)}</b>\n\n${p.caption || '(без текста)'}`, kb: [[B('Изменить текст', 'p:pe:' + key.slice(0, 50)), B('Удалить', 'p:pd:' + key.slice(0, 50))], [B('‹ Канал', 'p:ch'), ...HOME]] };
}
async function vTour(env) {
  const w = tourWeek(), prev = tourWeek(Date.now() - 7 * 86400000);
  const cur = (await env.DB.prepare('SELECT * FROM tour WHERE week = ?1 ORDER BY profit DESC LIMIT 10').bind(w).all()).results || [];
  const pr = (await env.DB.prepare('SELECT * FROM tour WHERE week = ?1 ORDER BY profit DESC LIMIT 3').bind(prev).all()).results || [];
  return { text: [`<b>Турнир района · неделя с ${w}</b>`, '', ...(cur.length ? cur.map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}» — ${esc(t.first_name || '')}, ${fmt(t.profit)} ₽`) : ['Пока пусто.']), '', '<b>Прошлая неделя</b>', ...(pr.length ? pr.map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}» — ${fmt(t.profit)} ₽`) : ['Пусто.'])].join('\n'), kb: [[B('Обновить', 'p:tour'), ...HOME]] };
}
async function vBuys(env) {
  const r = (await env.DB.prepare('SELECT b.*, p.first_name, p.cafe FROM purchases b LEFT JOIN players p ON p.tg_id = b.tg_id ORDER BY b.created_at DESC LIMIT 15').all()).results || [];
  return { text: '<b>Покупки</b>\n\n' + (r.length ? r.map(b => `${when(b.created_at)} · ${esc(b.first_name || b.tg_id)} · ${esc((SHOP[b.item] || {}).title || b.item)} · ${b.stars ? b.stars + ' звёзд' : 'выдал админ'}${b.refunded ? ' · возврат' : ''}`).join('\n') : 'Пока ничего.'), kb: [[B('Обновить', 'p:buy'), ...HOME]] };
}
async function vLog(env) {
  const r = (await env.DB.prepare('SELECT o.op, o.amount, o.text, o.created_at, MIN(o.applied_at) applied_at, COUNT(*) n, MAX(p.first_name) first_name, MAX(o.tg_id) tg_id FROM admin_ops o LEFT JOIN players p ON p.tg_id = o.tg_id WHERE o.by_admin != 0 GROUP BY o.created_at, o.op, o.text, o.amount ORDER BY o.created_at DESC LIMIT 15').all()).results || [];
  return { text: '<b>Журнал админов</b>\n\n' + (r.length ? r.map(o => `${when(o.created_at)} · ${o.n > 1 ? 'Рассылка всем (' + o.n + ')' : esc(o.first_name || o.tg_id)} · ${OPN[o.op] || o.op}${o.amount != null && o.op !== 'msg' ? ' ' + fmt(o.amount) : ''}${o.op === 'msg' ? ': ' + esc(o.text || '').slice(0, 30) : ''}${o.applied_at ? '' : ' · ждёт'}`).join('\n') : 'Пусто.'), kb: [[B('Обновить', 'p:log'), ...HOME]] };
}
const confirm = (title, yes, no) => ({ text: `<b>${title}</b>\n\nТочно?`, kb: [[B('Да', yes), B('Нет', no)]] });

/* ---------- рассылка ---------- */
async function broadcast(env, msg, by) {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) SELECT tg_id, 'msg', NULL, ?1, ?2, ?3 FROM players WHERE COALESCE(banned,0) = 0").bind(msg.slice(0, 500), now, by).run();
  const off = (await env.DB.prepare('SELECT tg_id FROM players WHERE COALESCE(banned,0) = 0 AND (last_seen IS NULL OR last_seen < ?1) ORDER BY last_seen DESC LIMIT 600').bind(now - ONLINE_MS).all()).results || [];
  const onl = await env.DB.prepare('SELECT COUNT(*) n FROM players WHERE COALESCE(banned,0) = 0 AND last_seen >= ?1').bind(now - ONLINE_MS).first();
  let ok = 0, bad = 0; const t0 = Date.now();
  for (const p of off) {
    if (Date.now() - t0 > 22000) break;
    const r = await tgApi(env, 'sendMessage', { chat_id: p.tg_id, text: 'Сообщение от команды Brew Crew:\n\n' + msg.slice(0, 3500) });
    if (r && r.ok) ok++; else bad++;
    await new Promise(res => setTimeout(res, 40));
  }
  const left = off.length - ok - bad;
  return `<b>Рассылка отправлена</b>\n\nВ игре сейчас: ${onl ? onl.n : 0}, увидят сразу.\nВ бота дошло: ${ok}. Не дошло: ${bad} (не писали боту или заблокировали).${left > 0 ? `\nНе успел в бота: ${left}, увидят в игре при входе.` : ''}`;
}

/* ---------- вход: команда /admin ---------- */
let ORIGIN = 'https://brewcrew.pages.dev';
export async function adminCommand(env, chat, from, text, origin) {
  if (origin) ORIGIN = origin;
  const c = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');
  if (c !== '/admin') return false;
  if (!ADMINS.includes(from)) { await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Эта команда только для администраторов.' }); return true; }
  await clearState(env, from);
  const v = await vHome(env);
  const r = await tgApi(env, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: v.text, reply_markup: { inline_keyboard: v.kb }, disable_web_page_preview: true });
  if (r && r.ok) await setState(env, from, null, null, chat, r.result.message_id);
  return true;
}

/* ---------- вход: текст от админа, когда панель ждёт ввод ---------- */
export async function adminInput(env, chat, from, msgId, text) {
  if (!ADMINS.includes(from)) return false;
  const st = await getState(env, from);
  if (!st || !st.mode) return false;
  const data = st.data ? JSON.parse(st.data) : {};
  const show = async v => { await tgApi(env, 'deleteMessage', { chat_id: chat, message_id: msgId }); if (st.msg_id) { const r = await tgApi(env, 'editMessageText', { chat_id: st.chat, message_id: st.msg_id, parse_mode: 'HTML', text: v.text, reply_markup: { inline_keyboard: v.kb || [] }, disable_web_page_preview: true }); if (r && r.ok) return; } const r2 = await tgApi(env, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: v.text, reply_markup: { inline_keyboard: v.kb || [] } }); if (r2 && r2.ok) await setState(env, from, null, null, chat, r2.result.message_id); };
  const done = async v => { await clearState(env, from); await show(v); };
  const m = st.mode;
  if (m === 'find') { const r = await findPlayers(env, text); if (r.length === 1) { await done(await vCard(env, r[0].tg_id)); return true; } { await done({ text: r.length ? `<b>Нашлось: ${r.length}</b>\n\nВыбери игрока.` : 'Никого не нашлось. Попробуй ID, @ник, имя или название кофейни.', kb: [...r.map(p => [playerBtn(p)]), [B('Искать ещё', 'p:find'), ...HOME]] }); return true; } }
  if (m === 'amt') { const a = parseAmount(text); if (!Number.isFinite(a) || a < 0 || a > 1e12) { await show({ text: 'Не понял сумму. Примеры: 50000, 250к, 1.5млн', kb: [[B('Отмена', 'p:u:' + data.id)]] }); return true; } await addOp(env, data.id, data.op, a, null, from); { await done(await vCard(env, data.id, `${OPN[data.op]}: ${fmt(a)} ₽. Применится при входе игрока`)); return true; } }
  if (m === 'msg') { await addOp(env, data.id, 'msg', null, text.slice(0, 500), from); const r = await tgApi(env, 'sendMessage', { chat_id: data.id, text: 'Сообщение от команды Brew Crew:\n\n' + text.slice(0, 3500) }); { await done(await vCard(env, data.id, r && r.ok ? 'Сообщение ушло в бота и покажется в игре' : 'В бота не дошло, но покажется в игре')); return true; } }
  if (m === 'ren') { const nn = text.trim().slice(0, 28); if (nn.length < 2) { await show({ text: 'Слишком коротко. Пришли новое название ещё раз.', kb: [[B('Отмена', 'p:u:' + data.id)]] }); return true; } await addOp(env, data.id, 'rename', null, nn, from); await env.DB.prepare('UPDATE players SET cafe = ?2 WHERE tg_id = ?1').bind(data.id, nn).run(); { await done(await vCard(env, data.id, 'Название поменяется в игре при входе')); return true; } }
  if (m === 'all') {
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM players WHERE COALESCE(banned,0) = 0').first();
    await setState(env, from, 'allok', { text: text.slice(0, 3500) }, st.chat, st.msg_id);
    await show({ text: `<b>Превью рассылки</b>\n\n${esc(text.slice(0, 3500))}\n\n<i>Получат ${n.n} игроков.</i>`, kb: [[B('Отправить', 'p:allgo'), B('Изменить текст', 'p:all')], [B('Отмена', 'p:home')]] }); return true;
  }
  if (m === 'pedit') { const p = await env.DB.prepare('SELECT msg_id FROM posts WHERE key = ?1').bind(data.key).first(); const r = p && p.msg_id ? await tgApi(env, 'editMessageCaption', { chat_id: env.CHANNEL_ID, message_id: p.msg_id, caption: text, parse_mode: 'HTML' }) : null; if (r && r.ok) await env.DB.prepare('UPDATE posts SET caption = ?2 WHERE key = ?1').bind(data.key, text).run(); await clearState(env, from); const v = await vPost(env, data.key); v.text = (r && r.ok ? '<i>Пост исправлен</i>\n\n' : '<i>Не получилось: ' + esc((r && r.description) || 'пост не найден') + '</i>\n\n') + v.text; await show(v); return true; }
  if (m === 'pnew') {
    await setState(env, from, 'pnewok', { img: data.img, text: text.slice(0, 1000) }, st.chat, st.msg_id);
    await show({ text: `<b>Превью поста</b> · обложка ${esc((COVERS.find(c => c[0] === data.img) || [0, ''])[1])}\n\n${text.slice(0, 1000)}`, kb: [[B('Опубликовать', 'p:pngo'), B('Изменить текст', 'p:pc:' + data.img)], [B('Отмена', 'p:ch')]] }); return true;
  }
  return false;
}

/* ---------- кнопки панели ---------- */
export async function adminCallback(env, cq) {
  const from = cq.from.id;
  const answer = (text, alert) => tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: text || '', show_alert: !!alert });
  if (!ADMINS.includes(from)) { await answer('Только для администраторов'); return; }
  const chat = cq.message.chat.id, mid = cq.message.message_id;
  const parts = String(cq.data || '').split(':'); const act = parts[1];
  const edit = v => tgApi(env, 'editMessageText', { chat_id: chat, message_id: mid, parse_mode: 'HTML', text: v.text, reply_markup: { inline_keyboard: v.kb || [] }, disable_web_page_preview: true });
  const wait = async (mode, data, v) => { await setState(env, from, mode, data, chat, mid); await edit(v); await answer(''); };
  if (parts[0] !== 'p') { await answer('Старая кнопка. Открой /admin'); return; }
  const id = Number(parts[2]);
  // любое нажатие сбрасывает ожидание ввода, кроме подтверждений
  if (!['allgo', 'pngo'].includes(act)) await setState(env, from, null, null, chat, mid);
  switch (act) {
    case 'home': await edit(await vHome(env)); return answer('');
    case 'pl': await edit(await vPlayers(env, parts[2], Number(parts[3]))); return answer('');
    case 'find': return wait('find', null, ask('Найти игрока', 'Пришли ID, @ник, имя или название кофейни.'));
    case 'u': await edit(await vCard(env, id)); return answer('');
    case 'um': await edit(vMoney(id)); return answer('');
    case 'mg': case 'mt': { const op = act === 'mg' ? 'give' : 'take'; await addOp(env, id, op, Number(parts[3]), null, from); await edit(await vCard(env, id, `${OPN[op]}: ${fmt(parts[3])} ₽`)); return answer('Готово'); }
    case 'mz': await edit(confirm('Обнулить баланс игрока', 'p:mz2:' + id, 'p:um:' + id)); return answer('');
    case 'mz2': await addOp(env, id, 'set', 0, null, from); await edit(await vCard(env, id, 'Баланс будет обнулён')); return answer('Готово');
    case 'mc': { const op = parts[3]; const t = { give: 'Начислить свою сумму', take: 'Списать свою сумму', set: 'Поставить баланс ровно' }[op]; return wait('amt', { id, op }, ask(t, 'Пришли сумму: 50000, 250к, 1.5млн.', 'p:u:' + id)); }
    case 'umsg': return wait('msg', { id }, ask('Сообщение игроку', 'Пришли текст. Он придёт в бота и покажется в игре.', 'p:u:' + id));
    case 'uren': return wait('ren', { id }, ask('Переименовать кофейню', 'Пришли новое название, до 28 символов.', 'p:u:' + id));
    case 'uh': await edit(await vHistory(env, id)); return answer('');
    case 'ust': await edit(await vStyles(env, id)); return answer('');
    case 'gi': { const k = parts[3]; if (!STYLES.some(s => s[0] === k)) return answer('Нет такого стиля'); await env.DB.prepare('INSERT OR IGNORE INTO purchases (charge_id, tg_id, item, stars, created_at, expires_at) VALUES (?1, ?2, ?3, 0, ?4, NULL)').bind('admin_' + k + '_' + id, id, k, Date.now()).run(); await addOp(env, id, 'ent', null, null, from); await edit(await vStyles(env, id)); return answer('Стиль выдан'); }
    case 'gs': { const cur = await env.DB.prepare("SELECT MAX(expires_at) e FROM purchases WHERE tg_id = ?1 AND item = 'sub_owner' AND refunded = 0").bind(id).first(); const base = Math.max(Date.now(), (cur && cur.e) || 0); await env.DB.prepare('INSERT INTO purchases (charge_id, tg_id, item, stars, created_at, expires_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)').bind('admin_' + Date.now() + '_' + id, id, 'sub_owner', Date.now(), base + 30 * 86400000).run(); await addOp(env, id, 'ent', null, null, from); await edit(await vCard(env, id, 'Подписка продлена на 30 дней')); return answer('Готово'); }
    case 'uleg': await edit(confirm('Отправить легенду 20 уровня в команду', 'p:uleg2:' + id, 'p:u:' + id)); return answer('');
    case 'uleg2': await addOp(env, id, 'staff', 20, 'Подарок от администрации.', from); await edit(await vCard(env, id, 'Легенда выйдет на смену при входе игрока')); return answer('Готово');
    case 'uban': { const p = await env.DB.prepare('SELECT banned FROM players WHERE tg_id = ?1').bind(id).first(); await edit(confirm(p && p.banned ? 'Разбанить игрока' : 'Забанить игрока', 'p:uban2:' + id, 'p:u:' + id)); return answer(''); }
    case 'uban2': { const p = await env.DB.prepare('SELECT banned FROM players WHERE tg_id = ?1').bind(id).first(); const nb = p && p.banned ? 0 : 1; await env.DB.prepare('UPDATE players SET banned = ?2 WHERE tg_id = ?1').bind(id, nb).run(); await edit(await vCard(env, id, nb ? 'Забанен' : 'Разбанен')); return answer('Готово'); }
    case 'ucan': { const r = await env.DB.prepare('DELETE FROM admin_ops WHERE tg_id = ?1 AND applied_at IS NULL').bind(id).run(); await edit(await vCard(env, id, 'Отменено операций: ' + ((r.meta && r.meta.changes) || 0))); return answer('Готово'); }
    case 'udel': await edit(confirm('Удалить аккаунт навсегда. Сохранение сотрётся на устройстве при следующем входе', 'p:udel2:' + id, 'p:u:' + id)); return answer('');
    case 'udel2':
      await env.DB.prepare('DELETE FROM admin_ops WHERE tg_id = ?1 AND applied_at IS NULL').bind(id).run();
      await addOp(env, id, 'wipe', null, null, from);
      await env.DB.batch([env.DB.prepare('UPDATE players SET money = 0, earned = 0, level = 1, rooms = 1, cafe = NULL WHERE tg_id = ?1').bind(id), env.DB.prepare('DELETE FROM reminders WHERE tg_id = ?1').bind(id)]);
      await edit({ text: `Аккаунт <code>${id}</code> удаляется. Запись исчезнет, когда игрок зайдёт в игру.`, kb: [[B('‹ Все игроки', 'p:pl:last:0'), ...HOME]] }); return answer('Готово');
    case 'all': return wait('all', null, ask('Рассылка всем', 'Пришли текст. Кто в игре — увидит сразу. Остальным придёт в бота и покажется при входе. Перед отправкой будет превью.'));
    case 'allgo': { const st = await getState(env, from); const d = st && st.data ? JSON.parse(st.data) : null; if (!st || st.mode !== 'allok' || !d) { await edit(await vHome(env)); return answer('Превью устарело'); } await clearState(env, from); await answer('Отправляю…'); await edit({ text: 'Отправляю рассылку…', kb: [] }); await edit({ text: await broadcast(env, d.text, from), kb: [HOME] }); return; }
    case 'ch': await edit(await vChannel(env)); return answer('');
    case 'po': await edit(await vPost(env, parts.slice(2).join(':'))); return answer('');
    case 'pe': { const key = parts.slice(2).join(':'); return wait('pedit', { key }, ask('Изменить текст поста', 'Пришли новый текст целиком. Можно с переносами строк и HTML-тегами &lt;b&gt;.', 'p:po:' + key)); }
    case 'pd': { const key = parts.slice(2).join(':'); await edit(confirm('Удалить пост из канала', 'p:pd2:' + key, 'p:po:' + key)); return answer(''); }
    case 'pd2': { const key = parts.slice(2).join(':'); const p = await env.DB.prepare('SELECT msg_id FROM posts WHERE key = ?1').bind(key).first(); const r = p && p.msg_id ? await tgApi(env, 'deleteMessage', { chat_id: env.CHANNEL_ID, message_id: p.msg_id }) : null; await env.DB.prepare('UPDATE posts SET msg_id = NULL, caption = NULL WHERE key = ?1').bind(key).run(); await edit(await vChannel(env)); return answer(r && r.ok ? 'Удалён' : 'В канале уже нет'); }
    case 'pn': await edit({ text: '<b>Новый пост</b>\n\nВыбери обложку.', kb: [...COVERS.map(([f, n]) => [B(n, 'p:pc:' + f)]), [B('‹ Канал', 'p:ch')]] }); return answer('');
    case 'pc': { const img = parts[2]; return wait('pnew', { img }, ask('Текст поста', 'Пришли текст. Можно с переносами строк и &lt;b&gt;жирным&lt;/b&gt;. Перед публикацией будет превью.', 'p:ch')); }
    case 'pngo': {
      const st = await getState(env, from); const d = st && st.data ? JSON.parse(st.data) : null;
      if (!st || st.mode !== 'pnewok' || !d) { await edit(await vChannel(env)); return answer('Превью устарело'); }
      await clearState(env, from);
      const ok = await channelPost(env, ORIGIN, d.img, d.text);
      // post() запоминает номер сообщения в LASTPOST через mark(), здесь пишем вручную
      await env.DB.prepare('INSERT INTO posts (key, at, ok, msg_id, caption) VALUES (?1, ?2, ?3, ?4, ?5)').bind('manual_' + Date.now(), Date.now(), ok ? 1 : 0, ok && ok.id ? ok.id : null, d.text).run();
      const v = await vChannel(env); v.text = (ok ? '<i>Опубликовано</i>\n\n' : '<i>Не получилось опубликовать</i>\n\n') + v.text; await edit(v); return answer(ok ? 'Опубликовано' : 'Ошибка');
    }
    case 'tour': await edit(await vTour(env)); return answer('');
    case 'buy': await edit(await vBuys(env)); return answer('');
    case 'log': await edit(await vLog(env)); return answer('');
  }
  await answer('');
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
