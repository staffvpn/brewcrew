import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {onRequestPost as cafes} from '../functions/api/cafes.js';
import {onRequestPost as view} from '../functions/api/cafeview.js';
import {onRequestPost as invoice} from '../functions/api/invoice.js';
import {onRequestPost as webhook} from '../functions/tg/webhook.js';
import {onRequestGet as catalog} from '../functions/api/shop.js';
import {publicCafe} from '../functions/_cafe-public.js';
import {paymentPayload} from '../functions/_payment.js';
import {purchaseState} from '../functions/_purchases.js';
import {SHOP} from '../functions/_lib.js';
import {STORE_ITEMS} from '../functions/_store.js';
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE players(tg_id INTEGER PRIMARY KEY,cafe TEXT,level INTEGER,last_seen INTEGER,banned INTEGER DEFAULT 0,badge_name TEXT,write_ok INTEGER DEFAULT 1);CREATE TABLE cafe_view(tg_id INTEGER PRIMARY KEY,vk TEXT UNIQUE,data TEXT,at INTEGER,views INTEGER DEFAULT 0,likes INTEGER DEFAULT 0);CREATE TABLE cache(key TEXT PRIMARY KEY,val TEXT,at INTEGER);CREATE TABLE purchases(charge_id TEXT PRIMARY KEY,tg_id INTEGER,item TEXT,stars INTEGER,created_at INTEGER,expires_at INTEGER,gift_from INTEGER,refunded INTEGER DEFAULT 0);CREATE TABLE admin_ops(tg_id INTEGER,op TEXT,amount INTEGER,text TEXT,created_at INTEGER,by_admin INTEGER);`);
const DB={prepare(q){let args=[];return{bind(...a){args=a;return this;},async all(){return{results:sql.prepare(q).all(...args)};},async first(){return sql.prepare(q).get(...args)||null;},async run(){const r=sql.prepare(q).run(...args);return{meta:{changes:Number(r.changes)}};}};},async batch(a){sql.exec('BEGIN');try{const out=[];for(const s of a)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={DB,BOT_TOKEN:'fixture-token',WEBHOOK_SECRET:'fixture-secret'};
function signed(id=101){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id})}),key=createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest(),check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');p.set('hash',createHmac('sha256',key).update(check).digest('hex'));return p.toString();}
async function call(fn,data={},extra={}){const r=await fn({request:new Request('https://test/api',{method:'POST',body:JSON.stringify({initData:signed(),shopVersion:2,...data})}),env:{...env,...extra}});return{status:r.status,...await r.json()};}
for(let i=101;i<119;i++)sql.prepare('INSERT INTO players(tg_id,cafe,level,last_seen,banned)VALUES(?,?,?,?,?)').run(i,i===102?'ЁЖИК КОФЕ':i===103?'Кофейня 100%':i===104?'Кофейня _буква':i===105?'СЕКРЕТ':'Кофейня '+i,5,1000-i,i===105?1:0);
assert.equal((await call(cafes,{initData:'forged'})).status,401);
let r=await call(cafes);assert.equal(r.list.length,3);assert(r.more);assert(r.list.every(x=>!('tg_id'in x)&&!('first_name'in x)));assert.equal((await call(cafes,{q:'ежик'})).list[0].cafe,'ЁЖИК КОФЕ');assert.equal((await call(cafes,{q:'ЁЖИК'})).list.length,1);assert.equal((await call(cafes,{q:'100%'})).list.length,1);assert.equal((await call(cafes,{q:'_буква'})).list.length,1);assert.equal((await call(cafes,{q:'секрет'})).list.length,0);assert.equal((await call(cafes,{q:'Кофейня'})).list.length,12);
let vk=r.list[0].vk;r=await call(view,{vk});assert(r.data.incomplete);assert.equal(r.data.n,'ЁЖИК КОФЕ');assert.equal(r.views,1);assert.equal((await call(view,{vk,like:1})).likes,1);assert.equal((await call(view,{vk,like:1})).ok,false);assert.equal(sql.prepare('SELECT likes FROM cafe_view WHERE vk=?').get(vk).likes,1);assert.equal((await call(view,{vk:'not-a-key'})).status,400);
const safe=publicCafe({n:'Настоящая',money:999,staff:[{private:'data'}],sk:{floor:'forged',wall:'sage',decor:{garlandL:1,forged:1}},so:['room:wide','forged:test'],st:[{r:'Бариста',n:'Анна',x:'f',p:1,phone:'secret',salary:1000},{r:'forged'}],up:{machine:10000},open:false});assert(!('money'in safe));assert.equal(safe.st.length,1);assert(!('salary'in safe.st[0]));assert.equal(safe.sk.floor,undefined);assert.equal(safe.sk.wall,'sage');assert.equal(safe.sk.decor.forged,undefined);assert.deepEqual(safe.so,['room:wide']);assert.equal(safe.up.machine,20);assert.equal(safe.open,false);
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.deepEqual(JSON.parse(source.match(/var BC_STORE=(.+?),BC_PAID_WANTED=null;/)[1]),SHOP,'browser and server prices must agree');
assert.equal((await call(invoice,{item:'skin_floor_herr'})).status,400,'earned-cash products must never create Stars invoices');
const items=await(await catalog()).json();assert.equal(items.currency,'MIXED');assert.equal(items.rublePayments,false);assert.equal(items.items.length,Object.keys(SHOP).length);for(const [key,p]of Object.entries(STORE_ITEMS)){assert(Number.isInteger(p.stars)&&p.stars>0,key);assert.equal(SHOP[key].stars,p.stars,key);}assert.equal(SHOP.skin_room_wide.gamePrice,6000000);assert.equal(SHOP.skin_room_deep.gamePrice,15000000);
const requests=[];globalThis.fetch=async(url,req)=>{requests.push({url,body:JSON.parse(req.body)});return new Response(JSON.stringify({ok:true,result:'https://t.me/fixture-invoice'}),{headers:{'content-type':'application/json'}});};
assert.equal((await call(invoice,{item:'__proto__'})).status,400);assert.equal((await call(invoice,{initData:'forged',item:'skin_mach_m_steam'})).status,401);
r=await call(invoice,{item:'skin_mach_m_steam',stars:1});assert(r.ok);const quote=requests.at(-1).body;assert.equal(quote.prices[0].amount,499);assert.equal(quote.currency,'XTR');const pay={invoice_payload:quote.payload,currency:'XTR',total_amount:499,telegram_payment_charge_id:'charge-1'};assert(await paymentPayload(env,pay,101));assert.equal(await paymentPayload(env,{...pay,total_amount:1},101),null);assert.equal(await paymentPayload(env,{...pay,currency:'RUB'},101),null);assert.equal(await paymentPayload(env,pay,102),null);assert.equal(await paymentPayload(env,{...pay,invoice_payload:JSON.stringify({u:101,i:'skin_mach_m_steam'})},101),null);
async function paid(payment=pay,secret='fixture-secret',extra={}){const response=await webhook({request:new Request('https://test/tg/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body:JSON.stringify({message:{from:{id:101},chat:{id:101},successful_payment:payment}})}),env:{...env,...extra}});return response;}
assert.equal((await paid(pay,'forged')).status,403);assert.equal((await paid({...pay,total_amount:1})).status,400);assert.equal((await paid(pay,'',{WEBHOOK_SECRET:undefined})).status,503);assert.equal((await paid()).status,200);assert.equal((await paid()).status,200);assert.equal(sql.prepare('SELECT count(*) n FROM purchases').get().n,1);assert((await purchaseState(env,101)).skins.some(x=>x.category==='mach'&&x.id==='m_steam'));assert.equal((await call(invoice,{item:'skin_mach_m_steam'})).ok,false);
// A completed cash payment retried by Telegram must grant the balance once.
const cash={invoice_payload:JSON.stringify({u:101,i:'cash_s'}),currency:'XTR',total_amount:25,telegram_payment_charge_id:'cash-1'};await paid(cash);await paid(cash);assert.equal(sql.prepare("SELECT count(*) n FROM admin_ops WHERE op='cash'").get().n,1);
sql.prepare("UPDATE purchases SET refunded=1 WHERE charge_id='charge-1'").run();assert.equal((await purchaseState(env,101)).skins.length,0);
// Invoices opened before repricing remain valid, including gifts for items now sold for earned cash.
sql.prepare('INSERT INTO cache(key,val,at)VALUES(?,?,?)').run('invoice_before_mixed',JSON.stringify({u:101,i:'skin_floor_herr',g:102,amount:25}),Date.now()-10000);
const legacy={invoice_payload:JSON.stringify({u:101,i:'skin_floor_herr',g:102,n:'before_mixed'}),currency:'XTR',total_amount:25,telegram_payment_charge_id:'legacy-gift'};
assert(await paymentPayload(env,legacy,101));assert.equal((await paid(legacy)).status,200);assert((await purchaseState(env,102)).skins.some(x=>x.id==='herr'));
for(const item of items.items){assert(['GAME','XTR'].includes(item.currency));assert(Number.isInteger(item.price)&&item.price>0);if(item.currency==='GAME'){assert.equal(item.stars,0);assert.equal(item.price,item.gamePrice);}else assert.equal(item.price,item.stars);}
assert.equal((await call(invoice,{item:'cash_s',shopVersion:1})).status,409,'old clients must refresh prices before a new purchase');
r=await call(invoice,{item:'cash_s'});assert(r.ok);const fixedQuote=requests.at(-1).body;assert.equal(fixedQuote.prices[0].amount,149);
const fixedPay={invoice_payload:fixedQuote.payload,currency:'XTR',total_amount:149,telegram_payment_charge_id:'fixed-cash-1'};assert.equal((await paymentPayload(env,fixedPay,101)).fixedCash,3000000);
const forgedCash={...fixedPay,invoice_payload:JSON.stringify({...JSON.parse(fixedQuote.payload),fixedCash:999999999})};assert.equal((await paymentPayload(env,forgedCash,101)).fixedCash,3000000,'payout comes from the saved quote');
await paid(fixedPay);await paid(fixedPay);const fixedOps=sql.prepare("SELECT * FROM admin_ops WHERE op='give' AND text LIKE 'Stars · %'").all();assert.equal(fixedOps.length,1);assert.equal(fixedOps[0].amount,3000000);
for(const sku of ['int_soviet','int_scandi','int_loft','int_neon','int_autumn','int_winter'])assert.equal(SHOP[sku].currency,'XTR');
const cashTotal=Object.values(SHOP).filter(x=>x.currency==='GAME').reduce((a,x)=>a+x.gamePrice,0);assert(cashTotal>=150000000&&cashTotal<=250000000,'cash catalogue must span many 3m-revenue shifts');
console.log('PASS: mixed earned-cash/Stars catalogue, signed invoices, owner/currency/amount validation, payment retry idempotency, receipt restoration, authenticated cafe directory, first three and pagination, Cyrillic and literal search, private field filtering, saved-layout availability and daily respect.');

assert.equal((await call(view,{vk})).liked,true,'repeat visit knows about today’s respect');const placeSnap=publicCafe({pv:2,up:{tables:1000,machine:1000}});assert.equal(placeSnap.up.tables,28);assert.equal(placeSnap.up.machine,20);assert.equal(placeSnap.pv,2);
// The standalone kiosk is a server-priced permanent purchase, not a register level reward.
assert.equal(SHOP.skin_terminal_self_service.currency,'XTR');assert.equal(SHOP.skin_terminal_self_service.stars,999);
r=await call(invoice,{item:'skin_terminal_self_service',stars:1});assert(r.ok);const kioskQuote=requests.at(-1).body;assert.equal(kioskQuote.prices[0].amount,999);
const kioskPay={invoice_payload:kioskQuote.payload,currency:'XTR',total_amount:999,telegram_payment_charge_id:'kiosk-1'};
assert.equal(await paymentPayload(env,{...kioskPay,total_amount:1},101),null);await paid(kioskPay);await paid(kioskPay);
assert.equal(sql.prepare("SELECT count(*) n FROM purchases WHERE charge_id='kiosk-1'").get().n,1);
assert((await purchaseState(env,101)).skins.some(x=>x.category==='terminal'&&x.id==='self_service'));
assert.equal((await call(invoice,{item:'skin_terminal_self_service'})).ok,false);
assert.deepEqual(publicCafe({sk:{terminal:'self_service'},so:['terminal:self_service']}).so,['terminal:self_service']);
console.log('PASS standalone kiosk: authoritative 999-Star invoice, wrong amount rejection, payment retry idempotency, receipt restoration and public cafe snapshot.');
