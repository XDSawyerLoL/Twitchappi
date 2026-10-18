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
 border-radius:0!important;padding:13px 0!important;gap:10px!important;
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
 border-radius:8px!important;
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
 margin:0!important;border-radius:0!important;
 padding:9px!important;gap:9px!important;
 box-shadow:none!important;
}
body.oryonDiscoverV4 #discover .v4Actions .v4Btn{
 min-height:49px!important;border-radius:7px!important;
 font-size:14px!important;padding:9px 10px!important;
}
body.oryonDiscoverV4 #discover .v4Actions .v4Btn.primary{font-size:15px!important}
body.oryonDiscoverV4 #discover :is(.v4Card,.v4Mood,.v4Btn,.v4FollowCard,.v4DeckMini button):focus-visible{
 outline:3px solid #8aebec!important;outline-offset:3px!important;
}
body.oryonDiscoverV4 #discover .v4Panel{border-radius:0!important;padding:16px!important}
body.oryonDiscoverV4 #discover :is(.v4Deck,.v4Follow){
 background:transparent!important;border:0!important;
 border-top:1px solid rgba(180,204,229,.22)!important;
 border-radius:0!important;padding:22px 0 0!important;box-shadow:none!important;
}
body.oryonDiscoverV4 #discover :is(.v4DeckSlot,.v4FollowCard){border-radius:7px!important;box-shadow:none!important}
body.oryonDiscoverV4 #discover :is(.v4BioRow,.v4Search input,.v4Search select){border-radius:6px!important}
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
body.oryonDiscoverV4 #discover :is(.v4DeckSlot:not(.empty),.v4FollowCard).swapp-discover-no-image{
 background:linear-gradient(135deg,#193346,#281d40 68%,#131d30)!important;
}
body.oryonDiscoverV4 #discover :is(.v4DeckSlot,.v4FollowCard) img[hidden]{display:none!important}
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
  border-radius:8px!important;
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
  gap:8px!important;padding:8px 0!important;border-radius:0!important;
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
/* A single discreet creator acquisition action; no homepage module,
   popup, new endpoint or audience tracking. */
body.oryonDiscoverV4 #discover .swapp-discover-creator-join{
 display:inline-flex;align-items:center;gap:6px;margin-top:14px;
 padding:6px 0;background:none;border:0;border-bottom:1px solid #ffffff44;
 color:#e8f6ee;font:700 13px/1.5 system-ui,sans-serif;
 text-decoration:none;cursor:pointer;max-width:100%;text-align:left;
}
body.oryonDiscoverV4 #discover .swapp-discover-creator-join:hover,
body.oryonDiscoverV4 #discover .swapp-discover-creator-join:focus-visible{
 border-bottom-color:#c9f7dc;color:#fff;
}
body.oryonDiscoverV4 #discover .swapp-discover-creator-join:focus-visible{
 outline:2px solid #c9f7dc;outline-offset:4px;
}
/* SWAPP V17 DISCOVER — creator first, preferences second. */
body.oryonDiscoverV4 #discover .v4Title{font-size:clamp(34px,4.5vw,62px)!important;line-height:1.03!important;letter-spacing:-.058em!important;text-wrap:balance}
body.oryonDiscoverV4 #discover .v4Lead{max-width:58ch!important;font-size:15px!important;line-height:1.62!important}
body.oryonDiscoverV4 #discover .v4Controls{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
body.oryonDiscoverV4 #discover .v4MoodRail{gap:7px!important}
body.oryonDiscoverV4 #discover .v4Mood{min-height:42px!important;padding:8px 14px!important;border-radius:7px!important}
body.oryonDiscoverV4 #discover .v4Stage{grid-template-columns:minmax(0,1fr) minmax(250px,295px)!important;gap:clamp(12px,1.5vw,22px)!important}
body.oryonDiscoverV4 #discover .v4Card{overflow:hidden!important;border:1px solid rgba(189,212,240,.19)!important;border-radius:8px!important;aspect-ratio:16/9!important;max-height:650px!important}
body.oryonDiscoverV4 #discover .v4LiveTitle{display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:clamp(25px,3vw,42px)!important;line-height:1.1!important}
body.oryonDiscoverV4 #discover .v4Panel{background:rgba(16,26,40,.48)!important;border:1px solid rgba(178,211,233,.15)!important;border-radius:0!important;box-shadow:none!important}
body.oryonDiscoverV4 #discover .v4Actions{background:transparent!important;box-shadow:none!important;border:0!important}
body.oryonDiscoverV4 #discover .swapp-mood-reason{display:block;align-self:flex-start;max-width:95%;padding:4px 0 4px 10px;border-left:2px solid var(--swapp-page-accent,#8de5df);color:#e0edf7;font-size:12px;line-height:1.45;text-shadow:0 2px 9px #0008}
body.oryonDiscoverV4 #discover .swapp-mood-saved-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:44px;margin:0 0 8px;padding:9px 12px;background:#19293c;color:#e9f7ff;border:1px solid #60748b66;border-radius:6px;cursor:pointer;font:750 13px/1.35 system-ui,sans-serif}
body.oryonDiscoverV4 #discover .swapp-mood-saved-toggle:focus-visible{outline:2px solid var(--swapp-page-accent,#8de5df);outline-offset:3px}
body.oryonDiscoverV4 #discover .v4Deck.is-collapsed :is(.v4DeckGrid,.v4DeckMini){display:none!important}
body.oryonDiscoverV4 #discover .v4Deck.is-collapsed:after{display:none!important}
@media(max-width:1150px){body.oryonDiscoverV4 #discover .v4Stage{grid-template-columns:minmax(0,1fr)!important}}
@media(max-width:650px){body.oryonDiscoverV4 #discover .v4Title{font-size:clamp(31px,8vw,44px)!important}body.oryonDiscoverV4 #discover .v4Card{aspect-ratio:16/10!important;max-height:390px!important}body.oryonDiscoverV4 #discover .v4LiveTitle{font-size:clamp(23px,6.1vw,31px)!important}}
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
 const lastSavedImage=new WeakMap();
 function decorate(){
  const area=doc.getElementById('discover');
  if(!area||!area.querySelector('.v4Page'))return;
  const inviteHost=area.querySelector('.v4Hero > div');
  if(inviteHost&&!inviteHost.querySelector('.swapp-discover-creator-join')){
   const invite=doc.createElement('button');
   invite.type='button';
   invite.className='swapp-discover-creator-join';
   invite.textContent='Tu diffuses ? Créer ta chaîne sur SWAPP →';
   invite.onclick=()=>{
    const target=typeof root.streamTargetView==='function'?root.streamTargetView():'settings';
    if(typeof root.setView==='function')root.setView(target);
   };
   inviteHost.appendChild(invite);
  }
  // Keep the existing V4 actions and persistence; change labels, never handlers.
  for(const btn of area.querySelectorAll?.('.v4Actions .v4Btn')||[]){
   const before=String(btn.textContent||'').trim();
   const name=/passer|suivant|skip|next/i.test(before)?'Passer':/regarder|watch|voir le live/i.test(before)?'Regarder':/lurk|garder|sauvegarder|enregistrer/i.test(before)?'Garder':null;
   if(name&&before!==name){btn.textContent=name;btn.setAttribute?.('aria-label',name)}
  }
  const deck=area.querySelector('.v4Deck');
  if(deck&&!deck.querySelector('.swapp-mood-saved-toggle')&&typeof deck.insertBefore==='function'){
   deck.classList.add('is-collapsed');
   const toggle=doc.createElement('button');toggle.type='button';toggle.className='swapp-mood-saved-toggle';
   toggle.textContent='Mes sauvegardes ▾';toggle.setAttribute('aria-expanded','false');
   toggle.onclick=()=>{
    const opened=!deck.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded',String(opened));
    toggle.textContent=opened?'Mes sauvegardes ▴':'Mes sauvegardes ▾';
   };
   deck.insertBefore(toggle,deck.firstChild);
  }
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
   // Only the visitor's actually selected mood may explain a recommendation.
   const mood=area.querySelector('.v4Mood.active,.v4Mood[aria-pressed="true"]');
   const moodName=String(mood?.textContent||'').trim().slice(0,35);
   const textArea=card.querySelector('.v4CardText');
   if(textArea&&typeof textArea.appendChild==='function'){
    let reason=textArea.querySelector('.swapp-mood-reason');
    if(!reason){reason=doc.createElement('span');reason.className='swapp-mood-reason';textArea.appendChild(reason)}
    const label=moodName?'Dans ton ambiance : '+moodName:'Un créateur à découvrir en direct';
    if(reason.textContent!==label)reason.textContent=label;
   }
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
  // DeckLurker and followed creators reuse image nodes too. A stale Twitch
  // preview should never leave a broken-image icon or blank grey rectangle.
  for(const image of area.querySelectorAll('.v4DeckSlot img,.v4FollowCard img')){
   if(!image.getAttribute('loading'))image.loading='lazy';
   image.decoding='async';
   const src=String(image.getAttribute?.('src')||image.src||'').trim();
   if(lastSavedImage.get(image)===src)continue;
   lastSavedImage.set(image,src);
   const holder=image.closest?.('.v4DeckSlot,.v4FollowCard');
   holder?.classList.remove('swapp-discover-no-image');
   image.hidden=false;
   const fail=()=>{
    if(lastSavedImage.get(image)!==src)return;
    holder?.classList.add('swapp-discover-no-image');
    image.hidden=true;
   };
   if(!src||src.includes('404_preview')||(image.complete&&image.naturalWidth===0))fail();
   else image.addEventListener('error',fail,{once:true});
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
