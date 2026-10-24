/* SWAPP Live Hearts: reuse existing Pulse Live transport and local animation.
   Only presentation changes; no additional reactions API or authentication. */
(function(){
 'use strict';
 const CHANNEL='#channel .creatorRefine[data-channel-live="true"] .channelMainPlayer :is(.premiumPlayer,.oryonMainPlayer,.player)';
 const DISCOVER='#discover .premiumPlayer,#discover .player,#discover .oryonMainPlayer,#discover .hfLivePlayer,#discover .twitchPlayer';
 const liveSelectors=CHANNEL+','+DISCOVER;
 const observed=new Map();
 const reactions=[['fire','🔥','Flamme'],['wow','😮','Surprise'],['laugh','😂','Rire'],['here','👀','Je regarde']];
 const compact=new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1});

 function send(type,origin){
  // Existing Pulse Live owns persistence, moments and the floating animation.
  if(typeof window.sendPulseLive==='function')window.sendPulseLive(type,origin);
 }
 function create(tag,className,text){
  const node=document.createElement(tag);node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
 }
 function decorate(player){
  if(player.dataset.swappHeartUi==='1')return;
  // Wait for the original Pulse lifecycle to build its counter and buttons.
  // Other legacy widgets can be inserted between the video and the Pulse dock.
  // Keep looking through nearby siblings rather than depending on adjacency.
  let dock=player.nextElementSibling,checked=0;
  while(dock&&checked++<5&&!dock.classList.contains('pulseDock')){
   if(dock.matches('.premiumPlayer,.player,.oryonMainPlayer,.hfLivePlayer,.twitchPlayer'))break;
   dock=dock.nextElementSibling;
  }
  if(!dock?.classList.contains('pulseDock')||!player.querySelector('.pulseButton'))return;
  if(!player.querySelector('iframe,video'))return;
  const rail=create('div','swapp-heart-rail');
  const heart=create('button','swapp-heart-tap');
  heart.type='button';heart.setAttribute('aria-label','Envoyer un cœur au direct');
  heart.setAttribute('title','Envoyer un cœur');
  heart.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';
  const count=create('span','swapp-heart-count','0');
  count.setAttribute('aria-label','Réactions du direct');
  const more=create('button','swapp-heart-more','+');
  more.type='button';more.setAttribute('aria-label','Autres réactions');
  more.setAttribute('aria-expanded','false');
  more.setAttribute('title','Autres réactions');
  const picker=create('div','swapp-heart-picker');
  picker.hidden=true;picker.setAttribute('aria-label','Réactions supplémentaires');
  for(const [type,emoji,label] of reactions){
   const button=create('button','swapp-heart-option',emoji);
   button.type='button';button.title=label;button.setAttribute('aria-label',label);
   button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();send(type,heart);
    picker.hidden=true;more.setAttribute('aria-expanded','false');
   });
   picker.appendChild(button);
  }
  let lastClick=0;
  heart.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   const now=Date.now();
   if(now-lastClick<130)return; // Avoid duplicate pointer events, not normal tapping.
   lastClick=now;send('heart',heart);
   heart.classList.remove('swapp-heart-bump');
   void heart.offsetWidth;heart.classList.add('swapp-heart-bump');
  });
  heart.addEventListener('dblclick',event=>event.stopPropagation());
  more.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   picker.hidden=!picker.hidden;
   more.setAttribute('aria-expanded',String(!picker.hidden));
  });
  rail.addEventListener('keydown',event=>{
   if(event.key==='Escape'){picker.hidden=true;more.setAttribute('aria-expanded','false');more.focus();}
  });
  rail.append(heart,count,more,picker);
  player.appendChild(rail);
  player.dataset.swappHeartUi='1';
  dock.dataset.swappPulseHidden='1';

  function refresh(){
   const raw=Number(dock.querySelector('[data-pulse-count]')?.textContent||0);
   if(!Number.isFinite(raw))return;
   count.textContent=compact.format(Math.max(0,raw));
   count.title=Math.max(0,raw).toLocaleString('fr-FR')+' réactions';
  }
  refresh();
  const watcher=new MutationObserver(refresh);
  watcher.observe(dock,{subtree:true,childList:true,characterData:true});
  observed.set(player,watcher);
 }
 function scan(){
  for(const [player,watcher] of observed){
   if(!player.isConnected){watcher.disconnect();observed.delete(player);}
  }
  document.querySelectorAll(liveSelectors).forEach(decorate);
 }
 function start(){
  const channel=document.getElementById('channel');
  const discover=document.getElementById('discover');
  if(!channel&&!discover)return;
  let scheduled=false;
  function schedule(){
   if(scheduled)return;
   scheduled=true;
   requestAnimationFrame(()=>{scheduled=false;scan();});
  }
  const observer=new MutationObserver(schedule);
  for(const root of [channel,discover].filter(Boolean)){
   observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-channel-live']});
  }
  document.addEventListener('pointerdown',event=>{
   if(event.target.closest('.swapp-heart-rail'))return;
   document.querySelectorAll('.swapp-heart-picker:not([hidden])').forEach(picker=>{
    picker.hidden=true;
    picker.parentElement?.querySelector('.swapp-heart-more')?.setAttribute('aria-expanded','false');
   });
  },{passive:true});
  schedule();
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={liveSelectors};return;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();