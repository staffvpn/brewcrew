// Financial mutations are atomic D1 batches. Every attempt has a unique gate;
// a concurrent loser cannot reuse the winner's persistent receipt as its own gate.
import { publicGuests } from './_duel.js';
export const identityMatches = (p,d,side) => !!p && Number(p.franchises||0)===d[side+'_run'] && Number(p.created_at||0)===d[side+'_created'];
const failure=error=>({ok:false,error});
export async function stakeDuel(env,uid,body,now,validateNew){
 const run=body.franchises,version=body.version;
 if(!Number.isSafeInteger(run)||run<0||!Number.isSafeInteger(version)||version<0||typeof body.operationId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.operationId))return failure('Обнови игру для безопасной ставки');
 const key=uid+':'+body.operationId;
 const payload=JSON.stringify({kind:'duel',op:body.op,run,version,id:body.id,pid:body.pid,stake:body.stake,rematch:body.rematch});
 const old=await env.DB.prepare('SELECT request,result FROM market_operations WHERE operation_id=?1 AND tg_id=?2').bind(key,uid).first();
 if(old)return old.request===payload?JSON.parse(old.result):failure('Квитанция относится к другой операции');
 const p=await env.DB.prepare('SELECT * FROM players WHERE tg_id=?1').bind(uid).first();
 const account=await env.DB.prepare('SELECT * FROM market_accounts WHERE tg_id=?1').bind(uid).first();
 if(!p||p.banned||!account||run!==Number(p.franchises||0)||run!==account.franchises||version!==account.version)return failure('market_sync_required');
 let duel,stake,role,vs,conditions,args;
 if(body.op==='new'){
  const checked=await validateNew(p);if(!checked.ok)return checked;
  const them=checked.them;stake=checked.stake;role='a';vs=them.cafe;
  duel={id:parseInt(crypto.randomUUID().replace(/-/g,'').slice(0,13),16)+1,a:uid,b:them.tg_id,a_cafe:p.cafe,b_cafe:them.cafe,stake,seed:Math.floor(Math.random()*2147483647),status:'a_play',created_at:now,rematch:body.rematch?1:0,a_run:run,b_run:Number(them.franchises||0),a_created:p.created_at,b_created:them.created_at};
  conditions=`AND NOT EXISTS(SELECT 1 FROM duel WHERE ((a=?1 AND b=?7) OR (a=?7 AND b=?1)) AND status IN ('a_play','open','b_play'))
    AND (SELECT COUNT(*) FROM duel WHERE a=?1 AND created_at>=?8)<3`;
  args=[them.tg_id,checked.dayStart];
 }else{
  duel=await env.DB.prepare("SELECT * FROM duel WHERE id=?1 AND b=?2 AND status='open'").bind(Number(body.id)||0,uid).first();
  if(!duel||!identityMatches(p,duel,'b'))return failure('Вызов уже недоступен');
  const a=await env.DB.prepare('SELECT * FROM players WHERE tg_id=?1').bind(duel.a).first();
  if(!identityMatches(a,duel,'a'))return failure('Соперник уже начал другую кофейню');
  stake=duel.stake;role='b';vs=duel.a_cafe;
  conditions="AND EXISTS(SELECT 1 FROM duel WHERE id=?7 AND b=?1 AND status='open') AND EXISTS(SELECT 1 FROM players WHERE tg_id=?8 AND COALESCE(franchises,0)=?9 AND created_at=?10)";
  args=[duel.id,duel.a,duel.a_run,duel.a_created];
 }
 if(!Number.isSafeInteger(stake)||stake<0||Number(p.money||0)<stake)return failure('Не хватает денег на ставку');
 const receipt={ok:true,op:'duel_stake',operationId:body.operationId,transactionId:crypto.randomUUID(),franchises:run,version:version+1,price:stake,id:duel.id,stake,vs,role,guests:publicGuests(duel.seed)};
 const value=JSON.stringify(receipt),gate='EXISTS(SELECT 1 FROM market_operations WHERE operation_id=?1 AND result=?2)';
 const statements=[
  env.DB.prepare(`UPDATE market_accounts SET version=version+1,updated_at=?4 WHERE tg_id=?1 AND version=?2 AND franchises=?3
    AND EXISTS(SELECT 1 FROM players WHERE tg_id=?1 AND COALESCE(franchises,0)=?3 AND money>=?5 AND created_at=?6) ${conditions}`)
   .bind(uid,version,run,now,stake,p.created_at,...args),
  env.DB.prepare('INSERT INTO market_operations(operation_id,tg_id,franchises,request,result,created_at) SELECT ?1,?2,?3,?4,?5,?6 WHERE changes()>0').bind(key,uid,run,payload,value,now),
  env.DB.prepare(`UPDATE players SET money=money-?4 WHERE tg_id=?3 AND ${gate}`).bind(key,value,uid,stake)
 ];
 if(role==='a')statements.push(env.DB.prepare(`INSERT INTO duel(id,a,b,a_cafe,b_cafe,stake,seed,status,created_at,rematch,a_run,b_run,a_created,b_created)
   SELECT ?3,?4,?5,?6,?7,?8,?9,'a_play',?10,?11,?12,?13,?14,?15 WHERE ${gate}`)
  .bind(key,value,duel.id,uid,duel.b,String(p.cafe||'?').slice(0,40),String(vs||'?').slice(0,40),stake,duel.seed,now,duel.rematch,run,duel.b_run,p.created_at,duel.b_created));
 else statements.push(env.DB.prepare(`UPDATE duel SET status='b_play',b_start=?4 WHERE id=?3 AND ${gate}`).bind(key,value,duel.id,now));
 const result=await env.DB.batch(statements);
 if(result[0].meta?.changes)return receipt;
 const retry=await env.DB.prepare('SELECT request,result FROM market_operations WHERE operation_id=?1 AND tg_id=?2').bind(key,uid).first();
 return retry&&retry.request===payload?JSON.parse(retry.result):failure('Состояние изменилось. Синхронизируй игру');
}
const gate='EXISTS(SELECT 1 FROM cache WHERE key=?1 AND val=?2)';
function marker(env,key,nonce,now){return env.DB.prepare('INSERT INTO cache(key,val,at) SELECT ?1,?2,?3 WHERE changes()>0').bind(key,nonce,now);}
function payout(env,key,nonce,d,side,amount,text,now){
 return env.DB.prepare(`INSERT INTO admin_ops(tg_id,op,amount,text,created_at,by_admin)
  SELECT ?3,'duelpay',?4,?5,?6,0 WHERE ?4>0 AND ${gate} AND EXISTS(SELECT 1 FROM players WHERE tg_id=?3 AND COALESCE(franchises,0)=?7 AND created_at=?8)`)
 .bind(key,nonce,d[side],amount,text,now,d[side+'_run'],d[side+'_created']);
}
export async function closeDuel(env,d,status,text,now){
 if(!['a_play','open'].includes(d.status))return false;
 const key='duel_close_'+d.id,nonce=crypto.randomUUID();
 const result=await env.DB.batch([
  env.DB.prepare('UPDATE duel SET status=?3,done_at=?4 WHERE id=?1 AND status=?2').bind(d.id,d.status,status,now),
  marker(env,key,nonce,now),payout(env,key,nonce,d,'a',d.stake,text,now)
 ]);
 return !!result[0].meta?.changes;
}
export async function settleDuel(env,d,bScore,bDet,now){
 const win=d.a_score>bScore?d.a:bScore>d.a_score?d.b:0;
 const ps=(await env.DB.prepare('SELECT tg_id,duel_r FROM players WHERE tg_id IN (?1,?2)').bind(d.a,d.b).all()).results||[];
 const ra=(ps.find(p=>p.tg_id===d.a)||{}).duel_r||1000,rb=(ps.find(p=>p.tg_id===d.b)||{}).duel_r||1000;
 const sa=win===d.a?1:win===d.b?0:0.5,delta=Math.round(32*(sa-1/(1+10**((rb-ra)/400))));
 const key='duel_done_'+d.id,nonce=crypto.randomUUID(),prize=Math.round(d.stake*1.8);
 const text='Дуэль: '+(win?'победа':'ничья, ставка вернулась');
 const statements=[
  env.DB.prepare("UPDATE duel SET status='done',b_score=?2,b_det=?3,done_at=?4,winner=?5 WHERE id=?1 AND status='b_play'").bind(d.id,bScore,bDet,now,win),
  marker(env,key,nonce,now),
  payout(env,key,nonce,d,'a',win?(win===d.a?prize:0):d.stake,text,now),
  payout(env,key,nonce,d,'b',win?(win===d.b?prize:0):d.stake,text,now)
 ];
 for(const side of ['a','b'])statements.push(env.DB.prepare(`UPDATE players SET duel_r=COALESCE(duel_r,1000)+?4,duel_w=COALESCE(duel_w,0)+?5,duel_l=COALESCE(duel_l,0)+?6
  WHERE tg_id=?3 AND COALESCE(franchises,0)=?7 AND created_at=?8 AND ${gate}`)
  .bind(key,nonce,d[side],side==='a'?delta:-delta,win===d[side]?1:0,win&&win!==d[side]?1:0,d[side+'_run'],d[side+'_created']));
 const result=await env.DB.batch(statements);
 return result[0].meta?.changes?{win,prize,a:d.a_score,b:bScore,rA:ra+delta,rB:rb-delta}:null;
}
