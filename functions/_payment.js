import {LEGACY_STARS} from './_legacy-stars.js';
import {SHOP} from './_lib.js';
export async function paymentPayload(env,payment,userId){
  let fixedCash=0;let p;try{p=JSON.parse(payment.invoice_payload);}catch{return null;}
  if(!p||!Object.hasOwn(SHOP,p.i)||p.u!==userId||payment.currency!=='XTR'||!Number.isInteger(payment.total_amount)||payment.total_amount<1)return null;
  const quote=p.n&&env.DB?await env.DB.prepare('SELECT val FROM cache WHERE key=?1').bind('invoice_'+p.n).first():null;
  if(quote){let q;try{q=JSON.parse(quote.val);}catch{return null;}if(q.u!==p.u||q.i!==p.i||(q.g||0)!==(p.g||0)||q.amount!==payment.total_amount)return null;if(q.cashVersion===2){if(!SHOP[p.i].cash||!Number.isInteger(q.cashAmount)||q.cashAmount<1||q.cashAmount>1e9)return null;fixedCash=q.cashAmount;}}
  else if(p.n||String(p.i).startsWith('skin_')||SHOP[p.i].stars!==payment.total_amount&&!LEGACY_STARS[p.i]?.includes(payment.total_amount))return null;
  return {...p,fixedCash};
}
