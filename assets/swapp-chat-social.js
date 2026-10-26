/* SWAPP Social Chat: lively original chat controls, no player/Socket.IO reparenting.
 * The existing report, moderation, GIF, emoji and send actions remain authoritative.
 */
(function(){
 'use strict';
 const root=document.getElementById('channel');if(!root)return;
 const make=(tag,cls,value)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(value!==undefined)n.textContent=value;return n;
 };
 const select=(query,base=root)=>base?.querySelector?.(query)||null;
 const reportCandidate=sidebar=>Array.from(sidebar.querySelectorAll('button,a'))
  .find(node=>!node.closest('.swapp-social-chat-menu')&&
   !node.classList.contains('swapp-mod-open')&&
   /\bsignaler\b/i.test([
    node.getAttribute('aria-label'),node.getAttribute('title'),
    node.textContent?.trim()
   ].filter(Boolean).join(' ')));
 function upgradeChat(page){
  if(page.dataset.channelLive!=='true')return;
  const sidebar=page.querySelector('.channelLiveSidebar');
  const pane=sidebar?.querySelector('.nativeFixedChat[data-chat="oryon"]');
  const header=pane?.querySelector('.chatHeader');
  if(!pane||!header)return;
  pane.classList.add('swapp-social-chat');
  const currentReport=reportCandidate(sidebar);
  const mod=sidebar.querySelector('.swapp-mod-open');
  let menu=header.querySelector('.swapp-social-chat-menu');
  if(!menu){
   menu=make('details','swapp-social-chat-menu');
   const summary=make('summary','','Options');
   summary.title='Options du tchat';summary.setAttribute('aria-label','Options du tchat');
   const items=make('div','swapp-social-menu-items');
   const jump=make('button','swapp-social-jump','Derniers messages');
   jump.type='button';jump.addEventListener('click',()=>{
    const log=pane.querySelector('.chatLog');
    if(log)log.scrollTop=log.scrollHeight;
    menu.open=false;
   });
   const calmer=make('button','swapp-social-quiet','Mode discret');
   calmer.type='button';calmer.setAttribute('aria-pressed','false');
   calmer.addEventListener('click',()=>{
    const active=pane.classList.toggle('swapp-social-calm');
    calmer.setAttribute('aria-pressed',String(active));
    calmer.textContent=active?'Désactiver le mode discret':'Mode discret';
    menu.open=false;
   });
   const signal=make('button','swapp-social-report','Signaler la chaîne');
   signal.type='button';
   signal.addEventListener('click',()=>{
    menu.open=false;
    const original=reportCandidate(sidebar);
    if(original?.isConnected)original.click();
   });
   const moderate=make('button','swapp-social-moderate','Outils de modération');
   moderate.type='button';
   moderate.addEventListener('click',()=>{
    menu.open=false;
    const original=sidebar.querySelector('.swapp-mod-open');
    if(original?.isConnected)original.click();
   });
   items.append(jump,calmer,signal,moderate);menu.append(summary,items);
   header.append(menu);
  }
  // Preserve all existing native callbacks: simply make their duplicates
  // visually secondary once the replacement menu is actually mounted.
  const report=reportCandidate(sidebar);
  if(report)report.classList.add('swapp-social-hidden-report');
  sidebar.classList.add('swapp-social-has-menu');
  const signal=menu.querySelector('.swapp-social-report');
  const moderate=menu.querySelector('.swapp-social-moderate');
  if(signal)signal.hidden=!report;
  if(moderate)moderate.hidden=!mod;
  // Authentic status only; no fabricated participant counts.
  const status=header.querySelector('.swapp-social-live-status')||
   make('span','swapp-social-live-status','● Direct');
  if(!status.isConnected)header.insertBefore(status,menu);
  const assist=pane.querySelector('.chatAssist');
  const form=pane.querySelector('.chatForm');
  const input=form?.querySelector('#chatInput');
  if(assist&&input&&!assist.querySelector('.swapp-social-react')){
   const react=make('div','swapp-social-react');
   const trigger=make('button','swapp-social-react-trigger','Réactions');
   trigger.type='button';trigger.title='Insérer une réaction dans ton message';
   trigger.setAttribute('aria-expanded','false');
   const tray=make('div','swapp-social-react-tray');tray.hidden=true;
   tray.setAttribute('aria-label','Réactions rapides');
   for(const emoji of ['🔥','💜','😂','👏','🤯','✨']){
    const chip=make('button','swapp-social-react-chip',emoji);chip.type='button';
    chip.setAttribute('aria-label','Insérer '+emoji);
    chip.addEventListener('click',()=>{
     // Compose through the existing native input. Nothing is sent until the
     // viewer explicitly chooses SWAPP's existing Envoyer button.
     const old=String(input.value||''),a=input.selectionStart??old.length,b=input.selectionEnd??a;
     const value=(a&&!/\s$/.test(old.slice(0,a))?' ':'')+emoji+' ';
     if(input.setRangeText)input.setRangeText(value,a,b,'end');
     else input.value=old.slice(0,a)+value+old.slice(b);
     input.dispatchEvent(new Event('input',{bubbles:true}));
     input.focus();tray.hidden=true;trigger.setAttribute('aria-expanded','false');
    });
    tray.append(chip);
   }
   trigger.addEventListener('click',()=>{
    tray.hidden=!tray.hidden;trigger.setAttribute('aria-expanded',String(!tray.hidden));
   });
   react.append(trigger,tray);
   // Insert before rewards for a consistent bottom tool strip.
   const rewards=assist.querySelector('.swapp-rewards-anchor');
   if(rewards)assist.insertBefore(react,rewards);else assist.append(react);
  }
 }
 let pending=false;
 function scan(){
  pending=false;
  if(!root.classList.contains('active'))return;
  root.querySelectorAll('.creatorRefine.swapp-channel-polish[data-channel-live="true"]')
   .forEach(upgradeChat);
 }
 function schedule(){if(pending)return;pending=true;requestAnimationFrame(scan)}
 new MutationObserver(records=>{
  if(!root.classList.contains('active'))return;
  if(records.some(r=>r.addedNodes.length||r.removedNodes.length))schedule();
 }).observe(root,{childList:true,subtree:true});
 document.addEventListener('click',event=>{
  if(!event.target.closest('.swapp-social-chat-menu')){
   root.querySelectorAll('.swapp-social-chat-menu[open]').forEach(m=>{m.open=false});
  }
 });
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  root.querySelectorAll('.swapp-social-chat-menu[open]').forEach(m=>{m.open=false});
  root.querySelectorAll('.swapp-social-react-tray:not([hidden])').forEach(t=>{t.hidden=true});
  root.querySelectorAll('.swapp-social-react-trigger[aria-expanded="true"]')
   .forEach(t=>{t.setAttribute('aria-expanded','false')});
 });
 window.addEventListener('popstate',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
 setInterval(()=>{if(root.classList.contains('active'))schedule()},2500);
 schedule();
})();
