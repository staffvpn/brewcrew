import {json} from './_lib.js';
export async function recoveryProfile(env,id){
 const p=await env.DB.prepare('SELECT cafe,level,money,earned,franchises,bankrupt,play_seconds,last_seen FROM players WHERE tg_id=?1').bind(id).first();
 // /start registers a Telegram user before they have created a cafe.
 if(p&&(String(p.cafe||'').trim()||Number(p.level)>1||Number(p.earned)>0||Number(p.play_seconds)>0))return p;
 const v=await env.DB.prepare('SELECT data FROM cafe_view WHERE tg_id=?1').bind(id).first();let d;try{d=JSON.parse(v?.data||'null');}catch{}
 return d?{cafe:String(d.n||'Твоя кофейня').slice(0,40),level:Number(d.lv)||1}:null;
}
export async function guardNewCafe(env,id,stats){
 const fresh=Number(stats.level)<=1&&Number(stats.earned||0)<1;
 if(!fresh)return null;
 const prior=await recoveryProfile(env,id);
 if(!prior||!(Number(prior.level)>1||Number(prior.earned)>1000))return null;
 if(stats.resetConfirmed===true||Number(stats.franchises)>Number(prior.franchises||0)||Number(stats.bankrupt)>Number(prior.bankrupt||0))return null;
 const view=await env.DB.prepare('SELECT data FROM cafe_view WHERE tg_id=?1').bind(id).first();
 await env.DB.prepare('INSERT OR IGNORE INTO cache(key,val,at) VALUES(?1,?2,?3)').bind('account_rescue_'+id,JSON.stringify({player:prior,view:view?.data||null,at:Date.now(),reason:'new_profile_over_existing'}),Date.now()).run();
 return json({ok:false,recoveryRequired:true,cafe:prior.cafe,level:Number(prior.level)||1,error:'На сервере есть твоя кофейня. Новая игра не заменит её автоматически.'},409);
}
