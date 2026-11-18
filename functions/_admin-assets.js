// Only this allowlist can be changed by the administrator inventory controls.
import {ADMINS,SHOP} from './_lib.js';
import {TEST_UPGRADES} from './_test-catalog.js';
export const ASSET_GROUPS={interior:'Оформление',equipment:'Оборудование',premium:'Пропуск и покупки',resources:'Ресурсы',staff:'Сотрудники',inventory:'Инвентарь',upgrades:'Улучшения',badges:'Значки',features:'Возможности'};
const group=p=>['mach','grind','terminal','room'].includes(p.category)?'equipment':p.category?'interior':'premium';
const hidden=/^frame_(fire|bulbs|spark|aurora|cat)$/;
export const ADMIN_ASSETS=Object.entries(SHOP).filter(([k,p])=>!hidden.test(k)&&!p.cash&&k!=='rename').map(([id,p])=>({id,kind:'product',title:p.title,group:group(p)}));
for(const [id,title]of [['first','Утренний завоз'],['hall','Барная поставка'],['author','Поставка шефа']])ADMIN_ASSETS.push({id,kind:'supplier',title:'Открытия: '+title,max:1000000,group:'inventory'});
ADMIN_ASSETS.push({id:'newbadge',kind:'badgegift',title:'Выдать новый значок',group:'badges'});
for(const level of [10,20,30])ADMIN_ASSETS.push({id:'legend'+level,kind:'staffgift',title:'Выдать легенду '+level+' уровня',group:'staff'});
for(const[id,title]of [['giftcash','Сертификат на 50 000 ₽'],['giftxp','Сертификат на 500 опыта'],['giftboost','Бонус: гостей +15% на сутки']])ADMIN_ASSETS.push({id,kind:'consumable',title,group:'inventory'});
ADMIN_ASSETS.push({id:'reward_gold',kind:'reward',title:'Золотая кофемашина сезона',group:'equipment'},{id:'reward_pet',kind:'reward',title:'Кот-бариста сезона',group:'interior'});
for(const[id,title,max]of [['money','Деньги в кассе',1e12],['xp','Опыт',1e9],['sp','Очки сезона',1e7],['level','Уровень',60],['rep','Рейтинг',5]])ADMIN_ASSETS.push({id,kind:'resource',title,max,group:'resources'});
for(const[id,title]of Object.entries({beans:'Зерно · граммы',milk:'Молоко · миллилитры',cups:'Стаканы · штуки',syrup:'Сироп · миллилитры',tea:'Чай · порции',desserts:'Десерты · штуки',matcha:'Матча · граммы',sandwiches:'Сэндвичи · штуки',pastry:'Круассаны · штуки',hoz:'Хозтовары · наборы',food:'Кухня · порции'}))ADMIN_ASSETS.push({id,kind:'stock',title,max:100000,group:'resources'});
for(const id of TEST_UPGRADES)ADMIN_ASSETS.push({id,kind:'upgrade',title:({machine:'Кофемашина',register:'Касса',tables:'Столы',decor:'Уют',storage:'Хранение',sign:'Вывеска',showcase:'Витрина',menu:'Меню',ware:'Посуда',vent:'Вентиляция',delivery:'Доставка',clean:'Чистота',sink:'Мойка',safety:'Безопасность'})[id]||id,max:id==='tables'?28:20,group:'upgrades'});
for(const[id,title]of Object.entries({kitchen:'Кухня',buyout:'Собственное помещение',roaster:'Обжарка'}))ADMIN_ASSETS.push({id,kind:'feature',title,group:'features'});
export function safeAdminSnapshot(raw){
 if(!raw||typeof raw!=='object')return null;
 const str=(x,n=80)=>typeof x==='string'?x.slice(0,n):'',number=(x,max=1e12)=>Math.max(0,Math.min(max,Number(x)||0));
 return {at:Date.now(),suppliers:Object.fromEntries(['first','hall','author'].map(k=>[k,number(raw.suppliers?.[k],1000000)])),cash:Math.max(-1e12,Math.min(1e12,Number(raw.cash)||0)),owned:(Array.isArray(raw.owned)?raw.owned:[]).filter(k=>typeof k==='string'&&k.length<90).slice(0,220),staff:(Array.isArray(raw.staff)?raw.staff:[]).filter(x=>x&&!x.you).slice(0,80).map(x=>({id:str(String(x.id)),title:str(x.title),role:str(x.role)})),inventory:(Array.isArray(raw.inventory)?raw.inventory:[]).slice(0,150).filter(x=>x&&/^[\w-]{1,80}$/.test(String(x.id))).map(x=>({id:String(x.id),title:str(x.title)})),badges:(Array.isArray(raw.badges)?raw.badges:[]).slice(0,100).map(x=>typeof x==='string'?{id:str(x),title:str(x)}:{id:str(x?.id),title:str(x?.title)}).filter(x=>x.id&&x.title),stock:Object.fromEntries(['beans','milk','cups','syrup','tea','desserts','matcha','sandwiches','pastry','hoz','food'].map(k=>[k,number(raw.stock?.[k],100000)])),xp:number(raw.xp,1e9),sp:number(raw.sp,1e7),rep:number(raw.rep,5)};
}
export async function adminSnapshot(env,id){const r=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('admin_inventory_'+id).first();try{return JSON.parse(r?.val||'null');}catch{return null;}}
export async function assetEntries(env,id,section){
 if(!['staff','inventory','badges'].includes(section))return ADMIN_ASSETS.filter(x=>x.group===section);
 const staticEntries=ADMIN_ASSETS.filter(x=>x.group===section);const snap=await adminSnapshot(env,id);if(!snap)return staticEntries;
 if(section==='badges')return staticEntries.concat((snap.badges||[]).map(x=>({id:x.id,kind:'badge',title:x.title,group:section})));
 return staticEntries.concat((snap[section]||[]).map(x=>({id:x.id,kind:section==='staff'?'staff':'inventory',title:x.title+(x.role?' · '+x.role:''),group:section})));
}
export function validateAssetAction(data){
 if(!data||!['give','take','set'].includes(data.action))return null;
 const a=ADMIN_ASSETS.find(x=>x.id===data.id&&x.kind===data.kind);
 if(!a&&!(['staff','inventory','badge'].includes(data.kind)&&data.action==='take'&&typeof data.id==='string'&&data.id.length<=80))return null;
 if(data.kind==='badgegift'&&(data.action!=='give'||typeof data.title!=='string'||data.title.trim().length<2||data.title.length>40))return null;
 if(['staffgift','consumable'].includes(data.kind)&&data.action!=='give')return null;
 if(['resource','stock','upgrade','supplier'].includes(data.kind)){const amount=Number(data.amount);if(!Number.isFinite(amount)||amount<0||amount>(a.max||1e12)||!Number.isInteger(amount)&&data.id!=='rep')return null;if(data.kind==='resource'&&data.id==='level'&&data.action!=='set')return null;if((data.id==='level'||data.id==='rep'&&data.action==='set')&&amount<1)return null;}
 else if(data.action==='set')return null;
 return {...data,amount:Number(data.amount)||0,title:data.kind==='badgegift'?data.title.trim():a?.title||String(data.title||data.id).slice(0,120)};
}
export async function restrictions(env,id){const r=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('admin_entitlements_'+id).first();try{return JSON.parse(r?.val||'{}');}catch{return{};}}
export async function applyAssetAction(env,id,data,admin,token){
 const d=validateAssetAction(data);if(!ADMINS.includes(admin)||!d||!Number.isSafeInteger(id)||id<1)throw Error('Некорректное действие');
 if(!await env.DB.prepare('SELECT tg_id FROM players WHERE tg_id=?1').bind(id).first())throw Error('Игрок не найден');
 if(!/^[a-f0-9]{20}$/.test(token))throw Error('Некорректное подтверждение');
 const now=Date.now(),key='admin_action_'+token;
 // The confirmation token is a durable idempotency key, including after reopening /admin.
 const opText=JSON.stringify({...d,token});
 let subscriptionUntil=null;if(d.kind==='product'&&SHOP[d.id].sub&&d.action==='give'){const r=await env.DB.prepare("SELECT MAX(expires_at) e FROM purchases WHERE tg_id=?1 AND item='sub_owner' AND refunded=0").bind(id).first();subscriptionUntil=Math.max(now,r?.e||0)+30*86400000;}
 const writes=[env.DB.prepare("INSERT OR IGNORE INTO cache(key,val,at) VALUES(?1,'1',?2)").bind(key,now),env.DB.prepare("INSERT INTO admin_ops(tg_id,op,amount,text,created_at,by_admin) SELECT ?1,'manage',?2,?3,?4,?5 WHERE changes()=1").bind(id,d.amount,opText,now,admin)];
 // Execute entitlement changes only once, guarded by the operation's unique token.
 if(d.kind==='product'||d.kind==='reward'){
  const path='$.'+JSON.stringify(d.id);writes.push(env.DB.prepare("INSERT INTO cache(key,val,at) SELECT ?1,json_object(?2,?3),?4 WHERE changes()=1 ON CONFLICT(key) DO UPDATE SET val=json_set(cache.val,?5,?3),at=?4").bind('admin_entitlements_'+id,d.id,d.action==='take'?1:0,now,path));
  if(d.kind==='product'&&d.action==='give'){const p=SHOP[d.id];writes.push(env.DB.prepare('INSERT OR IGNORE INTO purchases(charge_id,tg_id,item,stars,created_at,expires_at) SELECT ?1,?2,?3,0,?4,?5 WHERE changes()=1').bind('admin_asset_'+token,id,d.id,now,p.sub?subscriptionUntil:null));}
 }
 const already=await env.DB.prepare('SELECT key FROM cache WHERE key=?1').bind(key).first();if(already)return false;
 await env.DB.batch(writes);return true;
}
