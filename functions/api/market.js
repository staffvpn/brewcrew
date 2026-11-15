// Trading is retired. Only return previously listed staff to their original owner.
import { json, verifyInitData } from '../_lib.js';
export async function onRequestPost({request,env}) {
  if(!env.DB||!env.BOT_TOKEN)return json({ok:false,error:'Сервер не настроен'},503);
  let body;try{body=await request.json();}catch{return json({ok:false},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({ok:false},400);
  const user=await verifyInitData(body.initData,env.BOT_TOKEN);
  if(!user||!user.id)return json({ok:false,error:'Открой игру из Telegram'},401);
  if(body.op!=='retire')return json({ok:false,error:'Трансфер сотрудников закрыт'},410);
  // D1 batch is atomic: concurrent/retried requests cannot issue a second return.
  const result=await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_ops (tg_id,op,amount,text,created_at,by_admin) SELECT seller,'trreturn',0,staff,?2,0 FROM market WHERE seller=?1 AND status='open'").bind(user.id,Date.now()),
    env.DB.prepare("UPDATE market SET status='cancelled' WHERE seller=?1 AND status='open'").bind(user.id)
  ]);
  return json({ok:true,returned:result[0]?.meta?.changes||0});
}
