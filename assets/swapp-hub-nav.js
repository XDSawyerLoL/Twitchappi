/* SWAPP: canonical navigation. Native destinations must be real anchors.
 * The live SPA's historical tabs can be <button>; only existing SPA views
 * remain buttons. Community, video, and shop are full server pages, so a
 * retained SPA button must NEVER shadow an <a href> to that route.
 */
(()=>{'use strict';
 const HUBS=[
  {href:'/communaute',label:'Communauté'},
  {href:'/bandes-annonces',label:'Vidéos'},
  {href:'/boutique',label:'Boutique'}
 ];
 const NAV=[
  ['/', 'Accueil'],['/decouvrir','Découvrir'],['/categories','Catégories'],
  ['/equipes','Équipes'],['/actus','Actualité'],
  ...HUBS.map(x=>[x.href,x.label])
 ];
 const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('fr');
 const byLabel=new Map(NAV.map(([href,label])=>[norm(label),href]));
 const byHref=new Set(NAV.map(([href])=>href));
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
 function desktop(){
  const nav=document.getElementById('nav');
  if(!nav)return;
  nav.classList.add('swapp-nav-consistent');
  const found=dedupe(nav);
  // A real page link is required even if the SPA did not create this tab.
  const list=nav.querySelector('.navGroup')||nav;
  for(const {href,label} of HUBS){
   if(!found.has(href))list.append(anchor(href,label));
  }
 }
 function mobile(){
  const nav=document.getElementById('mobileNav');
  if(!nav)return;
  const pinned=['/','/decouvrir','/actus','/communaute'];
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
  const top=new Set([...nav.children].filter(el=>el!==more&&el.matches('a,button')).map(dest));
  for(const href of pinned){
   if(top.has(href))continue;
   const label=NAV.find(x=>x[0]===href)[1];
   nav.insertBefore(anchor(href,label),more);
  }
  const existing=new Set([...nav.querySelectorAll('a,button')].map(dest));
  for(const [href,label] of [...NAV.filter(x=>!pinned.includes(x[0])),['/compte','Compte']]){
   if(existing.has(href))continue;
   inner.append(anchor(href,label));
  }
  if(more!==nav.lastElementChild)nav.append(more);
 }
 function reconcile(){
  if(reconciling)return;
  reconciling=true;
  try{desktop();mobile()}finally{reconciling=false}
 }
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
