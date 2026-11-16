import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {TEST_UPGRADES} from '../functions/_test-catalog.js';
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
let serial=0;const ctx={S:{staff:[],cands:[]},HOOK:{},QUIRKS:{none:{}},chance:()=>++serial%2===0,pick:a=>a[(serial++)%a.length],POOL:{guest:[33,34]}};vm.createContext(ctx);
vm.runInContext(page.slice(page.indexOf('const NAMES_M ='),page.indexOf('const NAMES =')),ctx);
vm.runInContext(page.slice(page.indexOf('const FEM ='),page.indexOf('function nameSex(')),ctx);
vm.runInContext(page.slice(page.indexOf('function makeStaff('),page.indexOf('function makeLegend(')),ctx);
for(const [role,sex]of Object.entries({'Бариста':'f','Кассир':'f','Официант':'m','Мойщица':'f','Повар':'m'})){
 for(let i=0;i<60;i++){const s=ctx.makeStaff(role,{quirk:'none'});assert.equal(s.sex,sex,role);assert(vm.runInContext(`NAMES_${sex==='f'?'F':'M'}.includes(${JSON.stringify(s.name)})`,ctx));assert.equal(vm.runInContext(`sexOf(${s.spr})`,ctx),sex,role+' sprite');}
 for(const explicit of ['m','f']){const s=ctx.makeStaff(role,{sex:explicit,quirk:'none'});ctx.normalizeStaffName(s);assert.equal(s.sex,explicit,'explicit story gender');assert.equal(vm.runInContext(`sexOf(${s.spr})`,ctx),explicit);}
}
const staff=[{id:'old_cashier',name:'Денис',role:'Кассир',sex:'m',lvl:17,xp:1234,shifts:80},{id:'old_cook',name:'Марина',role:'Повар',sex:'f',lvl:12},{id:'proper_name',name:'Маша',role:'Бариста',sex:'f'},{id:'legend',name:'Шеф Ноябрина',role:'Повар',sex:'f',prize:true,szLeg:'2026-11'},{id:'you',name:'Ты',role:'Бариста',sex:'m',isYou:true}];
ctx.S.staff=staff;ctx.S.cands=[{id:'old_candidate',name:'Вика',role:'Официант',sex:'f'}];ctx.normalizeStaffNames();assert.equal(staff[0].sex,'f');assert.notEqual(staff[0].name,'Денис');assert.equal(staff[0].lvl,17);assert.equal(staff[0].xp,1234);assert.equal(staff[0].shifts,80);assert.equal(staff[1].sex,'m');assert.notEqual(staff[1].name,'Марина');assert.equal(staff[2].name,'Маша');assert.equal(staff[3].name,'Шеф Ноябрина');assert.equal(staff[3].sex,'f');assert.equal(staff[4].name,'Ты');assert.equal(ctx.S.cands[0].sex,'m');assert.notEqual(ctx.S.cands[0].name,'Вика');const once=JSON.stringify(ctx.S);ctx.normalizeStaffNames();assert.equal(JSON.stringify(ctx.S),once,'migration must not rename again');
assert(!TEST_UPGRADES.includes('pets'));assert(!page.includes("{id:'pets', n:'Питомцы'"));assert(page.includes('const u = {pets:0}'));
console.log('PASS names: all five role appearances match name/sprite gender, explicit story genders, old staff and candidates repaired once without losing progression; pets are absent from upgrade catalogues.');
// Legacy levels refund the original price of every purchased tier, through the cash ledger.
ctx.roomMult=id=>id==='hall2'?1.2:1;ctx.ledgerize=()=>{};ctx.income=(n,cat)=>{ctx.S.money+=n;assert.equal(cat,'refunds');};
vm.runInContext(page.slice(page.indexOf('function refundRetiredPetUpgrades('),page.indexOf('// Repair old staff/candidate names in place')),ctx);
ctx.S={money:1000,c:{},rooms:[{id:'main',upg:{pets:3,tables:9}},{id:'hall2',upg:{pets:2,tables:6}}]};assert.equal(ctx.refundRetiredPetUpgrades(),775000);assert.equal(ctx.S.money,776000);assert.equal(ctx.S.rooms[0].upg.pets,0);assert.equal(ctx.S.rooms[0].upg.tables,9);const copy=JSON.stringify(ctx.S);ctx.S=JSON.parse(copy);assert.equal(ctx.refundRetiredPetUpgrades(),0);assert.equal(JSON.stringify(ctx.S),copy);
console.log('PASS pets refund: all owned tiers and room multipliers refunded once, persisted receipt, no changes to other upgrades.');
