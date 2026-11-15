import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8'),calls=[];
class Image {constructor(){this.naturalWidth=48;this.naturalHeight=48;}}
const e={Image,S:{active:'main',szPet:true},ready:()=>true,passOwned:()=>true,BAR_FACE:192,BT:()=>188,sceneUpgradeProps:(st,u,items)=>items.push({y:192,f:()=>calls.push('counter')}),ctx:{save(){},restore(){},drawImage(...a){calls.push(a);}},drawNeon:()=>calls.push('old-name')};e.window=e;vm.createContext(e);
vm.runInContext(source.slice(source.indexOf('/* Season rewards use the current counter layout'),source.indexOf('/* Pending orders reserve different floor positions')),e);
let items=[];e.sceneUpgradeProps({outdoor:false},{},items,0,{});assert.equal(items.length,2);assert.equal(items[1].y,193);items.sort((a,b)=>a.y-b.y).forEach(x=>x.f());assert.equal(calls[0],'counter','counter must paint before the cat');let cat=calls[1];assert.equal(cat[0].src,'img/pass-rewards/pet.png');assert.equal(cat.at(-1),24);assert.equal(cat[5]+cat[7]/2,176);assert.equal(cat[6]+cat[8],189);
e.drawNeon();assert(!calls.includes('old-name'));
for(const state of [{pet:false,own:true,active:'main',out:false},{pet:true,own:false,active:'main',out:false},{pet:true,own:true,active:'hall2',out:false},{pet:true,own:true,active:'main',out:true}]){e.S.szPet=state.pet;e.S.active=state.active;e.passOwned=()=>state.own;items=[];e.sceneUpgradeProps({outdoor:state.out},{},items,0,{});assert.equal(items.length,1,'cat eligibility');}
const dishes=[];const d={EL:(x,y,w,h)=>dishes.push({x,y,w,h}),item:(n,x,y,h)=>dishes.push({x,y,w:8,h}),ctx:{}};vm.createContext(d);vm.runInContext(source.slice(source.indexOf('function dishStack('),source.indexOf('function backBar(')),d);d.dishStack(25,103,10);assert(dishes.every(x=>x.x+x.w/2<50),'dirty dishes must stay left of the coffee machine');
assert(source.includes('dishStack(25, TOP-2'));assert(!source.includes('dishStack(46, TOP-2'));assert(!source.includes('dishStack(40, BT()-1'));assert(source.includes('DISHPILE={x:28,y:TOP-6}'));
assert(source.includes("if(k==='traffic' && S && S.neonSign === sezId()) m *= 1.05"),'neon reward bonus preserved');
console.log('PASS: reward cat paints after counter, correct ownership/room visibility; duplicate title disabled while bonus retained; all dirty dishes remain at the sink away from the machine and display case.');
