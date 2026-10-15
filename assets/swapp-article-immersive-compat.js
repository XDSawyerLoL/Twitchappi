/* SWAPP immersive article compatibility.
 * Upgrade old cached article markup to the new full-viewport wallpaper.
 * Never duplicate the image; leave the article listing untouched.
 */
(()=>{'use strict';
 if(window.__swappImmersiveCompatInstalled)return;
 window.__swappImmersiveCompatInstalled=true;
 const $=(q,r=document)=>r.querySelector(q);
 const safeSource=src=>{
  try{const u=new URL(src,location.origin);return u.protocol==='https:'&&!u.username&&!u.password}
  catch{return false}
 };
 function scene(root,picture){
  const existing=$(':scope > .swapp-article-scene',root);
  if(existing)return existing;
  const layer=document.createElement('div');
  layer.className='swapp-article-scene';
  layer.setAttribute('aria-hidden','true');
  if(picture&&safeSource(picture.currentSrc||picture.src)){
   picture.alt='';picture.loading='eager';picture.setAttribute('fetchpriority','high');
   picture.onerror=()=>{layer.classList.remove('has-art');picture.remove()};
   layer.appendChild(picture);layer.classList.add('has-art');
  }
  root.prepend(layer);
  return layer;
 }
 function credits(container,figure){
  const original=figure?.querySelector('figcaption');
  if(original?.textContent.trim()){
   const copy=document.createElement('p');
   copy.className='swapp-immersive-credit';copy.textContent=original.textContent;
   container.append(copy);
  }
 }
 function upgradeSPA(){
  const root=$('#actus .swapp-actus-native.swapp-actus-reading');
  const article=root?.querySelector('.swapp-actus-article');
  const hero=article?.querySelector(':scope > .swapp-reader-hero');
  if(!hero||$(':scope > .swapp-article-scene',root))return;
  const oldFigure=$(':scope > .swapp-reader-hero-figure',article);
  const back=$('.swapp-immersive-bg',hero);
  const picture=back?.querySelector('img')||oldFigure?.querySelector('img')||null;
  if(picture&&!safeSource(picture.currentSrc||picture.src))return;
  // If a cached template drew a large image inside the header, physically move
  // that SAME image to the page scene; no duplicate download or hero banner.
  scene(root,picture);
  if(back)back.remove();
  let copy=$(':scope > .swapp-immersive-content',hero);
  if(!copy){
   copy=document.createElement('div');copy.className='swapp-immersive-content';
   while(hero.firstChild)copy.appendChild(hero.firstChild);
   hero.append(copy);
  }
  hero.classList.add('swapp-immersive-hero');
  const bylineCredit=$(':scope > .swapp-immersive-credit',article);
  if(bylineCredit)copy.append(bylineCredit);
  if(oldFigure){credits(copy,oldFigure);oldFigure.remove()}
  const controls=$(':scope > .swapp-reader-controls',article);
  if(controls)copy.append(controls);
 }
 function upgradeNative(){
  const root=$('body.swapp-editorial-route main.article-wrap');
  if(!root||$(':scope > .swapp-article-scene',root))return;
  let hero=$(':scope > .swapp-immersive-hero',root);
  const figure=$(':scope > figure',root);
  const back=hero?.querySelector('.swapp-immersive-bg');
  const picture=back?.querySelector('img')||figure?.querySelector('img.cover-img')||null;
  if(!hero&&!figure)return;
  if(picture&&!safeSource(picture.currentSrc||picture.src))return;
  scene(root,picture);
  if(back)back.remove();
  if(!hero){
   const title=$(':scope > .article-title',root);
   if(!title)return;
   hero=document.createElement('header');
   hero.className='swapp-native-immersive-hero swapp-immersive-hero';
   const copy=document.createElement('div');copy.className='swapp-immersive-content';
   for(const selector of [':scope > .eyebrow',':scope > .article-title',':scope > .article-deck',':scope > .article-byline']){
    const el=$(selector,root);if(el)copy.append(el);
   }
   hero.append(copy);
   const breadcrumb=$(':scope > .breadcrumb',root);
   if(breadcrumb)breadcrumb.after(hero);else root.append(hero);
  }
  if(!hero.querySelector(':scope > .swapp-immersive-content')){
   const copy=document.createElement('div');copy.className='swapp-immersive-content';
   while(hero.firstChild)copy.append(hero.firstChild);hero.append(copy);
  }
  hero.classList.add('swapp-immersive-hero');
  const copy=$(':scope > .swapp-immersive-content',hero);
  if(figure){credits(copy,figure);figure.remove()}
  const credit=$(':scope > .swapp-immersive-credit',root);
  if(credit)copy.append(credit);
 }
 function run(){upgradeSPA();upgradeNative()}
 let queued=false;
 const observer=new MutationObserver(()=>{
  if(queued)return;
  queued=true;requestAnimationFrame(()=>{queued=false;run()});
 });
 if(document.body){observer.observe(document.body,{childList:true,subtree:true});run()}
})();