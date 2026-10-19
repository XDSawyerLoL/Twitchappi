/* SWAPP Fair Discovery v3 — explicit opt-in on existing Home/Discover cards.
 * No extra live API calls, cookies, storage, user IDs, passive tracking or extra shelf.
 * The server supplied a signed proof on its already-returned verified candidate.
 */
(()=>{
 'use strict';
 if(window.__swappFairV3Installed)return;
 window.__swappFairV3Installed=true;
 const PROOF=/^[A-Za-z0-9_-]{30,500}\.[a-f0-9]{64}$/;
 const placements=[
  {key:'home',root:'#homeLiveGrid1014',card:'.homeLiveCard1014[data-swapp-fair-proof]',
   label:'Accueil',mount:()=>document.getElementById('homeLiveTitle1014')?.parentElement},
  {key:'discover',root:'#discover',card:'#v4SwipeCard[data-swapp-fair-proof]',
   label:'Découvrir',mount:()=>document.querySelector('#discover .v4Controls')}
 ];
 const sessions=new Map();
 for(const p of placements)sessions.set(p.key,{active:false,button:null,observer:null,timers:new Map(),seen:new Set(),nodes:[],lastRoot:null});
 function resetWatch(s){
  s.observer?.disconnect();s.observer=null;
  for(const id of s.timers.values())clearTimeout(id);
  s.timers.clear();
 }
 function validCard(node){return !!node?.isConnected&&PROOF.test(node.dataset.swappFairProof||'')}
 function report(s,node,event){
  if(!s.active||!validCard(node)||document.visibilityState!=='visible')return;
  const proof=node.dataset.swappFairProof,which=proof+':'+event;
  if(s.seen.has(which)||s.seen.size>=24)return;
  s.seen.add(which);
  const fail=()=>{
   if(!s.active)return;
   s.active=false;resetWatch(s);
   if(s.button){s.button.setAttribute('aria-pressed','false');s.button.textContent='Mesure indisponible · Réessayer';}
  };
  void fetch('/api/discovery/fair-event',{
   method:'POST',credentials:'omit',keepalive:true,
   headers:{'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify({proof,event})
  }).then(response=>{if(!response.ok)fail()}).catch(fail);
 }
 function observe(s){
  resetWatch(s);
  if(!s.active||!('IntersectionObserver' in window))return;
  s.observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    const node=entry.target;
    const old=s.timers.get(node);
    if(old){clearTimeout(old);s.timers.delete(node)}
    if(entry.intersectionRatio<.5||document.visibilityState!=='visible')continue;
    s.timers.set(node,setTimeout(()=>{
     s.timers.delete(node);
     if(s.active&&document.visibilityState==='visible'&&node.getBoundingClientRect().width>0)
      report(s,node,'impression');
    },1250));
   }
  },{threshold:[0,.5,1]});
  for(const node of s.nodes)s.observer.observe(node);
 }
 function buttonFor(p,s,mount){
  if(!mount||!('IntersectionObserver' in window))return;
  let wrapper=mount.querySelector('[data-swapp-fair-v3="'+p.key+'"]');
  if(!wrapper){
   wrapper=document.createElement('span');wrapper.className='swapp-fair-v3-control';
   wrapper.dataset.swappFairV3=p.key;
   const button=document.createElement('button');
   button.type='button';button.className='swapp-fair-v3-button';
   button.setAttribute('aria-pressed',String(s.active));
   button.textContent=s.active?'Mesure volontaire activée · Désactiver':'Mesure équitable (facultatif)';
   button.title='Mesurer les cartes réellement vues, uniquement après ton accord, sans identifier les visiteurs.';
   const detail=document.createElement('small');detail.textContent='Volontaire · sans compte ni historique · cette page';
   wrapper.append(button,detail);
   button.addEventListener('click',()=>{
    s.active=!s.active;
    button.setAttribute('aria-pressed',String(s.active));
    button.textContent=s.active?'Mesure volontaire activée · Désactiver':'Mesure équitable (facultatif)';
    if(s.active)observe(s);else resetWatch(s);
   });
   mount.append(wrapper);
  }
  s.button=wrapper.querySelector('button');
 }
 function refresh(){
  for(const p of placements){
   const s=sessions.get(p.key),root=document.querySelector(p.root);
   // Each SPA route navigation ends opt-in for the previous screen.
   const view=p.key==='discover'?document.getElementById('discover'):document.getElementById('home');
   const inactive=view?.classList?.contains('view')&&!view.classList.contains('active');
   if(!root||inactive){
    if(s.active){s.active=false;resetWatch(s)}
    s.button=null;s.nodes=[];s.lastRoot=null;continue;
   }
   const nodes=[...root.querySelectorAll(p.card)].filter(validCard);
   const mount=p.mount();
   if(!nodes.length||!mount){
    resetWatch(s);
    s.nodes=[];s.button=null;continue;
   }
   buttonFor(p,s,mount);
   const current=s.nodes;
   if(current.length!==nodes.length||nodes.some((n,i)=>n!==current[i])){
    s.nodes=nodes;
    observe(s);
   }
   s.lastRoot=root;
  }
 }
 // A single delegated click handler; no listener attached to recycled cards.
 document.addEventListener('click',event=>{
  const target=event.target;
  if(!(target instanceof Element))return;
  const home=target.closest('#homeLiveGrid1014 .homeLiveCard1014[data-swapp-fair-proof]');
  if(home&&!target.closest('.homeNewsLink1014')){
   report(sessions.get('home'),home,'click');
   return;
  }
  const discover=document.querySelector('#discover #v4SwipeCard[data-swapp-fair-proof]');
  if(!discover)return;
  const see=target.closest('#discover .v4Actions .v4Btn.primary');
  if(see&&/voir/i.test(see.textContent||''))report(sessions.get('discover'),discover,'click');
 },true);
 document.addEventListener('visibilitychange',()=>{
  for(const s of sessions.values()){
   if(!s.active)continue;
   if(document.visibilityState==='visible')observe(s);else resetWatch(s);
  }
 });
 let scheduled=false;
 const schedule=()=>{
  if(scheduled)return;
  scheduled=true;
  (window.requestAnimationFrame||((f)=>f()))(()=>{scheduled=false;refresh()});
 };
 const install=()=>{
  if(!document.body)return;
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true});
  schedule();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
 else install();
})();
