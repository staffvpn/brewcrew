import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {onRequestPost} from '../functions/api/admin-test.js';
import {onRequestPost as purchases} from '../functions/api/purchases.js';
import {ADMINS,SHOP} from '../functions/_lib.js';
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE cache(key TEXT PRIMARY KEY,val TEXT,at INTEGER);CREATE TABLE purchases(charge_id TEXT PRIMARY KEY,tg_id INTEGER,item TEXT,stars INTEGER,created_at INTEGER,expires_at INTEGER,refunded INTEGER DEFAULT 0);CREATE TABLE admin_ops(tg_id INTEGER,op TEXT,amount INTEGER,text TEXT,created_at INTEGER,by_admin INTEGER);`);
const DB={prepare(q){return{bind(...args){return{first:async()=>sql.prepare(q).get(...args)||null,all:async()=>({results:sql.prepare(q).all(...args)}),run:()=>sql.prepare(q).run(...args)}}}},async batch(stmts){sql.exec('BEGIN');try{for(const s of stmts)s.run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={BOT_TOKEN:'test-token',DB};
function signed(id,age=0){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)-age),user:JSON.stringify({id})});const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const key=createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();p.set('hash',createHmac('sha256',key).update(check).digest('hex'));return p.toString();}
async function call(data,id=ADMINS[0],extraEnv={},handler=onRequestPost){const r=await handler({request:new Request('https://test/api/admin-test',{method:'POST',body:JSON.stringify({initData:signed(id),...data})}),env:{...env,...extraEnv}});return{status:r.status,...await r.json()};}
assert.equal((await call({kind:'status'})).adminTest,true);
assert.equal((await call({kind:'status'},123)).adminTest,false);
assert.equal((await call({kind:'premium',item:'cash_s',adminTest:true},123)).status,403);
assert.equal((await call({kind:'skin',category:'floor',id:'marble'},ADMINS[0],{ADMIN_TEST_PURCHASES:'0'})).status,403);
for(const initData of ['forged',signed(ADMINS[0],8*86400)])assert.equal((await call({kind:'premium',item:'cash_s',initData})).status,401);
for(const data of [{kind:'premium',item:'__proto__'},{kind:'premium',item:'city_corner'},{kind:'premium',item:'lux_d_jukebox'},{kind:'skin',category:'decor',id:'d_monstera'},{kind:'skin',category:'table',id:'t_square'},{kind:'skin',category:'floor',id:'forged'},{kind:'upgrade',id:'machine',count:21},{kind:'premium',item:'cash_s',to:123}])assert.equal((await call(data)).status,400);
for(const data of [{kind:'skin',category:'barmat',id:'sink'},{kind:'skin',category:'backfloor',id:'hex'},{kind:'upgrade',id:'machine',count:20}])assert.equal((await call(data)).ok,true);
for(const item of ['lux_x_cat','frame_coffee_copper','sub_owner','pass15','starter','cash_s','rename']){assert.equal((await call({kind:'premium',item})).ok,true);assert.equal((await call({kind:'premium',item})).ok,true);}
assert.equal((await call({kind:'skin',category:'style',id:'int_autumn'})).ok,true);
assert.equal(sql.prepare("SELECT count(*) n FROM purchases WHERE item='starter'").get().n,1);
assert.equal(sql.prepare("SELECT count(*) n FROM purchases WHERE item='cash_s'").get().n,2);
assert.equal(sql.prepare('SELECT count(*) n FROM admin_ops').get().n,3);
assert.equal(sql.prepare('SELECT sum(stars) n FROM purchases').get().n,0);
const ent=await call({},ADMINS[0],{},purchases);assert(ent.lux.includes('x_cat'));assert(ent.frames.includes('frame_coffee_copper'));assert(ent.interiors.includes('int_autumn'));assert(ent.sub>Date.now());assert.equal(ent.renames,2);assert.equal(ent.passes.length,2);assert.equal(ent.passes.filter(p=>p.full).length,1);assert(ent.passes.find(p=>p.full).id.startsWith('admin_full:'));assert.equal((await call({},123,{},purchases)).passes.length,0);assert.equal((await call({},ADMINS[0],{ADMIN_TEST_PURCHASES:'0'},purchases)).passes.some(p=>p.full),false);
assert.equal((await call({},123,{},purchases)).lux.length,0);
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!m[1].includes('src='))new vm.Script(m[2]);
assert(!source.includes('window.__MAX')&&!source.includes('CITY940')&&!source.includes('/api/city'));
for(const fragment of ['brewcrew-build','v15-economy-balance-20261116',"pimg('fridge',294.5,146.5,72)","pimg('cam',13,19,12)",'Лера с терьером','bcRubberMat(4,149,66,22)','bcRubberMat(76,149,76,22)','maint_on.jpg','maint_off.jpg'])assert(source.includes(fragment),fragment);
assert.equal(SHOP.lux_x_cat.stars,299);assert.equal(SHOP.cash_s.stars,149);
console.log('PASS: Telegram auth, admin-only self purchases, disable flag, catalogue validation, zero-Star persistence, idempotent grants, cash, styles/lux/frames/pass/subscription entitlements, ordinary players, inline syntax and release invariants.');

assert((await call({kind:'upgrade',id:'ware',count:1},ADMINS[0])).ok,'admin dishware upgrade is available');
