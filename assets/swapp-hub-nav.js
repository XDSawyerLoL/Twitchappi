/* SWAPP: canonical navigation. Native destinations must be real anchors.
 * The live SPA's historical tabs can be <button>; only existing SPA views
 * remain buttons. Guides, community, video, and shop are full server pages, so a
 * retained SPA button must NEVER shadow an <a href> to that route.
 */
(()=>{'use strict';
 const HUBS=[
  {href:'/social',label:'Social'},
  {href:'/boutique',label:'Boutique'},
  {href:'/tv',label:'SWAPP TV'}
 ];
 const NAV=[
  ['/','Accueil'],['/categories','Découvrir'],['/actus','Actualité'],
  ...HUBS.map(x=>[x.href,x.label])
 ];
 // Account lives in the secondary menu but must still be recognized by
 // reconciliation; otherwise every MutationObserver pass adds another link.
 const ACCOUNT=['/compte','Compte'];
 const SECONDARY=['/decouvrir','Swapper'];
 const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('fr');
 const byLabel=new Map([...NAV,ACCOUNT,SECONDARY,['/decouvrir','DIRECT'],['/categories','Jeux & catégories'],['/categories','Catégories']].map(([href,label])=>[norm(label),href]));
 const byHref=new Set([...NAV,ACCOUNT,SECONDARY].map(([href])=>href));
 const isHub=href=>HUBS.some(x=>x.href===href);
 function dest(el){
  const href=el.getAttribute('href');
  if(href){
   try{
    const url=new URL(href,location.origin);
    if(url.origin===location.origin&&byHref.has(url.pathname))return url.pathname;
   }catch(_){}
  }
  return byLabel.get(norm(el.textContent))||null;
 }
 function anchor(href,label,original){
  const a=document.createElement('a');
  a.href=href;
  a.textContent=label;
  a.dataset.swappNativeRoute='1';
  if(original){
   a.className=original.className||'';
   if(original.classList.contains('active'))a.classList.add('active');
  }
  if((location.pathname||'/').replace(/\/$/,'')===href){
   a.classList.add('active');
   a.setAttribute('aria-current','page');
  }
  return a;
 }
 function upgrade(el,href){
  if(el.tagName==='A'){
   if(el.getAttribute('href')!==href)el.setAttribute('href',href);
   el.dataset.swappNativeRoute='1';
   return el;
  }
  if(!isHub(href))return el;
  const label=HUBS.find(x=>x.href===href).label;
  const link=anchor(href,label,el);
  el.replaceWith(link);
  return link;
 }
 let reconciling=false,queued=false;
 function dedupe(parent){
  const seen=new Map();
  for(const el of [...parent.querySelectorAll('a,button')]){
   if(el.closest('#nav')!==parent&&el.closest('#mobileNav')!==parent)continue;
   // Deprecated Équipes is intentionally out of public navigation.
   if(norm(el.textContent)==='équipes'||el.getAttribute('href')==='/equipes'){el.remove();continue;}
   const href=dest(el);
   if(!href)continue;
   if(seen.has(href)){
    // Prefer a native anchor over an SPA button for these three real routes.
    const earlier=seen.get(href);
    if(isHub(href)&&earlier.tagName!=='A'&&el.tagName==='A'){
     earlier.remove();
     seen.set(href,upgrade(el,href));
    }else{
     el.remove();
    }
   }else{
    seen.set(href,upgrade(el,href));
   }
  }
  return seen;
 }
 function canonicalMenu(nav,mobile){
  // Use identical SWAPP menu on SPA and server pages; never revive obsolete tabs.
  const api=typeof window!=='undefined'?window.SwappNavigation:null;
  if(!api||typeof api.desktopNavigation!=='function'||typeof api.mobileNavigation!=='function')return false;
  const route=String(location.pathname||'/').replace(/\/+$/,'')||'/';
  const active=route==='/bandes-annonces'?'trailers':route==='/tv'?'tv':route==='/tv/programme'||route==='/agenda'?'agenda':route==='/on-air'?'onair':route==='/actus'?'actus':route==='/decouvrir'?'discover':route==='/social'?'community':route==='/boutique'?'shop':route==='/categories'?'categories':route==='/equipes'?'teams':route.startsWith('/guides')?'guides':'home';
  const signature='simple-v2:'+(mobile?'mobile:':'desktop:')+active;
  const valid=!!(nav.querySelector('a[href="/categories"]')&&nav.querySelector('a[href="/decouvrir"]')&&
   nav.querySelector('a[href="/actus"]')&&nav.querySelector('.swapp-tv-nav-cta')&&
   !nav.querySelector('.swapp-news-more')&&!nav.querySelector('a[href="/equipes"]')&&
   (mobile?!!nav.querySelector('.swapp-mobile-more .swapp-mobile-tv-subnav a[href="/decouvrir"]'):
    !!nav.querySelector('.swapp-tv-submenu a[href="/decouvrir"]')));
  if(nav.dataset.swappNavSignature===signature&&valid)return true;
  nav.innerHTML=mobile?api.mobileNavigation(active):api.desktopNavigation(active);
  nav.dataset.swappNavSignature=signature;
  return true;
 }
 function desktop(){
  const nav=document.getElementById('nav');
  if(!nav)return;
  if(canonicalMenu(nav,false))return;
  nav.classList.add('swapp-nav-consistent');
  const found=dedupe(nav);
  // Do not revive the obsolete first-level SWAPER CTA from cached SPA markup.
  const list=nav.querySelector('.navGroup')||nav;
  // Catch legacy SPA buttons too, not just their converted anchors.
  for(const el of [...list.children]){
   if(el.matches('a,button')&&(norm(el.textContent)==='swaper'||dest(el)==='/decouvrir'))el.remove();
  }
  // When the shared navigation script was blocked, keep the TV submenu usable.
  if(!list.querySelector('.swapp-tv-navigation')){
   const direct=[...list.children].find(el=>el.tagName==='A'&&dest(el)==='/tv');
   if(direct){
    const group=document.createElement('div');group.className='swapp-tv-navigation';
    direct.replaceWith(group);group.append(direct);
    const details=document.createElement('details');details.className='swapp-tv-submenu';
    const summary=document.createElement('summary');summary.setAttribute('aria-label','Sous-menu SWAPP TV');
    summary.textContent='▾';
    const children=document.createElement('div');children.className='swapp-tv-submenu-links';
    children.append(anchor('/decouvrir','Swapper'));
    details.append(summary,children);group.append(details);
   }
  }
  for(const {href,label} of HUBS){
   if(!found.has(href))list.append(anchor(href,label));
  }
 }
 function mobile(){
  const nav=document.getElementById('mobileNav');
  if(!nav)return;
  if(canonicalMenu(nav,true))return;
  const pinned=['/','/categories','/actus','/tv'];
  let more=nav.querySelector(':scope > .swapp-mobile-more');
  if(!more){
   more=document.createElement('details');
   more.className='swapp-mobile-more';
   const summary=document.createElement('summary');
   summary.textContent='Plus';
   const inner=document.createElement('div');
   inner.className='swapp-mobile-more-links';
   more.append(summary,inner);
   nav.append(more);
  }
  const inner=more.querySelector('.swapp-mobile-more-links');
  if(!inner)return;
  // Correct legacy SPA mobile controls before deduplication.
  for(const el of [...nav.querySelectorAll('a,button')]){
   const href=dest(el);
   if(href&&isHub(href))upgrade(el,href);
  }
  for(const el of [...nav.children]){
   if(el===more||!el.matches('a,button'))continue;
   const href=dest(el);
   if(!href||!pinned.includes(href))inner.append(el);
  }
  dedupe(nav);
  for(const el of [...nav.children,...inner.children]){
   if(el.matches('a,button')&&(norm(el.textContent)==='swaper'||dest(el)==='/decouvrir'))el.remove();
  }
  const top=new Set([...nav.children].filter(el=>el!==more&&el.matches('a,button')).map(dest));
  for(const href of pinned){
   if(top.has(href))continue;
   const label=NAV.find(x=>x[0]===href)[1];
   nav.insertBefore(anchor(href,label),more);
  }
  const existing=new Set([...nav.querySelectorAll('a,button')].map(dest));
  for(const [href,label] of [...NAV.filter(x=>!pinned.includes(x[0])),ACCOUNT]){
   if(existing.has(href))continue;
   inner.append(anchor(href,label));
  }
  if(!inner.querySelector('.swapp-mobile-tv-subnav')){
   const group=document.createElement('div');group.className='swapp-mobile-tv-subnav';
   group.setAttribute('role','group');group.setAttribute('aria-label','Sous-menu SWAPP TV');
   const label=document.createElement('span');label.className='swapp-mobile-tv-title';label.textContent='SWAPP TV';
   group.append(label,anchor('/decouvrir','Swapper'));inner.append(group);
  }
  if(more!==nav.lastElementChild)nav.append(more);
 }
 function reconcile(){
  if(reconciling)return;
  reconciling=true;
  try{desktop();mobile()}finally{reconciling=false}
 }
 // Guides is server-rendered, not an SPA view. The capture handler wins over
 // legacy delegated SPA click handling, including a cached SPA menu button.
 document.addEventListener('click',event=>{
  const target=event.target?.closest?.('#nav a,#nav button,#mobileNav a,#mobileNav button');
  if(!target||dest(target)!=='/guides/aion-2')return;
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  location.assign('/guides/aion-2');
 },true);
 // Accueil now belongs to the server-rendered immersive catalogue.
 // Prevent a stale SPA setView('home') handler from showing the old home when
 // navigating back from /actus or another legacy SPA view.
 document.addEventListener('click',event=>{
  const target=event.target?.closest?.('header.top .brand,#nav a,#nav button,#mobileNav a,#mobileNav button');
  if(!target||dest(target)!=='/')return;
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  if(location.pathname==='/'&&location.search==='')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(document.getElementById('swapp-catalogue-lab')&&typeof window.setView==='function'){
   if(typeof window.swappNavigateSpa==='function')window.swappNavigateSpa('home');
   else window.setView('home');
   return;
  }
  location.assign('/');
 },true);
 // Multiple SPA updates can mutate the menu in one frame. Reconcile once
 // per frame, not once per DOM mutation/microtask, to avoid main-thread churn.
 const nextFrame=typeof requestAnimationFrame==='function'
   ?requestAnimationFrame:callback=>queueMicrotask(callback);
 function queue(){
  if(queued)return;
  queued=true;
  nextFrame(()=>{queued=false;reconcile()});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});
 else queue();
 const obs=new MutationObserver(queue);
 for(const id of ['nav','mobileNav']){
  const el=document.getElementById(id);
  if(el)obs.observe(el,{childList:true,subtree:true});
 }
})();
