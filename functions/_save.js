// Full owner-bound snapshots, independent of public rankings and cafe previews.
export const SAVE_LIMIT=900000;
export function validSave(s){return !!(s&&s.v===3&&typeof s.name==='string'&&s.name.length&&Number.isFinite(s.money)&&Number.isFinite(s.level)&&Number.isFinite(s.created)&&Number.isFinite(s.savedAt)&&Array.isArray(s.rooms)&&s.rooms.some(r=>r?.id==='main'&&r.upg)&&Array.isArray(s.staff)&&s.stock&&s.fin?.today&&s.c);}
export async function savedCopies(env,id){const out=[];for(const suffix of ['current','previous']){const row=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('full_save_'+id+'_'+suffix).first();try{const envelope=JSON.parse(row?.val||'null');if(envelope?.user===id&&validSave(envelope.data))out.push(envelope.data);}catch{}}return out;}
export async function storeCopy(env,id,data,reset){
 if(!validSave(data)||new TextEncoder().encode(JSON.stringify(data)).length>SAVE_LIMIT)return{ok:false,error:'Некорректная или слишком большая копия',status:400};
 const [prior]=await savedCopies(env,id);
 if(prior){
  if(data.savedAt<=prior.savedAt)return{ok:true,stored:false};
  if(data.created!==prior.created&&!reset&&(data.franchises||0)<=(prior.franchises||0)&&(data.bankrupts||0)<=(prior.bankrupts||0))return{ok:false,error:'Сначала восстанови существующую кофейню',status:409};
 }
 const current='full_save_'+id+'_current',previous='full_save_'+id+'_previous',at=data.savedAt;
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO cache(key,val,at) SELECT ?1,val,at FROM cache WHERE key=?2 AND at<?3 ON CONFLICT(key) DO UPDATE SET val=excluded.val,at=excluded.at').bind(previous,current,at),
  env.DB.prepare('INSERT INTO cache(key,val,at) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET val=excluded.val,at=excluded.at WHERE cache.at<excluded.at').bind(current,JSON.stringify({user:id,data}),at)
 ]);
 return{ok:true,stored:result[1]?.meta?.changes!==0};
}
