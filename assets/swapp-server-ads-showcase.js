/* SERVEUR+ sponsorship showcase: commercial information, not a paid ranking. */
(()=>{
 'use strict';
 const root=document.querySelector('.ss'),results=root?.querySelector('#ss-results');
 if(!root||!results)return;
 const section=document.createElement('section');
 section.className='ss-sponsor-showcase';
 section.setAttribute('aria-labelledby','ss-sponsor-title');
 section.innerHTML=`<div class="ss-sponsor-art" aria-hidden="true"><span class="ss-sponsor-art-ring"></span><span class="ss-sponsor-art-cross">+</span><span class="ss-sponsor-art-word">SWAPP</span><span class="ss-sponsor-art-sub">SERVER DISCOVERY</span></div>
 <div class="ss-sponsor-content"><div class="ss-sponsor-overline">SERVEUR+ · VISIBILITÉ</div>
 <h2 id="ss-sponsor-title">Faites grandir votre communauté.</h2>
 <p>Une place pour votre serveur auprès des joueurs qui cherchent leur prochain univers.</p>
 <a class="ss-sponsor-link" href="/serveurs/creer">Présenter mon serveur <span aria-hidden="true">↗</span></a>
 <p class="ss-sponsor-disclaimer">Offres sponsorisées à venir · sans influence sur le classement</p></div>
 <div class="ss-sponsor-price-line" aria-label="Tarifs envisagés">Dès <strong>14,90 €</strong> <span>/ 7 jours</span></div>`;
 results.before(section);
 // Paid inventory is a separate labelled placement; never change organic ordering.
 const placement=document.createElement('aside');
 placement.className='ss-sponsored-placement';
 placement.hidden=true;
 placement.setAttribute('aria-label','Communauté sponsorisée');
 section.after(placement);
 // Fetch once, then match against directory cards as they load asynchronously.
 // Never issue one network request per MutationObserver event.
 let campaign=null,finished=false;
 let observer;
 const update=()=>{
  if(!campaign)return;
  const match=[...results.querySelectorAll('[data-ss-server-id]')].find(node=>node.dataset.ssServerId===campaign.serverId);
  if(!match){placement.hidden=true;return}
  const link=match.querySelector('a.ss-card-image[href^="/serveurs/"]');
  if(!link){placement.hidden=true;return}
  const href=link.getAttribute('href');
  if(!/^\/serveurs\/[a-z0-9-]+\/[a-z0-9-]+$/.test(href)){placement.hidden=true;return}
  const title=match.querySelector('.ss-cover-caption')?.textContent?.trim()||'Communauté SWAPP';
  const game=match.querySelector('.ss-card-game')?.textContent?.trim()||'';
  const heading=document.createElement('div');
  heading.className='ss-sponsored-label';
  heading.textContent='PUBLICITÉ · COMMUNAUTÉ SPONSORISÉE';
  const destination=document.createElement('a');
  destination.className='ss-sponsored-destination';
  destination.href=href;
  const name=document.createElement('strong');name.textContent=title.slice(0,100);
  const detail=document.createElement('span');detail.textContent=game?game+' · Découvrir le serveur':'Découvrir le serveur';
  destination.append(name,detail);
  placement.replaceChildren(heading,destination);
  placement.hidden=false;
 };
 observer=new MutationObserver(()=>{if(finished&&root.isConnected)update()});
 observer.observe(results,{childList:true});
 const slot=root.dataset.ssCurrentGame?'server_category':'server_discovery';
 fetch('/api/swapp/server-ads/slot/'+slot,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}})
  .then(res=>res.ok?res.json():null)
  .then(data=>{
   const ad=data?.sponsored;
   if(ad?.sponsored===true&&ad.label==='Publicité'&&typeof ad.serverId==='string')campaign=ad;
   finished=true;update();
  }).catch(()=>{finished=true;placement.hidden=true});
 window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});

})();
