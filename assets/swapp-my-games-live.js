/* SWAPP / Mes jeux: real live sources, SWAPP-native first; no polling or third-party tracking. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document)api.mount(root.document,root);
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const aliases=[
  ['Grand Theft Auto VI','GTA 6','GTA6','GTA VI','Grand Theft Auto 6'],
  ['Planet Zoo 2','Planet Zoo II'],
  ['007 First Light','James Bond 007 First Light','007: First Light'],
  ['Assassin’s Creed Black Flag','Assassins Creed IV Black Flag','Assassin’s Creed IV: Black Flag','Assassin\'s Creed Black Flag'],
  ['Final Fantasy VII','Final Fantasy 7','FF7'],
  ['MARVEL Tōkon: Fighting Souls','Marvel Tokon Fighting Souls'],
  ['Divinity: Original Sin 3','Divinity Original Sin III'],
  ['Road 96','Road96']
 ].map(group=>group.map(normalize));
 const sameGame=(a,b)=>{
  const x=normalize(a),y=normalize(b);
  return !!x&&!!y&&(x===y||aliases.some(group=>group.includes(x)&&group.includes(y)));
 };
 const validGame=x=>x&&typeof x.slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.slug)&&x.slug.length<=90&&
  typeof x.game==='string'&&x.game.trim().length>=2&&x.game.length<=100;
 const native=x=>x.platform==='oryon'||x.platform==='swapp';
 const loginOK=x=>typeof x==='string'&&/^[a-z0-9_]{2,25}$/.test(x);
 const replay=x=>/\b(rediffusions?|replays?|reruns?|vods?|best[ -]?of)\b|en\s+boucle/.test(normalize(x));
 function checkedLives(payload,requested){
  if(!payload||payload.success!==true||!Array.isArray(payload.items)||!sameGame(payload.game,requested.game))
   throw Error('Réponse de découverte incompatible.');
  const result=[];
  for(const row of payload.items){
   if(!row||typeof row!=='object')continue;
   const platform=String(row.platform||'').toLowerCase(),login=String(row.login||'').toLowerCase();
   if(!['twitch','oryon','swapp'].includes(platform)||!loginOK(login)||!sameGame(requested.game,row.game_name||row.category||row.game)||replay(row.title))continue;
   result.push({
    platform,login,game:requested.game,slug:requested.slug,
    title:String(row.title||'Live en cours').slice(0,130),
    name:String(row.display_name||login).slice(0,70),
    thumbnail:String(row.thumbnail_url||'').slice(0,1400),
    viewers:Number.isFinite(Number(row.viewer_count))&&Number(row.viewer_count)>0?Math.floor(Number(row.viewer_count)):null
   });
  }
  return result;
 }
 function curateLiveRows(batches,max=8){
  const seen=new Set(),usedGames=new Map(),out=[];
  const streams=(Array.isArray(batches)?batches:[]).flat().filter(Boolean);
  streams.sort((a,b)=>Number(native(b))-Number(native(a))||(b.viewers||0)-(a.viewers||0));
  for(const item of streams){
   const key=item.platform+':'+item.login;
   if(seen.has(key)||(usedGames.get(item.slug)||0)>=3)continue;
   seen.add(key);usedGames.set(item.slug,(usedGames.get(item.slug)||0)+1);
   out.push(item);
   if(out.length>=max)break;
  }
  return out;
 }
 function mount(doc,env){
  const panel=doc.querySelector('[data-my-games-live]');
  if(!panel)return;
  const status=panel.querySelector('[data-my-games-live-status]');
  const results=panel.querySelector('[data-my-games-live-results]');
  const refresh=panel.querySelector('[data-my-games-live-refresh]');
  const more=panel.querySelector('[data-my-games-live-more]');
  if(!results||!status)return;
  let interests=[],visible=false,rotation=0,version=0,loading=false,lastSignature='';
  const label=message=>{status.textContent=message};
  const pill=(tag,name,cls,content)=>{
   const el=doc.createElement(tag);el.className=cls;el.textContent=content||'';
   return el;
  };
  const empty=message=>{results.replaceChildren();label(message)};
  const safeImage=src=>{
   try{
    const url=new env.URL(src);
    return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';
   }catch{return ''}
  };
  function liveCard(item){
   const article=pill('article',null,'mg-live-card');
   const image=pill('div',null,'mg-live-art');
   const src=safeImage(item.thumbnail);
   if(src){
    const img=doc.createElement('img');img.src=src;img.alt='';img.loading='lazy';
    img.decoding='async';image.append(img);
   }
   image.append(pill('span',null,'mg-live-source'+(native(item)?' mg-live-source-native':''),
    native(item)?'DIRECT SWAPP':'DIRECT TWITCH'));
   const content=pill('div',null,'mg-live-content');
   content.append(pill('span',null,'mg-live-game',item.game));
   content.append(pill('strong',null,'mg-live-title',item.title));
   const meta=pill('p',null,'mg-live-meta',item.name+(item.viewers!==null?' · '+item.viewers.toLocaleString('fr-FR')+' spectateurs':''));
   content.append(meta);
   const actions=pill('div',null,'mg-live-links');
   const watch=doc.createElement('a');watch.className='mg-live-watch';
   watch.href=native(item)?'/'+encodeURIComponent(item.login):
    '/live/twitch/'+encodeURIComponent(item.login)+'?game='+encodeURIComponent(item.game);
   watch.textContent='Regarder sur SWAPP ↗';
   const social=doc.createElement('a');social.href='/communaute?game='+encodeURIComponent(item.game);
   social.textContent='Salons du jeu';
   const dossier=doc.createElement('a');dossier.href='/jeux/'+encodeURIComponent(item.slug);
   dossier.textContent='Dossier';
   actions.append(watch,social,dossier);content.append(actions);
   article.append(image,content);
   return article;
  }
  async function fetchVerified(game){
   const controller=typeof env.AbortController==='function'?new env.AbortController():null;
   const timer=controller&&typeof env.setTimeout==='function'?env.setTimeout(()=>controller.abort(),11000):null;
   try{
    const res=await env.fetch('/api/discovery/game-lives?limit=8&game='+encodeURIComponent(game.game),{
     credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},
     ...(controller?{signal:controller.signal}:{})
    });
    if(!res.ok)throw Error('Live indisponible');
    return checkedLives(await res.json(),game);
   }finally{if(timer!==null&&typeof env.clearTimeout==='function')env.clearTimeout(timer)}
  }
  async function load(force=false){
   if(!visible)return;
   const slice=interests.slice(rotation,rotation+4);
   const signature=slice.map(x=>x.slug).join('|');
   if(!slice.length){lastSignature='';empty('Aucun jeu choisi. Suis un jeu ou ajoute-le à tes envies.');return}
   if(!force&&signature===lastSignature)return;
   lastSignature=signature;
   const rev=++version;
   loading=true;
   if(refresh)refresh.disabled=true;
   if(more)more.disabled=true;
   results.replaceChildren();
   label('Recherche des directs vérifiés pour '+slice.map(x=>x.game).join(', ')+'…');
   const settled=await Promise.allSettled(slice.map(fetchVerified));
   if(rev!==version)return;
   loading=false;
   if(refresh)refresh.disabled=false;
   if(more)more.disabled=false;
   const succeeded=settled.filter(x=>x.status==='fulfilled').length;
   const rows=curateLiveRows(settled.filter(x=>x.status==='fulfilled').map(x=>x.value));
   results.replaceChildren(...rows.map(liveCard));
   const nativeCount=rows.filter(native).length,twitchCount=rows.length-nativeCount;
   if(!succeeded){
    lastSignature='';
    label('Les directs sont indisponibles pour le moment. Utilise « Actualiser les directs » pour réessayer.');
   }else if(!rows.length){
    label('Aucun direct confirmé pour ces '+slice.length+' jeux actuellement.'+
     (succeeded<slice.length?' Certaines sources sont indisponibles.':''));
   }else{
    label(rows.length+' direct'+(rows.length>1?'s':'')+' confirmé'+(rows.length>1?'s':'')+
     ' · '+nativeCount+' SWAPP · '+twitchCount+' Twitch.'+
     (succeeded<slice.length?' Certains jeux restent indisponibles.':''));
   }
  }
  function displayInterests(next){
   const valid=[],seen=new Set();
   for(const row of Array.isArray(next)?next:[]){
    if(!validGame(row)||seen.has(row.slug))continue;
    valid.push({slug:row.slug,game:row.game.trim()});
    seen.add(row.slug);
    if(valid.length>=30)break;
   }
   const old=interests.map(x=>x.slug).join('|'),fresh=valid.map(x=>x.slug).join('|');
   interests=valid;
   if(more)more.hidden=interests.length<=4;
   if(fresh!==old){rotation=0;lastSignature='';if(visible)void load();}
   if(!interests.length)empty('Aucun jeu choisi. Suis un jeu ou ajoute-le à tes envies.');
   else if(!visible)label('Les directs seront recherchés quand tu ouvriras cette section.');
  }
  env.addEventListener('swapp:game-interests',event=>displayInterests(event.detail?.games));
  refresh?.addEventListener('click',()=>{visible=true;if(!loading)void load(true)});
  more?.addEventListener('click',()=>{
   if(loading||interests.length<=4)return;
   rotation=(rotation+4)%interests.length;
   lastSignature='';visible=true;void load();
  });
  if(typeof env.IntersectionObserver==='function'){
   const observer=new env.IntersectionObserver(entries=>{
    if(entries.some(x=>x.isIntersecting)){
     observer.disconnect();visible=true;void load();
    }
   },{rootMargin:'340px 0px'});
   observer.observe(panel);
  }else{visible=true}
  // The publisher script boots immediately after this module and broadcasts
  // the already chosen local/consented-account games and wishlist interests.
  if(!visible)label('Les directs seront recherchés à l’ouverture de la section.');
 }
 return Object.freeze({sameGame,checkedLives,curateLiveRows,mount});
});