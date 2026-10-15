/* Ensure the SPA and server pages expose the same SWAPP destinations.
 * Keep the original SPA click handlers and existing links intact.
 */
(()=>{'use strict';
 const additions=[
  {href:'/communaute',label:'Communauté'},
  {href:'/bandes-annonces',label:'Vidéos'},
  {href:'/boutique',label:'Boutique'}
 ];
 function anchor({href,label}){
  const a=document.createElement('a');a.href=href;a.textContent=label;
  if(location.pathname===href){a.className='active';a.setAttribute('aria-current','page')}
  return a;
 }
 function ensure(){
  const desktop=document.getElementById('nav');
  if(desktop){
   const group=desktop.querySelector('.navGroup')||desktop;
   for(const item of additions)if(!desktop.querySelector('a[href="'+item.href+'"]'))group.append(anchor(item));
  }
  const mobile=document.getElementById('mobileNav');
  if(!mobile)return;
  const existingMore=mobile.querySelector('.swapp-mobile-more');
  if(existingMore)return; // SSR already carries all destinations.
  const primaryLabels=['Accueil','Découvrir','Actualité','Communauté'];
  const rest=[];
  for(const child of [...mobile.children]){
   if(!child.matches('a,button'))continue;
   const label=(child.textContent||'').trim();
   if(!primaryLabels.includes(label))rest.push(child);
  }
  const hasCommunity=[...mobile.children].some(child=>(child.textContent||'').trim()==='Communauté');
  if(!hasCommunity)mobile.append(anchor(additions[0]));
  const details=document.createElement('details');details.className='swapp-mobile-more';
  const summary=document.createElement('summary');summary.textContent='Plus';
  const list=document.createElement('div');list.className='swapp-mobile-more-links';
  for(const child of rest)list.append(child);
  for(const item of additions.slice(1))list.append(anchor(item));
  if(!list.querySelector('a[href="/compte"]')&&![...list.children].some(el=>(el.textContent||'').trim()==='Compte')){
   list.append(anchor({href:'/compte',label:'Compte'}));
  }
  if(['/categories','/equipes','/bandes-annonces','/boutique','/compte'].includes(location.pathname))details.open=true;
  details.append(summary,list);mobile.append(details);
 }
 let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;ensure()})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
 document.addEventListener('click',event=>{
  const more=event.target.closest?.('#mobileNav .swapp-mobile-more');
  if(!more)return;
  if(event.target.closest('a'))more.open=false;
 },true);
 const observer=new MutationObserver(schedule);
 for(const nav of ['nav','mobileNav']){
  const el=document.getElementById(nav);
  if(el)observer.observe(el,{childList:true,subtree:true});
 }
})();
