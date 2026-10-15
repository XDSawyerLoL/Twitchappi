/* Correct duplicate menu links when SPA and editorial navigation coexist.
 * The canonical link contract is SwappNavigation: no second set of menu entries.
 */
(()=>{'use strict';
 const extras=[['/communaute','Communauté'],['/bandes-annonces','Vidéos'],['/boutique','Boutique']];
 const mk=(href,label)=>{const a=document.createElement('a');a.href=href;a.textContent=label;return a};
 let busy=false;
 function reconcile(){
  if(busy)return;busy=true;
  try{
   const desktop=document.querySelector('#nav');
   if(desktop){
    const group=desktop.querySelector('.navGroup')||desktop;
    for(const [href,label] of extras){
     const matches=[...desktop.querySelectorAll('a[href="'+href+'"]')];
     if(!matches.length)group.append(mk(href,label));
     else for(const extra of matches.slice(1))extra.remove();
    }
   }
   const mobile=document.getElementById('mobileNav');
   if(!mobile)return;
   let more=mobile.querySelector(':scope > .swapp-mobile-more');
   if(!more){
    more=document.createElement('details');more.className='swapp-mobile-more';
    const summary=document.createElement('summary');summary.textContent='Plus';
    const list=document.createElement('div');list.className='swapp-mobile-more-links';
    more.append(summary,list);mobile.append(more);
   }
   const list=more.querySelector('.swapp-mobile-more-links');
   // Only the four principal links remain at the bottom of the screen.
   const primary=new Set(['/','/decouvrir','/actus','/communaute']);
   const primaryLabels=new Set(['Accueil','Découvrir','Actualité','Communauté']);
   for(const a of [...mobile.children]){
    if(a===more||!a.matches('a,button'))continue;
    const href=a.getAttribute('href');
    const label=(a.textContent||'').trim();
    if(!primary.has(href)&&!primaryLabels.has(label))list.append(a);
   }
   const community=[...mobile.children].filter(x=>x.matches('a[href="/communaute"]'));
   if(!community.length)mobile.insertBefore(mk('/communaute','Communauté'),more);
   else for(const a of community.slice(1))a.remove();
   for(const [href,label] of [...extras.slice(1),['/compte','Compte']]){
    const found=[...list.querySelectorAll('a[href="'+href+'"]')];
    if(!found.length)list.append(mk(href,label));
    else for(const dupe of found.slice(1))dupe.remove();
   }
   if(more.nextElementSibling)mobile.append(more);
  }finally{busy=false}
 }
 let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;reconcile()})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
 const nav=document.getElementById('nav'),mobile=document.getElementById('mobileNav');
 const observer=new MutationObserver(schedule);
 if(nav)observer.observe(nav,{childList:true,subtree:true});
 if(mobile)observer.observe(mobile,{childList:true,subtree:true});
})();
