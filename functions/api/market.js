// Transfers use a versioned roster and durable receipts; retries never repeat payment.
import { json, verifyInitData } from '../_lib.js';
import { cleanMarketStaff, pendingMarket, marketRoleLimit } from '../_market.js';

const fail = (error, status = 409) => json({ ok:false, error }, status);
const idNumber = value => Number.isSafeInteger(value) && value > 0;
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.BOT_TOKEN) return fail('Сервер не настроен',503);
  let body; try { body=await request.json(); } catch { return fail('Некорректный запрос',400); }
  const user=await verifyInitData(body.initData,env.BOT_TOKEN);
  if (!user || !user.id) return fail('Открой игру из Telegram',401);
  const now=Date.now();
  try {
    if (body.op==='ack') {
      if (typeof body.operationId!=='string') return fail('Нет квитанции',400);
      await env.DB.prepare('UPDATE market_operations SET applied_at = ?3 WHERE operation_id = ?1 AND tg_id = ?2 AND applied_at IS NULL').bind(user.id+':'+body.operationId,user.id,now).run();
      return json({ok:true});
    }
    const me=await env.DB.prepare('SELECT franchises, cafe, money, level, rooms, snap FROM players WHERE tg_id = ?1').bind(user.id).first();
    if (!me) return fail('Сначала синхронизируй игру');
    const account=await env.DB.prepare('SELECT franchises, version, roster FROM market_accounts WHERE tg_id = ?1').bind(user.id).first();
    if (body.op==='get') {
      const list=(await env.DB.prepare("SELECT id, seller_cafe, staff, price FROM market WHERE status = 'open' AND seller != ?1 AND EXISTS(SELECT 1 FROM players WHERE tg_id=market.seller AND COALESCE(franchises,0)=market.seller_run) ORDER BY created_at DESC LIMIT 30").bind(user.id).all()).results||[];
      const mine=(await env.DB.prepare("SELECT id, staff, price, status, buyer_cafe FROM market WHERE seller = ?1 AND (status = 'open' OR (status = 'sold' AND sold_at > ?2)) ORDER BY created_at DESC LIMIT 10").bind(user.id,now-3*86400000).all()).results||[];
      const parsed=rows=>rows.map(row=>({...row,staff:JSON.parse(row.staff)}));
      return json({ok:true,list:parsed(list),mine:parsed(mine),version:account?account.version:0,operations:await pendingMarket(env,user.id,Number(body.version)||0,Number(me.franchises)||0)});
    }
    if (!['list','buy','cancel'].includes(body.op) || typeof body.operationId!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.operationId)) return fail('Некорректная операция',400);
    const run=body.franchises, version=body.version, operationKey=user.id+':'+body.operationId;
    const payload=JSON.stringify({op:body.op,run,version,id:body.id,staffId:body.staffId,price:body.price,room:body.room});
    const previous=await env.DB.prepare('SELECT request, result FROM market_operations WHERE operation_id = ?1 AND tg_id = ?2').bind(operationKey,user.id).first();
    if (previous) return previous.request===payload ? json(JSON.parse(previous.result)) : fail('Квитанция относится к другой операции');
    if (!account || run!==Number(me.franchises||0) || run!==account.franchises || version!==account.version) return fail('market_sync_required');
    const roster=JSON.parse(account.roster), nextRoster=roster.slice();
    let staff, listing, listingId=body.id, price=0;
    if (body.op==='list') {
      if (!Number.isSafeInteger(body.price) || body.price<10000 || body.price>1e9) return fail('Некорректная цена',400);
      staff=roster.find(s=>s.id===body.staffId);
      if (!staff || !cleanMarketStaff(staff)) return fail('Сотрудник не найден в синхронизированной команде');
      const blocked=await env.DB.prepare("SELECT id FROM market WHERE seller = ?1 AND seller_run = ?2 AND staff_id = ?3 AND status IN ('open','sold') LIMIT 1").bind(user.id,run,staff.id).first();
      if (blocked) return fail('Этот сотрудник уже выставлен или продан');
      const count=await env.DB.prepare("SELECT COUNT(*) n FROM market WHERE seller = ?1 AND status = 'open'").bind(user.id).first();
      if (count && count.n>=3) return fail('Можно выставить не больше трёх человек');
      listingId=parseInt(crypto.randomUUID().replace(/-/g,'').slice(0,13),16)+1;
      price=body.price;nextRoster.splice(nextRoster.findIndex(s=>s.id===staff.id),1);
    } else {
      if (!idNumber(listingId)) return fail('Некорректное объявление',400);
      listing=await env.DB.prepare('SELECT * FROM market WHERE id = ?1').bind(listingId).first();
      if (!listing || listing.status!=='open') return fail('Сотрудник уже продан или снят');
      if (body.op==='cancel' && listing.seller!==user.id) return fail('Это чужое объявление',403);
      if (body.op==='buy' && listing.seller===user.id) return fail('Нельзя купить своего сотрудника');
      const raw=JSON.parse(listing.staff);
      staff=cleanMarketStaff({...raw,id:body.op==='cancel' && listing.staff_id ? listing.staff_id : 'tr_'+listingId+'_'+user.id});
      if (!staff) return fail('Нельзя передать этого сотрудника');
      if (body.op==='buy') price=listing.price;
      if (body.op==='buy' && price>Number(me.money||0)) return fail('Не хватает денег');
      const wantedRoom=body.op==='buy'?body.room:raw.room;
      staff.room=wantedRoom==='hall2' && me.rooms>1 && ['Официант','Мойщица'].includes(staff.role)?'hall2':'main';
      let snap={};try{snap=JSON.parse(me.snap||'{}');}catch{}
      if(roster.filter(s=>s.role===staff.role && (s.room||'main')===staff.room).length>=marketRoleLimit(staff.role,Number(me.level)||1,Number(snap.kitchen)||0))return fail('Освободи место на эту должность перед трансфером');
      nextRoster.push(staff);
    }
    const receipt={ok:true,transactionId:crypto.randomUUID(),operationId:body.operationId,op:body.op,franchises:run,version:version+1,id:listingId,staff,price,room:staff.room||'main'};
    const result=JSON.stringify(receipt), gate='EXISTS (SELECT 1 FROM market_operations WHERE operation_id = ?1 AND result = ?2)';
    const conditions=body.op==='list'
      ? "AND (SELECT COUNT(*) FROM market WHERE seller = ?1 AND status = 'open') < 3 AND NOT EXISTS (SELECT 1 FROM market WHERE seller = ?1 AND seller_run = ?3 AND staff_id = ?6 AND status IN ('open','sold'))"
      : "AND EXISTS (SELECT 1 FROM market WHERE id = ?6 AND status = 'open' AND seller "+(body.op==='buy'?'!=':'=')+" ?1 AND EXISTS(SELECT 1 FROM players WHERE tg_id=market.seller AND COALESCE(franchises,0)=market.seller_run)) AND EXISTS (SELECT 1 FROM players WHERE tg_id = ?1 "+(body.op==='buy'?'AND money >= ?7 ':'')+"AND COALESCE(franchises,0) = ?3)";
    const statements=[
      env.DB.prepare('UPDATE market_accounts SET version = version + 1, roster = ?4, updated_at = ?5 WHERE tg_id = ?1 AND version = ?2 AND franchises = ?3 AND roster = ?8 '+conditions)
        .bind(user.id,version,run,JSON.stringify(nextRoster),now,body.op==='list'?staff.id:listingId,price,account.roster),
      env.DB.prepare('INSERT INTO market_operations(operation_id,tg_id,franchises,request,result,created_at) SELECT ?1,?2,?3,?4,?5,?6 WHERE changes() > 0')
        .bind(operationKey,user.id,run,payload,result,now)
    ];
    if (body.op==='list') {
      statements.push(env.DB.prepare(`INSERT INTO market(id,seller,seller_cafe,staff,price,status,created_at,staff_id,seller_run) SELECT ?3,?4,?5,?6,?7,'open',?8,?9,?10 WHERE ${gate}`)
        .bind(operationKey,result,listingId,user.id,me.cafe,JSON.stringify(staff),price,now,staff.id,run));
    } else if (body.op==='cancel') {
      statements.push(env.DB.prepare(`UPDATE market SET status = 'cancelled' WHERE id = ?3 AND ${gate}`).bind(operationKey,result,listingId));
    } else {
      statements.push(env.DB.prepare(`UPDATE players SET money = money - ?4 WHERE tg_id = ?3 AND ${gate}`).bind(operationKey,result,user.id,price));
      statements.push(env.DB.prepare(`UPDATE market SET status='sold',buyer=?4,buyer_cafe=?5,sold_at=?6 WHERE id=?3 AND ${gate}`).bind(operationKey,result,listingId,user.id,me.cafe,now));
      statements.push(env.DB.prepare(`INSERT INTO admin_ops(tg_id,op,amount,text,created_at,by_admin) SELECT ?3,'trsold',?4,?5,?6,0 WHERE ${gate}`)
        .bind(operationKey,result,listing.seller,Math.round(price*0.9),staff.name+' ('+staff.role.toLowerCase()+')',now));
    }
    const changed=await env.DB.batch(statements);
    if (!(changed[0].meta && changed[0].meta.changes)) {
      const retry=await env.DB.prepare('SELECT request, result FROM market_operations WHERE operation_id=?1 AND tg_id=?2').bind(operationKey,user.id).first();
      return retry && retry.request===payload ? json(JSON.parse(retry.result)) : fail('Состояние рынка изменилось. Синхронизируй игру');
    }
    return json(receipt);
  } catch { return fail('Трансфер не завершён. Повтори запрос для восстановления',503); }
}
