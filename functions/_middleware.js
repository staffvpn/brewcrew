import {isPreview} from './_sandbox.js';import {json} from './_lib.js';
export function onRequest(context){const p=new URL(context.request.url).pathname;if(isPreview(context.request)&&p.startsWith('/tg/'))return json({ok:false,error:'Бот и платежи отключены в тестовой версии'},403);return context.next();}
