/* Real shared SWAPP application: preserve the same account, gamepad, theme
 * controls and history while moving between Accueil and the SPA rubrics.
 */
(()=>{
 'use strict';
 const home=document.getElementById('home');
 const catalogue=document.getElementById('swapp-catalogue-lab');
 if(!home||!catalogue)return;
 // The legacy SPA Home function used to replace the catalogue with an
 // entirely different homepage. Keep this real mounted view instead.
 const stableHome=async function renderImmersiveCatalogue(){return catalogue};
 window.renderHome=stableHome;
 try{renderHome=stableHome}catch(_error){}
 // The historic SPA overwrote all navigation anchors on every setView(),
 // causing a flash of obsolete buttons. Keep the canonical header DOM.
 const permanentNav=()=>{
  const routes={home:'/',categories:'/categories',actus:'/actus',settings:'/compte',
   discover:'/decouvrir',twitch:'/twitch',dashboard:'/dashboard',manager:'/gestionnaire'};
  const active=routes[window.state?.view]||location.pathname;
  for(const anchor of document.querySelectorAll('#nav a[href],#mobileNav a[href]')){
   let dest;
   try{dest=new URL(anchor.href,location.href).pathname}catch{continue}
   const selected=dest===active;
   anchor.classList.toggle('active',selected);
   if(selected)anchor.setAttribute('aria-current','page');
   else anchor.removeAttribute('aria-current');
  }
 };
 if(document.querySelector('#nav .navGroup a[href="/categories"]')){
  window.renderNav=permanentNav;
  try{renderNav=permanentNav}catch(_error){}
 }
 // Only first-party SPA routes use same-document transitions. Native
 // TV/SOCIAL/Boutique remain ordinary anchors and keep their SEO/behavior.
 const routes=new Map([
  ['/','home'],['/categories','categories'],['/actus','actus'],
  ['/compte','settings'],['/decouvrir','discover'],['/twitch','twitch'],
  ['/dashboard','dashboard'],['/gestionnaire','manager']
 ]);
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const anchor=event.target.closest?.('header.top a[href],#mobileNav a[href]');
  if(!anchor||anchor.target||anchor.hasAttribute('download'))return;
  let url;
  try{url=new URL(anchor.href,location.href)}catch{return}
  if(url.origin!==location.origin||url.search||url.hash)return;
  const view=routes.get(url.pathname);
  if(!view||typeof window.setView!=='function')return;
  if(view==='home'&&location.pathname==='/')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const activate=()=>{void window.setView(view)};
  if(typeof document.startViewTransition==='function'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   document.startViewTransition(activate);
  }else activate();
 },true);
})();
