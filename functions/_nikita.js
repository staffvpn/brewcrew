// Шифр Никиты: еженедельный квест. Ключ из двух слогов: первый у кота Фили в игре, второй в посте канала.
// Ответы живут только на сервере. Неделя начинается в четверг в 12:00 МСК.
import { ADMINS, mskDay } from './_lib.js';

export const NK_START = Date.parse('2026-11-19T12:00:00+03:00');
const WEEK = 7 * 86400000;
const ABC = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';

export const CIPHERS = [
  { s1: 'ФИ', s2: 'ЛЯ', riddle: 'БЕЗ МЕНЯ НЕТ НИ ЛАТТЕ, НИ КАПУЧИНО, А ФИЛЯ МЕНЯ БОИТСЯ И ШИПИТ В ОТВЕТ', answers: ['ПАР'] },
  { s1: 'МО', s2: 'КА', riddle: 'МЕНЯ ТРАМБУЮТ КАЖДОЕ УТРО, А Я ВСЁ РАВНО ДЕРЖУ ФОРМУ. ПОСЛЕ РАБОТЫ МЕНЯ ВЫБИВАЮТ', answers: ['ТАБЛЕТКА', 'КОФЕЙНАЯТАБЛЕТКА'] },
  { s1: 'ЛУН', s2: 'ГО', riddle: 'У МЕНЯ ЕСТЬ НОСИК, НО Я НЕ НЮХАЮ. ИЗ МЕНЯ РИСУЮТ СЕРДЦА И ЛЕБЕДЕЙ', answers: ['ПИТЧЕР', 'МОЛОЧНИК'] },
  { s1: 'ЛАТ', s2: 'ТЕ', riddle: 'ЧЕМ ДОЛЬШЕ МЕНЯ ТЯНУТ, ТЕМ ГОРЬЧЕ ЧАШКА. БАРИСТА СЧИТАЕТ МЕНЯ В СЕКУНДАХ', answers: ['ЭКСТРАКЦИЯ'] },
  { s1: 'ДЖЕЗ', s2: 'ВА', riddle: 'Я МЕЛЮ, НО НЕ БОЛТАЮ. ОТ МОИХ ЖЕРНОВОВ ЗАВИСИТ ВКУС', answers: ['КОФЕМОЛКА', 'ГРАЙНДЕР', 'МОЛКА'] },
  { s1: 'ПУ', s2: 'ЭР', riddle: 'НА МНЕ РИСУЮТ, НО НЕ КИСТЬЮ. Я ГУСТАЯ, БЕЛАЯ И ЖИВУ НЕДОЛГО', answers: ['ПЕНА', 'МОЛОЧНАЯПЕНА'] },
  { s1: 'ТУР', s2: 'КА', riddle: 'ЗЕЛЁНЫМ МЕНЯ НЕ ПЬЮТ, А ПОСЛЕ ОГНЯ ЖДУТ КАЖДОЕ УТРО', answers: ['ЗЕРНО', 'КОФЕЙНОЕЗЕРНО'] },
  { s1: 'КО', s2: 'ФЕ', riddle: 'МЕНЯ ДЕЛАЮТ ДВАЖДЫ, А ПЬЮТ ОДИН РАЗ. ПО-ИТАЛЬЯНСКИ МОЁ ИМЯ ЗНАЧИТ ДВОЙНОЙ', answers: ['ДОППИО'] }
];

const norm = s => String(s || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, '');
export function vig(text, key, dir) {
  const k = norm(key); if (!k) return text; let j = 0;
  return String(text).replace(/Ё/g, 'Е').split('').map(ch => { const i = ABC.indexOf(ch); if (i < 0) return ch; const s = ABC.indexOf(k[j++ % k.length]); return ABC[(i + dir * s + 64) % 32]; }).join('');
}
export function nkWeek(ts = Date.now()) { if (ts < NK_START) return -1; return Math.floor((ts - NK_START) / WEEK); }
export function nkCipher(w) { const c = CIPHERS[((w % CIPHERS.length) + CIPHERS.length) % CIPHERS.length]; return { ...c, text: vig(c.riddle, c.s1 + c.s2, 1), starts: NK_START + w * WEEK, ends: NK_START + (w + 1) * WEEK }; }
export function nkLive(uid) { return Date.now() >= NK_START || ADMINS.includes(uid); }

async function ensure(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS nk_solve (w INTEGER NOT NULL, tg_id INTEGER NOT NULL, at INTEGER NOT NULL, rank INTEGER, PRIMARY KEY (w, tg_id))').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS nk_try (w INTEGER NOT NULL, tg_id INTEGER NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (w, tg_id, day))').run();
}
const TRIES = 3;

export async function nkState(env, uid) {
  if (!nkLive(uid)) return { ok: true, live: false };
  await ensure(env);
  const w = Math.max(0, nkWeek()); const c = nkCipher(w); const day = mskDay();
  const sol = await env.DB.prepare('SELECT rank FROM nk_solve WHERE w = ?1 AND tg_id = ?2').bind(w, uid).first();
  const tr = await env.DB.prepare('SELECT n FROM nk_try WHERE w = ?1 AND tg_id = ?2 AND day = ?3').bind(w, uid, day).first();
  const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM nk_solve WHERE w = ?1').bind(w).first();
  return { ok: true, live: true, w, text: c.text, s1: c.s1, keyLen: (c.s1 + c.s2).length, ends: c.ends, solved: sol ? sol.rank : 0, left: Math.max(0, TRIES - (tr ? tr.n : 0)), solvers: cnt ? cnt.n : 0 };
}

export async function nkAnswer(env, uid, answer) {
  const st = await nkState(env, uid); if (!st.live) return { ok: false, error: 'Шифр ещё не открыт' };
  if (st.solved) return { ok: true, already: true, rank: st.solved };
  if (st.left <= 0) return { ok: false, error: 'Попытки на сегодня кончились. Завтра будет ещё три', left: 0 };
  const w = st.w, day = mskDay(), c = nkCipher(w);
  await env.DB.prepare('INSERT INTO nk_try (w, tg_id, day, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(w, tg_id, day) DO UPDATE SET n = n + 1').bind(w, uid, day).run();
  if (!c.answers.map(norm).includes(norm(answer))) return { ok: false, wrong: true, error: 'Не то слово', left: st.left - 1 };
  const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM nk_solve WHERE w = ?1').bind(w).first();
  const rank = (cnt ? cnt.n : 0) + 1;
  await env.DB.prepare('INSERT OR IGNORE INTO nk_solve (w, tg_id, at, rank) VALUES (?1, ?2, ?3, ?4)').bind(w, uid, Date.now(), rank).run();
  const got = await env.DB.prepare('SELECT rank FROM nk_solve WHERE w = ?1 AND tg_id = ?2').bind(w, uid).first();
  return { ok: true, rank: got ? got.rank : rank, top: (got ? got.rank : rank) <= 10 };
}

export async function nkTop(env, w, limit = 10) {
  await ensure(env);
  const r = await env.DB.prepare('SELECT s.rank, s.tg_id, p.cafe, p.first_name, p.username FROM nk_solve s LEFT JOIN players p ON p.tg_id = s.tg_id WHERE s.w = ?1 ORDER BY s.rank LIMIT ?2').bind(w, limit).all();
  return (r && r.results) || [];
}
