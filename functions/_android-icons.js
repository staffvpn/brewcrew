import {tgApi} from './_lib.js';
export const ANDROID_ICON_PACK='TgAndroidIcons';
// This is a public emoji set; only public document IDs and animation flags are returned.
export async function androidIconPack(env){
 const key='admin_icons_android_v1';
 if(env.DB){const row=await env.DB.prepare('SELECT val,at FROM cache WHERE key=?1').bind(key).first();if(row&&Date.now()-row.at<21600000)try{return JSON.parse(row.val);}catch{}}
 const r=await tgApi(env,'getStickerSet',{name:ANDROID_ICON_PACK});
 if(!r.ok||String(r.result?.name).toLowerCase()!==ANDROID_ICON_PACK.toLowerCase())throw Error('Не удалось загрузить TgAndroidIcons');
 const pack={name:r.result.name,title:r.result.title,stickers:r.result.stickers.map(s=>({id:s.custom_emoji_id,emoji:s.emoji||'',animated:!!s.is_animated,video:!!s.is_video})),at:Date.now()};
 if(env.DB)await env.DB.prepare('INSERT OR REPLACE INTO cache(key,val,at)VALUES(?1,?2,?3)').bind(key,JSON.stringify(pack),pack.at).run();return pack;
}
