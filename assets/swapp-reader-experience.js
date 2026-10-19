/* SWAPP Reader: light, private, keyboard-friendly reading controls for SPA + direct URLs. */
(()=>{'use strict';
 if(window.__swappReaderExperience)return;
 window.__swappReaderExperience=true;
 let current=null,currentToc=null,detach=()=>{},storedSize=18,raf=0;
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
  if(!reading||!toc)return false;
  const body=$(reading,'#article-content');
  if(!body)return false;
  let size=storedSize;
  const percent=document.createElement('span');
  percent.className='swapp-reader-percent';
  percent.setAttribute('aria-label','Progression de la lecture');
  percent.textContent='0 % lu';
  toc.insertBefore(percent,toc.firstChild);
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
   percent.textContent=Math.round(100*travelled/distance)+' % lu';
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
  window.addEventListener('load',schedule,{once:true});
  let sizes=null;
  if(typeof ResizeObserver==='function'){
   sizes=new ResizeObserver(schedule);
   sizes.observe(body);sizes.observe(reading);
  }
  const previousDetach=detach;
  detach=()=>{previousDetach();
   window.removeEventListener('scroll',schedule);
   window.removeEventListener('resize',schedule);
   window.removeEventListener('load',schedule);
   sizes?.disconnect();
   if(raf)cancelAnimationFrame(raf);raf=0;
  };
  schedule();
  document.fonts?.ready?.then(schedule,()=>{});
  return true;
 }
 function sync(){
  const found=articleNow();
  const toc=$(found,'.swapp-article-reading .swapp-reader-toc');
  // SPA shell can exist before the full TOC/body. Retry rather than remember
  // a half-built article. Re-mount if routing replaces the TOC inside same root.
  if(found===current&&toc===currentToc)return;
  detach();detach=()=>{};current=null;currentToc=null;
  if(found&&toc&&mount(found)){current=found;currentToc=toc;}
 }
 function boot(){
  sync();
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{
   childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']
  });
  window.addEventListener('pageshow',sync,{passive:true});
  window.addEventListener('popstate',sync,{passive:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();


/* Native reader recovery: older Hostinger Node processes may keep an earlier
 * article shell in memory even after the updated files are deployed. The
 * existing progress reader can restore the new toolbar without F5 twice.
 * No tracking, network calls to third parties or synthetic audio autoplay. */
(()=>{'use strict';
 if(window.__swappReaderBootRecovery)return;
 window.__swappReaderBootRecovery=true;
 let scheduled=0;
 const base='/assets/';
 const hasArticle=()=>document.querySelector(
  'body.swapp-editorial-route main.article-wrap .swapp-article-reading #article-content,'+
  'main.article-wrap[data-swapp-article-slug] .swapp-article-reading #article-content,'+
  '#actus.view.active .swapp-actus-reading .swapp-article-reading #article-content');
 const ready=()=>!!document.querySelector('.swapp-article-reading > .swapp-reader-studio');
 function ensureCss(){
  if(document.querySelector('link[href*="swapp-reader-studio.css"]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=base+'swapp-reader-studio.css?v=20261020-voice-v1';
  document.head.appendChild(link);
 }
 function ensureScript(name,complete){
  const present=name==='swapp-neural-narration.js'
   ?!!window.SwappNeuralNarration:!!window.SwappReaderStudio;
  if(present){complete();return;}
  const id='swapp-recovery-'+name;
  if(document.getElementById(id))return;
  const script=document.createElement('script');
  script.id=id;
  script.src=base+name+'?v=20261020-voice-v1';
  script.onload=complete;
  script.onerror=()=>{script.remove();console.warn('[SWAPP LECTURE] Module inaccessible:',name);};
  document.head.appendChild(script);
 }
 function recover(){
  if(!hasArticle()||ready())return;
  ensureCss();
  const start=()=>ensureScript('swapp-reader-studio.js',()=>{
   window.SwappReaderStudio?.sync();
  });
  ensureScript('swapp-neural-narration.js',start);
 }
 function schedule(){
  if(scheduled)clearTimeout(scheduled);
  scheduled=setTimeout(()=>{scheduled=0;recover()},650);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
 else schedule();
 window.addEventListener('pageshow',schedule,{passive:true});
 window.addEventListener('popstate',schedule,{passive:true});
})();
