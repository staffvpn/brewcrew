// A short-lived capability seeded by the owner in D1 publishes this fixed release.
// No arbitrary message, channel or image is accepted. Without the capability the
// route is disabled; successful publication consumes it. Preview origins stop here.
import { json } from '../_lib.js';
import { VERSION, publishVersion, postUrl } from '../_channel.js';
export async function onRequestPost({request,env}){
 const origin=new URL(request.url).origin;
 if(origin!==new URL(env.APP_URL||'https://brewcrew.pages.dev').origin)return json({ok:false},404);
 if(!env.DB||!env.BOT_TOKEN||!env.CHANNEL_ID)return json({ok:false},503);
 let body;try{body=await request.json();}catch{return json({ok:false},400);}
 if(body.version!==VERSION||typeof body.token!=='string'||body.token.length<32||body.token.length>128)return json({ok:false},403);
 const key='_release_publish_'+VERSION;
 const cap=await env.DB.prepare('SELECT val,at FROM cache WHERE key=?1').bind(key).first();
 if(!cap||cap.at<Date.now()-15*60000)return json({ok:false},403);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.token));
 const hash=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==cap.val)return json({ok:false},403);
 try{
  await publishVersion(env,origin);
  const p=await env.DB.prepare('SELECT ok,msg_id,info FROM posts WHERE key=?1').bind('ver_'+VERSION).first();
  if(p&&p.ok&&p.msg_id){await env.DB.prepare('DELETE FROM cache WHERE key=?1 AND val=?2').bind(key,hash).run();return json({ok:true,version:VERSION,messageId:p.msg_id,url:postUrl(env,p.msg_id)});}
  return json({ok:false,status:p&&p.info||'pending'},202);
 }catch{return json({ok:false,status:'uncertain'},503);}
}
