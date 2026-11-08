// POST /api/duel — дуэли «Помнить заказ»: вызов, игра, ответ, итог. Ставки и очки — на сервере.
import { json, verifyInitData, tgApi, getBot, sezId, mskDay } from '../_lib.js';
import { publicGuests, scoreDuel } from '../_duel.js';
import { post } from '../_channel.js';

const DAY = 86400000, PLAY_WIN = 30 * 60000, MIN_STAKE = 10000, LOUD_STAKE = 200000, FEE = 0.1;
const pidOf = id => (Number(id) * 3 + 7).toString(36);
const idOf = pid => { const n = parseInt(String(pid || ''), 36); return Number.isFinite(n) && (n - 7) % 3 === 0 ? (n - 7) / 3 : 0; };
const escH = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');

async function appLink(env) { const bot = await getBot(env); return bot ? `https://t.me/${bot.username}${env.APP_SHORT ? '/' + env.APP_SHORT : ''}?${env.APP_SHORT ? 'startapp' : 'start'}=duel` : null; }
async function dm(env, to, text) { try { await tgApi(env, 'sendMessage', { chat_id: to, text: text + '\n\nЗайди в игру: дуэли в «Зал → Дела».', parse_mode: 'HTML' }); } catch {} }
async function pay(env, to, amount, text, now) { if (amount > 0) await env.DB.prepare("INSERT INTO admin_ops (tg_id, op, amount, text, created_at, by_admin) VALUES (?1, 'duelpay', ?2, ?3, ?4, 0)").bind(to, Math.round(amount), text, now).run(); }

// Просроченные вызовы: не сыграл вызывающий — отмена; не ответил соперник — сгорает; принял и не доиграл — ноль очков
export async function duelSweep(env, origin, now = Date.now()) {
  const late = (await env.DB.prepare("SELECT * FROM duel WHERE (status = 'a_play' AND created_at < ?1) OR (status = 'open' AND a_at < ?2) OR (status = 'b_play' AND b_start < ?1) LIMIT 20").bind(now - PLAY_WIN, now - DAY).all()).results || [];
  for (const d of late) {
    if (d.status === 'a_play') { const u = await env.DB.prepare("UPDATE duel SET status = 'cancelled', done_at = ?2 WHERE id = ?1 AND status = 'a_play'").bind(d.id, now).run(); if (u.meta.changes) await pay(env, d.a, d.stake, 'Ставка вернулась: дуэль не начата', now); }
    else if (d.status === 'open') { const u = await env.DB.prepare("UPDATE duel SET status = 'expired', done_at = ?2 WHERE id = ?1 AND status = 'open'").bind(d.id, now).run(); if (u.meta.changes) { await pay(env, d.a, d.stake, 'Ставка вернулась: «' + (d.b_cafe || '?') + '» не ответили', now); await dm(env, d.a, `Вызов «${escH(d.b_cafe)}» сгорел: за сутки не ответили.${d.stake ? ' Ставка ' + fmt(d.stake) + ' ₽ вернулась.' : ''}`); } }
    else if (d.status === 'b_play') await resolve(env, origin, d, 0, JSON.stringify({ total: 0, det: [], late: 1 }), now);
  }
}

async function resolve(env, origin, d, bScore, bDet, now) {
  const u = await env.DB.prepare("UPDATE duel SET status = 'done', b_score = ?2, b_det = ?3, done_at = ?4, winner = ?5 WHERE id = ?1 AND status = 'b_play'")
    .bind(d.id, bScore, bDet, now, d.a_score > bScore ? d.a : bScore > d.a_score ? d.b : 0).run();
  if (!u.meta.changes) return null;
  const win = d.a_score > bScore ? d.a : bScore > d.a_score ? d.b : 0, lose = win === d.a ? d.b : win === d.b ? d.a : 0;
  const winCafe = win === d.a ? d.a_cafe : d.b_cafe, loseCafe = win === d.a ? d.b_cafe : d.a_cafe;
  const prize = Math.round(d.stake * 2 * (1 - FEE));
  if (win) await pay(env, win, prize, 'Дуэль с «' + (loseCafe || '?') + '»: победа', now);
  else { await pay(env, d.a, d.stake, 'Дуэль: ничья, ставка вернулась', now); await pay(env, d.b, d.stake, 'Дуэль: ничья, ставка вернулась', now); }
  // рейтинг дуэлей
  const ps = (await env.DB.prepare('SELECT tg_id, duel_r FROM players WHERE tg_id IN (?1, ?2)').bind(d.a, d.b).all()).results || [];
  const ra = (ps.find(p => p.tg_id === d.a) || {}).duel_r || 1000, rb = (ps.find(p => p.tg_id === d.b) || {}).duel_r || 1000;
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400)), sa = win === d.a ? 1 : win === d.b ? 0 : 0.5, K = 32;
  const na = Math.round(ra + K * (sa - ea)), nb = Math.round(rb + K * ((1 - sa) - (1 - ea)));
  await env.DB.batch([
    env.DB.prepare('UPDATE players SET duel_r = ?2, duel_w = duel_w + ?3, duel_l = duel_l + ?4 WHERE tg_id = ?1').bind(d.a, na, sa === 1 ? 1 : 0, sa === 0 ? 1 : 0),
    env.DB.prepare('UPDATE players SET duel_r = ?2, duel_w = duel_w + ?3, duel_l = duel_l + ?4 WHERE tg_id = ?1').bind(d.b, nb, sa === 0 ? 1 : 0, sa === 1 ? 1 : 0)
  ]);
  const line = `«${escH(d.a_cafe)}» ${d.a_score} : ${bScore} «${escH(d.b_cafe)}»`;
  const res = win ? `Победа «${escH(winCafe)}»${d.stake ? ', выигрыш ' + fmt(prize) + ' ₽' : ''}.` : 'Ничья, ставки вернулись.';
  await dm(env, d.a, `Дуэль «Помнить заказ» закончилась.\n${line}\n${res}`);
  await dm(env, d.b, `Дуэль «Помнить заказ» закончилась.\n${line}\n${res}`);
  // громкий пост: большая ставка, победа над топ-3, разгром или выигранный реванш
  if (win && env.CHANNEL_ID) {
    let loud = '';
    if (d.stake >= LOUD_STAKE) loud = 'stake';
    else if (Math.abs(d.a_score - bScore) >= 20) loud = 'crush';
    else if (d.rematch && win === d.a) loud = 'rematch';
    else { const top = (await env.DB.prepare('SELECT tg_id FROM season WHERE season = ?1 ORDER BY sp DESC LIMIT 3').bind(sezId(now)).all()).results || []; if (top.some(t => t.tg_id === lose)) loud = 'top'; }
    if (loud) {
      const ws = Math.max(d.a_score, bScore), ls = Math.min(d.a_score, bScore);
      const head = { stake: 'Дуэль на крупную ставку', crush: 'Разгром в дуэли', rematch: 'Реванш удался', top: 'Топ сезона пошатнулся' }[loud];
      const tail = loud === 'top' ? `«${escH(loseCafe)}» сейчас в топ-3 сезона, но память подвела.` : loud === 'rematch' ? `«${escH(winCafe)}» проиграли прошлый раз и вернулись за своим.` : loud === 'crush' ? `Пять гостей, ${ws} очков из 50 против ${ls}. Кто-то перепутал раф с американо.` : 'Ставку забрали целиком.';
      const html = `<b>${head}</b>\n\nКофейня «${escH(winCafe)}» обыграла «${escH(loseCafe)}» в «Помнить заказ»: ${ws} на ${ls}.${d.stake ? `\nВыигрыш: ${fmt(prize)} ₽.` : ''}\n${tail}\n\nВызвать на дуэль можно из рейтинга сезона в игре.`;
      try { const r = await post(env, origin, 'events.jpg', html); if (r) await env.DB.prepare('UPDATE duel SET posted = ?2 WHERE id = ?1').bind(d.id, r.id).run(); } catch {}
    }
  }
  return { win, prize, a: d.a_score, b: bScore, rA: na, rB: nb };
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return json({ ok: false, error: 'Сервер не настроен' }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false }, 400); }
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  if (!user || !user.id) return json({ ok: false, error: 'Открой игру из Telegram' }, 401);
  const now = Date.now(), origin = new URL(request.url).origin, me = user.id;
  try {
    if (body.op === 'list') {
      await duelSweep(env, origin, now);
      const my = await env.DB.prepare('SELECT cafe, money, duel_r, duel_w, duel_l FROM players WHERE tg_id = ?1').bind(me).first();
      const sz = sezId(now);
      const myLvl = (await env.DB.prepare('SELECT level FROM players WHERE tg_id = ?1').bind(me).first() || {}).level || 1;
      const targets = (await env.DB.prepare("SELECT tg_id, cafe, level, duel_r, money, snap FROM players WHERE banned = 0 AND tg_id != ?1 AND last_seen > ?2 AND cafe IS NOT NULL AND cafe != '' ORDER BY ABS(level - ?3) ASC, level DESC, last_seen DESC LIMIT 60").bind(me, now - 3 * DAY, myLvl).all()).results || [];
      const inc = (await env.DB.prepare("SELECT id, a_cafe, stake, a_at, rematch FROM duel WHERE b = ?1 AND status = 'open' ORDER BY a_at DESC LIMIT 10").bind(me).all()).results || [];
      const sent = (await env.DB.prepare("SELECT id, b_cafe, stake, a_at, a_score FROM duel WHERE a = ?1 AND status = 'open' ORDER BY a_at DESC LIMIT 10").bind(me).all()).results || [];
      const done = (await env.DB.prepare("SELECT id, a, b, a_cafe, b_cafe, stake, a_score, b_score, winner, done_at, rematch FROM duel WHERE (a = ?1 OR b = ?1) AND status = 'done' ORDER BY done_at DESC LIMIT 10").bind(me).all()).results || [];
      const top = (await env.DB.prepare('SELECT tg_id, snap, cafe, duel_r, duel_w, duel_l FROM players WHERE duel_w + duel_l > 0 AND banned = 0 ORDER BY duel_r DESC LIMIT 10').all()).results || [];
      const frs = await framesOf(env, targets.concat(top));
      const today = mskDay(now), dayStart = Date.parse(today + 'T00:00:00+03:00');
      const used = await env.DB.prepare("SELECT COUNT(*) n FROM duel WHERE a = ?1 AND created_at >= ?2 AND status != 'cancelled'").bind(me, dayStart).first();
      const myMoney = my ? my.money : 0;
      return json({ ok: true, pid: pidOf(me), me: my ? { r: my.duel_r || 1000, w: my.duel_w || 0, l: my.duel_l || 0 } : { r: 1000, w: 0, l: 0 }, left: Math.max(0, 3 - (used ? used.n : 0)),
        targets: targets.map(t => ({ pid: pidOf(t.tg_id), cafe: t.cafe, lvl: t.level, r: t.duel_r || 1000, fr: frs[t.tg_id] || null, max: Math.max(0, Math.floor(Math.min(myMoney * 0.1, t.money) / 1000) * 1000) })),
        inc: inc.map(x => ({ id: x.id, cafe: x.a_cafe, stake: x.stake, until: x.a_at + DAY, rematch: x.rematch })),
        sent: sent.map(x => ({ id: x.id, cafe: x.b_cafe, stake: x.stake, until: x.a_at + DAY, score: x.a_score })),
        done: done.map(x => { const iamA = x.a === me; return { id: x.id, vs: iamA ? x.b_cafe : x.a_cafe, my: iamA ? x.a_score : x.b_score, their: iamA ? x.b_score : x.a_score, stake: x.stake, res: x.winner === me ? 'win' : x.winner ? 'lose' : 'draw', at: x.done_at, canRematch: x.winner && x.winner !== me && now - x.done_at < DAY, opp: pidOf(iamA ? x.b : x.a) }; }),
        top: top.map(t => ({ cafe: t.cafe, r: t.duel_r, w: t.duel_w, l: t.duel_l, fr: frs[t.tg_id] || null })) });
    }
    if (body.op === 'new') {
      const b = idOf(body.pid); if (!b || b === me) return json({ ok: false, error: 'Соперник не найден' });
      const [mine, them] = await Promise.all([env.DB.prepare('SELECT cafe, money, banned FROM players WHERE tg_id = ?1').bind(me).first(), env.DB.prepare('SELECT cafe, money, banned FROM players WHERE tg_id = ?1').bind(b).first()]);
      if (!them || them.banned) return json({ ok: false, error: 'Соперник не найден' });
      if (!mine) return json({ ok: false, error: 'Сначала поиграй пару минут' });
      const dayStart = Date.parse(mskDay(now) + 'T00:00:00+03:00');
      const used = await env.DB.prepare("SELECT COUNT(*) n FROM duel WHERE a = ?1 AND created_at >= ?2 AND status != 'cancelled'").bind(me, dayStart).first();
      if (used && used.n >= 3) return json({ ok: false, error: 'Сегодня уже три вызова. Завтра ещё три' });
      const rematch = body.rematch ? 1 : 0;
      const pair = await env.DB.prepare("SELECT id, status, winner, rematch, a FROM duel WHERE ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)) AND created_at > ?3 AND status NOT IN ('cancelled','declined','expired') ORDER BY created_at DESC LIMIT 3").bind(me, b, now - DAY).all();
      const pr = pair.results || [];
      if (pr.some(x => ['a_play', 'open', 'b_play'].includes(x.status))) return json({ ok: false, error: 'С этой кофейней уже идёт дуэль' });
      if (pr.length) { const last = pr[0]; const canRe = rematch && last.status === 'done' && last.winner && last.winner !== me && !pr.some(x => x.rematch && x.a === me);
        if (!canRe) return json({ ok: false, error: 'Эту кофейню можно вызвать раз в сутки' }); }
      let stake = Math.max(0, Math.round(Number(body.stake) || 0));
      if (stake) { const max = Math.floor(Math.min((mine.money || 0) * 0.1, them.money || 0) / 1000) * 1000; if (stake < MIN_STAKE) return json({ ok: false, error: 'Ставка от 10 000 ₽' }); if (stake > max) return json({ ok: false, error: 'Ставка не больше ' + fmt(max) + ' ₽' }); }
      const seed = Math.floor(Math.random() * 2147483647);
      const r = await env.DB.prepare("INSERT INTO duel (a, b, a_cafe, b_cafe, stake, seed, status, created_at, rematch) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'a_play', ?7, ?8) RETURNING id").bind(me, b, String(mine.cafe || '?').slice(0, 40), String(them.cafe || '?').slice(0, 40), stake, seed, now, rematch).first();
      return json({ ok: true, id: r.id, stake, vs: them.cafe, guests: publicGuests(seed) });
    }
    if (body.op === 'submit') {
      const d = await env.DB.prepare('SELECT * FROM duel WHERE id = ?1').bind(Number(body.id) || 0).first();
      if (!d) return json({ ok: false, error: 'Дуэль не найдена' });
      const sc = scoreDuel(d.seed, body.ans, body.ms), det = JSON.stringify(sc.det);
      if (d.a === me && d.status === 'a_play') {
        if (now - d.created_at > PLAY_WIN) return json({ ok: false, error: 'Время на игру вышло' });
        const u = await env.DB.prepare("UPDATE duel SET status = 'open', a_score = ?2, a_det = ?3, a_at = ?4 WHERE id = ?1 AND status = 'a_play'").bind(d.id, sc.total, det, now).run();
        if (!u.meta.changes) return json({ ok: false, error: 'Уже отправлено' });
        await dm(env, d.b, `Тебя вызвали на дуэль «Помнить заказ».\nКофейня «${escH(d.a_cafe)}»${d.stake ? ' ставит ' + fmt(d.stake) + ' ₽' : ' играет на интерес'}${d.rematch ? ' и хочет реванш' : ''}.\nНа ответ сутки.`);
        return json({ ok: true, score: sc.total, det: sc.det, wait: true });
      }
      if (d.b === me && d.status === 'b_play') {
        const out = await resolve(env, origin, d, sc.total, det, now);
        if (!out) return json({ ok: false, error: 'Уже отправлено' });
        return json({ ok: true, score: sc.total, det: sc.det, their: d.a_score, theirDet: JSON.parse(d.a_det || '[]'), win: out.win === me ? 'win' : out.win ? 'lose' : 'draw', prize: out.prize, r: out.rB });
      }
      return json({ ok: false, error: 'Сейчас не твой ход' });
    }
    if (body.op === 'accept') {
      const d = await env.DB.prepare("SELECT * FROM duel WHERE id = ?1 AND b = ?2 AND status = 'open'").bind(Number(body.id) || 0, me).first();
      if (!d) return json({ ok: false, error: 'Вызов уже недоступен' });
      if (d.stake) { const p = await env.DB.prepare('SELECT money FROM players WHERE tg_id = ?1').bind(me).first(); if (!p || (p.money || 0) < d.stake) return json({ ok: false, error: 'Не хватает денег на ставку' }); }
      const u = await env.DB.prepare("UPDATE duel SET status = 'b_play', b_start = ?2 WHERE id = ?1 AND status = 'open'").bind(d.id, now).run();
      if (!u.meta.changes) return json({ ok: false, error: 'Вызов уже недоступен' });
      return json({ ok: true, id: d.id, stake: d.stake, vs: d.a_cafe, guests: publicGuests(d.seed) });
    }
    if (body.op === 'decline') {
      const d = await env.DB.prepare("SELECT * FROM duel WHERE id = ?1 AND b = ?2 AND status = 'open'").bind(Number(body.id) || 0, me).first();
      if (!d) return json({ ok: false, error: 'Вызов уже недоступен' });
      const u = await env.DB.prepare("UPDATE duel SET status = 'declined', done_at = ?2 WHERE id = ?1 AND status = 'open'").bind(d.id, now).run();
      if (u.meta.changes) { await pay(env, d.a, d.stake, 'Ставка вернулась: «' + (d.b_cafe || '?') + '» отказались', now); await dm(env, d.a, `«${escH(d.b_cafe)}» отказались от дуэли.${d.stake ? ' Ставка ' + fmt(d.stake) + ' ₽ вернулась.' : ''}`); }
      return json({ ok: true });
    }
    return json({ ok: false, error: 'Неизвестное действие' });
  } catch (e) { return json({ ok: false, error: 'Что-то сломалось. Попробуй позже' }); }
}

async function framesOf(env, rows) { const want = []; for (const r of rows) { let fr = null; try { fr = JSON.parse(r.snap || '{}').fr; } catch {} if (fr && /^[a-z]{2,10}$/.test(fr)) want.push([r.tg_id, fr]); }
  const out = {}; if (!want.length) return out;
  const got = (await env.DB.prepare(`SELECT tg_id, item FROM purchases WHERE refunded = 0 AND item LIKE 'frame_%' AND tg_id IN (${[...new Set(want.map(w => Number(w[0])))].join(',')})`).all()).results || [];
  for (const [id, fr] of want) if (got.some(g => g.tg_id === id && g.item === 'frame_' + fr)) out[id] = fr; return out; }
