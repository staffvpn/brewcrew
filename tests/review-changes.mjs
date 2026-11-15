import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {onRequestPost as retire} from '../functions/api/market.js';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rooms={main:{mess:[],dirty:{}}},draws=[];
const e={rt:id=>rooms[id],slotOf:()=>[80,290,'table',0],dirtyKey:()=> 't0',chance:()=>true,TABLES:[{x:80,y:290}],clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),RW:()=>380,W:308,H:620,meter:()=>{},EL:(...x)=>draws.push(x),item:(...x)=>draws.push(x),ctx:{fillRect:()=>{}}};
vm.createContext(e);
vm.runInContext(source.match(/^function leaveMess\(id, g\).*$/m)[0],e);
vm.runInContext(source.slice(source.indexOf('var bcGuestLeftMess='),source.indexOf('var BC_REMOVED_DECOR=')),e);
for(let i=0;i<10000;i++)e.messTick('main',rooms.main,10);
assert.equal(rooms.main.mess.length,0,'empty tables never make random litter');
e.leaveMess('main',{state:'queue'});assert.equal(rooms.main.mess.length,0);
const diner={seat:0,state:'sit',orders:2};e.leaveMess('main',diner);
assert.equal(rooms.main.mess.length,1);assert.equal(rooms.main.dirty.t0,2);assert.equal(rooms.main.mess[0].source,'table-departure');assert.equal(rooms.main.mess[0].x,98);assert.equal(rooms.main.mess[0].y,308);
e.leaveMess('main',diner);assert.equal(rooms.main.mess.length,1,'same diner cannot litter twice');
for(let i=0;i<10000;i++)e.messTick('main',rooms.main,10);assert.equal(rooms.main.mess.length,1);
e.hmDirtyTable({x:80,y:290},4);assert(draws.every(d=>Math.abs((typeof d[0]==='string'?d[1]:d[0])-80)<=6));assert(draws.every(d=>(typeof d[0]==='string'?d[2]:d[1])>=275),'dishes moved lower on the tabletop');
assert(source.includes('SZ_TIERS = 50'));assert(!source.includes('После сотой ступени'));assert(!source.includes('marketSection')&&!source.includes('mkSellSection')&&!source.includes("['market','Биржа']"));
for(const name of ['cash','xp','supplies','boost','style','staff','badge','machine','pet','drink']){const bytes=readFileSync(new URL('../img/pass-rewards/'+name+'.png',import.meta.url));assert.equal(bytes.readUInt32BE(16),48);assert.equal(bytes.readUInt32BE(20),48);}
const skin={decor:{clock:1,d_monstera:1},lux:{clock:1,d_aquarium:1,d_jukebox:1},table:'t_square'};
const skins={skinS:()=>skin,BC_REMOVED_DECOR:['clock','d_monstera'],BC_REMOVED_OBJECTS:['d_gumball','d_arcade','d_jukebox'],applySkins:()=>{}};skins.window=skins;vm.createContext(skins);vm.runInContext(source.slice(source.indexOf('var bcReviewApply='),source.indexOf('var bcReviewShop=')),skins);skins.applySkins();assert.equal(skin.decor.clock,0);assert.equal(skin.table,'light');assert.equal(skin.lux.d_jukebox,0);assert.equal(skin.lux.clock,1);assert.equal(skin.lux.d_aquarium,1);
assert(source.includes('Math.max(z.sp, Math.min(SZ_TIERS*SZ_TIER, z.sp + ps.plus*SZ_TIER))'),'existing season points must not decrease when buying a pass');
assert(source.includes("if(!st.outdoor)items.push({y:BAR_BOT+3,f:function(){pimg('fridge',266,BAR_BOT+3,94);}})"),'fridge must cover the original counter seam at both widths');
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE market(id INTEGER PRIMARY KEY,seller INTEGER,staff TEXT,status TEXT);CREATE TABLE admin_ops(id INTEGER PRIMARY KEY,tg_id INTEGER,op TEXT,amount INTEGER,text TEXT,created_at INTEGER,by_admin INTEGER);');
for(const[id,seller,name]of [[1,123,'Иван'],[2,123,'Анна'],[3,456,'Чужой']])sql.prepare('INSERT INTO market VALUES(?,?,?,?)').run(id,seller,JSON.stringify({name,role:'Бариста',lvl:10}),'open');
const DB={prepare(q){return{bind(...a){return{run(){return{meta:{changes:Number(sql.prepare(q).run(...a).changes)}}}}}}},async batch(stmts){sql.exec('BEGIN');try{const result=stmts.map(s=>s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const BOT_TOKEN='retire-fixture';function sign(id){let p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id})});let check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(BOT_TOKEN).digest()).update(check).digest('hex'));return p.toString();}
async function call(op,id=123,initData=sign(id)){return retire({request:new Request('https://test/api/market',{method:'POST',body:JSON.stringify({op,initData})}),env:{DB,BOT_TOKEN}});}
assert.equal((await call('retire',123,'forged')).status,401);
for(const op of ['list','buy','cancel','get','prices'])assert.equal((await call(op)).status,410);
assert.equal((await (await call('retire')).json()).returned,2);assert.equal((await (await call('retire')).json()).returned,0);
assert.equal(sql.prepare('SELECT count(*) n FROM admin_ops').get().n,2);assert.equal(sql.prepare("SELECT status FROM market WHERE seller=456").get().status,'open');
assert(sql.prepare('SELECT * FROM admin_ops').all().every(x=>x.tg_id===123&&x.op==='trreturn'&&x.amount===0));
const returned=sql.prepare('SELECT * FROM admin_ops').all(),state={c:{},staff:[]};const t={S:state,onTrack:()=>{},makeStaff:role=>({id:Math.random(),role}),hire:(st,room)=>{st.room=room;state.staff.push(st)},syncScene:()=>{},save:()=>{},toast:()=>{},console};vm.createContext(t);vm.runInContext(source.slice(source.indexOf('var bcReviewTrack='),source.indexOf('var bcRetireBusy=')),t);t.onTrack({ok:true,ops:returned});t.onTrack({ok:true,ops:returned});assert.equal(state.staff.length,2,'retry cannot duplicate returned employees');assert.deepEqual(state.staff.map(s=>s.name),['Иван','Анна']);
console.log('PASS: only diners create table litter; dirty dish alignment; 50 tiers and PixelLab assets; transfer API retired; durable, owner-only and idempotent staff returns.');
