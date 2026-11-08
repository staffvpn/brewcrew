const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function source(name){
 const start=html.lastIndexOf('\nfunction '+name+'(');assert.ok(start>=0,name);
 for(let end=html.indexOf('}',start);end>=0;end=html.indexOf('}',end+1)){
  const candidate=html.slice(start,end+1);try{new vm.Script(candidate);return candidate;}catch(e){if(!(e instanceof SyntaxError))throw e;}
 }throw Error(name);
}
const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
function load(names,globals={}){const c=vm.createContext({clamp,Math,...globals});vm.runInContext(names.map(source).join('\n'),c);return c;}

test('low demand permits quiet periods; arrival timers have the expected exponential mean',()=>{
 const c=load(['arrivalWait'],{Math:Object.assign(Object.create(Math),{random:()=>0.5})});
 assert.ok(c.arrivalWait(0.001)>600);
 assert.equal(c.arrivalWait(0),60);
 let sum=0;for(let i=0;i<10000;i++){c.Math.random=()=>(i+0.5)/10000;sum+=c.arrivalWait(0.01);}
 assert.ok(Math.abs(sum/10000-100)<0.1);
});

test('upgrade prices stay increasing and late equipment remains attainable',()=>{
 const c=load(['upCost','machinePower','trainCost'],{roomMult:()=>1,S:{level:12}});
 let previous=0;for(let L=0;L<20;L++){const cost=c.upCost({base:15000},L,'main');assert.ok(cost>previous);previous=cost;}
 assert.ok(previous<1000000);
 assert.ok(c.machinePower(5)/c.machinePower(4)>1.1);
 assert.ok(c.trainCost({lvl:28,rank:2})<1000000);
});

test('cafe XP grows smoothly beyond level twelve and activity cannot be farmed without a limit',()=>{
 const c=load(['cafeXpNeed','xpNeed','addXp'],{S:{day:1,xp:0,level:1},HOOK:{sfx(){}},onLevel(){},LOCK_LEVEL:12,leader:()=>null});
 let previous=0,total=0;for(let L=1;L<=26;L++){const need=c.cafeXpNeed(L);assert.ok(need>previous);previous=need;if(L<12)total+=need;}
 assert.ok(total>2500&&total<5500);
 c.S.level=12;c.addXp(10000);assert.equal(c.S.xp,60);
 c.S=JSON.parse(JSON.stringify(c.S));c.addXp(20);assert.equal(c.S.xp,60);
 c.addXp(20,'sales');assert.equal(c.S.xp,80);
 c.addXp(100,'reward');assert.equal(c.S.xp,180);
 c.S.day++;c.addXp(100);assert.equal(c.S.xp,240);
});

test('legacy migration preserves assets, level, rating and XP fraction exactly once',()=>{
 const s={money:765432,level:12,xp:0,rep:4.6,day:24,gm:23*60,isOpen:true,hours:{open:0,close:24},c:{guests:1200},staff:[{lvl:28}],rooms:[{upg:{machine:19}}],inv:[{uid:1,k:'money',v:100000}],ent:{sub:9999999999999},sz:{claimed:{p:[20]}},mods:[{label:'Новая кофейня: гостей +30%'},{label:'Оплаченное усиление'}],fin:{today:{guests:50}},reviews:[{stars:5}]};
 const oldNeed=Math.round(Math.round(130*1.42**11)*(1+0.12*4));s.xp=oldNeed/2;
 const c=load(['cafeXpNeed','ensureRating','migrateEconomy'],{S:s});
 const assets=JSON.stringify([s.staff,s.rooms,s.inv,s.ent,s.sz]);c.migrateEconomy();
 assert.equal(s.level,12);assert.equal(s.money,765432);assert.equal(s.rep,4.6);
 assert.equal(s.xp,Math.round(c.cafeXpNeed(12)/2));
 assert.equal(s.isOpen,false);assert.equal(s.hours.open,8);assert.equal(s.hours.close,20);
 assert.equal(JSON.stringify([s.staff,s.rooms,s.inv,s.ent,s.sz]),assets);
 assert.equal(s.mods.length,1);assert.equal(s.mods[0].label,'Оплаченное усиление');
 const after=JSON.stringify(s);c.migrateEconomy();assert.equal(JSON.stringify(s),after);
});

test('events do not fabricate stars; a changed review updates its contribution once',()=>{
 const s={rep:3,rating:{sum:30,count:10,reviews:0},reviews:[],fin:{today:{}}};
 const c=load(['ensureRating','syncReviewRating','repAdd'],{S:s});
 c.repAdd(0.5);assert.equal(s.rep,3);assert.equal(s.serviceBias,0.4);
 s.reviews.push({stars:5});c.syncReviewRating();assert.equal(s.rating.reviews,1);assert.equal(s.rep,35/11);
 s.reviews[0].stars=4;c.syncReviewRating();assert.equal(s.rating.sum,34);assert.equal(s.rating.reviews,1);
 const state=JSON.stringify(s);c.syncReviewRating();assert.equal(JSON.stringify(s),state);
});

test('reviews require new served guests, cannot be repeated hourly or beyond the daily limit',()=>{
 const s={isOpen:true,day:1,rep:3,uid:1,serviceBias:0,rating:{sum:30,count:10,reviews:0},reviews:[],c:{angry:0},fin:{today:{guests:0}},rooms:[]};
 const c=load(['reviewTick','ensureRating','syncReviewRating'],{S:s,chance:()=>true,dirtLevel:()=>0,room:()=>({upg:{machine:2}}),R:()=>0,pick:a=>a[0],REV_AUTH:['Тест'],REV_TXT:{4:['Хорошо']},HOOK:{struct(){},toast(){}}});
 c.reviewTick();assert.equal(s.reviews.length,0);
 s.fin.today.guests=3;c.reviewTick();assert.equal(s.reviews.length,3);
 c.reviewTick();assert.equal(s.reviews.length,3);
 s.fin.today.guests=100;c.reviewTick();assert.equal(s.reviews.length,6);assert.equal(s.rating.reviews,6);
});

test('level alone no longer changes supplier prices or staff wage index',()=>{
 const c=load(['wageIndex','roomDailyCosts','turnoverRent','turnoverStaffPay'],{S:{level:1},hoursOpen:()=>12,roomDef:()=>({rent:2800}),city:()=>({rent:1}),modMul:()=>1,roomMult:()=>1});
 const first=JSON.stringify(c.roomDailyCosts('main'));c.S.level=26;
 assert.equal(JSON.stringify(c.roomDailyCosts('main')),first);assert.equal(c.wageIndex(),1);
 assert.equal(c.turnoverRent({rev:1000000}),0);assert.equal(c.turnoverStaffPay({rev:1000000}),0);
});

test('existing pass keeps its promised base; future pass rewards use bounded operating profit',()=>{
 let season='2026-11';const c=load(['dayBase'],{S:{fin:{hist:[{rev:1000000}]}},sezInfo:()=>({id:season}),opProfit:()=>2000});
 assert.equal(c.dayBase(),300000);season='2026-12';assert.equal(c.dayBase(),5000);
 c.opProfit=()=>10000000;assert.equal(c.dayBase(),25000);
});

test('waves and decorative crowds never mint extra sales outside the demand model',()=>{
 let spawned=0,sold=0;
 const c=load(['waveTick','crowdTick','rushBurst'],{S:{isOpen:true,level:20,rush:{why:'Пик'}},rt:()=>({crowd:[{state:'stand'}]}),spawnGuest:()=>spawned++,sellOne:()=>{sold++;},bubble2(){},W:300,DOOR:[0,0]});
 for(let i=0;i<20;i++){c.waveTick('main',{waveT:0},1000);c.crowdTick('main',{through:100},1000);c.rushBurst('main');}
 assert.equal(spawned,0);assert.equal(sold,0);
});

test('a review quest is replaced when genuine replies are unavailable, without fabricating reviews',()=>{
 const s={tasks:[{kind:'reviews',goal:2,prog:0}],reviews:[],fin:{hist:[]}};
 const c=load(['reviewsTaskFix','unanswered'],{S:s,TASK_HINT:{serve:'Гости'}});c.reviewsTaskFix();
 assert.equal(s.reviews.length,0);assert.equal(s.tasks[0].kind,'serve');assert.ok(s.tasks[0].goal>0);
});

test('owner housekeeping uses supplies only while free, gives no XP and respects paid absences',()=>{
 const r={queue:[],jobs:[],mess:[{}],dirty:{}},s={isOpen:true,staff:[{isYou:true}],dishes:{main:0}};let supplies=0;
 const c=load(['ownerHousekeeping'],{S:s,hozEmpty:()=>false,hozUse:(id,v)=>supplies+=v,cleanDirty(){},meter(){},dishCount:()=>0});
 c.ownerHousekeeping('main',r,{staff:[s.staff[0]]},12);assert.equal(r.mess.length,0);assert.equal(supplies,0.02);
 r.mess.push({});r.queue.push({});c.ownerHousekeeping('main',r,{staff:[s.staff[0]]},100);assert.equal(r.mess.length,1);
 r.queue=[];s.youAwayUntil=Date.now()+100000;c.ownerHousekeeping('main',r,{staff:[]},100);assert.equal(r.mess.length,1);
});

test('daily XP slowdown persists across reloads, resets next game day and preserves promised rewards',()=>{
 const c=load(['cafeXpNeed','xpNeed','addXp'],{S:{day:1,xp:0,level:12},HOOK:{sfx(){}},onLevel(){},LOCK_LEVEL:12,leader:()=>null});
 c.addXp(180,'sales');assert.equal(c.S.xp,180);
 c.addXp(100,'sales');assert.equal(c.S.xp,200);
 c.S=JSON.parse(JSON.stringify(c.S));c.addXp(50,'sales');assert.equal(c.S.xp,210);
 c.addXp(100,'reward');assert.equal(c.S.xp,310);
 c.S.day++;c.addXp(100,'sales');assert.equal(c.S.xp,410);
});

test('external rewards cannot inflate operating profit or the profit leaderboard',()=>{
 const exclusions=vm.runInNewContext(html.match(/^const NON_OP_IN = (.+);$/m)[1]);
 const c=load(['opProfit'],{NON_OP_IN:exclusions});
 const profit=c.opProfit({L:{in:{sales:10000,tips:500,events:1500000,tasks:1000,level:5000,cashover:500,transfer:50000},out:{supply:3000,wages:2000,invest:100000}}});
 assert.equal(profit,5500);
});

test('owned legacy Stars frames stay usable after their removal from the shop',()=>{
 const s={c:{signFrame:'gold'},ent:{frames:['frame_gold']}};
 const c=load(['frameOwned','frameOwnedId'],{S:s,SIGN_FRAMES:{wood:{},gold:{},fire:{}},FRAME_SHOP:['fire']});
 assert.equal(c.frameOwnedId(),'gold');delete s.c.signFrame;assert.equal(c.frameOwnedId(),'gold');
 s.c.signFrame=null;assert.equal(c.frameOwnedId(),undefined);
 s.ent.frames.push('frame_fire');s.c.signFrame='fire';assert.equal(c.frameOwnedId(),'fire');
});
