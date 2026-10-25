// POST /tg/webhook — сюда Telegram присылает сообщения боту. Команды: /start, /admin (только для админов).
import { ADMINS, json, mskDay, tgApi } from '../_lib.js';

const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/ |,/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function adminReport(env) {
  const now = Date.now();
  const today = mskDay(now);
  const day7 = mskDay(now - 6 * 86400000), day30 = mskDay(now - 29 * 86400000);
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).first();
  const [total, newToday, dau, wau, mau, online, avg, cities, top, days] = await Promise.all([
    q('SELECT COUNT(*) n FROM players'),
    q('SELECT COUNT(*) n FROM players WHERE created_at >= ?1', Date.parse(today + 'T00:00:00+03:00')),
    q('SELECT COUNT(*) n FROM days WHERE day = ?1', today),
    q('SELECT COUNT(DISTINCT tg_id) n FROM days WHERE day >= ?1', day7),
    q('SELECT COUNT(DISTINCT tg_id) n FROM days WHERE day >= ?1', day30),
    q('SELECT COUNT(*) n FROM players WHERE last_seen >= ?1', now - 3 * 60000),
    q('SELECT AVG(level) lvl, AVG(play_seconds) sec, SUM(franchises) fr, SUM(bankrupt) bk, AVG(sessions) ses FROM players'),
    env.DB.prepare('SELECT city, COUNT(*) n FROM players GROUP BY city ORDER BY n DESC LIMIT 6').all(),
    env.DB.prepare('SELECT cafe, first_name, username, level, earned FROM players ORDER BY earned DESC LIMIT 5').all(),
    env.DB.prepare('SELECT day, COUNT(*) n FROM days WHERE day >= ?1 GROUP BY day ORDER BY day').bind(day7).all()
  ]);
  const cityName = { msk: 'Москва', spb: 'Петербург', kzn: 'Казань', sochi: 'Сочи', nsk: 'Новосибирск', kgd: 'Калининград' };
  const lines = [
    '<b>Brew Crew · статистика</b>',
    '',
    `Онлайн сейчас: <b>${online.n}</b>`,
    `Всего игроков: <b>${total.n}</b>`,
    `Новых сегодня: <b>${newToday.n}</b>`,
    `Заходили сегодня: <b>${dau.n}</b>`,
    `За 7 дней: <b>${wau.n}</b> · за 30 дней: <b>${mau.n}</b>`,
    '',
    `Средний уровень: ${(avg.lvl || 0).toFixed(1)}`,
    `Среднее время в игре: ${Math.round((avg.sec || 0) / 60)} мин`,
    `Сессий на игрока: ${(avg.ses || 0).toFixed(1)}`,
    `Франшиз продано: ${avg.fr || 0} · банкротств: ${avg.bk || 0}`,
    '',
    '<b>По дням</b>',
    ...(days.results || []).map(d => `${d.day.slice(5)}: ${d.n}`),
    '',
    '<b>Города</b>',
    ...(cities.results || []).map(c => `${cityName[c.city] || c.city || 'не выбран'}: ${c.n}`),
    '',
    '<b>Топ по заработку</b>',
    ...(top.results || []).map((t, i) => `${i + 1}. «${esc(t.cafe || '?')}» — ${esc(t.first_name || '')}${t.username ? ' @' + esc(t.username) : ''}, ур. ${t.level}, ${fmt(t.earned)} ₽`)
  ];
  return lines.join('\n');
}

export async function onRequestPost({ request, env }) {
  if (env.WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return json({ ok: false }, 403);
  }
  let upd;
  try { upd = await request.json(); } catch { return json({ ok: true }); }
  const msg = upd.message;
  if (!msg || !msg.text) return json({ ok: true });
  const chat = msg.chat.id, from = msg.from && msg.from.id;
  const text = msg.text.trim();
  const origin = new URL(request.url).origin;

  if (text.startsWith('/admin')) {
    if (!ADMINS.includes(from)) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Эта команда только для администраторов.' });
    } else if (!env.DB) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'База не подключена: добавьте привязку DB в настройках Cloudflare Pages.' });
    } else {
      await tgApi(env, 'sendMessage', { chat_id: chat, parse_mode: 'HTML', text: await adminReport(env),
        reply_markup: { inline_keyboard: [[{ text: 'Открыть игру', web_app: { url: origin } }]] } });
    }
  } else if (text.startsWith('/start') || text.startsWith('/play')) {
    await tgApi(env, 'sendMessage', { chat_id: chat,
      text: 'Brew Crew — кофейня, где все на грани. Нанимай команду, прокачивай зал, разбирайся с проверками, прогулами и гусями. 18+',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть кофейню', web_app: { url: origin } }]] } });
  }
  return json({ ok: true });
}
