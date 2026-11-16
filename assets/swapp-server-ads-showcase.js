/* SERVEUR+ sponsorship showcase: commercial information, not a paid ranking. */
(()=>{
 'use strict';
 const root=document.querySelector('.ss'),results=root?.querySelector('#ss-results');
 if(!root||!results)return;
 const section=document.createElement('section');
 section.className='ss-sponsor-showcase';
 section.setAttribute('aria-labelledby','ss-sponsor-title');
 section.innerHTML=`<div class="ss-sponsor-overline">SERVEUR+ / VISIBILITÉ</div>
 <div class="ss-sponsor-layout"><div class="ss-sponsor-copy">
 <h2 id="ss-sponsor-title">Votre communauté mérite d'être découverte.</h2>
 <p>Préparez une campagne dans les espaces sponsorisés de SWAPP, sans modifier les votes ni le classement des serveurs.</p>
 <a class="ss-sponsor-link" href="/serveurs/creer">Présenter ma communauté <span aria-hidden="true">↗</span></a>
 </div><div class="ss-sponsor-prices" aria-label="Tarifs publicitaires envisagés">
 <div><span>Découverte</span><strong>14,90 €</strong><small>7 jours</small></div>
 <div><span>Visibilité</span><strong>39,90 €</strong><small>30 jours</small></div>
 <div><span>Campagne</span><strong>79,90 €</strong><small>30 jours</small></div>
 </div></div><p class="ss-sponsor-disclaimer">Offres en préparation. Aucune réservation ou transaction n'est encore disponible. Les publicités seront identifiées comme telles.</p>`;
 results.before(section);
 // Paid inventory is a separate labelled placement; never change organic ordering.
 const placement=document.createElement('aside');
 placement.className='ss-sponsored-placement';
 placement.hidden=true;
 placement.setAttribute('aria-label','Communauté sponsorisée');
 section.after(placement);
 const renderSponsored=()=>{
  const slot=root.dataset.ssCurrentGame?'server_category':'server_discovery';
  fetch('/api/swapp/server-ads/slot/'+slot,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}})
   .then(res=>res.ok?res.json():null)
   .then(data=>{
    const ad=data?.sponsored;
    if(!ad||ad.sponsored!==true||ad.label!=='Publicité'||typeof ad.serverId!=='string')return;
    const match=[...root.querySelectorAll('[data-ss-server-id]')].find(node=>node.dataset.ssServerId===ad.serverId);
    if(!match){placement.hidden=true;return}
    const link=match.querySelector('a.ss-card-image[href^="/serveurs/"]');
    if(!link){placement.hidden=true;return}
    const title=match.querySelector('.ss-cover-caption')?.textContent?.trim()||'Communauté SWAPP';
    const game=match.querySelector('.ss-card-game')?.textContent?.trim()||'';
    placement.replaceChildren();
    const heading=document.createElement('div');
    heading.className='ss-sponsored-label';
    heading.textContent='PUBLICITÉ · COMMUNAUTÉ SPONSORISÉE';
    const destination=document.createElement('a');
    destination.className='ss-sponsored-destination';
    destination.href=link.getAttribute('href');
    const name=document.createElement('strong');name.textContent=title.slice(0,100);
    const detail=document.createElement('span');detail.textContent=game?game+' · Découvrir le serveur':'Découvrir le serveur';
    destination.append(name,detail);
    placement.append(heading,destination);
    placement.hidden=false;
   }).catch(()=>{placement.hidden=true});
 };
 renderSponsored();
 const watcher=new MutationObserver(()=>{if(!placement.hidden||!root.isConnected)return;renderSponsored()});
 watcher.observe(results,{childList:true});
 setTimeout(()=>watcher.disconnect(),15000);
})();
