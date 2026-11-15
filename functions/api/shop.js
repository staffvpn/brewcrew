import {json,SHOP} from '../_lib.js';
export async function onRequestGet(){return json({ok:true,currency:'XTR',rublePayments:false,items:Object.entries(SHOP).map(([sku,p])=>({sku,title:p.title,stars:p.stars,category:p.category||null,id:p.skin||null}))});}
