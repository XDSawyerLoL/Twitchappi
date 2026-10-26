import { state, dom, api, esc, icon, initials, timeAgo, setStatus, errorText } from './core.js';
import { requireAuth } from './session.js';
import {loadVoiceNotes,renderVoiceNote} from './dm-audio.js?v=20261018-direct-audio-v1';
import { renderPost, renderPosts, notificationLabel } from './render.js?v=20261022-social-posts-v2';

let dmRefreshTimer=null,dmLastSignature='',dmRefreshInFlight=false,dmRefreshGeneration=0;
function stopDMRefresh(){
 dmRefreshGeneration++;
 if(dmRefreshTimer!==null){clearInterval(dmRefreshTimer);dmRefreshTimer=null}
 dmRefreshInFlight=false;
 dmLastSignature='';
}
function renderDMMessages(messages,userId,notes=[]){
 const textEntries=(Array.isArray(messages)?messages:[]).map(message=>({
  key:String(message.id||''),createdAt:Date.parse(message.createdAt)||0,
  html:'<div class="pulse-message '+(message.senderId===userId?'mine':'')+'">'+
   esc(message.body)+'<small>'+esc(timeAgo(message.createdAt))+'</small></div>'
 }));
 const voiceEntries=(Array.isArray(notes)?notes:[]).map(note=>({
  key:String(note.id||''),createdAt:Date.parse(note.createdAt)||0,
  html:renderVoiceNote(note,userId)
 }));
 return [...textEntries,...voiceEntries]
  .sort((a,b)=>a.createdAt-b.createdAt||a.key.localeCompare(b.key))
  .map(entry=>entry.html).join('');
}
function startDMRefresh(handle,revision,userId,initialMessages,initialNotes=[]){
 const generation=dmRefreshGeneration;
 let lastNotes=initialNotes;
 dmLastSignature=JSON.stringify({messages:(initialMessages||[]).map(m=>[m.id,m.createdAt,m.body]),notes:initialNotes.map(n=>n.id)});
 // Reading the thread never replaces the composer or discards an unsent draft.
 dmRefreshTimer=setInterval(async()=>{
  if(dmRefreshInFlight||generation!==dmRefreshGeneration||
   !isCurrent(revision,'messages')||document.visibilityState==='hidden')return;
  dmRefreshInFlight=true;
  try{
   const [result,notesResult]=await Promise.all([
    api('/api/pulse/messages/'+encodeURIComponent(handle)),loadVoiceNotes(handle)
   ]);
   if(generation!==dmRefreshGeneration||!isCurrent(revision,'messages'))return;
   const messages=Array.isArray(result.messages)?result.messages:[];
   if(Array.isArray(notesResult))lastNotes=notesResult;
   const signature=JSON.stringify({messages:messages.map(m=>[m.id,m.createdAt,m.body]),notes:lastNotes.map(n=>n.id)});
   if(signature===dmLastSignature)return;
   const list=document.querySelector('.social-dm-view .pulse-message-list');
   if(!list)return;
   const atEnd=list.scrollHeight-list.clientHeight-list.scrollTop<110;
   dmLastSignature=signature;
   list.innerHTML=renderDMMessages(messages,userId,lastNotes);
   if(atEnd)list.scrollTop=list.scrollHeight;
  }catch{
   // Keep the last readable messages and any draft when the backend is slow.
  }finally{
   // A stale request may finish after navigation; it must not release the
   // in-flight guard owned by a newer conversation.
   if(generation===dmRefreshGeneration)dmRefreshInFlight=false;
  }
 },10000);
}
let viewRevision=0;
export function setView(view,title){
  const revision=++viewRevision;
  stopDMRefresh();
  state.view=view;
  const social=document.getElementById('swappSocialNative');
  if(social)social.dataset.socialView=view;
  dom.viewTitle.textContent=title||'SOCIAL';
  document.querySelectorAll('[data-view]').forEach(function(button){
    button.classList.toggle('active',button.dataset.view===view);
  });
  dom.feedTabs.hidden=view!=='home';
  // Tabs stay mounted and actionable while RSS and ordinary feeds are loading.
  if(view==='home'){
    document.querySelectorAll('.pulse-tab').forEach(tab=>{
      const active=tab.dataset.feed===state.feed;
      tab.classList.toggle('active',active);
      tab.setAttribute('aria-pressed',String(active));
    });
  }
  dom.composer.hidden=view!=='home'||state.feed==='news';
  dom.welcome.hidden=true;
  const stories=document.getElementById('swapp-social-stories');
  if(stories)stories.hidden=view!=='home'||state.feed==='news'||
    !document.getElementById('swapp-social-stories-track')?.children.length;
  return revision;
}
const isCurrent=(revision,view)=>revision===viewRevision&&state.view===view;
function showRecoverableError(title,error,retry,handle=''){
  setStatus(title,errorText(error));
  if(!dom.feed||typeof document.createElement!=='function'||typeof dom.feed.append!=='function')return;
  const button=document.createElement('button');
  button.type='button';button.className='social-timeline-retry';
  button.dataset.socialRetry=retry;
  if(handle)button.dataset.socialHandle=String(handle);
  button.textContent='Réessayer';
  dom.feed.append(button);
}


const NEWS_FEEDS=['/api/actus'];

function safeNewsUrl(value){
  try{const url=new URL(String(value||''));return url.protocol==='https:'&&!url.username&&!url.password?url.href:''}catch{return''}
}

// Same media order as SWAPP editorial: article illustration, then that
// article's official trailer poster. Never select another game's image.
function safeNewsMedia(article){
  const fromShared=globalThis.SwappArticleExtras?.cardImageSources?.(article);
  if(Array.isArray(fromShared)){
    for(const source of fromShared){if(safeNewsUrl(source))return safeNewsUrl(source)}
  }
  const cover=article?.thumbnail?.url||article?.image?.url||article?.imageUrl||
    (typeof article?.image==='string'?article.image:'');
  if(safeNewsUrl(cover))return safeNewsUrl(cover);
  try{
    const u=new URL(String(article?.trailerUrl||''));
    if(u.protocol!=='https:'||u.username||u.password)return '';
    let id='';
    if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname))
      id=u.pathname==='/watch'?u.searchParams.get('v')||'':
        /^\/(?:embed|shorts)\/[A-Za-z0-9_-]{11}$/.test(u.pathname)?u.pathname.split('/')[2]:'';
    else if(u.hostname==='youtu.be'&&/^\/[A-Za-z0-9_-]{11}$/.test(u.pathname))
      id=u.pathname.slice(1);
    return /^[A-Za-z0-9_-]{11}$/.test(id)?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'';
  }catch{return ''}
}

function newsTime(iso){
  const t=Date.parse(String(iso||''));if(!Number.isFinite(t))return'';
  const mins=Math.max(0,Math.floor((Date.now()-t)/60000));
  if(mins<60)return mins+' min';
  const hours=Math.floor(mins/60);if(hours<24)return hours+' h';
  return new Date(t).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
}

let cachedNewsFeed=null;
let cachedNewsFeedAt=0;
async function fetchNewsFeed(){
  if(cachedNewsFeed&&Date.now()-cachedNewsFeedAt<60000)return cachedNewsFeed;
  let lastError;
  for(const endpoint of NEWS_FEEDS){
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),8500);
      let data;
      try{
        const response=await fetch(endpoint+(endpoint.includes('?')?'&':'?')+'v='+Date.now(),{
          credentials:'same-origin',cache:'no-store',signal:controller.signal
        });
        if(!response.ok)throw new Error('HTTP '+response.status);
        data=await response.json();
      }finally{clearTimeout(timeout)}
      if(Array.isArray(data.articles)){
       const items=data.articles.filter(a=>a&&/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(a.slug||'')))
        .map(a=>{
         // Only use an explicit game field. Never guess game identity from headlines.
         const rawGame=a.game?.name||a.game||a.game_name||a.gameName||a.primaryGame||
          (Array.isArray(a.games)?(a.games[0]?.name||a.games[0]):'');
         return {title:String(a.title||''),source:'SWAPP',url:location.origin+'/actus/'+encodeURIComponent(a.slug),
         image:safeNewsMedia(a),summary:String(a.summary||''),
         game:typeof rawGame==='string'?rawGame.trim().slice(0,65):'',
         publishedAt:a.publishedAt||a.originalPublishedAt};
        });
       cachedNewsFeed={items:items.filter(item=>item.title)};
       cachedNewsFeedAt=Date.now();
       return cachedNewsFeed;
      }
      throw new Error('invalid_swapp_news_feed');
    }catch(error){lastError=error}
  }
  throw lastError||new Error('news_feed_unavailable');
}

function renderNewsCard(item){
  const title=String(item.title||'Actualité');
  const source=String(item.source||'SWAPP Actualité');
  const url=safeNewsUrl(item.url||item.articleUrl);
  const image=safeNewsUrl(item.image);
  const summary=String(item.summary||'').slice(0,280);
  return '<article class="pulse-news-card'+(image?'':' is-text-only')+'">'+
    (image?'<a class="pulse-news-media" href="'+esc(url||image)+'" target="_blank" rel="noopener noreferrer" aria-label="Lire : '+esc(title)+'"><img src="'+esc(image)+'" alt="Illustration de '+esc(title)+'" loading="lazy" referrerpolicy="no-referrer"></a>':'')+
    '<div class="pulse-news-body"><div class="pulse-news-meta"><span>SWAPP</span><strong>'+esc(source)+'</strong><span>'+esc(newsTime(item.publishedAt))+'</span></div>'+
    '<h2>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(title)+'</a>':esc(title))+'</h2>'+
    (summary?'<p>'+esc(summary)+(String(item.summary||'').length>280?'…':'')+'</p>':'')+
    '<div class="pulse-news-actions">'+
      (url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Lire la source ↗</a>':'')+
      '<button type="button" data-news-repost data-news-title="'+esc(title)+'" data-news-source="'+esc(source)+'" data-news-url="'+esc(url)+'" data-news-image="'+esc(image)+'">Reposter</button>'+
      '<button type="button" data-news-comment data-news-title="'+esc(title)+'" data-news-url="'+esc(url)+'" data-news-image="'+esc(image)+'">Reposter avec commentaire</button>'+
      (url?'<button type="button" data-news-share data-news-url="'+esc(url)+'" data-news-title="'+esc(title)+'">Partager</button>':'')+
      (item.game?'<button type="button" data-next-game="'+esc(item.game)+'">Discuter du jeu ↗</button>':'')+
    '</div></div></article>';
}

export async function loadNewsRss(){
  state.feed='news';
  const revision=setView('home','SWAPP Actualité');
  document.querySelectorAll('.pulse-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.feed==='news'));
  dom.composer.hidden=true;
  setStatus('Connexion à SWAPP Actualité','Lecture du flux…');
  try{
    const data=await fetchNewsFeed();
    if(!isCurrent(revision,'home')||state.feed!=='news')return;
    const items=(data.items||[]).filter(item=>item&&item.title).sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,50);
    dom.feed.innerHTML=items.length
      ? '<section class="pulse-news-view"><div class="pulse-news-intro"><span>SWAPP ACTUALITÉ · FLUX</span><h2>Actualités à lire et à reposter</h2><p>Partage une actualité avec son visuel et son lien, puis retire ton repost directement depuis le fil.</p></div><div class="pulse-news-grid">'+items.map(renderNewsCard).join('')+'</div></section>'
      : '<div class="pulse-status"><strong>Flux vide</strong>Aucune actualité disponible pour le moment.</div>';
    // Reconcile the user's previous RSS shares AFTER displaying the articles.
    // A slow MySQL session must never hold the public news feed hostage.
    const userHandle=state.user?.handle;
    if(userHandle)void api('/api/pulse/users/'+encodeURIComponent(userHandle)).then(personal=>{
      if(!isCurrent(revision,'home')||state.feed!=='news')return;
      const ownRelays=new Map();
      for(const post of Array.isArray(personal?.posts)?personal.posts:[]){
        if(!post?.id||!post.linkUrl||!post.linkTitle||String(post.body||'').trim()!==String(post.linkTitle).trim())continue;
        if(!ownRelays.has(post.linkUrl))ownRelays.set(post.linkUrl,post.id);
      }
      dom.feed.querySelectorAll('[data-news-repost]').forEach(button=>{
        if(button.dataset.newsTouched||button.dataset.newsPostedId)return;
        const id=ownRelays.get(button.dataset.newsUrl);
        if(!id)return;
        button.dataset.newsPostedId=id;
        button.classList.add('done');
        button.textContent='Annuler le repost';
      });
    }).catch(()=>{});
  }catch(error){
    if(isCurrent(revision,'home')&&state.feed==='news')
      setStatus('SWAPP Actualité indisponible','Impossible de lire le flux pour le moment.');
  }
}

async function appendRealNewsToDiscovery(revision,hasPosts){
 const feed=dom.feed;
 if(!feed)return;
 try{
  const response=await fetchNewsFeed();
  if(!isCurrent(revision,'home')||state.feed!=='discover'||!feed.isConnected)return;
  const items=(response.items||[]).filter(x=>x&&x.title)
   .sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,3);
  if(!items.length)return;
  // This is an editorial feed, not fabricated SOCIAL posts. Do not write to
  // Pulse or change the user's following feed. Real posts remain untouched.
  const section=document.createElement('section');
  section.className='pulse-starter-news pulse-news-in-timeline';
  section.setAttribute('aria-label','Actualités SWAPP à partager');
  section.innerHTML='<header class="pulse-starter-news-head"><span>SWAPP · ACTUALITÉ</span>'+
   '<h2>Les jeux font l’actualité.</h2>'+
   '<p>Articles publiés sur SWAPP. Partage-les ou discutes-en dans SOCIAL.</p>'+
   '</header><div class="pulse-news-grid">'+items.map(renderNewsCard).join('')+'</div>'+
   '<footer class="pulse-news-end"><button type="button" data-feed-switch="news">Toutes les actualités →</button></footer>';
  if(!hasPosts)feed.replaceChildren(section);
  else{
   // Surface editorial news after the second real SOCIAL publication.
   // A large social feed must not bury the latest news 40 posts below.
   const posts=Array.from(feed.children).filter(node=>node.classList?.contains('pulse-post'));
   const anchor=posts[Math.min(1,posts.length-1)];
   if(anchor)anchor.after(section);
   else feed.append(section);
  }
 }catch{
  // An unavailable news service must not replace real SOCIAL posts.
 }
}

export async function loadHome(){
  if(state.feed==='news')return loadNewsRss();
  const feedMode=state.feed;
  const revision=setView('home','Le fil');
  setStatus('Chargement du fil','');
  try{
    const data=await api('/api/pulse/feed?mode='+feedMode+'&limit=40');
    if(!isCurrent(revision,'home')||state.feed!==feedMode)return;
    const posts=Array.isArray(data.posts)?data.posts:[];
    renderPosts(posts,state.user&&state.feed==='following'?'Suis des comptes ou publie le premier message de ton fil.':'Aucune publication publique.');
    if(state.feed==='discover')void appendRealNewsToDiscovery(revision,posts.length>0);
  }catch(error){
    if(isCurrent(revision,'home')&&state.feed===feedMode)
      showRecoverableError('Fil momentanément indisponible',error,'home');
  }
}

let latestExploreRequest=0;

export async function loadExplore(query='',{gameContext=false}={}){
  const requestId=++latestExploreRequest;
  query=String(query||'').trim().slice(0,100);
  const revision=setView('explore',gameContext?'Autour de '+query:'Explorer');
  const form='<form id="social-mobile-search-form" class="pulse-mobile-search" role="search">'+
    '<label for="social-mobile-query">Rechercher dans SOCIAL et les actualités SWAPP</label>'+
    '<div class="pulse-mobile-search-row"><input id="social-mobile-query" type="search" name="query" minlength="2" maxlength="100" autocomplete="off" placeholder="Jeu, article, pseudo ou discussion…" value="'+esc(query)+'" required>'+
    '<button type="submit">Rechercher</button></div></form>';
  const intro='<section class="pulse-view pulse-explore-view"><div class="pulse-view-head">'+
    '<h2>'+(gameContext?'Autour de '+esc(query):query?'Résultats de recherche':'Tout commence par une découverte.')+'</h2>'+
    '<p>'+(gameContext?'Actualités portant sur ce jeu, créateurs et conversations disponibles. Les résultats absents ne sont pas inventés.':query?'Membres, publications et actualités correspondant à ta recherche.':
        'Retrouve un membre SWAPP, un jeu ou une conversation dans un seul espace.')+'</p></div>'+form;
  dom.feed.innerHTML=intro+'</section>';
  const newsTask=fetchNewsFeed();
  const socialTask=query.length>=2
    ?api('/api/pulse/search?q='+encodeURIComponent(query))
    :Promise.resolve({users:[],posts:[]});
  const results=await Promise.allSettled([socialTask,newsTask]);
  // Ignore delayed responses when the visitor has navigated or entered a newer query.
  if(requestId!==latestExploreRequest||!isCurrent(revision,'explore'))return;
  const social=results[0].status==='fulfilled'?results[0].value:{users:[],posts:[]};
  const news=results[1].status==='fulfilled'&&Array.isArray(results[1].value.items)
    ?results[1].value.items:[];
  const matches=items=>items.filter(item=>{
    if(!item||!item.title)return false;
    if(query.length<2)return true;
    if(gameContext){
      // Editorial results must carry an explicit game, not a title guess.
      const game=String(item.game||'').trim();
      const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      return !!game&&(window.SwappGameIdentity?.sameGame?.(game,query)||norm(game)===norm(query));
    }
    const words=(String(item.title)+' '+String(item.summary||'')+' '+String(item.game||'')).toLocaleLowerCase('fr-FR');
    return words.includes(query.toLocaleLowerCase('fr-FR'));
  });
  const articles=matches(news).sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0))
    .slice(0,query.length>=2?8:4);
  const users=Array.isArray(social.users)?social.users:[];
  const posts=Array.isArray(social.posts)?social.posts:[];
  let html=intro;
  if(query.length>=2){
    if(users.length){
      html+='<div class="pulse-explore-results-head"><h3>Membres</h3><small>'+users.length+' résultat'+(users.length===1?'':'s')+'</small></div>'+
        '<div class="pulse-card-list">';
      users.forEach(user=>{
        html+='<div class="pulse-card pulse-user-card"><div class="pulse-avatar">'+esc(initials(user))+'</div>'+
          '<div><strong>'+esc(user.displayName||user.handle)+'</strong><small>@'+esc(user.handle||'')+'</small></div>'+
          '<button class="pulse-mini-button" data-profile="'+esc(user.handle)+'">Voir le profil</button></div>';
      });
      html+='</div>';
    }
    if(posts.length){
      html+='<div class="pulse-explore-results-head"><h3>Publications</h3><small>'+posts.length+
        ' résultat'+(posts.length===1?'':'s')+'</small></div>'+posts.map(renderPost).join('');
    }
    if(results[0].status==='rejected')
      html+='<p class="pulse-explore-help">Les profils et publications sont momentanément indisponibles. Les articles SWAPP restent accessibles.</p>';
  }else{
    html+='<p class="pulse-explore-help">Recherche un pseudo, un titre de jeu ou un sujet. Voici aussi les dernières actualités publiées.</p>';
  }
  if(articles.length){
    html+='<section class="pulse-explore-results-news"><div class="pulse-explore-results-head"><h3>'+
      (query.length>=2?'Actualités SWAPP':'À lire en ce moment')+'</h3>'+
      '<small>'+articles.length+' article'+(articles.length===1?'':'s')+'</small></div>'+
      '<div class="pulse-news-grid">'+articles.map(renderNewsCard).join('')+'</div></section>';
  }
  if(query.length>=2&&!users.length&&!posts.length&&!articles.length){
    html+='<div class="pulse-explore-nothing"><strong>Aucun résultat pour « '+esc(query)+' ».</strong>'+
     '<p>Essaie un autre titre ou un pseudo SWAPP, ou <a href="/actus">parcours les actualités</a>.</p></div>';
  }else if(query.length<2&&!articles.length){
    html+='<div class="pulse-explore-nothing">Aucune actualité disponible pour le moment. Saisis au moins deux caractères pour chercher un membre ou une publication.</div>';
  }
  dom.feed.innerHTML=html+'</section>';
}

export async function loadCircles(){
  const revision=setView('circles','Groupes publics');
  setStatus('Chargement des groupes publics','');
  try{
    const data=await api('/api/pulse/circles');
    if(!isCurrent(revision,'circles'))return;
    let html='<section class="pulse-view"><div class="pulse-view-head"><h2>Groupes publics</h2><p>Rejoins un groupe existant ou crée le tien. Pour discuter en texte et en vocal, ouvre les espaces communautaires.</p></div>'+
      '<nav class="pulse-community-shortcuts" aria-label="Navigation des communautés"><button type="button" data-view="rooms">← Mes espaces et salons</button><button type="button" data-view="play">Trouver une équipe</button></nav>';
    if(state.user)html+='<form class="pulse-inline-form two" id="circle-create"><input name="name" minlength="3" maxlength="60" placeholder="Nom de ton groupe" required><input name="description" maxlength="240" placeholder="De quoi parle ce groupe ?"><button class="pulse-mini-button primary">Créer mon groupe</button></form>';
    html+='<div class="pulse-card-list">';
    if(!data.circles.length)html+='<div class="pulse-card"><p>Aucun groupe public pour le moment. Tu peux en créer un ci-dessus ou ouvrir ton espace privé.</p></div>';
    data.circles.forEach(function(circle){
      html+='<div class="pulse-card"><div class="pulse-card-row"><div><h3>'+esc(circle.name)+'</h3><div class="pulse-card-meta">'+circle.memberCount+' membres · '+esc(circle.visibility)+'</div></div><button class="pulse-mini-button '+(circle.joined?'':'primary')+'" data-circle-join="'+esc(circle.id)+'">'+(circle.joined?'Quitter':'Rejoindre')+'</button></div><p>'+esc(circle.description||'')+'</p></div>';
    });
    dom.feed.innerHTML=html+'</div></section>';
  }catch(error){
    if(isCurrent(revision,'circles'))setStatus('Communautés indisponibles',errorText(error));
  }
}

export async function loadNotifications(){
  if(!requireAuth())return;
  const revision=setView('notifications','Notifications');
  setStatus('Chargement','');
  try{
    const data=await api('/api/pulse/notifications');
    if(!isCurrent(revision,'notifications'))return;
    let html='<section class="pulse-view"><div class="pulse-view-head"><h2>Notifications</h2><p>Les interactions importantes, sans fabriquer une boucle d’attention.</p></div><div class="pulse-card-list">';
    if(!data.notifications.length)html+='<div class="pulse-card"><p>Aucune notification.</p></div>';
    data.notifications.forEach(function(notification){
      const actor=notification.actor||{};
      html+='<div class="pulse-card pulse-notification '+(notification.read?'':'unread')+'"><strong>'+esc(actor.displayName||'Quelqu’un')+'</strong> '+esc(notificationLabel(notification.type))+'<div class="pulse-card-meta">'+esc(timeAgo(notification.createdAt))+'</div></div>';
    });
    dom.feed.innerHTML=html+'</div></section>';
    try{await api('/api/pulse/notifications/read',{method:'POST',body:'{}'})}catch{}
  }catch(error){
    if(isCurrent(revision,'notifications'))setStatus('Notifications indisponibles',errorText(error));
  }
}

export async function loadSaved(){
  if(!requireAuth())return;
  const revision=setView('saved','Enregistrés');
  setStatus('Chargement','');
  try{
    const data=await api('/api/pulse/me/bookmarks');
    if(!isCurrent(revision,'saved'))return;
    renderPosts(data.posts,'Tu n’as encore enregistré aucune publication.');
  }catch(error){
    if(isCurrent(revision,'saved'))setStatus('Enregistrés indisponibles',errorText(error));
  }
}

export async function loadProfile(handle){
  if(!handle){
    if(!requireAuth())return;
    handle=state.user.handle;
  }
  const revision=setView('profile','Profil');
  setStatus('Chargement du profil','');
  try{
    const data=await api('/api/pulse/users/'+encodeURIComponent(handle));
    if(!isCurrent(revision,'profile'))return;
    const user=data.user;
    const self=state.user&&state.user.id===user.id;
    let actions='';

    if(self){
      actions='<button class="pulse-mini-button primary" data-profile-edit>Modifier</button><button type="button" class="pulse-mini-button" data-view="saved">Mes publications enregistrées</button><button class="pulse-mini-button" data-export>Exporter mes données</button>';
    }else if(state.user){
      actions='<button class="pulse-mini-button primary" data-follow="'+esc(user.handle)+'">'+(user.isFollowing?'Se désabonner':'Suivre')+'</button><button class="pulse-mini-button" data-message-user="'+esc(user.handle)+'">Message</button><button class="pulse-mini-button danger" data-block="'+esc(user.handle)+'">Bloquer</button>';
    }

    // A passport is the user's explicit MySQL profile, not guesses from post text.
    let actualPassport=null;
    try{
      const own=!!state.user&&String(state.user.handle).toLowerCase()===String(user.handle).toLowerCase();
      const route=own?'passport/me':'passport/'+encodeURIComponent(user.handle);
      const response=await fetch('/api/swapp/interactions/'+route,{
        credentials:'same-origin',headers:{Accept:'application/json'},
        cache:'no-store',signal:typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(4500):undefined
      });
      if(response.ok)actualPassport=(await response.json()).passport||null;
    }catch{}
    if(!isCurrent(revision,'profile'))return;
    const games=Array.isArray(actualPassport?.games)?actualPassport.games:[];
    const passport='<section class="pulse-card pulse-profile-games" aria-label="Passeport joueur">'+
      '<span class="pulse-kicker">PASSEPORT JOUEUR · SWAPP</span><h3>Univers gaming</h3>'+
      (actualPassport?
        '<p>'+esc(actualPassport.platform||'')+' · '+esc(actualPassport.style||'')+
          (actualPassport.availability?' · '+esc(actualPassport.availability):'')+'</p>':
        '<p>Aucun passeport public disponible pour ce compte.</p>')+
      (games.length?'<div class="pulse-profile-game-list">'+games.map(game=>
        '<a href="/social?game='+encodeURIComponent(game)+'">'+esc(game)+'</a>').join('')+'</div>':'')+
      (self?'<button type="button" class="pulse-mini-button" data-view="play">Gérer mon passeport ↗</button>':'')+
      '</section>';
    dom.feed.innerHTML=passport+'<section class="pulse-profile-hero"><div class="pulse-avatar">'+esc(initials(user))+'</div><h2>'+esc(user.displayName)+'</h2><div class="handle">@'+esc(user.handle)+'</div><p>'+esc(user.bio||'Aucune bio pour le moment.')+'</p><div class="pulse-profile-stats"><span><strong>'+user.followers+'</strong> abonnés</span><span><strong>'+user.following+'</strong> abonnements</span></div><div class="pulse-profile-actions">'+actions+'</div></section>'+((data.posts||[]).map(renderPost).join('')||'<div class="pulse-status"><strong>Aucune publication</strong></div>');
  }catch(error){
    if(isCurrent(revision,'profile'))setStatus('Profil indisponible',errorText(error));
  }
}

async function socialAuthRecovery(error,section){
  if(!['swapp_account_required','unauthorized'].includes(error?.message))return false;
  try{
    const response=await fetch('/api/oryon/session',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();
    if(data?.success&&data?.local?.id)return true;
  }catch{}
  return false;
}

export async function loadMessages(){
  if(!requireAuth())return;
  const revision=setView('messages','Messages');
  setStatus('Chargement','');
  try{
    const data=await api('/api/pulse/conversations');
    if(!isCurrent(revision,'messages'))return;
    const conversations=Array.isArray(data.conversations)?data.conversations:[];
    let html='<section class="pulse-view pulse-inbox-view"><div class="pulse-view-head pulse-inbox-head"><div><h2>Messages</h2><p>Tes conversations avec les membres SWAPP.</p></div><button type="button" class="pulse-mini-button primary" data-new-message-toggle aria-expanded="false" aria-controls="new-message">+ Nouveau message</button></div>'+
      '<form class="pulse-inline-form pulse-new-message-form" id="new-message" hidden><label for="pulse-dm-recipient">Rechercher un membre SWAPP</label><input id="pulse-dm-recipient" name="handle" placeholder="Pseudo SWAPP" autocomplete="off" minlength="2" required>'+
      '<div class="pulse-dm-user-results" id="pulse-dm-user-results" aria-live="polite"></div><label for="pulse-dm-first-body">Ton premier message</label><input id="pulse-dm-first-body" name="body" maxlength="2000" placeholder="Écrire un message…" required><button type="submit" class="pulse-mini-button primary">Démarrer la conversation</button></form><div class="pulse-card-list">';
    if(!conversations.length)html+='<div class="pulse-card pulse-inbox-empty"><h3>Aucune conversation pour le moment</h3><p>Utilise « Nouveau message » pour rechercher un membre et lui écrire.</p></div>';
    conversations.forEach(function(conversation){
      const user=conversation.user;
      if(!user)return;
      const count=Math.min(99,Math.max(0,Number(conversation.unreadCount||0)||0));
      const last=conversation.lastMessage||{};
      html+='<button type="button" class="pulse-card pulse-user-card pulse-conversation'+(count?' is-unread':'')+'" data-conversation="'+esc(user.handle)+'"><div class="pulse-avatar">'+esc(initials(user))+'</div>'+
       '<div class="pulse-conversation-preview"><strong>'+esc(user.displayName||user.handle)+'</strong><small>'+esc(last.body||'Nouvelle conversation')+'</small></div>'+
       '<span class="pulse-conversation-meta">'+(last.createdAt?'<time>'+esc(timeAgo(last.createdAt))+'</time>':'')+(count?'<b class="pulse-unread-count" aria-label="'+count+' message(s) non lu(s)">'+count+'</b>':'')+'</span></button>';
    });
    dom.feed.innerHTML=html+'</div></section>';
  }catch(error){
    if(!isCurrent(revision,'messages'))return;
    const accountIsValid=await socialAuthRecovery(error,'Messages');
    if(isCurrent(revision,'messages'))showRecoverableError('Messages indisponibles',
      accountIsValid?new Error('Le serveur SOCIAL est momentanément indisponible. Tes autres espaces SWAPP restent disponibles.'):error,'messages');
  }
}


function renderDMConversationLinks(conversations,currentHandle){
 const rows=Array.isArray(conversations)?conversations:[];
 return rows.map(conversation=>{
  const user=conversation?.user;
  if(!user?.handle)return '';
  const active=String(user.handle).toLowerCase()===String(currentHandle||'').toLowerCase();
  const count=Math.min(99,Math.max(0,Number(conversation.unreadCount||0)||0));
  const last=conversation.lastMessage||{};
  return '<button type="button" class="pulse-card pulse-user-card pulse-conversation'+(active?' is-active':'')+
   (count&&!active?' is-unread':'')+'" data-conversation="'+esc(user.handle)+'"'+
   (active?' aria-current="true"':'')+'>'+
   '<div class="pulse-avatar">'+esc(initials(user))+'</div>'+
   '<div class="pulse-conversation-preview"><strong>'+esc(user.displayName||user.handle)+'</strong>'+
   '<small>'+esc(last.body||'Nouvelle conversation')+'</small></div>'+
   '<span class="pulse-conversation-meta">'+(last.createdAt?'<time>'+esc(timeAgo(last.createdAt))+'</time>':'')+
   (count&&!active?'<b class="pulse-unread-count">'+count+'</b>':'')+'</span></button>';
 }).join('');
}

export async function loadConversation(handle){
  if(!requireAuth())return;
  const revision=setView('messages','@'+handle);
  setStatus('Chargement','');
  try{
    const [data,notes]=await Promise.all([
      api('/api/pulse/messages/'+encodeURIComponent(handle)),loadVoiceNotes(handle)
    ]);
    if(!isCurrent(revision,'messages'))return;
    let html='<section class="pulse-view social-dm-workspace">'+
     '<aside class="social-dm-conversations" aria-label="Conversations SWAPP">'+
      '<div class="social-dm-conversations-head"><strong>Messages</strong>'+
      '<button type="button" data-social-back-messages aria-label="Voir toutes les conversations">Tout voir</button></div>'+
      '<div class="social-dm-conversations-list" data-dm-conversations-list aria-live="polite">'+
      '<p class="social-dm-loading">Chargement des conversations…</p></div></aside>'+
      '<div class="social-dm-active-thread"><section class="pulse-view social-dm-view">'+
      '<div class="pulse-view-head social-dm-head"><button type="button" class="social-dm-back" data-social-back-messages aria-label="Retour aux messages">←</button><div class="social-dm-identity"><div class="social-dm-avatar" aria-hidden="true">'+esc(initials(data.user))+'</div><div><h2>'+esc(data.user.displayName)+'</h2><p>@'+esc(data.user.handle)+'</p></div></div><button type="button" class="pulse-dm-call-button" data-call-handle="'+esc(handle)+'" aria-label="Appeler '+esc(handle)+' en audio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3a16 16 0 0 0 15 15l-3 4c-7 0-16-9-16-16l4-3Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>Appeler</button></div><div class="pulse-message-list">';
    html+=renderDMMessages(data.messages,state.user.id,notes);
    html+='</div><div class="pulse-dm-audio-controls" data-handle="'+esc(handle)+'" aria-label="Enregistrement vocal">'+
     '<div class="pulse-audio-composer-head"><span class="pulse-audio-composer-icon" aria-hidden="true">▥</span><span><strong>Message vocal</strong><small>30 secondes maximum · écoute avant envoi</small></span><time data-voice-timer aria-label="Durée du message">0:00</time></div>'+
     '<div class="pulse-audio-composer-actions">'+
     '<button type="button" data-voice-start aria-label="Enregistrer un message vocal">Enregistrer</button>'+
     '<button type="button" data-voice-stop hidden>Terminer</button>'+
     '<button type="button" data-voice-send hidden>Envoyer le vocal</button>'+
     '<button type="button" data-voice-cancel hidden>Effacer</button></div>'+
     '<audio data-voice-preview controls preload="none" hidden aria-label="Prévisualiser mon message vocal"></audio>'+
     '<p data-voice-status role="status" aria-live="polite">Ton micro ne sera activé qu’après avoir appuyé sur Enregistrer.</p></div>'+
     '<form class="pulse-message-form" id="conversation-form" data-handle="'+esc(handle)+'"><input name="body" maxlength="2000" placeholder="Écrire un message…" required><button type="button" class="pulse-emoji-toggle pulse-dm-emoji" data-emoji-toggle aria-label="Insérer une emote dans le message" aria-haspopup="true" aria-expanded="false" title="Emotes SWAPP">☺</button><button class="pulse-mini-button primary">Envoyer</button></form></section></div></section>';
    dom.feed.innerHTML=html;
    // Conversation windows start at the newest message, including after send.
    const thread=dom.feed.querySelector('.pulse-message-list');
    if(thread)thread.scrollTop=thread.scrollHeight;
    startDMRefresh(handle,revision,state.user.id,data.messages,notes);
    // Secondary list is non-blocking: opening a direct message does not
    // depend on a second backend request to load the conversation index.
    const threads=dom.feed.querySelector('[data-dm-conversations-list]');
    void api('/api/pulse/conversations').then(result=>{
      if(!isCurrent(revision,'messages')||!threads?.isConnected)return;
      const html=renderDMConversationLinks(result.conversations,handle);
      threads.innerHTML=html||'<p class="social-dm-loading">Aucune autre conversation.</p>';
    }).catch(()=>{
      if(isCurrent(revision,'messages')&&threads?.isConnected)
       threads.innerHTML='<p class="social-dm-loading">Liste momentanément indisponible.</p>';
    });
  }catch(error){
    if(!isCurrent(revision,'messages'))return;
    const accountIsValid=await socialAuthRecovery(error,'Conversation');
    if(isCurrent(revision,'messages'))showRecoverableError('Conversation indisponible',
      accountIsValid?new Error('Le serveur SOCIAL est momentanément indisponible. Tes autres espaces SWAPP restent disponibles.'):error,'conversation',handle);
  }
}

export async function loadCirclePreview(){
  try{
    const data=await api('/api/pulse/circles');
    const target=document.getElementById('circle-preview');
    target.innerHTML=data.circles.slice(0,3).map(function(circle){
      return '<button class="circle" data-view="circles"><span class="circle-mark">'+esc(circle.name.slice(0,2).toUpperCase())+'</span><span><strong>'+esc(circle.name)+'</strong><small>'+circle.memberCount+' membres</small></span><span class="circle-chevron">'+icon('pi-chevron')+'</span></button>';
    }).join('')||'<div class="pulse-circle-empty"><span>À TOI DE JOUER</span><strong>Lance la première communauté.</strong><p>Un jeu, une passion, une équipe : crée un espace pour en discuter.</p><button type="button" class="pulse-circle-create-cta" data-social-create-circle>Créer une communauté ↗</button></div>';
  }catch{
    document.getElementById('circle-preview').innerHTML='<div class="pulse-panel-loading">Indisponible</div>';
  }
}
