/* SWAPP Live watch improvements: controls around the working HLS iframe, never inside the transport. */
(function(){
 'use strict';
 const WATCH='#channel .creatorRefine.swapp-channel-polish[data-channel-live="true"]';
 // Viewing controls apply only to the current page session. They must not
 // reopen a future live in cinema mode or silently hide the chat.
 const mode={immersion:'off',chat:'shown'};
 const icons={
  immersion:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9V5h4m6 0h4v4M5 15v4h4m6 0h4v-4"/><circle cx="12" cy="12" r="2.25"/></svg>',
  chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-8 8 8.2 8.2 0 0 1-3-.6L4 21l1.6-5A8 8 0 1 1 20 12Z"/></svg>'
 };
 function button(cls,svg,label){
  const el=document.createElement('button');
  el.type='button';el.className=cls;
  el.innerHTML=svg+'<span>'+label+'</span>';
  return el;
 }
 function updateUI(page){
  const immersion=page.dataset.watchImmersion==='on';
  const hide=page.dataset.watchChat==='hidden';
  const btnImmersion=page.querySelector('.swapp-watch-immersion-btn');
  const btnChat=page.querySelector('.swapp-watch-chat-btn');
  if(btnImmersion){
   btnImmersion.setAttribute('aria-pressed',String(immersion));
   btnImmersion.setAttribute('aria-label',immersion?'Désactiver le mode Immersion':'Activer le mode Immersion');
   btnImmersion.title=immersion?'Quitter le mode Immersion (Échap)':'Assombrir la page autour du direct';
   btnImmersion.querySelector('span').textContent=immersion?'Quitter Immersion':'Mode Immersion';
  }
  if(btnChat){
   btnChat.setAttribute('aria-pressed',String(hide));
   btnChat.setAttribute('aria-expanded',String(!hide));
   btnChat.querySelector('span').textContent=hide?'Afficher le chat':'Masquer le chat';
   const chat=page.querySelector('.channelLiveSidebar');
   if(chat){if(!chat.id)chat.id='swapp-channel-live-chat';btnChat.setAttribute('aria-controls',chat.id);}
  }
 }

 // Four fixed, non-interactive dark panels frame a clear rectangle around
 // video + chat + controls. Unlike a full-screen backdrop, they NEVER darken
 // pixels inside the stream, obscure interactive chat, or trap pointer events.
 let scrim=null,activeImmersivePage=null,dimFrame=0;
 function ensureScrim(){
  if(scrim)return scrim;
  const wrapper=document.createElement('div');
  wrapper.className='swapp-immersion-dimmer';
  wrapper.setAttribute('aria-hidden','true');
  wrapper.hidden=true;
  const sections={};
  for(const side of ['top','right','bottom','left']){
   const panel=document.createElement('div');
   panel.className='swapp-immersion-dimmer-'+side;
   wrapper.appendChild(panel);sections[side]=panel;
  }
  wrapper._sections=sections;
  document.body.appendChild(wrapper);
  scrim=wrapper;
  return wrapper;
 }
 function disableImmersion(){
  if(activeImmersivePage?.isConnected){
   activeImmersivePage.dataset.watchImmersion='off';
   updateUI(activeImmersivePage);
  }
  activeImmersivePage=null;mode.immersion='off';
  if(scrim)scrim.hidden=true;
  cancelAnimationFrame(dimFrame);dimFrame=0;
 }
 function updateImmersion(){
  dimFrame=0;
  const page=activeImmersivePage;
  if(!page?.isConnected||page.dataset.watchImmersion!=='on'){
   disableImmersion();return;
  }
  const root=document.getElementById('channel');
  if(!root?.classList.contains('active')){disableImmersion();return}
  const focus=page.querySelector('.channelLiveLayout');
  if(!focus){disableImmersion();return}
  const rect=focus.getBoundingClientRect();
  const vw=document.documentElement.clientWidth,vh=window.innerHeight;
  const margin=8;
  // Keep the immersion while the media/chat region intersects the viewport.
  // Scrolling past the media returns to an ordinary readable page.
  if(rect.bottom<48 || rect.top>vh-48){disableImmersion();return}
  const bound=(v,max)=>Math.max(0,Math.min(max,Math.round(v)));
  const x1=bound(rect.left-margin,vw),x2=bound(rect.right+margin,vw);
  const y1=bound(rect.top-margin,vh),y2=bound(rect.bottom+margin,vh);
  const {top,right,bottom,left}=ensureScrim()._sections;
  const place=(el,x,y,w,h)=>{
   el.style.left=x+'px';el.style.top=y+'px';
   el.style.width=Math.max(0,w)+'px';el.style.height=Math.max(0,h)+'px';
  };
  place(top,0,0,vw,y1);
  place(bottom,0,y2,vw,vh-y2);
  place(left,0,y1,x1,Math.max(0,y2-y1));
  place(right,x2,y1,vw-x2,Math.max(0,y2-y1));
 }
 function scheduleImmersion(){
  if(!activeImmersivePage||dimFrame)return;
  dimFrame=requestAnimationFrame(updateImmersion);
 }
 function setImmersion(page,on){
  if(!on){disableImmersion();return}
  if(activeImmersivePage&&activeImmersivePage!==page)disableImmersion();
  activeImmersivePage=page;
  page.dataset.watchImmersion='on';mode.immersion='on';
  ensureScrim().hidden=false;
  updateUI(page);
  scheduleImmersion();
 }
 // Defensive bound for additional legacy styles injected after initial layout:
 // never allow a channel card's right edge to exceed the actual viewport.
 function fitViewport(page){
  // Never write viewport-dependent widths on scroll or resize: it produces
  // a feedback loop with the 16:9 media frame and makes it jump.
  if(!page?.isConnected)return;
  page.style.removeProperty('width');
  page.style.removeProperty('max-width');
 }
 // Chat follows the visible video surface, not the surrounding controls/Pulse.
 // ResizeObserver accounts for theatre mode, sidebar toggles and window resize.
 function syncChat(page){
  if(!page?.isConnected||page.dataset.watchChat==='hidden')return;
  const video=page.querySelector('.channelMainPlayer > :is(.player,.premiumPlayer,.oryonMainPlayer)');
  const chat=page.querySelector('.channelLiveSidebar .chatPanel');
  if(!video||!chat)return;
  const videoRect=video.getBoundingClientRect();
  const h=Math.round(videoRect.height);
  if(!Number.isFinite(h)||h<140)return;
  const mobile=window.matchMedia('(max-width:1080px)').matches;
  // Keep the chat composer and suggestion actions visible when the video is short.
  // On desktop, preserve exact player height whenever it is sufficiently tall.
  const actual=mobile?Math.max(400,Math.min(440,h)):Math.max(400,h);
  chat.style.setProperty('--swapp-chat-player-height',actual+'px');
  // Lock the complete chat panel to the video height; only the message log
  // scrolls. Previous min-height-only sizing let the composer overflow below it.
  chat.style.setProperty('height',actual+'px','important');
  chat.style.setProperty('min-height','0','important');
  chat.style.setProperty('max-height',actual+'px','important');
  // On an offline channel the grid aligns the chat without translations.
  if(page.dataset.channelLive==='false'){
   chat.style.removeProperty('translate');
   chat.dataset.swappAlignShift='0';
   return;
  }
  // Grid layout, not sub-pixel translation, keeps chat beside the player.
  // No scroll-dependent translate: it made the page wobble while scrolling.
  chat.style.removeProperty('translate');
  chat.dataset.swappAlignShift='0';
 }

 // Prefer actual broadcast metadata; a creator's channel name is NOT their
 // live title. Data may arrive after the channel layout has rendered.
 function currentBroadcastTitle(page){
  const profile=typeof state!=='undefined'?state?.channelProfile:null;
  const labels=[
   page.dataset.liveTitle,page.dataset.streamTitle,
   page.querySelector('[data-live-title]')?.getAttribute('data-live-title'),
   profile?.current_live_title,profile?.live_title,profile?.stream_title,profile?.live?.title,
   profile?.current_live?.title,profile?.broadcast?.title
  ];
  return labels.map(value=>String(value||'').trim()).find(value=>value.length>0&&value.length<=180)||'';
 }
 function broadcastLogin(page){
  const profile=typeof state!=='undefined'?state?.channelProfile:null;
  const found=String(profile?.login||profile?.username||page.dataset.channelLogin||'').trim();
  if(/^[a-z0-9_-]{2,48}$/i.test(found))return found.toLowerCase();
  const match=(location.pathname||'').match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return match?match[1].toLowerCase():'';
 }
 function installBroadcastHeadline(page,main,video){
  const header=document.createElement('div');header.className='swapp-watch-headline';
  const pill=document.createElement('span');pill.className='swapp-watch-live-pill';pill.textContent='EN DIRECT';
  const details=document.createElement('div');details.className='swapp-watch-headline-details';
  const title=document.createElement('h2');title.className='swapp-watch-live-title';
  const category=document.createElement('span');category.className='swapp-watch-live-category';
  title.textContent=currentBroadcastTitle(page)||'Direct en cours';
  details.append(title,category);header.append(pill,details);
  const login=broadcastLogin(page);
  const owner=typeof state!=='undefined' && !!state?.session?.local?.id &&
    String(state.session.local.login||'').toLowerCase()===login;
  if(owner){
    const edit=document.createElement('button');
    edit.type='button';edit.className='swapp-watch-edit btn secondary';
    edit.dataset.swappLiveOwnerEdit='1';edit.textContent='Modifier le direct';
    edit.addEventListener('click',()=>globalThis.SwappBrowserStudio?.editLive?.());
    header.appendChild(edit);
  }
  if(video.parentElement===main)main.insertBefore(header,video);
  else main.prepend(header);
  // The owner may have edited the metadata without restarting OBS.
  const update=(titleValue,categoryValue)=>{
    const name=String(titleValue||'').trim();
    if(name)title.textContent=name.slice(0,120);
    const game=String(categoryValue||'').trim().slice(0,60);
    category.textContent=game;
    category.hidden=!game;
  };
  const localCategory=typeof state!=='undefined'?state?.channelProfile?.current_live_category:'';
  update(currentBroadcastTitle(page),localCategory);
  const refresh=async()=>{
    if(!page.isConnected||!login)return;
    try{
      const response=await fetch('/api/oryon/channel/'+encodeURIComponent(login)+'/status',
       {cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(5500)});
      if(!response.ok)return;
      const data=await response.json();
      if(!page.isConnected)return;
      update(data?.live?.title||currentBroadcastTitle(page),data?.live?.category||localCategory);
    }catch(_){/* temporary network errors must never re-render the media */}
  };
  void refresh();
  const timer=setInterval(()=>{
    if(!page.isConnected){clearInterval(timer);return}
    void refresh();
  },15000);
 }
 // Offline channels share the same measured media/chat alignment.
 // Keep the native chat element in place; only position and size it.
 function installOfflineAlignment(page){
  if(page.dataset.swappOfflineChatSync==='1')return;
  const video=page.querySelector('.channelMainPlayer > :is(.player,.premiumPlayer,.oryonMainPlayer)');
  const chat=page.querySelector('.channelLiveSidebar .chatPanel');
  if(!video||!chat)return;
  page.dataset.swappOfflineChatSync='1';
  requestAnimationFrame(()=>syncChat(page));
  for(const ms of [180,720])setTimeout(()=>{if(page.isConnected)syncChat(page)},ms);
  if(typeof ResizeObserver==='function'){
   const watcher=new ResizeObserver(()=>{
    if(!page.isConnected){watcher.disconnect();return}
    if(page.dataset.channelLive!=='false'){watcher.disconnect();return}
    syncChat(page);
   });
   watcher.observe(video);
  }
 }

 function install(page){
  if(!page||page.querySelector('.swapp-watch-tools'))return;
  const main=page.querySelector('.channelMainPlayer');
  const video=main?.querySelector('.premiumPlayer,.oryonMainPlayer,.player');
  if(!main||!video)return;
  page.dataset.watchImmersion=mode.immersion;
  page.dataset.watchChat=mode.chat;
  installBroadcastHeadline(page,main,video);
  const row=document.createElement('div');
  row.className='swapp-watch-tools';
  row.setAttribute('role','group');
  row.setAttribute('aria-label','Affichage du direct');
  const immersion=button('swapp-watch-immersion-btn',icons.immersion,'Mode Immersion');
  const chat=button('swapp-watch-chat-btn',icons.chat,'Masquer le chat');
  immersion.addEventListener('click',()=>{
   const next=page.dataset.watchImmersion!=='on';
   setImmersion(page,next);
   requestAnimationFrame(()=>{window.swappFitChat1014?.();syncChat(page);scheduleImmersion()});
   if(next){
    // Move the player into view before refining the dark surround.
    main.scrollIntoView?.({
     behavior:window.matchMedia?.('(prefers-reduced-motion:reduce)')?.matches?'instant':'smooth',
     block:'center'
    });
   }
  });
  chat.addEventListener('click',()=>{
   const next=page.dataset.watchChat==='hidden'?'shown':'hidden';
   page.dataset.watchChat=next;mode.chat=next;updateUI(page);
   requestAnimationFrame(()=>{window.swappFitChat1014?.();syncChat(page)});
  });
  row.append(immersion,chat);
  main.appendChild(row);
  updateUI(page);
  requestAnimationFrame(()=>{
   fitViewport(page);
   window.swappFitChat1014?.();
   syncChat(page);
  });
  // Channel styles/fonts/player dimensions may finish settling after mount.
  // Repeat alignment without altering the original video or its iframe.
  for(const ms of [150,700,1600])setTimeout(()=>{
   if(page.isConnected)syncChat(page);
  },ms);
  if(typeof ResizeObserver==='function'){
   const watcher=new ResizeObserver(()=>{
    if(!page.isConnected){watcher.disconnect();return}
    syncChat(page);scheduleImmersion();
   });
   watcher.observe(video);
   if(page.querySelector('.channelLiveLayout'))watcher.observe(page.querySelector('.channelLiveLayout'));
  }
 }
 function start(){
  const root=document.getElementById('channel');
  if(!root)return;
  let queued=false;
  const scan=()=>{
   queued=false;
   if(activeImmersivePage && (!activeImmersivePage.isConnected || !root.classList.contains('active')))
    disableImmersion();
   root.querySelectorAll('.creatorRefine.swapp-channel-polish[data-channel-live="true"]').forEach(install);
   root.querySelectorAll('.creatorRefine.swapp-channel-polish[data-channel-live="false"]').forEach(installOfflineAlignment);
  };
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(scan)};
  new MutationObserver(schedule).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-channel-live','class']});
  window.addEventListener('resize',()=>root.querySelectorAll('.creatorRefine[data-channel-live]').forEach(page=>{
   fitViewport(page);
   requestAnimationFrame(()=>{window.swappFitChat1014?.();syncChat(page);scheduleImmersion()});
  }),{passive:true});
  window.addEventListener('scroll',scheduleImmersion,{capture:true,passive:true});
  document.addEventListener('keydown',event=>{
   if(event.key==='Escape' && activeImmersivePage)disableImmersion();
  });
  schedule();
 }
 function bootFallback(){
  // On a public creator URL, a failed SPA bootstrap must not hide a working direct.
  const raw=(location.pathname||'/').replace(/\/+$/,'');
  const match=raw.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})$/i);
  if(!match)return;
  const reserved=new Set(['home','live','twitch','social','actus','compte','discover','decouvrir','boutique','studio','dashboard','settings','admin','manager','login','register','categories','equipes','teams','creators','creator','tv','agenda','contact']);
  const login=match[1].toLowerCase();
  if(reserved.has(login))return;
  setTimeout(async()=>{
   const home=document.getElementById('home');
   const boot=home?.querySelector('.swappBoot');
   if(!boot||boot.dataset.watchRecovery==='1'||!home.classList.contains('active'))return;
   if(document.getElementById('channel')?.querySelector('.creatorRefine'))return;
   let active=false;
   try{
    const r=await fetch('/api/oryon/local-relay/'+encodeURIComponent(login)+'/state',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(r.ok){const data=await r.json();active=data.active===true&&data.segment_count>0}
   }catch(_){}
   // Recheck after the network call: startup may have recovered meanwhile.
   if(!boot.isConnected||!home.classList.contains('active')||
      document.getElementById('channel')?.querySelector('.creatorRefine'))return;
   const view=document.createElement('div');view.className='swapp-watch-boot-recovery';
   const title=document.createElement('strong');
   title.textContent=active?'Le direct est disponible':'SWAPP tarde à charger';
   const description=document.createElement('p');
   description.textContent=active
    ?'Le site est momentanément indisponible. Le lecteur direct reste accessible.'
    :'Le chargement de cette chaîne ne répond pas. Tu peux réessayer.';
   const actions=document.createElement('div');actions.className='swapp-watch-boot-actions';
   const retry=document.createElement('button');retry.type='button';retry.textContent='Réessayer';
   retry.addEventListener('click',()=>location.reload());
   actions.append(retry);
   if(active){
    const url='/api/oryon/local-relay/'+encodeURIComponent(login)+'/player';
    const link=document.createElement('a');link.href=url;link.textContent='Ouvrir le direct';
    actions.append(link);
    const frame=document.createElement('iframe');
    frame.src=url;frame.title='SWAPP Live · '+login;
    frame.allow='autoplay; fullscreen; picture-in-picture';
    frame.setAttribute('allowfullscreen','');
    view.append(frame);
   }
   view.prepend(title,description);view.append(actions);
   boot.replaceChildren(view);
   boot.dataset.watchRecovery='1';
  },14000);
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={WATCH};return}
 const ready=()=>{start();bootFallback()};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});
 else ready();
})();