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
  const active=routes[document.querySelector('main.app > .view.active')?.id]||location.pathname;
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
 // The router's asynchronous work must complete before the new screenshot
 // is captured. The old void setView(view) snapshot caused abrupt cuts.
 const knownViews=new Set(routes.values());
 const root=document.documentElement;
 let running=null,sequence=0;
 window.swappNavigateSpa=view=>{
  if(!knownViews.has(view)||typeof window.setView!=='function')return;
  if(document.querySelector('main.app > .view.active')?.id===view)return;
  const activate=()=>window.setView(view);
  if(typeof document.startViewTransition!=='function'||
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return activate();
  const ticket=++sequence;
  running?.skipTransition?.();
  root.dataset.swappMotion='cinematic';
  try{
   const transition=document.startViewTransition(activate);
   running=transition;
   Promise.resolve(transition.finished).then(
    ()=>{if(sequence===ticket){running=null;delete root.dataset.swappMotion}},
    ()=>{if(sequence===ticket){running=null;delete root.dataset.swappMotion}}
   );
   return transition;
  }catch(_error){
   if(sequence===ticket){running=null;delete root.dataset.swappMotion}
   return activate();
  }
 };
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const anchor=event.target.closest?.('header.top a[href],#mobileNav a[href]');
  if(!anchor||anchor.target||anchor.hasAttribute('download'))return;
  let url;
  try{url=new URL(anchor.href,location.href)}catch{return}
  if(url.origin!==location.origin||url.search||url.hash)return;
  const view=routes.get(url.pathname);
  if(!view||typeof window.setView!=='function')return;
  if(url.pathname===location.pathname){event.preventDefault();return}
  event.preventDefault();
  event.stopImmediatePropagation();
  window.swappNavigateSpa(view);
 },true);
})();
