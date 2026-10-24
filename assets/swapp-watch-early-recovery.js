/* Emergency recovery for public creator URLs if the full SWAPP SPA cannot hydrate.
   Runs before the large application bundle; no account or private APIs are used. */
(function(){
 'use strict';
 const entry=(location.pathname||'/').replace(/\/+$/,'');
 const route=entry.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})$/i);
 if(!route)return;
 const reserved=new Set(['home','accueil','live','twitch','social','actus','compte','discover','decouvrir','boutique','studio','dashboard','settings','admin','manager','login','register','categories','equipes','teams','creators','creator','tv','agenda','contact','mentions-legales','confidentialite','cookies','cgu','plan-du-site']);
 const login=route[1].toLowerCase();
 if(reserved.has(login))return;
 setTimeout(async()=>{
  if((location.pathname||'').replace(/\/+$/,'')!==entry)return;
  const home=document.getElementById('home');
  const boot=home?.querySelector('.swappBoot');
  const channel=document.getElementById('channel');
  if(!boot||!boot.isConnected||boot.dataset.watchRecovery==='1'||!home.classList.contains('active')||channel?.querySelector('.creatorRefine'))return;
  const stateUrl='/api/oryon/local-relay/'+encodeURIComponent(login)+'/state';
  let active=false;
  try{
   const controller=new AbortController();
   const abort=setTimeout(()=>controller.abort(),4500);
   try{
    const res=await fetch(stateUrl,{cache:'no-store',signal:controller.signal,credentials:'omit'});
    if(res.ok){const data=await res.json();active=data.active===true&&Number(data.segment_count)>0;}
   }finally{clearTimeout(abort)}
  }catch(_){}
  if((location.pathname||'').replace(/\/+$/,'')!==entry||!boot.isConnected||
     boot.dataset.watchRecovery==='1'||!home.classList.contains('active')||channel?.querySelector('.creatorRefine'))return;
  const outer=document.createElement('div');
  outer.className='swapp-watch-boot-recovery';
  const title=document.createElement('strong');
  title.textContent=active?'Direct disponible':'Impossible de charger cette chaîne';
  const note=document.createElement('p');
  note.textContent=active?'Le direct reste accessible sans recharger tous les modules de SWAPP.':
   'Le chargement de SWAPP ne répond pas. Tu peux réessayer.';
  const buttons=document.createElement('div');
  buttons.className='swapp-watch-boot-actions';
  const retry=document.createElement('button');
  retry.type='button';retry.textContent='Réessayer';
  retry.addEventListener('click',()=>location.reload());
  buttons.appendChild(retry);
  if(active){
   const url='/api/oryon/local-relay/'+encodeURIComponent(login)+'/player';
   const anchor=document.createElement('a');
   anchor.href=url;anchor.textContent='Ouvrir le direct';
   buttons.appendChild(anchor);
   const iframe=document.createElement('iframe');
   iframe.title='Direct SWAPP · '+login;
   iframe.src=url;iframe.allow='autoplay; fullscreen; picture-in-picture';
   iframe.setAttribute('allowfullscreen','');
   outer.appendChild(iframe);
  }
  outer.prepend(title,note);
  outer.appendChild(buttons);
  boot.dataset.watchRecovery='1';
  boot.replaceChildren(outer);
 },12000);
})();