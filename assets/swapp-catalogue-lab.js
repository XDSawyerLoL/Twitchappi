/* SWAPP Catalogue Lab: real game and live feeds, no invented sessions.
 * Visual previews on focus/hover; video previews only on explicit click.
 * Uses existing Mes jeux library action and storage schema (30 games max).
 */
(function(){
'use strict';
const LAB_VERSION='20261113-public-home-small-v4';
const API=Object.freeze({
 home:'/api/discovery/home-lives?limit=12&lang=fr',
 top:'/api/twitch/streams/top?limit=40&lang=fr',
 games:'/api/categories/top',
 articles:'/api/actus',
 small:'/api/oryon/discover/find-live?mood=petite-commu&max=150&lang=fr&source=twitch&discover=1',
 smallBackup:'/api/twitch/streams/small?lang=fr&min=0&max=150&discover=1'
});
const FAVORITES_KEY='swapp:followed-games:v1';
const CHANNEL_KEY='oryon_v4_likes';
const GAME_COPY=Object.freeze({
 'fortnite':'Battle royale et expériences créatives : des parties en équipe, des constructions et des modes imaginés par les joueurs.',
 'minecraft':'Explore, collecte des ressources et construis dans un univers de blocs, en survie comme en création.',
 'grand theft auto v':'Un monde ouvert à Los Santos, entre missions, conduite et aventures improvisées en ligne.',
 'gta v':'Un monde ouvert à Los Santos, entre missions, conduite et aventures improvisées en ligne.',
 'league of legends':'Jeu de stratégie compétitif en équipes où chaque champion joue un rôle dans la conquête de la carte.',
 'valorant':'Jeu de tir tactique en équipes combinant précision, coordination et compétences propres à chaque agent.',
 'counter-strike':'Affrontements tactiques où la maîtrise des armes et les objectifs d’équipe font la différence.',
 'counter-strike 2':'Affrontements tactiques où la maîtrise des armes et les objectifs d’équipe font la différence.',
 'world of warcraft':'Explore Azeroth dans un MMORPG mêlant quêtes, donjons, raids et affrontements entre joueurs.',
 'elden ring':'Aventure et combats dans un vaste monde de dark fantasy, à explorer librement.',
 'cyberpunk 2077':'Jeu de rôle en monde ouvert dans Night City, mégalopole futuriste dominée par les corporations.',
 'the elder scrolls online':'Parcours Tamriel dans un MMORPG mêlant exploration, quêtes et activités en groupe.',
 'where winds meet':'Aventure d’arts martiaux en monde ouvert inspirée de la Chine ancienne.',
 'marvel rivals':'Affrontements en équipes entre héros et antagonistes de l’univers Marvel.',
 'apex legends':'Battle royale en escouades centré sur des personnages aux capacités complémentaires.',
 'rocket league':'Football automobile compétitif, entre acrobaties et jeu collectif.',
 'call of duty':'Jeu de tir d’action avec des expériences multijoueurs qui varient selon les épisodes.',
 'dead by daylight':'Jeu d’horreur asymétrique où des survivants tentent d’échapper à un tueur.',
 'escape from tarkov':'Survie et extraction dans des zones hostiles où chaque sortie comporte un risque.',
 'dota 2':'Arène de combat stratégique opposant deux équipes aux héros et capacités variés.',
 'roblox':'Plateforme d’expériences interactives créées par ses utilisateurs, mêlant exploration, défis et jeu en groupe.',
 'final fantasy xiv online':'MMORPG centré sur une aventure narrative, avec donjons, raids et professions.',
 'final fantasy xiv':'MMORPG centré sur une aventure narrative, avec donjons, raids et professions.',
 'rust':'Jeu de survie multijoueur où l’on collecte des ressources, construit une base et négocie des alliances.',
 'dayz':'Survie en monde ouvert dans un environnement hostile, où les rencontres entre joueurs restent imprévisibles.',
 'overwatch 2':'Jeu de tir en équipes basé sur des héros aux capacités complémentaires et des objectifs à coordonner.',
 'baldur\'s gate 3':'Jeu de rôle en groupe mêlant exploration, dialogues, tactique et conséquences durables des décisions.',
 'the witcher 3: wild hunt':'Aventure de Geralt dans un monde de fantasy ouvert, mêlant enquêtes, combats et choix narratifs.',
 'path of exile 2':'Action-RPG fantastique axé sur la progression du personnage, les combats et la recherche d’équipement.',
 'crusader kings iii':'Grande stratégie médiévale centrée sur les dynasties, la diplomatie, les intrigues et les successions.',
 'sea of thieves':'Aventure pirate coopérative : navigation, trésors, combats maritimes et rencontres imprévues.',
 'the sims 4':'Simulation de vie où l’on crée des personnages, construit des maisons et organise leur quotidien.',
 'stardew valley':'Simulation de ferme alliant culture, artisanat, exploration et relations avec un village.',
 'rainbow six siege':'Jeu de tir tactique où gadgets, information et coordination conditionnent chaque assaut.',
 'tom clancy\'s rainbow six siege':'Jeu de tir tactique où gadgets, information et coordination conditionnent chaque assaut.',
 'diablo iv':'Action-RPG de dark fantasy centré sur les donjons, la progression et les combats contre des hordes.',
 'red dead redemption 2':'Aventure en monde ouvert dans l’Ouest américain, entre cavale, exploration et vie de bande.',
 'destiny 2':'Jeu de tir et d’action partagé mêlant missions, raids et affrontements compétitifs.',
 'the finals':'Jeu de tir compétitif où l’environnement destructible transforme les affrontements.',
 'arc raiders':'Jeu d’extraction coopératif où des équipes récupèrent des ressources tout en affrontant des menaces.',
 'fall guys':'Courses et épreuves d’obstacles multijoueurs, avec des manches éliminatoires.',
 'terraria':'Jeu de construction et d’exploration en 2D mêlant combat, artisanat et progression.',
 'palworld':'Survie, construction et exploration avec des créatures à capturer et à faire évoluer dans sa base.',
 'hollow knight':'Aventure d’exploration en 2D, au rythme de combats exigeants et de découvertes progressives.',
 'just chatting':'Diffusions centrées sur les échanges et la discussion avec la communauté.'
});
const NOT_GAMES=new Set(['just chatting','music','asmr','irl','sports','art','talk shows & podcasts','food & drink','pools, hot tubs, and beaches','special events','always on','software and game development']);
const escapeName=value=>String(value??'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,140);
const latin=value=>escapeName(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const gameSlug=value=>latin(value).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90).replace(/-+$/,'');
const isValidSlug=s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length>=3&&s.length<=90;
function safeImage(value){
 try{
  const source=String(value||'').replaceAll('{width}','640').replaceAll('{height}','360');
  const url=new URL(source);
  const host=url.hostname.toLowerCase();
  const allowed=host==='swapp.tv'||host==='www.swapp.tv'||
   host==='static-cdn.jtvnw.net'||host.endsWith('.jtvnw.net')||
   host==='images.igdb.com'||host.endsWith('.twitchcdn.net');
  return url.protocol==='https:'&&!url.username&&!url.password&&allowed?url.href:'';
 }catch{return ''}
}
function synopsis(game){
 const key=latin(game).replace(/\s+/g,' ');
 return GAME_COPY[key]||'Retrouve les créateurs qui explorent ce jeu. Présentation éditoriale à compléter.';
}
function normalizeLive(item,defaultPlatform='twitch'){
 if(!item||typeof item!=='object')return null;
 const rawPlatform=latin(item.platform||defaultPlatform);
 const platform=['oryon','swapp','native'].includes(rawPlatform)?'swapp':'twitch';
 const login=String(item.login||item.user_login||item.host_login||item.room||'').trim().toLowerCase();
 const valid=platform==='twitch'?/^[a-z0-9_]{2,25}$/:/^[a-z0-9_][a-z0-9_-]{1,39}$/;
 if(!valid.test(login))return null;
 const game=escapeName(item.game_name||item.category||item.game||'').slice(0,90);
 const title=escapeName(item.title||('En direct avec '+login)).slice(0,140);
 return {
  id:platform+':'+login,kind:'live',platform,login,
  name:escapeName(item.display_name||item.user_name||item.host_name||login)||login,
  title,game,gameSlug:gameSlug(game),summary:synopsis(game),
  viewers:Math.max(0,Math.floor(Number(item.viewer_count??item.viewers)||0)),
  image:safeImage(item.thumbnail_url||item.img||item.banner_url||''),
  watchUrl:platform==='twitch'?'/live/twitch/'+encodeURIComponent(login):'/'+encodeURIComponent(login)
 };
}
function normalizeGame(item){
 if(!item||typeof item!=='object')return null;
 const game=escapeName(item.name||item.game_name||'').slice(0,90);
 if(!game||NOT_GAMES.has(latin(game)))return null;
 const slug=gameSlug(game);
 if(!isValidSlug(slug))return null;
 return {id:'game:'+slug,kind:'game',name:game,game,gameSlug:slug,
  summary:synopsis(game),image:safeImage(item.box_art_url||item.thumbnail_url||'')};
}
function mergeLives(home,top){
 const all=[],seen=new Set();
 for(const [arr,platform] of [[home,'swapp'],[top,'twitch']]){
  for(const raw of Array.isArray(arr)?arr:[]){
   const item=normalizeLive(raw,platform);
   if(!item||seen.has(item.id))continue;
   seen.add(item.id);all.push(item);
  }
 }
 return all.slice(0,70);
}
function mergeGames(categories,lives){
 const result=[],seen=new Set();
 for(const raw of Array.isArray(categories)?categories:[]){
  const game=normalizeGame(raw);if(!game||seen.has(game.gameSlug))continue;
  seen.add(game.gameSlug);result.push(game);
  if(result.length>=60)break;
 }
 for(const live of lives){
  if(!isValidSlug(live.gameSlug)||seen.has(live.gameSlug)||NOT_GAMES.has(latin(live.game)))continue;
  const fallback=normalizeGame({name:live.game});
  if(!fallback)continue;
  seen.add(fallback.gameSlug);result.push(fallback);
 }
 return result;
}
/* SWAPP ACTUS content is fetched from the published MySQL-backed catalogue,
 * never generated from unverified feeds or off-site article URLs.
 */
function cleanArticleImage(value){
 try{
  const uri=new URL(String(value||''));
  return uri.protocol==='https:'&&!uri.username&&!uri.password&&uri.hostname&&
   !/\.(?:svg|svgz)(?:$|\?)/i.test(uri.pathname)?uri.href:'';
 }catch{return ''}
}
function normalizeArticle(article){
 if(!article||typeof article!=='object'||(article.status&&article.status!=='published'))return null;
 const slug=String(article.slug||'').trim();
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>150)return null;
 const title=escapeName(article.title).slice(0,150);
 if(!title)return null;
 const category=escapeName(article.category||'Actualité').slice(0,55);
 const summary=escapeName(article.summary||article.description||'').slice(0,190);
 const publishedAt=String(article.publishedAt||article.originalPublishedAt||'');
 const timestamp=Date.parse(publishedAt);
 const rawCover=[article.thumbnail?.url,article.image?.url,article.imageUrl]
  .map(cleanArticleImage).find(Boolean)||'';
 return {
  id:'article:'+slug,kind:'article',slug,title,category,summary,
  game:escapeName(article.game||''),url:'/actus/'+encodeURIComponent(slug),
  publishedAt:Number.isFinite(timestamp)?timestamp:0,image:rawCover,
  original:article
 };
}
function normalizeArticles(values){
 if(!Array.isArray(values))return [];
 const seen=new Set(),articles=[];
 for(const raw of values){
  const article=normalizeArticle(raw);
  if(!article||seen.has(article.slug))continue;
  seen.add(article.slug);articles.push(article);
 }
 return articles.sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,20);
}
/* Small communities are verified active sessions only. A dedicated discovery
 * source is essential: top-ranked Twitch streams rarely have <50 viewers.
 * Prefer <=50; if too few exist, include <=150 and update the label honestly.
 */
function chooseSmallCommunities(main,discovered,backup,limit=12){
 const seen=new Set(),candidates=[];
 for(const input of [[discovered,'twitch'],[backup,'twitch'],[main,'twitch']]){
  for(const raw of Array.isArray(input[0])?input[0]:[]){
   const platform=String(raw?.platform||'twitch').toLowerCase();
   if(!['twitch','oryon','swapp','native'].includes(platform))continue;
   const item=raw?.kind==='live'?raw:normalizeLive(raw,input[1]);
   if(!item||!Number.isFinite(item.viewers)||item.viewers<0||item.viewers>150||seen.has(item.id))continue;
   seen.add(item.id);candidates.push(item);
  }
 }
 const verySmall=candidates.filter(x=>x.viewers<=50);
 const max=verySmall.length>=4?50:150;
 const active=candidates.filter(x=>x.viewers<=max);
 const mainKeys=new Set((Array.isArray(main)?main:[]).map(x=>x.id));
 active.sort((a,b)=>{
  const an=a.platform==='swapp'?0:1,bn=b.platform==='swapp'?0:1;
  const au=mainKeys.has(a.id)?1:0,bu=mainKeys.has(b.id)?1:0;
  return an-bn||au-bu||Math.abs(a.viewers-25)-Math.abs(b.viewers-25);
 });
 const count=new Map(),selected=[];
 for(const item of active){
  const key=item.gameSlug||'unknown';
  if((count.get(key)||0)>=3)continue;
  count.set(key,(count.get(key)||0)+1);
  selected.push(item);
  if(selected.length>=Math.max(1,Math.min(24,limit)))break;
 }
 // When all verified small creators play the same game, show those real
 // streams instead of leaving a rail artificially half-empty.
 if(selected.length<Math.min(6,active.length,limit)){
  const chosen=new Set(selected.map(x=>x.id));
  for(const item of active){
   if(chosen.has(item.id))continue;
   selected.push(item);chosen.add(item.id);
   if(selected.length>=Math.min(6,active.length,limit))break;
  }
 }
 return {items:selected,max};
}
function readFavorites(storage){
 try{
  const saved=JSON.parse(storage.getItem(FAVORITES_KEY)||'null');
  if(!saved||saved.version!==1||!Array.isArray(saved.games))return [];
  const seen=new Set();
  return saved.games.filter(x=>{
   const slug=String(x?.slug||'');
   if(!isValidSlug(slug)||seen.has(slug))return false;
   seen.add(slug);return true;
  }).slice(0,30).map(x=>({slug:x.slug,game:escapeName(x.game)||x.slug}));
 }catch{return []}
}
function readChannelFavorites(storage){
 try{
  const data=JSON.parse(storage.getItem(CHANNEL_KEY)||'[]');
  if(!Array.isArray(data))return [];
  const seen=new Set();
  return data.filter(item=>{
   const platform=item?.platform==='twitch'?'twitch':item?.platform==='oryon'?'oryon':'';
   const login=String(item?.login||'').toLowerCase();
   const valid=platform==='twitch'?/^[a-z0-9_]{2,25}$/:/^[a-z0-9_][a-z0-9_-]{1,39}$/;
   const key=platform+':'+login;
   if(!platform||!valid.test(login)||seen.has(key))return false;
   seen.add(key);return true;
  }).slice(0,100).map(item=>({platform:item.platform,login:String(item.login).toLowerCase(),name:escapeName(item.name),game:escapeName(item.game),ts:Number.isFinite(Number(item.ts))?Number(item.ts):0}));
 }catch{return []}
}
if(typeof module==='object'&&module.exports)
 module.exports={API,LAB_VERSION,normalizeLive,normalizeGame,normalizeArticle,normalizeArticles,mergeLives,mergeGames,chooseSmallCommunities,gameSlug,synopsis,readFavorites,readChannelFavorites,safeImage,cleanArticleImage};
if(typeof document==='undefined')return;
const root=document.getElementById('swapp-catalogue-lab');
if(!root)return;
const $=id=>document.getElementById(id);
const storage=()=>{try{return window.localStorage}catch{return {getItem(){return null},setItem(){throw Error('storage_unavailable')}}}};
const create=(tag,className,text)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const state={lives:[],games:[],articles:[],small:[],smallCandidates:[],smallLoading:false,smallError:false,smallMax:50,smallEpoch:0,newsError:false,newsLoading:false,newsEpoch:0,featured:null,filter:'all',query:'',loading:false,failed:[],previewTimer:0,abort:null,heroItems:[],heroIndex:0,heroTimer:null,hoverTimer:null,hoverIframe:null,hoverCard:null};
const status=$('scl-status'),hero=$('scl-feature'),featureVisual=$('scl-feature-visual'),dialog=$('scl-dialog');
const heroDots=$('scl-feature-dots');
const visNode=item=>{
 const frame=create('div','scl-card-media');
 if(item.image){
  const image=create('img');
  image.src=item.image;
  image.alt='';
  image.loading='lazy';
  image.decoding='async';
  image.referrerPolicy='no-referrer';
  image.onerror=()=>{image.remove();frame.append(create('div','scl-no-art','Aperçu indisponible'))};
  frame.append(image);
 }else frame.append(create('div','scl-no-art','Image indisponible'));
 if(item.kind==='live'){
  frame.append(create('span','scl-live-pill','DIRECT'));
  frame.append(create('span','scl-viewer-pill',item.viewers.toLocaleString('fr-FR')+' spectateurs'));
 }
 return frame;
};
const stopPreview=()=>{const node=$('scl-preview-frame');if(node)node.remove()};
/* Only one tiny muted live preview is permitted, after deliberate desktop hover.
 * Touch, reduced-motion, data-saver and native SWAPP streams keep still posters.
 */
function stopHoverPreview(){
 if(state.hoverTimer){clearTimeout(state.hoverTimer);state.hoverTimer=null}
 if(state.hoverIframe){state.hoverIframe.remove();state.hoverIframe=null}
 if(state.hoverCard){state.hoverCard.classList.remove('scl-is-playing');state.hoverCard=null}
}
function scheduleHoverPreview(item,card,frame){
 stopHoverPreview();
 if(item.kind!=='live'||item.platform!=='twitch'||!item.image)return;
 if(!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches||
     window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||
     navigator.connection?.saveData||document.hidden)return;
 const host=String(window.location.hostname||'').toLowerCase();
 if(!/^[a-z0-9.-]+$/.test(host))return;
 state.hoverCard=card;
 state.hoverTimer=setTimeout(()=>{
  state.hoverTimer=null;
  if(!card.isConnected||!card.matches(':hover')||document.hidden||dialog.open)return;
  const iframe=create('iframe','scl-card-hover-player');
  const address=new URL('https://player.twitch.tv/');
  address.searchParams.set('channel',item.login);
  address.searchParams.set('parent',host);
  address.searchParams.set('autoplay','true');
  address.searchParams.set('muted','true');
  iframe.src=address.href;
  iframe.title='Aperçu muet de '+item.name;
  iframe.allow='autoplay; fullscreen';
  iframe.referrerPolicy='strict-origin-when-cross-origin';
  iframe.setAttribute('aria-hidden','true');
  iframe.tabIndex=-1;
  iframe.addEventListener('error',stopHoverPreview,{once:true});
  frame.append(iframe);
  state.hoverIframe=iframe;
  card.classList.add('scl-is-playing');
 },1250);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopHoverPreview()});
document.addEventListener('scroll',stopHoverPreview,true);
window.addEventListener('pagehide',stopHoverPreview);
function showDialog(node){
 stopHoverPreview();
 stopPreview();
 const host=$('scl-dialog-content');
 host.replaceChildren(node);
 if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
 else dialog.setAttribute('open','');
}
function closeDialog(){
 stopHoverPreview();
 stopPreview();
 if(typeof dialog.close==='function'&&dialog.open)dialog.close();
 else dialog.removeAttribute('open');
 $('scl-dialog-content').replaceChildren();
}
$('scl-dialog-close').addEventListener('click',closeDialog);
dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog()});
dialog.addEventListener('close',()=>{$('scl-dialog-content').replaceChildren()});
function channelPlatform(item){return item.platform==='swapp'?'oryon':'twitch'}
function isSavedChannel(item){
 try{return readChannelFavorites(storage()).some(x=>x.platform===channelPlatform(item)&&x.login===item.login)}
 catch{return false}
}
function toggleChannelFavorite(item){
 try{
  const saved=readChannelFavorites(storage());
  const platform=channelPlatform(item);
  const exists=saved.some(x=>x.platform===platform&&x.login===item.login);
  const next=exists?saved.filter(x=>!(x.platform===platform&&x.login===item.login)):
   [{platform,login:item.login,name:item.name,game:item.game,ts:Date.now()},...saved].slice(0,100);
  storage().setItem(CHANNEL_KEY,JSON.stringify(next));
  refreshFavorites();
  status.textContent=exists?'Chaîne retirée des favoris.':'Chaîne ajoutée aux favoris locaux.';
 }catch{
  status.textContent='Impossible de modifier les favoris sur cet appareil.';
 }
}
function watch(item){if(!item||item.kind!=='live')return;window.location.assign(item.watchUrl)}
function feature(item){
 state.featured=item||null;
 featureVisual.style.backgroundImage=item?.image?'url("'+item.image+'")':'';
 hero.dataset.kind=item?.kind||'empty';
 hero.dataset.image=item?.image?'available':'missing';
 $('scl-feature-kicker').textContent=item?(item.kind==='live'?'EN DIRECT / '+(item.platform==='swapp'?'SWAPP':'TWITCH'):'UNIVERS À DÉCOUVRIR'):'CATALOGUE / SWAPP';
 $('scl-feature-title').textContent=item?(item.kind==='live'?item.name:item.game):'Trouver ton prochain live.';
 $('scl-feature-desc').textContent=item?(item.kind==='live'?(item.title+(item.game?' · '+item.game:'')):item.summary):
  'Le catalogue affiche uniquement des directs réellement disponibles. Aucune diffusion fictive.';
 $('scl-feature-meta').textContent=item?(item.kind==='live'?item.viewers.toLocaleString('fr-FR')+' spectateurs · '+(item.platform==='swapp'?'SWAPP LIVE':'Twitch'):'FICHE JEU · '+(state.lives.filter(x=>x.gameSlug===item.gameSlug).length)+' directs repérés'):'';
 $('scl-feature-watch').textContent=item?.kind==='game'?'Voir les directs':'Regarder';
 $('scl-feature-watch').disabled=!item;
 $('scl-feature-preview').disabled=!item||item.kind!=='live';
 $('scl-feature-details').disabled=!item;
}
/* Curated from current verified sources only. No autoplay of live media in the hero. */
function setHeroItems(){
 const order=[...state.lives.filter(x=>x.platform==='swapp'&&x.image).slice(0,2),
  ...state.lives.filter(x=>x.image).slice(0,5),
  ...state.games.filter(x=>x.image).slice(0,2)];
 const seen=new Set();
 state.heroItems=order.filter(x=>{
  if(!x||seen.has(x.id))return false;
  seen.add(x.id);return true;
 }).slice(0,6);
 if(!state.heroItems.length)state.heroItems=[...state.lives,...state.games].slice(0,6);
 state.heroIndex=0;
 showHero(0);
}
function showHero(index){
 const total=state.heroItems.length;
 if(!total){heroDots.replaceChildren();feature(null);return}
 state.heroIndex=(index%total+total)%total;
 const item=state.heroItems[state.heroIndex];
 feature(item);
 heroDots.replaceChildren();
 for(let i=0;i<total;i++){
  const dot=create('button','scl-feature-dot');
  dot.type='button';
  dot.setAttribute('aria-label','Afficher la sélection '+(i+1)+' sur '+total);
  dot.setAttribute('aria-pressed',String(i===state.heroIndex));
  dot.addEventListener('click',()=>showHero(i));
  heroDots.append(dot);
 }
 $('scl-feature-prev').disabled=total<2;
 $('scl-feature-next').disabled=total<2;
}
$('scl-feature-prev').addEventListener('click',()=>showHero(state.heroIndex-1));
$('scl-feature-next').addEventListener('click',()=>showHero(state.heroIndex+1));
const prefersLessMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
function startHeroRotation(){
 if(state.heroTimer)clearInterval(state.heroTimer);
 if(state.heroItems.length<2)return;
 state.heroTimer=setInterval(()=>{
  if(document.hidden||dialog.open||hero.matches(':hover')||hero.matches(':focus-within')||prefersLessMotion())return;
  showHero(state.heroIndex+1);
 },9500);
}
$('scl-feature-watch').addEventListener('click',()=>{const item=state.featured;if(!item)return;if(item.kind==='live')watch(item);else void showGameLives(item)});
$('scl-feature-preview').addEventListener('click',()=>{if(state.featured?.kind==='live')preview(state.featured)});
$('scl-feature-details').addEventListener('click',()=>{if(state.featured)details(state.featured)});
const button=(label,cls,handler)=>{
 const el=create('button',cls,label);el.type='button';el.addEventListener('click',handler);return el;
};
function actionsFor(item){
 const actions=create('div','scl-actions');
 if(item.kind==='live'){
  actions.append(button('Regarder le direct','scl-btn scl-btn-primary',()=>watch(item)));
  actions.append(button('Prévisualiser','scl-btn scl-btn-neutral',()=>preview(item)));
  const save=button('♡ Ajouter aux favoris','scl-btn scl-btn-outline',()=>toggleChannelFavorite(item));
  save.dataset.sclChannelFavorite=item.id;
  save.dataset.labelMode='full';
  actions.append(save);
 }else{
  actions.append(button('Voir les directs','scl-btn scl-btn-primary',()=>{void showGameLives(item)}));
  const followed=button('＋ Suivre ce jeu','scl-btn scl-btn-neutral',()=>{});
  followed.dataset.swappFollowGame='1';
  followed.dataset.gameSlug=item.gameSlug;
  followed.dataset.gameName=item.game;
  followed.setAttribute('aria-pressed',String(readFavorites(storage()).some(x=>x.slug===item.gameSlug)));
  actions.append(followed);
 }
 return actions;
}
function modalBody(item){
 const container=create('div','scl-dialog-content');
 if(item.image){
  const poster=create('img','scl-dialog-image');poster.src=item.image;poster.alt='';poster.referrerPolicy='no-referrer';container.append(poster);
 }
 const body=create('div','scl-dialog-body');
 body.append(create('div','scl-dialog-meta',item.kind==='live'?'DIFFUSION EN DIRECT':'UNIVERS / JEU'));
 const title=create('h2','',item.kind==='live'?item.name:item.game);
 title.id='scl-dialog-title';
 body.append(title);
 body.append(create('p','',item.kind==='live'?(item.title+(item.game?' · '+item.game:'')):item.summary));
 if(item.kind==='live'){
  body.append(create('p','scl-dialog-meta',item.viewers.toLocaleString('fr-FR')+' spectateurs · '+(item.platform==='swapp'?'SWAPP LIVE':'Twitch')));
 }
 body.append(actionsFor(item));
 container.append(body);
 return container;
}
function details(item){showDialog(modalBody(item));window.dispatchEvent(new Event('swapp:account-rendered'))}
function preview(item){
 const content=modalBody(item);
 const body=content.querySelector('.scl-dialog-body');
 if(item.platform==='twitch'){
  const iframe=create('iframe','scl-preview-frame');
  iframe.id='scl-preview-frame';
  const host=window.location.hostname.toLowerCase();
  if(!/^[a-z0-9.-]+$/.test(host))return details(item);
  const url=new URL('https://player.twitch.tv/');
  url.searchParams.set('channel',item.login);
  url.searchParams.set('parent',host);
  url.searchParams.set('muted','true');
  url.searchParams.set('autoplay','true');
  iframe.src=url.href;
  iframe.title='Prévisualisation Twitch : '+item.name;
  iframe.allow='autoplay; fullscreen';
  iframe.referrerPolicy='strict-origin-when-cross-origin';
  body.insertBefore(iframe,body.querySelector('.scl-actions'));
  body.append(create('p','scl-preview-note','Aperçu muet chargé à ta demande. Le lecteur complet et le tchat restent sur SWAPP.'));
 }else{
  body.append(create('p','scl-preview-note','Ce live SWAPP ne propose pas encore de lecteur miniature ici. Utilise « Regarder le direct » pour ouvrir le flux complet.'));
 }
 showDialog(content);
 refreshFavorites();
}
function createCard(item){
 const card=create('article','scl-card');
 card.dataset.kind=item.kind;
 const media=visNode(item),body=create('div','scl-card-details');
 const kicker=create('span','',item.kind==='live'?(item.platform==='swapp'?'SWAPP LIVE':'TWITCH'):'JEU VIDÉO');
 const title=create('h3','',item.kind==='live'?item.name:item.game);
 const summary=create('p','',item.kind==='live'?(item.game?item.game+' · '+item.title:item.title):item.summary);
 body.append(kicker,title,summary);
 const actions=create('div','scl-card-action-row');
 if(item.kind==='live'){
  const link=create('a','scl-card-watch', '▶ Regarder');
  link.href=item.watchUrl;
  actions.append(link);
  if(item.platform==='twitch'){
   const peek=button('▣','scl-card-peek',()=>preview(item));
   peek.setAttribute('aria-label','Prévisualiser '+item.name);
   actions.append(peek);
  }
  const save=button('♡','scl-channel-fav',()=>toggleChannelFavorite(item));
  save.dataset.sclChannelFavorite=item.id;
  save.setAttribute('aria-label','Ajouter '+item.name+' aux favoris');
  actions.append(save);
 }else{
  const fav=button('＋ Suivre ce jeu','scl-fav-button',()=>{});
  fav.dataset.swappFollowGame='1';
  fav.dataset.gameSlug=item.gameSlug;
  fav.dataset.gameName=item.game;
  fav.setAttribute('aria-pressed',String(readFavorites(storage()).some(x=>x.slug===item.gameSlug)));
  actions.append(fav);
 }
 const info=button('ⓘ','scl-card-info',()=>details(item));info.setAttribute('aria-label','En savoir plus sur '+(item.kind==='live'?item.name:item.game));
 actions.append(info);body.append(actions);
 card.append(media,body);
 // Netflix-style reveal remains inside this card. Never move the global
 // featured hero when a user merely passes over a thumbnail.
 card.addEventListener('mouseenter',()=>scheduleHoverPreview(item,card,media));
 card.addEventListener('mouseleave',stopHoverPreview);
 card.addEventListener('focusin',()=>card.classList.add('scl-is-focused'));
 card.addEventListener('focusout',event=>{
  if(!card.contains(event.relatedTarget))card.classList.remove('scl-is-focused');
 });
 return card;
}
/* Article rail: on-site cards only. Sharing is an independent button, not
 * a link that accidentally navigates to the article or its source publisher.
 */
function articleCover(article){
 const area=create('div','scl-story-media');
 const shared=window.SwappArticleExtras?.cardImageSources?.(article.original)||[];
 const urls=[article.image,...shared].map(cleanArticleImage).filter(Boolean);
 if(!urls.length){
  area.append(create('div','scl-story-no-art','SWAPP · ACTUALITÉ'));
  return area;
 }
 let index=0;
 const image=create('img');
 image.loading='lazy';image.decoding='async';image.alt='';
 image.referrerPolicy='no-referrer';
 image.addEventListener('error',()=>{
  index++;
  if(index<urls.length){image.src=urls[index];return}
  image.remove();area.append(create('div','scl-story-no-art','SWAPP · ACTUALITÉ'));
 });
 image.src=urls[0];area.append(image);
 return area;
}
async function shareArticle(article,tools,feedback){
 const url=window.location.origin+article.url;
 const report=message=>{feedback.textContent=message;feedback.hidden=false};
 if(typeof navigator.share==='function'){
  try{await navigator.share({title:article.title,url});report('Article partagé');return}
  catch(error){if(error?.name==='AbortError')return}
 }
 try{
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);report('Lien SWAPP copié');return}
 }catch(_){}
 let field=tools.querySelector('.scl-story-share-url');
 if(!field){
  field=create('input','scl-story-share-url');field.type='text';field.readOnly=true;
  field.setAttribute('aria-label','Lien de l’article SWAPP à copier');
  tools.append(field);
 }
 field.value=url;
 field.focus();field.select();
 try{
  if(typeof document.execCommand==='function'&&document.execCommand('copy')){
   report('Lien SWAPP copié');return
  }
 }catch(_){}
 report('Lien sélectionné : copiez-le');
}
function createArticleCard(article){
 const card=create('article','scl-story-card');
 const link=create('a','scl-story-link');
 link.href=article.url;
 link.setAttribute('aria-label','Lire sur SWAPP : '+article.title);
 const media=articleCover(article);
 const body=create('div','scl-story-info');
 const category=create('span','scl-story-category',article.category);
 const title=create('h3','',article.title);
 const summary=create('p','',article.summary||'Lire l’article complet sur SWAPP.');
 const date=create('small','scl-story-date',article.publishedAt?
  new Date(article.publishedAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):
  'ACTUALITÉ SWAPP');
 body.append(category,title,summary,date);
 link.append(media,body);
 const actions=create('div','scl-story-actions');
 const buttonShare=button('Partager','scl-story-share',()=>{void shareArticle(article,actions,feedback)});
 buttonShare.setAttribute('aria-label','Partager : '+article.title);
 const feedback=create('span','scl-story-share-feedback');
 feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 actions.append(buttonShare,feedback);
 card.append(link,actions);
 return card;
}
function fillArticleRail(items,unavailable=false){
 const host=$('scl-article-cards'),fragment=document.createDocumentFragment();
 if(items.length)items.forEach(item=>fragment.append(createArticleCard(item)));
 else fragment.append(empty(unavailable?
  'Les actualités sont temporairement indisponibles. Consulte le magazine SWAPP.':
  state.newsLoading?'Chargement des articles publiés…':
  'Aucun article publié ne correspond à cette recherche.'));
 host.replaceChildren(fragment);
}
const matching=item=>{
 const q=latin(state.query);return !q||latin([item.name,item.title,item.game,item.summary,item.category].join(' ')).includes(q);
};
const empty=(message)=>create('p','scl-empty',message);
function fill(id,items,placeholder){
 const host=$(id);const fragment=document.createDocumentFragment();
 if(items.length)items.forEach(item=>fragment.append(createCard(item)));
 else fragment.append(empty(placeholder));
 host.replaceChildren(fragment);
}
function refreshFavorites(){
 const saved=readFavorites(storage());
 const savedChannels=readChannelFavorites(storage());
 const games=saved.map(x=>state.games.find(g=>g.gameSlug===x.slug)||normalizeGame({name:x.game})).filter(Boolean);
 const liveKeys=new Set(savedChannels.map(x=>(x.platform==='oryon'?'swapp':'twitch')+':'+x.login));
 const followedLives=state.lives.filter(x=>liveKeys.has(x.id));
 fill('scl-favorite-cards',[...followedLives,...games].filter(matching),
  'Aucun favori actuellement en direct. Suis un jeu ou ajoute une chaîne aux favoris.');
 const counter=document.querySelector('[data-scl-favorites-count]');
 if(counter)counter.textContent=String(saved.length+savedChannels.length);
 const selected=new Set(saved.map(x=>x.slug));
 document.querySelectorAll('[data-swapp-follow-game]').forEach(el=>{
  const pressed=selected.has(el.dataset.gameSlug);
  el.setAttribute('aria-pressed',String(pressed));
  el.textContent=pressed?'✓ Jeu suivi':'＋ Suivre ce jeu';
 });
 const streamKeys=new Set(savedChannels.map(x=>(x.platform==='oryon'?'swapp':'twitch')+':'+x.login));
 document.querySelectorAll('[data-scl-channel-favorite]').forEach(el=>{
  const pressed=streamKeys.has(el.dataset.sclChannelFavorite);
  el.setAttribute('aria-pressed',String(pressed));
  el.textContent=el.dataset.labelMode==='full'?(pressed?'♥ Dans les favoris':'♡ Ajouter aux favoris'):(pressed?'♥':'♡');
  const item=state.lives.find(x=>x.id===el.dataset.sclChannelFavorite);
  if(item)el.setAttribute('aria-label',(pressed?'Retirer ':'Ajouter ')+item.name+(pressed?' des favoris':' aux favoris'));
 });
}
function refreshSmallRail(){
 const result=chooseSmallCommunities(state.lives,state.smallCandidates,[],12);
 state.small=result.items;
 state.smallMax=result.max;
 const label=$('scl-small-eyebrow');
 if(label)label.textContent=result.max===50?'JUSQU’À 50 SPECTATEURS':'JUSQU’À 150 SPECTATEURS';
 const visible=state.small.filter(matching);
 fill('scl-small-cards',visible,state.smallLoading?
  'Recherche de petites communautés réellement en direct…':
  'Aucun petit live disponible pour cette recherche en ce moment.');
 const area=$('scl-small-cards');
 if(visible.length||state.smallLoading)return;
 const info=area.querySelector('.scl-empty');
 if(info){
  const link=create('a','scl-small-discover','Découvrir tous les lives SWAPP');
  link.href='/decouvrir';
  info.append(create('span','',' '),link);
 }
}
async function loadSmallCommunities(){
 if(state.smallLoading)return;
 const epoch=++state.smallEpoch;
 state.smallLoading=true;state.smallError=false;state.smallCandidates=[];
 refreshSmallRail();
 const sources=[API.smallBackup,API.small];
 // Independent, progressive feeds. A slow community search must not delay
 // the homepage hero, article rail or top live rows.
 const results=await Promise.allSettled(sources.map(async route=>{
  const response=await fetchJson(route);
  return Array.isArray(response.items)?response.items:[];
 }).map(promise=>promise.then(items=>{
  if(epoch!==state.smallEpoch)return items;
  state.smallCandidates.push(...items);
  refreshSmallRail();
  return items;
 })));
 if(epoch!==state.smallEpoch)return;
 state.smallError=results.every(x=>x.status==='rejected');
 state.smallLoading=false;
 refreshSmallRail();
}
function render(){
 stopHoverPreview();
 const lives=state.lives.filter(matching),games=state.games.filter(matching);
 fillArticleRail(state.articles.filter(matching),state.newsError);
 fill('scl-live-cards',lives,'Aucun direct confirmé pour cette recherche.');
 fill('scl-game-cards',games,'Aucun jeu disponible pour cette recherche.');
 refreshSmallRail();
 refreshFavorites();
 document.querySelectorAll('[data-scl-section]').forEach(sec=>{
  sec.hidden=state.filter!=='all'&&sec.dataset.sclSection!==state.filter;
 });
 if(!state.featured||!matching(state.featured))feature(lives[0]||games[0]||null);
 // Rebind existing SWAPP Mes jeux controller to dynamically created cards.
 window.dispatchEvent(new Event('swapp:account-rendered'));
}
async function fetchJson(path){
 const control=new AbortController();
 const timeout=setTimeout(()=>control.abort(),8500);
 try{
  const response=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'},signal:control.signal,cache:'no-store'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();
  if(!data?.success||typeof data!=='object')throw new Error('Réponse indisponible');
  return data;
 }finally{clearTimeout(timeout)}
}
async function fetchArticles(){
 const control=new AbortController();
 const timeout=setTimeout(()=>control.abort(),9500);
 try{
  const response=await fetch(API.articles,{
   credentials:'same-origin',
   headers:{Accept:'application/json'},signal:control.signal,cache:'no-store'
  });
  if(!response.ok)throw new Error('Actualités HTTP '+response.status);
  const payload=await response.json();
  // Native magazine API intentionally has no success:true field.
  if(!payload||!Array.isArray(payload.articles))throw new Error('Catalogue ACTUS invalide');
  return payload.articles;
 }finally{clearTimeout(timeout)}
}
function updateCatalogueStatus(){
 if(state.loading){
  status.textContent='Chargement des directs et des jeux…';
  return;
 }
 status.replaceChildren();
 status.dataset.error='false';
 if(!state.lives.length&&!state.games.length&&!state.articles.length){
  if(state.newsLoading){
   status.textContent='Recherche des derniers articles publiés…';
   return;
  }
  status.dataset.error='true';
  status.append(create('span','','Aucun contenu disponible. Vérifie la connexion ou les catalogues SWAPP.'));
  status.append(button('Réessayer','',()=>{void load()}));
  return;
 }
 if(state.failed.length||state.newsError){
  status.textContent='Catalogue partiel : certaines sources sont temporairement indisponibles. Les contenus affichés sont réels.';
  return;
 }
 status.textContent=state.articles.length+' articles publiés · '+state.lives.length+
  ' directs confirmés · '+state.games.length+' jeux à explorer'+
  (state.newsLoading?' · Actualités en cours de chargement':'');
}
async function load(){
 if(state.loading)return;
 state.loading=true;
 state.newsLoading=true;
 void loadSmallCommunities();
 state.newsError=false;
 state.failed=[];
 state.articles=[];
 const newsEpoch=++state.newsEpoch;
 status.dataset.error='false';
 status.replaceChildren(create('span','','Recherche des vrais lives et jeux…'));
 // A slow or unavailable MySQL-backed ACTUS API must never delay live discovery.
 void fetchArticles().then(published=>{
  if(newsEpoch!==state.newsEpoch)return;
  state.articles=normalizeArticles(published);
  state.newsError=false;
 }).catch(()=>{
  if(newsEpoch!==state.newsEpoch)return;
  state.newsError=true;
  state.articles=[];
 }).finally(()=>{
  if(newsEpoch!==state.newsEpoch)return;
  state.newsLoading=false;
  fillArticleRail(state.articles.filter(matching),state.newsError);
  updateCatalogueStatus();
 });
 const results=await Promise.allSettled([fetchJson(API.home),fetchJson(API.top),fetchJson(API.games)]);
 const home=results[0].status==='fulfilled'?results[0].value.items:[];
 const top=results[1].status==='fulfilled'?results[1].value.items:[];
 const categories=results[2].status==='fulfilled'?results[2].value.categories:[];
 state.failed=results.map((result,i)=>result.status==='rejected'?Object.keys(API)[i]:null).filter(Boolean);
 state.lives=mergeLives(home,top);
 state.games=mergeGames(categories,state.lives);
 setHeroItems();
 render();
 startHeroRotation();
 state.loading=false;
 updateCatalogueStatus();
}

async function showGameLives(game){
 const section=create('div','scl-dialog-content'),body=create('div','scl-dialog-body');
 body.append(create('div','scl-dialog-meta','CRÉATEURS EN DIRECT'));
 const title=create('h2','',game.game);
 title.id='scl-dialog-title';
 body.append(title);
 body.append(create('p','',game.summary));
 const list=create('div','scl-cards');list.style.padding='0 0 12px';
 const notice=create('p','scl-preview-note','Recherche des directs associés à ce jeu…');
 body.append(notice,list);section.append(body);showDialog(section);
 let found=state.lives.filter(x=>x.gameSlug===game.gameSlug);
 try{
  const result=await fetchJson('/api/discovery/game-lives?game='+encodeURIComponent(game.game)+'&limit=12');
  const candidates=(result.items||[]).map(raw=>normalizeLive(raw)).filter(Boolean);
  const seen=new Set(found.map(x=>x.id));
  for(const live of candidates)if(!seen.has(live.id)){seen.add(live.id);found.push(live)}
 }catch{
  notice.textContent=found.length?'Résultats locaux uniquement : recherche étendue indisponible.':'Recherche des créateurs indisponible pour le moment.';
 }
 if(!dialog.open)return;
 if(found.length){
  notice.textContent=found.length+' créateur'+(found.length>1?'s':'')+' réellement en direct sur '+game.game+'.';
  list.replaceChildren(...found.slice(0,12).map(createCard));
 }else{
  notice.textContent='Aucun live confirmé pour ce jeu actuellement.';
  list.replaceChildren();
 }
 window.dispatchEvent(new Event('swapp:account-rendered'));
}
$('scl-search').addEventListener('input',event=>{
 state.query=event.target.value.trim().slice(0,120);
 feature(null);render();
});
document.querySelectorAll('[data-scl-filter]').forEach(button=>{
 button.addEventListener('click',()=>{
  state.filter=button.dataset.sclFilter;
  document.querySelectorAll('[data-scl-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  render();
 });
});
document.querySelectorAll('[data-scroll-left],[data-scroll-right]').forEach(button=>{
 button.addEventListener('click',()=>{
  const target=$(button.dataset.scrollLeft||button.dataset.scrollRight);
  if(!target)return;
  const direction=button.dataset.scrollLeft?-1:1;
  target.scrollBy({left:direction*Math.max(250,target.clientWidth*.74),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 });
});
window.addEventListener('swapp:library-changed',refreshFavorites);
window.addEventListener('storage',event=>{if(event.key===FAVORITES_KEY||event.key===CHANNEL_KEY||event.key===null)refreshFavorites()});
document.addEventListener('click',event=>{
 if(event.target.closest('[data-swapp-follow-game]')){
  requestAnimationFrame(refreshFavorites);
  setTimeout(refreshFavorites,300);
 }
});
window.SwappCatalogueLab=Object.freeze({version:LAB_VERSION,load});
void load();
})();
