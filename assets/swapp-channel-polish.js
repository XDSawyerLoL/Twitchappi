/* SWAPP creator channel v2: upgrade the native channel without replacing its router.
 * Do not alter live transport, creator actions, chat IDs, or data persistence.
 */
(function(){
 'use strict';
 function present(value){return typeof value==='string'&&value.trim().length>0;}
 function planFor(page){
  const status=page.querySelector('.offlinePremium');
  const bio=page.querySelector('#channelBioSection p');
  const text=(bio?.textContent||'').trim();
  const owns=Array.from(page.querySelectorAll('.channelActionDock button'))
   .some(button=>(button.getAttribute('onclick')||'').includes("setView('settings')"));
  const hasBio=present(text)&&!/^cette chaîne n.a pas encore ajouté de bio\.?$/i.test(text);
  return {
   live:!status,
   owner:owns,
   banner:!!page.querySelector('.channelTopHero > img[src]:not([src=""])'),
   avatar:!!page.querySelector('.channelIdentity > img.avatar[src]:not([src=""])'),
   bio:hasBio,
   panels:!!page.querySelector('.vignetteGrid .vignetteCard:not(.vignetteEmpty)'),
   links:!!page.querySelector('.linksSide .linkCard')
  };
 }
 function navTo(node){
  if(!node)return;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  node.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
 }
 function upgrade(page){
  if(!page||page.dataset.channelPolished==='1')return;
  const p=planFor(page);
  page.dataset.channelPolished='1';
  page.dataset.channelLive=p.live?'true':'false';
  page.dataset.channelBanner=p.banner?'true':'false';
  page.dataset.channelAvatar=p.avatar?'true':'false';
  page.dataset.channelOwner=p.owner?'true':'false';
  page.dataset.channelPanels=p.panels?'true':'false';
  page.dataset.channelLinks=p.links?'true':'false';
  page.classList.add('swapp-channel-polish');
  const title=page.querySelector('.channelTitleBlock h1');
  const avatar=page.querySelector('.channelIdentity > img.avatar');
  if(avatar&&!p.avatar){
   const span=document.createElement('span');
   const name=(title?.textContent||'SWAPP').trim();
   const parts=name.split(/\s+/).filter(Boolean);
   span.className='swapp-channel-monogram';
   span.setAttribute('role','img');
   span.setAttribute('aria-label','Avatar par défaut de '+name);
   span.textContent=(parts.length>1?parts.slice(0,2).map(s=>s[0]).join(''):name.slice(0,2)).toUpperCase();
   avatar.hidden=true;
   avatar.after(span);
  }
  const intro=page.querySelector('.channelTitleBlock > p');
  if(intro&&/^(?:chaîne swapp|chaîne swapp\.?)$/i.test(intro.textContent.trim())){
   intro.textContent='Créateur sur SWAPP';
  }
  const badgedFollowers=Array.from(page.querySelectorAll('.channelBadgesBar .pill'))
   .find(el=>/^0\s+followers?$/i.test(el.textContent.trim()));
  if(badgedFollowers&&!p.owner)badgedFollowers.hidden=true;
  const nav=page.querySelector('.channelSubNav');
  if(nav){
   const destinations=[];
   if(p.live)destinations.push({label:'Direct',target:page.querySelector('#channelPlayerTop')});
   if(p.bio)destinations.push({label:'Présentation',target:page.querySelector('#channelBioSection')});
   if(p.panels||p.links||p.owner)destinations.push({label:p.owner?'Personnalisation':'Liens et panneaux',target:page.querySelector('#channelAboutSection')});
   nav.replaceChildren();
   for(const item of destinations){
    if(!item.target)continue;
    const btn=document.createElement('button');
    btn.type='button';
    btn.textContent=item.label;
    btn.addEventListener('click',()=>{
     nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));
     navTo(item.target);
    });
    if(!nav.childElementCount)btn.classList.add('active');
    nav.appendChild(btn);
   }
   if(!nav.childElementCount)nav.hidden=true;
  }
  const bioArea=page.querySelector('#channelBioSection');
  if(bioArea&&!p.bio){
   if(p.owner){
    const h=bioArea.querySelector('h2');if(h)h.textContent='Ta présentation';
    const t=bioArea.querySelector('p');
    if(t)t.textContent='Ajoute quelques mots sur ta chaîne dans les réglages de ton profil.';
   }else bioArea.hidden=true;
  }else if(bioArea){const h=bioArea.querySelector('h2');if(h)h.textContent='Présentation';}
  const panel=page.querySelector('#channelAboutSection');
  if(panel){
   page.querySelectorAll('.vignetteGrid .vignetteEmpty').forEach(el=>el.hidden=true);
   const hint=panel.querySelector('.vignetteHint');
   if(hint)hint.textContent=p.panels?'Retrouve les contenus sélectionnés par ce créateur.':
    p.owner?'Ajoute des images et des liens depuis l’éditeur de panneaux.':'';
   if(!p.panels){
    const grid=panel.querySelector('.vignetteGrid');
    if(grid)grid.hidden=true;
   }
   const links=panel.querySelector('.linksSide');
   if(links&&!p.links)links.hidden=true;
   if(!p.owner&&!p.panels&&!p.links)panel.hidden=true;
   const panelH=panel.querySelector('.vignetteHead h2');
   if(panelH)panelH.textContent=p.owner?'Personnaliser ma chaîne':'Liens et contenus';
  }
  const area=page.querySelector('.channelBelowLive');
  if(area&&!p.bio&&!p.owner&&!p.panels&&!p.links)area.hidden=true;
  const guestExplore=Array.from(page.querySelectorAll('.channelActionDock button'))
   .find(el=>(el.getAttribute('onclick')||'').includes('quickGem()'));
  if(guestExplore){
   guestExplore.textContent='Partager';
   guestExplore.setAttribute('onclick','copyCurrentChannelLink()');
   guestExplore.setAttribute('aria-label','Copier le lien public de cette chaîne');
  }
  const offline=page.querySelector('.offlinePremium');
  if(offline){
   const heading=offline.querySelector('h2'),description=offline.querySelector('p');
   if(heading)heading.textContent='Aucun direct en cours';
   if(description)description.textContent='Lorsque cette chaîne diffusera, le lecteur apparaîtra ici.';
   offline.querySelectorAll('.offlineTags span').forEach((el,i)=>{if(i>0&&!p.bio)el.hidden=true;});
   if(p.owner){
    // Gestionnaire is already in the primary header actions.
    offline.querySelector('.offlinePremiumContent > button[onclick*="manager"]')?.remove();
   }else if(!offline.querySelector('.swapp-channel-explore')){
    const a=document.createElement('a');
    a.className='swapp-channel-explore';
    a.href='/decouvrir';
    a.textContent='Découvrir les créateurs en direct';
    offline.querySelector('.offlinePremiumContent')?.appendChild(a);
   }
  }
 }
 function start(){
  const root=document.getElementById('channel');
  if(!root)return;
  let pending=false;
  const schedule=()=>{
   if(pending)return;pending=true;
   requestAnimationFrame(()=>{pending=false;upgrade(root.querySelector('.creatorRefine'));});
  };
  const observer=new MutationObserver(changes=>{
   if(changes.some(change=>change.target===root&&change.addedNodes.length))schedule();
  });
  observer.observe(root,{childList:true});
  schedule();
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={planFor};return;}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
