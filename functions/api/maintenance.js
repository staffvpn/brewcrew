import {json} from '../_lib.js';import {getMaint} from '../_maint.js';
export async function onRequestGet({env}){try{if(!env.DB)throw Error();return json({ok:true,maint:await getMaint(env),now:Date.now()});}catch{return json({ok:false,error:'Не удалось проверить состояние игры'},503);}}
