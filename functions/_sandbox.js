// Preview API is a separate dispatcher. It never calls the live game handlers.
import {json,verifyInitData,ADMINS,SHOP,sezId} from './_lib.js';
import {LEGAL_VERSION,LEGAL_DOCUMENTS} from './_legal.js';
import {validSave,SAVE_LIMIT} from './_save.js';
import {validCashEvent} from './api/cash-ledger.js';
import {onRequestGet as catalog} from './api/shop.js';
export function isPreview(request){const u=new URL(request.url);return request.headers.get('x-brewcrew-lab')==='1'||(u.hostname.endsWith('.brewcrew.pages.dev')&&u.hostname!=='brewcrew.pages.dev');}
export async function sandbox({request,env}){
 const path=new URL(request.url).pathname;
 if(request.method==='GET'){
  if(path==='/api/shop')return catalog();
  if(path==='/api/config'||path==='/api/maintenance')return json({ok:true,lab:true,ready:!!env.DB&&!!env.BOT_TOKEN,maint:{on:false,periods:[]},now:Date.now()});
  return json({ok:true,lab:true,top:[],sps:[],total:0,season:sezId()});
 }
 if(!env.DB||!env.BOT_TOKEN)return json({ok:false,error:'Тестовый сервер ещё не настроен'},503);
 let b;try{b=await request.json();}catch{return json({ok:false},400);}
 const user=await verifyInitData(b?.initData,env.BOT_TOKEN);if(!user||!ADMINS.includes(user.id))return json({ok:false,error:'Тестовая кофейня доступна только администраторам'},403);
 const key='lab_v1_'+user.id,read=async()=>{const r=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind(key).first();try{return JSON.parse(r?.val||'{}');}catch{return{};}},write=async d=>env.DB.prepare('INSERT INTO cache(key,val,at) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET val=excluded.val,at=excluded.at').bind(key,JSON.stringify(d),Date.now()).run();
 if(path==='/api/lab')return json({ok:true,lab:true,userId:user.id});
 if(path==='/api/recovery'){const d=await read();return json({ok:true,lab:true,exists:!!d.save,saves:d.save?[d.save]:[],cafe:d.save?.name,level:d.save?.level});}
 if(path==='/api/save'){if(!validSave(b.data)||JSON.stringify(b.data).length>SAVE_LIMIT)return json({ok:false},400);const d=await read();if(!d.save||b.data.savedAt>d.save.savedAt){d.save=b.data;await write(d);}return json({ok:true,stored:true,lab:true});}
 if(path==='/api/legal'){const receipt={userId:user.id,version:LEGAL_VERSION,documents:LEGAL_DOCUMENTS,termsAccepted:true,privacyRead:true,adult:true,recordedAt:Date.now(),recordId:'lab-only-'+user.id,source:'restore'};return json({ok:true,accepted:true,version:LEGAL_VERSION,receipt});}
 const d=await read(),owned=d.items||[],ent={ok:true,lab:true,adminTest:true,blocked:[],skins:[],lux:[],frames:owned.filter(k=>k.startsWith('frame_')),interiors:owned.filter(k=>k.startsWith('int_')),extras:owned.filter(k=>['uniform','music','flagship','starter'].includes(k)),passes:[{id:'admin_full:lab:'+sezId(),season:sezId(),full:true}],sub:0,tips:0,renames:0};
 for(const sku of owned){const p=SHOP[sku];if(p?.category&&p.skin){if(p.category==='lux')ent.lux.push(p.skin);else ent.skins.push({category:p.category,id:p.skin,at:Date.now()});}}
 if(path==='/api/purchases')return json(ent);
 if(path==='/api/admin-test'){
  if(b.kind==='status')return json({ok:true,adminTest:true,lab:true});
  if(b.gift||b.to||b.tg_id)return json({ok:false,error:'В тестовой версии нельзя выдавать предметы игрокам'},400);
  if(b.kind==='premium'&&SHOP[b.item]){d.items=[...new Set(owned.concat(b.item))];await write(d);return json({ok:true,adminTest:true,grant:{kind:'premium',item:b.item},entitlements:{...ent,interiors:[...new Set(ent.interiors.concat(b.item.startsWith('int_')?[b.item]:[]))],frames:[...new Set(ent.frames.concat(b.item.startsWith('frame_')?[b.item]:[]))],lux:[...new Set(ent.lux.concat(b.item.startsWith('lux_')?[b.item.slice(4)]:[]))],extras:[...new Set(ent.extras.concat(['uniform','music','flagship','starter'].includes(b.item)?[b.item]:[]))],skins:ent.skins.concat(SHOP[b.item].category&&SHOP[b.item].skin?[{category:SHOP[b.item].category,id:SHOP[b.item].skin,at:Date.now()}]:[])}});}
  if(b.kind==='skin')return json({ok:true,adminTest:true,grant:{kind:'skin',category:b.category,id:b.id}});
  if(b.kind==='upgrade')return json({ok:true,adminTest:true,grant:{kind:'upgrade',id:b.id,count:b.count}});
  return json({ok:false},400);
 }
 if(path==='/api/track')return json({ok:true,adminTest:true,ops:[],lab:true});
 if(path==='/api/cash-ledger'){
  const ledgerKey=key+'_ledger',r=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind(ledgerKey).first();let rows=[];try{rows=JSON.parse(r?.val||'[]');}catch{}
  if(b.action==='append'){if(!Array.isArray(b.rows)||b.rows.length>100||!b.rows.every(validCashEvent))return json({ok:false},400);let seq=rows[0]?.serverId||0;for(const row of b.rows)if(!rows.some(x=>x.id===row.id))rows.unshift({...row,serverId:++seq});rows=rows.slice(0,500);await env.DB.prepare('INSERT INTO cache(key,val,at) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET val=excluded.val,at=excluded.at').bind(ledgerKey,JSON.stringify(rows),Date.now()).run();return json({ok:true,accepted:b.rows.map(r=>r.id)});}
  const q=String(b.q||'').toLowerCase();rows=b.currency==='XTR'?[]:rows.filter(r=>(!b.cursor||r.serverId<b.cursor)&&(b.direction!=='in'||r.delta>0)&&(b.direction!=='out'||r.delta<0)&&(r.reason+' '+JSON.stringify(r.parts||[])).toLowerCase().includes(q));return json({ok:true,rows:rows.slice(0,50),more:rows.length>50,cursor:rows[Math.min(50,rows.length)-1]?.serverId||0});
 }
 if(['/api/invoice','/api/gift','/api/visit','/api/remind','/api/promo','/api/cron'].includes(path))return json({ok:false,error:'Платежи, рассылки и действия с игроками отключены в тестовой версии'},403);
 // Reads and unsupported game systems get empty sandbox data, never live account data.
 return json({ok:true,lab:true,ops:[],top:[],friends:[],cafes:[],rows:[],exists:false});
}
