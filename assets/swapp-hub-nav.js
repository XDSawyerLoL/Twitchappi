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
  const primaryLabels=['Accueil','Découvrir','Actualité','Communauté'];
  let details=mobile.querySelector('.swapp-mobile-more');
  if(!details){
   details=document.createElement('details');details.className='swapp-mobile-more';
   const summary=document.createElement('summary');summary.textContent='Plus';
   const links=document.createElement('div');links.className='swapp-mobile-more-links';
   details.append(summary,links);
  }
  const links=details.querySelector('.swapp-mobile-more-links');
  for(const child of [...mobile.children]){
   if(child===details||!child.matches('a,button'))continue;
   if(!primaryLabels.includes((child.textContent||'').trim()))links.append(child);
  }
  if(![...mobile.children].some(child=>child!==details&&(child.textContent||'').trim()==='Communauté')){
   mobile.insertBefore(anchor(additions[0]),details.isConnected?details:null);
  }
  for(const item of additions.slice(1)){
   if(!links.querySelector('a[href="'+item.href+'"]'))links.append(anchor(item));
  }
  if(!links.querySelector('a[href="/compte"]')&&![...links.children].some(el=>(el.textContent||'').trim()==='Compte')){
   links.append(anchor({href:'/compte',label:'Compte'}));
  }
  if(details.parentElement!==mobile||details!==mobile.lastElementChild)mobile.append(details);
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
