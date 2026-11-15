import {TEST_SKINS,TEST_UPGRADES} from './_test-catalog.js';
const roles=['Бариста','Кассир','Официант','Мойщица','Повар'];
const num=(x,min,max,def=min)=>Number.isFinite(+x)?Math.max(min,Math.min(max,+x)):def;
const text=(x,n)=>typeof x==='string'?x.slice(0,n):'';
export function publicCafe(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
 const up={};for(const id of TEST_UPGRADES)up[id]=Math.round(num(raw.up?.[id],0,20));
 const sk={};for(const[cat,ids]of Object.entries(TEST_SKINS)){if(cat==='style')continue;const x=(raw.sk||{})[cat];if(x&&typeof x==='object'&&!Array.isArray(x)){sk[cat]={};for(const id of ids)if(x[id])sk[cat][id]=1;}else if(ids.includes(x)||cat==='mach'&&x==='m_season_gold'&&raw.gold)sk[cat]=x;}
 const own=[];for(const k of Array.isArray(raw.so)?raw.so.slice(0,200):[]){if(typeof k!=='string')continue;const[cat,id]=k.split(':');if(TEST_SKINS[cat]?.includes(id))own.push(k);}
 const st=(Array.isArray(raw.st)?raw.st:[]).slice(0,14).filter(x=>x&&roles.includes(x.r)).map(x=>({r:x.r,n:text(x.n,30),x:x.x==='f'?'f':'m',p:Math.round(num(x.p,0,200)),l:Math.round(num(x.l,0,100)),pz:!!x.pz,so:!!x.so,lv:Math.round(num(x.lv,1,100,10))}));
 return {v:2,n:text(raw.n,40),lv:Math.round(num(raw.lv,1,10000,1)),rp:num(raw.rp,0,5,3),up,it:TEST_SKINS.style.includes(raw.it)?raw.it:null,fr:/^[a-z_0-9]{1,30}$/.test(raw.fr||'')?raw.fr:null,st,sk,so:own,gold:!!raw.gold,pet:!!raw.pet,gm:num(raw.gm,0,1439,840),weather:['clear','sun','rain','cloud','snow'].includes(raw.weather)?raw.weather:'clear',open:raw.open!==false,kt:Math.round(num(raw.kt,0,5)),day:Math.round(num(raw.day,1,100000,1)),bf:!!raw.bf,nb:!!raw.nb,fl:!!raw.fl,uf:['classic','denim','wine'].includes(raw.uf)?raw.uf:null,mu:['jazz','lofi','rock'].includes(raw.mu)?raw.mu:null,mi:Math.round(num(raw.mi,0,3)),bd:Math.round(num(raw.bd,0,1000)),incomplete:!!raw.incomplete};
}
export function cafeNameExpr(column='p.cafe'){let x=column;const upper='АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';for(const ch of upper)x=`replace(${x},'${ch}','${ch.toLowerCase()}')`;return `lower(replace(${x},'ё','е'))`;}
export function cafeNameQuery(q){return String(q||'').trim().slice(0,40).toLowerCase().replaceAll('ё','е').replace(/[\\%_]/g,'\\$&');}
