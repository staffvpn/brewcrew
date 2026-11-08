const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const release=require('../docs/release-8.8.0.json');
test('prepared release uses existing cover and fits the complete Telegram photo caption',async()=>{
 const {post}=await import('../functions/_channel.js');
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
