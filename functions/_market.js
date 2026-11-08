export const MARKET_ROLES = ['Бариста', 'Кассир', 'Официант', 'Мойщица', 'Повар'];
const QUIRKS = ['none','genius','late','talker','thief','smoker','sleepy','blogger','bore','drinker','philo','workaholic','lover'];
const integer = (v, low, high) => Math.max(low, Math.min(high, Math.round(Number(v) || 0)));
export function cleanMarketStaff(o) {
  if (!o || typeof o !== 'object' || o.isYou || o.locked || o.seasonRewardKey || o.szLeg || o.today==='sub') return null;
  const id = String(o.id || '');
  if (!/^[a-zA-Z0-9_:-]{1,100}$/.test(id) || !MARKET_ROLES.includes(o.role)) return null;
  const s = { id, name: String(o.name || '').slice(0,24), role:o.role, lvl:integer(o.lvl,1,50), rank:integer(o.rank,0,3),
    quirk:QUIRKS.includes(o.quirk)?o.quirk:'none', sex:o.sex==='f'?'f':'m', spr:integer(o.spr,0,200),
    legendId:integer(o.legendId,0,5), prize:o.prize?1:0, xp:integer(o.xp,0,1e7), shifts:integer(o.shifts,0,1e6),room:o.room==='hall2'?'hall2':'main' };
  return s.name ? s : null;
}
export function marketRoster(roster) {
  const seen = new Set();
  return (Array.isArray(roster)?roster:[]).slice(0,100).map(o=>{
    if(!o || o.isYou) return null;
    const locked=!!(o.locked || o.seasonRewardKey || o.szLeg || o.today==='sub');
    const s=cleanMarketStaff({...o,locked:false,seasonRewardKey:null,szLeg:null,today:null});
    return s ? {...s,locked} : null;
  }).filter(s=>s && !seen.has(s.id) && seen.add(s.id));
}
export function marketRoleLimit(role,level,kitchen=0){
  if(role==='Бариста')return Math.min(4+(level>=12?1:0),1+Math.floor(level/3));
  if(role==='Кассир')return Math.min(4,1+Math.floor(level/5));
  if(role==='Мойщица')return level>=12?2:1;
  if(role==='Повар')return kitchen>=2?Math.min(2,1+Math.floor(level/14)):0;
  return Math.min(3,1+Math.floor(level/8));
}
export async function pendingMarket(env, uid, version = 0, run = 0) {
  const rows = (await env.DB.prepare("SELECT result FROM market_operations WHERE tg_id = ?1 AND franchises = ?3 AND (applied_at IS NULL OR json_extract(result,'$.version') > ?2) ORDER BY created_at, operation_id LIMIT 100").bind(uid,version,run).all()).results || [];
  return rows.map(row=>JSON.parse(row.result)).sort((a,b)=>a.version-b.version);
}
