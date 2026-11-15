import {tgApi} from './_lib.js';
const PACK='tgiosicons';
const ICONS={home:['🏠','⌂','🏡'],players:['👥','👤'],search:['🔍','🔎'],money:['💰','💵','₽'],assets:['🎁','📦'],take:['🗑','➖','❌'],give:['➕','🎁'],settings:['⚙️','⚙'],stats:['📊','📈'],news:['📣','📢'],history:['🕒','📋'],back:['⬅️','◀️'],ok:['✅','✔️'],refresh:['🔄','🔃'],star:['⭐️','⭐','🌟'],lock:['🔒','🛡'],edit:['✏️','📝']};
let loadedAt=0,icons={};
export function iconKey(data='',text=''){
 const act=data.split(':')[1]||'';
 if(/home/.test(act))return'home';if(/find/.test(act))return'search';if(/pl|^u$|ufr|refs/.test(act))return'players';if(/^a(go|confirm)/.test(act)||/Подтвердить|Да,/.test(text))return'ok';if(/Отобрать|Изъять|Удалить|Списать|Обнулить|Забанить/.test(text))return'take';if(/^asset|^inv|^gv|^ust|^agroup/.test(act))return'assets';if(/^um|^m[gctz]|Деньги/.test(act))return'money';if(/mt|ops/.test(act))return'settings';if(/buy|sz|Пропуск/.test(act))return'star';if(/log|uh/.test(act))return'history';if(/Обновить/.test(text))return'refresh';if(/Канал|Рассылка|post|^ch$/.test(text+act))return'news';if(/Назад|Карточка|Главное|Отмена|‹/.test(text))return'back';return'edit';
}
export async function loadAdminIcons(env){
 if(Date.now()-loadedAt<3600000)return icons;loadedAt=Date.now();
 try{const cached=await env.DB.prepare('SELECT val,at FROM cache WHERE key=?1').bind('admin_icons_'+PACK).first();if(cached&&Date.now()-cached.at<86400000){icons=JSON.parse(cached.val);loadedAt=Date.now();return icons;}
  const r=await tgApi(env,'getStickerSet',{name:PACK});if(!r.ok||!Array.isArray(r.result?.stickers))return icons;
  const stickers=r.result.stickers.filter(x=>x.custom_emoji_id);for(const[k,emojis]of Object.entries(ICONS)){const match=emojis.map(emoji=>stickers.find(x=>x.emoji?.replaceAll('\ufe0f','')===emoji.replaceAll('\ufe0f',''))).find(Boolean);if(match)icons[k]=String(match.custom_emoji_id);}
  await env.DB.prepare('INSERT OR REPLACE INTO cache(key,val,at)VALUES(?1,?2,?3)').bind('admin_icons_'+PACK,JSON.stringify(icons),Date.now()).run();loadedAt=Date.now();
 }catch{}return icons;
}
export function adminMarkup(v,custom=icons){
 const kb=(v.kb||[]).map(row=>row.map(b=>{const key=iconKey(b.callback_data,b.text),fallback=ICONS[key][0],id=custom[key];return {...b,text:id?b.text:fallback+' '+b.text,...(id?{icon_custom_emoji_id:id}:{}),...(/Изъять|Отобрать|Удалить|Списать|Забанить/.test(b.text)?{style:'danger'}:/Подтвердить/.test(b.text)?{style:'success'}:{})};}));
 const text=v.text.replace(/<b>([^<]+)<\/b>/,(_,title)=>{const key=/игрок|Игрок|команд/i.test(title)?'players':/предмет|Предмет|инвент|Выдать|Каталог/.test(title)?'assets':/Деньги|Баланс/.test(title)?'money':'home',fallback=ICONS[key][0];return(custom[key]?'<tg-emoji emoji-id="'+custom[key]+'">'+fallback+'</tg-emoji>':fallback)+' <b>'+title+'</b>';});
 return{text,kb};
}
export function plainAdmin(params){return{...params,text:params.text?.replace(/<tg-emoji\b[^>]*>(.*?)<\/tg-emoji>/g,'$1'),reply_markup:params.reply_markup?{inline_keyboard:params.reply_markup.inline_keyboard.map(row=>row.map(({icon_custom_emoji_id,style,...b})=>({...b,text:icon_custom_emoji_id?ICONS[iconKey(b.callback_data,b.text)][0]+' '+b.text:b.text})))}:undefined};}
export async function adminPanel(env,method,params,v,admin){
 await loadAdminIcons(env);const styled=adminMarkup(v);const req={...params,text:styled.text,parse_mode:'HTML',reply_markup:{inline_keyboard:styled.kb},disable_web_page_preview:true};
 if(method==='sendMessage'&&v.banner){try{const r=await tgApi(env,'sendPhoto',{chat_id:params.chat_id,photo:'https://brewcrew.pages.dev/img/'+v.banner,caption:'☕ Brew Crew · '+(v.banner==='admin-banner.png'?'Управление кофейнями':'Игроки и имущество')});if(r.ok)await env.DB.prepare('INSERT OR REPLACE INTO cache(key,val,at)VALUES(?1,?2,?3)').bind('admin_banner_'+admin,JSON.stringify({chat:params.chat_id,msg:r.result.message_id,asset:v.banner}),Date.now()).run();}catch{}}
 if(method==='editMessageText'&&v.banner){try{const row=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('admin_banner_'+admin).first(),b=JSON.parse(row?.val||'null');if(b&&b.chat===params.chat_id&&b.asset!==v.banner){const r=await tgApi(env,'editMessageMedia',{chat_id:b.chat,message_id:b.msg,media:{type:'photo',media:'https://brewcrew.pages.dev/img/'+v.banner}});if(r.ok){b.asset=v.banner;await env.DB.prepare('UPDATE cache SET val=?2 WHERE key=?1').bind('admin_banner_'+admin,JSON.stringify(b)).run();}}}catch{}}
 const result=await tgApi(env,method,req);if(!result.ok&&(/emoji|icon|BUTTON|style|parse entities/i.test(result.description||'')))return tgApi(env,method,plainAdmin(req));return result;
}
