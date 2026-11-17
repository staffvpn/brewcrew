import {json,verifyInitData,SHOP} from '../_lib.js';
const initialized=new WeakSet();
export async function ensureCashLedger(db){if(initialized.has(db))return;await db.prepare('CREATE TABLE IF NOT EXISTS cash_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id INTEGER NOT NULL,event_key TEXT NOT NULL,at INTEGER NOT NULL,day INTEGER NOT NULL,delta REAL NOT NULL,payload TEXT NOT NULL,search TEXT NOT NULL,UNIQUE(tg_id,event_key))').run();await db.prepare('CREATE INDEX IF NOT EXISTS cash_ledger_owner ON cash_ledger(tg_id,id DESC)').run();initialized.add(db);}
export function validCashEvent(r){return !!(r&&r.currency==='RUB'&&typeof r.id==='string'&&/^[\w:-]{1,100}$/.test(r.id)&&Number.isFinite(r.delta)&&Number.isFinite(r.before)&&Number.isFinite(r.after)&&Math.abs(r.after-r.before-r.delta)<.02&&Number.isSafeInteger(r.day)&&r.day>=1&&Number.isFinite(r.at)&&typeof r.reason==='string'&&r.reason.length<=400&&typeof r.cat==='string'&&r.cat.length<=40&&JSON.stringify(r).length<=80000);}
export async function onRequestPost({env,request}){
 if(!env.DB||!env.BOT_TOKEN)return json({ok:false},503);let b;try{b=await request.json();}catch{return json({ok:false},400);}
 const u=await verifyInitData(b?.initData,env.BOT_TOKEN);if(!u||!Number.isSafeInteger(u.id)||u.id<=0)return json({ok:false},401);
 await ensureCashLedger(env.DB);
 if(b.action==='append'){
  if(!Array.isArray(b.rows)||b.rows.length>100||JSON.stringify(b.rows).length>700000||!b.rows.every(validCashEvent))return json({ok:false,error:'Некорректные операции'},400);
  if(b.rows.length)await env.DB.batch(b.rows.map(r=>env.DB.prepare('INSERT OR IGNORE INTO cash_ledger(tg_id,event_key,at,day,delta,payload,search)VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(u.id,r.id,r.at,r.day,r.delta,JSON.stringify(r),(r.reason+' '+(r.parts||[]).map(p=>p.reason).join(' ')).toLocaleLowerCase('ru-RU'))));
  return json({ok:true,accepted:b.rows.map(r=>r.id)});
 }
 const currency=b.currency==='XTR'?'XTR':'RUB',direction=['in','out'].includes(b.direction)?b.direction:'all',q=typeof b.q==='string'?b.q.slice(0,80).toLocaleLowerCase('ru-RU'):'',limit=50;
 if(currency==='XTR'){
  const offset=Number.isSafeInteger(b.offset)&&b.offset>=0?Math.min(100000,b.offset):0;
  const rows=(await env.DB.prepare('SELECT charge_id,item,stars,created_at,refunded,tg_id FROM purchases WHERE ((tg_id=?1 AND (gift_from IS NULL OR gift_from=?1)) OR gift_from=?1) AND stars>0 ORDER BY created_at DESC,charge_id DESC LIMIT 51 OFFSET ?2').bind(u.id,offset).all()).results||[];
  return json({ok:true,rows:rows.slice(0,limit).map(r=>({id:r.charge_id,at:r.created_at,delta:-r.stars,currency:'XTR',cat:'shop',reason:(r.tg_id!==u.id?'Подарок: ':'')+(SHOP[r.item]?.title||r.item)+(r.refunded?' · платёж возвращён':''),refunded:!!r.refunded})),more:rows.length>limit,offset:offset+limit});
 }
 const args=[u.id],clauses=['tg_id=?1'];if(Number.isSafeInteger(b.cursor)&&b.cursor>0){args.push(b.cursor);clauses.push('id<?'+args.length);}if(direction!=='all')clauses.push(direction==='in'?"(delta>0 OR EXISTS(SELECT 1 FROM json_each(payload,'$.parts') WHERE json_extract(value,'$.delta')>0))":"(delta<0 OR EXISTS(SELECT 1 FROM json_each(payload,'$.parts') WHERE json_extract(value,'$.delta')<0))");
 if(q){args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');clauses.push("search LIKE ?"+args.length+" ESCAPE '\\'");}
 const rows=(await env.DB.prepare('SELECT id,payload FROM cash_ledger WHERE '+clauses.join(' AND ')+' ORDER BY id DESC LIMIT 51').bind(...args).all()).results||[];
 return json({ok:true,rows:rows.slice(0,limit).map(r=>({...JSON.parse(r.payload),serverId:r.id})),more:rows.length>limit,cursor:rows[Math.min(limit,rows.length)-1]?.id||0});
}
