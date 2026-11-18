/* Versioned preview economy. No payments, cash prizes or tradable rewards. */
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
 ['machine','Кофемашина «Медный мастер»',4,'machine','Уникальная медная кофемашина. Вид спереди, мягкий пар. Скин без изменения скорости.']
];
const items=definitions.map(([id,name,rarity,slot,description])=>({id,name,rarity,slot,description,image:'img/supplier/'+id+'.png'}));
const tiers=[
 {id:'first',name:'Первая поставка',cost:25000,hours:0,expansion:false,weights:[75,22,3,0,0],pool:['cups','sugar','dripper','beans','napkins','plant','clock','poster','grinder']},
 {id:'hall',name:'Поставка для зала',cost:250000,hours:5,expansion:false,weights:[55,30,12,3,0],pool:items.filter(i=>i.rarity<4).map(i=>i.id)},
 {id:'author',name:'Авторская поставка',cost:1500000,hours:20,expansion:true,weights:[55,28,12,4,1],pool:items.map(i=>i.id)}
];
function fresh(){return{version:1,earned:0,seconds:0,seals:0,owned:{},equipped:{shelf:null,wall:null,machine:null},pity:{first:0,hall:0,author:0},opened:0,freeUsed:false,history:[],pending:null};}
function unlocked(t,s,expanded){return s.seconds>=t.hours*3600&&(!t.expansion||expanded);}
function odds(t,pity){const w=t.weights.map((v,i)=>pity>=10&&i<2?0:v),total=w.reduce((a,b)=>a+b,0);return w.map(v=>v/total*100);}
function pick(t,pity,r1,r2){if(![r1,r2].every(n=>Number.isFinite(n)&&n>=0&&n<1))throw Error('Некорректная случайная выборка');const w=odds(t,pity);let n=r1*100,rarity=w.findLastIndex(v=>v>0);for(let i=0;i<w.length;i++){n-=w[i];if(n<0){rarity=i;break;}}const pool=items.filter(i=>t.pool.includes(i.id)&&i.rarity===rarity);return pool[Math.floor(r2*pool.length)];}
function award(s,item,record){const duplicate=!!s.owned[item.id],seals=duplicate?rarities[item.rarity].seals:0;if(duplicate)s.seals+=seals;else s.owned[item.id]={at:record.at,source:record.tier};const row={...record,item:item.id,duplicate,seals};s.history.unshift(row);s.history=s.history.slice(0,60);s.pending=row;s.opened++;return row;}
function account(s,delta,cat){if(delta<0)s.earned=Math.max(0,s.earned+delta);else if(['sales','tips'].includes(cat))s.earned+=delta;}
return{version:1,rarities,items,tiers,fresh,unlocked,odds,pick,award,account};
});
