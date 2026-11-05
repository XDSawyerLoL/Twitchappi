/* SWAPP PASSAGE — when the broadcaster REALLY ends, continue with a verified
 * streamer playing the same game. Does not touch HLS playback or Twitch iframe. */
(function(){
 'use strict';
 const TWITCH=/^[a-z0-9_]{2,25}$/,SWAPP=/^[a-z0-9_-]{2,40}$/;
 const POLL_MS=25000,COUNTDOWN=9;
 // Private to this tab: last 3 handoffs, no cookie, server-side history,
 // persistent profile or individual viewer tracking.
 const HISTORY_KEY='swapp-passage-tab-v2';
 function historyOf(){
  try{
   const rows=JSON.parse(sessionStorage.getItem(HISTORY_KEY)||'[]');
   return Array.isArray(rows)?rows.filter(x=>/^(swapp|twitch):[a-z0-9_-]{2,40}$/.test(x)).slice(-3):[];
  }catch{return []}
 }
 function remember(platform,login){
  try{
   const value=platform+':'+login;
   sessionStorage.setItem(HISTORY_KEY,JSON.stringify([...historyOf().filter(x=>x!==value),value].slice(-3)));
  }catch{}
 }
 async function recordArrival(){
  // Only a one-time proof from the destination page. Strip it from the URL.
  const url=new URL(location.href),token=url.searchParams.get('pass');
  if(!token||!/^[A-Za-z0-9_-]{30,360}\.[a-f0-9]{64}$/.test(token))return;
  url.searchParams.delete('pass');
  history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  try{
   await fetch('/api/swapp/passage/arrive',{
    method:'POST',cache:'no-store',credentials:'omit',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),
    signal:AbortSignal.timeout(7000)
   });
  }catch{}
 }
 const $=selector=>document.querySelector(selector);
 let active=null,stamp='',busy=false,clock=null,interval=null;
 function context(){
  const twitch=$('[data-swapp-handoff-platform="twitch"]');
  if(twitch){
   const login=String(twitch.dataset.swappHandoffLogin||'').toLowerCase();
   if(TWITCH.test(login))return {platform:'twitch',login,game:String(twitch.dataset.swappHandoffGame||'').slice(0,90),
    mount:twitch.querySelector('.swapp-watch-layout')||twitch};
  }
  const root=$('#channel');
  if(!root?.classList.contains('active'))return null;
  const page=root.querySelector('.creatorRefine.swapp-channel-polish');
  if(!page)return null;
  const match=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{2,40})\/?$/i);
  const login=String(page.dataset.channelLogin||match?.[1]||'').toLowerCase();
  if(!SWAPP.test(login))return null;
  return {platform:'swapp',login,game:String(page.dataset.liveCategory||page.dataset.streamCategory||'').slice(0,90),
   mount:page.querySelector('.channelLiveLayout')||page};
 }
 function removeNotice(){
  if(clock){clearInterval(clock);clock=null}
  active?.notice?.remove();
  if(active){active.notice=null;active.actions=null}
 }
 function reset(next){
  removeNotice();active=next?{...next,seenLive:false,offline:0,cancelled:false,game:next.game||'',notice:null}:null;
  stamp=next?next.platform+':'+next.login:'';
 }
 function box(tag,className,label){
  const e=document.createElement(tag);if(className)e.className=className;if(label!==undefined)e.textContent=label;return e;
 }
 function notice(){
  if(active.notice?.isConnected)return active.notice;
  const el=box('section','swapp-passage');
  el.setAttribute('aria-label','Relais automatique vers un autre direct');
  const label=box('span','swapp-passage-kicker','SWAPP PASSAGE / RELAIS DE DIRECT');
  const heading=box('strong','swapp-passage-title','Le direct est terminé.');
  const detail=box('p','swapp-passage-detail','Recherche d’un direct du même jeu…');
  detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
  const actions=box('div','swapp-passage-actions');
  el.append(label,heading,detail,actions);
  active.mount.insertAdjacentElement('afterend',el);
  active.notice=el;active.actions={heading,detail,actions};
  return el;
 }
 function validTarget(next){
  if(!next||!['swapp','twitch'].includes(next.platform))return false;
  const login=String(next.login||''),game=String(next.game||'');
  if(!(next.platform==='swapp'?SWAPP:TWITCH).test(login)||!game)return false;
  const expected=next.platform==='swapp'?'/'+encodeURIComponent(login)+'?handoff=1':
   '/live/twitch/'+encodeURIComponent(login)+'?game='+encodeURIComponent(active.game)+'&handoff=1';
  return next.url===expected;
 }
 async function request(state,commit=false){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
  try{
   const q=new URLSearchParams({platform:state.platform,login:state.login,
    game:state.game||'',exclude:historyOf().join(',')});
   if(commit)q.set('phase','commit');
   const response=await fetch('/api/swapp/live-handoff?'+q.toString(),{
    cache:'no-store',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}
   });
   if(!response.ok)throw Error('verification_unavailable');
   const data=await response.json();
   if(data?.success!==true||data?.current?.login!==state.login||
    data?.current?.platform!==state.platform||typeof data.current.live!=='boolean')throw Error('invalid_status');
   return data;
  }finally{clearTimeout(timeout)}
 }
 function gameFrom(data){
  const game=String(data?.current?.game||'').trim().slice(0,90);
  if(game.length>=2)active.game=game;
 }
 function clearStatus(){
  if(!active)return;
  active.offline=0;
  removeNotice();
 }
 async function go(next){
  if(!active||!validTarget(next)||active.cancelled)return;
  const saved=active,origin=stamp;
  if(document.visibilityState==='hidden')return;
  saved.actions.detail.textContent='Dernière vérification du relais…';
  try{
   const check=await request(saved,true);
   if(active!==saved||stamp!==origin||check.current.live){clearStatus();return}
   // Only move to a currently confirmed candidate for this exact game.
   gameFrom(check);
   if(!validTarget(check.next)){
    saved.actions.detail.textContent='Aucun autre créateur du même jeu n’est confirmé en direct.';
    saved.actions.actions.replaceChildren();
    return;
   }
   remember(saved.platform,saved.login);
   // Stay on SWAPP; the destination page confirms that it actually opened.
   const target=new URL(check.next.url,location.origin);
   if(typeof check.transfer_token==='string')target.searchParams.set('pass',check.transfer_token);
   location.assign(target.pathname+target.search);
  }catch(_){
   if(active===saved&&saved.actions){
    saved.actions.detail.textContent='Impossible de confirmer le nouveau direct. Le relais automatique est suspendu.';
    saved.actions.actions.replaceChildren();
   }
  }
 }
 function completed(data){
  if(!active||active.cancelled||!active.seenLive||active.notice?.isConnected||active.game.length<2)return;
  notice();
  const other=data.next&&validTarget(data.next)?data.next:null;
  if(!other){
   active.actions.heading.textContent='Le direct vient de se terminer.';
   active.actions.detail.textContent='Aucun autre live vérifié du même jeu pour le moment.';
   const tv=box('a','swapp-passage-skip','Explorer SWAPP TV');tv.href='/tv';
   active.actions.actions.append(tv);
   return;
  }
  let left=COUNTDOWN;
  active.actions.heading.textContent='Le direct est terminé. La partie continue.';
  const info=()=>{if(active?.actions)active.actions.detail.textContent='Prochain direct : '+
   other.name+' · '+active.game+' · passage dans '+left+' s.'};
  const jump=box('button','swapp-passage-go','Regarder maintenant');
  jump.type='button';jump.addEventListener('click',()=>{if(clock)clearInterval(clock);clock=null;void go(other)});
  const stay=box('button','swapp-passage-stay','Rester sur cette chaîne');
  stay.type='button';stay.addEventListener('click',()=>{if(active)active.cancelled=true;removeNotice()});
  active.actions.actions.append(jump,stay);
  info();
  clock=setInterval(()=>{
   if(!active||active.cancelled){clearInterval(clock);clock=null;return}
   if(document.visibilityState==='hidden')return;
   left--;if(left<=0){clearInterval(clock);clock=null;void go(other)}else info();
  },1000);
 }
 async function tick(){
  const ctx=context(),id=ctx?ctx.platform+':'+ctx.login:'';
  if(id!==stamp)reset(ctx);
  else if(active&&ctx){
   active.mount=ctx.mount;
   if(active.notice&&!active.notice.isConnected)removeNotice();
  }
  if(!ctx||!active||busy||document.visibilityState==='hidden')return;
  busy=true;
  const current=active;
  try{
   const data=await request(current);
   if(current!==active)return;
   if(data.current.live){
    current.seenLive=true;gameFrom(data);clearStatus();
   }else if(current.seenLive&&!current.cancelled){
    current.offline++;
    if(current.offline>=2)completed(data);
   }
  }catch(_){/* API failure is NOT evidence of an ended live. */}
  finally{busy=false}
 }
 function boot(){
  if(interval)return;
  interval=setInterval(()=>{void tick()},POLL_MS);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void tick()});
  window.addEventListener('popstate',()=>void tick());
  // SWAPP uses a SPA for native channels. Observe only the channel root,
  // never the live chat subtree, to avoid one network request per message.
  const channel=document.getElementById('channel');
  if(channel&&typeof MutationObserver==='function')
   new MutationObserver(()=>void tick()).observe(channel,{
    attributes:true,attributeFilter:['class'],childList:true,subtree:false
   });
  void recordArrival();
  void tick();
 }
 if(typeof module!=='undefined'&&module.exports){
  module.exports={validTarget:next=>{if(!active)active={game:''};return validTarget(next)},POLL_MS,COUNTDOWN};
  return;
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
})();