const {test}=require('node:test');
const assert=require('node:assert/strict');
const {database,initData}=require('./helpers/d1.cjs');
const seller=12345,buyer=24680;
const staff={id:'staff_1',name:'Бариста',role:'Бариста',lvl:6,rank:1,quirk:'none',sex:'m',spr:1};
function fixture(roster=[staff]){
  const f=database();
  f.sql.prepare('UPDATE market_accounts SET roster=? WHERE tg_id=?').run(JSON.stringify(roster),seller);
  f.sql.prepare("INSERT INTO players(tg_id,franchises,cafe,money,level,created_at) VALUES(?,0,'Покупатель',500000,8,1)").run(buyer);
  f.sql.prepare('INSERT INTO market_accounts(tg_id,franchises) VALUES(?,0)').run(buyer);
  return f;
}
async function market(env,uid,fields){
  const {onRequestPost}=await import('../functions/api/market.js');
  const response=await onRequestPost({request:new Request('https://test.invalid/api/market',{method:'POST',body:JSON.stringify({initData:initData(uid),franchises:0,version:0,...fields})}),env});
  return{status:response.status,body:await response.json()};
}
async function listed(env){return(await market(env,seller,{op:'list',operationId:'listing_0001',staffId:staff.id,price:100000})).body;}
test('listing and purchase debit once, transfer once, and queue one seller payout',async()=>{
  const{sql,env}=fixture();const list=await listed(env);assert.equal(list.ok,true);assert.equal(list.version,1);
  const request={op:'buy',operationId:'purchase_0001',id:list.id};
  const bought=await market(env,buyer,request);assert.equal(bought.status,200);assert.equal(bought.body.price,100000);
  assert.equal(sql.prepare('SELECT money FROM players WHERE tg_id=?').get(buyer).money,400000);
  assert.equal(JSON.parse(sql.prepare('SELECT roster FROM market_accounts WHERE tg_id=?').get(buyer).roster).length,1);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM admin_ops WHERE op='trsold'").get().n,1);
  assert.equal(sql.prepare("SELECT amount FROM admin_ops WHERE op='trsold'").get().amount,90000);
  assert.deepEqual((await market(env,buyer,request)).body,bought.body);
  assert.equal(sql.prepare('SELECT money FROM players WHERE tg_id=?').get(buyer).money,400000);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM admin_ops WHERE op='trsold'").get().n,1);
  assert.equal((await market(env,buyer,{...request,operationId:'purchase_0002',version:1})).status,409);
  sql.exec("INSERT INTO players(tg_id,franchises,money,cafe) VALUES(33333,0,500000,'Другой покупатель'); INSERT INTO market_accounts(tg_id,franchises) VALUES(33333,0)");
  assert.equal((await market(env,33333,{...request,operationId:'other_buyer_0001'})).status,409);
  assert.equal(sql.prepare('SELECT money FROM players WHERE tg_id=33333').get().money,500000);
  sql.close();
});
test('insufficient funds, own purchases and foreign cancellation leave an open listing intact',async()=>{
  const{sql,env}=fixture();const list=await listed(env);
  assert.equal((await market(env,seller,{op:'buy',id:list.id,operationId:'own_buy_0001',version:1})).status,409);
  assert.equal((await market(env,buyer,{op:'cancel',id:list.id,operationId:'foreign_cancel'})).status,403);
  sql.prepare('UPDATE players SET money=99999 WHERE tg_id=?').run(buyer);
  assert.equal((await market(env,buyer,{op:'buy',id:list.id,operationId:'poor_buy_0001'})).status,409);
  assert.equal(sql.prepare('SELECT status FROM market WHERE id=?').get(list.id).status,'open');
  assert.equal(sql.prepare('SELECT version FROM market_accounts WHERE tg_id=?').get(buyer).version,0);
  sql.close();
});
test('unknown employees cannot be listed and an escrowed employee cannot be listed twice',async()=>{
  const{sql,env}=fixture();
  assert.equal((await market(env,seller,{op:'list',operationId:'fake_list_0001',staffId:'invented',price:100000,staff:{...staff,id:'invented'}})).status,409);
  await listed(env);
  sql.prepare('UPDATE market_accounts SET roster=? WHERE tg_id=?').run(JSON.stringify([staff]),seller);
  assert.equal((await market(env,seller,{op:'list',operationId:'repeat_list_0001',staffId:staff.id,price:100000,version:1})).status,409);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM market').get().n,1);sql.close();
});
test('cancellation returns the original staff once and operation ids cannot be repurposed',async()=>{
  const{sql,env}=fixture();const list=await listed(env);
  const request={op:'cancel',id:list.id,operationId:'cancel_0001',version:1};
  const cancelled=await market(env,seller,request);assert.equal(cancelled.status,200);assert.equal(cancelled.body.staff.id,staff.id);
  assert.deepEqual((await market(env,seller,request)).body,cancelled.body);
  assert.equal(JSON.parse(sql.prepare('SELECT roster FROM market_accounts WHERE tg_id=?').get(seller).roster).length,1);
  assert.equal((await market(env,seller,{...request,id:list.id+1})).status,409);sql.close();
});
test('failed payout rolls back payment, roster, receipt and listing; same request can then succeed',async()=>{
  const{sql,env}=fixture();const list=await listed(env);sql.exec('DROP TABLE admin_ops');
  const request={op:'buy',id:list.id,operationId:'rollback_buy_0001'};
  assert.equal((await market(env,buyer,request)).status,503);
  assert.equal(sql.prepare('SELECT money FROM players WHERE tg_id=?').get(buyer).money,500000);
  assert.equal(sql.prepare('SELECT version FROM market_accounts WHERE tg_id=?').get(buyer).version,0);
  assert.equal(sql.prepare('SELECT status FROM market WHERE id=?').get(list.id).status,'open');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM market_operations WHERE tg_id=?').get(buyer).n,0);
  sql.exec('CREATE TABLE admin_ops(id INTEGER PRIMARY KEY,tg_id INTEGER,op TEXT,amount REAL,text TEXT,created_at INTEGER,by_admin INTEGER,applied_at INTEGER)');
  assert.equal((await market(env,buyer,request)).status,200);sql.close();
});
test('receipt recovery also works after acknowledgement when the client loads an older snapshot',async()=>{
  const{sql,env}=fixture();const list=await listed(env);
  await market(env,buyer,{op:'buy',id:list.id,operationId:'recovery_buy_0001'});
  let get=await market(env,buyer,{op:'get'});assert.equal(get.body.operations.length,1);
  await market(env,buyer,{op:'ack',operationId:'recovery_buy_0001'});
  get=await market(env,buyer,{op:'get'});assert.equal(get.body.operations.length,1);
  get=await market(env,buyer,{op:'get',version:1});assert.equal(get.body.operations.length,0);sql.close();
});
test('stale tracking cannot refund a completed server purchase',async()=>{
  const{sql,env}=fixture();const list=await listed(env);await market(env,buyer,{op:'buy',id:list.id,operationId:'stale_buy_0001'});
  const{onRequestPost}=await import('../functions/api/track.js');
  const response=await onRequestPost({request:new Request('https://test.invalid/api/track',{method:'POST',body:JSON.stringify({initData:initData(buyer),stats:{franchises:0,marketVersion:0,money:500000}})}),env});
  assert.equal(response.status,409);assert.equal((await response.json()).error,'market_sync_required');
  assert.equal(sql.prepare('SELECT money FROM players WHERE tg_id=?').get(buyer).money,400000);sql.close();
});
test('three-listing limit is enforced and a sale requires clearing escrow and receipts',async()=>{
  const roster=[1,2,3,4].map(n=>({...staff,id:'staff_'+n}));const{sql,env}=fixture(roster);
  for(let n=1;n<=3;n++)assert.equal((await market(env,seller,{op:'list',staffId:'staff_'+n,price:100000,version:n-1,operationId:'list_limit_'+n})).status,200);
  assert.equal((await market(env,seller,{op:'list',staffId:'staff_4',price:100000,version:3,operationId:'list_limit_4'})).status,409);
  const{onRequestPost}=await import('../functions/api/franchise.js');
  const response=await onRequestPost({request:new Request('https://test.invalid/api/franchise',{method:'POST',body:JSON.stringify({initData:initData(seller),franchises:0,name:'Новая кофейня'})}),env});
  assert.equal(response.status,409);assert.equal(sql.prepare('SELECT franchises FROM players WHERE tg_id=?').get(seller).franchises,0);sql.close();
});
test('free cancellation remains available even while the cafe is in debt',async()=>{
  const{sql,env}=fixture();const list=await listed(env);sql.prepare('UPDATE players SET money=-1000 WHERE tg_id=?').run(seller);
  assert.equal((await market(env,seller,{op:'cancel',id:list.id,operationId:'debt_cancel_0001',version:1})).status,200);
  assert.equal(sql.prepare('SELECT money FROM players WHERE tg_id=?').get(seller).money,-1000);sql.close();
});
test('account wipe closes listings and removes receipts so a new account cannot replay them',async()=>{
  const{sql,env}=fixture();await listed(env);sql.exec('CREATE TABLE reminders(tg_id INTEGER)');
  const row=sql.prepare("INSERT INTO admin_ops(tg_id,op,amount,created_at) VALUES(?,'wipe',0,0)").run(seller);
  const{ackOps}=await import('../functions/_admin.js');await ackOps(env,seller,[Number(row.lastInsertRowid)]);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM market_operations WHERE tg_id=?').get(seller).n,0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM market WHERE seller=? AND status='open'").get(seller).n,0);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM market_accounts WHERE tg_id=?').get(seller).n,0);sql.close();
});
test('capacity is checked in the destination room, including non-tradable reward staff',async()=>{
  const{sql,env}=fixture();const list=await listed(env);
  sql.prepare('UPDATE players SET level=1,rooms=2 WHERE tg_id=?').run(buyer);
  sql.prepare('UPDATE market_accounts SET roster=? WHERE tg_id=?').run(JSON.stringify([{...staff,id:'reward',locked:true,room:'main'}]),buyer);
  assert.equal((await market(env,buyer,{op:'buy',id:list.id,room:'hall2',operationId:'full_room_buy_0001'})).status,409);
  assert.equal(sql.prepare('SELECT money FROM players WHERE tg_id=?').get(buyer).money,500000);
  assert.equal(sql.prepare('SELECT status FROM market WHERE id=?').get(list.id).status,'open');sql.close();
});
test('synced reward and temporary employees count towards capacity but cannot be listed',async()=>{
  const{marketRoster}=await import('../functions/_market.js');
  const roster=marketRoster([{...staff,szLeg:'2026-11'},{...staff,id:'temp',today:'sub'}]);
  assert.equal(roster.length,2);assert.ok(roster.every(s=>s.locked));
  const{sql,env}=fixture(roster);
  assert.equal((await market(env,seller,{op:'list',operationId:'reward_list_0001',staffId:staff.id,price:100000})).status,409);sql.close();
});

test('a concurrent purchase retry cannot reuse the first receipt as a second write gate',async()=>{
 const f=fixture(),listing=await listed(f.env),request={op:'buy',operationId:'race_purchase_1',id:listing.id};
 const buyerBefore=f.sql.prepare('SELECT * FROM players WHERE tg_id=?').get(buyer),accountBefore=f.sql.prepare('SELECT * FROM market_accounts WHERE tg_id=?').get(buyer),listingBefore=f.sql.prepare('SELECT * FROM market WHERE id=?').get(listing.id);
 const first=await market(f.env,buyer,request);assert.equal(first.body.ok,true);
 const prepare=f.env.DB.prepare;let hide=true;
 f.env.DB.prepare=q=>{const st=prepare(q),bind=st.bind;st.bind=(...args)=>{const bound=bind(...args);
  if(q.startsWith('SELECT request, result FROM market_operations')&&hide){hide=false;bound.first=async()=>null;}
  if(q.startsWith('SELECT franchises, cafe, money')&&args[0]===buyer)bound.first=async()=>buyerBefore;
  if(q.startsWith('SELECT franchises, version, roster FROM market_accounts')&&args[0]===buyer)bound.first=async()=>accountBefore;
  if(q==='SELECT * FROM market WHERE id = ?1')bound.first=async()=>listingBefore;
  return bound;};return st;};
 const second=await market(f.env,buyer,request);assert.deepEqual(second.body,first.body);
 assert.equal(f.sql.prepare('SELECT money FROM players WHERE tg_id=?').get(buyer).money,400000);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM admin_ops WHERE op='trsold'").get().n,1);f.sql.close();
});
