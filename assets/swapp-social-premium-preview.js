/* SWAPP Social premium — honest offer preview; no paid entitlement or checkout is implied. */
(()=>{
 'use strict';
 function mount(){
  const host=document.getElementById('swappSocialNative');
  if(!host||host.querySelector('[data-swapp-social-premium]'))return;
  const area=host.querySelector('.swapp-interactive');
  if(!area)return;
  const section=document.createElement('section');
  section.className='swapp-social-premium-preview';
  section.dataset.swappSocialPremium='1';
  section.setAttribute('aria-labelledby','swapp-social-premium-heading');
  section.innerHTML=`
   <div class="swapp-social-premium-head">
    <div><p class="swapp-social-premium-eyebrow">SWAPP SOCIAL / PERSONNALISATION</p>
    <h2 id="swapp-social-premium-heading">Une identité qui te ressemble.</h2>
    <p>Le Social reste ouvert à tous. Les abonnements ajouteront des signatures visuelles et des outils avancés.</p></div>
    <span class="swapp-social-premium-status">Offres en préparation</span>
   </div>
   <div class="swapp-social-premium-tiers">
    <article><div class="swapp-social-premium-tier-head"><span class="swapp-social-premium-dot swapp-social-premium-dot-plus" aria-hidden="true"></span><h3>Social+</h3></div>
    <p class="swapp-social-premium-price">5,99 € <small>/ mois TTC envisagé</small></p>
    <p>Pastille bleu glacier, thèmes de profil et statistiques enrichies.</p></article>
    <article><div class="swapp-social-premium-tier-head"><span class="swapp-social-premium-dot swapp-social-premium-dot-max" aria-hidden="true"></span><h3>Social Premium</h3></div>
    <p class="swapp-social-premium-price">9,99 € <small>/ mois TTC envisagé</small></p>
    <p>Signature argentée, profil avancé et programmation de publications.</p></article>
   </div>
   <p class="swapp-social-premium-note">Aucun paiement n'est proposé actuellement. Les pastilles illustrées sont des aperçus, pas des badges de vérification.</p>`;
  area.append(section);
 }
 const observer=new MutationObserver(()=>{mount();if(document.querySelector('[data-swapp-social-premium]'))observer.disconnect()});
 function start(){mount();if(!document.querySelector('[data-swapp-social-premium]'))observer.observe(document.body,{childList:true,subtree:true})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
