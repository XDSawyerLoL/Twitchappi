/* SWAPP home: immersive gaming stories and verified matching live streams. */
(() => {
 'use strict';
 const slugOk=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
 const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
 const el=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!=null)n.textContent=String(content);return n};
 // AbortController fallback also works on Safari builds without AbortSignal.timeout.
 const fetchItems=async(path,timeout)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal});
   if(!r.ok)throw Error('HTTP '+r.status);
   return await r.json();
  }finally{clearTimeout(timer)}
 };
 let newsPromise=null,queued=false,newsFetchedAt=0;
 const news=()=>{
   if(newsPromise&&Date.now()-newsFetchedAt<90000)return newsPromise;
   newsFetchedAt=Date.now();
   newsPromise=fetchItems('/api/actus',14000).then(x=>Array.isArray(x.articles)?x.articles:[])
     .catch(()=>{newsPromise=null;return []});
   return newsPromise;
 };
 let latestArticles=[];
 // Shared article cache for the existing live grid; do not request ACTUS twice.
 window.SwappHomeEditorial=Object.freeze({
  getArticles:news,
  getCachedArticles:()=>latestArticles.slice()
 });
 
 function navigateArticle(event,slug,game){
   if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   // Only intentional article openings, never impressions or scrolls.
   window.SwappLocalTastes?.record?.(game);
   if(typeof window.setView!=='function'||!window.SwappActus)return;
   event.preventDefault();window.setView('actus');window.SwappActus.open(slug);
 }
 function story(item,index){
   const a=el('a','swapp-home-story'+(index===0?' swapp-home-story-featured':''));a.href='/actus/'+encodeURIComponent(item.slug);
   a.addEventListener('click',e=>navigateArticle(e,item.slug,item.game));
   const image=el('div','swapp-home-story-image'),src=safeUrl(item.image?.url||item.imageUrl);
   if(src){const img=el('img');img.src=src;img.alt='';img.loading=index===0?'eager':'lazy';img.decoding='async';img.onerror=()=>{img.remove();image.classList.add('swapp-home-image-fallback')};image.append(img)}else{image.classList.add('swapp-home-image-fallback')}
   image.append(el('span','swapp-home-story-category',item.game||item.category||'Actualité'));
   const body=el('div','swapp-home-story-body');
   body.append(el('span','swapp-home-story-eyebrow',index===0?'À LA UNE':'ACTUALITÉ'),el('strong','',item.title||'Article SWAPP'));
   if(item.summary)body.append(el('p','',item.summary));
   body.append(el('small','swapp-home-story-cta','Lire l’article →'));
   a.append(image,body);return a;
 }
 // One verified video inside the existing editorial grid, not a new homepage section.
 function videoTeaser(){
   const wrap=el('article','swapp-home-video-feature swapp-video-item');
   const trigger=el('button','swapp-video-open');trigger.type='button';
   trigger.dataset.swappVideoPlay='1';
   trigger.dataset.videoSource='https://justplayer.fr/supporters/video_embeds/trailer-code-vein-2-story-trailer';
   trigger.dataset.videoYoutube='Z9SaRLSibak'; // verified official Bandai Namco trailer
   trigger.dataset.videoTitle='CODE VEIN II — Story Trailer';
   trigger.setAttribute('aria-label','Regarder la bande-annonce CODE VEIN II');
   const image=el('img');image.src='https://storage.googleapis.com/popshopprod-membership-assets-single-b5px4371/c0guw748anp9vi4crwdjcg19kils';
   image.alt='';image.loading='lazy';image.decoding='async';
   const overlay=el('span','swapp-video-shade');
   overlay.append(el('span','swapp-video-play-icon','▶'),el('span','swapp-video-action','Lancer la bande-annonce'));
   trigger.append(image,overlay);
   const caption=el('div','swapp-video-caption');
   caption.append(el('small','','SWAPP · VIDÉOS'),el('h3','','CODE VEIN II — Story Trailer'));
   const all=el('a','','Toutes les bandes-annonces →');all.href='/bandes-annonces';caption.append(all);
   wrap.append(trigger,caption);return wrap;
 }
 const discussionHref=item=>'/communaute?share=news&title='+encodeURIComponent(item.game?item.game+' — '+item.title:item.title)+'&url='+encodeURIComponent('https://swapp.tv/actus/'+item.slug);
 const gameKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 async function showVerifiedCreators(item,row){
  if(!item.game)return;
  const game=String(item.game).trim().slice(0,90);
  if(!game)return;
  try{
   const data=await fetchItems('/api/discovery/game-lives?limit=5&game='+encodeURIComponent(game),10000);
   if(!row.isConnected||data?.success!==true||gameKey(data.game)!==gameKey(game)||!Array.isArray(data.items))return;
   const seen=new Set(),verified=data.items.filter(stream=>{
    const login=String(stream?.login||'').toLowerCase(),platform=String(stream?.platform||'').toLowerCase(),key=platform+':'+login;
    if(!/^[a-z0-9_]{2,25}$/.test(login)||seen.has(key)||gameKey(stream.game_name||stream.game)!==gameKey(game))return false;
    seen.add(key);return true;
   }).slice(0,4);
   if(!verified.length)return;
   const avatars=el('div','swapp-home-feature-creators');
   avatars.append(el('span','swapp-home-feature-live-label','En direct sur '+game));
   const faces=el('span','swapp-home-feature-faces');
   for(const stream of verified){
    const login=String(stream.login).toLowerCase(),native=['swapp','oryon'].includes(String(stream.platform||'').toLowerCase());
    const a=el('a','swapp-home-feature-face');a.href=native?'/'+encodeURIComponent(login):'/live/twitch/'+encodeURIComponent(login)+'?game='+encodeURIComponent(game);
    a.title='Regarder '+(stream.display_name||login)+' en direct';a.setAttribute('aria-label',a.title);
    const src=safeUrl(stream.profile_image_url||stream.avatar_url||stream.avatar||'');
    const name=String(stream.display_name||login).trim().slice(0,22)||login;
    const fallback=el('span','swapp-home-creator-name',name);
    a.append(fallback);
    if(src){const img=el('img');img.src=src;img.alt='';img.loading='lazy';img.decoding='async';img.onerror=()=>img.remove();a.prepend(img)}
    faces.append(a);
   }
   avatars.append(faces);row.append(avatars);
  }catch{/* No invented live results on failure. */}
 }
 function decorateHero(modern,articles,onImageError){
   const hero=modern?.querySelector('.homeHeroInner1014');
   if(!hero)return null;
   const existing=hero.querySelector('.swapp-home-hero-feature');
   if(existing)return existing.dataset.articleSlug||null;
   const feature=articles.find(item=>slugOk(item.slug)&&safeUrl(item.image?.url||item.imageUrl));
   const placeholder=hero.querySelector('.swapp-home-hero-placeholder');
   if(!feature){placeholder?.remove();hero.classList.remove('swapp-hero-has-story');return null;}
   placeholder?.remove();
   const tile=el('a','swapp-home-hero-feature');tile.href='/actus/'+encodeURIComponent(feature.slug);
   tile.dataset.articleSlug=feature.slug;
   tile.setAttribute('aria-label','Lire : '+feature.title);
   tile.addEventListener('click',event=>navigateArticle(event,feature.slug,feature.game));
   const image=el('img');image.src=safeUrl(feature.image?.url||feature.imageUrl);image.alt='';
   image.decoding='async';image.loading='eager';
   const bridge=el('div','swapp-home-feature-bridge');
   bridge.dataset.swappFeatureGame=String(feature.game||'').slice(0,120);
   const actions=el('nav','swapp-home-feature-links');
   actions.setAttribute('aria-label','Explorer ce jeu sur SWAPP');
   const action=(label,href,primary=false)=>{
    const link=el('a','swapp-home-feature-cta'+(primary?' primary':''),label);link.href=href;actions.append(link);
   };
   action('Lire l’article','/actus/'+encodeURIComponent(feature.slug),true);
   action('Voir les lives',feature.game?'/actus/'+encodeURIComponent(feature.slug)+'#swapp-article-lives':'/decouvrir');
   action('En discuter',discussionHref(feature));
   bridge.append(actions);
   image.onerror=()=>{tile.remove();bridge.remove();hero.classList.remove('swapp-hero-has-story');hero.classList.remove('swapp-feature-ready');onImageError?.()};
   const overlay=el('span','swapp-home-hero-feature-overlay');
   overlay.append(el('span','swapp-home-hero-feature-label',feature.game||feature.category||'À la une'),
     el('strong','',feature.title));
   tile.append(image,overlay);hero.append(tile,bridge);
   hero.classList.add('swapp-hero-has-story');
   hero.classList.add('swapp-feature-ready');
   void showVerifiedCreators(feature,bridge);
   return feature.slug;
 }
 function mount(){
   const home=document.getElementById('home');
   if(!home||!home.classList.contains('active')||home.querySelector('[data-swapp-home-editorial]'))return;
   const modern=home.querySelector('.swappHome1014');
   const legacy=home.querySelector('.homeOnlyMain');
   const base=modern||legacy||home;
   if(!base.children.length||home.querySelector('.swappBoot'))return;
   const section=el('section','swapp-home-editorial');section.dataset.swappHomeEditorial='1';
   const top=el('div','swapp-home-editorial-top'),title=el('div','swapp-home-editorial-intro');
   title.append(el('small','','SWAPP · LE GAMING EN DIRECT'),el('h2','','À la une sur SWAPP'),el('p','','L’actualité des jeux et les créateurs qui y jouent, au même endroit.'));
   const all=el('a','swapp-media-button primary','Toute l’actualité →');all.href='/actus';
   all.onclick=e=>{if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||typeof window.setView!=='function')return;e.preventDefault();window.setView('actus');window.SwappActus?.home()};
   const actions=el('div','swapp-home-hero-actions');actions.append(videoTeaser());title.append(all);top.append(title,actions);section.append(top);
   const grid=el('div','swapp-home-story-grid');
   for(let i=0;i<(modern?4:5);i++){const skeleton=el('div','swapp-home-story swapp-home-story-skeleton'+(!modern&&i===0?' swapp-home-story-featured':''));skeleton.setAttribute('aria-hidden','true');skeleton.append(el('div','swapp-home-story-image'),el('div','swapp-home-story-body'));grid.append(skeleton)}section.setAttribute('aria-busy','true');section.append(grid);
   // Reserve the visual column before fetching articles to avoid a layout jump.
   const hero=modern?.querySelector('.homeHeroInner1014');
   if(hero&&!hero.querySelector('.swapp-home-hero-feature,.swapp-home-hero-placeholder')){
     const placeholder=el('div','swapp-home-hero-placeholder');
     placeholder.setAttribute('aria-hidden','true');
     hero.append(placeholder);hero.classList.add('swapp-hero-has-story');
   }
   // The editorial shelf belongs to the page's content flow, never ahead of
   // the entire homepage hero. Let streams follow the featured article before the news grid.
   const liveShelf=modern?.querySelector('.homeLiveSection1014');
   if(liveShelf)modern.append(section);
   else if(legacy)legacy.insertBefore(section,legacy.firstChild);
   else base.append(section);
   news().then(async articles=>{
     if(!section.isConnected)return;
     section.setAttribute('aria-busy','false');
     const valid=articles.filter(x=>slugOk(x.slug)&&String(x.title||'').trim()).slice(0,5);
     latestArticles=valid;
     // Matching reorders the existing live cards, not the article shelf.
     window.dispatchEvent(new CustomEvent('swapp:home-news-ready',{detail:{articles:valid}}));
     grid.replaceChildren();
     if(!valid.length){
       decorateHero(modern,[]);
       const retryState=el('div','swapp-home-empty');
       retryState.append(el('p','','Les actualités sont momentanément indisponibles.'));
       const retry=el('button','swapp-home-retry','Réessayer');
       retry.type='button';
       retry.onclick=()=>{
         newsPromise=null;newsFetchedAt=0;
         section.remove();
         queue();
       };
       retryState.append(retry);grid.append(retryState);return;
     }
     // The hero already links to its article; do not repeat the same story below.
     // If its image fails, return the article to the grid instead of losing it.
     const featuredSlug=decorateHero(modern,valid,()=>{
       if(!section.isConnected)return;
       grid.replaceChildren();
       valid.forEach((item,i)=>grid.append(story(item,i)));
     });
     const visible=featuredSlug?valid.filter(item=>item.slug!==featuredSlug):valid;
     visible.forEach((item,i)=>grid.append(story(item,featuredSlug?i+1:i)));

   });
 }
 // The SPA replaces #home's direct children when its view is rebuilt.
 // Watching every descendant catches every live thumbnail/card mutation and
 // schedules costly subtree searches across the whole homepage indefinitely.
 function queue(){
   if(queued)return;
   queued=true;
   setTimeout(()=>{
     queued=false;
     if(document.visibilityState==='hidden')return;
     mount();
   },220);
 }
 const home=document.getElementById('home');
 if(home){
   new MutationObserver(queue).observe(home,{
     childList:true,subtree:false,attributes:true,attributeFilter:['class']
   });
   queue();
 }
 window.addEventListener('pageshow',queue);
 window.addEventListener('popstate',queue);
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState==='visible')queue();
 });
})();