import {json,verifyInitData} from '../_lib.js';
import {storeCopy,SAVE_LIMIT} from '../_save.js';
import {guardNewCafe} from '../_recovery.js';
export async function onRequestPost({request,env}){
 if(!env.DB||!env.BOT_TOKEN)return json({ok:false},503);
 const length=Number(request.headers.get('content-length'));if(length>SAVE_LIMIT+20000)return json({ok:false},413);
 let body;try{body=await request.json();}catch{return json({ok:false},400);}
 const user=await verifyInitData(body?.initData,env.BOT_TOKEN);if(!user||!Number.isSafeInteger(user.id)||user.id<=0)return json({ok:false},401);
 const s=body.data;if(!s||typeof s!=='object')return json({ok:false},400);
 const blocked=await guardNewCafe(env,user.id,{level:s.level,earned:s.c?.earnedRun,franchises:s.franchises,bankrupt:s.bankrupts,resetConfirmed:body.resetConfirmed===true});if(blocked)return blocked;
 const result=await storeCopy(env,user.id,s,body.resetConfirmed===true);return json(result,result.status||200);
}
