/* SWAPP Live watch improvements: controls around the working HLS iframe, never inside the transport. */
(function(){
 'use strict';
 const WATCH='#channel .creatorRefine.swapp-channel-polish[data-channel-live="true"]';
 const KEY='swapp:watch:theatre';
 const CHAT_KEY='swapp:watch:chat';
 function stored(key){
  try{return sessionStorage.getItem(key)}catch(_){return null}
 }
 function store(key,value){
  try{sessionStorage.setItem(key,value)}catch(_){}
 }
 const icons={
  theatre:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6M4 5v6m16-6h-6m6 0v6M4 19h6m-6 0v-6m16 6h-6m6 0v-6"/></svg>',
  chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-8 8 8.2 8.2 0 0 1-3-.6L4 21l1.6-5A8 8 0 1 1 20 12Z"/></svg>'
 };
 function button(cls,svg,label){
  const el=document.createElement('button');
  el.type='button';el.className=cls;
  el.innerHTML=svg+'<span>'+label+'</span>';
  return el;
 }
 function updateUI(page){
  const theatre=page.dataset.watchTheatre==='on';
  const hide=page.dataset.watchChat==='hidden';
  const btnTheatre=page.querySelector('.swapp-watch-theatre-btn');
  const btnChat=page.querySelector('.swapp-watch-chat-btn');
  if(btnTheatre){
   btnTheatre.setAttribute('aria-pressed',String(theatre));
   btnTheatre.querySelector('span').textContent=theatre?'Quitter le mode cinéma':'Mode cinéma';
  }
  if(btnChat){
   btnChat.setAttribute('aria-pressed',String(hide));
   btnChat.setAttribute('aria-expanded',String(!hide));
   btnChat.querySelector('span').textContent=hide?'Afficher le chat':'Masquer le chat';
   const chat=page.querySelector('.channelLiveSidebar');
   if(chat){if(!chat.id)chat.id='swapp-channel-live-chat';btnChat.setAttribute('aria-controls',chat.id);}
  }
 }
 function install(page){
  if(!page||page.querySelector('.swapp-watch-tools'))return;
  const main=page.querySelector('.channelMainPlayer');
  const video=main?.querySelector('.premiumPlayer,.oryonMainPlayer,.player');
  if(!main||!video)return;
  page.dataset.watchTheatre=stored(KEY)==='on'?'on':'off';
  page.dataset.watchChat=stored(CHAT_KEY)==='hidden'?'hidden':'shown';
  const row=document.createElement('div');
  row.className='swapp-watch-tools';
  row.setAttribute('role','group');
  row.setAttribute('aria-label','Affichage du direct');
  const cinema=button('swapp-watch-theatre-btn',icons.theatre,'Mode cinéma');
  const chat=button('swapp-watch-chat-btn',icons.chat,'Masquer le chat');
  cinema.addEventListener('click',()=>{
   const next=page.dataset.watchTheatre==='on'?'off':'on';
   page.dataset.watchTheatre=next;store(KEY,next);updateUI(page);
   if(next==='on'&&!window.matchMedia?.('(prefers-reduced-motion:reduce)')?.matches)
    main.scrollIntoView?.({behavior:'smooth',block:'start'});
  });
  chat.addEventListener('click',()=>{
   const next=page.dataset.watchChat==='hidden'?'shown':'hidden';
   page.dataset.watchChat=next;store(CHAT_KEY,next);updateUI(page);
  });
  row.append(cinema,chat);
  main.appendChild(row);
  updateUI(page);
 }
 function start(){
  const root=document.getElementById('channel');
  if(!root)return;
  let queued=false;
  const scan=()=>{
   queued=false;
   root.querySelectorAll('.creatorRefine.swapp-channel-polish[data-channel-live="true"]').forEach(install);
  };
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(scan)};
  new MutationObserver(schedule).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-channel-live','class']});
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
   if(!boot||!home.classList.contains('active'))return;
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