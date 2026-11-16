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
})();
