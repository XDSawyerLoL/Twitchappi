/* One footer for every SWAPP view, without a second navigation menu. */
(()=>{'use strict';
function mount(){
 if(document.querySelector('[data-swapp-footer]'))return;
 const old=document.querySelector('footer.site-footer');
 if(old)old.remove();
 const footer=document.createElement('footer');footer.className='swapp-footer';footer.dataset.swappFooter='1';
 footer.setAttribute('aria-label','Informations sur SWAPP');
 footer.innerHTML=`<div class="swapp-footer-inner">
  <div class="swapp-footer-top">
   <div class="swapp-footer-brand"><a href="/" aria-label="SWAPP, accueil">SWAPP<span class="swapp-footer-brand-dot">.</span></a><p>Jeux vidéo, créateurs et communauté.<br>Une seule plateforme pour découvrir, lire et regarder.</p></div>
   <div class="swapp-footer-col"><h2>Explorer</h2><a href="/">Accueil</a><a href="/actus">Actualités</a><a href="/jeux">Univers de jeux</a><a href="/decouvrir">Lives et créateurs</a><a href="/bandes-annonces">Bandes-annonces</a><a href="/boutique">Boutique</a><a href="/plan-du-site">Plan du site</a></div>
   <div class="swapp-footer-col"><h2>Social</h2><a href="/social">Social</a><a href="/contact">Contact</a><a href="/moderation">Modération</a><a href="https://github.com/XDSawyerLoL/Twitchappi/issues/new" target="_blank" rel="noopener noreferrer">Signaler un problème <span aria-hidden="true">↗</span></a><a href="https://github.com/XDSawyerLoL/Twitchappi" target="_blank" rel="noopener noreferrer">Projet SWAPP <span aria-hidden="true">↗</span></a></div>
   <div class="swapp-footer-col"><h2>Transparence</h2><a href="/mentions-legales">Mentions légales</a><a href="/cgu">CGU</a><a href="/confidentialite">Confidentialité</a><a href="/cookies">Cookies</a><p class="swapp-footer-pending">Informations juridiques en cours de finalisation.</p></div>
  </div>
  <div class="swapp-footer-bottom"><span>© ${new Date().getFullYear()} SWAPP. Tous droits réservés.</span><span>Découvrir · Regarder · Participer</span></div>
 </div>`;
 const nav=document.getElementById('mobileNav');
 (nav?.parentNode||document.body).insertBefore(footer,nav||null);
 // The revocation control appears only when Google's actual certified CMP API
 // has loaded and confirms that GDPR applies. No homegrown consent mechanism.
 const googlefc=window.googlefc=window.googlefc||{};
 googlefc.callbackQueue=googlefc.callbackQueue||[];
 googlefc.callbackQueue.push({CONSENT_API_READY:()=>{
  if(typeof window.googlefc?.showRevocationMessage!=='function')return;
  if(typeof window.__tcfapi!=='function')return;
  try{window.__tcfapi('addEventListener',2,(data,ok)=>{
   if(!ok||data?.gdprApplies!==true||!footer.isConnected)return;
   if(footer.querySelector('[data-swapp-cmp-revocation]'))return;
   const control=document.createElement('button');
   control.type='button';
   control.dataset.swappCmpRevocation='1';
   control.textContent='Gérer mes choix publicitaires';
   control.setAttribute('aria-label','Modifier mon consentement aux publicités');
   control.style.cssText='display:block;padding:8px 0;background:transparent;border:0;color:inherit;text-align:left;font:inherit;cursor:pointer';
   control.addEventListener('click',()=>window.googlefc?.showRevocationMessage?.());
   footer.querySelector('.swapp-footer-col:last-child')?.appendChild(control);
  })}catch(_){}
 }});

}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();