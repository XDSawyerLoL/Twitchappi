/* SWAPP contextual article navigation.
 * Native links remain native: match only a genuinely identical illustration
 * across same-origin article navigations. Other routes use the normal fade.
 */
(()=>{
 'use strict';
 if(window.__SWAPP_ARTICLE_HANDOFF__)return;
 window.__SWAPP_ARTICLE_HANDOFF__=true;
 const KEY='swapp_article_handoff_v1';
 const NAME='swapp-article-artwork';
 const SLUG=/^\/actus\/([a-z0-9][a-z0-9-]{2,109}[a-z0-9])\/?$/;
 const SOURCE_IMAGE='.swapp-home-hero-feature > img, .swapp-home-story-image img, .swapp-actus-cover img, .story-card > img.story-image, .swapp-reader-next-thumb, .game-portal .card > img';
 const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const url=raw=>{try{return new URL(raw,location.href)}catch{return null}};
 const slugOf=href=>{
  const parsed=url(href);
  if(!parsed||parsed.origin!==location.origin||parsed.hash||parsed.search)return '';
  return parsed.pathname.match(SLUG)?.[1]||'';
 };
 const clearStored=()=>{try{sessionStorage.removeItem(KEY)}catch(_){}};
 let outgoing=null;
 let incoming=null;
 let releaseOutgoing=null;

 function artwork(img){
  if(!img||!img.isConnected||!img.complete||!img.naturalWidth)return '';
  const src=url(img.currentSrc||img.src);
  return src&&/^https?:$/.test(src.protocol)?src.href:'';
 }
 function clearOutgoing(){
  if(outgoing){outgoing.style.viewTransitionName='';outgoing=null}
  if(releaseOutgoing){clearTimeout(releaseOutgoing);releaseOutgoing=null}
 }
 function onArticleClick(event){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||reduce())return;
  const link=event.target?.closest?.('a[href]');
  if(!link||link.target&&link.target!=='_self'||link.hasAttribute('download'))return;
  const slug=slugOf(link.href);
  if(!slug)return;
  const img=link.querySelector(SOURCE_IMAGE) ||
    link.closest('.swapp-home-feature-bridge')?.parentElement?.querySelector('.swapp-home-hero-feature > img') ||
    link.closest('.hero-side')?.querySelector('img');
  const src=artwork(img);
  clearOutgoing();
  clearStored();
  if(!src||!img.getClientRects?.().length)return;
  const rect=img.getBoundingClientRect?.();
  if(rect && (rect.bottom<=0||rect.right<=0||rect.top>=window.innerHeight||rect.left>=window.innerWidth))return;
  try{sessionStorage.setItem(KEY,JSON.stringify({slug,src,at:Date.now()}))}
  catch(_){return}
  outgoing=img;
  img.style.viewTransitionName=NAME;
  // If a script cancels the navigation, leave no stale named image behind.
  releaseOutgoing=setTimeout(clearOutgoing,1400);
 }
 document.addEventListener('click',onArticleClick,true);

 function arrive(){
  const slug=location.pathname.match(SLUG)?.[1];
  if(!slug)return;
  let saved=null;
  try{saved=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch(_){}
  clearStored();
  if(!saved||saved.slug!==slug||Date.now()-saved.at>12000||saved.at>Date.now()+1000||reduce())return;
  const img=document.querySelector('.article-wrap[data-swapp-article-slug] > .swapp-article-scene > img');
  if(!img||img.closest('.article-wrap')?.dataset.swappArticleSlug!==slug)return;
  // A trailer poster or alternate thumbnail may differ from the clicked art.
  // Never morph unrelated pictures into one another.
  const target=url(img.getAttribute('src'));
  if(!target||target.href!==saved.src)return;
  incoming=img;
  img.style.viewTransitionName=NAME;
  // Clean up after the browser's native 320-ms cross-document snapshot.
  setTimeout(()=>{
   if(incoming===img){img.style.viewTransitionName='';incoming=null}
  },950);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arrive,{once:true});
 else arrive();
 window.addEventListener('pageshow',event=>{
  if(event.persisted){clearOutgoing();clearStored()}
 });
})();