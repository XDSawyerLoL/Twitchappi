/* Keep the selected SWAPP bottom tab visible when a phone menu scrolls.
   Shared by the main SPA and server-rendered pages. No tracking or storage. */
(function(root,doc){
 'use strict';
 if(!root||!doc||root.SwappMobileNavFollow)return;
 const mobile=()=>root.matchMedia?.('(max-width:1080px)')?.matches??(root.innerWidth<=1080);
 const reduceMotion=()=>root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const path=()=>String(root.location?.pathname||'/').replace(/\/+$/,'')||'/';
 const direct=nav=>[...nav.children].filter(el=>el.matches?.('a,button'));
 const more=nav=>[...nav.children].find(el=>el.matches?.('details.swapp-mobile-more'));
 const isActive=el=>el?.classList?.contains('active')||el?.getAttribute?.('aria-current')==='page';
 function current(nav){
  if(!nav)return null;
  const options=direct(nav);
  const tagged=options.find(isActive);
  if(tagged)return tagged;
  const details=more(nav);
  const summary=details?.querySelector(':scope > summary');
  if(isActive(summary)||details?.querySelector('a.active,a[aria-current="page"]'))return details;
  // Native SSR routes already have correct active markers. This fallback
  // covers first paint while a page switches between the SPA and native shell.
  const route=path();
  const matching=options.find(el=>{
   try{return new URL(el.getAttribute('href'),root.location.origin).pathname===route}
   catch{return false}
  });
  if(matching)return matching;
  if(details&&[...details.querySelectorAll('a[href]')].some(el=>{
   try{return new URL(el.getAttribute('href'),root.location.origin).pathname===route}
   catch{return false}
  }))return details;
  return null;
 }
 function displacement(nav,target,pad=12){
  if(!nav||!target||typeof nav.getBoundingClientRect!=='function')return 0;
  const visible=nav.getBoundingClientRect(),rect=target.getBoundingClientRect();
  if(rect.left<visible.left+pad)return rect.left-visible.left-pad;
  if(rect.right>visible.right-pad)return rect.right-visible.right+pad;
  return 0;
 }
 function follow(nav,{instant=false}={}){
  if(!mobile()||!nav)return false;
  const selected=current(nav);if(!selected)return false;
  const delta=displacement(nav,selected);
  if(Math.abs(delta)<1)return true;
  const left=Math.max(0,nav.scrollLeft+delta);
  if(typeof nav.scrollTo==='function'){
   try{nav.scrollTo({left,behavior:instant||reduceMotion()?'instant':'smooth'});return true}catch(_){}
  }
  nav.scrollLeft=left;
  return true;
 }
 let nav=null,observer=null,frame=0,last=null,initialized=false,detailsListener=null;
 function request(){
  if(frame)return;
  const raf=typeof root.requestAnimationFrame==='function'
   ?root.requestAnimationFrame.bind(root):callback=>{callback();return 0};
  frame=raf(()=>{
   frame=0;
   if(!nav||!mobile())return;
   const selected=current(nav);
   if(!selected)return;
   // Do not override a user's horizontal swipe after the active item is placed.
   if(selected===last&&initialized)return;
   last=selected;follow(nav,{instant:!initialized});initialized=true;
  });
 }
 function attach(){
  const next=doc.getElementById('mobileNav');
  if(next===nav){request();return}
  if(observer)observer.disconnect();
  if(nav&&detailsListener)nav.removeEventListener('toggle',detailsListener,true);
  nav=next;last=null;initialized=false;
  if(!nav)return;
  if(typeof root.MutationObserver==='function'){
   observer=new root.MutationObserver(request);
   observer.observe(nav,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-current','open','href']});
  }
  detailsListener=event=>{
   if(event.target?.matches?.('details.swapp-mobile-more')&&event.target.open){
    last=null;request();
   }
  };
  nav.addEventListener('toggle',detailsListener,true);
  request();
 }
 const start=()=>{
  attach();
  root.addEventListener?.('popstate',request);
  root.addEventListener?.('pageshow',request);
  root.addEventListener?.('resize',request,{passive:true});
  doc.addEventListener?.('click',event=>{
   if(!event.target?.closest?.('#mobileNav'))return;
   // Let the SPA update active classes before adjusting the horizontal position.
   last=null;request();
  });
 };
 root.SwappMobileNavFollow=Object.freeze({current,displacement,follow,attach});
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})(typeof window==='undefined'?null:window,typeof document==='undefined'?null:document);
