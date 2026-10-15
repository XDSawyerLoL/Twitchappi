/* SWAPP PLAY: opt-in big-screen/controller navigation of the existing SPA. */
(()=>{'use strict';
if(window.__swappPlayInstalled)return;
window.__swappPlayInstalled=true;

const css=document.createElement('style');
css.id='swapp-play-style';
css.textContent=[
  '.swapp-play-toggle{border:1px solid var(--line,#344156);border-radius:12px;min-width:43px;min-height:41px;padding:7px 10px;background:var(--surface,#121826);color:var(--text,#fff);font-size:19px;line-height:1;white-space:nowrap;transition:border-color .15s,background .15s}',
  '.swapp-play-toggle:hover,.swapp-play-toggle[aria-pressed=true]{border-color:var(--brand,#8b5cf6);background:color-mix(in srgb,var(--brand,#8b5cf6) 16%,var(--surface,#121826))}',
  '.swapp-play-toggle[data-connected=true]:after{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:5px;background:#34d399;vertical-align:middle}',
  '.swapp-play-surf{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line,#344156);border-radius:12px;min-height:45px;padding:9px 14px;font-weight:750;background:var(--surface,#121826);color:var(--text,#fff)}',
  '.swapp-play-surf:hover,.swapp-play-surf:focus-visible{border-color:var(--brand,#8b5cf6)}',
  'body.swapp-play-active .top{box-shadow:0 12px 40px rgba(0,0,0,.27)}',
  'body.swapp-play-active #home .homeLiveGrid1014{grid-template-columns:repeat(auto-fit,minmax(min(100%,275px),1fr))!important}',
  'body.swapp-play-active .swapp-controller-focus,.swapp-controller-focus{outline:3px solid var(--brand,#8b5cf6)!important;outline-offset:4px!important;scroll-margin:110px;box-shadow:0 0 0 7px rgba(139,92,246,.17)!important}',
  'body.swapp-play-active #home .homeLiveCard1014.swapp-controller-focus{transform:translateY(-3px) scale(1.025)!important;z-index:5}',
  '#home .homeLiveCard1014.swapp-pulse-live .swapp-live-pip1014{background:#ff4d6d!important;box-shadow:0 0 0 3px rgba(255,77,109,.13),0 0 12px rgba(255,77,109,.48)}',
  '@media(prefers-reduced-motion:no-preference){#home .homeLiveCard1014.swapp-pulse-live .swapp-live-pip1014{animation:swappPlayPulse 2s ease-in-out infinite}@keyframes swappPlayPulse{50%{box-shadow:0 0 0 7px rgba(255,77,109,0),0 0 16px rgba(255,77,109,.6)}}}',
  '@media(prefers-reduced-motion:reduce){.swapp-play-toggle,.swapp-play-surf,.swapp-controller-focus{transition:none!important;animation:none!important}}',
  '@media(max-width:900px){.swapp-play-toggle{min-width:38px;min-height:38px;padding:6px}.swapp-play-surf{font-size:13px;min-height:41px;padding:7px 11px}}'
].join('\n');
document.head.appendChild(css);

const liveSelector='.homeLiveCard1014,.swapp-live-card,.liveCard,.live-card,.streamCard,.stream-card,.featuredCard';
const confirmedBadge='.homeLiveBadge1014,.liveBadge,.live-badge,[data-live="true"],[data-is-live="true"]';
let active=false,connected=false,prev=[],lastMove=0,lastPicked='';
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));

function visible(el){
 if(!el||!el.isConnected||el.closest('[hidden],.view:not(.active),[aria-hidden="true"],[inert]'))return false;
 const rect=el.getBoundingClientRect();
 return rect.width>8&&rect.height>8&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
}
function liveCards(){
 return $$(liveSelector).filter(el=>visible(el)&&!!el.querySelector(confirmedBadge));
}
function navigable(){
 const nodes=$$('.topbar a[href],.topbar button,#mobileNav a[href],#mobileNav button,.view.active a[href],.view.active button,.view.active [tabindex="0"]');
 return nodes.filter(el=>visible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!(el.closest(liveSelector)&&!el.matches(liveSelector)));
}
function currentFocus(){return $('.swapp-controller-focus')}
function clearFocus(){currentFocus()?.classList.remove('swapp-controller-focus')}
function focusItem(el){
 if(!visible(el))return;
 clearFocus();
 el.classList.add('swapp-controller-focus');
 el.focus({preventScroll:true});
 el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
}
function move(dx,dy){
 const list=navigable();
 if(!list.length)return;
 const current=currentFocus(),r=current?.getBoundingClientRect();
 if(!r){focusItem(liveCards()[0]||list[0]);return;}
 const x0=r.left+r.width/2,y0=r.top+r.height/2;
 let best=null,score=Infinity;
 for(const el of list){
  if(el===current)continue;
  const b=el.getBoundingClientRect(),x=b.left+b.width/2-x0,y=b.top+b.height/2-y0;
  const ahead=dx*x+dy*y,side=Math.abs(dx*y-dy*x);
  if(ahead<=5)continue;
  const candidate=ahead+side*2.8;
  if(candidate<score){score=candidate;best=el}
 }
 if(best)focusItem(best);
}
function paintStatus(){
 const toggle=$('#swappPlayToggle');
 if(!toggle)return;
 toggle.setAttribute('aria-pressed',String(active));
 toggle.dataset.connected=String(connected);
 toggle.title=connected?(active?'Manette connectée — mode salon actif':'Manette connectée — activer le mode salon'):(active?'Mode salon actif — flèches du clavier disponibles':'Activer le mode salon (Alt+G)');
 toggle.setAttribute('aria-label',toggle.title);
}
function setMode(on){
 active=Boolean(on);
 document.body.classList.toggle('swapp-play-active',active);
 if(active)focusItem(liveCards()[0]||navigable()[0]);
 else clearFocus();
 paintStatus();
}
function pickLive(open){
 const list=liveCards();
 if(!list.length){
  const btn=$('#swappPlaySurf');
  if(btn){btn.title='Aucun créateur actuellement proposé';btn.textContent='Aucun live disponible'}
  return;
 }
 const available=list.filter(el=>el.getAttribute('aria-label')!==lastPicked);
 const pool=available.length?available:list;
 const el=pool[Math.floor(Math.random()*pool.length)];
 lastPicked=el.getAttribute('aria-label')||'';
 if(open)el.click();else focusItem(el);
}
function insertControls(){
 const bar=$('.topbar'),user=$('.topbar .userArea');
 if(bar&&!$('#swappPlayToggle')){
  const btn=document.createElement('button');
  btn.id='swappPlayToggle';btn.type='button';btn.className='swapp-play-toggle';
  btn.textContent='🎮';
  btn.addEventListener('click',()=>setMode(!active));
  if(user)bar.insertBefore(btn,user);else bar.appendChild(btn);
 }
 const action=$('#home.view.active .homeHeroCopy1014 .homeActions1014');
 if(action&&!$('#swappPlaySurf')){
  const btn=document.createElement('button');
  btn.id='swappPlaySurf';btn.type='button';btn.className='swapp-play-surf';
  btn.textContent='⤨ Surprends-moi';
  btn.title='Découvrir un créateur réellement proposé en direct';
  btn.addEventListener('click',()=>pickLive(true));
  action.appendChild(btn);
 }
 paintStatus();
}
function markLive(){
 const home=$('#home.view.active');
 if(!home)return;
 $$(liveSelector,home).forEach(el=>{
  el.classList.toggle('swapp-pulse-live',!!el.querySelector(confirmedBadge));
 });
}
function back(){
 if($('[role="dialog"][open],dialog[open]'))return;
 if(location.pathname!=='/'&&location.pathname!=='/accueil'){
  history.back();
 }else{
  setMode(false);
 }
}
function poll(){
 if(document.hidden)return;
 const pads=typeof navigator.getGamepads==='function'?navigator.getGamepads():[];
 const pad=Array.from(pads||[]).find(p=>p&&p.connected);
 const nextConnected=!!pad;
 if(nextConnected!==connected){connected=nextConnected;paintStatus()}
 if(!pad||!active){prev=[];return}
 const b=pad.buttons||[],a=pad.axes||[];
 const pressed=n=>!!b[n]?.pressed;
 const x=(pressed(15)?1:0)-(pressed(14)?1:0)+(Math.abs(a[0]||0)>.55?Math.sign(a[0]):0);
 const y=(pressed(13)?1:0)-(pressed(12)?1:0)+(Math.abs(a[1]||0)>.55?Math.sign(a[1]):0);
 const now=performance.now();
 if((x||y)&&now-lastMove>220){
  if(Math.abs(x)>Math.abs(y))move(Math.sign(x),0);
  else move(0,Math.sign(y));
  lastMove=now;
 }
 if(pressed(0)&&!prev[0]){const target=currentFocus();if(target&&visible(target))target.click()}
 if(pressed(1)&&!prev[1])back();
 if(pressed(5)&&!prev[5])pickLive(false);
 if(pressed(4)&&!prev[4])focusItem(liveCards()[0]);
 prev=b.map(button=>!!button?.pressed);
}
window.addEventListener('gamepadconnected',()=>{
 connected=true;setMode(true);
});
window.addEventListener('gamepaddisconnected',()=>{connected=false;prev=[];paintStatus()});
document.addEventListener('keydown',event=>{
 if(event.altKey&&event.code==='KeyG'){event.preventDefault();setMode(!active);return}
 if(!active||event.altKey||event.ctrlKey||event.metaKey||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;
 const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
 if(arrows[event.key]){event.preventDefault();move(...arrows[event.key])}
 if(event.key==='Escape'){event.preventDefault();setMode(false)}
});
let scheduled=false;
const observer=new MutationObserver(()=>{
 if(scheduled)return;
 scheduled=true;
 requestAnimationFrame(()=>{
  scheduled=false;
  insertControls();
  markLive();
 });
});
observer.observe(document.body,{subtree:true,childList:true});
insertControls();markLive();
window.setInterval(poll,90);
})();