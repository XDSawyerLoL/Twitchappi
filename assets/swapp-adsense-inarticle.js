/* SWAPP AdSense / Actualité
 * A single In-article placement; intentionally does not load Google until a
 * Google-certified IAB TCF CMP has supplied a valid affirmative ad consent.
 * Configure the certified CMP separately in AdSense Privacy & Messaging.
 */
(()=>{'use strict';
 if(window.__SWAPP_ARTICLE_ADS__)return;
 window.__SWAPP_ARTICLE_ADS__=true;
 const CLIENT='ca-pub-6082969821681414';
 const SLOT='4776091558';
 const SCRIPT='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+CLIENT;
 let consent=false,registered=false,scriptPromise=null,observer=null,queued=false;
 const requestedBodies=new WeakSet(); // Never retry blank/unfilled ad inventory on the same article.
 const allowed=tc=>{
  if(!tc||tc.cmpStatus==='error')return false;
  if(tc.gdprApplies===false)return true;
  return tc.gdprApplies===true && typeof tc.tcString==='string' && tc.tcString.length>0
    && tc.purpose?.consents?.['1']===true && tc.vendor?.consents?.['755']===true;
 };
 const articleBody=()=>{
  const spa=document.querySelector('#actus.view.active .swapp-actus-native.swapp-actus-reading .swapp-actus-body');
  if(spa&&spa.isConnected)return spa;
  return document.querySelector('body.swapp-editorial-route main.article-wrap .swapp-article-reading > #article-content');
 };
 const placementPoint=body=>{
  if(!body||requestedBodies.has(body)||body.querySelector(':scope > .swapp-ad-placement'))return null;
  const paras=[...body.children].filter(x=>x.tagName==='P'&&(x.textContent||'').trim().length>=50);
  const total=(body.textContent||'').trim().length;
  // One ad at most. Short articles remain ad-free instead of interrupting reading.
  if(paras.length<3||total<650)return null;
  return paras[1];
 };
 function scriptOnce(){
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
   const existing=[...document.scripts].find(s=>(s.src||'').startsWith('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'));
   if(existing){resolve();return}
   const js=document.createElement('script');js.async=true;js.src=SCRIPT;
   js.crossOrigin='anonymous';
   js.addEventListener('load',resolve,{once:true});
   js.addEventListener('error',()=>{scriptPromise=null;reject(new Error('AdSense inaccessible'))},{once:true});
   document.head.append(js);
  });
  return scriptPromise;
 }
 function mount(){
  if(!consent)return;
  const body=articleBody(),point=placementPoint(body);
  if(!point)return;
  const section=document.createElement('aside');
  section.className='swapp-ad-placement';
  section.setAttribute('aria-label','Publicité');
  const title=document.createElement('span');
  title.className='swapp-ad-label';title.textContent='Publicité';
  const ad=document.createElement('ins');
  ad.className='adsbygoogle';ad.style.display='block';ad.style.textAlign='center';
  ad.setAttribute('data-ad-layout','in-article');
  ad.setAttribute('data-ad-format','fluid');
  ad.setAttribute('data-ad-client',CLIENT);
  ad.setAttribute('data-ad-slot',SLOT);
  ad.setAttribute('data-full-width-responsive','false');
  section.append(title,ad);
  point.after(section);
  requestedBodies.add(body);
  const statusObserver=new MutationObserver(()=>{
   if(ad.getAttribute('data-ad-status')==='unfilled'){section.remove();statusObserver.disconnect()}
   else if(ad.getAttribute('data-ad-status')==='filled')statusObserver.disconnect();
  });
  statusObserver.observe(ad,{attributes:true,attributeFilter:['data-ad-status']});
  scriptOnce().then(()=>{
   if(!section.isConnected||!consent){section.remove();statusObserver.disconnect();return}
   try{(window.adsbygoogle=window.adsbygoogle||[]).push({})}
   catch(_){section.remove();statusObserver.disconnect()}
  }).catch(()=>{section.remove();statusObserver.disconnect()});
 }
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}
 function onConsent(tc,success){
  if(!success)return;
  const ready=tc?.eventStatus==='tcloaded'||tc?.eventStatus==='useractioncomplete';
  if(!ready)return;
  const now=allowed(tc);
  if(consent&&!now){
   // Revocation stops future ad requests, and removes placements on this page.
   document.querySelectorAll('.swapp-ad-placement').forEach(el=>el.remove());
  }
  consent=now;
  if(consent)schedule();
 }
 function register(){
  if(registered||typeof window.__tcfapi!=='function')return false;
  registered=true;
  try{window.__tcfapi('addEventListener',2,onConsent)}
  catch(_){registered=false;return false}
  return true;
 }
 function boot(){
  register();
  // CMP scripts may arrive after our script. Stop polling after one minute;
  // subsequent article navigation also rechecks the CMP.
  let tries=0;
  const ticker=setInterval(()=>{if(register()||++tries>=60)clearInterval(ticker)},1000);
  observer=new MutationObserver(()=>{if(!registered)register();schedule()});
  observer.observe(document.body,{childList:true,subtree:true});
  schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();