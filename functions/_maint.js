// Durable pause intervals let returning players exclude maintenance from offline simulation.
export const MAINT_TEXT='Сейчас идут технические работы. Скоро вернёмся, следи за новостями в канале.';
export async function getMaint(env){
 const r=await env.DB.prepare("SELECT val FROM cache WHERE key = 'maint'").first();
 if(!r)return{on:false,text:MAINT_TEXT,periods:[]};
 const m=JSON.parse(r.val);return{on:!!m.on,text:m.text||MAINT_TEXT,at:m.at||null,since:m.on?(m.since||m.at):null,periods:Array.isArray(m.periods)?m.periods:[]};
}
export async function setMaint(env,patch,by){
 const cur=await getMaint(env),now=Date.now(),changed=patch.on!==undefined&&patch.on!==cur.on;
 const periods=cur.periods.slice();if(changed&&cur.on&&cur.since)periods.push({from:cur.since,to:now});
 const m={...cur,...patch,by,at:changed?now:cur.at,since:changed?(patch.on?now:null):cur.since,periods};
 const writes=[];
 // Immutable pre-release full copies; never overwrite them during later save rotations.
 if(changed&&patch.on)writes.push(env.DB.prepare("INSERT OR IGNORE INTO cache(key,val,at) SELECT 'release_backup:'||?1||':'||key,val,?1 FROM cache WHERE key GLOB 'full_save_*_current'").bind(now));
 writes.push(env.DB.prepare("INSERT INTO cache(key,val,at) VALUES('maint',?1,?2) ON CONFLICT(key) DO UPDATE SET val=excluded.val,at=excluded.at").bind(JSON.stringify(m),now));
 await env.DB.batch(writes);return m;
}
