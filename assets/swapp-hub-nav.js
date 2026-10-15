/* SWAPP: one visible navigation item per destination.
 * SPA can render buttons, editorial shell can render anchors. Never add desktop
 * links over the SPA navigation; only deduplicate by destination AND label.
 */
(()=>{'use strict';
 const NAV=[
  ['/', 'Accueil'],['/decouvrir','Découvrir'],['/categories','Catégories'],
  ['/equipes','Équipes'],['/actus','Actualité'],['/communaute','Communauté'],
  ['/bandes-annonces','Vidéos'],['/boutique','Boutique']
 ];
 const normalize=s=>String(s||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('fr');
 const byLabel=new Map(NAV.map(([href,label])=>[normalize(label),href]));
 const byHref=new Set(NAV.map(([href])=>href));
 function destination(el){
  const href=el.getAttribute('href');
  if(href){
   try{
    const url=new URL(href,location.origin);
    if(url.origin===location.origin&&byHref.has(url.pathname))return url.pathname;
   }catch(_){}
  }
  return byLabel.get(normalize(el.textContent))||null;
 }
 const create=(href,label)=>{
  const a=document.createElement('a');
  a.href=href;a.textContent=label;
  if(location.pathname===href){a.classList.add('active');a.setAttribute('aria-current','page')}
  return a;
 };
 let mutating=false,queued=false;
 function normalizeDesktop(){
  const nav=document.getElementById('nav');
  if(!nav)return;
  nav.classList.add('swapp-nav-consistent');
  const controls=[...nav.querySelectorAll('a,button')]
   .filter(el=>el.closest('#nav')===nav);
  const seen=new Map();
  for(const el of controls){
   const href=destination(el);
   if(!href)continue;
   if(seen.has(href)){
    el.remove();
   }else{
    seen.set(href,el);
   }
  }
  // Deliberately do not append desktop links: the primary SPA already renders
  // all destinations. Appending here caused the second, smaller trio.
 }
 function normalizeMobile(){
  const nav=document.getElementById('mobileNav');
  if(!nav)return;
  const expected=['/','/decouvrir','/actus','/communaute'];
  let more=nav.querySelector(':scope > .swapp-mobile-more');
  if(!more){
   more=document.createElement('details');more.className='swapp-mobile-more';
   const summary=document.createElement('summary');summary.textContent='Plus';
   const items=document.createElement('div');items.className='swapp-mobile-more-links';
   more.append(summary,items);nav.append(more);
  }
  const pane=more.querySelector('.swapp-mobile-more-links');
  if(!pane)return;
  for(const control of [...nav.children]){
   if(control===more||!control.matches('a,button'))continue;
   const href=destination(control);
   if(!href||!expected.includes(href))pane.append(control);
  }
  const seen=new Set();
  for(const control of [...nav.querySelectorAll('a,button')]){
   const href=destination(control);
   if(!href)continue;
   if(seen.has(href))control.remove();
   else seen.add(href);
  }
  const top=[...nav.children].filter(el=>el!==more&&el.matches('a,button'));
  const current=new Set(top.map(destination));
  // Add only destinations absent from the actual mobile SPA menu.
  for(const href of expected){
   if(current.has(href))continue;
   const label=NAV.find(item=>item[0]===href)[1];
   nav.insertBefore(create(href,label),more);
  }
  for(const [href,label] of [...NAV.filter(item=>!expected.includes(item[0])),['/compte','Compte']]){
   if([...nav.querySelectorAll('a,button')].some(el=>destination(el)===href||
      (href==='/compte'&&normalize(el.textContent)==='compte')))continue;
   pane.append(create(href,label));
  }
  if(more!==nav.lastElementChild)nav.append(more);
 }
 function reconcile(){
  if(mutating)return;
  mutating=true;
  try{normalizeDesktop();normalizeMobile()}finally{mutating=false}
 }
 function queue(){
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{queued=false;reconcile()});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});
 else queue();
 const observer=new MutationObserver(queue);
 for(const id of ['nav','mobileNav']){
  const el=document.getElementById(id);
  if(el)observer.observe(el,{childList:true,subtree:true});
 }
})();
