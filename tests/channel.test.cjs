const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const release=require('../docs/release-9.0.json');
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

test('the 9.0 publisher reserves a single channel post under concurrent requests',async()=>{
 const {database}=require('./helpers/d1.cjs');const f=database();
 f.sql.exec('CREATE TABLE posts(key TEXT PRIMARY KEY,at INTEGER,ok INTEGER,info TEXT,msg_id INTEGER,caption TEXT)');
 const {publishVersion,VERSION}=await import('../functions/_channel.js');assert.equal(VERSION,'9.0');
 let calls=0;const original=global.fetch;
 global.fetch=async(url)=>{if(url.endsWith('/getMe'))return{json:async()=>({ok:true,result:{username:'test_bot'}})};calls++;return{json:async()=>({ok:true,result:{message_id:789}})};};
 try{
  const env={DB:f.env.DB,BOT_TOKEN:'test-only',CHANNEL_ID:'@test_channel'};
  await Promise.all([publishVersion(env,'https://brewcrew.pages.dev'),publishVersion(env,'https://brewcrew.pages.dev')]);
  await publishVersion(env,'https://brewcrew.pages.dev');assert.equal(calls,1);
  const row=f.sql.prepare("SELECT * FROM posts WHERE key='ver_9.0'").get();assert.equal(row.ok,1);assert.equal(row.msg_id,789);assert.ok(row.caption.includes('Обновление 9.0'));
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
 const send=async(t,version='9.0')=>onRequestPost({env,request:new Request('https://test.invalid/api/release',{method:'POST',body:JSON.stringify({version,token:t})})});
 assert.equal((await send(token)).status,403);
 f.sql.prepare('INSERT INTO cache VALUES(?,?,?)').run('_release_publish_9.0',hash,Date.now()-16*60000);assert.equal((await send(token)).status,403);
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
