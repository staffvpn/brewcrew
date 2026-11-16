// Read-only account existence probe. It must work before accepting a new document revision.
import {json,verifyInitData} from '../_lib.js';
import {recoveryProfile} from '../_recovery.js';
export async function onRequestPost({request,env}){
 if(!env.DB||!env.BOT_TOKEN)return json({ok:false,error:'Сервис восстановления временно недоступен'},503);
 let b;try{b=await request.json();}catch{return json({ok:false},400);}
 const user=await verifyInitData(b?.initData,env.BOT_TOKEN);
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0)return json({ok:false},401);
 const p=await recoveryProfile(env,user.id);
 return json({ok:true,exists:!!p,...(p?{cafe:p.cafe||'Твоя кофейня',level:Number(p.level)||1,franchises:Number(p.franchises)||0,bankrupt:Number(p.bankrupt)||0}:{})});
}
