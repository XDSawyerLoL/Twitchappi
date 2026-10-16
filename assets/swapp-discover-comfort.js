'use strict';
/*
 * SWAPP Discover V4 comfort & player entry.
 * Scoped to #discover. No API, tracking, timer loop, new section or external CSS.
 * Loaded AFTER index_script.js to resolve earlier injected legacy Discover CSS.
 */
(function(root,doc){
 if(!root||!doc||root.__swappDiscoverComfortInstalled)return;
 root.__swappDiscoverComfortInstalled=true;
 const STYLE_ID='swapp-discover-comfort-20261016';
 const STYLE=String.raw`
/* Current Discover V4 only; does not touch homepage, SOCIAL or other views. */
body.oryonDiscoverV4 #discover .v4Page{
 padding:clamp(15px,2.3vw,32px) clamp(14px,2.5vw,38px) 110px!important;
}
body.oryonDiscoverV4 #discover .v4Shell{gap:clamp(16px,1.7vw,26px)!important}
body.oryonDiscoverV4 #discover .v4Hero{
 grid-template-columns:minmax(280px,.75fr) minmax(0,1.25fr)!important;
 gap:clamp(14px,1.8vw,26px)!important;
 align-items:center!important;
}
body.oryonDiscoverV4 #discover .v4Title{
 font-size:clamp(43px,4.6vw,84px)!important;
 line-height:.94!important;
 letter-spacing:-.065em!important;
 margin:10px 0!important;
}
body.oryonDiscoverV4 #discover .v4Lead{
 font-size:clamp(15px,1.15vw,19px)!important;
 line-height:1.5!important;
}
body.oryonDiscoverV4 #discover .v4Controls{
 border-radius:20px!important;padding:13px!important;gap:10px!important;
}
body.oryonDiscoverV4 #discover .v4MoodRail{
 scrollbar-width:none!important;scroll-snap-type:x proximity;
 overscroll-behavior-x:contain;touch-action:pan-x;
}
body.oryonDiscoverV4 #discover .v4MoodRail::-webkit-scrollbar{display:none!important}
body.oryonDiscoverV4 #discover .v4Mood{
 min-height:44px!important;
 scroll-snap-align:start;
 font-size:13px!important;
}
body.oryonDiscoverV4 #discover .v4Search :is(input,select){
 font-size:16px!important;min-height:46px!important;
}
body.oryonDiscoverV4 #discover .v4Stage{
 grid-template-columns:minmax(0,1fr) minmax(280px,370px)!important;
 gap:clamp(14px,1.5vw,23px)!important;align-items:start!important;
}
body.oryonDiscoverV4 #discover :is(.v4Card,.v4Player){
 border-radius:20px!important;
 min-height:0!important;aspect-ratio:16/9!important;
 max-height:min(65vh,680px)!important;
}
body.oryonDiscoverV4 #discover .v4Card{
 cursor:pointer;isolation:isolate;
 background:linear-gradient(145deg,#17283c,#211a36 65%,#0b1322)!important;
}
body.oryonDiscoverV4 #discover .v4Card:before{
 content:"";position:absolute;inset:0;
 background:radial-gradient(circle at 28% 22%,rgba(121,195,205,.22),transparent 50%);
 pointer-events:none;
}
body.oryonDiscoverV4 #discover .v4Card.swapp-discover-no-image:before{
 background:radial-gradient(circle at 23% 23%,rgba(146,108,219,.34),transparent 49%),linear-gradient(125deg,#132738,#251834);
}
/* Keep titles and real game badges readable against unpredictable Twitch art. */
body.oryonDiscoverV4 #discover .v4Card:after{
 content:"";position:absolute;inset:0;pointer-events:none;
 background:linear-gradient(180deg,rgba(5,9,16,.06) 9%,transparent 31%,rgba(5,9,16,.58) 63%,rgba(5,9,16,.94) 100%);
 z-index:1;
}
body.oryonDiscoverV4 #discover .v4CardText{z-index:2!important}
body.oryonDiscoverV4 #discover .v4Tags{z-index:3!important}
body.oryonDiscoverV4 #discover .v4Card img{
 display:block;width:100%;height:100%;object-fit:cover;
}
body.oryonDiscoverV4 #discover .v4Card img[hidden]{display:none!important}
body.oryonDiscoverV4 #discover .v4CardText{
 left:clamp(15px,2.1vw,27px)!important;
 right:clamp(15px,2.1vw,27px)!important;
 bottom:clamp(15px,2.1vw,25px)!important;
 gap:8px!important;
}
body.oryonDiscoverV4 #discover .v4LiveTitle{
 font-size:clamp(24px,2.8vw,42px)!important;
 line-height:1.1!important;letter-spacing:-.045em!important;
 overflow-wrap:anywhere;
}
body.oryonDiscoverV4 #discover .v4Meta{font-size:clamp(13px,1.1vw,16px)!important;line-height:1.45!important}
body.oryonDiscoverV4 #discover .v4Tag{
 font-size:11px!important;line-height:1.2!important;
 padding:7px 10px!important;
}
body.oryonDiscoverV4 #discover .v4Actions{
 max-width:none!important;
 margin:0!important;border-radius:17px!important;
 padding:9px!important;gap:9px!important;
 box-shadow:none!important;
}
body.oryonDiscoverV4 #discover .v4Actions .v4Btn{
 min-height:49px!important;border-radius:13px!important;
 font-size:14px!important;padding:9px 10px!important;
}
body.oryonDiscoverV4 #discover .v4Actions .v4Btn.primary{font-size:15px!important}
body.oryonDiscoverV4 #discover :is(.v4Card,.v4Mood,.v4Btn,.v4FollowCard,.v4DeckMini button):focus-visible{
 outline:3px solid #8aebec!important;outline-offset:3px!important;
}
body.oryonDiscoverV4 #discover .v4Panel{border-radius:20px!important;padding:16px!important}
body.oryonDiscoverV4 #discover .v4DeckGrid{
 grid-template-columns:repeat(auto-fill,minmax(150px,1fr))!important;gap:11px!important;
}
body.oryonDiscoverV4 #discover .v4DeckSlot.empty{display:none!important}
body.oryonDiscoverV4 #discover .v4Deck:has(.v4DeckSlot:not(.empty)) .v4DeckGrid{display:grid!important}
body.oryonDiscoverV4 #discover .v4Deck:not(:has(.v4DeckSlot:not(.empty))) .v4DeckGrid{display:none!important}
body.oryonDiscoverV4 #discover .v4Deck:not(:has(.v4DeckSlot:not(.empty))):after{
 content:"Aucun live enregistré. Utilise LURK sur un live pour le retrouver ici.";
 display:block;color:#b9c9df;font-size:14px;line-height:1.5;
 padding:13px 15px;background:rgba(255,255,255,.035);
 border:1px dashed rgba(175,198,220,.28);border-radius:13px;
}
body.oryonDiscoverV4 #discover .v4DeckSlot:not(.empty){min-height:122px!important;overflow:hidden}
body.oryonDiscoverV4 #discover .v4DeckSlot:not(.empty) img{object-fit:cover}
body.oryonDiscoverV4 #discover .v4FollowRail{
 max-width:100%!important;overflow-x:auto!important;
 scrollbar-width:none!important;overscroll-behavior-x:contain;
}
body.oryonDiscoverV4 #discover .v4FollowRail::-webkit-scrollbar{display:none!important}
@media(max-width:1150px){
 body.oryonDiscoverV4 #discover .v4Hero,
 body.oryonDiscoverV4 #discover .v4Stage{grid-template-columns:minmax(0,1fr)!important}
}
@media (max-width:920px) and (orientation:portrait), (max-width:650px){
 body.oryonDiscoverV4 #discover .v4Page{
  padding:14px 13px calc(106px + env(safe-area-inset-bottom))!important;
 }
 body.oryonDiscoverV4 #discover .v4Shell{gap:15px!important}
 body.oryonDiscoverV4 #discover .v4Hero{gap:13px!important}
 body.oryonDiscoverV4 #discover .v4Title{
  font-size:clamp(38px,10.5vw,57px)!important;
  margin:8px 0!important;line-height:1!important;
 }
 body.oryonDiscoverV4 #discover .v4Lead{font-size:15px!important;line-height:1.5!important}
 body.oryonDiscoverV4 #discover .v4Controls{padding:11px!important;gap:9px!important}
 body.oryonDiscoverV4 #discover .v4Search{
  display:grid!important;
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  gap:8px!important;
 }
 body.oryonDiscoverV4 #discover .v4Search input{
  grid-column:1/-1!important;min-width:0!important;
 }
 body.oryonDiscoverV4 #discover .v4Search select{
  min-width:0!important;width:100%!important;
 }
 body.oryonDiscoverV4 #discover .v4Search .v4Btn{
  grid-column:1/-1!important;min-height:46px!important;
 }
 body.oryonDiscoverV4 #discover :is(.v4Card,.v4Player){
  width:100%!important;min-width:0!important;
  min-height:0!important;
  aspect-ratio:16/10!important;max-height:390px!important;
  border-radius:16px!important;
 }
 body.oryonDiscoverV4 #discover .v4CardText{
  left:14px!important;right:14px!important;bottom:13px!important;gap:6px!important;
 }
 body.oryonDiscoverV4 #discover .v4LiveTitle{
  font-size:clamp(23px,6.1vw,32px)!important;
  line-height:1.13!important;
 }
 body.oryonDiscoverV4 #discover .v4Tags{top:10px!important;left:10px!important;right:10px!important;gap:5px!important}
 body.oryonDiscoverV4 #discover .v4Tag{font-size:11px!important;padding:5px 8px!important;max-width:170px!important}
 body.oryonDiscoverV4 #discover .v4Meta{font-size:13px!important;gap:5px!important}
 /* One unmistakable "Regarder" action, then two compact secondary
    controls. Avoid 3 cramped buttons on 320-390px phones. */
 body.oryonDiscoverV4 #discover .v4Actions{
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  gap:8px!important;padding:8px!important;border-radius:14px!important;
 }
 body.oryonDiscoverV4 #discover .v4Actions .v4Btn{
  min-width:0!important;min-height:46px!important;
  padding:10px 8px!important;font-size:13px!important;
  text-align:center!important;white-space:normal!important;
  line-height:1.2!important;touch-action:manipulation;
 }
 body.oryonDiscoverV4 #discover .v4Actions .v4Btn.primary{
  grid-column:1/-1!important;grid-row:1!important;
  min-height:51px!important;font-size:16px!important;
  font-weight:850!important;
 }
 body.oryonDiscoverV4 #discover .v4CardText{
  left:16px!important;right:16px!important;bottom:17px!important;
  text-shadow:0 2px 12px rgba(0,0,0,.45);
 }
 body.oryonDiscoverV4 #discover .v4DeckGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 body.oryonDiscoverV4 #discover .v4DeckSlot:not(.empty){min-width:0!important}
 body.oryonDiscoverV4 #discover .v4FollowCard{min-width:min(70vw,260px)!important;height:128px!important}
}
@media(prefers-reduced-motion:reduce){
 body.oryonDiscoverV4 #discover :is(.v4Card,.v4Btn,.v4Mood,.v4FollowCard){transition:none!important;animation:none!important}
}
`;
 function injectStyles(){
  if(doc.getElementById(STYLE_ID))return;
  const style=doc.createElement('style');
  style.id=STYLE_ID;
  style.textContent=STYLE;
  (doc.head||doc.documentElement).appendChild(style);
 }
 function safeTitle(card){
  return (card.querySelector('.v4LiveTitle')?.textContent||'').trim().slice(0,100);
 }
 const lastHeroImage=new WeakMap();
 function decorate(){
  const area=doc.getElementById('discover');
  if(!area||!area.querySelector('.v4Page'))return;
  const card=area.querySelector('#v4SwipeCard');
  if(card){
   // The swipe UI REUSES the same card node for successive creators.
   // Role, label, thumbnail and broken-image fallback must follow each swap.
   const title=safeTitle(card)||'créateur en direct';
   if(!card.dataset.swappDiscoverComfort){
    card.dataset.swappDiscoverComfort='1';
    card.setAttribute('role','button');
    card.setAttribute('tabindex','0');
   }
   const label='Regarder le live : '+title;
   if(card.getAttribute?.('aria-label')!==label)
    card.setAttribute('aria-label',label);
   const image=card.querySelector('img');
   if(image){
    image.alt='Aperçu : '+title;
    image.loading='eager';
    image.decoding='async';
    const src=String(image.getAttribute?.('src')||image.src||'').trim();
    const previous=lastHeroImage.get(card);
    if(!previous||previous.image!==image||previous.src!==src){
     lastHeroImage.set(card,{image,src});
     card.classList.remove('swapp-discover-no-image');
     image.hidden=false;
     const fail=()=>{
      // Old image error callbacks must not corrupt the next creator's image.
      const current=lastHeroImage.get(card);
      if(!current||current.image!==image||current.src!==src)return;
      card.classList.add('swapp-discover-no-image');
      image.hidden=true;
     };
     if(!src||src.includes('404_preview')||(image.complete&&image.naturalWidth===0))fail();
     else image.addEventListener('error',fail,{once:true});
    }
   }else{
    lastHeroImage.delete(card);
    card.classList.add('swapp-discover-no-image');
   }
  }
  // Saved deck images should not all compete with the hero thumbnail.
  for(const image of area.querySelectorAll('.v4DeckSlot img,.v4FollowCard img')){
   if(!image.getAttribute('loading'))image.loading='lazy';
   image.decoding='async';
  }
 }
 function canWatch(){
  return typeof root.v4Watch==='function' &&
   !!doc.querySelector('#discover.view.active #v4SwipeCard');
 }
 function watch(){
  if(canWatch())root.v4Watch();
 }
 function install(){
  injectStyles();
  const discover=doc.getElementById('discover');
  if(!discover)return;
  let scheduled=false;
  const request=()=>{
   if(scheduled)return;
   scheduled=true;
   const raf=root.requestAnimationFrame||((fn)=>fn());
   raf(()=>{scheduled=false;decorate()});
  };
  const seen=new WeakMap();
  discover.addEventListener('pointerdown',event=>{
   const card=event.target.closest?.('#v4SwipeCard');
   if(card)seen.set(card,{x:event.clientX,y:event.clientY,swiped:false});
  },{passive:true});
  discover.addEventListener('pointermove',event=>{
   const card=event.target.closest?.('#v4SwipeCard');
   const start=card&&seen.get(card);
   if(start&&(Math.abs(event.clientX-start.x)>20||Math.abs(event.clientY-start.y)>20))
    start.swiped=true;
  },{passive:true});
  discover.addEventListener('click',event=>{
   const card=event.target.closest?.('#v4SwipeCard');
   if(!card||event.target.closest?.('button,input,select,a'))return;
   const movement=seen.get(card);
   if(movement?.swiped){seen.delete(card);return}
   watch();
  });
  discover.addEventListener('keydown',event=>{
   if(event.target?.id!=='v4SwipeCard'||!['Enter',' '].includes(event.key))return;
   event.preventDefault();
   watch();
  });
  if(typeof root.MutationObserver==='function'){
   const observer=new root.MutationObserver(request);
   observer.observe(discover,{childList:true,subtree:true,characterData:true,
    attributes:true,attributeFilter:['src']});
  }
  request();
 }
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})(typeof window!=='undefined'?window:null,typeof document!=='undefined'?document:null);
