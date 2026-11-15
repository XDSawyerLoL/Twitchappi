/* SWAPP Explorer — only real category and currently confirmed live inventory.
 * No fictional streamers, audiences, images or social relationships.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document)api.mount(root);
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const ORIGIN='https://swapp.tv';
 const GENRES_FALLBACK=[];
 const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const slug=s=>normal(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
 const clean=s=>String(s||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,110);
 const validLogin=(s,swapp)=>swapp?/^[a-z0-9_][a-z0-9_-]{1,39}$/.test(s):/^[a-z0-9_]{2,25}$/.test(s);
 const getGenre=()=>typeof window!=='undefined'&&window.SwappGenreDiscovery;
 function picture(value,w=720,h=960){
  try{
   const source=String(value||'').replaceAll('{width}',String(w)).replaceAll('{height}',String(h));
   const uri=new URL(source);
   if(uri.protocol!=='https:'||uri.username||uri.password)return '';
   const host=uri.hostname.toLowerCase();
   if(!['static-cdn.jtvnw.net','images.igdb.com','swapp.tv','www.swapp.tv'].includes(host)&&
      !host.endsWith('.jtvnw.net')&&!host.endsWith('.twitchcdn.net'))return '';
   if(host==='static-cdn.jtvnw.net'&&uri.pathname.startsWith('/ttv-boxart/'))
    uri.pathname=uri.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.(?:png|jpe?g|webp)$)/i,'-'+w+'x'+h);
   return uri.href;
  }catch{return ''}
 }
 function game(raw,genreForGame){
  const name=clean(raw?.name||raw?.game_name);
  const id=slug(name),genre=genreForGame(name);
  if(!id||!genre||['just-chatting','music','asmr','irl'].includes(id))return null;
  return {kind:'game',id:'game:'+id,slug:id,name,genre,cover:picture(raw.box_art_url||raw.thumbnail_url)};
 }
 function live(raw,defaultPlatform,genreForGame){
  const source=normal(raw?.platform||defaultPlatform);
  const swapp=['swapp','oryon','native'].includes(source);
  const platform=swapp?'swapp':'twitch';
  const login=String(raw?.login||raw?.user_login||raw?.host_login||raw?.room||'').trim().toLowerCase();
  if(!validLogin(login,swapp))return null;
  const name=clean(raw?.user_name||raw?.display_name||raw?.host_name||login)||login;
  const title=clean(raw?.title)||'Direct en cours';
  const gameName=clean(raw?.game_name||raw?.category||raw?.game);
  const viewers=raw?.viewer_count??raw?.viewers;
  const count=(typeof viewers==='number'&&Number.isSafeInteger(viewers)&&viewers>=0)?viewers:
   (typeof viewers==='string'&&/^(0|[1-9]\d*)$/.test(viewers)&&Number.isSafeInteger(Number(viewers)))?Number(viewers):null;
  return {kind:'creator',id:platform+':'+login,login,name,title,game:gameName,slug:slug(gameName),
   genre:genreForGame(gameName),platform,cover:picture(raw?.thumbnail_url||raw?.img||raw?.banner_url,960,540),
   viewers:count,watchUrl:swapp?'/'+encodeURIComponent(login):'/live/twitch/'+encodeURIComponent(login)};
 }
 function mergeGames(current,extra){
  const map=new Map();
  for(const item of [...current,...extra])if(item?.slug&&!map.has(item.slug))map.set(item.slug,item);
  return [...map.values()];
 }
 function mergeLives(current,extra){
  const map=new Map();
  for(const item of [...current,...extra])if(item?.id&&!map.has(item.id))map.set(item.id,item);
  return [...map.values()];
 }
 function collections(games,lives,allGenres){
  const source=[...games,...lives];
  return allGenres.map(g=>{
   const titles=games.filter(x=>x.genre===g.id);
   const airing=lives.filter(x=>x.genre===g.id);
   // Real, distinct artworks for each collection (no repeated placeholder).
   const covers=[...new Set(titles.map(x=>x.cover).filter(Boolean))].slice(0,4);
   if(!covers.length)covers.push(...[...new Set(airing.map(x=>x.cover).filter(Boolean))].slice(0,4));
   return {...g,games:titles,lives:airing,cover:covers[0]||'',covers,
    gameCount:titles.length,liveCount:airing.length};
  }).filter(g=>g.gameCount||g.liveCount)
   .sort((a,b)=>b.liveCount-a.liveCount||b.gameCount-a.gameCount||a.label.localeCompare(b.label,'fr'));
 }
 const elt=(doc,tag,cls,text)=>{
  const e=doc.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;
 };
 function image(doc,url,alt){
  const e=elt(doc,'img');e.src=url;e.alt=alt||'';e.loading='lazy';e.decoding='async';
  e.referrerPolicy='no-referrer';return e;
 }
 function collectionArtwork(doc,group){
  const art=elt(doc,'span','sx-collection-art');
  art.setAttribute('aria-hidden','true');
  (group.covers||[]).slice(0,4).forEach((cover,i)=>{
   const frame=elt(doc,'span','sx-collection-frame sx-collection-frame-'+(i+1));
   const img=image(doc,cover,'');
   img.addEventListener('error',()=>frame.remove(),{once:true});
   frame.append(img);art.append(frame);
  });
  return art;
 }
 function makeCollectionCard(doc,group){
  const card=elt(doc,'a','sx-collection'+(group.cover?'':' sx-collection-empty'));
  card.href='/explorer/collections/'+encodeURIComponent(group.id);
  if(group.cover)card.append(collectionArtwork(doc,group));
  const copy=elt(doc,'span','sx-collection-copy');
  copy.append(elt(doc,'span','sx-collection-label','COLLECTION DE JEUX'));
  copy.append(elt(doc,'strong','',group.label));
  copy.append(elt(doc,'p','',group.description));
  copy.append(elt(doc,'span','sx-collection-count',
   group.gameCount+' jeu'+(group.gameCount>1?'x':'')+' · '+group.liveCount+' direct'+(group.liveCount>1?'s':'')));
  copy.append(elt(doc,'span','sx-collection-action','Découvrir la collection →'));
  card.append(copy);
  return card;
 }
 function makeGameCard(doc,item){
  const a=elt(doc,'a','sx-game');
  a.href='/explorer/carte?jeu='+encodeURIComponent(item.slug);
  if(item.cover){const art=image(doc,item.cover,'');art.addEventListener('error',()=>art.replaceWith(elt(doc,'span','sx-game-art',item.name)),{once:true});a.append(art)}
  else a.append(elt(doc,'span','sx-game-art',item.name));
  a.append(elt(doc,'span','',item.name));return a;
 }
 function makeLiveCard(doc,item){
  const a=elt(doc,'a','sx-live');a.href=item.watchUrl;
  if(item.cover){const img=image(doc,item.cover,'');img.addEventListener('error',()=>img.remove(),{once:true});a.append(img)}
  const copy=elt(doc,'span','sx-live-copy');copy.append(elt(doc,'strong','',item.name));
  copy.append(elt(doc,'small','',item.game+(item.viewers===null?' · Audience indisponible':' · '+item.viewers.toLocaleString('fr-FR')+' spectateurs')));
  a.append(copy);return a;
 }
 function graphModel(games,lives,focusSlug,genreForGame,limit=12){
  const focus=games.find(g=>g.slug===focusSlug);
  if(!focus)return {nodes:[],edges:[],focus:null};
  const focusLives=lives.filter(x=>x.slug===focus.slug).slice(0,limit);
  const peers=games.filter(x=>x.genre===focus.genre&&x.slug!==focus.slug&&
   lives.some(l=>l.slug===x.slug)).slice(0,4);
  const nodes=[{id:'focus:'+focus.slug,kind:'game',name:focus.name,item:focus,x:500,y:295}];
  const edges=[];
  const genre=genreForGame(focus.name);
  if(genre){
   nodes.push({id:'genre:'+genre,kind:'genre',name:genre,item:{genre},x:500,y:75});
   edges.push({from:'focus:'+focus.slug,to:'genre:'+genre,kind:'genre'});
  }
  peers.forEach((x,i)=>{
   const pos=[[175,135],[345,155],[655,155],[825,135]][i];
   nodes.push({id:'peer:'+x.slug,kind:'game',name:x.name,item:x,x:pos[0],y:pos[1]});
   if(genre)edges.push({from:'genre:'+genre,to:'peer:'+x.slug,kind:'genre'});
  });
  focusLives.forEach((item,i)=>{
   const total=focusLives.length;
   const angle=Math.PI*(.06+(i+.5)/Math.max(total,1)*.88);
   // Lower hemisphere, positioned from left to right.
   const x=500+380*Math.cos(angle),y=285+230*Math.sin(angle);
   nodes.push({id:'creator:'+item.id,kind:'creator',name:item.name,item,x,y});
   edges.push({from:'focus:'+focus.slug,to:'creator:'+item.id,kind:'live'});
  });
  return {nodes,edges,focus};
 }
 function mount(win){
  const doc=win.document,root=doc.getElementById('swapp-explorer');
  if(!root||root.dataset.mounted==='1')return;
  root.dataset.mounted='1';
  const $=id=>doc.getElementById(id);
  const genreApi=getGenre(),genreForGame=genreApi?.genreForGame||(()=>''),allGenres=genreApi?.GENRES||GENRES_FALLBACK;
  const initialGenre=root.dataset.genre||'';
  const isChart=root.dataset.view==='carte';
  const state={games:[],lives:[],loading:false,partial:false,query:'',error:false,focus:null};
  const errorLine=$('sx-feedback');
  const hasQuery=s=>!state.query||normal(s).includes(normal(state.query));
  function updateFeedback(message){errorLine.textContent=message||''}
  async function request(uri){
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),11000);
   try{
    const res=await fetch(uri,{credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'});
    if(!res.ok)throw Error('HTTP '+res.status);
    const result=await res.json();
    if(result?.success!==true)throw Error('Catalogue indisponible');
    return result;
   }finally{clearTimeout(timeout)}
  }
  async function fetchGames(){
   const accumulated=[],seen=new Set();let cursor='';
   for(let i=0;i<2;i++){
    const url=new URL('/api/categories/top?limit=180',win.location.origin);
    if(cursor)url.searchParams.set('cursor',cursor);
    const result=await request(url.pathname+url.search);
    accumulated.push(...(Array.isArray(result.categories)?result.categories:[]));
    const next=String(result.cursor||'');
    if(!next||seen.has(next))break;
    seen.add(next);cursor=next;
   }
   return accumulated.map(x=>game(x,genreForGame)).filter(Boolean);
  }
  async function fetchLives(uri,source){
   const res=await request(uri);
   if(!Array.isArray(res.items))throw Error('Directs indisponibles');
   return res.items.map(x=>live(x,source,genreForGame)).filter(Boolean);
  }
  async function enrichGenre(genre){
   if(!genre||!allGenres.some(g=>g.id===genre))return;
   try{
    const r=await request('/api/categories/genre?genre='+encodeURIComponent(genre));
    const extra=(r.categories||[]).map(x=>game(x,genreForGame)).filter(x=>x?.genre===genre);
    state.games=mergeGames(state.games,extra);
   }catch{ /* Keep previously confirmed inventory without inventing covers. */ }
  }
  function renderDetail(){
   const detail=$('sx-collection-detail'),grid=$('sx-collection-grid');
   const heading=$('sx-collections-heading')?.closest('.sx-section-title');
   if(heading)heading.hidden=Boolean(initialGenre);
   if(!initialGenre){detail.hidden=true;grid.hidden=false;return}
   const group=collections(state.games,state.lives,allGenres).find(x=>x.id===initialGenre);
   grid.hidden=true;detail.hidden=false;
   const label=allGenres.find(x=>x.id===initialGenre);
   $('sx-detail-title').textContent=label?.label||'Collection indisponible';
   $('sx-detail-subtitle').textContent=label?.description||'';
   const visual=$('sx-detail-visual');
   visual?.replaceChildren();
   if(group?.cover)visual?.append(collectionArtwork(doc,group));
   else if(visual)visual.append(elt(doc,'span','sx-detail-visual-empty','SWAPP · '+(label?.label||'COLLECTION')));
   const games=$('sx-detail-games'),lives=$('sx-detail-lives');
   const titles=(group?.games||[]).filter(g=>hasQuery(g.name));
   const current=(group?.lives||[]).filter(l=>hasQuery(l.name+' '+l.game));
   games.replaceChildren(...titles.map(x=>makeGameCard(doc,x)));
   lives.replaceChildren(...current.map(x=>makeLiveCard(doc,x)));
   if(!titles.length)games.append(elt(doc,'p','sx-empty','Aucun jeu confirmé pour cette recherche.'));
   if(!current.length)lives.append(elt(doc,'p','sx-empty','Aucun créateur confirmé en direct pour cette sélection.'));
   $('sx-count').textContent=titles.length+' jeux · '+current.length+' directs';
  }
  function renderCollections(){
   const host=$('sx-collection-grid');
   const groups=collections(state.games,state.lives,allGenres).filter(group=>hasQuery(group.label+' '+group.description)||
      group.games.some(g=>hasQuery(g.name))||group.lives.some(l=>hasQuery(l.name)));
   // The featured collection is not repeated in the regular gallery.
   host.replaceChildren(...groups.slice(initialGenre?0:1).map(g=>makeCollectionCard(doc,g)));
   const featured=$('sx-featured-collection');
   if(featured){
    featured.replaceChildren();
    // Only highlight a group with actual inventory.
    if(groups.length&&!initialGenre){
     const card=makeCollectionCard(doc,groups[0]);
     card.classList.add('sx-collection-featured');
     card.querySelector('.sx-collection-label').textContent='À LA UNE · COLLECTION ACTIVE';
     featured.append(card);featured.hidden=false;
    }else featured.hidden=true;
   }
   if(!groups.length)host.append(elt(doc,'p','sx-empty','Aucune collection confirmée pour cette recherche.'));
   $('sx-count').textContent=groups.length+' collections · '+state.games.length+' jeux · '+state.lives.length+' directs';
   renderDetail();
  }
  function inspect(node){
   const inspector=$('sx-inspector');inspector.replaceChildren();
   inspector.append(elt(doc,'p','sx-eyebrow',node.kind==='creator'?'CRÉATEUR EN DIRECT':node.kind==='game'?'UNIVERS DE JEU':'GENRE'));
   const item=node.item;
   if(node.kind==='creator'&&item.cover)inspector.append(image(doc,item.cover,''));
   if(node.kind==='creator'&&item.cover)inspector.querySelector('img').className='sx-inspector-art';
   inspector.append(elt(doc,'h3','',node.name));
   if(node.kind==='creator'){
    inspector.append(elt(doc,'p','',item.title));
    inspector.append(elt(doc,'p','',item.game+' · '+(item.viewers===null?'Audience indisponible':item.viewers.toLocaleString('fr-FR')+' spectateurs')));
    const a=elt(doc,'a','', 'Regarder le direct');a.href=item.watchUrl;inspector.append(a);
   }else if(node.kind==='game'){
    const count=state.lives.filter(x=>x.slug===item.slug).length;
    inspector.append(elt(doc,'p','',count+' créateur'+(count>1?'s':'')+' confirmé'+(count>1?'s':'')+' en direct sur ce jeu.'));
    const a=elt(doc,'a','','Recentrer sur ce jeu');a.href='/explorer/carte?jeu='+encodeURIComponent(item.slug);inspector.append(a);
   }else inspector.append(elt(doc,'p','','Classement éditorial par genre : les liaisons ne sont pas des affiliations entre créateurs.'));
  }
  function renderGraph(){
   const host=$('sx-nodes'),svg=$('sx-lines'),select=$('sx-focus');
   const liveGames=mergeGames(state.games,
    state.lives.filter(x=>x.slug&&x.genre).map(x=>({
     kind:'game',id:'game:'+x.slug,slug:x.slug,name:x.game,genre:x.genre,cover:''
    })));
   const available=liveGames.filter(x=>state.lives.some(l=>l.slug===x.slug));
   available.sort((a,b)=>{
    const count=s=>state.lives.filter(l=>l.slug===s).length;
    return count(b.slug)-count(a.slug)||a.name.localeCompare(b.name,'fr');
   });
   const fromUrl=new URLSearchParams(win.location.search).get('jeu');
   if(!available.some(x=>x.slug===state.focus))state.focus=available.find(x=>x.slug===fromUrl)?.slug||available[0]?.slug||null;
   select.replaceChildren(...available.map(x=>{
    const opt=elt(doc,'option','',x.name);opt.value=x.slug;return opt;
   }));
   select.disabled=!available.length;
   if(state.focus)select.value=state.focus;
   const graph=graphModel(available,state.lives,state.focus,genreForGame);
   host.replaceChildren();svg.replaceChildren();
   const ns='http://www.w3.org/2000/svg',byId=new Map(graph.nodes.map(n=>[n.id,n]));
   for(const edge of graph.edges){
    const a=byId.get(edge.from),b=byId.get(edge.to);
    if(!a||!b)continue;
    const line=doc.createElementNS(ns,'line');
    line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
    if(edge.kind==='live')line.setAttribute('class','sx-primary-edge');
    svg.append(line);
   }
   for(const node of graph.nodes){
    const button=elt(doc,'button','sx-node');button.type='button';button.dataset.kind=node.kind;
    button.style.left=(node.x/10)+'%';button.style.top=(node.y/5.6)+'%';
    button.setAttribute('aria-label',node.kind==='creator'?'Créateur en direct : '+node.name:node.kind==='game'?'Jeu : '+node.name:'Genre : '+node.name);
    if(node.kind==='game'&&node.item.cover)button.append(image(doc,node.item.cover,''));
    button.append(elt(doc,'strong','',node.name));
    if(node.kind==='creator')button.append(elt(doc,'small','',node.item.platform==='swapp'?'SWAPP LIVE':'TWITCH'));
    button.addEventListener('click',()=>{
     host.querySelectorAll('.sx-node').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));
     inspect(node);
     if(node.kind==='game'&&node.id.startsWith('peer:')){
      state.focus=node.item.slug;
      const url=new URL(win.location.href);url.searchParams.set('jeu',state.focus);
      win.history.replaceState(null,'',url.pathname+url.search);
      renderGraph();
     }
    });
    host.append(button);
   }
   $('sx-graph-count').textContent=available.length+' jeux · '+state.lives.length+' créateurs vérifiés · actualisation 5 min';
   if(!graph.focus){
    $('sx-inspector').replaceChildren(elt(doc,'p','sx-empty','Aucun live confirmé à relier. La carte sera disponible lorsque des diffusions seront vérifiées.'));
   }else inspect(graph.nodes[0]);
  }
  async function refresh(){
   if(state.loading||doc.hidden)return;state.loading=true;
   updateFeedback('Recherche des jeux et des créateurs réellement en direct…');
   const results=await Promise.allSettled([
    fetchGames(),
    fetchLives('/api/discovery/home-lives?limit=24&lang=fr','swapp'),
    fetchLives('/api/twitch/streams/top?limit=100&lang=fr','twitch')
   ]);
   if(results[0].status==='fulfilled')state.games=results[0].value;
   // Do not keep stale streamers when fresh verification has failed.
   state.lives=mergeLives(
    results[1].status==='fulfilled'?results[1].value:[],
    results[2].status==='fulfilled'?results[2].value:[]
   );
   if(initialGenre)await enrichGenre(initialGenre);
   state.partial=results.some(r=>r.status==='rejected');
   if(results.every(r=>r.status==='rejected'))updateFeedback('Sources de découverte indisponibles. Aucun live non vérifié ne sera affiché.');
   else updateFeedback(state.partial?'Une source est indisponible : seuls les contenus confirmés sont affichés.':'');
   state.loading=false;
   if(isChart)renderGraph();else renderCollections();
  }
  $('sx-query').addEventListener('input',event=>{
   state.query=String(event.target.value||'').slice(0,120);
   if(isChart){
    const match=state.lives.find(x=>hasQuery(x.name+' '+x.game))||state.games.find(x=>hasQuery(x.name));
    if(match?.slug)state.focus=match.slug;
    renderGraph();
   }else renderCollections();
  });
  $('sx-focus').addEventListener('change',event=>{
   state.focus=event.target.value;
   const url=new URL(win.location.href);url.searchParams.set('jeu',state.focus);
   win.history.replaceState(null,'',url.pathname+url.search);
   renderGraph();
  });
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)void refresh()});
  win.addEventListener('online',()=>void refresh());
  win.setInterval(()=>{if(!doc.hidden)void refresh()},5*60*1000);
  void refresh();
 }
 return Object.freeze({picture,game,live,mergeGames,mergeLives,collections,graphModel,mount});
});
