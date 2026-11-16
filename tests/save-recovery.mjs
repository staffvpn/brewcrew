import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {guardNewCafe} from '../functions/_recovery.js';
import {onRequestPost as recovery} from '../functions/api/recovery.js';
const source=readFileSync(new URL('../save-manager.js',import.meta.url),'utf8'),KEY='brewcrew_max13';
const state=(extra={})=>({v:3,name:'Скромный Балкон №7',created:111,savedAt:Date.now(),level:12,money:543210,rooms:[{id:'main',upg:{tables:17}}],staff:[],stock:{beans:300},fin:{today:{}},c:{earnedRun:1200000},...extra});
const pause=()=>new Promise(r=>setTimeout(r,0));
function harness({local={},cloud={},info={ok:true,exists:true,cafe:'Скромный Балкон №7',level:12},failRead=false,failWrite=false,defer=false,badBoot=false}={}){
 const store=new Map(Object.entries(local)),remote={...cloud},writes=[],buttons=[];let release,booted=null,newGames=0,clears=0,fail=failWrite;
 const node=()=>({className:'',innerHTML:'',append(){},remove(){},click(){},textContent:'',onclick:null});const app=node();
 const ctx={console,crypto:webcrypto,TextEncoder,Blob,URL,AbortSignal,setTimeout,clearTimeout,Date,JSON,Number,Array,Promise,Error,Set,document:{getElementById:k=>k==='app'?app:null,createElement(tag){const n=node();if(tag==='button')buttons.push(n);return n;}},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},fetch:async()=>({ok:true,json:async()=>info})};ctx.window=ctx;
 ctx.Telegram={WebApp:{initData:'signed-fixture',initDataUnsafe:{user:{id:7}},isVersionAtLeast:()=>true,CloudStorage:{getItem(k,cb){if(failRead)return cb('offline');if(defer&&k==='bc3_n'){release=()=>cb(null,remote[k]??null);return;}cb(null,remote[k]??null);},getItems(keys,cb){cb(null,Object.fromEntries(keys.map(k=>[k,remote[k]??null])));},setItem(k,v,cb){writes.push(k);if(fail&&k!=='bc3_active')return cb('write interrupted');remote[k]=v;cb(null,true);}}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);const m=ctx.BrewCrewSaves;m.init({key:KEY,newGame(){newGames++;},clearRuntime(){clears++;},boot(s){booted=s;if(badBoot&&s.c.breakBoot)m.failed(Error('bad migration'));else m.restored(s);},afterRestore(){},save(){m.writeLocal(booted,JSON.stringify(booted));}});
 return{m,store,remote,writes,buttons,get booted(){return booted;},get newGames(){return newGames;},release:()=>release(),setFail:v=>{fail=v;}};
}
const old=state(),raw=JSON.stringify(old);
// A delayed cloud response must never expose new-cafe creation or permit writes.
let h=harness({cloud:{bc3_n:'1',bc3_0:raw},defer:true});const pending=h.m.start();await pause();assert.equal(h.m.status,'loading');assert.equal(h.newGames,0);assert(!h.m.writeLocal(state({level:1}), '{}'));assert.equal(h.writes.length,0);h.release();await pending;assert.equal(h.booted.name,old.name);assert.equal(h.booted.money,old.money);assert.equal(h.m.status,'ready');
// A known server account with empty or failed cloud storage is never a new player.
for(const opts of [{},{failRead:true},{local:{[KEY]:'{broken'}}]){h=harness(opts);await h.m.start();assert.equal(h.newGames,0);assert.equal(h.m.status,'recovery');assert.equal(h.writes.length,0);assert.equal(h.booted,null);}
h=harness({info:{ok:true,exists:false}});await h.m.start();assert.equal(h.newGames,1);
h=harness({info:{error:true}});await h.m.start();assert.equal(h.newGames,0);
// Corrupt local data can be recovered from cloud; preserve the corrupt original for diagnosis.
h=harness({local:{[KEY]:'{broken'},cloud:{bc3_n:'1',bc3_0:raw}});await h.m.start();assert.equal(h.booted.level,12);assert.equal(h.store.get('bc_save_corrupt'),'{broken');
// A newly overwritten local save cannot displace established progress; use an older local backup.
const fresh=JSON.stringify(state({created:222,level:1,c:{earnedRun:0}}));
h=harness({local:{[KEY]:fresh,bc_save_previous:raw}});await h.m.start();assert.equal(h.booted.level,12);
h=harness({local:{[KEY]:fresh}});await h.m.start();assert.equal(h.m.status,'recovery');assert.equal(h.store.get(KEY),fresh);
// Legacy keys are read without deleting or downgrading the original progress.
for(const legacy of ['brewcrew_v3','brewcrew_v3_bak']){h=harness({local:{[KEY]:fresh,[legacy]:raw}});assert.equal(h.m.peekLocal().level,12);await h.m.start();assert.equal(h.booted.level,12);assert.equal(h.store.get(legacy),raw);}
h=harness({local:{brewcrew_v3:raw},cloud:{bc3_n:'1',bc3_0:JSON.stringify(state({level:1,c:{earnedRun:0},savedAt:Date.now()+10000}))}});await h.m.start();assert.equal(h.booted.level,12,'a newer low-progress cloud must not undo legacy recovery');
// Startup/migration failure tries another intact copy, retaining the selected original.
const broken=state({savedAt:Date.now()+1000,c:{breakBoot:true}});
h=harness({local:{[KEY]:JSON.stringify(broken)},cloud:{bc3_n:'1',bc3_0:raw},badBoot:true});await h.m.start();assert.equal(h.booted.level,12);assert(!h.booted.c.breakBoot);
// Different cafe runs need an explicit selection; writes remain blocked before it.
h=harness({local:{[KEY]:raw},cloud:{bc3_n:'1',bc3_0:JSON.stringify(state({created:222,name:'Другая кофейня'}))}});await h.m.start();assert.equal(h.m.status,'choice');assert.equal(h.booted,null);assert.equal(h.writes.length,0);h.buttons.find(b=>b.textContent.startsWith(old.name)).onclick();assert.equal(h.booted.name,old.name);
// Only a deliberate reset, bound to the Telegram account, enables replacement.
h=harness({local:{bc_save_choice:JSON.stringify({user:7,resetPending:true})},cloud:{bc3_n:'1',bc3_0:raw}});await h.m.start();assert.equal(h.newGames,1);assert(h.m.authorizedReset());
h=harness({local:{bc_save_choice:JSON.stringify({user:99,resetPending:true})}});await h.m.start();assert.equal(h.newGames,0);assert(!h.m.authorizedReset());
// Cloud commits preserve the previous bank; an interrupted write cannot publish partial chunks.
h=harness({local:{[KEY]:raw},cloud:{bc3_n:'1',bc3_0:raw}});await h.m.start();await h.m.writeCloud(raw);const committed=h.remote.bc3_active;assert(committed);assert.equal(h.writes.at(-1),'bc3_active');h.setFail(true);await h.m.writeCloud(JSON.stringify(state({money:333})));assert.equal(h.remote.bc3_active,committed);h.setFail(false);await h.m.writeCloud(JSON.stringify(state({money:444})));const second=JSON.parse(h.remote.bc3_active);assert(second.previous);assert.notEqual(second.bank,second.previous.bank);h.remote['bc3'+second.bank+'_0']='corrupt';const recovered=await h.m.readCloud();assert.equal(recovered.state,'ok');assert.equal(recovered.candidates[0].data.money,old.money);
// Sequential queued writes always publish the latest complete snapshot.
await Promise.all([h.m.writeCloud(JSON.stringify(state({money:555}))),h.m.writeCloud(JSON.stringify(state({money:666})))]);assert.equal((await h.m.readCloud()).candidates[0].data.money,666);
// Real SQL: no reset attempt may overwrite established server stats, even on a later heartbeat.
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE players(tg_id INTEGER PRIMARY KEY,cafe TEXT,level INTEGER,money REAL,earned REAL,franchises INTEGER,bankrupt INTEGER,play_seconds INTEGER,last_seen INTEGER);CREATE TABLE cafe_view(tg_id INTEGER PRIMARY KEY,data TEXT);CREATE TABLE cache(key TEXT PRIMARY KEY,val TEXT,at INTEGER)');
sql.prepare('INSERT INTO players VALUES(7,?,12,543210,1200000,0,0,5000,123)').run(old.name);sql.prepare('INSERT INTO cafe_view VALUES(7,?)').run(JSON.stringify({n:old.name,lv:12}));
const env={BOT_TOKEN:'recovery-test-only',DB:{prepare(q){let args=[];return{bind(...v){args=v;return this;},async first(){return sql.prepare(q).get(...args)||null;},async run(){return sql.prepare(q).run(...args);}};}}};
for(const start of [true,false]){const r=await guardNewCafe(env,7,{start,level:1,earned:0});assert.equal(r.status,409);assert((await r.json()).recoveryRequired);}
assert.equal(sql.prepare('SELECT money FROM players').get().money,543210);assert.equal(sql.prepare('SELECT count(*) n FROM cache').get().n,1);assert.equal(JSON.parse(sql.prepare('SELECT val FROM cache').get().val).player.cafe,old.name);
assert.equal(await guardNewCafe(env,7,{level:1,earned:0,resetConfirmed:true}),null);assert.equal(await guardNewCafe(env,7,{level:1,earned:0,franchises:1}),null);assert.equal(await guardNewCafe(env,7,{level:1,earned:0,bankrupt:1}),null);assert.equal(await guardNewCafe(env,7,{level:12,earned:1200000}),null);
function signed(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id})});const secret=createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString();}
const probe=async data=>recovery({env,request:new Request('https://test/api/recovery',{method:'POST',body:JSON.stringify(data)})});assert.equal((await probe({initData:'forged',userId:7})).status,401);let r=await probe({initData:signed(7),userId:99});let info=await r.json();assert.equal(info.cafe,old.name);assert.equal(info.level,12);assert(!('money'in info));info=await(await probe({initData:signed(99),userId:7})).json();assert.equal(info.exists,false);sql.prepare('INSERT INTO players VALUES(99,NULL,1,0,0,0,0,0,123)').run();info=await(await probe({initData:signed(99)})).json();assert.equal(info.exists,false,'a bot /start registration is not an existing cafe');
console.log('PASS save recovery: delayed/error/empty cloud, existing account protection, corrupt/migration backups, run selection, owner-bound reset, atomic cloud banks and interrupted/queued writes, authenticated read-only recovery, SQL reset guard and preserved rescue record.');

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert(!html.includes("tg.CloudStorage.setItem('bc3_'+i"),'legacy writers must not bypass the atomic save protocol');

// Full server fallback restores whole records, including consumable inventory and claimed reward markers.
const rich=state({sz:{id:'2026-11',sp:6400,claimed:{f:[1,2],p:[1,5,20]}},inv:[{uid:'old-reward',k:'money',v:12000}],ach:{first:true},passSeen:['paid-pass'],ref:'r_17'});
h=harness({info:{ok:true,exists:true,level:12,saves:[rich]}});await h.m.start();assert.equal(h.m.status,'ready');assert.equal(JSON.stringify(h.booted),JSON.stringify(rich));
