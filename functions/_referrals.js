// Read-only account invitation statistics, shared with the owner's Admin preview.
const COLS='tg_id,first_name,cafe,city,level,earned,last_seen,created_at,sessions,play_seconds,rooms,ref_paid,snap,(SELECT vk FROM cafe_view v WHERE v.tg_id=players.tg_id) AS vk';
export async function invitationData(db,id,requested){
 const n=Number(requested),offset=Number.isFinite(n)?Math.max(0,Math.min(100000,Math.floor(n))):0;
 const me=await db.prepare('SELECT referrer FROM players WHERE tg_id=?1').bind(id).first();
 const totals=await db.prepare('SELECT COUNT(*) total,SUM(CASE WHEN ref_paid=1 THEN 1 ELSE 0 END) paid,SUM(CASE WHEN level>=3 OR ref_paid=1 THEN 1 ELSE 0 END) reached3 FROM players WHERE referrer=?1').bind(id).first();
 const friends=(await db.prepare(`SELECT ${COLS} FROM players WHERE referrer=?1 ORDER BY created_at DESC,tg_id DESC LIMIT 50 OFFSET ?2`).bind(id,offset).all()).results||[];
 let inviter=null;if(me?.referrer)inviter=await db.prepare(`SELECT ${COLS} FROM players WHERE tg_id=?1`).bind(me.referrer).first();
 const parse=x=>{if(x){try{x.snap=x.snap?JSON.parse(x.snap):null;}catch{x.snap=null;}}return x;};friends.forEach(parse);parse(inviter);
 const total=Number(totals?.total)||0,paid=Number(totals?.paid)||0,reached3=Number(totals?.reached3)||0;
 return{id,inviter,friends,total,paid,reached3,more:offset+friends.length<total,earned:paid*150000,unclaimed:0,granted:0};
}
