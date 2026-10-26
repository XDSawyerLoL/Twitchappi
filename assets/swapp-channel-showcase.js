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
 // These menus render in a body-level layer. Opening a menu must not change
 // the banner, player, chat or action dock geometry, including on mobile.
 const activeMenus=new Set();
 function menu(label,cls){
  const details=make('details',cls);
  const summary=make('summary','swapp-showcase-summary',label);
  summary.setAttribute('aria-label',label);
  const content=make('div','swapp-showcase-menu-content');
  content.setAttribute('role','group');
  content.setAttribute('aria-label',label);
  details.append(summary,content);
  let floating=false;
  const position=()=>{
   if(!floating||!summary.isConnected)return;
   const rect=summary.getBoundingClientRect();
   const width=Math.min(268,Math.max(180,window.innerWidth-16));
   const height=Math.min(content.scrollHeight||280,420,window.innerHeight-24);
   const left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8));
   const above=rect.bottom+8+height>window.innerHeight && rect.top>height+12;
   const top=above?Math.max(8,rect.top-height-8):
    Math.max(8,Math.min(rect.bottom+8,window.innerHeight-Math.min(height,100)-8));
   content.style.left=left+'px';
   content.style.top=top+'px';
   content.style.width=width+'px';
   content.style.maxHeight=Math.max(100,window.innerHeight-top-8)+'px';
  };
  const onOutside=event=>{
   if(!details.contains(event.target)&&!content.contains(event.target))details.open=false;
  };
  const onKeys=event=>{if(event.key==='Escape'){details.open=false;summary.focus()}};
  const close=()=>{
   if(!floating)return;
   floating=false;activeMenus.delete(entry);
   document.removeEventListener('pointerdown',onOutside,true);
   document.removeEventListener('keydown',onKeys);
   window.removeEventListener('resize',position);
   window.removeEventListener('scroll',position,true);
   content.classList.remove('swapp-showcase-floating-menu');
   content.style.removeProperty('left');content.style.removeProperty('top');
   content.style.removeProperty('width');content.style.removeProperty('max-height');
   if(details.isConnected)details.append(content);
   else content.remove();
  };
  const entry={details,close};
  details.addEventListener('toggle',()=>{
   if(!details.open){close();return}
   if(floating||!details.isConnected)return;
   floating=true;activeMenus.add(entry);
   document.body.append(content);
   content.classList.add('swapp-showcase-floating-menu');
   position();
   document.addEventListener('pointerdown',onOutside,true);
   document.addEventListener('keydown',onKeys);
   window.addEventListener('resize',position);
   window.addEventListener('scroll',position,true);
  });
  // The original button callbacks still run. The menu closes afterwards.
  content.addEventListener('click',event=>{
   if(event.target.closest('button,a'))details.open=false;
  });
  return {details,content};
 }
 function ownerEdit(dock){
  let button=dock.querySelector('.swapp-studio-owner-edit');
  if(!button){
   button=make('button','btn secondary swapp-studio-owner-edit','Modifier le direct');
   button.type='button';
   button.dataset.swappLiveOwnerEdit='1';
   button.addEventListener('click',()=>globalThis.SwappBrowserStudio?.editLive?.());
  }
  // Always the first stable action, including before asynchronous owner tools.
  if(button.parentElement!==dock||dock.firstElementChild!==button)dock.prepend(button);
  return button;
 }
 function organizeActions(page){
  const dock=page.querySelector('.channelActionDock');
  if(!dock||dock.dataset.swappShowcaseOrganized==='1')return;
  const owner=page.dataset.channelOwner==='true';
  const fixed=owner?ownerEdit(dock):null;
  const group=menu(owner?'Gérer ma chaîne':'Plus',
   owner?'swapp-showcase-owner-menu':'swapp-showcase-visitor-menu');
  const eligible=node=>{
   if(node===group.details||node===fixed)return false;
   if(owner)return true;
   return !node.classList?.contains('swapp-channel-follow-btn')&&
    !node.classList?.contains('swapp-live-alert-bell')&&
    !String(node.getAttribute?.('onclick')||'').includes('followOryon');
  };
  // Place the menu once; thereafter late-added controls go INSIDE its
  // permanent content, never beside/before the fixed owner buttons.
  dock.append(group.details);
  const gather=()=>{
   if(!dock.isConnected)return;
   for(const node of Array.from(dock.children)){
    if(eligible(node))group.content.append(node);
   }
   // No empty Plus menu for viewers. Late actions reveal it automatically.
   if(!owner)group.details.hidden=group.content.childElementCount===0;
  };
  gather();
  dock.dataset.swappShowcaseOrganized='1';
  const observer=new MutationObserver(records=>{
   if(!page.isConnected){observer.disconnect();return}
   if(records.some(record=>record.addedNodes.length))gather();
  });
  observer.observe(dock,{childList:true});
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
  for(const item of activeMenus)if(!item.details.isConnected)item.close();
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
