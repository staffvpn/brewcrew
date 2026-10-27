// Канал игры: бот сам публикует запуск, обновления, праздничные события, рекорды и итоги недельного турнира.
// Вызывается фоном из /api/track и вебхука. Ничего не делает, пока не задан CHANNEL_ID.
import { tgApi, getBot, mskDay, ADMINS } from './_lib.js';

export const VERSION = '7';
export const VERSION_TITLE = 'теперь по-взрослому';
export const VERSION_IMG = 'updates.jpg';
export const VERSION_TAIL = 'Главная цель — «Кофейня недели района». Посмотрим, кто первый.';
export const CHANGELOG = [
  'Гостей больше с каждым уровнем: команда работает на пределе, улучшения снова нужны',
  'Гости бывают разные: тормоз у кассы, «Американо и побежал» и компании по четыре человека',
  'Тупой вопрос у кассы? Ответь, потерпи или выгони — но выгнанный может написать отзыв',
  'Главы с целями и наградами: от «Не закрыться» до франшизы',
  'Золотая смена: ни одного скандала, чистый зал, все задания. Три подряд — «Кофейня недели района» и пост здесь',
  'Мойка переехала наверх, вторая мойщица открывается с 12 уровня и моет зал',
  'Ответы на отзывы видны всем, а рекламщикам, которые слили бюджет, можно позвонить и наорать',
  'Уровни набираются дольше, налог списывается каждый день, легенды стали редкостью',
  'Новые паки игровых денег за звёзды',
  'Сотни новых реплик: общепит, мемы и «шесть-семь» от школьников'
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
      const ok = await post(env, origin, VERSION_IMG || 'updates.jpg', [`<b>Обновление ${VERSION}${VERSION_TITLE ? ': ' + VERSION_TITLE : ''}</b>`, '', ...CHANGELOG.map(x => '— ' + esc(x)), ...(VERSION_TAIL ? ['', VERSION_TAIL] : [])].join('\n'));
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
    // итоги недели и призы: в понедельник после полуночи по Москве
    const prev = tourWeek(Date.now() - 7 * 86400000);
    const wkey = 'week_' + prev;
    if (!(await posted(env, wkey))) {
      const top = (await env.DB.prepare(`SELECT * FROM tour WHERE week = ?1 AND profit > 0 AND tg_id NOT IN (${ADMINS.join(',')}) ORDER BY profit DESC LIMIT 5`).bind(prev).all()).results || [];
      if (!top.length) { await mark(env, wkey, true, 'empty'); return; }
      const prizes = [20, 14, 10];
      for (let i = 0; i < Math.min(3, top.length); i++) {
        await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, ?3, ?4, ?5, 0)').bind(top[i].tg_id, 'staff', prizes[i], `Приз за ${i + 1} место в турнире района.`, Date.now()).run();
        await env.DB.prepare('INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, ?2, NULL, ?3, ?4, 0)').bind(top[i].tg_id, 'msg', `Ты занял ${i + 1} место в турнире района за неделю. Приз — легендарный сотрудник ${prizes[i]} уровня, он уже вышел на смену.`, Date.now()).run();
      }
      const total = await env.DB.prepare('SELECT COUNT(*) n FROM tour WHERE week = ?1').bind(prev).first();
      const ok = await post(env, origin, 'events.jpg', ['<b>Итоги турнира района</b>', '', ...top.map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}», ${CITY[t.city] || ''}, ${esc(t.first_name || 'аноним')} — ${fmt(t.profit)} ₽ прибыли${i < 3 ? ' · приз: легенда ' + prizes[i] + ' уровня' : ''}`), '', `Участвовало кофеен: ${total ? total.n : top.length}. Новая неделя уже идёт.`].join('\n'));
      await mark(env, wkey, ok); return;
    }
    // рекорд дня: если кто-то сделал выручку на 10% больше прежнего рекорда
    const best = await env.DB.prepare(`SELECT tg_id, cafe, city, first_name, best_day FROM players WHERE tg_id NOT IN (${ADMINS.join(',')}) ORDER BY best_day DESC LIMIT 1`).first();
    if (best && best.best_day >= 200000) {
      const rec = await posted(env, 'record');
      const prevRec = rec ? Number(rec.info) || 0 : 0;
      const dkey = 'rec_' + mskDay();
      if (best.best_day > prevRec * 1.1 && !(await posted(env, dkey))) {
        const ok = await post(env, origin, 'events.jpg', ['<b>Новый рекорд района</b>', '', `Кофейня «${esc(best.cafe || '?')}» (${CITY[best.city] || ''}, владелец ${esc(best.first_name || 'аноним')}) сделала ${fmt(best.best_day)} ₽ выручки за один день.`, '', 'Кто следующий?'].join('\n'));
        await mark(env, dkey, ok); await mark(env, 'record', ok, String(best.best_day)); return;
      }
    }
  } catch (e) { /* канал не должен ломать игру */ }
}
