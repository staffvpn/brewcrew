// Канал игры: бот сам публикует запуск, обновления, праздничные события и цель района.
// Вызывается фоном из /api/track и вебхука. Ничего не делает, пока не задан CHANNEL_ID.
import { tgApi, getBot, mskDay, ADMINS, sezId, SEZ_NAMES } from './_lib.js';
import { GOAL, goalInfo } from './_goal.js';

export const UNPOST = [];
export const VERSION = "9.1";
export const VERSION_TITLE = "магазин, подарки и кредит";
export const VERSION_IMG = "updates.jpg";
export const VERSION_TAIL = "Нашли что-то кривое — пишите в поддержку, поправим.";
export const VERSION_SHORT = "Магазин как все меню, подарки друзьям, кредит в банке, ставки в дуэлях выше и ноябрьский сюжет.";
export const CHANGELOG = [
  "Магазин стал как все меню, и в нём снова все товары",
  "Рамку, пропуск, стиль зала или деньги можно подарить любой кофейне",
  "В Кассе появился банк: деньги сразу, вернуть втрое через 7 игровых дней. Не вернёте — придут коллекторы",
  "Дуэли: ставки до 10 млн. Кто не ответил на вызов за сутки — струсил",
  "Биржа подсказывает, за сколько уходят похожие сотрудники",
  "Ноябрьский сюжет, ещё три истории и новые реплики гостей и команды"
];

const fmt = n => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CITY = { msk: 'Москва', spb: 'Петербург', kzn: 'Казань', sochi: 'Сочи', nsk: 'Новосибирск', kgd: 'Калининград' };

export function tourWeek(ts) { const d = new Date((ts || Date.now()) + 3 * 3600000); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); }
function holiday(ts) {
  const d = new Date((ts || Date.now()) + 3 * 3600000); const m = d.getUTCMonth() + 1, day = d.getUTCDate();
  if ((m === 10 && day >= 24) || (m === 11 && day <= 2)) return { id: 'halloween', n: 'Хэллоуин', t: 'В меню тыквенный раф, в дверях дети в костюмах привидений, а в подсобке кто-то воет. Возможно, кофемолка.' };
  if ((m === 12 && day >= 20) || (m === 1 && day <= 10)) return { id: 'newyear', n: 'Новый год', t: 'Пряничный раф, гирлянды, корпоративы и Дед Мороз, который уже с утра не в форме.' };
  if (m === 2 && day >= 10 && day <= 15) return { id: 'valentine', n: 'День влюблённых', t: 'Латте «Любовь», свидания вслепую за перепутанными столиками и предложения руки у кассы.' };
  if (m === 3 && day >= 5 && day <= 9) return { id: 'march8', n: '8 марта', t: 'Лавандовый раф и тюльпаны по 120 рублей. Решай, сколько купить.' };
  if ((m === 8 && day >= 29) || (m === 9 && day <= 3)) return { id: 'sept1', n: '1 сентября', t: 'Какао для первоклашек, родители с букетами и толпа после линейки.' };
  if (m >= 6 && m <= 8) return { id: 'summer', n: 'Лето', t: 'Эспрессо-тоник, жара и очередь на веранду.' };
  return null;
}

async function posted(env, key) { return await env.DB.prepare('SELECT key, at, ok, info, msg_id FROM posts WHERE key = ?1').bind(key).first(); }
let LASTPOST = null;
async function mark(env, key, ok, info) { const lp = key === 'record' ? null : LASTPOST; await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info, msg_id, caption) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(key, Date.now(), ok ? 1 : 0, info ?? null, lp ? lp.id : null, lp ? lp.caption : null).run(); if (key !== 'record') LASTPOST = null; }

export async function post(env, origin, img, html, remember = true) {
  if (html.replace(/<[^>]+>/g, '').length > 1020) html = html.slice(0, 1000).replace(/\n[^\n]*$/, '');
  const bot = await getBot(env);
  const url = bot ? `https://t.me/${bot.username}${env.APP_SHORT ? '/' + env.APP_SHORT : ''}?${env.APP_SHORT ? 'startapp' : 'start'}=channel` : origin;
  const r = await tgApi(env, 'sendPhoto', { chat_id: env.CHANNEL_ID, photo: `${origin}/img/${img}`, caption: html, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', url }]] } });
  if(remember) LASTPOST = r && r.ok ? { id: r.result.message_id, caption: html } : null;
  return r && r.ok ? { id: r.result.message_id } : false;
}

export async function channelTick(env, origin) {
  try{if(new URL(origin).origin!==new URL(env.APP_URL||'https://brewcrew.pages.dev').origin)return;}catch{return;}
  if (!env.CHANNEL_ID || !env.DB || !env.BOT_TOKEN) return;
  try {
    // не чаще одного поста в 3 минуты, чтобы не спамить
    const last = await env.DB.prepare('SELECT MAX(at) at FROM posts').first();
    if (last && last.at && Date.now() - last.at < 3 * 60000) return;

    if (!(await posted(env, 'launch'))) {
      const ok = await post(env, origin, 'banner.jpg', ['<b>Brew Crew открыта</b>', '', 'Кофейня в Telegram, где всё на грани. Снимаешь пустое помещение, ставишь кофемашину, нанимаешь бариста, который завтра проспит, и разбираешься с проверками, гусями и бабушкой с купоном 2011 года.', '', '18+. Бесплатно. Работает, даже когда ты спишь.'].join('\n'));
      await mark(env, 'launch', ok); return;
    }
    // снятые посты: удаляем из канала один раз
    for (const k of UNPOST) { const p = await posted(env, k); if (p && p.msg_id) { await tgApi(env, 'deleteMessage', { chat_id: env.CHANNEL_ID, message_id: p.msg_id }); await env.DB.prepare('UPDATE posts SET msg_id = NULL, ok = 0, info = ?2 WHERE key = ?1').bind(k, 'deleted').run(); } }
    const vp=await posted(env,'ver_'+VERSION);
    if(!vp || (!vp.ok && vp.info==='failed')){await publishVersion(env,origin);return;}
    const h = holiday();
    if (h) {
      const hkey = 'hol_' + h.id + '_' + new Date().getUTCFullYear();
      if (!(await posted(env, hkey))) {
        const ok = await post(env, origin, 'events.jpg', [`<b>Событие: ${h.n}</b>`, '', esc(h.t), '', 'Сезонная позиция уже в меню, особые гости уже в пути.'].join('\n'));
        await mark(env, hkey, ok); return;
      }
    }
    // итоги сезона: в начале нового месяца
    const curS = sezId(); const prevS = sezId(Date.parse(curS + '-01T00:00:00+03:00') - 3600000);
    if (prevS !== curS) { const skey = 'season_' + prevS;
      if (!(await posted(env, skey))) {
        const top = (await env.DB.prepare(`SELECT * FROM season WHERE season = ?1 AND sp > 0 AND tg_id NOT IN (${ADMINS.join(',')}) ORDER BY sp DESC LIMIT 5`).bind(prevS).all()).results || [];
        if (!top.length) { await mark(env, skey, true, 'empty'); return; }
        const nm = SEZ_NAMES[prevS] || prevS;
        for (let i = 0; i < Math.min(3, top.length); i++) {
          await env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, 'badge', NULL, ?2, ?3, 0)").bind(top[i].tg_id, `Кофейня сезона «${nm}»: ${i + 1} место`, Date.now()).run();
          await env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, 'staff', ?2, ?3, ?4, 0)").bind(top[i].tg_id, [25, 20, 16][i], `Приз за ${i + 1} место в сезоне «${nm}».`, Date.now()).run();
        }
        const ok = true; // итоги сезона без поста в канал: значки и легенды приходят в игру
        await mark(env, skey, ok); return; } }
    // Елизавета из «кофеРУинер»: пост и рассылка в момент запуска
    if (await lizaTick(env, origin)) return;
    // особый гость недели: анонс в четверг, рассылка в пятницу, итоги в субботу
    if (await bossTick(env, origin)) return;
    // голосование в канале раз в неделю: что случится у всех
    if (await pollTick(env, origin)) return;
    // рассылка игрокам о новой версии: коротко и со ссылкой на пост
    if (await bcastVersion(env, origin)) return;
    // сводка дня: три самые крупные дуэли, только если ставки большие
    if (await duelDigest(env, origin)) return;
    // цель района: посты на рубежах и итог
    await goalTick(env, origin);
  } catch (e) { /* канал не должен ломать игру */ }
}

export async function publishVersion(env,origin){
  const key='ver_'+VERSION,now=Date.now();
  let claim=await env.DB.prepare("INSERT OR IGNORE INTO posts(key,at,ok,info) VALUES(?1,?2,0,'sending')").bind(key,now).run();
  if(!claim.meta?.changes){
    claim=await env.DB.prepare("UPDATE posts SET at=?2,info='sending' WHERE key=?1 AND ok=0 AND info='failed' AND at<?3").bind(key,now,now-3*60000).run();
    if(!claim.meta?.changes)return null;
  }
  const caption=versionCaption();
  // A network error leaves the claim in 'sending': check the channel before retrying.
  const sent=await post(env,origin,VERSION_IMG,caption,false);
  if(sent)await env.DB.prepare("UPDATE posts SET ok=1,info='published',msg_id=?2,caption=?3 WHERE key=?1").bind(key,sent.id,caption).run();
  else await env.DB.prepare("UPDATE posts SET info='failed' WHERE key=?1").bind(key).run();
  return sent;
}

// Correct the existing announcement when its player-facing wording changes.
export function versionCaption(){
 return [`<b>Обновление ${VERSION}: ${VERSION_TITLE}</b>`,'',...CHANGELOG.map(s=>'— '+esc(s)),'',VERSION_TAIL].join('\n');
}
export async function syncVersionCaption(env,origin){
 if(new URL(origin).origin!==new URL(env.APP_URL||'https://brewcrew.pages.dev').origin)return false;
 if(!env.DB||!env.BOT_TOKEN||!env.CHANNEL_ID)return false;
 const key='ver_'+VERSION,caption=versionCaption();
 const p=await env.DB.prepare('SELECT ok,msg_id,caption FROM posts WHERE key=?1').bind(key).first();
 if(!p?.ok||!p.msg_id||p.caption===caption)return false;
 const r=await tgApi(env,'editMessageCaption',{chat_id:env.CHANNEL_ID,message_id:p.msg_id,caption,parse_mode:'HTML'});
 // Repeating a successful edit after a lost response is safe.
 if(!r?.ok&&!/message is not modified/i.test(r?.description||''))return false;
 await env.DB.prepare('UPDATE posts SET caption=?2 WHERE key=?1 AND msg_id=?3 AND ok=1').bind(key,caption,p.msg_id).run();
 return true;
}

export function postUrl(env, msgId) { const base = String(env.CHANNEL_URL || '').replace(/\/+$/, ''); return base && msgId && /t\.me\/[A-Za-z0-9_]+$/.test(base) ? base + '/' + msgId : (base || null); }
export async function versionInfo(env) {
  let url = env.CHANNEL_URL || null;
  try { const p = await env.DB.prepare('SELECT msg_id FROM posts WHERE key = ?1').bind('ver_' + VERSION).first(); if (p && p.msg_id) url = postUrl(env, p.msg_id); } catch {}
  return { v: VERSION, title: VERSION_TITLE ? VERSION_TITLE[0].toUpperCase() + VERSION_TITLE.slice(1) : 'Обновление', text: VERSION_SHORT, url };
}
// раз в тик — до 25 сообщений в бот
async function bcastVersion(env, origin) {
  if (VERSION === '9.0' || VERSION === '9.1' || VERSION.split('.').length > 2) return false; // 9.1 — только пост в канале
  const key = 'bc_' + VERSION; const st = await posted(env, key);
  if (st && st.info === 'done') return false;
  const vp = await posted(env, 'ver_' + VERSION); if (!vp || !vp.ok) return false;
  const after = st ? Number(st.info) || 0 : 0;
  const rows = (await env.DB.prepare('SELECT tg_id FROM players WHERE tg_id > ?1 AND COALESCE(banned,0) = 0 ORDER BY tg_id LIMIT 25').bind(after).all()).results || [];
  if (!rows.length) { await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info) VALUES (?1, ?2, 1, ?3)').bind(key, Date.now() - 3 * 60000, 'done').run(); return false; }
  const vi = await versionInfo(env); const bot = await getBot(env);
  const app = bot ? `https://t.me/${bot.username}${env.APP_SHORT ? '/' + env.APP_SHORT : ''}?${env.APP_SHORT ? 'startapp' : 'start'}=upd` : origin;
  const kb = [[{ text: 'Открыть кофейню', url: app }]]; if (vi.url) kb.unshift([{ text: 'Подробнее в канале', url: vi.url }]);
  for (const r of rows) { try { await tgApi(env, 'sendMessage', { chat_id: r.tg_id, text: `<b>Обновление ${VERSION}: ${esc(VERSION_TITLE)}</b>\n\n${esc(VERSION_SHORT)}`, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } }); } catch {} }
  // время ставим в прошлое, чтобы рассылка не задерживала другие посты
  await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info) VALUES (?1, ?2, 1, ?3)').bind(key, Date.now() - 3 * 60000, String(rows[rows.length - 1].tg_id)).run();
  return false;
}
async function goalTick(env, origin) {
  const g = await goalInfo(env, false);
  for (const m of GOAL.ms) {
    const k = 'goal_ms_' + m; if (g.total < m || (await posted(env, k))) continue;
    const left = Math.max(0, Math.ceil((GOAL.until - Date.now()) / 86400000));
    const bonus = { 250000: 'Всем — сутки гостей на 15% больше.', 500000: 'Всем — подарок поставщиков 150 000 ₽ в инвентарь.', 750000: 'Всем — двое суток гостей на 20% больше.' }[m];
    const ok = await post(env, origin, 'events.jpg', [`<b>Район продал ${fmt(m)} стаканов</b>`, '', `До миллиона ${fmt(GOAL.target - g.total)}, осталось ${left} дн. ${bonus}`, '', 'Зовите друзей: каждый живой стакан считается.'].join('\n'));
    await mark(env, k, ok); return;
  }
  const done = g.total >= GOAL.target, over = Date.now() >= GOAL.until;
  if (!(done || over)) return;
  const fk = 'goal_final_' + GOAL.id; if (await posted(env, fk)) return;
  const top = (await env.DB.prepare(`SELECT tg_id, cafe, first_name, goal_cups FROM players WHERE goal_cups > 0 AND tg_id NOT IN (${ADMINS.join(',')}) ORDER BY goal_cups DESC LIMIT 3`).all()).results || [];
  if (done) for (let i = 0; i < top.length; i++) {
    await env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, 'staff', 25, ?2, ?3, 0)").bind(top[i].tg_id, `Приз за ${i + 1} место по вкладу в миллион стаканов.`, Date.now()).run();
  }
  const lines = done
    ? ['<b>Миллион стаканов. Район сделал это</b>', '', 'Все, кто продал от 2 000 стаканов, получают Золотой миллионный стакан, три дня прибыли и трое суток +25% гостей. Значок «Миллионник» — всем участникам.', '', ...top.map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}» — ${fmt(t.goal_cups)} стаканов · легенда 25 уровня`)]
    : ['<b>Миллион не взят</b>', '', `Район продал ${fmt(g.total)} стаканов. Не хватило ${fmt(GOAL.target - g.total)}.`, '', 'Треснувший стакан на стойке — памятник тому, как близко это было. В следующий раз зовите друзей раньше.'];
  const ok = await post(env, origin, 'events.jpg', lines.join('\n'));
  await mark(env, fk, ok);
}

// решение канала: раз в неделю опрос, победитель случается у всех на следующий день
export const WORLD_OPTS = { goose: 'Гусь в каждой кофейне', water: 'Отключат горячую воду', blogger: 'Блогер-миллионник идёт по району', heat: 'Аномальная жара', inspect: 'Санэпид обходит всех', strike: 'Курьеры бастуют', pens: 'День пенсионера: кофе по 50 рублей' };
async function pollTick(env, origin) {
  const wk = tourWeek(); const pk = 'poll_' + wk; const p = await posted(env, pk);
  const d = new Date(Date.now() + 3 * 3600000); const dow = d.getUTCDay(), hr = d.getUTCHours();
  if (!p) {
    if (dow !== 6 || hr < 12) return false; // суббота, после полудня по Москве
    const ids = Object.keys(WORLD_OPTS).sort(() => Math.random() - 0.5).slice(0, 4);
    const r = await tgApi(env, 'sendPoll', { chat_id: env.CHANNEL_ID, question: 'Что завтра случится во всех кофейнях игры? Победитель произойдёт у каждого', options: ids.map(id => ({ text: WORLD_OPTS[id] })), is_anonymous: true });
    await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info, msg_id, caption) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(pk, Date.now(), r && r.ok ? 1 : 0, JSON.stringify(ids), r && r.ok ? r.result.message_id : null, 'Опрос: что случится у всех').run();
    return true;
  }
  if (!p.ok || !p.msg_id) return false;
  const rk = 'world_' + wk; if (await posted(env, rk)) return false;
  if (Date.now() - p.at < 20 * 3600000) return false;
  const r = await tgApi(env, 'stopPoll', { chat_id: env.CHANNEL_ID, message_id: p.msg_id });
  let ids = []; try { ids = JSON.parse(p.info) || []; } catch {}
  let win = ids[0], best = -1;
  if (r && r.ok && r.result && r.result.options) r.result.options.forEach((o, i) => { if (o.voter_count > best) { best = o.voter_count; win = ids[i]; } });
  if (!win) { await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info) VALUES (?1, ?2, 1, ?3)').bind(rk, Date.now(), null).run(); return true; }
  const day = mskDay();
  const ok = await post(env, origin, 'events.jpg', [`<b>Канал решил: ${esc(WORLD_OPTS[win])}</b>`, '', 'Сегодня это случится в каждой кофейне игры. Заходи и разбирайся.'].join('\n'));
  await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info, msg_id, caption) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(rk, Date.now(), ok ? 1 : 0, JSON.stringify({ id: win, day }), ok && ok.id ? ok.id : null, 'Решение канала').run();
  return true;
}
export async function worldInfo(env) {
  const r = await env.DB.prepare("SELECT info FROM posts WHERE key LIKE 'world_%' ORDER BY at DESC LIMIT 1").first();
  if (!r || !r.info) return null; try { const w = JSON.parse(r.info); return w && w.day === mskDay() ? w : null; } catch { return null; }
}

// особый гость недели — тот же порядок, что в игре
export const BOSSES = [
  { id: 'michelin', n: 'Мишленовский инспектор', d: 'Смотрит на пол, засекает время эспрессо и лезет в подсобку.', hint: 'Отмойте зал и подсобку, держите очередь короткой.' },
  { id: 'critic', n: 'Ресторанный критик с камерой', d: 'Миллион подписчиков, кольцевая лампа и ноль жалости.', hint: 'Нужны рейтинг, хороший раф и довольная команда.' },
  { id: 'owner', n: 'Владелец крупной сети', d: 'Хочет купить вашу кофейню. Целиком. С котом.', hint: 'Решите заранее: продаться или нет. И чтобы цифры были в плюсе.' },
  { id: 'millionaire', n: 'Тайный миллионер', d: 'Выглядит как бездомный, в пакете из «Пятёрочки» — миллион.', hint: 'Будьте людьми. И держите свободные места.' },
  { id: 'sanepid', n: 'Генерал санэпида', d: 'Его последний визит закрыл три кофейни и одну шаурму.', hint: 'Хозтовары на складе, свежий холодильник, чистота.' }
];
export function bossOf(week) { const n = Math.floor(Date.parse(week + 'T00:00:00Z') / 604800000); return BOSSES[((n % BOSSES.length) + BOSSES.length) % BOSSES.length]; }
async function bossTick(env, origin) {
  const d = new Date(Date.now() + 3 * 3600000); const dow = d.getUTCDay(), hr = d.getUTCHours();
  const wk = tourWeek(); const b = bossOf(wk);
  // анонс: четверг после 18:00
  if (dow === 4 && hr >= 18) { const k = 'bossann_' + wk; if (!(await posted(env, k))) {
    const ok = await post(env, origin, 'events.jpg', [`<b>Завтра в районе: ${esc(b.n)}</b>`, '', esc(b.d), '', `С 12:00 пятницы он зайдёт в каждую кофейню. Три испытания, и часть оценки — по тому, что у вас на самом деле. ${esc(b.hint)}`, '', 'Прошёл все три — значок и премия. Итоги в субботу.'].join('\n'));
    await mark(env, k, ok); return true; } }
  // рассылка в боте: пятница после 12:00, по 25 за тик
  if (dow === 5 && hr >= 12) { const k = 'bossbc_' + wk; const st = await posted(env, k); if (!st || st.info !== 'done') {
    const after = st ? Number(st.info) || 0 : 0;
    const rows = (await env.DB.prepare('SELECT tg_id FROM players WHERE tg_id > ?1 AND COALESCE(banned,0) = 0 AND level >= 2 ORDER BY tg_id LIMIT 25').bind(after).all()).results || [];
    if (!rows.length) { await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info) VALUES (?1, ?2, 1, ?3)').bind(k, Date.now() - 3 * 60000, 'done').run(); return false; }
    const bot = await getBot(env); const app = bot ? `https://t.me/${bot.username}${env.APP_SHORT ? '/' + env.APP_SHORT : ''}?${env.APP_SHORT ? 'startapp' : 'start'}=boss` : origin;
    for (const r of rows) { try { await tgApi(env, 'sendMessage', { chat_id: r.tg_id, text: `<b>${esc(b.n)} уже в районе</b>\n\nСегодня он зайдёт и к тебе. Три испытания, за все три — значок и премия.`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', url: app }]] } }); } catch {} }
    await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info) VALUES (?1, ?2, 1, ?3)').bind(k, Date.now() - 3 * 60000, String(rows[rows.length - 1].tg_id)).run();
    return false; } }
  // итоги: суббота после 12:00
  if (dow === 6 && hr >= 12) { const k = 'bossres_' + wk; if (!(await posted(env, k))) {
    const st = await env.DB.prepare('SELECT COUNT(*) n, SUM(CASE WHEN pass >= 3 THEN 1 ELSE 0 END) p, SUM(CASE WHEN res = \'sold\' THEN 1 ELSE 0 END) s FROM boss WHERE week = ?1').bind(wk).first();
    if (!st || !st.n) { await mark(env, k, true, 'empty'); return false; }
    const top = (await env.DB.prepare('SELECT cafe, first_name FROM boss WHERE week = ?1 AND pass >= 3 ORDER BY at LIMIT 3').bind(wk).all()).results || [];
    const lines = [`<b>Итоги: ${esc(b.n)}</b>`, '', `Посетил кофеен: ${st.n}. Прошли все три испытания: ${st.p || 0}.` + (b.id === 'owner' ? ` Продали долю: ${st.s || 0}.` : '')];
    if (top.length) lines.push('', 'Первыми справились:', ...top.map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}»`));
    lines.push('', 'В следующую пятницу придёт другой гость.');
    const ok = await post(env, origin, 'events.jpg', lines.join('\n')); await mark(env, k, ok); return true; } }
  return false;
}

// запуск Елизаветы: один пост в канал и одно сообщение игрокам
const LIZA_AT = Date.parse('2026-11-05T18:00:00+03:00');
async function lizaTick(env, origin) {
  if (Date.now() < LIZA_AT) return false;
  if (!(await posted(env, 'liza_post'))) {
    const ok = await post(env, origin, 'liza_card.png', ['<b>В районе новая гостья: Елизавета из «кофеРУинер»</b>', '', 'Она ходит по кофейням с котом на плече и пишет обзоры. Смешные, честные и добрые. У каждой кофейни свой: она смотрит, какая вы, а не сколько вы потратили.', '', 'Пять визитов, раз в три дня. Между визитами можно что-то поменять и поднять оценку. После пятого — личный значок по типу вашей кофейни.', '', 'Её канал: <a href="https://t.me/eve_channel777">кофеРУинер</a>'].join('\n'));
    await mark(env, 'liza_post', ok); return true;
  }
  const k = 'liza_bc'; const st = await posted(env, k); if (st && st.info === 'done') return false;
  const after = st ? Number(st.info) || 0 : 0;
  const rows = (await env.DB.prepare('SELECT tg_id FROM players WHERE tg_id > ?1 AND COALESCE(banned,0) = 0 AND level >= 2 ORDER BY tg_id LIMIT 25').bind(after).all()).results || [];
  if (!rows.length) { await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info) VALUES (?1, ?2, 1, ?3)').bind(k, Date.now() - 3 * 60000, 'done').run(); return false; }
  const bot = await getBot(env); const app = bot ? `https://t.me/${bot.username}${env.APP_SHORT ? '/' + env.APP_SHORT : ''}?${env.APP_SHORT ? 'startapp' : 'start'}=liza` : origin;
  for (const r of rows) { try { await tgApi(env, 'sendMessage', { chat_id: r.tg_id, text: '<b>Елизавета из «кофеРУинер» вышла в район</b>\n\nСкоро она зайдёт и к тебе с котом на плече и напишет обзор твоей кофейни. У каждого он свой.', parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', url: app }], [{ text: 'Канал кофеРУинер', url: 'https://t.me/eve_channel777' }]] } }); } catch {} }
  await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info) VALUES (?1, ?2, 1, ?3)').bind(k, Date.now() - 3 * 60000, String(rows[rows.length - 1].tg_id)).run();
  return false;
}

// раз в день в 21:00 по Москве: три самые крупные дуэли за день, только если ставки по-настоящему большие
const DIGEST_MIN_STAKE = 200000;
async function duelDigest(env, origin) {
  const msk = new Date(Date.now() + 3 * 3600000); if (msk.getUTCHours() < 21) return false;
  const day = msk.toISOString().slice(0, 10), key = 'duels_' + day; if (await posted(env, key)) return false;
  const from = Date.parse(day + 'T00:00:00+03:00');
  const rows = (await env.DB.prepare("SELECT a_cafe, b_cafe, a, b, stake, a_score, b_score, winner FROM duel WHERE status = 'done' AND winner > 0 AND done_at >= ?1 AND stake >= ?2 ORDER BY stake DESC, ABS(a_score - b_score) DESC LIMIT 3").bind(from, DIGEST_MIN_STAKE).all()).results || [];
  if (!rows.length) { await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info) VALUES (?1, ?2, 0, ?3)').bind(key, 0, 'none').run(); return false; }
  const fm = n => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');
  const lines = rows.map((d, i) => { const aw = d.winner === d.a; const w = aw ? d.a_cafe : d.b_cafe, l = aw ? d.b_cafe : d.a_cafe, ws = Math.max(d.a_score, d.b_score), ls = Math.min(d.a_score, d.b_score);
    return `${i + 1}. «${esc(w)}» обыграла «${esc(l)}» ${ws} на ${ls} и забрала ${fm(d.stake * 2 * 0.9)} ₽`; });
  const html = ['<b>Дуэли дня: самые крупные ставки</b>', '', ...lines, '', 'Игра «Помнить заказ»: пять гостей, заказ по памяти. Вызвать соперника можно в «Зал → Дела».'].join('\n');
  const ok = await post(env, origin, 'events.jpg', html); await mark(env, key, ok); return true;
}
