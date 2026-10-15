/* SWAPP Reader: light, private, keyboard-friendly reading controls for SPA + direct URLs. */
(()=>{'use strict';
 if(window.__swappReaderExperience)return;
 window.__swappReaderExperience=true;
 let current=null,detach=()=>{},storedSize=18,raf=0;
 try{const value=Number(sessionStorage.getItem('swapp-reader-font-v1'));if([16,17,18,19,20,21,22].includes(value))storedSize=value}catch(_){}
 const $=(root,selector)=>root?.querySelector(selector);
 const articleNow=()=>{
  const spa=document.querySelector('#actus .swapp-actus-native.swapp-actus-reading .swapp-actus-article');
  if(spa&&spa.isConnected&&spa.getClientRects().length)return spa;
  return document.querySelector('body.swapp-editorial-route main.article-wrap > .swapp-article-reading')?.closest('main')||null;
 };
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function mount(article){
  const reading=$(article,'.swapp-article-reading'),toc=$(reading,'.swapp-reader-toc');
  if(!reading||!toc)return;
  const body=$(reading,'#article-content');
  if(!body)return;
  let size=storedSize,progress=$(article,'.swapp-reading-progress');
  const ownProgress=!progress;
  if(!progress){
   progress=document.createElement('div');progress.className='swapp-reading-progress swapp-reader-progress-shared';
   progress.setAttribute('aria-hidden','true');progress.append(document.createElement('span'));
   article.prepend(progress);
  }
  const fill=$(progress,'span');
  const toolbar=document.createElement('div');toolbar.className='swapp-reader-type-tools';
  const label=document.createElement('span');label.textContent='Confort de lecture';
  const smaller=document.createElement('button'),larger=document.createElement('button');
  smaller.type=larger.type='button';
  smaller.textContent='A−';larger.textContent='A+';
  smaller.setAttribute('aria-label','Réduire la taille du texte');
  larger.setAttribute('aria-label','Agrandir la taille du texte');
  const scale=()=>{reading.style.setProperty('--swapp-reader-text-size',size+'px');
   smaller.disabled=size<=16;larger.disabled=size>=22;storedSize=size;
   try{sessionStorage.setItem('swapp-reader-font-v1',String(size))}catch(_){}
  };
  smaller.onclick=()=>{size=Math.max(16,size-1);scale()};
  larger.onclick=()=>{size=Math.min(22,size+1);scale()};
  toolbar.append(label,smaller,larger);toc.append(toolbar);scale();
  const discovery=$(reading,'.swapp-reader-next');
  if(discovery){
   const media=window.matchMedia('(min-width:1200px)');
   const adapt=()=>{discovery.open=media.matches};
   adapt();media.addEventListener?.('change',adapt);
   const previousDetach=detach;
   detach=()=>{previousDetach();media.removeEventListener?.('change',adapt)};
  }
  const links=[...toc.querySelectorAll('a[href^="#"]')];
  const targets=links.map(link=>({link,el:$(article,link.getAttribute('href'))})).filter(x=>x.el&&body.contains(x.el));
  const update=()=>{
   raf=0;
   if(!article.isConnected)return;
   const view=body.getBoundingClientRect();
   const distance=Math.max(1,body.offsetHeight-window.innerHeight*.65);
   const travelled=Math.min(distance,Math.max(0,-view.top+window.innerHeight*.25));
   if(fill&&ownProgress)fill.style.width=(100*travelled/distance).toFixed(1)+'%';
   let chosen=targets[0];
   for(const entry of targets){if(entry.el.getBoundingClientRect().top<=180)chosen=entry;}
   for(const entry of targets){
    if(chosen===entry)entry.link.setAttribute('aria-current','location');
    else entry.link.removeAttribute('aria-current');
   }
  };
  const schedule=()=>{if(!raf)raf=requestAnimationFrame(update)};
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  const previousDetach=detach;
  detach=()=>{previousDetach();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);if(raf)cancelAnimationFrame(raf);raf=0;};
  schedule();
 }
 function sync(){
  const found=articleNow();
  if(found===current)return;
  detach();detach=()=>{};current=found;
  if(found)mount(found);
 }
 function boot(){
  sync();
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();