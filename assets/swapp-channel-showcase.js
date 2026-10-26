/* SWAPP Channel Showcase v1 — visual hierarchy and useful offline context.
   Never changes/relocates .channelMainPlayer, its iframe, the chat or OBS.
   All creator controls retain their original click handlers. */
(function(){
 'use strict';
 const root=document.getElementById('channel');
 if(!root)return;
 const make=(tag,cls,value)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(value!==undefined)node.textContent=value;
  return node;
 };
 const validLogin=value=>/^[a-z0-9_-]{2,48}$/.test(value);
 function loginFor(page){
  const candidate=String(page?.dataset?.channelLogin||'').trim().toLowerCase();
  if(validLogin(candidate))return candidate;
  const found=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,48})\/?$/i);
  return found?found[1].toLowerCase():'';
 }
 function menu(label,cls){
  const details=make('details',cls);
  const summary=make('summary','swapp-showcase-summary',label);
  summary.setAttribute('aria-label',label);
  const content=make('div','swapp-showcase-menu-content');
  details.append(summary,content);
  return {details,content};
 }
 function organizeActions(page){
  const dock=page.querySelector('.channelActionDock');
  if(!dock||dock.dataset.swappShowcaseOrganized==='1')return;
  const owner=page.dataset.channelOwner==='true';
  if(owner){
   const actions=Array.from(dock.children);
   if(!actions.length)return;
   const group=menu('Gérer ma chaîne','swapp-showcase-owner-menu');
   // Move actual DOM nodes, never copy their HTML or break their onclick.
   actions.forEach(node=>group.content.append(node));
   dock.append(group.details);
  }else{
   // Native Follow and the independently managed Push bell stay exposed.
   // Every other available action remains functional in the secondary menu.
   const items=Array.from(dock.children).filter(node=>
    !node.classList?.contains('swapp-channel-follow-btn') &&
    !node.classList?.contains('swapp-live-alert-bell') &&
    !String(node.getAttribute?.('onclick')||'').includes('followOryon')
   );
   if(items.length){
    const group=menu('Plus','swapp-showcase-visitor-menu');
    items.forEach(node=>group.content.append(node));
    dock.append(group.details);
   }
  }
  dock.dataset.swappShowcaseOrganized='1';
 }
 const monthKey=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
 const pretty=date=>new Intl.DateTimeFormat('fr-FR',{
  weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'
 }).format(date);
 function drawUpcoming(page,event,login){
  const layout=page.querySelector('.channelLiveLayout');
  if(!layout||page.dataset.channelLive!=='false')return;
  const old=page.querySelector('.swapp-showcase-upcoming');
  old?.remove();
  const section=make('section','swapp-showcase-upcoming');
  section.dataset.swappShowcaseUpcoming='1';
  section.setAttribute('aria-label','Prochain direct');
  const icon=make('span','swapp-showcase-calendar-icon','◷');
  icon.setAttribute('aria-hidden','true');
  const copy=make('div','swapp-showcase-next-copy');
  copy.append(make('span','swapp-showcase-kicker','PROCHAIN RENDEZ-VOUS'));
  if(event){
   copy.append(make('strong','swapp-showcase-event-title',String(event.title||'Direct prévu').slice(0,120)));
   const date=new Date(event.start_at);
   if(Number.isFinite(date.getTime())){
    const line=make('time','swapp-showcase-event-date',pretty(date));
    line.dateTime=event.start_at;copy.append(line);
   }
   if(event.game)copy.append(make('span','swapp-showcase-event-game',String(event.game).slice(0,60)));
  }else{
   copy.append(make('strong','swapp-showcase-event-title','Aucun direct annoncé'));
   copy.append(make('span','swapp-showcase-event-date','Consulte le programme pour les prochaines dates.'));
  }
  const link=make('a','swapp-showcase-calendar-link','Voir l’agenda');
  link.href='/'+encodeURIComponent(login)+'?tab=programme';
  link.addEventListener('click',event=>{
   // SPA captures in-page links; opening the native programme tab is reliable.
   // Fall back to a real URL when the channel tab is not mounted yet.
   event.preventDefault();
   const channel=document.getElementById('channel');
   const sameChannel=channel?.classList.contains('active')&&
    page.isConnected&&loginFor(page)===login;
   const tab=sameChannel?channel.querySelector('[data-swapp-programme-tab]'):null;
   if(tab?.isConnected){
    tab.click();
    const agenda=channel.querySelector('[data-swapp-programme-page]');
    agenda?.scrollIntoView({behavior:'smooth',block:'start'});
   }else window.location.assign(link.href);
  });
  section.append(icon,copy,link);
  layout.after(section);
 }
 async function nextEvent(page,login){
  if(!validLogin(login)||page.dataset.channelLive!=='false')return;
  const now=new Date();
  const month=new Date(now.getFullYear(),now.getMonth(),1);
  const upcoming=[];
  let completed=0;
  for(let i=0;i<2;i++){
   const d=new Date(month.getFullYear(),month.getMonth()+i,1);
   const address='/api/swapp/channel/'+encodeURIComponent(login)+'/programme?month='+monthKey(d);
   try{
    const response=await fetch(address,{credentials:'same-origin',cache:'no-store',
     headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
    if(!response.ok)continue;
    const payload=await response.json();
    if(!payload?.success||!Array.isArray(payload.items))continue;
    completed++;
    for(const event of payload.items){
     const timestamp=Date.parse(event.start_at||'');
     if(Number.isFinite(timestamp)&&timestamp>=Date.now()-5*60000)upcoming.push(event);
    }
   }catch(_){/* do not block the channel or show fabricated dates */}
  }
  if(!page.isConnected||page.dataset.channelLive!=='false'||completed===0)return;
  upcoming.sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
  drawUpcoming(page,upcoming[0]||null,login);
 }
 function enhance(page){
  if(!page||page.dataset.swappShowcaseReady==='1')return;
  // This flag is intentionally set before any DOM mutations.
  page.dataset.swappShowcaseReady='1';
  organizeActions(page);
  const login=loginFor(page);
  if(login&&page.dataset.channelLive==='false')void nextEvent(page,login);
 }
 function scan(){
  if(!root.classList.contains('active'))return;
  root.querySelectorAll('.creatorRefine.swapp-channel-polish').forEach(enhance);
 }
 let queued=false;
 const schedule=()=>{
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;scan()});
 };
 // SPA replaces the page as a direct child of #channel; do not observe chat,
 // media events or agenda mutations that previously caused duplicate tabs.
 new MutationObserver(schedule).observe(root,{childList:true});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
 else schedule();
})();
