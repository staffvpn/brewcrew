const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const release=require('../docs/release-9.1.json');
test('prepared release uses existing cover and fits the complete Telegram photo caption',async()=>{
 const {post,VERSION,CHANGELOG}=await import('../functions/_channel.js');assert.equal(VERSION,release.version);assert.deepEqual(CHANGELOG,release.changelog);
 assert.equal(release.image,'updates.jpg');assert.ok(fs.existsSync(path.resolve(__dirname,'../img',release.image)));
 const caption=[`<b>Обновление ${release.version}: ${release.title}</b>`,'',...release.changelog.map(s=>'— '+s),'',release.tail].join('\n');
 assert.ok(caption.replace(/<[^>]+>/g,'').length<=1020);
 const original=global.fetch,sent=[];
 global.fetch=async(url,options)=>{
  if(url.endsWith('/getMe'))return{json:async()=>({ok:true,result:{username:'test_bot'}})};
  assert.ok(url.endsWith('/sendPhoto'));sent.push(JSON.parse(options.body));
  return{json:async()=>({ok:true,result:{message_id:456}})};
 };
 try{
  assert.deepEqual(await post({BOT_TOKEN:'test-only',CHANNEL_ID:'@test_channel',APP_SHORT:'game'},'https://example.invalid',release.image,caption),{id:456});
  assert.equal(sent.length,1);assert.equal(sent[0].photo,'https://example.invalid/img/updates.jpg');
  assert.equal(sent[0].caption,caption);assert.equal(sent[0].reply_markup.inline_keyboard[0][0].url,'https://t.me/test_bot/game?startapp=channel');
 }finally{global.fetch=original;}
});

test('the 9.1 publisher reserves a single channel post under concurrent requests',async()=>{
 const {database}=require('./helpers/d1.cjs');const f=database();
 f.sql.exec('CREATE TABLE posts(key TEXT PRIMARY KEY,at INTEGER,ok INTEGER,info TEXT,msg_id INTEGER,caption TEXT)');
 const {publishVersion,VERSION}=await import('../functions/_channel.js');assert.equal(VERSION,'9.1');
 let calls=0;const original=global.fetch;
 global.fetch=async(url)=>{if(url.endsWith('/getMe'))return{json:async()=>({ok:true,result:{username:'test_bot'}})};calls++;return{json:async()=>({ok:true,result:{message_id:789}})};};
 try{
  const env={DB:f.env.DB,BOT_TOKEN:'test-only',CHANNEL_ID:'@test_channel'};
  await Promise.all([publishVersion(env,'https://brewcrew.pages.dev'),publishVersion(env,'https://brewcrew.pages.dev')]);
  await publishVersion(env,'https://brewcrew.pages.dev');assert.equal(calls,1);
  const row=f.sql.prepare("SELECT * FROM posts WHERE key='ver_9.1'").get();assert.equal(row.ok,1);assert.equal(row.msg_id,789);assert.ok(row.caption.includes('Обновление 9.1'));
 }finally{global.fetch=original;f.sql.close();}
});

test('preview deployments cannot publish production announcements',async()=>{
 const {channelTick}=await import('../functions/_channel.js');let accessed=false;
 await channelTick({CHANNEL_ID:'@test',BOT_TOKEN:'test-only',DB:{prepare(){accessed=true;throw Error('preview should stop');}}},'https://preview.brewcrew.pages.dev');
 assert.equal(accessed,false);
});

test('release publication requires a fresh owner capability and consumes it on success',async()=>{
 const {database}=require('./helpers/d1.cjs');const{createHash}=require('node:crypto');const f=database();
 f.sql.exec('CREATE TABLE posts(key TEXT PRIMARY KEY,at INTEGER,ok INTEGER,info TEXT,msg_id INTEGER,caption TEXT)');
 const token='test-release-capability-32-characters-long',hash=createHash('sha256').update(token).digest('hex');
 const {onRequestPost}=await import('../functions/api/release.js');
 const env={...f.env,CHANNEL_ID:'@test_channel',CHANNEL_URL:'https://t.me/test_channel',APP_URL:'https://test.invalid'};
 const send=async(t,version='9.1')=>onRequestPost({env,request:new Request('https://test.invalid/api/release',{method:'POST',body:JSON.stringify({version,token:t})})});
 assert.equal((await send(token)).status,403);
 f.sql.prepare('INSERT INTO cache VALUES(?,?,?)').run('_release_publish_9.1',hash,Date.now()-16*60000);assert.equal((await send(token)).status,403);
 f.sql.prepare('UPDATE cache SET at=?').run(Date.now());assert.equal((await send(token+'x')).status,403);assert.equal((await send(token,'8.7.1')).status,403);
 let calls=0;const original=global.fetch;global.fetch=async(url)=>{if(String(url).endsWith('/sendPhoto'))calls++;return{json:async()=>({ok:true,result:{message_id:901,username:'test_bot'}})};};
 try{const r=await send(token);assert.equal(r.status,200);const body=await r.json();assert.equal(body.url,'https://t.me/test_channel/901');assert.equal((await send(token)).status,403);assert.equal(calls,1);}finally{global.fetch=original;f.sql.close();}
});

test('an uncertain Telegram response is not retried as a duplicate photo',async()=>{
 const {database}=require('./helpers/d1.cjs');const f=database();f.sql.exec('CREATE TABLE posts(key TEXT PRIMARY KEY,at INTEGER,ok INTEGER,info TEXT,msg_id INTEGER,caption TEXT)');
 const{publishVersion}=await import('../functions/_channel.js');let calls=0;const original=global.fetch;
 global.fetch=async url=>{if(String(url).endsWith('/getMe'))return{json:async()=>({ok:true,result:{username:'test_bot'}})};calls++;throw Error('response lost');};
 try{const env={...f.env,CHANNEL_ID:'@test_channel'};await assert.rejects(()=>publishVersion(env,'https://brewcrew.pages.dev'));assert.equal(await publishVersion(env,'https://brewcrew.pages.dev'),null);assert.equal(calls,1);assert.equal(f.sql.prepare('SELECT info FROM posts').get().info,'sending');}finally{global.fetch=original;f.sql.close();}
});

test('caption correction edits the existing photo once and retains its message identity',async()=>{
 const {database}=require('./helpers/d1.cjs');const f=database();
 f.sql.exec('CREATE TABLE posts(key TEXT PRIMARY KEY,at INTEGER,ok INTEGER,info TEXT,msg_id INTEGER,caption TEXT)');
 f.sql.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?)').run('ver_9.1',123,1,'published',50,'Old wording');
 const {syncVersionCaption,versionCaption}=await import('../functions/_channel.js');
 const original=global.fetch,calls=[];global.fetch=async(url,options)=>{assert.ok(url.endsWith('/editMessageCaption'));calls.push(JSON.parse(options.body));return{json:async()=>({ok:true})};};
 try{
  const env={...f.env,CHANNEL_ID:'@test_channel'};
  assert.equal(await syncVersionCaption(env,'https://preview.brewcrew.pages.dev'),false);assert.equal(calls.length,0);
  assert.equal(await syncVersionCaption(env,'https://brewcrew.pages.dev'),true);
  assert.equal(await syncVersionCaption(env,'https://brewcrew.pages.dev'),false);
  assert.equal(calls.length,1);assert.equal(calls[0].message_id,50);assert.equal(calls[0].caption,versionCaption());
  const row=f.sql.prepare('SELECT * FROM posts').get();assert.equal(row.msg_id,50);assert.equal(row.at,123);assert.equal(row.ok,1);assert.equal(row.caption,versionCaption());
 }finally{global.fetch=original;f.sql.close();}
});

test('caption correction never creates missing posts and recovers a lost edit response',async()=>{
 const {database}=require('./helpers/d1.cjs');const f=database();
 f.sql.exec('CREATE TABLE posts(key TEXT PRIMARY KEY,at INTEGER,ok INTEGER,info TEXT,msg_id INTEGER,caption TEXT)');
 const {syncVersionCaption,versionCaption}=await import('../functions/_channel.js');const env={...f.env,CHANNEL_ID:'@test_channel'};
 const original=global.fetch;let calls=0;global.fetch=async(url)=>{assert.ok(url.endsWith('/editMessageCaption'));calls++;return{json:async()=>({ok:false,description:'Bad Request: message is not modified'})};};
 try{
  assert.equal(await syncVersionCaption(env,'https://brewcrew.pages.dev'),false);assert.equal(calls,0);
  f.sql.prepare('INSERT INTO posts VALUES(?,?,?,?,?,?)').run('ver_9.1',123,1,'published',50,'Old wording');
  assert.equal(await syncVersionCaption(env,'https://brewcrew.pages.dev'),true);
  assert.equal(f.sql.prepare('SELECT caption FROM posts').get().caption,versionCaption());
  f.sql.prepare("UPDATE posts SET caption='Old wording'").run();global.fetch=async()=>({json:async()=>({ok:false,description:'Forbidden: bot was kicked'})});
  assert.equal(await syncVersionCaption(env,'https://brewcrew.pages.dev'),false);
  assert.equal(f.sql.prepare('SELECT caption FROM posts').get().caption,'Old wording');
 }finally{global.fetch=original;f.sql.close();}
});
