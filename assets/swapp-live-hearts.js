/* Pulse stays in the video. Legacy SWAPP Pulse remains the single source of
   reaction totals, rate and hot moments: no new counters or API requests. */
(function(){
 'use strict';
 const CHANNEL='#channel .creatorRefine .channelMainPlayer :is(.premiumPlayer,.oryonMainPlayer,.player)';
 const DISCOVER='#discover .premiumPlayer,#discover .player,#discover .oryonMainPlayer,#discover .hfLivePlayer,#discover .twitchPlayer';
 const selector=CHANNEL+','+DISCOVER;
 const bindings=new Map();
 const emotes=[['fire','🔥','Flamme'],['wow','😮','Surprise'],['laugh','😂','Rire'],['here','👀','Je regarde']];
 const compact=new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1});
 const create=(tag,cls,value)=>{
  const el=document.createElement(tag);el.className=cls;
  if(value!==undefined)el.textContent=value;
  return el;
 };
 function legacyDock(player){
  // Pulse inserts the dock after the player. Some themes insert other cards.
  let sibling=player.nextElementSibling,steps=0;
  while(sibling&&steps++<6){
   if(sibling.classList?.contains('pulseDock'))return sibling;
   if(sibling.matches?.('.premiumPlayer,.oryonMainPlayer,.player,.channelLiveSidebar'))break;
   sibling=sibling.nextElementSibling;
  }
  return player.parentElement?.querySelector?.('.pulseDock')||null;
 }
 function react(type,source){
  if(typeof window.sendPulseLive!=='function')return;
  window.sendPulseLive(type,source);
 }
 function attach(player){
  if(!player.querySelector('iframe,video'))return;
  const page=player.closest('.creatorRefine');
  if(page?.dataset.channelLive!=='true' &&
     !player.querySelector('iframe[src*="/api/oryon/local-relay/"]'))return;
  if(player.dataset.swappHeartUi==='1')return;
  const rail=create('div','swapp-heart-rail');
  rail.setAttribute('role','group');
  rail.setAttribute('aria-label','Pulse Live');
  const heart=create('button','swapp-heart-tap');
  heart.type='button';
  heart.title='Envoyer un cœur';
  heart.setAttribute('aria-label','Envoyer un cœur au direct');
  heart.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/></svg>';
  const total=create('span','swapp-heart-count','0');
  total.setAttribute('aria-label','Nombre de réactions Pulse');
  const meter=create('div','swapp-heart-meter');
  meter.setAttribute('role','progressbar');
  meter.setAttribute('aria-label','Intensité Pulse en direct');
  meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
  meter.setAttribute('aria-valuenow','4');
  meter.appendChild(create('span','swapp-heart-meter-fill'));
  const hot=create('span','swapp-heart-hot','Moment chaud');
  hot.hidden=true;
  const more=create('button','swapp-heart-more','+');
  more.type='button';
  more.setAttribute('aria-label','Autres réactions Pulse');
  more.setAttribute('aria-expanded','false');
  more.title='Autres réactions';
  const menu=create('div','swapp-heart-picker');
  menu.hidden=true;
  for(const [type,emoji,label] of emotes){
   const btn=create('button','swapp-heart-option',emoji);
   btn.type='button';btn.title=label;btn.setAttribute('aria-label',label);
   btn.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();react(type,btn);
    menu.hidden=true;more.setAttribute('aria-expanded','false');
   });
   menu.appendChild(btn);
  }
  heart.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   react('heart',heart);
   heart.classList.remove('swapp-heart-bump');
   void heart.offsetWidth;heart.classList.add('swapp-heart-bump');
  });
  heart.addEventListener('dblclick',event=>event.stopPropagation());
  more.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   menu.hidden=!menu.hidden;
   more.setAttribute('aria-expanded',String(!menu.hidden));
  });
  rail.addEventListener('keydown',event=>{
   if(event.key==='Escape'){menu.hidden=true;more.setAttribute('aria-expanded','false');more.focus();}
  });
  rail.append(heart,total,meter,hot,more,menu);
  player.appendChild(rail);
  player.dataset.swappHeartUi='1';
  bindings.set(player,{rail,total,meter,hot,dock:null,watcher:null});
  // Create the existing server-backed Pulse dock if the old SPA delayed it.
  // Its content remains the source of truth, but it is visually hidden.
  if(typeof window.buildPulseDockFor==='function' && !legacyDock(player)){
   try{window.buildPulseDockFor(player)}catch(_){}
  }
  sync(player);
 }
 function sync(player){
  const state=bindings.get(player);
  if(!state)return;
  const dock=legacyDock(player);
  if(!dock){
   // Even without the delayed legacy markup, a user can react immediately.
   if(state.dock){state.watcher?.disconnect();state.watcher=null;state.dock=null}
   return;
  }
  if(dock!==state.dock){
   state.watcher?.disconnect();
   state.dock=dock;
   state.watcher=new MutationObserver(()=>refresh(state));
   state.watcher.observe(dock,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','hidden']});
  }
  dock.dataset.swappPulseHidden='1';
  refresh(state);
 }
 function refresh(state){
  const dock=state.dock;
  if(!dock)return;
  const value=Number(dock.querySelector('[data-pulse-count]')?.textContent||0);
  if(Number.isFinite(value)){
   const n=Math.max(0,value);
   state.total.textContent=compact.format(n);
   state.total.title=n.toLocaleString('fr-FR')+' réactions';
  }
  const legacyMeter=dock.querySelector('.pulseMeter');
  const pct=Math.min(100,Math.max(0,Number.parseFloat(legacyMeter?.style.getPropertyValue('--pulse-width'))||4));
  state.meter.style.setProperty('--swapp-pulse-pct',pct+'%');
  state.meter.setAttribute('aria-valuenow',String(Math.round(pct)));
  const moment=dock.querySelector('.pulseMoment');
  state.hot.hidden=(!moment || moment.hidden);
  state.hot.textContent=moment?.textContent?.trim()||'Moment chaud';
 }
 function scan(){
  for(const [player,state] of bindings){
   if(!player.isConnected){
    state.watcher?.disconnect();bindings.delete(player);
   }else sync(player);
  }
  document.querySelectorAll(selector).forEach(attach);
 }
 function start(){
  const roots=['channel','discover'].map(id=>document.getElementById(id)).filter(Boolean);
  if(!roots.length)return;
  let scheduled=false;
  const schedule=()=>{
   if(scheduled)return;
   scheduled=true;
   requestAnimationFrame(()=>{scheduled=false;scan()});
  };
  for(const root of roots){
   new MutationObserver(schedule).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-channel-live']});
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
 if(typeof module!=='undefined'&&module.exports){module.exports={selector};return}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();