// GET /api/goal — сколько стаканов район уже продал к цели «миллион».
import { json } from '../_lib.js';
import { goalInfo } from '../_goal.js';
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false }, 503);
  try { return json(Object.assign({ ok: true }, await goalInfo(env, true))); } catch { return json({ ok: false }, 500); }
}
