// Канал игры: бот сам публикует запуск, обновления, праздничные события и цель района.
// Вызывается фоном из /api/track и вебхука. Ничего не делает, пока не задан CHANNEL_ID.
import { tgApi, getBot, mskDay, ADMINS, sezId, SEZ_NAMES } from './_lib.js';
import { GOAL, goalInfo } from './_goal.js';

export const VERSION = '8.2';
export const VERSION_TITLE = 'мы расширяемся';
export const VERSION_IMG = 'expand.jpg';
export const VERSION_TAIL = 'Без друзей миллион не вытянуть. Зовите.';
// коротко для окна в игре и сообщения в боте
export const VERSION_SHORT = 'Открылась зона отдыха — второй зал с диванами. Запара теперь только с 7 до 15. Район вместе продаёт миллион стаканов до конца ноября.';
export const CHANGELOG = [
  'Второй зал стал зоной отдыха: диваны и столики без бара. Гости берут кофе в основном зале и идут сюда, официант носит дозаказ. Работают там официанты и мойщицы',
  'Веранда, лаунж и выкупленные залы на ремонте, всё купленное сохранено',
  'Цель района: миллион стаканов кофе на всех до 30 ноября. Бонусы всем на 250, 500 и 750 тысячах, за миллион — золотой стакан, три дня прибыли и +25% гостей',
  'Запара только с 7 до 15, дальше спокойный день',
  'Мойщица реже выходит в зал, пожелания сотрудников по их работе',
  'Без недельного турнира и диверсий против конкурентов',
  '26 новых жёстких ситуаций: шуба в жару, кружка-ведро, похороны кофемашины'
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

async function posted(env, key) { return await env.DB.prepare('SELECT key, at, info FROM posts WHERE key = ?1').bind(key).first(); }
let LASTPOST = null;
async function mark(env, key, ok, info) { const lp = key === 'record' ? null : LASTPOST; await env.DB.prepare('INSERT OR REPLACE INTO posts (key, at, ok, info, msg_id, caption) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(key, Date.now(), ok ? 1 : 0, info ?? null, lp ? lp.id : null, lp ? lp.caption : null).run(); if (key !== 'record') LASTPOST = null; }

export async function post(env, origin, img, html) {
  if (html.replace(/<[^>]+>/g, '').length > 1020) html = html.slice(0, 1000).replace(/\n[^\n]*$/, '');
  const bot = await getBot(env);
  const url = bot ? `https://t.me/${bot.username}${env.APP_SHORT ? '/' + env.APP_SHORT : ''}?${env.APP_SHORT ? 'startapp' : 'start'}=channel` : origin;
  const r = await tgApi(env, 'sendPhoto', { chat_id: env.CHANNEL_ID, photo: `${origin}/img/${img}`, caption: html, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', url }]] } });
  LASTPOST = r && r.ok ? { id: r.result.message_id, caption: html } : null;
  return r && r.ok ? { id: r.result.message_id } : false;
}

export async function channelTick(env, origin) {
  if (!env.CHANNEL_ID || !env.DB || !env.BOT_TOKEN) return;
  try {
    // не чаще одного поста в 3 минуты, чтобы не спамить
    const last = await env.DB.prepare('SELECT MAX(at) at FROM posts').first();
    if (last && last.at && Date.now() - last.at < 3 * 60000) return;

    if (!(await posted(env, 'launch'))) {
      const ok = await post(env, origin, 'banner.jpg', ['<b>Brew Crew открыта</b>', '', 'Кофейня в Telegram, где всё на грани. Снимаешь пустое помещение, ставишь кофемашину, нанимаешь бариста, который завтра проспит, и разбираешься с проверками, гусями и бабушкой с купоном 2011 года.', '', '18+. Бесплатно. Работает, даже когда ты спишь.'].join('\n'));
      await mark(env, 'launch', ok); return;
    }
    const vkey = 'ver_' + VERSION;
    if (!(await posted(env, vkey))) {
      let intro = []; if (VERSION === '8') try { const st = await env.DB.prepare(`SELECT COUNT(*) n, COALESCE(SUM(earned),0) e FROM players WHERE sessions > 0 AND tg_id NOT IN (${ADMINS.join(',')})`).first(); const pl = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }; if (st && st.n) intro = [`В районе уже ${st.n} ${pl(st.n, 'кофейня', 'кофейни', 'кофеен')}, вместе они заработали ${fmt(st.e)} ₽. Вы играете больше, чем мы думали, поэтому вот большое обновление:`, '']; } catch {}
      const ok = await post(env, origin, VERSION_IMG || 'updates.jpg', [`<b>Обновление ${VERSION}${VERSION_TITLE ? ': ' + VERSION_TITLE : ''}</b>`, '', ...intro, ...CHANGELOG.map(x => '— ' + esc(x)), ...(VERSION_TAIL ? ['', VERSION_TAIL] : [])].join('\n'));
      await mark(env, vkey, ok); return;
    }
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
    // рассылка игрокам о новой версии: коротко и со ссылкой на пост
    if (await bcastVersion(env, origin)) return;
    // цель района: посты на рубежах и итог
    await goalTick(env, origin);
  } catch (e) { /* канал не должен ломать игру */ }
}

export function postUrl(env, msgId) { const base = String(env.CHANNEL_URL || '').replace(/\/+$/, ''); return base && msgId && /t\.me\/[A-Za-z0-9_]+$/.test(base) ? base + '/' + msgId : (base || null); }
export async function versionInfo(env) {
  let url = env.CHANNEL_URL || null;
  try { const p = await env.DB.prepare('SELECT msg_id FROM posts WHERE key = ?1').bind('ver_' + VERSION).first(); if (p && p.msg_id) url = postUrl(env, p.msg_id); } catch {}
  return { v: VERSION, title: VERSION_TITLE ? VERSION_TITLE[0].toUpperCase() + VERSION_TITLE.slice(1) : 'Обновление', text: VERSION_SHORT, url };
}
// раз в тик — до 25 сообщений в бот
async function bcastVersion(env, origin) {
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
    ? ['<b>Миллион стаканов. Район сделал это</b>', '', 'Все, кто продал от 2 000 стаканов, получают Золотой миллионный стакан, три дня прибыли и трое суток +25% гостей. Значок «Миллионник» — всем участникам.', '', ...top.map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}», ${esc(t.first_name || 'аноним')} — ${fmt(t.goal_cups)} стаканов · легенда 25 уровня`)]
    : ['<b>Миллион не взят</b>', '', `Район продал ${fmt(g.total)} стаканов. Не хватило ${fmt(GOAL.target - g.total)}.`, '', 'Треснувший стакан на стойке — памятник тому, как близко это было. В следующий раз зовите друзей раньше.'];
  const ok = await post(env, origin, 'events.jpg', lines.join('\n'));
  await mark(env, fk, ok);
}
