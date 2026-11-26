/* A placement trial lives only in the isolated Admin cafe. */
(function(){'use strict';if(!window.BrewCrewLab)return;
const styles=[['home','Домашний'],['loft','Флагман'],['scandi','Фика'],['soviet','Столовая №1'],['neon','Не спим'],['autumn','Листопад'],['winter','Снежный']];
const art={},root='img/furniture/long-tables/';let loaded=false;
const canPlace=()=>!!(S?.skinOwned?.['room:wide']&&S?.skinOwned?.['room:deep']);
const selected=()=>S?.c?.labLongTable;
const active=()=>loaded&&canPlace()&&styles.some(s=>s[0]===selected());
const seats=()=>[{table:8,side:0,x:84,y:467},{table:8,side:1,x:84,y:498},{table:9,side:0,x:184,y:467},{table:9,side:1,x:184,y:498},{table:10,side:0,x:134,y:467},{table:10,side:1,x:134,y:498}];
const seat=e=>active()&&e&&S.active==='main'&&e.state==='sit'?seats().find(s=>{const q=slotOf('main',e.seat);return q[2]==='table'&&q[3]===s.table&&q[4]===s.side;}):null;
function drawPart(kind,x,bottom,width,height){const original=art[selected()]?.[kind];if(!original?.naturalWidth)return;const im=window.bcLuxuryLongFurniture?.(kind,original)||original;const h=height||im.naturalHeight*width/im.naturalWidth;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(im,x-width/2,bottom-h,width,h);ctx.restore();}
const oldLayout=layoutSlots,oldCount=tableCount,oldTable=sceneTable,oldChair=sceneChair,oldProps=sceneUpgradeProps;
window.layoutSlots=function(){oldLayout.apply(this,arguments);if(!active()||TABLES.length<10)return;
 TABLES[8]={x:84,y:476};TABLES[9]={x:184,y:476};TABLES.push({x:134,y:476});
 for(const q of TABLE_SLOTS){if(q[2]!=='table'||![8,9].includes(q[3]))continue;const p=seats().find(s=>s.table===q[3]&&s.side===q[4]);q[0]=p.x;q[1]=p.y;}
 const last=TABLE_SLOTS.findLastIndex(q=>q[2]==='table'&&q[3]===9);if(last>=0)TABLE_SLOTS.splice(last+1,0,...seats().filter(s=>s.table===10).map(s=>[s.x,s.y,'table',10,s.side]));
};
window.tableCount=function(L){return oldCount.apply(this,arguments)+(active()&&L>=26?2:0);};
window.sceneTable=function(st,x,y,L,i){if(active()&&S.active==='main'&&[8,9,10].includes(i))return;return oldTable.apply(this,arguments);};
window.sceneChair=function(st,x,y){if(active()&&S.active==='main'&&seats().some(s=>s.x===x&&s.y===y))return;return oldChair.apply(this,arguments);};
function drawTable(st,u,now){
 // Let the existing renderer record its navigation/table anchors, without drawing small tables.
 ctx.save();ctx.beginPath();ctx.rect(0,0,0,0);ctx.clip();for(const i of [8,9,10]){const t=TABLES[i];if(t)oldTable(st,t.x,t.y+10,u.tables,i);}ctx.restore();
 drawPart('table',134,493,164,42);
 for(const g of rt('main').guests||[]){const p=seat(g);if(!p||!g.item)continue;ctx.save();ctx.fillStyle='#f7f1e4';ctx.beginPath();ctx.ellipse(p.x+8,p.side?468:455,3,1.5,0,0,Math.PI*2);ctx.fill();ctx.fillRect(p.x+6,p.side?461:448,4,6);ctx.restore();}
}
window.sceneUpgradeProps=function(st,u,items,now,r){oldProps.apply(this,arguments);if(!active()||st.outdoor||S.active!=='main')return;
 for(const p of seats())items.push({y:p.side?500:466,f:()=>drawPart(p.side?'chair-north':'chair-south',p.x,p.side?506:475,20)});
 items.push({y:486.5,f:()=>drawTable(st,u,now)});
};
function refresh(){window.bcLongTableFit();syncScene('main');const r=rt('main');for(let i=0;i<r.seats.length;i++){const g=r.seats[i];if(g?.state==='sit'){const q=slotOf('main',i);g.x=q[0];g.y=q[1];g._px=g.x;g._py=g.y;g._sitT=null;g._sa=null;}}structDirty=true;save();renderPanel();renderHud();}
function place(key){if(!styles.some(s=>s[0]===key)||!canPlace()||!loaded)return false;S.c.labLongTable=key;refresh();return true;}
function remove(){if(!S?.c)return;delete S.c.labLongTable;refresh();}
function shop(panel,cat){if(cat!=='table')return;const section=document.createElement('section');section.className='bc-long-tables';section.innerHTML='<h3>Большие столы · примерка</h3><p class="d">Нужны оба расширения из магазина: вправо и вглубь. Стол заменяет два дальних столика. Посадка открывается улучшением «Места»; на уровне 26 доступны все шесть мест.</p><div class="u6grid"></div>';
 const grid=section.querySelector('.u6grid');for(const [key,title] of styles){const card=document.createElement('div');card.className='u6it';card.dataset.longTable=key;card.innerHTML='<div class="u6pv"><img src="'+root+key+'-table.png" alt="Большой стол '+title+'"></div><div class="u6nm">'+title+'</div><div class="u6act"></div>';const button=document.createElement('button');button.className='u6buy';button.disabled=!canPlace()||!loaded;button.textContent=selected()===key?'Убрать':!canPlace()?'Нужны 2 расширения':!loaded?'Загрузка…':'Поставить';button.onclick=()=>selected()===key?remove():place(key);card.querySelector('.u6act').append(button);grid.append(card);}panel.append(section);
}
window.BrewCrewLongTables={canPlace,active,place,remove,seat,shop,ready:()=>loaded,obstacles:function(out){if(!active())return out;return out.filter(t=>!(t.y===476&&[84,134,184].includes(t.x))).concat([84,134,184].map(x=>({x,y:476})));}};
Promise.all(styles.flatMap(([key])=>['table','chair-south','chair-north'].map(kind=>new Promise(resolve=>{const im=new Image();art[key]=art[key]||{};art[key][kind]=im;im.onload=resolve;im.onerror=()=>resolve();im.src=root+key+'-'+kind+'.png';})))).then(()=>{loaded=styles.every(([key])=>Object.values(art[key]).every(i=>i.naturalWidth));if(S){layoutSlots();structDirty=true;renderPanel();}});
})();
