/* A denser, furniture-aware queue uses only space from purchased expansions. */
(function(){'use strict';
const original=queuePos;let cacheKey='',cached=null;
function geometry(){return window.BrewCrewNikita.geometry();}
function active(id='main'){return !!(S&&id==='main'&&S.skinOwned?.['room:wide']&&geometry().width>300);}
function tables(){const seen=new Set(),out=[];const limit=tableCount(room('main').upg.tables);for(const s of TABLE_SLOTS.slice(0,limit)){if(s[2]!=='table'||seen.has(s[3]))continue;const t=TABLES[s[3]];if(t){seen.add(s[3]);out.push(t);}}return window.BrewCrewLongTables?.active()?BrewCrewLongTables.obstacles(out):out;}
function free(x,y,obstacles){return x>=8&&x<=geometry().width-8&&y>=244&&y<=geometry().height-12&&!obstacles.some(t=>Math.abs(x-t.x)<=41&&y>=t.y-12&&y<=t.y+24);}
function plan(){const g=geometry(),obs=tables(),key=[g.width,g.height,DOOR[1],S.skinOwned?.['room:deep']?1:0,obs.map(t=>t.x+','+t.y).join(';')].join('|');if(key===cacheKey&&cached)return cached;cacheKey=key;
 const lane=g.width-30,end=Math.min(DOOR[1]-18,g.height-30),vertices=[[226,258],[254,270],[282,274],[lane-32,276],[lane,288],[lane,Math.max(288,end)]],points=[[226,258]];let carry=0;
 for(let i=1;i<vertices.length;i++){let [x,y]=vertices[i-1];const [tx,ty]=vertices[i],dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy);if(!len)continue;let along=28-carry;for(;along<=len;along+=28){const px=x+dx*along/len,py=y+dy*along/len;if(free(px,py,obs)&&points.every(p=>Math.hypot(px-p[0],py-p[1])>=23))points.push([px,py]);}carry=(carry+len)%28;}
 const max=S.skinOwned?.['room:deep']?16:12;cached={points:points.slice(0,max),capacity:Math.max(7,Math.min(max,points.length)),tables:obs.map(t=>({x:t.x,y:t.y}))};return cached;}
window.queuePos=function(i,id='main'){if(!active(id)||i===0)return original(i);const p=plan().points[i];return p?p.slice():original(i);};
function capacity(id){return active(id)?plan().capacity:7;}
function admitAt(id){return active(id)?capacity(id):6;}
function busyAt(id){return active(id)?capacity(id)-1:6;}
function admitReady(id,r,dt){if(!active(id))return true;r._expandedEntryWait=Math.max(0,(r._expandedEntryWait||0)-Math.max(0,dt));if(r._expandedEntryWait>0)return false;r._expandedEntryWait=.8;return true;}
const move=moveTo;
window.moveTo=function(e,tx,ty,speed,dt){if(!active()||S.active!=='main'||!['toQueue','queue'].includes(e.state)||!rt('main').queue.includes(e))return move.apply(this,arguments);const nav=window.BrewCrewQueueNavigation,g=geometry(),obs=plan().tables;if(e.x>g.width-7&&Math.abs(e.y-DOOR[1])<20)return nav.step(e,g.width-7,DOOR[1],speed,dt)&&Math.hypot(e.x-tx,e.y-ty)<1;
 if(nav.blocked(e.x,e.y,obs)){const exit=nav.free(e.x,e.y,obs);if(!exit){e.walk=false;return false;}nav.step(e,exit[0],exit[1],speed,dt);e._cqRoute=null;return false;}
 const key=tx+','+ty+'|'+cacheKey;if(e._cqKey!==key){e._cqKey=key;e._cqRoute=null;}if(!e._cqRoute)e._cqRoute=nav.route(e.x,e.y,tx,ty,obs);if(!e._cqRoute?.length){e.walk=false;return Math.hypot(e.x-tx,e.y-ty)<1;}
 while(e._cqRoute.length>1&&Math.hypot(e.x-e._cqRoute[0][0],e.y-e._cqRoute[0][1])<.8)e._cqRoute.shift();const p=e._cqRoute[0],distance=Math.hypot(e.x-p[0],e.y-p[1]);const step=Math.min(distance,speed*.85*Math.min(.1,dt)),nx=distance?e.x+(p[0]-e.x)*step/distance:e.x,ny=distance?e.y+(p[1]-e.y)*step/distance:e.y;if(!nav.clear(e.x,e.y,nx,ny,obs)){e._cqRoute=null;e.walk=false;return false;}const arrived=nav.step(e,p[0],p[1],speed,Math.min(.1,dt));if(arrived){e._cqRoute.shift();if(!e._cqRoute.length)return true;}return false;};
window.BrewCrewQueues={active,capacity,admitAt,busyAt,admitReady,plan:()=>active()?structuredClone(plan()):null};
})();
