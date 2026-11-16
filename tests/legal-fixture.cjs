const manifest=require('../legal/manifest.json');
async function acceptLegal(p){
 await p.route('**/api/legal',async route=>{const userId=await p.evaluate(()=>Number(window.Telegram.WebApp.initDataUnsafe.user.id));await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,accepted:true,version:manifest.version,receipt:{userId,version:manifest.version,documents:manifest.documents,termsAccepted:true,privacyRead:true,adult:true,recordedAt:Date.now(),recordId:'legal-fixture-record',source:'start'}})});});
 for(const id of ['terms','privacy','adult'])await p.locator('#legal-'+id).check();
}
module.exports={acceptLegal};
