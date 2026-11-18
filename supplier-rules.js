/* Versioned preview economy. No real payments or tradable rewards. */
(function(root,factory){const rules=factory();if(typeof module==='object'&&module.exports)module.exports=rules;else root.BrewCrewSupplierRules=rules;})(typeof window==='object'?window:globalThis,function(){'use strict';
const rarities=[{id:'common',name:'Обычный',color:'#82725b',seals:1,cost:4},{id:'uncommon',name:'Необычный',color:'#49845a',seals:3,cost:12},{id:'rare',name:'Редкий',color:'#417cba',seals:10,cost:45},{id:'epic',name:'Эпический',color:'#9161b5',seals:30,cost:150},{id:'legendary',name:'Легендарный',color:'#b77b21',seals:100,cost:500}];
const definitions=[
 ['cups','Чашки «Утро»',0,'shelf','Две керамические чашки с блюдцами.'],
 ['sugar','Сахарница «Сливки»',0,'shelf','Керамика и маленькая ложечка.'],
 ['dripper','Воронка «Лес»',0,'shelf','Зелёная воронка и стеклянный сервер.'],
 ['beans','Банка свежей обжарки',0,'shelf','Зёрна под деревянной крышкой.'],
 ['napkins','Салфетница «Орех»',0,'shelf','Аккуратная деталь кофейного уголка.'],
 ['plant','Суккулент «Крошка»',0,'shelf','Маленькое растение в терракоте.'],
 ['clock','Часы «Первый эспрессо»',1,'wall','Круглые часы в ореховой раме.'],
 ['poster','Постер «Кофейная ветвь»',1,'wall','Ботанический рисунок в тёплой раме.'],
 ['lamp','Лампа «Изумруд»',1,'shelf','Зелёное стекло и латунное основание.'],
 ['radio','Радио «Тёплая волна»',1,'shelf','Миниатюрное радио в деревянном корпусе.'],
 ['grinder','Ручная кофемолка «Медь»',2,'shelf','Коллекционная ручная кофемолка.'],
 ['cupstand','Коллекция эспрессо-чашек',2,'shelf','Чашки на ореховой подставке.'],
 ['tea','Чайный ларец',2,'shelf','Три сорта чая в стеклянных банках.'],
 ['siphon','Сифон «Алхимик»',3,'shelf','Стеклянная колба и медный держатель.'],
 ['cabinet','Витрина мастера',3,'shelf','Небольшая витрина с авторской керамикой.'],
 ['royalgrinder','Кофемолка «Изумрудный монарх»',4,'grind','Легендарный скин кофемолки: эмаль, латунь и золотой бункер.'],
 ['tower','Башня «Лунная капля»',4,'shelf','Коллекционная колд-брю башня из стекла и латуни.'],
 ['royalpress','Пресс «Золотая гильдия»',4,'shelf','Редкий рычажный эспрессо-пресс с изумрудной сердцевиной.'],
 ['machine','Кофемашина «Медный мастер»',4,'machine','Уникальная медная кофемашина. Вид спереди, мягкий пар. Скин без изменения скорости.']
];
const items=definitions.map(([id,name,rarity,slot,description])=>({id,name,rarity,slot,description,kind:'item',image:'img/supplier/front/'+id+'.png'}));
const tiers=[
 {id:'first',name:'Обжарка № 1',bag:'first',cost:25000,hours:0,expansion:false,weights:[75,22,3,0,0],pool:['cups','sugar','dripper','beans','napkins','plant','clock','poster','grinder']},
 {id:'hall',name:'Изумрудная гильдия',bag:'hall',cost:250000,hours:5,expansion:false,weights:[55,30,12,3,0],pool:items.filter(i=>i.rarity<4).map(i=>i.id)},
 {id:'author',name:'Королевский резерв',bag:'author',cost:1500000,hours:20,expansion:true,weights:[55,28,12,4,1],pool:items.map(i=>i.id)}
];
const currencies=['cash','xp'].flatMap(kind=>rarities.map((r,rarity)=>({id:kind+'_'+rarity,name:kind==='cash'?'Игровые рубли':'Опыт кофейни',rarity,kind,slot:null,image:'img/supplier/'+kind+'.png',description:kind==='cash'?'Поступают в кассу сразу.':'Сразу повышает опыт и уровень кофейни.'})));
const rewards=items.concat(currencies),kindWeights={item:70,cash:20,xp:10},giftOrders=60;
for(const t of tiers)t.pool.push(...currencies.filter(i=>t.weights[i.rarity]>0).map(i=>i.id));
function migrate(s){if(s.version===2)return s;s.version=2;s.giftProgress=Number(s.giftProgress)||0;s.giftTickets=Number(s.giftTickets)||0;s.equipped.table=s.equipped.table||null;return s;}
function fresh(){return{version:2,giftProgress:0,giftTickets:0,earned:0,seconds:0,seals:0,owned:{},equipped:{shelf:null,wall:null,table:null,machine:null},pity:{first:0,hall:0,author:0},opened:0,freeUsed:false,history:[],pending:null};}
function unlocked(t,s,expanded){return s.seconds>=t.hours*3600&&(!t.expansion||expanded);}
function odds(t,pity){const w=t.weights.map((v,i)=>pity>=10&&i<2?0:v),total=w.reduce((a,b)=>a+b,0);return w.map(v=>v/total*100);}
function pick(t,pity,r1,r2,r3=0){if(![r1,r2,r3].every(n=>Number.isFinite(n)&&n>=0&&n<1))throw Error('Некорректная случайная выборка');const w=odds(t,pity);let n=r1*100,rarity=w.findLastIndex(v=>v>0);for(let i=0;i<w.length;i++){n-=w[i];if(n<0){rarity=i;break;}}const kind=r3<.7?'item':r3<.9?'cash':'xp',pool=rewards.filter(i=>t.pool.includes(i.id)&&i.rarity===rarity&&i.kind===kind);return pool[Math.floor(r2*pool.length)];}
function value(item,t){return item.kind==='cash'?Math.round(t.cost*[.08,.2,.5,1,2][item.rarity]/100)*100:item.kind==='xp'?Math.round([15,35,75,150,300][item.rarity]*[1,2,4][tiers.indexOf(t)]):0;}
function probability(t,pity,item){const pool=rewards.filter(i=>t.pool.includes(i.id)&&i.rarity===item.rarity&&i.kind===item.kind);return pool.length?odds(t,pity)[item.rarity]*kindWeights[item.kind]/100/pool.length:0;}
function award(s,item,record){const duplicate=item.kind==='item'&&!!s.owned[item.id],seals=duplicate?rarities[item.rarity].seals:0;if(duplicate)s.seals+=seals;else if(item.kind==='item')s.owned[item.id]={at:record.at,source:record.tier};const row={...record,item:item.id,kind:item.kind,duplicate,seals};s.history.unshift(row);s.history=s.history.slice(0,60);s.pending=row;s.opened++;return row;}
function sale(s,n=1){const total=s.giftProgress+Math.max(0,Math.floor(n));s.giftTickets+=Math.floor(total/giftOrders);s.giftProgress=total%giftOrders;}
function account(s,delta,cat){if(delta<0)s.earned=Math.max(0,s.earned+delta);else if(['sales','tips'].includes(cat))s.earned+=delta;}
return{version:2,rarities,items,rewards,tiers,kindWeights,giftOrders,fresh,migrate,unlocked,odds,pick,value,probability,award,account,sale};
});
