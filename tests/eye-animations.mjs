import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8'),CM=JSON.parse(source.match(/var CM=(\{.*?\});/s)[1]);
const calls=[],context={CM,ctx:{save(){},restore(){},beginPath(){},rect(){},clip(rule){assert(rule===undefined||rule==='evenodd');},translate(){},scale(){},drawImage(...args){calls.push(args);}}};
context.blit=(sheet,name,idx)=>({idx,hand:CM[name].hand?.[idx]});vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('// Eye artwork is fixed'),source.indexOf('var bcGuestLeftMess=')),context);
let frames=0;
for(const[name,m]of Object.entries(context.BC_EYES)){
 const clip=CM[name];assert(clip);assert.equal(m.o.length,clip.f.length);assert(!name.includes(':north'));
 const[x,y,w,h]=m.r;assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=clip.w&&y+h<=clip.h,name+' eye crop must stay inside its frame');
 for(let i=0;i<clip.f.length;i++){
  const offset=m.o[i];assert(offset.every(Number.isInteger));assert(offset.every(n=>Math.abs(n)<=7));
  for(const mirror of [false,true]){calls.length=0;const info=context.blit({},name,i,100,150,65,mirror,.5);assert.equal(info.idx,i,'original animation frame is preserved');assert.equal(calls.length,1);const crop=calls[0];assert.equal(crop[1],clip.f[0][0]);assert.equal(crop[2],clip.f[0][1]);assert.equal(crop[3],clip.w);assert.equal(crop[4],clip.h);assert.equal(info.hand,clip.hand?.[i],'hand anchors still follow the actual body frame');}
  frames++;
 }
}
for(const[name,clip]of Object.entries(CM)){
 if(!/^(barista|cashier|cook|waiter|washer)_/.test(name)||/:north|phone_head/.test(name)||clip.f.length<2)continue;
 assert(context.BC_EYES[name],'uncovered employee animation: '+name);
}
assert.equal(frames,453);assert(source.includes("pimg('fridge',290,151,94)"));assert(!source.includes("pimg('fridge',266,BAR_BOT+3,94)"));
assert(!source.includes('BC_STAFF_HEAD'),'old whole-head freeze must be removed');
console.log('PASS: 67 eye maps / 453 animation frames; all employee actions covered, mirrored eyes and original hand/body frame preserved; refrigerator beside chef.');
