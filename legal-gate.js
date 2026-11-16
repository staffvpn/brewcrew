/* Loaded before the game: no personal API calls until documents have been acknowledged. */
(function(){
 'use strict';
 const VERSION='2026-11-16',KEY='bc_legal_acceptance',DOCS=['terms.html','privacy.html','payments.html'];
 let memory=null,installed=false,pending=false;
 const app=()=>window.Telegram&&window.Telegram.WebApp;
 const userId=()=>Number(app()?.initDataUnsafe?.user?.id)||0;
 function valid(r){return !!(r&&r.userId===userId()&&r.userId>0&&r.version===VERSION&&r.termsAccepted===true&&r.privacyRead===true&&r.adult===true&&Number.isFinite(r.recordedAt)&&typeof r.recordId==='string'&&r.recordId.length>0);}
 function receipt(){if(valid(memory))return memory;try{const r=JSON.parse(localStorage.getItem(KEY)||'null');if(valid(r))return memory=r;}catch{}return null;}
 function has(){return !!receipt();}
 function allowed(path){return path==='/api/legal'||has();}
 function remember(r){if(!valid(r))throw Error('Сервер не подтвердил принятие документов. Попробуй ещё раз.');memory=r;try{localStorage.setItem(KEY,JSON.stringify(r));localStorage.setItem('bc_age18','1');}catch{}}
 const fields=()=>'<fieldset class="bc-legal"><legend>Документы Brew Crew</legend><label><input type="checkbox" id="legal-terms"><span>Принимаю <a href="terms.html" target="_blank" rel="noopener">пользовательское соглашение</a></span></label><label><input type="checkbox" id="legal-privacy"><span>Ознакомился с <a href="privacy.html" target="_blank" rel="noopener">политикой конфиденциальности</a></span></label><label><input type="checkbox" id="legal-adult"><span>Подтверждаю, что мне исполнилось 18 лет</span></label><p class="bc-legal-note">Все три подтверждения обязательны. <a href="payments.html" target="_blank" rel="noopener">Покупки и возвраты</a> · <a href="https://t.me/brew_support" target="_blank" rel="noopener">Поддержка</a></p><p class="bc-legal-error" role="status" aria-live="polite"></p></fieldset>';
 async function accept(root,source){
  const checked=['terms','privacy','adult'].every(id=>root.querySelector('#legal-'+id)?.checked===true);
  if(!checked)throw Error('Отметь все три обязательные галочки.');
  const tg=app();if(!tg?.initData)throw Error('Открой игру через Telegram, чтобы подтвердить документы.');
  const response=await fetch('/api/legal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData:tg.initData,action:'accept',version:VERSION,termsAccepted:true,privacyRead:true,adult:true,source}),signal:AbortSignal.timeout(15000)});
  let r;try{r=await response.json();}catch{throw Error('Не удалось сохранить подтверждение. Попробуй ещё раз.');}
  if(!response.ok||!r.ok||r.accepted!==true)throw Error(r.error||'Не удалось сохранить подтверждение. Попробуй ещё раз.');
  remember(r.receipt);return r.receipt;
 }
 function bind(root,go,quick,continueWith,source){
  let busy=false;const inputs=[...root.querySelectorAll('.bc-legal input')],error=root.querySelector('.bc-legal-error');
  const sync=()=>{const ready=inputs.length===3&&inputs.every(x=>x.checked);go.disabled=busy||!ready;if(quick)quick.disabled=busy||!ready;go.setAttribute('aria-busy',String(busy));};
  inputs.forEach(x=>x.addEventListener('change',()=>{error.textContent='';sync();}));
  const submit=async fast=>{if(busy)return;if(!inputs.every(x=>x.checked)){sync();error.textContent='Отметь все три обязательные галочки.';inputs.find(x=>!x.checked)?.focus();return;}busy=true;sync();error.textContent='Сохраняем подтверждение…';
   try{await accept(root,source);if(!root.isConnected)return;error.textContent='';await continueWith(fast);}
   catch(e){error.textContent=e?.name==='TimeoutError'?'Нет ответа от сервера. Проверь связь и попробуй ещё раз.':e.message||'Нет связи. Попробуй ещё раз.';}
   finally{busy=false;if(root.isConnected)sync();}
  };
  go.onclick=()=>submit(false);if(quick)quick.onclick=()=>submit(true);sync();
 }
 function restoring(data,continueWith){
  const target=document.getElementById('app');target.className='startapp';target.innerHTML='<div class="start bc-legal-restore"><div class="logo">Brew Crew</div><h1>Перед продолжением</h1><p class="bc-legal-cafe"></p><p>Подтверди документы новой редакции. Сохранённую кофейню продолжим после подтверждения.</p>'+fields()+'<button class="btn big" id="legal-continue">Продолжить игру</button></div>';
  const root=target.firstElementChild;root.querySelector('.bc-legal-cafe').textContent=data?.name?'Кофейня «'+String(data.name).slice(0,40)+'»':'';
  bind(root,root.querySelector('#legal-continue'),null,continueWith,'restore');
 }
 function install(){if(installed)return;installed=true;
  const css=document.createElement('style');css.textContent='html body .start .bc-legal{display:flex!important;flex-direction:column;gap:12px;margin:2px 0 0!important;padding:14px!important;min-width:0;border:1px solid #d4bc95;border-radius:14px;background:#fffaf0;color-scheme:light;color:#3b2a20;font:500 13px/1.45 "Golos Text",system-ui,sans-serif}html body .start .bc-legal legend{padding:2px 6px;border-radius:5px;background:#fffaf0;color:#6c4e32;font-weight:800;font-size:12px}html body .start .bc-legal label{display:flex;align-items:flex-start;gap:10px;cursor:pointer;min-height:26px}html body .start .bc-legal input[type=checkbox]{appearance:auto!important;-webkit-appearance:checkbox!important;position:static!important;display:block!important;opacity:1!important;width:22px!important;height:22px!important;min-width:22px!important;flex:none!important;margin:0!important;padding:0!important;accent-color:#8b5f32;cursor:pointer}html body .start .bc-legal label span{padding-top:1px}html body .start .bc-legal a{color:#7b4b20!important;text-decoration:underline;text-underline-offset:2px}html body .start .bc-legal-note,html body .start .bc-legal-error{font-size:11.5px;line-height:1.45;margin:0;color:#6b513d}html body .start .bc-legal-error{color:#9c3024;overflow-wrap:anywhere}html body .start .bc-legal-error:empty{display:none}html body .start #go:disabled,html body .start #quick:disabled,html body .start #legal-continue:disabled{opacity:.5!important;cursor:not-allowed!important}html body .bc-legal-links{display:flex;gap:12px;flex-wrap:wrap;font-size:13px}html body .bc-legal-links a{color:inherit;text-decoration:underline}html body .start.bc-legal-restore h1{font-size:25px;margin:8px 0}html body .start.bc-legal-restore>p{font-size:14px;line-height:1.5;margin:0}';document.head.appendChild(css);
  const oldStart=window.renderStart;
  window.renderStart=function(){const r=oldStart.apply(this,arguments),go=document.getElementById('go'),quick=document.getElementById('quick');if(!go||document.getElementById('legal-terms'))return r;const root=go.closest('.start'),wrap=document.createElement('div');wrap.innerHTML=fields();root.insertBefore(wrap.firstElementChild,go);const original=go.onclick;
   bind(root,go,quick,fast=>{original.call(go);if(fast){const open=document.getElementById('open');if(open&&!open.disabled)open.click();}},'start');return r;
  };
  const oldBuild=window.renderBuild;window.renderBuild=function(){if(!has())return window.renderStart();return oldBuild.apply(this,arguments);};
  const oldBoot=window.boot;window.boot=function(data){if(data?.v===3&&!has()){restoring(data,()=>{oldBoot(data);if(typeof S!=='undefined'&&S){window.streakCheck();window.refreshEntitlements();window.loadFriends();setTimeout(()=>window.track(),1500);}});return;}return oldBoot.apply(this,arguments);};
  const oldAge=window.ageOk;window.ageOk=function(){return has()||oldAge.apply(this,arguments);};
  const oldSettings=window.renderSettings;window.renderSettings=function(p){const r=oldSettings.apply(this,arguments),card=document.createElement('div');card.className='card';card.innerHTML='<div class="t">Документы Brew Crew</div><div class="bc-legal-links"><a href="terms.html" target="_blank" rel="noopener">Соглашение</a><a href="privacy.html" target="_blank" rel="noopener">Конфиденциальность</a><a href="payments.html" target="_blank" rel="noopener">Покупки и возвраты</a></div>';p.appendChild(card);return r;};
 }
 function run(start){if(pending)return;const local=(()=>{try{return JSON.parse(localStorage.getItem('brewcrew_max13')||'null');}catch{return null;}})();if(local?.v===3&&!has()){pending=true;restoring(local,()=>{pending=false;start();});return;}start();}
 window.BrewCrewLegal={version:VERSION,documents:DOCS,key:KEY,has,allowed,receipt,install,run};
})();
