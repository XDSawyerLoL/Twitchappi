/* Shared SWAPP header: compact search and verified new-article indicator.
 * No paid APIs, no fake counters, no notification permissions, no background work.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document)api.install(root);
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const SEEN='swapp:news:last-seen:v1';
 const CACHE='swapp:news:recent-scan:v1';
 const REFRESH_MS=15*60*1000;
 const CACHE_MS=4*60*1000;

 function latestSnapshot(articles){
  let timestamp=-1,slugs=[];
  for(const article of Array.isArray(articles)?articles:[]){
   if(!article||typeof article.slug!=='string'||!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(article.slug))continue;
   const time=Date.parse(article.publishedAt||article.originalPublishedAt||'');
   if(!Number.isFinite(time))continue;
   if(time>timestamp){timestamp=time;slugs=[article.slug]}
   else if(time===timestamp&&!slugs.includes(article.slug)&&slugs.length<30)slugs.push(article.slug);
  }
  return timestamp>=0?{timestamp,slugs}:null;
 }
 function isNewer(latest,seen){
  return !!(latest&&seen&&Number.isFinite(seen.timestamp)&&
   (latest.timestamp>seen.timestamp||(latest.timestamp===seen.timestamp&&
    latest.slugs.some(slug=>!Array.isArray(seen.slugs)||!seen.slugs.includes(slug)))));
 }
 function install(win){
  const doc=win.document;
  const header=doc.querySelector('header.top .topbar');
  if(!header||header.querySelector('.swapp-nav-utilities'))return;
  const utilities=doc.createElement('div');
  utilities.className='swapp-nav-utilities';
  const search=doc.createElement('div');
  search.className='swapp-nav-search';
  const toggle=doc.createElement('button');
  toggle.type='button';toggle.className='swapp-nav-search-toggle';
  toggle.setAttribute('aria-label','Ouvrir la recherche');
  toggle.setAttribute('aria-expanded','false');
  toggle.setAttribute('aria-controls','swapp-global-search-panel');
  toggle.title='Rechercher un jeu ou un créateur';
  toggle.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 5 5"></path></svg>';
  const panel=doc.createElement('form');
  panel.id='swapp-global-search-panel';panel.className='swapp-nav-search-panel';
  panel.action='/';panel.method='get';panel.setAttribute('role','search');panel.hidden=true;
  const label=doc.createElement('label');label.htmlFor='swapp-global-search';
  label.className='swapp-nav-visually-hidden';label.textContent='Rechercher un jeu ou un créateur';
  const input=doc.createElement('input');
  input.id='swapp-global-search';input.name='q';input.type='search';input.maxLength=120;
  input.autocomplete='off';input.placeholder='Rechercher un jeu ou un créateur';
  const submit=doc.createElement('button');
  submit.type='submit';submit.className='swapp-nav-search-submit';submit.textContent='OK';
  submit.setAttribute('aria-label','Lancer la recherche');
  panel.append(label,input,submit);search.append(toggle,panel);utilities.append(search);
  const account=header.querySelector('.userArea');
  if(account)header.insertBefore(utilities,account);
  else header.append(utilities);
  doc.documentElement.classList.add('swapp-nav-tools-ready');

  const onHome=()=>{
   const active=doc.querySelector('main.app > #home.view.active');
   return !!active||(!doc.querySelector('main.app')&&
    (win.location.pathname==='/'||win.location.pathname==='/catalogue-test'));
  };
  function syncCatalogue(query){
   const native=doc.getElementById('scl-search');
   if(!native||!onHome())return false;
   if(native.value!==query){
    native.value=query;
    native.dispatchEvent(new win.Event('input',{bubbles:true}));
   }
   return true;
  }
  function setOpen(open){
   panel.hidden=!open;search.classList.toggle('is-open',open);
   toggle.setAttribute('aria-expanded',String(open));
   toggle.setAttribute('aria-label',open?'Fermer la recherche':'Ouvrir la recherche');
   if(open)input.focus();else toggle.focus();
  }
  toggle.addEventListener('click',()=>setOpen(panel.hidden));
  input.addEventListener('input',()=>syncCatalogue(input.value.trim().slice(0,120)));
  panel.addEventListener('submit',event=>{
   event.preventDefault();
   const query=input.value.trim().slice(0,120);
   if(!query)return;
   if(syncCatalogue(query)){setOpen(false);return}
   win.location.assign('/?q='+encodeURIComponent(query));
  });
  doc.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!panel.hidden){event.preventDefault();setOpen(false)}
  });
  doc.addEventListener('pointerdown',event=>{
   if(!panel.hidden&&!search.contains(event.target)){
    panel.hidden=true;search.classList.remove('is-open');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Ouvrir la recherche');
   }
  });
  // The homepage catalogue may mount after the navigation script.
  // Its own engine reads ?q= during initialization.
  if(onHome()){
   const initial=new URLSearchParams(win.location.search).get('q');
   if(initial)input.value=initial.slice(0,120);
  }

  let latest=null,unread=false,lastCheck=0,requestActive=false;
  function read(key,storage){
   try{return JSON.parse(storage.getItem(key)||'null')}catch{return null}
  }
  function write(key,value,storage){
   try{storage.setItem(key,JSON.stringify(value))}catch{}
  }
  function isNewsView(){
   return win.location.pathname==='/actus'||
    doc.querySelector('main.app > #actus.view.active')!==null;
  }
  function paint(){
   for(const link of doc.querySelectorAll('header.top #nav a[href="/actus"], #mobileNav a[href="/actus"]')){
    link.classList.toggle('swapp-nav-news-unread',unread);
    if(unread)link.setAttribute('aria-label','Actualité — nouvelle publication');
    else if(link.getAttribute('aria-label')==='Actualité — nouvelle publication')link.removeAttribute('aria-label');
   }
  }
  function acknowledge(){
   if(latest)write(SEEN,latest,win.localStorage);
   unread=false;paint();
  }
  function receive(articles){
   const snapshot=latestSnapshot(articles);
   if(!snapshot)return; // outage/empty/unverified catalogue: never fabricate news
   latest=snapshot;
   let seen=read(SEEN,win.localStorage);
   if(!seen||isNewsView()){acknowledge();seen=snapshot}
   unread=isNewer(snapshot,seen);
   paint();
   const checked=Date.now();
   write(CACHE,{snapshot,checked},win.sessionStorage);
   lastCheck=checked;
  }
  const cached=read(CACHE,win.sessionStorage);
  if(cached&&cached.snapshot&&Date.now()-cached.checked<CACHE_MS){
   latest=cached.snapshot;
   const saved=read(SEEN,win.localStorage);
   if(!saved||isNewsView())acknowledge();
   else unread=isNewer(latest,saved);
   lastCheck=cached.checked;paint();
  }
  // A real verified catalogue fetch already performed by the homepage can
  // feed this indicator and prevent a second catalogue request.
  win.addEventListener('swapp:news-loaded',event=>{
   if(Array.isArray(event.detail?.articles))receive(event.detail.articles);
  });
  async function check(){
   if(requestActive||doc.visibilityState==='hidden'||Date.now()-lastCheck<REFRESH_MS)return;
   requestActive=true;lastCheck=Date.now();
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
   try{
    const response=await win.fetch('/api/actus',{credentials:'same-origin',
     headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const data=await response.json();
    if(Array.isArray(data.articles))receive(data.articles);
   }catch(_error){}finally{clearTimeout(timer);requestActive=false}
  }
  doc.addEventListener('click',event=>{
   if(event.target.closest?.('a[href="/actus"],a[href^="/actus?"]'))acknowledge();
  },true);
  doc.addEventListener('visibilitychange',()=>{
   if(doc.visibilityState==='visible'){
    paint();
    if(Date.now()-lastCheck>=REFRESH_MS)check();
   }
  });
  const observer=new MutationObserver(()=>paint());
  for(const id of ['nav','mobileNav']){
   const el=doc.getElementById(id);
   if(el)observer.observe(el,{childList:true,subtree:true});
  }
  win.setInterval(()=>{if(Date.now()-lastCheck>=REFRESH_MS)check()},60000);
  // Give homepage news loading a chance to reuse its successful response.
  win.setTimeout(check,onHome()?5500:100);
  paint();
 }
 return Object.freeze({latestSnapshot,isNewer,install});
});
