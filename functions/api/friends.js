// POST /api/friends — owner-bound, read-only; bonuses are paid by the existing level tracker.
import {json,verifyInitData} from '../_lib.js';
import {invitationData} from '../_referrals.js';
export async function onRequestPost({request,env}){if(!env.DB||!env.BOT_TOKEN)return json({ok:false,error:'not configured'},503);let b;try{b=await request.json();}catch{return json({ok:false},400);}const u=await verifyInitData(b.initData,env.BOT_TOKEN);if(!u?.id)return json({ok:false},401);return json({ok:true,...await invitationData(env.DB,u.id,b.offset)});}
