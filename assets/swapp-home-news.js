/* SWAPP home: immersive gaming stories and verified matching live streams. */
(() => {
 'use strict';
 const slugOk=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
 const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const match=(a,b)=>{a=normal(a);b=normal(b);return !!(a&&b&&(a===b||(a.length>=7&&b.includes(a))||(b.length>=7&&a.includes(b))))};
 const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
 const el=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!=null)n.textContent=String(content);return n};
 const fetchItems=async(path,timeout)=>{const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(timeout)});if(!r.ok)throw Error('HTTP '+r.status);return r.json()};
 let newsPromise=null,livesPromise=null,queued=false;
 const news=()=>newsPromise||(newsPromise=fetchItems('/api/actus',10000).then(x=>Array.isArray(x.articles)?x.articles:[]).catch(()=>{newsPromise=null;return []}));
 const lives=()=>livesPromise||(livesPromise=fetchItems('/api/discovery/home-lives?limit=40&lang=fr',12000).then(x=>x.success&&Array.isArray(x.items)?x.items:[]).catch(()=>{livesPromise=null;return []}));
 function navigateArticle(event,slug){
   if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   if(typeof window.setView!=='function'||!window.SwappActus)return;
   event.preventDefault();window.setView('actus');window.SwappActus.open(slug);
 }
 function story(item,index){
   const a=el('a','swapp-home-story'+(index===0?' swapp-home-story-featured':''));a.href='/actus/'+encodeURIComponent(item.slug);
   a.addEventListener('click',e=>navigateArticle(e,item.slug));
   const image=el('div','swapp-home-story-image'),src=safeUrl(item.image?.url||item.imageUrl);
   if(src){const img=el('img');img.src=src;img.alt='';img.loading=index===0?'eager':'lazy';img.decoding='async';img.onerror=()=>{img.remove();image.classList.add('swapp-home-image-fallback')};image.append(img)}else{image.classList.add('swapp-home-image-fallback')}
   image.append(el('span','swapp-home-story-category',item.game||item.category||'ACTUS'));
   const body=el('div','swapp-home-story-body');
   body.append(el('span','swapp-home-story-eyebrow',index===0?'À LA UNE':'ACTUALITÉ'),el('strong','',item.title||'Article SWAPP'));
   if(item.summary)body.append(el('p','',item.summary));
   body.append(el('small','swapp-home-story-cta','Lire l’article →'));
   a.append(image,body);return a;
 }
 function liveCard(item){
   const login=String(item.login||'').toLowerCase(),platform=String(item.platform||'').toLowerCase();
   if(!/^[a-z0-9_]{2,25}$/.test(login))return null;
   const a=el('a','swapp-home-match-live');a.href=['oryon','swapp'].includes(platform)?'/'+encodeURIComponent(login):'/live/twitch/'+encodeURIComponent(login)+'?game='+encodeURIComponent(String(item.game_name||'').slice(0,90));
   const src=safeUrl(item.thumbnail_url);
   if(src){const img=el('img');img.src=src;img.alt='';img.loading='lazy';img.decoding='async';img.onerror=()=>{img.remove();a.classList.add('swapp-home-match-image-missing')};a.append(img)}
   const body=el('span','swapp-home-match-details');body.append(el('b','',item.display_name||login),el('small','',item.game_name||''));a.append(body,el('span','swapp-home-live-pill','EN DIRECT'));return a;
 }
 function mount(){
   const home=document.getElementById('home');if(!home||home.querySelector('[data-swapp-home-editorial]'))return;
   const base=home.querySelector('.homeOnlyMain');if(!base||!base.children.length||home.querySelector('.swappBoot'))return;
   const section=el('section','swapp-home-editorial');section.dataset.swappHomeEditorial='1';
   const top=el('div','swapp-home-editorial-top'),title=el('div');
   title.append(el('small','','SWAPP · LE GAMING EN DIRECT'),el('h2','','À la une sur SWAPP'),el('p','','L’actualité des jeux et les créateurs qui y jouent, au même endroit.'));
   const all=el('a','swapp-media-button primary','Voir toutes les actus →');all.href='/actus';
   all.onclick=e=>{if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||typeof window.setView!=='function')return;e.preventDefault();window.setView('actus');window.SwappActus?.home()};
   top.append(title,all);section.append(top);
   const grid=el('div','swapp-home-story-grid'),related=el('div','swapp-home-match-zone');
   grid.append(el('p','swapp-home-empty','Chargement des articles…'));section.append(grid,related);
   base.insertBefore(section,base.firstChild);
   news().then(async articles=>{
     if(!section.isConnected)return;
     const valid=articles.filter(x=>slugOk(x.slug)&&String(x.title||'').trim()).slice(0,5);
     grid.replaceChildren();
     if(!valid.length){grid.append(el('p','swapp-home-empty','Aucun article complet disponible actuellement. Les lives restent accessibles depuis Découvrir.'));return}
     valid.forEach((item,i)=>grid.append(story(item,i)));
     const liveItems=await lives();if(!section.isConnected)return;
     const seen=new Set(),pairs=[];
     for(const article of valid){if(!article.game)continue;const stream=liveItems.filter(l=>match(article.game,l.game_name||l.game||l.category)&&/^[a-z0-9_]{2,25}$/.test(String(l.login||'').toLowerCase())&&!seen.has(String(l.platform)+':'+String(l.login))).sort((a,b)=>Number(['swapp','oryon'].includes(String(b.platform||'').toLowerCase()))-Number(['swapp','oryon'].includes(String(a.platform||'').toLowerCase()))||Number(b.viewer_count||0)-Number(a.viewer_count||0))[0];if(stream){seen.add(String(stream.platform)+':'+String(stream.login));pairs.push({article,stream})}if(pairs.length>=3)break}
     related.replaceChildren();
     if(!pairs.length)return;
     const heading=el('div','swapp-home-match-heading');heading.append(el('span','','ACTUS × LIVE'),el('h3','','L’actualité prend vie'));
     related.append(heading);
     const row=el('div','swapp-home-match-grid');
     for(const pair of pairs){const cell=el('div','swapp-home-match-item');cell.append(el('small','',pair.article.game+' · À retrouver en live'));const card=liveCard(pair.stream);if(card)cell.append(card);row.append(cell)}
     related.append(row);
   });
 }
 function queue(){if(queued)return;queued=true;setTimeout(()=>{queued=false;mount()},160)}
 const home=document.getElementById('home');if(home){new MutationObserver(queue).observe(home,{childList:true,subtree:false});queue()}
 window.addEventListener('pageshow',queue);
})();