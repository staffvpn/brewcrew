// Legal acknowledgements are distinct from optional data/marketing consents.
import {json,verifyInitData} from './_lib.js';
export const LEGAL_VERSION='2026-11-16';
export const LEGAL_DOCUMENTS={"terms.html":"d99342e990ca48e3b9afe2d891f5b7fcd8edb7f7ec11ef171e859a1b195842d3","privacy.html":"b633ea8343a53dc83e4aceab19e6679e06baa74a8f1e9c0bbbca32921f9fb301","payments.html":"9830ef13116097a6208a5842b76268609f8c9b1452547a64f30f9eac0cbcf27d"};
export const legalKey=id=>'legal_acceptance_'+id+'_'+LEGAL_VERSION;
export function validLegal(row,id){
 let a;try{a=JSON.parse(row?.val||'null');}catch{return null;}
 return a&&a.userId===id&&a.version===LEGAL_VERSION&&a.termsAccepted===true&&a.privacyRead===true&&a.adult===true&&typeof a.recordId==='string'&&Number.isFinite(a.recordedAt)&&Object.entries(LEGAL_DOCUMENTS).every(([k,v])=>a.documents?.[k]===v)?a:null;
}
export async function legalAcceptance(env,id){return validLegal(await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind(legalKey(id)).first(),id);}
export async function requireLegal(request,env){
 if(!env.DB||!env.BOT_TOKEN)return json({ok:false,error:'Сервис подтверждения документов временно недоступен'},503);
 let b;try{b=await request.clone().json();}catch{return json({ok:false,error:'Некорректный запрос'},400);}
 const user=await verifyInitData(b?.initData,env.BOT_TOKEN);
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0)return json({ok:false,error:'Открой игру через Telegram'},401);
 if(!await legalAcceptance(env,user.id))return json({ok:false,legalRequired:true,version:LEGAL_VERSION,error:'Подтверди документы на стартовом экране'},428);
 return null;
}
