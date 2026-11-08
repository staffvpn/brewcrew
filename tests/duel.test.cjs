const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,initData}=require('./helpers/d1.cjs');
const fetchOriginal=global.fetch;
before(()=>{global.fetch=async()=>({json:async()=>({ok:true,result:{username:'local_test_bot'}})});});
after(()=>{global.fetch=fetchOriginal;});
const a=12345,b=24680,pid=id=>(id*3+7).toString(36);
function fixture(){const f=database();f.sql.exec("INSERT INTO players(tg_id,franchises,cafe,money,earned,level,created_at) VALUES(24680,0,'Соперник',500000,0,8,2);INSERT INTO market_accounts(tg_id,franchises) VALUES(24680,0)");return f;}
async function call(env,id,body){const {onRequestPost}=await import('../functions/api/duel.js');const r=await onRequestPost({env,request:new Request('https://test.invalid/api/duel',{method:'POST',body:JSON.stringify({initData:initData(id),...body})})});return{status:r.status,body:await r.json()};}
const create={op:'new',pid:pid(b),stake:50000,operationId:'duel_create_1',franchises:0,version:0};
async function funded(f){const r=await call(f.env,a,create);assert.equal(r.body.ok,true);return r.body;}
async function accepting(f,d){f.sql.prepare("UPDATE duel SET status='open',a_at=?,a_score=40 WHERE id=?").run(Date.now(),d.id);const r=await call(f.env,b,{op:'accept',id:d.id,operationId:'duel_accept_1',franchises:0,version:0});assert.equal(r.body.ok,true);return r.body;}
async function sell(env,uid=a){const{onRequestPost}=await import('../functions/api/franchise.js');const r=await onRequestPost({env,request:new Request('https://test.invalid/api/franchise',{method:'POST',body:JSON.stringify({initData:initData(uid),name:'Новая сеть',franchises:0})})});return{status:r.status,body:await r.json()};}

test('duel stakes debit both server balances once and return durable receipts',async()=>{
 const f=fixture(),d=await funded(f);assert.equal(d.receipt.op,'duel_stake');assert.equal(f.sql.prepare('SELECT money FROM players WHERE tg_id=?').get(a).money,950000);
 assert.deepEqual((await call(f.env,a,create)).body,d);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM duel').get().n,1);
 const accepted=await accepting(f,d);assert.equal(f.sql.prepare('SELECT money FROM players WHERE tg_id=?').get(b).money,450000);
 assert.deepEqual((await call(f.env,b,{op:'accept',id:d.id,operationId:'duel_accept_1',franchises:0,version:0})).body,accepted);
 assert.equal(f.sql.prepare('SELECT version FROM market_accounts WHERE tg_id=?').get(b).version,1);f.sql.close();
});
test('a lost duel answer is recovered through the shared receipt endpoint',async()=>{
 const f=fixture(),d=await funded(f);const{onRequestPost}=await import('../functions/api/market.js');
 const r=await onRequestPost({env:f.env,request:new Request('https://test.invalid/api/market',{method:'POST',body:JSON.stringify({initData:initData(a),op:'get',version:0})})});const body=await r.json();
 assert.equal(body.version,1);assert.equal(body.operations[0].op,'duel_stake');assert.equal(body.operations[0].id,d.id);
 const list=await call(f.env,a,{op:'list'});assert.equal(list.body.playing[0].id,d.id);assert.equal(list.body.playing[0].guests.length,5);f.sql.close();
});
test('old clients, forged amounts, wrong runs and reused receipts cannot place stakes',async()=>{
 const f=fixture();assert.equal((await call(f.env,a,{op:'new',pid:pid(b),stake:50000})).body.ok,false);
 for(const stake of [-1,1.1,100000000])assert.equal((await call(f.env,a,{...create,stake})).body.ok,false);
 assert.equal((await call(f.env,a,{...create,franchises:1})).body.ok,false);
 await funded(f);assert.equal((await call(f.env,a,{...create,stake:25000})).body.ok,false);f.sql.close();
});
test('insufficient funds at acceptance do not change the duel or account version',async()=>{
 const f=fixture(),d=await funded(f);f.sql.prepare("UPDATE duel SET status='open',a_at=? WHERE id=?").run(Date.now(),d.id);f.sql.prepare('UPDATE players SET money=1 WHERE tg_id=?').run(b);
 const r=await call(f.env,b,{op:'accept',id:d.id,operationId:'duel_accept_1',franchises:0,version:0});assert.equal(r.body.ok,false);
 assert.equal(f.sql.prepare('SELECT status FROM duel').get().status,'open');assert.equal(f.sql.prepare('SELECT version FROM market_accounts WHERE tg_id=?').get(b).version,0);f.sql.close();
});
test('a failure while creating a duel rolls back debit, receipt and version together',async()=>{
 const f=fixture();f.sql.exec("CREATE TRIGGER duel_fail BEFORE INSERT ON duel BEGIN SELECT RAISE(ABORT,'test rollback'); END");
 const r=await call(f.env,a,create);assert.equal(r.body.ok,false);assert.equal(f.sql.prepare('SELECT money FROM players WHERE tg_id=?').get(a).money,1000000);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM market_operations').get().n,0);assert.equal(f.sql.prepare('SELECT version FROM market_accounts WHERE tg_id=?').get(a).version,0);f.sql.close();
});
test('a losing concurrent retry cannot reuse a completed attempt as a write gate',async()=>{
 const f=fixture();const p=f.sql.prepare('SELECT * FROM players WHERE tg_id=?').get(a),account=f.sql.prepare('SELECT * FROM market_accounts WHERE tg_id=?').get(a);
 const first=await funded(f),prepare=f.env.DB.prepare;let hide=true;
 f.env.DB.prepare=q=>{const st=prepare(q),bind=st.bind;st.bind=(...args)=>{const bound=bind(...args);
  if(q==='SELECT request,result FROM market_operations WHERE operation_id=?1 AND tg_id=?2'&&hide){hide=false;bound.first=async()=>null;}
  if(q==='SELECT * FROM players WHERE tg_id=?1'&&args[0]===a)bound.first=async()=>p;
  if(q==='SELECT * FROM market_accounts WHERE tg_id=?1')bound.first=async()=>account;
  return bound;};return st;};
 const {stakeDuel}=await import('../functions/_duelmoney.js');const them=f.sql.prepare('SELECT * FROM players WHERE tg_id=?').get(b);
 const second=await stakeDuel(f.env,a,create,Date.now(),async()=>({ok:true,them,stake:50000,dayStart:0}));
 assert.equal(second.transactionId,first.receipt.transactionId);assert.equal(f.sql.prepare('SELECT money FROM players WHERE tg_id=?').get(a).money,950000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM duel').get().n,1);f.sql.close();
});
test('settlement pays one prize and increments Elo and win counters once',async()=>{
 const f=fixture(),d=await funded(f);await accepting(f,d);const row=f.sql.prepare('SELECT * FROM duel').get();const{settleDuel}=await import('../functions/_duelmoney.js');
 const first=await settleDuel(f.env,row,30,'{}',Date.now());assert.equal(first.win,a);assert.equal(first.prize,90000);
 assert.equal(await settleDuel(f.env,row,30,'{}',Date.now()),null);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM admin_ops WHERE op='duelpay'").get().n,1);assert.equal(f.sql.prepare('SELECT amount FROM admin_ops').get().amount,90000);
 assert.equal(f.sql.prepare('SELECT duel_w FROM players WHERE tg_id=?').get(a).duel_w,1);f.sql.close();
});
test('failed settlement does not mark the game done or lose its payout',async()=>{
 const f=fixture(),d=await funded(f);await accepting(f,d);const row=f.sql.prepare('SELECT * FROM duel').get();const{settleDuel}=await import('../functions/_duelmoney.js');
 f.sql.exec("CREATE TRIGGER prize_fail BEFORE INSERT ON admin_ops BEGIN SELECT RAISE(ABORT,'test rollback'); END");await assert.rejects(()=>settleDuel(f.env,row,30,'{}',Date.now()));
 assert.equal(f.sql.prepare('SELECT status FROM duel').get().status,'b_play');assert.equal(f.sql.prepare('SELECT duel_w FROM players WHERE tg_id=?').get(a).duel_w,0);
 f.sql.exec('DROP TRIGGER prize_fail');assert.ok(await settleDuel(f.env,row,30,'{}',Date.now()));f.sql.close();
});
test('draw returns both stakes, cancellation returns only the caller stake and neither repeats',async()=>{
 const f=fixture(),d=await funded(f);const{closeDuel}=await import('../functions/_duelmoney.js');const row=f.sql.prepare('SELECT * FROM duel').get();
 assert.equal(await closeDuel(f.env,row,'cancelled','Отмена',Date.now()),true);assert.equal(await closeDuel(f.env,row,'cancelled','Отмена',Date.now()),false);assert.equal(f.sql.prepare('SELECT SUM(amount) n FROM admin_ops').get().n,50000);f.sql.close();
 const g=fixture(),e=await funded(g);await accepting(g,e);const{settleDuel}=await import('../functions/_duelmoney.js');await settleDuel(g.env,g.sql.prepare('SELECT * FROM duel').get(),40,'{}',Date.now());
 assert.equal(g.sql.prepare('SELECT COUNT(*) n,SUM(amount) s FROM admin_ops').get().n,2);assert.equal(g.sql.prepare('SELECT SUM(amount) s FROM admin_ops').get().s,100000);g.sql.close();
});
test('late prizes cannot reach a recreated account or restore its rating',async()=>{
 const f=fixture(),d=await funded(f);await accepting(f,d);const row=f.sql.prepare('SELECT * FROM duel').get();f.sql.prepare('UPDATE players SET created_at=999,duel_r=1000 WHERE tg_id=?').run(a);
 const{settleDuel}=await import('../functions/_duelmoney.js');await settleDuel(f.env,row,30,'{}',Date.now());
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM admin_ops WHERE tg_id=?').get(a).n,0);assert.equal(f.sql.prepare('SELECT duel_w FROM players WHERE tg_id=?').get(a).duel_w,0);f.sql.close();
});
test('sale requires finishing a funded outgoing duel, and clears its old payout after cancellation',async()=>{
 const f=fixture(),d=await funded(f);f.sql.exec('UPDATE market_operations SET applied_at=1');assert.equal((await sell(f.env)).status,409);
 assert.equal((await call(f.env,a,{op:'cancel',id:d.id})).body.ok,true);f.sql.prepare('UPDATE players SET duel_r=1200,duel_w=2 WHERE tg_id=?').run(a);
 assert.equal((await sell(f.env)).status,200);assert.equal(f.sql.prepare('SELECT duel_r FROM players WHERE tg_id=?').get(a).duel_r,1000);assert.ok(f.sql.prepare("SELECT applied_at FROM admin_ops WHERE op='duelpay'").get().applied_at);f.sql.close();
});
test('incoming challenges cannot block a sale; their caller is refunded once',async()=>{
 const f=fixture();const d=await call(f.env,b,{...create,pid:pid(a),operationId:'incoming_duel_1'});assert.equal(d.body.ok,true);
 assert.equal((await sell(f.env)).status,200);assert.equal((await sell(f.env)).status,200);
 assert.equal(f.sql.prepare('SELECT status FROM duel').get().status,'declined');assert.equal(f.sql.prepare('SELECT COUNT(*) n,SUM(amount) s FROM admin_ops WHERE tg_id=?').get(b).n,1);f.sql.close();
});

test('cancelling challenges cannot bypass the three-per-day limit',async()=>{
 const f=fixture();for(let i=0;i<3;i++){
  const r=await call(f.env,a,{...create,operationId:'duel_quota_'+i,version:i});assert.equal(r.body.ok,true);
  assert.equal((await call(f.env,a,{op:'cancel',id:r.body.id})).body.ok,true);
 }
 assert.equal((await call(f.env,a,{...create,operationId:'duel_quota_4',version:3})).body.ok,false);f.sql.close();
});

test('a legacy client creating a round during deployment gets the correct account identities',async()=>{
 const f=fixture();f.sql.prepare("INSERT INTO duel(a,b,a_cafe,b_cafe,stake,seed,status,created_at) VALUES(?,?,'Старая','Вторая',50000,42,'a_play',?)").run(a,b,Date.now());
 const d=f.sql.prepare('SELECT * FROM duel').get();assert.equal(d.a_created,1);assert.equal(d.b_created,2);
 const{closeDuel}=await import('../functions/_duelmoney.js');assert.equal(await closeDuel(f.env,d,'cancelled','Возврат',Date.now()),true);assert.equal(f.sql.prepare('SELECT amount FROM admin_ops').get().amount,50000);f.sql.close();
});
