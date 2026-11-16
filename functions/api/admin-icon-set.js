import {json,tgApi,ADMINS} from '../_lib.js';
import {androidIconPack} from '../_android-icons.js';
// Fixed public set and non-personal rendering health: never expose chats, messages or credentials.
export async function onRequestGet({env,request}){if(!env.BOT_TOKEN)return json({ok:false},503);try{const pack=await androidIconPack(env),errors=[];if(env.DB)for(const id of ADMINS){const row=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('admin_icon_error_'+id).first();try{const d=JSON.parse(row?.val||'null');if(d?.description)errors.push(String(d.description).slice(0,250));}catch{}}
const info=await tgApi(env,'getWebhookInfo',{});let webhookHost=null;try{webhookHost=new URL(info.result.url).host;}catch{}
return json({ok:true,...pack,rendering:{errors:[...new Set(errors)],webhookHost,host:request?new URL(request.url).host:null}});}catch{return json({ok:false,error:'Набор временно недоступен'},502);}}
