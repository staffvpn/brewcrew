import {json,verifyInitData} from '../_lib.js';
import {publicCafe,cafeNameExpr,cafeNameQuery} from '../_cafe-public.js';
export async function onRequestPost({request,env}){
 if(!env.DB||!env.BOT_TOKEN)return json({ok:false},503);
 let body;try{body=await request.json();}catch{return json({ok:false},400);}if(!body||typeof body!=='object')return json({ok:false},400);
 const user=await verifyInitData(body.initData,env.BOT_TOKEN);if(!user?.id)return json({ok:false},401);
 const q=cafeNameQuery(body.q),offset=Math.max(0,Math.min(100000,Math.floor(Number(body.offset)||0))),limit=q.length>=2?12:3;
 const condition=q.length>=2?` AND ${cafeNameExpr()} LIKE ?2 ESCAPE '\\'`:'';
 const statement=env.DB.prepare(`SELECT p.tg_id,p.cafe,p.level,p.last_seen,v.vk,v.likes,v.at FROM players p LEFT JOIN cafe_view v ON v.tg_id=p.tg_id WHERE p.banned=0 AND p.tg_id!=?1 AND p.cafe IS NOT NULL AND p.cafe!=''${condition} ORDER BY p.last_seen DESC,p.tg_id LIMIT ${limit+1} OFFSET ${offset}`);
 const rows=(await (q.length>=2?statement.bind(user.id,'%'+q+'%'):statement.bind(user.id)).all()).results||[];
 const list=[];for(const row of rows.slice(0,limit)){
  if(!row.vk){await env.DB.prepare("INSERT OR IGNORE INTO cafe_view(tg_id,vk,data,at) VALUES(?1,lower(hex(randomblob(6))),?2,0)").bind(row.tg_id,JSON.stringify(publicCafe({n:row.cafe,lv:row.level,incomplete:true}))).run();const key=await env.DB.prepare('SELECT vk FROM cafe_view WHERE tg_id=?1').bind(row.tg_id).first();row.vk=key?.vk;}
  if(row.vk)list.push({vk:row.vk,cafe:row.cafe,level:row.level,likes:row.likes||0,updatedAt:row.at||0});
 }
 return json({ok:true,list,more:rows.length>limit,next:offset+limit});
}
