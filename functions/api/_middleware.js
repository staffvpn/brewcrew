import {getMaint} from '../_maint.js';
import {json,verifyInitData,ADMINS} from '../_lib.js';
import {isPreview,sandbox} from '../_sandbox.js';
import {requireLegal} from '../_legal.js';
export async function onRequest(context){
 if(isPreview(context.request))return sandbox(context);
 const path=new URL(context.request.url).pathname;
 if(context.request.method==='POST'&&!['/api/recovery','/api/legal'].includes(path)){
  try{const m=await getMaint(context.env);if(m.on){const b=await context.request.clone().json(),u=await verifyInitData(b?.initData,context.env.BOT_TOKEN);if(!u||!ADMINS.includes(u.id))return json({ok:false,maint:true,maintenance:m,error:m.text},503);}}catch{return json({ok:false,error:'Не удалось проверить режим техработ'},503);}
 }
 // Public documents/configuration and support remain accessible. ACK can finish a pending account deletion.
 if(context.request.method!=='POST'||path==='/api/legal'||path==='/api/recovery'||path==='/api/ack')return context.next();
 const blocked=await requireLegal(context.request,context.env);
 return blocked||context.next();
}
