const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const token = 'local-test-token';
function initData(id = 12345) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now()/1000)), user: JSON.stringify({ id, first_name: 'Test' }) });
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE players (tg_id INTEGER PRIMARY KEY, franchises INTEGER, cafe TEXT, earned REAL, created_at INTEGER, level INTEGER, money REAL, rooms INTEGER, best_day REAL, snap TEXT, username TEXT, first_name TEXT, lang TEXT, last_seen INTEGER, sessions INTEGER DEFAULT 0, city TEXT, bankrupt INTEGER, play_seconds INTEGER DEFAULT 0, referrer INTEGER, badge_name TEXT, banned INTEGER DEFAULT 0);
    CREATE TABLE season (season TEXT, tg_id INTEGER, sp INTEGER, cafe TEXT, city TEXT, first_name TEXT, badge INTEGER, updated_at INTEGER, PRIMARY KEY (season, tg_id));
    CREATE TABLE tour (week TEXT, tg_id INTEGER, profit REAL);
    CREATE TABLE cache (key TEXT PRIMARY KEY, val TEXT, at INTEGER);
    CREATE TABLE days (day TEXT, tg_id INTEGER, PRIMARY KEY (day, tg_id));`);
  sql.exec("INSERT INTO players (tg_id, franchises, cafe, earned, created_at, level, money, rooms, best_day, snap) VALUES (12345, 0, 'Старая кофейня', 30000000, 1, 12, 1000000, 2, 500000, '{}')");
  const wrap = (text, args = []) => ({
    bind: (...values) => wrap(text, values),
    first: async () => sql.prepare(text).get(...args) || null,
    all: async () => ({ results: sql.prepare(text).all(...args) }),
    run: async () => { const r = sql.prepare(text).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  const DB = { prepare: text => wrap(text), batch: async statements => {
    sql.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); sql.exec('COMMIT'); return results; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  } };
  return { sql, env: { DB, BOT_TOKEN: token } };
}
async function sell(env, fields = {}) {
  const { onRequestPost } = await import('../functions/api/franchise.js');
  const request = new Request('https://test.invalid/api/franchise', { method: 'POST', body: JSON.stringify({ initData: initData(), franchises: 0, name: 'Новая кофейня', ...fields }) });
  const response = await onRequestPost({ request, env });
  return { status: response.status, body: await response.json() };
}
test('sale atomically resets current rankings and returns one recoverable receipt', async () => {
  const { sql, env } = database();
  const { sezId } = await import('../functions/_lib.js');
  const { tourWeek } = await import('../functions/_channel.js');
  sql.prepare('INSERT INTO season (season, tg_id, sp) VALUES (?, 12345, 9000)').run(sezId());
  sql.prepare('INSERT INTO tour VALUES (?, 12345, 1000000)').run(tourWeek());
  sql.prepare('INSERT INTO cache VALUES (?, ?, 0)').run('sz_' + sezId(), '{}');
  sql.prepare('INSERT INTO cache VALUES (?, ?, 0)').run('top_' + tourWeek(), '{}');
  const first = await sell(env);
  assert.equal(first.status, 200); assert.equal(first.body.shares, 10);
  assert.equal(first.body.franchises, 1);
  const row = sql.prepare('SELECT * FROM players WHERE tg_id=12345').get();
  assert.equal(row.cafe, 'Новая кофейня'); assert.equal(row.level, 1); assert.equal(row.best_day, 0); assert.equal(row.earned, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM season').get().n, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM tour').get().n, 0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM cache WHERE key LIKE 'sz_%' OR key LIKE 'top_%'").get().n, 0);
  const retry = await sell(env);
  assert.deepEqual(retry.body, first.body);
  assert.equal(sql.prepare('SELECT franchises FROM players').get().franchises, 1);
  const { onRequestPost } = await import('../functions/api/track.js');
  const stale = await onRequestPost({ request: new Request('https://test.invalid/api/track', { method: 'POST', body: JSON.stringify({ initData: initData(), stats: { franchises: 0, cafe: 'Старая кофейня', sp: 9000 } }) }), env });
  assert.equal(stale.status, 409); assert.equal((await stale.json()).error, 'stale_run');
  assert.equal(sql.prepare('SELECT cafe FROM players').get().cafe, 'Новая кофейня');
  sql.close();
});
async function track(env, stats) {
  const { onRequestPost } = await import('../functions/api/track.js');
  const response = await onRequestPost({ request: new Request('https://test.invalid/api/track', { method: 'POST', body: JSON.stringify({ initData: initData(), stats }) }), env, waitUntil: promise => promise.catch(() => {}) });
  return { status: response.status, body: await response.json() };
}
test('new run enters rankings at zero and stale run cannot overwrite it', async () => {
  const { sql, env } = database();
  const { sezId } = await import('../functions/_lib.js');
  await sell(env);
  const fresh = await track(env, { franchises: 1, cafe: 'Новая кофейня', level: 1, sp: 0, sz: sezId(), earned: 0 });
  assert.equal(fresh.status, 200);
  assert.equal(sql.prepare('SELECT cafe FROM season').get().cafe, 'Новая кофейня');
  assert.equal(sql.prepare('SELECT sp FROM season').get().sp, 0);
  assert.equal((await track(env, { franchises: 0, cafe: 'Старая кофейня', sp: 9000, sz: sezId() })).status, 409);
  assert.equal(sql.prepare('SELECT sp FROM season').get().sp, 0);
  sql.close();
});
test('conditional tracking write rejects a request racing with a sale', async () => {
  const { sql, env } = database();
  const batch = env.DB.batch;
  env.DB.batch = statements => { sql.exec("UPDATE players SET franchises=1, cafe='Новая кофейня'"); return batch(statements); };
  assert.equal((await track(env, { franchises: 0, cafe: 'Старая кофейня' })).status, 409);
  assert.equal(sql.prepare('SELECT cafe FROM players').get().cafe, 'Новая кофейня');
  sql.close();
});
test('sale rejects insufficient revenue, reused names, bad auth and skipped versions', async () => {
  const { sql, env } = database();
  assert.equal((await sell(env, { initData: 'invalid' })).status, 401);
  assert.equal((await sell(env, { name: ' старая КОФЕЙНЯ ' })).status, 400);
  assert.equal((await sell(env, { franchises: 2 })).status, 409);
  sql.exec('UPDATE players SET earned=29999999');
  assert.equal((await sell(env)).status, 409);
  assert.equal(sql.prepare('SELECT franchises FROM players').get().franchises, 0);
  sql.close();
});
test('a failed sale transaction leaves the old cafe and version intact', async () => {
  const { sql, env } = database();
  sql.exec('DROP TABLE tour');
  await assert.rejects(() => sell(env));
  const row = sql.prepare('SELECT cafe, franchises, earned FROM players').get();
  assert.equal(row.cafe, 'Старая кофейня'); assert.equal(row.franchises, 0); assert.equal(row.earned, 30000000);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM cache').get().n, 0);
  sql.close();
});
test('late seasonal write cannot restore a ranking after the sale has reset it', async () => {
  const { sql, env } = database();
  const { sezId } = await import('../functions/_lib.js');
  const prepare = env.DB.prepare;
  env.DB.prepare = text => {
    if (text.startsWith('INSERT INTO season')) sql.exec("UPDATE players SET franchises=1, cafe='Новая кофейня'; DELETE FROM season");
    return prepare(text);
  };
  await track(env, { franchises: 0, cafe: 'Старая кофейня', sp: 9000, sz: sezId() });
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM season').get().n, 0);
  assert.equal(sql.prepare('SELECT cafe FROM players').get().cafe, 'Новая кофейня');
  sql.close();
});
