/* SWAPP Article Immersive — upgrade legacy article markup left by a cached ACTUS bundle.
 * Progressive enhancement only: do not change the editorial index or invent covers.
 */
(()=>{'use strict';
 if(window.__swappImmersiveCompatInstalled)return;
 window.__swappImmersiveCompatInstalled=true;
 const safeSource=src=>{try{const u=new URL(src,location.origin);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}};
 function enhanceSPA(){
  const root=document.querySelector('#actus .swapp-actus-native.swapp-actus-reading');
  const article=root?.querySelector('.swapp-actus-article');
  if(!article)return false;
  const hero=article.querySelector(':scope > .swapp-reader-hero');
  if(!hero||hero.classList.contains('swapp-immersive-hero'))return false;
  const cover=article.querySelector(':scope > .swapp-reader-hero-figure');
  if(!cover)return false; // Empty-cover articles keep the existing editorial design.
  const picture=cover.querySelector('img');
  if(!picture||!safeSource(picture.currentSrc||picture.src))return false;
  const content=document.createElement('div');
  content.className='swapp-immersive-content';
  while(hero.firstChild)content.appendChild(hero.firstChild);
  const backdrop=document.createElement('div');
  backdrop.className='swapp-immersive-bg';
  backdrop.setAttribute('aria-hidden','true');
  picture.alt='';
  picture.loading='eager';
  picture.setAttribute('fetchpriority','high');
  picture.onerror=()=>{hero.classList.remove('has-cover');backdrop.remove()};
  backdrop.appendChild(picture);
  hero.prepend(backdrop,content);
  hero.classList.add('swapp-immersive-hero','has-cover');
  const credit=cover.querySelector('figcaption');
  if(credit&&credit.textContent.trim()){
   const caption=document.createElement('p');
   caption.className='swapp-immersive-credit';
   caption.textContent=credit.textContent;
   hero.after(caption);
  }
  cover.remove();
  return true;
 }
 function enhanceNative(){
  const article=document.querySelector('body.swapp-editorial-route main.article-wrap');
  if(!article||article.querySelector(':scope > .swapp-immersive-hero'))return false;
  const figure=article.querySelector(':scope > figure');
  const image=figure?.querySelector('img.cover-img');
  const title=article.querySelector(':scope > .article-title');
  if(!image||!title||!safeSource(image.currentSrc||image.src))return false;
  const hero=document.createElement('header');
  hero.className='swapp-native-immersive-hero swapp-immersive-hero has-cover';
  const bg=document.createElement('div');
  bg.className='swapp-immersive-bg';bg.setAttribute('aria-hidden','true');
  image.alt='';image.loading='eager';image.setAttribute('fetchpriority','high');
  image.onerror=()=>{hero.classList.remove('has-cover');bg.remove()};
  bg.appendChild(image);
  const content=document.createElement('div');
  content.className='swapp-immersive-content';
  const first=article.querySelector(':scope > .eyebrow');
  const deck=article.querySelector(':scope > .article-deck');
  const byline=article.querySelector(':scope > .article-byline');
  for(const node of [first,title,deck,byline])if(node)content.appendChild(node);
  hero.append(bg,content);
  const previous=article.querySelector(':scope > .breadcrumb');
  if(previous)previous.after(hero);else article.prepend(hero);
  const caption=figure.querySelector('figcaption');
  if(caption&&caption.textContent.trim()){
   const credit=document.createElement('p');
   credit.className='swapp-immersive-credit';
   credit.textContent=caption.textContent;
   hero.after(credit);
  }
  figure.remove();return true;
 }
 function run(){enhanceSPA();enhanceNative()}
 let queued=false;
 const watch=new MutationObserver(()=>{
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;run()});
 });
 if(document.body){
  watch.observe(document.body,{childList:true,subtree:true});
  run();
 }
})();