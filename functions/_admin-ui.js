import {tgApi} from './_lib.js';
import {ADMIN_ICON_SET} from './_admin-icons.js';
const ICONS=Object.fromEntries(Object.entries(ADMIN_ICON_SET).map(([k,v])=>[k,[v.emoji]]));
const icons=Object.fromEntries(Object.entries(ADMIN_ICON_SET).map(([k,v])=>[k,v.id]));
export function iconKey(data='',text=''){
 const parts=data.split(':'),act=parts[1]||'';
 if(/^Обновить/.test(text))return'refresh';if(/^(‹|Назад|Отмена)/.test(text))return'back';
 if(act==='ap')return {give:'give',take:'take',set:'edit'}[parts[5]]||'assets';
 if(act==='agroup'||act==='ait')return {resources:'money',staff:'players',inventory:'assets',badges:'star',upgrades:'settings',features:'settings'}[parts[3]]||'assets';
 if(act==='home')return'home';if(/find/.test(act))return'search';if(/Подтвердить|Да,/.test(text)||act==='ago')return'ok';
 if(/Отобрать|Изъять|Удалить|Списать|Обнулить/.test(text))return'take';if(/^uban/.test(act))return'lock';
 if(/pl|^u$|ufr|refs|account/.test(act))return'players';if(/^inv|^gv|^ust/.test(act))return'assets';if(/^mt(?:[01xd])?$/.test(act)||act==='ops')return'settings';if(/^um|^m[gctz]|Деньги/.test(act))return'money';
 if(/mt|ops/.test(act))return'settings';if(/buy|sz|Пропуск/.test(act))return'star';if(/log|uh/.test(act))return'history';if(/Канал|Рассылка|post|^ch$/.test(text+act))return'news';return'edit';
}
export async function loadAdminIcons(){return icons;}
export function adminMarkup(v,custom=icons){
 const kb=(v.kb||[]).map(row=>row.map(b=>{const key=iconKey(b.callback_data,b.text),fallback=ICONS[key][0],id=custom[key];return {...b,text:id?b.text:fallback+' '+b.text,...(id?{icon_custom_emoji_id:id}:{}),...(/Изъять|Отобрать|Удалить|Списать|Забанить/.test(b.text)?{style:'danger'}:/Подтвердить/.test(b.text)?{style:'success'}:{})};}));
 let text=v.text.replace(/<b>([^<]+)<\/b>/,(_,title)=>{const key=/подтвер|проверь/i.test(title)?'ok':/поиск|найти/i.test(title)?'search':/игрок|команд|профиль/i.test(title)?'players':/деньги|баланс|ресурс/i.test(title)?'money':/сезон|пропуск|значк/i.test(title)?'star':/журнал|история/i.test(title)?'history':/настрой|техработ|инструмент/i.test(title)?'settings':/предмет|инвент|выдать|каталог|имуществ/i.test(title)?'assets':'home',fallback=ICONS[key][0];return(custom[key]?'<tg-emoji emoji-id="'+custom[key]+'">'+fallback+'</tg-emoji>':fallback)+' <b>'+title+'</b>';});
 const bodyIcons={'👥':'players','📅':'history','☕':'home','⭐':'star','💰':'money','📈':'stats','🕒':'history','🔑':'lock','📋':'assets','➕':'give','➖':'take','✏️':'edit','✅':'ok','⏳':'history'};
 text=text.split(/(<tg-emoji\b[^>]*>.*?<\/tg-emoji>|<[^>]*>)/g).map(part=>part.startsWith('<')?part:part.replace(/👥|📅|☕|⭐️?|💰|📈|🕒|🔑|📋|➕|➖|✏️|✅|⏳/gu,emoji=>{const key=bodyIcons[emoji.replace('⭐️','⭐')];return key&&custom[key]?'<tg-emoji emoji-id="'+custom[key]+'">'+ICONS[key][0]+'</tg-emoji>':emoji;})).join('');
 return{text,kb};
}
const BANNER_KEYS=['home','players','search','inventory','resources','staff','items','purchases','season','history','maintenance','news','confirm','settings','badges','account','friends','icons'];
export function adminBanner(v,screen=''){
 if(/^admin\/[a-z]+\.png$/.test(v.banner||'')&&BANNER_KEYS.includes(v.banner.slice(6,-4)))return v.banner;
 const screenKey={pl:'players',find:'search',asset_find:'search',mt:'maintenance',mt0:'maintenance',mt1:'maintenance',mtd:'maintenance',mtx:'maintenance',buy:'purchases',sz:'season',szp:'season',log:'history',uh:'history',refs:'friends',ufr:'friends',ch:'news',po:'news',pn:'news',pc:'news',pe:'news',pngo:'news',all:'news',allgo:'news',ops:'settings',gd:'news',gdv:'news',icons:'icons'}[screen];if(screenKey)return 'admin/'+screenKey+'.png';
 const heading=v.text.replace(/<[^>]+>/g,'').split('\n').slice(0,2).join(' ');
 const key=/Проверь|Точно|Подтвер|Обнулить|Удалить аккаунт|Забанить|Разбанить/.test(heading)?'confirm':/Найти|Поиск|Нашлось/.test(heading)?'search':/Техработ|заглушк/.test(heading)?'maintenance':/Сезон|сезон|Пропуск/.test(heading)?'season':/История|Журнал/.test(heading)?'history':/Покупки/.test(heading)?'purchases':/Деньги|Баланс|Ресурс|сумм|Склад/.test(heading)?'resources':/Сотрудник|команд|легенд/i.test(heading)?'staff':/Инвентар/.test(heading)?'items':/Значок|Значки/.test(heading)?'badges':/Реферал|Друзья/.test(heading)?'friends':/пост|Канал|Рассылка|нового/i.test(heading)?'news':/Brew Crew.*управление/.test(heading)?'home':'settings';
 return 'admin/'+key+'.png';
}
// Caption limits apply after Telegram parses HTML. Keep tags balanced on every page.
export function captionPages(html,limit=850){
 const tokens=String(html).match(/<tg-emoji\b[^>]*>[\s\S]*?<\/tg-emoji>|<[^>]+>|&(?:#[0-9]+|#x[0-9a-f]+|[a-z]+);|[^]/giu)||[];
 const pages=[],stack=[];let current='',visible=0;
 const close=()=>stack.slice().reverse().map(t=>'</'+t.name+'>').join('');
 function flush(){pages.push(current+close());current=stack.map(t=>t.open).join('');visible=0;}
 for(const token of tokens){
  if(token.startsWith('<')&&!token.startsWith('<tg-emoji')){const end=token.match(/^<\/(\w[\w-]*)/),start=token.match(/^<(\w[\w-]*)\b/);current+=token;if(end){for(let i=stack.length-1;i>=0;i--)if(stack[i].name===end[1]){stack.splice(i,1);break;}}else if(start&&!token.endsWith('/>')&&!['br','hr'].includes(start[1]))stack.push({name:start[1],open:token});continue;}
  const length=token.startsWith('<tg-emoji')?token.replace(/<[^>]*>/g,'').length:token.startsWith('&')?(token.startsWith('&#')&&Number.parseInt(token.replace(/^&#x?/i,''),/^&#x/i.test(token)?16:10)>65535?2:1):token.length;
  if(visible+length>limit&&visible)flush();current+=token;visible+=length;if(token==='\n'&&visible>limit*.8)flush();
 }
 if(visible||!pages.length)pages.push(current+close());return pages;
}
export function plainAdmin(params,keepButtonIcons=false){
 const strip=s=>s?.replace(/<tg-emoji\b[^>]*>(.*?)<\/tg-emoji>/g,'$1');
 const keyboard=markup=>markup?{inline_keyboard:markup.inline_keyboard.map(row=>row.map(({icon_custom_emoji_id,style,...b})=>({...b,...(keepButtonIcons&&icon_custom_emoji_id?{icon_custom_emoji_id}:{}),text:icon_custom_emoji_id&&!keepButtonIcons?ICONS[iconKey(b.callback_data,b.text)][0]+' '+b.text:b.text})))}:undefined;
 const out={...params};if('text'in out)out.text=strip(out.text);if('caption'in out)out.caption=strip(out.caption);if(out.media)out.media={...out.media,caption:strip(out.media.caption)};if(out.reply_markup)out.reply_markup=keyboard(out.reply_markup);return out;
}
async function panelRequest(env,method,params,admin){
 let r=await tgApi(env,method,params);if(r.ok||/message is not modified/i.test(r.description||''))return r.ok?r:{ok:true,result:{message_id:params.message_id}};
 if(!/emoji|icon|BUTTON|style|parse entities/i.test(r.description||''))return r;
 const initial=r.description;
 // Text and button custom emoji have separate Telegram permission checks.
 const captionsOnly=plainAdmin(params,true);r=await tgApi(env,method,captionsOnly);
 if(!r.ok&&/emoji|icon|BUTTON|style|parse entities/i.test(r.description||''))r=await tgApi(env,method,plainAdmin(params));
 try{await env.DB.prepare('INSERT OR REPLACE INTO cache(key,val,at)VALUES(?1,?2,?3)').bind('admin_icon_error_'+admin,JSON.stringify({description:initial,at:Date.now()}),Date.now()).run();}catch{}
 return r;
}
function pageKeyboard(kb,token,page,total){if(total<2)return kb;return [[...(page?[{text:'‹ Текст',callback_data:'p:pg:'+token+':'+(page-1),icon_custom_emoji_id:icons.back}]:[]),{text:(page+1)+' / '+total,callback_data:'p:pg:'+token+':'+page},...(page+1<total?[{text:'Текст ›',callback_data:'p:pg:'+token+':'+(page+1),icon_custom_emoji_id:icons.edit}]:[])],...kb];}
export async function adminPanel(env,method,params,v,admin){
 const styled=adminMarkup(v),pages=captionPages(styled.text),banner=adminBanner(v,params.screen),url='https://brewcrew.pages.dev/img/'+banner;
 const token=crypto.randomUUID().replaceAll('-','').slice(0,16),kb=pageKeyboard(styled.kb,token,0,pages.length);
 const request=method==='sendMessage'?{chat_id:params.chat_id,photo:url,caption:pages[0],parse_mode:'HTML',reply_markup:{inline_keyboard:kb}}:{chat_id:params.chat_id,message_id:params.message_id,media:{type:'photo',media:url,caption:pages[0],parse_mode:'HTML'},reply_markup:{inline_keyboard:kb}};
 const result=await panelRequest(env,method==='sendMessage'?'sendPhoto':'editMessageMedia',request,admin);
 if(result.ok){
  const mid=result.result?.message_id||params.message_id;
  if(pages.length>1&&mid)await env.DB.prepare('INSERT INTO cache(key,val,at)VALUES(?1,?2,?3)').bind('admin_page_'+token,JSON.stringify({admin,chat:params.chat_id,mid,pages,kb:styled.kb,banner,until:Date.now()+3600000}),Date.now()).run();
  // Remove the known separate header produced by the previous admin implementation.
  try{const row=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('admin_banner_'+admin).first(),old=JSON.parse(row?.val||'null');if(old&&old.chat===params.chat_id&&old.msg!==mid){await tgApi(env,'deleteMessage',{chat_id:old.chat,message_id:old.msg});await env.DB.prepare('DELETE FROM cache WHERE key=?1').bind('admin_banner_'+admin).run();}}catch{}
 }
 return result;
}
export async function adminPanelPage(env,cq){
 const parts=String(cq.data).split(':'),token=parts[2],page=Number(parts[3]);if(!/^[a-f0-9]{16}$/.test(token)||!Number.isInteger(page))return false;
 const row=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('admin_page_'+token).first();let state;try{state=JSON.parse(row?.val||'null');}catch{}
 if(!state||state.admin!==cq.from.id||state.chat!==cq.message.chat.id||state.mid!==cq.message.message_id||state.until<Date.now()||page<0||page>=state.pages.length)return false;
 const r=await panelRequest(env,'editMessageCaption',{chat_id:state.chat,message_id:state.mid,caption:state.pages[page],parse_mode:'HTML',reply_markup:{inline_keyboard:pageKeyboard(state.kb,token,page,state.pages.length)}},cq.from.id);return !!r.ok;
}
export async function adminIconsView(env,admin){
 const row=await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('admin_icon_error_'+admin).first();let error;try{error=JSON.parse(row?.val||'null');}catch{}
 const labels={home:'Главная',players:'Игроки',search:'Поиск',money:'Деньги',assets:'Имущество',take:'Изъятие',give:'Выдача',settings:'Настройки',stats:'Статистика',news:'Новости',history:'Журнал',back:'Назад',ok:'Подтверждение',refresh:'Обновление',star:'Stars',lock:'Доступ',edit:'Редактирование'};
 return {banner:'admin/icons.png',text:'<b>Иконки tgiosicons</b>\n\n'+Object.entries(ADMIN_ICON_SET).map(([key,a])=>'<tg-emoji emoji-id="'+a.id+'">'+a.emoji+'</tg-emoji> '+labels[key]).join('\n')+(error?'\n\nTelegram отклонил оформление: '+String(error.description).replace(/[<>&]/g,'')+'\nДля пользовательских иконок может потребоваться Telegram Premium у владельца бота.':''),kb:[[{text:'Главное',callback_data:'p:home'}]]};
}
