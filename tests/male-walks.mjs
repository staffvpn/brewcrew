import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../index.html',import.meta.url),'utf8'),cm=JSON.parse(s.match(/var CM=(\{.*?\});/s)[1]);
let count=0;for(const family of ['guestm','elder'])for(const dir of ['south','south-east','east','north-east','north']){const c=cm[family+'_walk:'+dir];assert.equal(c.walkRepair,'fixed-view-v2');assert.equal(c.f.length,6);assert.equal(c.w,80);assert.equal(c.h,80);assert.equal(c.ax,40);assert(c.ay>=76&&c.ay<=80);assert(c.k>.9&&c.k<1.15);assert(!c.frameScale,'walking must keep one pixel scale throughout the loop');count+=c.f.length;}
const eyes=JSON.parse(s.match(/var BC_EYES=(\{.*?\});/s)[1]);assert(Object.keys(eyes).every(k=>!k.startsWith('guest')&&!k.startsWith('elder')&&!k.startsWith('masha')&&!k.startsWith('liza')),'guest faces must use their original artwork without eye overlays');
assert(s.includes("y=e.y+(e.y>170&&e.y<BAR_BOT?Math.min(1,(e.y-170)/28)*2:0)"),'baristas should stand lower behind the counter');
assert(s.includes("pimg('fridge',294.5,146.5,72)"));const fridgeLeft=294.5-72*28/75/2,fridgeRight=294.5+72*28/75/2;assert(fridgeLeft>280);assert(fridgeRight<=308);assert(fridgeLeft<300&&fridgeRight>300,'fridge conceals the rear-counter seam');
console.log('PASS:',count,'new male walking frames in five fixed directions, constant scale, untouched guest eyes, lower baristas, smaller refrigerator flush with rear wall and clear of chef.');
