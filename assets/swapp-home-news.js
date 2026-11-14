/* SWAPP home: immersive gaming stories and verified matching live streams. */
(() => {
 'use strict';
 // Legacy editorial renderer: the canonical V16 catalogue is the only home news shelf.
 // Do not mount old news cards, teaser or discovery shortcuts underneath it.
 const spaHome=document.getElementById('home');
 if(spaHome?.querySelector('#swapp-catalogue-lab')){
  spaHome.querySelectorAll?.('[data-swapp-home-editorial]')?.forEach(node=>node.remove());
  return;
 }
 const slugOk=s=>/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(s||''));
 const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
 const el=(tag,cls,content)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(content!=null)n.textContent=String(content);return n};
 // AbortController fallback also works on Safari builds without AbortSignal.timeout.
 const fetchItems=async(path,timeout)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const r=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
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
   // Keep the native article link navigation; the editorial server is the
   // canonical reader and does not require a second F5 to fix its sidebars.
   // The browser still supports Ctrl-click, middle-click, back and bfcache.
   if(!/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(slug))return;
 }
 function story(item,index){
   const a=el('a','swapp-home-story'+(index===0?' swapp-home-story-featured':''));a.href='/actus/'+encodeURIComponent(item.slug);
   a.addEventListener('click',e=>navigateArticle(e,item.slug,item.game));
   const image=el('div','swapp-home-story-image'),src=safeUrl(window.SwappArticleExtras?.cardImageSources?.(item)?.[0]||item.image?.url||item.imageUrl);
   if(src){const img=el('img');img.src=src;img.alt='';img.loading=index===0?'eager':'lazy';img.decoding='async';img.onerror=()=>{img.remove();image.classList.add('swapp-home-image-fallback')};image.append(img)}else{image.classList.add('swapp-home-image-fallback')}
   image.append(el('span','swapp-home-story-category',item.game||item.category||'Actualité'));
   const body=el('div','swapp-home-story-body');
   body.append(el('span','swapp-home-story-eyebrow',index===0?'À LA UNE':'ACTUALITÉ'),el('strong','',item.title||'Article SWAPP'));
   if(item.summary)body.append(el('p','',item.summary));
   body.append(el('small','swapp-home-story-cta','Lire l’article →'));
   a.append(image,body);return a;
 }
 // A playable trailer must come from a published article, not a pinned campaign.
 const youtubeId=item=>{
  const raw=String(item?.trailerUrl||item?.trailer?.url||item?.videoUrl||item?.video?.url||'').trim();
  if(!raw)return null;
  try{
   const url=new URL(raw);
   if(url.protocol!=='https:'||url.username||url.password)return null;
   const host=url.hostname.toLowerCase();
   let video='';
   if(host==='youtu.be')video=url.pathname.split('/')[1]||'';
   else if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(host)){
    if(url.pathname==='/watch')video=url.searchParams.get('v')||'';
    else if(/^\/(?:embed|shorts)\//.test(url.pathname))video=url.pathname.split('/')[2]||'';
   }
   return /^[a-z0-9_-]{11}$/i.test(video)?video:null;
  }catch{return null}
 };
 function videoTeaser(item){
  const video=youtubeId(item),imageUrl=cover(item);
  if(!video||!imageUrl)return null;
  const wrap=el('article','swapp-home-video-feature swapp-video-item');
  const trigger=el('button','swapp-video-open');trigger.type='button';
  trigger.dataset.swappVideoPlay='1';trigger.dataset.videoYoutube=video;
  const name=String(item.game||item.title||'Jeu vidéo').trim().slice(0,110);
  trigger.dataset.videoTitle='Bande-annonce · '+name;
  trigger.setAttribute('aria-label','Regarder la bande-annonce de '+name);
  const image=el('img');image.src=imageUrl;image.alt='';
  image.loading='lazy';image.decoding='async';
  const overlay=el('span','swapp-video-shade');
  overlay.append(el('span','swapp-video-play-icon','▶'),el('span','swapp-video-action','Lancer la bande-annonce'));
  trigger.append(image,overlay);
  const caption=el('div','swapp-video-caption');
  caption.append(el('small','','SWAPP · BANDE-ANNONCE'),el('h3','',String(item.title||name).slice(0,150)));
  const article=el('a','','Lire le dossier →');article.href='/actus/'+encodeURIComponent(item.slug);
  caption.append(article);wrap.append(trigger,caption);return wrap;
 }
 function updateVideoTeaser(section,articles,heroSlug){
  const top=section.querySelector('.swapp-home-editorial-top');
  const actions=top?.querySelector('.swapp-home-hero-actions');
  if(!top||!actions)return;
  actions.replaceChildren();
  const featured=articles.find(item=>item.slug!==heroSlug&&String(item.status||'published').toLowerCase()==='published'&&youtubeId(item)&&cover(item));
  const tile=featured?videoTeaser(featured):null;
  if(tile){actions.append(tile);top.classList.add('swapp-home-has-video')}
  else top.classList.remove('swapp-home-has-video');
  return tile?featured.slug:null;
 }
 // A newly published illustrated article takes priority over an older hero.
 const articleDate=item=>Date.parse(item?.publishedAt||item?.originalPublishedAt||item?.updatedAt||'')||0;
 // Prefer the original editorial artwork for the full-screen hero, not a small thumbnail.
 // Keep the thumbnail only as a fallback if no full-size artwork is available.
 const heroCover=item=>safeUrl(item?.image?.url)||safeUrl(item?.imageUrl)||safeUrl(item?.thumbnail?.url)||cover(item);
 const cover=item=>{
   const sources=window.SwappArticleExtras?.cardImageSources?.(item);
   return safeUrl((Array.isArray(sources)&&sources[0])||item?.image?.url||item?.thumbnail?.url||item?.imageUrl||'');
 };
 const discussionHref=item=>'/social?share=news&title='+encodeURIComponent(item.game?item.game+' — '+item.title:item.title)+'&url='+encodeURIComponent('https://swapp.tv/actus/'+item.slug);
 const gameKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 async function showVerifiedCreators(item,row){
  if(!item.game)return;
  const game=String(window.SwappGameIdentity?.editorialGame?.(item)||item.game).trim().slice(0,90);
  if(!game)return;
  try{
   const data=await fetchItems('/api/discovery/game-lives?limit=5&game='+encodeURIComponent(game),10000);
   if(!row.isConnected||data?.success!==true||!(window.SwappGameIdentity?.sameGame?.(data.game,game)||gameKey(data.game)===gameKey(game))||!Array.isArray(data.items))return;
   const seen=new Set(),verified=data.items.filter(stream=>{
    const login=String(stream?.login||'').toLowerCase(),platform=String(stream?.platform||'').toLowerCase(),key=platform+':'+login;
    if(!/^[a-z0-9_]{2,25}$/.test(login)||seen.has(key)||!(window.SwappGameIdentity?.sameGame?.(stream.game_name||stream.game||stream.category,game)||gameKey(stream.game_name||stream.game)===gameKey(game)))return false;
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
    if(src){const img=el('img');img.src=src;img.alt='';img.loading='eager';img.decoding='async';img.onerror=()=>img.remove();a.prepend(img)}
    faces.append(a);
   }
   avatars.append(faces);row.append(avatars);
  }catch{/* No invented live results on failure. */}
 }
 function decorateHero(modern,articles,onImageError){
   const hero=modern?.querySelector('.homeHeroInner1014');
   if(!hero)return null;
   const existing=hero.querySelector('.swapp-home-hero-feature');
   const feature=articles.find(item=>slugOk(item.slug)&&heroCover(item));
   if(existing&&feature&&existing.dataset.articleSlug===feature.slug)return feature.slug;
   // Replace the old poster and its action rail in place. The video player
   // observes tile disconnection and destroys itself without leaking audio.
   if(existing){existing.remove();hero.querySelector('.swapp-home-feature-bridge')?.remove();}
   const placeholder=hero.querySelector('.swapp-home-hero-placeholder');
   if(!feature){
     placeholder?.remove();
     hero.classList.remove('swapp-hero-has-story','swapp-hero-pending','swapp-feature-ready');
     hero.classList.add('swapp-hero-unavailable');
     hero.setAttribute('aria-busy','false');
     return null;
   }
   placeholder?.remove();
   const tile=el('a','swapp-home-hero-feature');tile.href='/actus/'+encodeURIComponent(feature.slug);
   tile.dataset.articleSlug=feature.slug;
   tile.setAttribute('aria-label','Lire : '+feature.title);
   tile.addEventListener('click',event=>navigateArticle(event,feature.slug,feature.game));
   const image=el('img');image.src=heroCover(feature);image.alt='';
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
   image.onerror=()=>{
     const fallback=cover(feature);
     if(fallback&&image.src!==fallback){image.src=fallback;return;}
     tile.remove();bridge.remove();
     hero.classList.remove('swapp-hero-has-story','swapp-feature-ready','swapp-hero-pending');
     hero.classList.add('swapp-hero-unavailable');
     hero.setAttribute('aria-busy','false');
     onImageError?.();
   };
   const overlay=el('span','swapp-home-hero-feature-overlay');
   const heroHeading=el('strong','',String(feature.title||'Article SWAPP').replace(/\s*[—–-]\s*Vice City.*$/i,'').slice(0,105));
   heroHeading.style.cssText='color:#fff;text-shadow:0 2px 16px rgba(0,0,0,.95),0 1px 4px #000;max-width:min(860px,90vw);line-height:1.08;';
   overlay.append(el('span','swapp-home-hero-feature-label',feature.game||feature.category||'À la une'),heroHeading);
   tile.append(image,overlay);hero.append(tile,bridge);
   hero.classList.add('swapp-hero-has-story');
   hero.classList.add('swapp-feature-ready');
   hero.classList.remove('swapp-hero-pending','swapp-hero-unavailable');
   hero.setAttribute('aria-busy','false');
   window.dispatchEvent(new Event('swapp:home-feature-ready'));
   void showVerifiedCreators(feature,bridge);
   // Play only this published article's trailer after its poster is ready.
   // The image remains intact if the provider blocks or delays autoplay.
   window.SwappHomeMotion?.attach?.(tile,feature);
   return feature.slug;
 }
 // Compact, real editorial shortcuts fill the intro column beside the trailer.
 // Prefer stories outside the four main cards, without repeating the hero/video.
 function updateEditorialBriefs(section,articles,featuredSlug,teaserSlug,gridArticles=[]){
   const intro=section.querySelector('.swapp-home-editorial-intro');
   if(!intro)return;
   let briefs=intro.querySelector('.swapp-home-editorial-briefs');
   const excluded=new Set([featuredSlug,teaserSlug].filter(Boolean));
   const eligible=articles.filter(item=>slugOk(item.slug)
     &&String(item.title||'').trim()
     &&String(item.status||'published').toLowerCase()==='published'
     &&!excluded.has(item.slug));
   const inGrid=new Set(gridArticles.map(item=>item.slug));
   const elsewhere=eligible.filter(item=>!inGrid.has(item.slug));
   const selection=[...elsewhere,...eligible.filter(item=>inGrid.has(item.slug))].slice(0,3);
   if(!selection.length){briefs?.remove();return;}
   if(!briefs){
     briefs=el('nav','swapp-home-editorial-briefs');
     briefs.setAttribute('aria-label','À lire aussi sur SWAPP');
     intro.append(briefs);
   }
   briefs.replaceChildren(el('small','swapp-home-editorial-briefs-label','À DÉCOUVRIR AUSSI'));
   for(const item of selection){
     const link=el('a','swapp-home-editorial-brief');
     link.href='/actus/'+encodeURIComponent(item.slug);
     link.addEventListener('click',event=>navigateArticle(event,item.slug,item.game));
     const copy=el('span','swapp-home-editorial-brief-copy');
     copy.append(
       el('small','swapp-home-editorial-brief-tag',String(item.game||item.category||'Actualité').slice(0,70)),
       el('strong','swapp-home-editorial-brief-title',String(item.title).slice(0,125))
     );
     link.append(copy,el('span','swapp-home-editorial-brief-arrow','→'));
     briefs.append(link);
   }
 }
 function applyArticles(section,grid,modern,articles){
     if(!section.isConnected)return;
     section.setAttribute('aria-busy','false');
     const valid=articles.filter(x=>slugOk(x.slug)&&String(x.title||'').trim())
       .sort((a,b)=>articleDate(b)-articleDate(a)||String(b.slug).localeCompare(String(a.slug)))
       .slice(0,12);
     latestArticles=valid.slice(0,5);
     // Matching reorders the existing live cards, not the article shelf.
     window.dispatchEvent(new CustomEvent('swapp:home-news-ready',{detail:{articles:valid}}));
     grid.replaceChildren();
     if(!valid.length){
       updateEditorialBriefs(section,[],null,null);
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
     let teaserSlug=null;
     const featuredSlug=decorateHero(modern,valid,()=>{
       if(!section.isConnected)return;
       grid.replaceChildren();
       // Restore the failed hero while keeping the secondary trailer unique.
       valid.filter(item=>item.slug!==teaserSlug).slice(0,5).forEach((item,i)=>grid.append(story(item,i)));
     });
     // Hero, secondary video and news cards must showcase distinct stories.
     teaserSlug=updateVideoTeaser(section,valid,featuredSlug);
     const visible=valid.filter(item=>item.slug!==featuredSlug&&item.slug!==teaserSlug);
     // Without a valid illustrated lead, do not discard the fifth article.
     const gridArticles=visible.slice(0,modern&&featuredSlug?4:5);
     gridArticles.forEach((item,i)=>grid.append(story(item,featuredSlug?i+1:i)));
     updateEditorialBriefs(section,valid,featuredSlug,teaserSlug,gridArticles);

 }
 function mount(){
   const home=document.getElementById('home');
   if(!home||!home.classList.contains('active'))return;
   const existingSection=home.querySelector('[data-swapp-home-editorial]');
   if(existingSection){
     if(Date.now()-Number(existingSection.dataset.swappEditorialChecked||0)<90000)return;
     existingSection.dataset.swappEditorialChecked=String(Date.now());
     news().then(articles=>{
       if(articles.length&&existingSection.isConnected)
         applyArticles(existingSection,existingSection.querySelector('.swapp-home-story-grid'),home.querySelector('.swappHome1014'),articles);
     });
     return;
   }
   const modern=home.querySelector('.swappHome1014');
   const legacy=home.querySelector('.homeOnlyMain');
   const base=modern||legacy||home;
   if(!base.children.length||home.querySelector('.swappBoot'))return;
   const section=el('section','swapp-home-editorial');section.dataset.swappHomeEditorial='1';
   const top=el('div','swapp-home-editorial-top'),title=el('div','swapp-home-editorial-intro');
   title.append(el('small','','SWAPP · ACTUALITÉ'),el('h2','','Dernières actualités'),el('p','','Des annonces, des analyses et des bandes-annonces pour prolonger l’aventure.'));
   const all=el('a','swapp-media-button primary','Toute l’actualité →');all.href='/actus';
   all.onclick=e=>{if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||typeof window.setView!=='function')return;e.preventDefault();window.setView('actus');window.SwappActus?.home()};
   const actions=el('div','swapp-home-hero-actions');title.append(all);top.append(title,actions);section.append(top);
   const grid=el('div','swapp-home-story-grid');
   for(let i=0;i<(modern?4:5);i++){const skeleton=el('div','swapp-home-story swapp-home-story-skeleton'+(!modern&&i===0?' swapp-home-story-featured':''));skeleton.setAttribute('aria-hidden','true');skeleton.append(el('div','swapp-home-story-image'),el('div','swapp-home-story-body'));grid.append(skeleton)}section.setAttribute('aria-busy','true');section.append(grid);
   // Real destinations only: no placeholder guides, fake scores or invented lives.
   const explore=el('nav','swapp-home-explore');explore.setAttribute('aria-label','Explorer les univers SWAPP');
   for(const [name,detail,href] of [
     ['Univers des jeux','Actualités et créateurs par jeu','/jeux'],
     ['Guide du moment','Parcours détaillé AION 2','/guides/aion-2'],
     ['Communauté','Échanger avec les joueurs','/social']
   ]){
     const link=el('a','swapp-home-explore-link');link.href=href;
     link.append(el('strong','',name),el('span','',detail),el('span','swapp-home-explore-arrow','→'));
     explore.append(link);
   }
   section.append(explore);
   // Reserve the visual column before fetching articles to avoid a layout jump.
   const hero=modern?.querySelector('.homeHeroInner1014');
   if(hero&&!hero.querySelector('.swapp-home-hero-feature')){
     hero.classList.add('swapp-hero-pending');
     hero.classList.remove('swapp-hero-unavailable');
     hero.setAttribute('aria-busy','true');
   }
   if(hero&&!hero.querySelector('.swapp-home-hero-feature,.swapp-home-hero-placeholder')){
     const placeholder=el('div','swapp-home-hero-placeholder');
     placeholder.setAttribute('aria-hidden','true');
     hero.append(placeholder);hero.classList.add('swapp-hero-has-story');
   }
   // Keep the immersive hero intact, show real live channels next, then editorial.
   const liveShelf=modern?.querySelector('.homeLiveSection1014');
   if(liveShelf)modern.insertBefore(section,liveShelf.nextElementSibling);
   else if(legacy)legacy.insertBefore(section,legacy.firstChild);
   else base.append(section);
   section.dataset.swappEditorialChecked=String(Date.now());
   news().then(articles=>applyArticles(section,grid,modern,articles));
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
 // Refresh the existing hero when the newsroom publishes without requiring F5.
 window.setInterval(()=>{if(document.visibilityState==='visible'&&home?.classList.contains('active'))queue()},90000);
 window.addEventListener('pageshow',queue);
 window.addEventListener('popstate',queue);
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState==='visible')queue();
 });
})();