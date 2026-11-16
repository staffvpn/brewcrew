import {json} from '../_lib.js';
import {androidIconPack} from '../_android-icons.js';
// Fixed public Telegram emoji-set metadata. Never returns bot credentials or private messages.
export async function onRequestGet({env}){if(!env.BOT_TOKEN)return json({ok:false},503);try{return json({ok:true,...await androidIconPack(env)});}catch{return json({ok:false,error:'Набор временно недоступен'},502);}}
