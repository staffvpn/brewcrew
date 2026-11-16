import {json,verifyInitData} from '../_lib.js';
import {LEGAL_VERSION,LEGAL_DOCUMENTS,legalKey,legalAcceptance,validLegal} from '../_legal.js';
export async function onRequestPost({request,env}){
 if(!env.DB||!env.BOT_TOKEN)return json({ok:false,error:'Сервис подтверждения документов временно недоступен'},503);
 let b;try{b=await request.json();}catch{return json({ok:false,error:'Некорректный запрос'},400);}
 if(!b||typeof b!=='object'||Array.isArray(b))return json({ok:false},400);
 const user=await verifyInitData(b.initData,env.BOT_TOKEN);
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0)return json({ok:false,error:'Открой игру через Telegram'},401);
 if(b.action==='status'){const receipt=await legalAcceptance(env,user.id);return json({ok:true,version:LEGAL_VERSION,accepted:!!receipt,receipt});}
 if(b.action!=='accept'||b.version!==LEGAL_VERSION)return json({ok:false,error:'Редакция документов изменилась. Обнови игру.',version:LEGAL_VERSION},409);
 if(b.termsAccepted!==true||b.privacyRead!==true||b.adult!==true)return json({ok:false,error:'Нужны все обязательные подтверждения'},400);
 if(!['start','restore'].includes(b.source))return json({ok:false,error:'Неизвестный экран подтверждения'},400);
 const before=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind(legalKey(user.id)).first();
 const old=validLegal(before,user.id);
 if(old)return json({ok:true,accepted:true,version:LEGAL_VERSION,receipt:old});
 const receipt={userId:user.id,version:LEGAL_VERSION,documents:LEGAL_DOCUMENTS,termsAccepted:true,privacyRead:true,adult:true,recordedAt:Date.now(),recordId:crypto.randomUUID(),source:b.source};
 await env.DB.prepare('INSERT INTO cache(key,val,at) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET val=excluded.val,at=excluded.at WHERE cache.val IS ?4').bind(legalKey(user.id),JSON.stringify(receipt),receipt.recordedAt,before?.val??null).run();
 // Read the winning record after concurrent/retried confirmations. Client timestamps are never trusted.
 const saved=await legalAcceptance(env,user.id);
 if(!saved)return json({ok:false,error:'Подтверждение не сохранилось. Попробуй ещё раз.'},503);
 return json({ok:true,accepted:true,version:LEGAL_VERSION,receipt:saved});
}
