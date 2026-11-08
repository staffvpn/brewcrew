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
    CREATE TABLE days (day TEXT, tg_id INTEGER, PRIMARY KEY (day, tg_id));
    CREATE TABLE market(id INTEGER PRIMARY KEY AUTOINCREMENT,seller INTEGER,seller_cafe TEXT,staff TEXT,price INTEGER,status TEXT,created_at INTEGER,buyer INTEGER,buyer_cafe TEXT,sold_at INTEGER);
    CREATE TABLE admin_ops(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id INTEGER,op TEXT,amount REAL,text TEXT,created_at INTEGER,by_admin INTEGER,applied_at INTEGER);`);
  sql.exec("INSERT INTO players (tg_id, franchises, cafe, earned, created_at, level, money, rooms, best_day, snap) VALUES (12345, 0, 'Старая кофейня', 10000000, 1, 12, 1000000, 2, 500000, '{}')");
  sql.exec(require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../migrations/0001_market_transactions.sql'),'utf8'));
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

module.exports={database,initData,token};
