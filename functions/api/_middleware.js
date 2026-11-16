import {requireLegal} from '../_legal.js';
export async function onRequest(context){
 const path=new URL(context.request.url).pathname;
 // Public documents/configuration and support remain accessible. ACK can finish a pending account deletion.
 if(context.request.method!=='POST'||path==='/api/legal'||path==='/api/ack')return context.next();
 const blocked=await requireLegal(context.request,context.env);
 return blocked||context.next();
}
