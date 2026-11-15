// Режим техработ: в cache.maint лежит JSON {on, text, at, by}. Админы играют как обычно.
export const MAINT_TEXT = 'Сейчас идут технические работы. Скоро вернёмся, следи за новостями в канале.';
export async function getMaint(env) {
  try { const r = await env.DB.prepare("SELECT val FROM cache WHERE key = 'maint'").first(); if (!r) return { on: false, text: MAINT_TEXT };
    const m = JSON.parse(r.val); return { on: !!m.on, text: m.text || MAINT_TEXT, at: m.at || null }; } catch { return { on: false, text: MAINT_TEXT }; }
}
export async function setMaint(env, patch, by) {
  const cur = await getMaint(env); const m = { ...cur, ...patch, by, at: patch.on !== undefined && patch.on !== cur.on ? Date.now() : cur.at };
  await env.DB.prepare("INSERT INTO cache (key, val, at) VALUES ('maint', ?1, ?2) ON CONFLICT(key) DO UPDATE SET val = ?1, at = ?2").bind(JSON.stringify(m), Date.now()).run();
  return m;
}
