/* SWAPP MARATHON: editorial games + already VERIFIED live streams + real
 * Spotlight appointments. No new booking system or invented events. */
(()=>{'use strict';
 const root=document.getElementById('swapp-marathon');if(!root)return;
 const select=root.querySelector('#sm-game'),status=root.querySelector('#sm-status');
 const live=root.querySelector('#sm-live'),programme=root.querySelector('#sm-program');
 const login=x=>/^[a-z0-9_]{2,25}$/.test(String(x||'').toLowerCase());
 const native=x=>/^[a-z0-9_-]{2,32}$/.test(String(x||'').toLowerCase());
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const item=(tag,text,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const error=message=>{const e=item('p',message,'sco-empty');return e};
 async function json(url){
  const ctl=new AbortController(),id=setTimeout(()=>ctl.abort(),9500);
  try{
   const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:ctl.signal,headers:{Accept:'application/json'}});
   if(!r.ok)throw Error('HTTP '+r.status);
   const data=await r.json();if(data?.success===false)throw Error('unavailable');
   return data;
  }finally{clearTimeout(id)}
 }
 const gameOf=a=>typeof a?.game==='string'?a.game.trim():String(a?.game?.name||a?.game?.title||'').trim();
 let nativeRows=[],request=0,current='';
 const date=iso=>{
  const d=new Date(iso);
  return Number.isFinite(d.getTime())?d.toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}):'';
 };
 function row(title,desc,href,cta){
  const node=item('article',undefined,'sco-item'),main=item('div',undefined,'sco-item-main');
  main.append(item('strong',title),item('small',desc));node.append(main);
  if(href){const link=item('a',cta||'Regarder');link.href=href;node.append(link)}
  return node;
 }
 function validatedNative(game){
  const seen=new Set(),selected=[];
  for(const x of nativeRows){
   const user=String(x?.login||'').toLowerCase();
   if(x?.platform!=='swapp'||x?.media!=='hls'||x?.media_verified!==true||!native(user)||
    x.player_url!=='/api/oryon/local-relay/'+encodeURIComponent(user)+'/player'||
    norm(x.game)!==norm(game)||seen.has(user))continue;
   seen.add(user);selected.push({platform:'swapp',login:user,display_name:x.display_name||user,game:x.game});
  }
  return selected;
 }
 function validatedTwitch(data){
  const found=[],seen=new Set();
  for(const x of Array.isArray(data?.items)?data.items:[]){
   const user=String(x?.login||'').toLowerCase();
   if(x.platform!=='twitch'||!login(user)||seen.has(user))continue;
   seen.add(user);
   found.push({platform:'twitch',login:user,display_name:String(x.display_name||user).slice(0,70)});
  }
  return found;
 }
 async function render(){
  const game=String(select.value||'').trim();current=game;const id=++request;
  live.replaceChildren();programme.replaceChildren();
  if(!game){status.textContent='Aucun jeu disponible pour le moment.';return}
  status.textContent='Mise à jour des directs et créneaux…';
  const [verified,times,natives]=await Promise.allSettled([
   json('/api/discovery/game-lives?game='+encodeURIComponent(game)+'&limit=12'),
   json('/api/creator/spotlight?game='+encodeURIComponent(game)),
   json('/api/swapp-tv/native-lineup')
  ]);
  if(id!==request||current!==select.value)return;
  if(natives.status==='fulfilled'&&natives.value?.success===true&&Array.isArray(natives.value.items))
   nativeRows=natives.value.items;
  const candidates=[...validatedNative(game),...(verified.status==='fulfilled'?validatedTwitch(verified.value):[])];
  const shown=new Set();
  for(const x of candidates){
   const key=x.platform+':'+x.login;if(shown.has(key))continue;shown.add(key);
   const href=x.platform==='swapp'?'/'+encodeURIComponent(x.login):
    '/live/twitch/'+encodeURIComponent(x.login)+'?game='+encodeURIComponent(game);
   live.append(row(x.display_name,x.platform==='swapp'?'Direct natif SWAPP vérifié':'Direct Twitch sur '+game,
    href,'Regarder'));
   if(shown.size>=6)break;
  }
  if(!shown.size)live.append(error(verified.status==='rejected'&&natives.status==='rejected'?
   'Vérification des directs indisponible.':'Aucun direct vérifié de ce jeu pour le moment.'));
  const bookings=times.status==='fulfilled'&&Array.isArray(times.value.items)?
   times.value.items.filter(x=>x.status==='reserved'&&Date.parse(x.end_at)>Date.now()):[];
  const unique=new Set();
  for(const booking of bookings.slice(0,8)){
   if(unique.has(booking.id))continue;unique.add(booking.id);
   const who=String(booking.creator_login||booking.twitch_login||'Créateur').slice(0,70);
   const active=booking.live?.state==='live_verified';
   const href=active&&login(booking.twitch_login)?
    '/live/twitch/'+encodeURIComponent(booking.twitch_login)+'?game='+encodeURIComponent(game):'';
   programme.append(row(who,date(booking.start_at)+' · '+(active?'Direct vérifié':'Créneau réservé'),href,
    'Regarder'));
  }
  if(!bookings.length)programme.append(error(times.status==='rejected'?
   'Le calendrier Spotlight est indisponible ou désactivé.':'Aucun créneau confirmé pour ce jeu.'));
  status.textContent=shown.size+' direct'+(shown.size>1?'s':'')+' vérifié'+(shown.size>1?'s':'')+
   ' · '+bookings.length+' rendez-vous annoncé'+(bookings.length>1?'s':'');
 }
 async function init(){
  const [news,natives]=await Promise.allSettled([json('/api/actus'),json('/api/swapp-tv/native-lineup')]);
  const games=new Map();
  const add=g=>{if(typeof g!=='string'||g.trim().length<2)return;
   const value=g.trim().slice(0,90),key=norm(value);if(key&&!games.has(key))games.set(key,value)};
  if(news.status==='fulfilled')for(const a of Array.isArray(news.value.articles)?news.value.articles:[])
   if(a?.slug&&a.status!=='draft')add(gameOf(a));
  if(natives.status==='fulfilled'&&Array.isArray(natives.value.items)){
   nativeRows=natives.value.items;
   for(const s of nativeRows)if(s.media_verified===true&&s.platform==='swapp')add(s.game);
  }
  const choices=[...games.values()].sort((a,b)=>a.localeCompare(b,'fr')).slice(0,60);
  select.replaceChildren();
  for(const game of choices){const option=item('option',game);option.value=game;select.append(option)}
  if(!choices.length){const o=item('option','Aucun jeu disponible');o.value='';select.append(o);return render()}
  const requested=new URLSearchParams(location.search).get('jeu');
  if(requested){const match=choices.find(x=>norm(x)===norm(requested));if(match)select.value=match}
  await render();
 }
 select.addEventListener('change',()=>{const params=new URLSearchParams(location.search);
  if(select.value)params.set('jeu',select.value);else params.delete('jeu');
  history.replaceState(history.state,'',location.pathname+(params.toString()?'?'+params:''));
  void render();
 });
 setInterval(()=>{if(document.visibilityState==='visible'&&select.value)void render()},60000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&select.value)void render()});
 void init().catch(()=>{status.textContent='Le marathon est temporairement indisponible.'});
})();