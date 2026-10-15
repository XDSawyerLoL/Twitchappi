(function spatial(){
'use strict';
if(window.__swappPlayInstalled)return;
window.__swappPlayInstalled=true;
const style=document.createElement('style');
style.id='swapp-play-style';
style.textContent=`
.swapp-play-toggle{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;border:1px solid var(--line,var(--border,#42506c));border-radius:12px;min-height:42px;min-width:43px;padding:7px 11px;background:var(--surface,var(--layer,#141c2c));color:var(--text,var(--type,#fff));font:750 13px/1.1 system-ui,sans-serif;cursor:pointer}
.swapp-play-toggle:hover,.swapp-play-toggle[aria-pressed="true"]{border-color:var(--brand,var(--purple,#9c77ef));background:rgba(147,111,240,.15)}
.swapp-play-toggle[data-connected="true"]::after{content:"";width:7px;height:7px;border-radius:50%;background:#38d6a4}
.swapp-play-surf{border:1px solid var(--line,var(--border,#42506c));border-radius:12px;min-height:44px;padding:9px 15px;background:var(--surface,var(--layer,#172236));color:var(--text,var(--type,#fff));font-weight:750;cursor:pointer}
.swapp-play-surf:hover,.swapp-play-surf:focus-visible{border-color:var(--brand,var(--purple,#a489ff))}
.swapp-controller-focus{position:relative;outline:3px solid var(--brand,var(--purple,#a489ff))!important;outline-offset:3px!important;scroll-margin:110px;box-shadow:0 0 0 6px rgba(155,117,255,.18)!important;z-index:2}
.swapp-play-aura{position:fixed;left:0;top:0;z-index:120;pointer-events:none;opacity:0;border-radius:13px;border:2px solid rgba(172,151,255,.75);box-shadow:0 0 20px rgba(127,98,244,.30),0 0 56px rgba(72,215,219,.13);transition:transform .19s cubic-bezier(.22,.8,.24,1),width .19s,height .19s,opacity .12s}
.swapp-play-hint{position:fixed;z-index:121;left:50%;bottom:18px;transform:translateX(-50%);max-width:calc(100vw - 30px);padding:9px 15px;border:1px solid rgba(181,195,224,.20);border-radius:999px;background:rgba(10,16,29,.88);color:#e8edfc;font:750 12px/1.35 system-ui,sans-serif;box-shadow:0 14px 34px rgba(0,0,0,.28);backdrop-filter:blur(15px);pointer-events:none;white-space:normal;text-align:center}
.swapp-play-hint[hidden],.swapp-play-aura[hidden]{display:none!important}
body.swapp-play-active :is(.homeLiveCard1014,.swapp-video-item,.story-card,.pulse-post,.swapp-discover-stream,.swapp-actus-card):focus-within{transition:transform .2s ease,border-color .2s ease;transform:translateY(-2px);border-color:var(--brand,var(--purple,#a489ff))}
body.swapp-play-active #home .homeLiveCard1014.swapp-controller-focus{transform:translateY(-3px) scale(1.015)!important}
#home .homeLiveCard1014.swapp-pulse-live .swapp-live-pip1014{background:#ff506f!important;box-shadow:0 0 0 3px rgba(255,80,111,.18),0 0 14px rgba(255,80,111,.48)}
.swapp-social-viewport .swapp-controller-focus{outline-color:var(--social-accent,var(--brand,#e5a5e9))!important}
@media(prefers-reduced-motion:no-preference){#home .swapp-pulse-live .swapp-live-pip1014{animation:swappPlayPulse 2.3s ease-in-out infinite}@keyframes swappPlayPulse{50%{box-shadow:0 0 0 7px rgba(255,80,111,0),0 0 12px rgba(255,80,111,.6)}}}
@media(prefers-reduced-motion:reduce){.swapp-play-aura,.swapp-controller-focus,.swapp-play-toggle,.swapp-play-surf{transition:none!important;animation:none!important}#home .swapp-pulse-live .swapp-live-pip1014{animation:none!important}}
@media(max-width:1100px){.swapp-play-toggle-label{display:none}}
@media(max-width:680px){.swapp-play-toggle{min-width:38px;min-height:38px;padding:6px}.swapp-play-hint{bottom:70px;font-size:11px;padding:7px 11px}}
`;
document.head.appendChild(style);
let active=false,connected=false,userDisabled=false,lastMove=0,prev=[],lastFocus=null,lastPicked='',lastRoute=location.pathname;
let aura=null,hint=null,toggle=null;
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const liveSelector='.homeLiveCard1014,.swapp-live-card,.liveCard,.live-card,.streamCard,.stream-card,.featuredCard';
const badgeSelector='.homeLiveBadge1014,.liveBadge,.live-badge,[data-live="true"],[data-is-live="true"]';
const interactive='a[href],button:not([disabled]),summary,[role="button"],[role="tab"],[tabindex="0"],input:not([type="hidden"]),textarea,select';
const reduced=()=>!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function visible(el){
 if(!el||!el.isConnected||el.closest('[hidden],[inert],[aria-hidden="true"],.view:not(.active)'))return false;
 if(el.getAttribute('aria-disabled')==='true'||el.disabled)return false;
 const r=el.getBoundingClientRect(),s=getComputedStyle(el);
 return r.width>=9&&r.height>=9&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
}
function modal(){
 return $$('dialog[open],[role="dialog"][aria-modal="true"],#auth-modal:not([hidden])').find(visible)||null;
}
function navNodes(){
 return $$('header.top #nav a[href],header.top #nav button,header.top .brand,#mobileNav a[href],#mobileNav button,#mobileNav summary,.pulse-sidebar .pulse-nav-item,.pulse-mobile-nav button').filter(visible);
}
function liveCards(){return $$(liveSelector).filter(el=>visible(el)&&!!el.querySelector(badgeSelector))}
function navigable(){
 const dialog=modal(),list=$$(interactive,dialog||document).filter(el=>{
  if(!visible(el))return false;
  const card=el.closest('.homeLiveCard1014');
  return !(card&&el!==card);
 });
 if(!dialog)for(const c of liveCards())if(!list.includes(c))list.push(c);
 return list;
}
function current(){return lastFocus&&visible(lastFocus)?lastFocus:null}
function ensureOverlay(){
 if(!aura){aura=document.createElement('div');aura.className='swapp-play-aura';aura.setAttribute('aria-hidden','true');document.body.appendChild(aura)}
 if(!hint){hint=document.createElement('div');hint.className='swapp-play-hint';hint.setAttribute('role','status');hint.setAttribute('aria-live','polite');hint.hidden=true;document.body.appendChild(hint)}
}
function hintText(text){
 if(!hint)return;
 hint.textContent=text||'A : ouvrir · B : retour · X : découvrir · LB/RB : menus';
 hint.hidden=!active;
}
function showAura(el){
 if(!aura||!active||!visible(el)||reduced()){if(aura)aura.style.opacity='0';return}
 const r=el.getBoundingClientRect();
 aura.style.width=Math.max(12,r.width+12)+'px';
 aura.style.height=Math.max(12,r.height+12)+'px';
 aura.style.transform='translate3d('+(r.left-6)+'px,'+(r.top-6)+'px,0)';
 aura.style.opacity='1';
}
function clearFocus(){
 lastFocus?.classList?.remove('swapp-controller-focus');lastFocus=null;
 if(aura)aura.style.opacity='0';
}
function focusItem(el){
 if(!visible(el))return false;
 if(lastFocus!==el)lastFocus?.classList?.remove('swapp-controller-focus');
 lastFocus=el;el.classList.add('swapp-controller-focus');
 el.focus?.({preventScroll:true});
 el.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'auto'});
 showAura(el);return true;
}
function firstFocus(){
 const list=navigable();
 return focusItem((!modal()&&location.pathname==='/'&&liveCards()[0])||list[0]);
}
function move(dx,dy){
 const list=navigable(),prior=current();
 if(!prior){firstFocus();return}
 const p=prior.getBoundingClientRect(),x0=p.left+p.width/2,y0=p.top+p.height/2;
 let best=null,min=Infinity;
 for(const el of list){
  if(el===prior)continue;
  const r=el.getBoundingClientRect(),x=r.left+r.width/2-x0,y=r.top+r.height/2-y0;
  const forward=x*dx+y*dy,side=Math.abs(x*dy-y*dx);
  if(forward<=5)continue;
  const score=forward+side*2.9;
  if(score<min){min=score;best=el}
 }
 if(best)focusItem(best);
}
function jumpNav(direction){
 if(modal()){focusItem(navigable()[0]);return}
 const local=location.pathname==='/communaute'?$$('.pulse-nav-item,.pulse-mobile-nav button').filter(visible):[];
 const list=local.length?local:navNodes();
 if(!list.length)return;
 const index=list.indexOf(current());
 focusItem(list[index<0?0:(index+direction+list.length)%list.length]);
}
function setMode(on){
 active=!!on;
 if(!active){userDisabled=true;clearFocus()}else{userDisabled=false;firstFocus()}
 document.body.classList.toggle('swapp-play-active',active);
 if(toggle){
  toggle.setAttribute('aria-pressed',String(active));
  toggle.dataset.connected=String(connected);
  toggle.title=active?'Désactiver la navigation manette':'Activer la navigation manette (Alt+G)';
  toggle.setAttribute('aria-label',toggle.title);
 }
 hintText();
 if(active&&current())showAura(current());
}
function pickLive(){
 const candidates=liveCards();
 if(!candidates.length){hintText('Aucun live vérifié sur cette page · passe par Découvrir');return}
 const rest=candidates.filter(c=>c.getAttribute('aria-label')!==lastPicked);
 const pool=rest.length?rest:candidates,chosen=pool[Math.floor(Math.random()*pool.length)];
 lastPicked=chosen.getAttribute('aria-label')||'';
 focusItem(chosen);hintText('Créateur sélectionné · A pour regarder · X pour changer');
}
function markLive(){
 const home=$('#home.view.active');
 if(home)$$(liveSelector,home).forEach(el=>el.classList.toggle('swapp-pulse-live',!!el.querySelector(badgeSelector)));
}
function insertControls(){
 const bar=$('header.top .topbar'),account=$('header.top .userArea');
 if(bar&&!$('#swappPlayToggle')){
  const btn=document.createElement('button');
  btn.id='swappPlayToggle';btn.type='button';btn.className='swapp-play-toggle';
  btn.innerHTML='<span aria-hidden="true">🎮</span><span class="swapp-play-toggle-label">Manette</span>';
  btn.addEventListener('click',()=>setMode(!active));
  if(account)bar.insertBefore(btn,account);else bar.appendChild(btn);
 }
 toggle=$('#swappPlayToggle');
 if(toggle){toggle.dataset.connected=String(connected);toggle.setAttribute('aria-pressed',String(active));toggle.setAttribute('aria-label',active?'Désactiver la navigation manette':'Activer la navigation manette (Alt+G)')}
 const action=$('#home.view.active .homeHeroCopy1014 .homeActions1014');
 if(action&&!$('#swappPlaySurf')){
  const btn=document.createElement('button');
  btn.type='button';btn.id='swappPlaySurf';btn.className='swapp-play-surf';btn.textContent='⤨ Surprends-moi';
  btn.addEventListener('click',()=>{const list=liveCards();pickLive();if(list.length)current()?.click()});
  action.appendChild(btn);
 }
}
function closeOverlay(){
 const box=modal();
 if(!box)return false;
 const close=box.querySelector('button[aria-label="Fermer"],.pulse-modal-close,[data-close],button.close,.swapp-modal-close');
 if(close)close.click();else box.close?.();
 return true;
}
function goBack(){
 if(closeOverlay())return;
 if(location.pathname==='/'){setMode(false);return}
 if(history.length>1)history.back();else location.assign('/');
}
function clickFocus(){
 const el=current();if(!el){firstFocus();return}
 if(el.matches('input,textarea,select')){el.focus();return}
 el.click();
}
function poll(){
 if(document.hidden)return;
 const pads=typeof navigator.getGamepads==='function'?navigator.getGamepads():[];
 const pad=Array.from(pads||[]).find(p=>p&&p.connected);
 if(connected!==!!pad){connected=!!pad;if(toggle)toggle.dataset.connected=String(connected);if(connected&&!active&&!userDisabled)setMode(true);if(!connected)prev=[]}
 if(!active||!pad){prev=[];return}
 const buttons=pad.buttons||[],axes=pad.axes||[],pressed=i=>!!buttons[i]?.pressed;
 const x=(pressed(15)?1:0)-(pressed(14)?1:0)+(Math.abs(axes[0]||0)>.55?Math.sign(axes[0]):0);
 const y=(pressed(13)?1:0)-(pressed(12)?1:0)+(Math.abs(axes[1]||0)>.55?Math.sign(axes[1]):0);
 const now=performance.now();
 if((x||y)&&now-lastMove>190){if(Math.abs(x)>Math.abs(y))move(Math.sign(x),0);else move(0,Math.sign(y));lastMove=now}
 if(pressed(0)&&!prev[0])clickFocus();
 if(pressed(1)&&!prev[1])goBack();
 if(pressed(2)&&!prev[2])pickLive();
 if(pressed(4)&&!prev[4])jumpNav(-1);
 if(pressed(5)&&!prev[5])jumpNav(1);
 prev=buttons.map(b=>!!b?.pressed);
}
window.addEventListener('gamepadconnected',()=>{connected=true;if(!userDisabled)setMode(true)});
window.addEventListener('gamepaddisconnected',()=>{connected=false;prev=[];if(toggle)toggle.dataset.connected='false'});
document.addEventListener('keydown',e=>{
 if(e.altKey&&e.code==='KeyG'){e.preventDefault();setMode(!active);return}
 if(!active||e.altKey||e.ctrlKey||e.metaKey||e.isComposing)return;
 const el=document.activeElement;
 if(/INPUT|TEXTAREA|SELECT/.test(el?.tagName||'')||el?.isContentEditable)return;
 const dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
 if(dirs[e.key]){e.preventDefault();move(...dirs[e.key])}
 if(e.key==='Escape'){e.preventDefault();goBack()}
});
document.addEventListener('pointerdown',()=>{if(active)clearFocus()},{passive:true});
window.addEventListener('scroll',()=>showAura(current()),{passive:true,capture:true});
window.addEventListener('resize',()=>showAura(current()),{passive:true});
document.addEventListener('focusin',e=>{if(active&&visible(e.target)){lastFocus=e.target;showAura(lastFocus)}});
let queued=false;
const observer=new MutationObserver(()=>{
 if(queued)return;
 queued=true;
 requestAnimationFrame(()=>{
  queued=false;insertControls();markLive();
  if(active){
   if(lastRoute!==location.pathname){lastRoute=location.pathname;clearFocus();firstFocus()}
   else if(!current())firstFocus();
   else showAura(current());
  }
 });
});
ensureOverlay();observer.observe(document.body,{childList:true,subtree:true});
insertControls();markLive();window.setInterval(poll,120);
})();