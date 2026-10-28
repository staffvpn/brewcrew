// Промокоды: создание в админке, проверка подписки на канал, отзыв награды при отписке.
import { tgApi } from './_lib.js';

const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const B = (text, data) => ({ text, callback_data: data });
const HOME = [B('Главное', 'p:home')];
const DAY = 86400000;
export const PROMO_KINDS = {
  money: { n: 'Деньги', ask: 'Сколько рублей? Например: 250к, 1млн' },
  days: { n: 'Дни выручки', ask: 'Сколько дней выручки игрока (1–20)? Не меньше 300 000 ₽ за день' },
  legend: { n: 'Легенда в команду', ask: 'Уровень легенды (5–50)' },
  boost: { n: 'Буст гостей', ask: 'На сколько процентов больше гостей (5–100)' },
  xp: { n: 'Опыт', ask: 'Сколько опыта (100–100000)' },
  style: { n: 'Стиль зала на время', ask: '' }
};
const STYLES = [['int_soviet', 'Столовая №1'], ['int_loft', 'Заводской лофт'], ['int_scandi', 'Фика'], ['int_neon', 'Не спим']];
const date = ts => ts ? new Date(ts).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'без срока';

export function normCode(s) { return String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-ZА-ЯЁ0-9_-]/g, '').slice(0, 24); }
export function genCode() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'; const p = n => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join(''); return p(5) + '-' + p(5); }
export function rewardText(p) {
  const k = PROMO_KINDS[p.kind] ? PROMO_KINDS[p.kind].n : p.kind;
  if (p.kind === 'money') return k + ': ' + fmt(p.amount) + ' ₽';
  if (p.kind === 'days') return k + ': ' + p.amount;
  if (p.kind === 'legend') return k + ' ' + p.amount + ' уровня';
  if (p.kind === 'boost') return k + ' +' + p.amount + '%';
  if (p.kind === 'xp') return k + ' +' + p.amount;
  if (p.kind === 'style') return k + ': ' + ((STYLES.find(s => s[0] === p.style) || [])[1] || p.style);
  return k;
}

// подписка на канал
export async function isSubscribed(env, uid) {
  if (!env.CHANNEL_ID) return true;
  const r = await tgApi(env, 'getChatMember', { chat_id: env.CHANNEL_ID, user_id: uid });
  if (!r || !r.ok) return null; // не смогли проверить — не наказываем
  const s = r.result && r.result.status;
  return s === 'creator' || s === 'administrator' || s === 'member' || (s === 'restricted' && r.result.is_member);
}

// ввод кода игроком
export async function redeem(env, user, raw) {
  const code = normCode(raw), now = Date.now();
  const tries = await env.DB.prepare('SELECT COUNT(*) n FROM promo_tries WHERE tg_id = ?1 AND at > ?2').bind(user.id, now - 3600000).first();
  if (tries && tries.n >= 5) return { ok: false, error: 'Слишком много неверных попыток. Попробуй через час' };
  const fail = async msg => { await env.DB.prepare('INSERT INTO promo_tries (tg_id, at) VALUES (?1, ?2)').bind(user.id, now).run(); return { ok: false, error: msg }; };
  if (code.length < 3) return fail('Код слишком короткий');
  const p = await env.DB.prepare('SELECT * FROM promos WHERE code = ?1').bind(code).first();
  if (!p || !p.active) return fail('Такого промокода нет. Проверь буквы и цифры');
  if (p.until && now > p.until) return { ok: false, error: 'Срок промокода закончился. Следи за каналом: будут новые' };
  if (p.max_uses && p.uses >= p.max_uses) return { ok: false, error: 'Промокод уже разобрали. Успей в следующий раз' };
  const pl = await env.DB.prepare('SELECT level, promo_ban FROM players WHERE tg_id = ?1').bind(user.id).first();
  if (!pl) return { ok: false, error: 'Сначала открой кофейню' };
  if ((pl.level || 1) < 3) return { ok: false, error: 'Промокоды работают с 3 уровня кофейни' };
  const used = await env.DB.prepare('SELECT 1 FROM promo_uses WHERE code = ?1 AND tg_id = ?2').bind(code, user.id).first();
  if (used) return { ok: false, error: 'Ты уже вводил этот код' };
  if (pl.promo_ban && p.created_at <= pl.promo_ban) return { ok: false, error: 'После отписки от канала старые коды не работают. Подпишись снова и дождись нового кода' };
  const sub = await isSubscribed(env, user.id);
  if (sub === false) return { ok: false, error: 'Промокод работает только для подписчиков канала. Подпишись и введи код ещё раз', channel: env.CHANNEL_URL || null };
  const ends = p.dur_days ? now + p.dur_days * DAY : null;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO promo_uses (code, tg_id, at, ends_at, revoked) VALUES (?1, ?2, ?3, ?4, 0)').bind(code, user.id, now, ends),
    env.DB.prepare('UPDATE promos SET uses = uses + 1 WHERE code = ?1').bind(code),
    env.DB.prepare('UPDATE players SET sub_checked = ?2 WHERE tg_id = ?1').bind(user.id, now)
  ]);
  return { ok: true, code, reward: { kind: p.kind, amount: p.amount, legend: p.legend || null, style: p.style || null, ends_at: ends } };
}

// раз в 6 часов: если отписался — отзываем действующие награды
export async function promoWatch(env, uid) {
  const now = Date.now();
  const pl = await env.DB.prepare('SELECT sub_checked FROM players WHERE tg_id = ?1').bind(uid).first();
  if (!pl || (pl.sub_checked && now - pl.sub_checked < 6 * 3600000)) return;
  await env.DB.prepare('UPDATE players SET sub_checked = ?2 WHERE tg_id = ?1').bind(uid, now).run();
  const act = (await env.DB.prepare('SELECT code FROM promo_uses WHERE tg_id = ?1 AND revoked = 0 AND ends_at > ?2').bind(uid, now).all()).results || [];
  if (!act.length) return;
  const sub = await isSubscribed(env, uid);
  if (sub !== false) return;
  const ops = act.map(a => env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, 'promorevoke', NULL, ?2, ?3, 0)").bind(uid, a.code, now));
  await env.DB.batch([
    env.DB.prepare('UPDATE promo_uses SET revoked = 1 WHERE tg_id = ?1 AND revoked = 0 AND ends_at > ?2').bind(uid, now),
    env.DB.prepare('UPDATE players SET promo_ban = ?2 WHERE tg_id = ?1').bind(uid, now),
    ...ops
  ]);
  try { await tgApi(env, 'sendMessage', { chat_id: uid, text: 'Ты отписался от канала Brew Crew, и инвестор отозвал вложения по промокоду. Подпишись снова — и следующий код снова сработает.' }); } catch {}
}

/* ---------- админка ---------- */
async function draft(env, admin, v) {
  const key = 'prdraft_' + admin;
  if (v === undefined) { const r = await env.DB.prepare('SELECT val FROM cache WHERE key = ?1').bind(key).first(); return r ? JSON.parse(r.val) : {}; }
  await env.DB.prepare('INSERT INTO cache (key, val, at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET val = ?2, at = ?3').bind(key, JSON.stringify(v), Date.now()).run();
}
export async function vPromos(env) {
  const rows = (await env.DB.prepare('SELECT * FROM promos ORDER BY created_at DESC LIMIT 12').all()).results || [];
  const now = Date.now();
  const lines = ['<b>Промокоды</b>', '', 'Коды работают только у подписчиков канала. Отписался — награда отзывается, деньги забираются (касса не уходит в минус), старые коды больше не работают.', ''];
  if (!rows.length) lines.push('Пока ни одного.');
  rows.forEach(p => lines.push(`<code>${esc(p.code)}</code> · ${esc(rewardText(p))} · ${p.uses}${p.max_uses ? '/' + p.max_uses : ''} · ${!p.active ? 'выключен' : p.until && p.until < now ? 'истёк' : 'до ' + date(p.until)}`));
  const kb = rows.slice(0, 8).map(p => [B(p.code + ' · ' + p.uses, 'p:pro:' + p.code)]);
  kb.push([B('Создать промокод', 'p:prn')], HOME);
  return { text: lines.join('\n'), kb };
}
export async function vPromo(env, code, note) {
  const p = await env.DB.prepare('SELECT * FROM promos WHERE code = ?1').bind(code).first();
  if (!p) return { text: 'Промокод не найден.', kb: [[B('‹ Промокоды', 'p:prl')], HOME] };
  const rv = await env.DB.prepare('SELECT COUNT(*) n FROM promo_uses WHERE code = ?1 AND revoked = 1').bind(code).first();
  return { text: [note ? `<i>${esc(note)}</i>\n` : '', `<b>Промокод</b> <code>${esc(p.code)}</code>`, '', `Награда: ${esc(rewardText(p))}`, `Легенда в отчёте: ${esc(p.legend || 'случайная')}`, `Ввести можно до: ${date(p.until)}`, `Действует после ввода: ${p.dur_days} дн.`, `Активаций: ${p.uses}${p.max_uses ? ' из ' + p.max_uses : ''} · отозвано за отписку: ${rv.n}`, `Статус: ${p.active ? 'включён' : 'выключен'}`].filter(x => x !== '').join('\n'),
    kb: [[B(p.active ? 'Выключить' : 'Включить', 'p:prt:' + code), B('Пост в канал', 'p:prp:' + code)], [B('Удалить', 'p:prx:' + code)], [B('‹ Промокоды', 'p:prl'), ...HOME]] };
}
function vKinds(code) { return { text: `<b>Новый промокод</b> <code>${esc(code)}</code>\n\nЧто он даёт?`, kb: [[B('Деньги', 'p:prk:money'), B('Дни выручки', 'p:prk:days')], [B('Легенду', 'p:prk:legend'), B('Буст гостей', 'p:prk:boost')], [B('Опыт', 'p:prk:xp'), B('Стиль зала', 'p:prk:style')], [B('Отмена', 'p:prl')]] }; }
function vUntil(d) { return { text: `<b>${esc(d.code)}</b> · ${esc(rewardText(d))}\n\nДо какого числа код можно ввести?`, kb: [[B('1 день', 'p:pru:1'), B('3 дня', 'p:pru:3'), B('7 дней', 'p:pru:7')], [B('14 дней', 'p:pru:14'), B('30 дней', 'p:pru:30'), B('Без срока', 'p:pru:0')], [B('Отмена', 'p:prl')]] }; }
function vDur(d) { return { text: `<b>${esc(d.code)}</b> · ${esc(rewardText(d))}\n\nСколько дней награда действует после ввода? Если игрок отпишется в этот срок — награду заберём.`, kb: [[B('1', 'p:prd:1'), B('3', 'p:prd:3'), B('7', 'p:prd:7')], [B('14', 'p:prd:14'), B('30', 'p:prd:30')], [B('Отмена', 'p:prl')]] }; }
function vMax(d) { return { text: `<b>${esc(d.code)}</b>\n\nСколько активаций всего?`, kb: [[B('10', 'p:prm:10'), B('50', 'p:prm:50'), B('100', 'p:prm:100')], [B('500', 'p:prm:500'), B('Без лимита', 'p:prm:0')], [B('Отмена', 'p:prl')]] }; }
function vLeg(d) { return { text: `<b>${esc(d.code)}</b>\n\nКак деньги появятся в отчёте игрока? Пришли свою легенду (например: «Отправили шейхи») или выбери.`, kb: [[B('Грант районной администрации', 'p:prl1:0')], [B('Инвестиция под условие', 'p:prl1:1')], [B('Случайная', 'p:prl1:r')], [B('Отмена', 'p:prl')]] }; }
const LEGS = ['Грант районной администрации', 'Инвестиция под условие: пока ты с нами'];
function vConfirm(d) { return { text: [`<b>Проверь промокод</b>`, '', `Код: <code>${esc(d.code)}</code>`, `Награда: ${esc(rewardText(d))}`, `Ввести до: ${d.until ? date(Date.now() + d.until * DAY) : 'без срока'}`, `Действует: ${d.dur} дн.`, `Активаций: ${d.max || 'без лимита'}`, `Легенда: ${esc(d.legend || 'случайная')}`].join('\n'), kb: [[B('Создать', 'p:prok')], [B('Отмена', 'p:prl')]] }; }

export async function promoCallback(env, act, parts, from, edit, wait, ask, answer) {
  const d = await draft(env, from);
  if (act === 'prl') { await edit(await vPromos(env)); return answer(''); }
  if (act === 'pro') { await edit(await vPromo(env, parts[2])); return answer(''); }
  if (act === 'prn') return wait('prcode', null, { text: '<b>Новый промокод</b>\n\nПришли слово для кода (буквы, цифры, дефис) или нажми «Сгенерировать».', kb: [[B('Сгенерировать', 'p:prg')], [B('Отмена', 'p:prl')]] });
  if (act === 'prg') { const code = genCode(); await draft(env, from, { code }); await edit(vKinds(code)); return answer(''); }
  if (act === 'prk') { const kind = parts[2]; await draft(env, from, Object.assign(d, { kind })); if (kind === 'style') { await edit({ text: 'Какой стиль открыть на время?', kb: [...STYLES.map(s => [B(s[1], 'p:prs:' + s[0])]), [B('Отмена', 'p:prl')]] }); return answer(''); } return wait('pramt', null, ask('Новый промокод', PROMO_KINDS[kind].ask, 'p:prl')); }
  if (act === 'prs') { await draft(env, from, Object.assign(d, { style: parts[2], amount: 0 })); await edit(vUntil(d)); return answer(''); }
  if (act === 'pru') { d.until = Number(parts[2]) || 0; await draft(env, from, d); await edit(vDur(d)); return answer(''); }
  if (act === 'prd') { d.dur = Number(parts[2]) || 7; await draft(env, from, d); await edit(vMax(d)); return answer(''); }
  if (act === 'prm') { d.max = Number(parts[2]) || 0; await draft(env, from, d); if (d.kind === 'money' || d.kind === 'days') return wait('prleg', null, vLeg(d)); await edit(vConfirm(d)); return answer(''); }
  if (act === 'prl1') { d.legend = parts[2] === 'r' ? null : LEGS[Number(parts[2])] || null; await draft(env, from, d); await edit(vConfirm(d)); return answer(''); }
  if (act === 'prok') {
    if (!d.code || !d.kind) { await edit(await vPromos(env)); return answer('Черновик потерян'); }
    const ex = await env.DB.prepare('SELECT 1 FROM promos WHERE code = ?1').bind(d.code).first();
    if (ex) { await edit({ text: 'Такой код уже есть. Придумай другой.', kb: [[B('Заново', 'p:prn')], HOME] }); return answer(''); }
    const now = Date.now();
    await env.DB.prepare('INSERT INTO promos (code, kind, amount, style, legend, until, dur_days, max_uses, uses, active, created_at, by_admin) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, 1, ?9, ?10)')
      .bind(d.code, d.kind, d.amount || 0, d.style || null, d.legend || null, d.until ? now + d.until * DAY : null, d.dur || 7, d.max || 0, now, from).run();
    await draft(env, from, {});
    await edit(await vPromo(env, d.code, 'Промокод создан. Можно сразу опубликовать в канал')); return answer('Готово');
  }
  if (act === 'prt') { await env.DB.prepare('UPDATE promos SET active = 1 - active WHERE code = ?1').bind(parts[2]).run(); await edit(await vPromo(env, parts[2])); return answer(''); }
  if (act === 'prx') { await edit({ text: `Удалить промокод <code>${esc(parts[2])}</code>? Уже выданные награды останутся.`, kb: [[B('Да, удалить', 'p:prx2:' + parts[2])], [B('Нет', 'p:pro:' + parts[2])]] }); return answer(''); }
  if (act === 'prx2') { await env.DB.prepare('DELETE FROM promos WHERE code = ?1').bind(parts[2]).run(); await edit(await vPromos(env)); return answer('Удалён'); }
  return null;
}
export async function promoInput(env, mode, text, from, show, done) {
  const d = await draft(env, from);
  if (mode === 'prcode') { const code = normCode(text); if (code.length < 3) { await show({ text: 'Нужно хотя бы 3 символа: буквы, цифры, дефис.', kb: [[B('Сгенерировать', 'p:prg')], [B('Отмена', 'p:prl')]] }); return true; } await draft(env, from, { code }); await done(vKinds(code)); return true; }
  if (mode === 'pramt') {
    const raw = String(text).toLowerCase().replace(/\s/g, '').replace(',', '.'); let n = Number(raw.replace(/(млн|m|kk)$/, '').replace(/(к|k|тыс)$/, '')) * (/(млн|m|kk)$/.test(raw) ? 1e6 : /(к|k|тыс)$/.test(raw) ? 1e3 : 1);
    const lim = { money: [1000, 1e10], days: [1, 20], legend: [5, 50], boost: [5, 100], xp: [100, 100000] }[d.kind] || [1, 1e10];
    if (!Number.isFinite(n) || n < lim[0] || n > lim[1]) { await show({ text: `Нужно число от ${fmt(lim[0])} до ${fmt(lim[1])}.`, kb: [[B('Отмена', 'p:prl')]] }); return true; }
    d.amount = Math.round(n); await draft(env, from, d); await done(vUntil(d)); return true;
  }
  if (mode === 'prleg') { d.legend = String(text).slice(0, 80); await draft(env, from, d); await done(vConfirm(d)); return true; }
  return false;
}
export function promoPostText(p) {
  const until = p.until ? 'Ввести до ' + date(p.until) + '.' : '';
  return [`<b>Промокод для подписчиков</b>`, '', `<code>${esc(p.code)}</code>`, '', `Что даёт: ${esc(rewardText(p))}.`, `Где ввести: Настройки → Промокод.`, ...(until ? [until] : []), `Работает, пока ты подписан на канал.${p.max_uses ? ' Активаций: ' + p.max_uses + '.' : ''}`].join('\n');
}
