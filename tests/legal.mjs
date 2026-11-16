import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {onRequestPost as legal} from '../functions/api/legal.js';
import {onRequest as middleware} from '../functions/api/_middleware.js';
import {LEGAL_VERSION,LEGAL_DOCUMENTS,legalKey} from '../functions/_legal.js';
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE cache(key TEXT PRIMARY KEY,val TEXT,at INTEGER)');
const env={BOT_TOKEN:'legal-test-only',DB:{
 prepare(q){
  let args=[];
  return {
   bind(...a){args=a;return this;},
   async first(){return sql.prepare(q).get(...args)||null;},
   async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}
  };
 }
}};
const init=(id=12345)=>{let p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id})}),secret=createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();};
const request=(data={},path='legal')=>new Request('https://brewcrew.pages.dev/api/'+path,{method:'POST',body:JSON.stringify({initData:init(),...data})});
const call=async(data={},overrides={})=>{const r=await legal({request:request(data),env:{...env,...overrides}});return{status:r.status,...await r.json()};};
let next=0;const enter=async(req)=>middleware({request:req,env,next:()=>{next++;return new Response('allowed');}});
assert.equal((await enter(request({},'track'))).status,428);assert.equal(next,0);
assert.equal((await enter(request({initData:'forged'},'invoice'))).status,401);
assert.equal((await enter(new Request('https://brewcrew.pages.dev/api/config'))).status,200);
assert.equal((await enter(request({},'legal'))).status,200);assert.equal((await enter(request({},'ack'))).status,200);
assert.equal((await call({action:'status'})).accepted,false);
const valid={action:'accept',version:LEGAL_VERSION,termsAccepted:true,privacyRead:true,adult:true,source:'start'};
for(const flag of ['termsAccepted','privacyRead','adult'])for(const wrong of [false,1,'true',null])assert.equal((await call({...valid,[flag]:wrong})).status,400,flag);
assert.equal((await call({...valid,initData:'forged'})).status,401);
assert.equal((await call({...valid,version:'2026-01-01'})).status,409);
assert.equal((await call({...valid,source:'forged'})).status,400);
assert.equal((await call(valid,{DB:null})).status,503);
assert.equal(sql.prepare('SELECT count(*) n FROM cache').get().n,0);
let r=await call({...valid,userId:99999,recordedAt:1,recordId:'forged',documents:{}});assert(r.accepted);assert.equal(r.receipt.userId,12345);assert(r.receipt.recordedAt>Date.now()-10000);assert.notEqual(r.receipt.recordId,'forged');assert.deepEqual(r.receipt.documents,LEGAL_DOCUMENTS);
assert.equal((await enter(request({},'track'))).status,200);assert.equal((await enter(request({initData:init(99999)},'track'))).status,428);
const again=await call({...valid,source:'restore'});assert.deepEqual(again.receipt,r.receipt);assert.deepEqual((await call({action:'status'})).receipt,r.receipt);
assert.equal(sql.prepare('SELECT count(*) n FROM cache').get().n,1);
sql.prepare('UPDATE cache SET val=? WHERE key=?').run('{broken',legalKey(12345));assert.equal((await enter(request({},'invoice'))).status,428);assert((await call(valid)).accepted,'corrupt acknowledgement must be recoverable');
for(const [file,hash]of Object.entries(LEGAL_DOCUMENTS)){const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.equal(createHash('sha256').update(text).digest('hex'),hash,file);assert(text.includes('2026-11-16'));assert(text.includes('@brew_support'));assert(!text.includes('{{'));}
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8'),gate=readFileSync(new URL('../legal-gate.js',import.meta.url),'utf8');assert(page.includes('BrewCrewLegal.install();'));assert(page.indexOf('BrewCrewLegal.run(function(){')<page.lastIndexOf('boot(bcBootLocal)'));assert(gate.includes("const VERSION='"+LEGAL_VERSION+"'"));new Function(gate);
console.log('PASS legal: signed, owner-bound versioned acknowledgements, all flags mandatory, server timestamp/hash, retries/CAS recovery, API middleware, public docs/support and page checksums.');

for(const file of Object.keys(LEGAL_DOCUMENTS)){assert.deepEqual(readFileSync(new URL('../legal/archive/'+LEGAL_VERSION+'/'+file,import.meta.url)),readFileSync(new URL('../'+file,import.meta.url)),'archive must preserve the exact accepted bytes');assert(readFileSync(new URL('../legal/'+file.replace('.html','')+'-'+LEGAL_VERSION+'.pdf',import.meta.url)).subarray(0,5).equals(Buffer.from('%PDF-')));}
