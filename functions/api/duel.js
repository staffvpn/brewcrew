// POST /api/duel — дуэли «Помнить заказ»: вызов, игра, ответ, итог. Ставки и очки — на сервере.
import { json, verifyInitData, tgApi, getBot, sezId, mskDay } from '../_lib.js';
import { publicGuests, scoreDuel } from '../_duel.js';
import { stakeDuel, closeDuel, settleDuel, identityMatches } from '../_duelmoney.js';

const DAY = 86400000, PLAY_WIN = 30 * 60000, MIN_STAKE = 25000, LOUD_STAKE = 200000, FEE = 0.1;
const pidOf = id => (Number(id) * 3 + 7).toString(36);
const idOf = pid => { const n = parseInt(String(pid || ''), 36); return Number.isFinite(n) && (n - 7) % 3 === 0 ? (n - 7) / 3 : 0; };
const escH = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');

async function appLink(env) { const bot = await getBot(env); return bot ? `https://t.me/${bot.username}${env.APP_SHORT ? '/' + env.APP_SHORT : ''}?${env.APP_SHORT ? 'startapp' : 'start'}=duel` : null; }
async function dm(env, to, text) { try { await tgApi(env, 'sendMessage', { chat_id: to, text: text + '\n\nЗайди в игру: дуэли в «Зал → Дела».', parse_mode: 'HTML' }); } catch {} }
// Просроченные вызовы: не сыграл вызывающий — отмена; не ответил соперник — сгорает; принял и не доиграл — ноль очков
export async function duelSweep(env, origin, now = Date.now()) {
  const late = (await env.DB.prepare("SELECT * FROM duel WHERE (status = 'a_play' AND created_at < ?1) OR (status = 'open' AND a_at < ?2) OR (status = 'b_play' AND b_start < ?1) LIMIT 20").bind(now - PLAY_WIN, now - DAY).all()).results || [];
  for (const d of late) {
    if(d.status==='a_play')await closeDuel(env,d,'cancelled','Ставка вернулась: дуэль не начата',now);
    else if(d.status==='open' && await closeDuel(env,d,'expired','Ставка вернулась: соперник струсил',now)){await dm(env,d.a,`«${escH(d.b_cafe)}» не ответили за сутки. Вызов закрыт, ставка вернулась.`);await dm(env,d.b,`Вызов от «${escH(d.a_cafe)}» сгорел: ты не ответил за сутки.`);}
    else if (d.status === 'b_play') await resolve(env, origin, d, 0, JSON.stringify({ total: 0, det: [], late: 1 }), now);
  }
}

async function resolve(env,origin,d,bScore,bDet,now){
 const out=await settleDuel(env,d,bScore,bDet,now);if(!out)return null;
 const line=`«${escH(d.a_cafe)}» ${d.a_score} : ${bScore} «${escH(d.b_cafe)}»`;
 for(const uid of [d.a,d.b])await dm(env,uid,'Дуэль «Помнить заказ» закончилась.\n'+line+'\n'+(out.win?'Победитель получил выигрыш.':'Ничья, ставки вернулись.'));
 return out;
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
      const my = await env.DB.prepare('SELECT cafe, money, duel_r, duel_w, duel_l,franchises,created_at FROM players WHERE tg_id = ?1').bind(me).first();
      const sz = sezId(now);
      const myLvl = (await env.DB.prepare('SELECT level FROM players WHERE tg_id = ?1').bind(me).first() || {}).level || 1;
      const targets = (await env.DB.prepare("SELECT tg_id, cafe, level, duel_r, money, snap FROM players WHERE banned = 0 AND tg_id != ?1 AND last_seen > ?2 AND cafe IS NOT NULL AND cafe != '' ORDER BY ABS(level - ?3) ASC, level DESC, last_seen DESC LIMIT 60").bind(me, now - 3 * DAY, myLvl).all()).results || [];
      const inc = (await env.DB.prepare("SELECT id, a_cafe, stake, a_at, rematch FROM duel WHERE b = ?1 AND b_run=?2 AND b_created=?3 AND status = 'open' ORDER BY a_at DESC LIMIT 10").bind(me,my?.franchises||0,my?.created_at||0).all()).results || [];
      const sent = (await env.DB.prepare("SELECT id, b_cafe, stake, a_at, a_score FROM duel WHERE a = ?1 AND a_run=?2 AND a_created=?3 AND status = 'open' ORDER BY a_at DESC LIMIT 10").bind(me,my?.franchises||0,my?.created_at||0).all()).results || [];
      const done = (await env.DB.prepare("SELECT id, a, b, a_cafe, b_cafe, stake, a_score, b_score, winner, done_at, rematch FROM duel WHERE ((a=?1 AND a_run=?2 AND a_created=?3) OR (b=?1 AND b_run=?2 AND b_created=?3)) AND status = 'done' ORDER BY done_at DESC LIMIT 10").bind(me,my?.franchises||0,my?.created_at||0).all()).results || [];
      const top = (await env.DB.prepare('SELECT tg_id, snap, cafe, duel_r, duel_w, duel_l FROM players WHERE duel_w + duel_l > 0 AND banned = 0 ORDER BY duel_r DESC LIMIT 10').all()).results || [];
      const current=await env.DB.prepare('SELECT * FROM players WHERE tg_id=?1').bind(me).first();
      const active=(await env.DB.prepare("SELECT * FROM duel WHERE (a=?1 AND status='a_play') OR (b=?1 AND status='b_play')").bind(me).all()).results||[];
      const playing=active.filter(d=>identityMatches(current,d,d.a===me?'a':'b')).map(d=>({id:d.id,stake:d.stake,vs:d.a===me?d.b_cafe:d.a_cafe,role:d.a===me?'a':'b',guests:publicGuests(d.seed)}));
      const frs = await framesOf(env, targets.concat(top));
      const today = mskDay(now), dayStart = Date.parse(today + 'T00:00:00+03:00');
      const used = await env.DB.prepare("SELECT COUNT(*) n FROM duel WHERE a = ?1 AND created_at >= ?2").bind(me, dayStart).first();
      const myMoney = my ? my.money : 0;
      return json({ ok: true, pid: pidOf(me), me: my ? { r: my.duel_r || 1000, w: my.duel_w || 0, l: my.duel_l || 0 } : { r: 1000, w: 0, l: 0 }, left: Math.max(0, 3 - (used ? used.n : 0)),
        targets: targets.map(t => ({ pid: pidOf(t.tg_id), cafe: t.cafe, lvl: t.level, r: t.duel_r || 1000, fr: frs[t.tg_id] || null, max: Math.max(0, Math.floor(Math.min(myMoney * 0.25, (t.money||0)*0.5) / 1000) * 1000) })),
        playing, inc: inc.map(x => ({ id: x.id, cafe: x.a_cafe, stake: x.stake, until: x.a_at + DAY, rematch: x.rematch })),
        sent: sent.map(x => ({ id: x.id, cafe: x.b_cafe, stake: x.stake, until: x.a_at + DAY, score: x.a_score })),
        done: done.map(x => { const iamA = x.a === me; return { id: x.id, vs: iamA ? x.b_cafe : x.a_cafe, my: iamA ? x.a_score : x.b_score, their: iamA ? x.b_score : x.a_score, stake: x.stake, res: x.winner === me ? 'win' : x.winner ? 'lose' : 'draw', at: x.done_at, canRematch: x.winner && x.winner !== me && now - x.done_at < DAY, opp: pidOf(iamA ? x.b : x.a) }; }),
        top: top.map(t => ({ cafe: t.cafe, r: t.duel_r, w: t.duel_w, l: t.duel_l, fr: frs[t.tg_id] || null })) });
    }
    if(body.op==='new'||body.op==='accept'){
      const receipt=await stakeDuel(env,me,body,now,async(mine)=>{
      const b = idOf(body.pid); if (!b || b === me) return ({ ok: false, error: 'Соперник не найден' });
      const them=await env.DB.prepare('SELECT * FROM players WHERE tg_id=?1').bind(b).first();
      if (!them || them.banned) return ({ ok: false, error: 'Соперник не найден' });
      if (!mine) return ({ ok: false, error: 'Сначала поиграй пару минут' });
      const dayStart = Date.parse(mskDay(now) + 'T00:00:00+03:00');
      const used = await env.DB.prepare("SELECT COUNT(*) n FROM duel WHERE a = ?1 AND created_at >= ?2").bind(me, dayStart).first();
      if (used && used.n >= 3) return ({ ok: false, error: 'Сегодня уже три вызова. Завтра ещё три' });
      const rematch = body.rematch ? 1 : 0;
      const pair = await env.DB.prepare("SELECT id, status, winner, rematch, a FROM duel WHERE ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)) AND created_at > ?3 AND status NOT IN ('cancelled','declined','expired') ORDER BY created_at DESC LIMIT 3").bind(me, b, now - DAY).all();
      const pr = pair.results || [];
      if (pr.some(x => ['a_play', 'open', 'b_play'].includes(x.status))) return ({ ok: false, error: 'С этой кофейней уже идёт дуэль' });
      if (pr.length) { const last = pr[0]; const canRe = rematch && last.status === 'done' && last.winner && last.winner !== me && !pr.some(x => x.rematch && x.a === me);
        if (!canRe) return ({ ok: false, error: 'Эту кофейню можно вызвать раз в сутки' }); }
      const stake=Number(body.stake);if(!Number.isSafeInteger(stake)||stake<0)return {ok:false,error:'Некорректная ставка'};
      if (stake) { const max = Math.floor(Math.min((mine.money || 0) * 0.25, (them.money || 0)*0.5) / 1000) * 1000; if (stake < MIN_STAKE) return ({ ok: false, error: 'Ставка от 25 000 ₽' }); if (stake > max) return ({ ok: false, error: 'Ставка не больше ' + fmt(max) + ' ₽' }); }
        return {ok:true,them,stake,dayStart};
      });
      return receipt.ok?json({...receipt,receipt}):json(receipt,409);
    }
    if (body.op === 'submit') {
      const d = await env.DB.prepare('SELECT * FROM duel WHERE id = ?1').bind(Number(body.id) || 0).first();
      if (!d) return json({ ok: false, error: 'Дуэль не найдена' });
      const side=d.a===me?'a':d.b===me?'b':null;const player=await env.DB.prepare('SELECT * FROM players WHERE tg_id=?1').bind(me).first();if(!side||!identityMatches(player,d,side))return json({ok:false,error:'Эта дуэль относится к другой кофейне'},409);
      const sc = scoreDuel(d.seed, body.ans, body.ms), det = JSON.stringify(sc.det);
      if (d.a === me && d.status === 'a_play') {
        if (now - d.created_at > PLAY_WIN) return json({ ok: false, error: 'Время на игру вышло' });
        const u = await env.DB.prepare("UPDATE duel SET status = 'open', a_score = ?2, a_det = ?3, a_at = ?4 WHERE id = ?1 AND status = 'a_play'").bind(d.id, sc.total, det, now).run();
        if (!u.meta.changes) return json({ ok: false, error: 'Уже отправлено' });
        await dm(env, d.b, `Тебя вызвали на дуэль «Помнить заказ».\nКофейня «${escH(d.a_cafe)}»${d.stake ? ' ставит ' + fmt(d.stake) + ' ₽' : ' играет на интерес'}${d.rematch ? ' и хочет реванш' : ''}.\nНа ответ сутки.`);
        return json({ ok: true, score: sc.total, det: sc.det, wait: true });
      }
      if (d.b === me && d.status === 'b_play') {
        const late=now-d.b_start>PLAY_WIN;
        const out = await resolve(env, origin, d, late?0:sc.total, late?'[]':det, now);
        if (!out) return json({ ok: false, error: 'Уже отправлено' });
        return json({ ok: true, score: out.b, det: late?[]:sc.det, their: d.a_score, theirDet: JSON.parse(d.a_det || '[]'), win: out.win === me ? 'win' : out.win ? 'lose' : 'draw', prize: out.prize, r: out.rB });
      }
      return json({ ok: false, error: 'Сейчас не твой ход' });
    }
    if(body.op==='decline'||body.op==='cancel'){
      const d=await env.DB.prepare('SELECT * FROM duel WHERE id=?1').bind(Number(body.id)||0).first();
      const side=body.op==='cancel'?'a':'b';
      const p=await env.DB.prepare('SELECT * FROM players WHERE tg_id=?1').bind(me).first();
      if(!d||d[side]!==me||!identityMatches(p,d,side)||!['a_play','open'].includes(d.status))return json({ok:false,error:'Вызов уже недоступен'},409);
      await closeDuel(env,d,body.op==='cancel'?'cancelled':'declined','Ставка вернулась: вызов отменён',now);
      return json({ok:true});
    }
    return json({ ok: false, error: 'Неизвестное действие' });
  } catch (e) { return json({ ok: false, error: 'Что-то сломалось. Попробуй позже' }); }
}

async function framesOf(env, rows) { const want = []; for (const r of rows) { let fr = null; try { fr = JSON.parse(r.snap || '{}').fr; } catch {} if (fr && /^[a-z]{2,10}$/.test(fr)) want.push([r.tg_id, fr]); }
  const out = {}; if (!want.length) return out;
  const got = (await env.DB.prepare(`SELECT tg_id, item FROM purchases WHERE refunded = 0 AND item LIKE 'frame_%' AND tg_id IN (${[...new Set(want.map(w => Number(w[0])))].join(',')})`).all()).results || [];
  for (const [id, fr] of want) if (got.some(g => g.tg_id === id && g.item === 'frame_' + fr)) out[id] = fr; return out; }
