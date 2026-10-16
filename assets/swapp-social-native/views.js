import { state, dom, api, esc, icon, initials, timeAgo, setStatus, errorText } from './core.js';
import { requireAuth } from './session.js';
import { renderPost, renderPosts, notificationLabel } from './render.js';

export function setView(view,title){
  state.view=view;
  dom.viewTitle.textContent=title||'SOCIAL';
  document.querySelectorAll('[data-view]').forEach(function(button){
    button.classList.toggle('active',button.dataset.view===view);
  });
  dom.feedTabs.hidden=view!=='home';
  dom.composer.hidden=view!=='home'||!state.user;
  dom.welcome.hidden=view!=='home'||!!state.user;
}

const NEWS_FEEDS=['/api/actus'];

function safeNewsUrl(value){
  try{const url=new URL(String(value||''));return url.protocol==='https:'?url.href:''}catch{return''}
}

function newsTime(iso){
  const t=Date.parse(String(iso||''));if(!Number.isFinite(t))return'';
  const mins=Math.max(0,Math.floor((Date.now()-t)/60000));
  if(mins<60)return mins+' min';
  const hours=Math.floor(mins/60);if(hours<24)return hours+' h';
  return new Date(t).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
}

async function fetchNewsFeed(){
  let lastError;
  for(const endpoint of NEWS_FEEDS){
    try{
      const response=await fetch(endpoint+(endpoint.includes('?')?'&':'?')+'v='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(Array.isArray(data.articles)){
       const items=data.articles.filter(a=>a&&/^[a-z0-9][a-z0-9-]{2,109}[a-z0-9]$/.test(String(a.slug||'')))
        .map(a=>({title:String(a.title||''),source:'SWAPP',url:location.origin+'/actus/'+encodeURIComponent(a.slug),
         image:typeof a.image==='object'?a.image?.url:String(a.imageUrl||''),summary:String(a.summary||''),
         publishedAt:a.publishedAt||a.originalPublishedAt}));
       return {items};
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
  return '<article class="pulse-news-card">'+
    (image?'<a class="pulse-news-media" href="'+esc(url||image)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(image)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></a>':'')+
    '<div class="pulse-news-body"><div class="pulse-news-meta"><span>RSS</span><strong>'+esc(source)+'</strong><span>'+esc(newsTime(item.publishedAt))+'</span></div>'+
    '<h2>'+esc(title)+'</h2>'+
    (summary?'<p>'+esc(summary)+(String(item.summary||'').length>280?'…':'')+'</p>':'')+
    '<div class="pulse-news-actions">'+
      (url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Lire la source ↗</a>':'')+
      '<button type="button" data-news-repost data-news-title="'+esc(title)+'" data-news-source="'+esc(source)+'" data-news-url="'+esc(url)+'" data-news-image="'+esc(image)+'">Reposter sur SOCIAL</button>'+
    '</div></div></article>';
}

export async function loadNewsRss(){
  state.feed='news';
  setView('home','SWAPP Actualité');
  document.querySelectorAll('.pulse-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.feed==='news'));
  dom.composer.hidden=true;
  setStatus('Connexion à SWAPP Actualité','Lecture du flux…');
  try{
    const data=await fetchNewsFeed();
    const items=(data.items||[]).filter(item=>item&&item.title).sort((a,b)=>Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)).slice(0,50);
    dom.feed.innerHTML=items.length
      ? '<section class="pulse-news-view"><div class="pulse-news-intro"><span>SWAPP ACTUALITÉ · FLUX</span><h2>Actualités à lire et à reposter</h2><p>Le flux SWAPP Actualité est intégré à SOCIAL. Un repost crée une publication avec le titre, la source, le lien et l’image.</p></div><div class="pulse-news-grid">'+items.map(renderNewsCard).join('')+'</div></section>'
      : '<div class="pulse-status"><strong>Flux vide</strong>Aucune actualité disponible pour le moment.</div>';
  }catch(error){
    setStatus('SWAPP Actualité indisponible','Impossible de lire le flux pour le moment.');
  }
}

export async function loadHome(){
  if(state.feed==='news')return loadNewsRss();
  setView('home','Accueil');
  setStatus('Chargement du fil','');
  try{
    const data=await api('/api/pulse/feed?mode='+state.feed+'&limit=40');
    renderPosts(data.posts,state.user&&state.feed==='following'?'Suis des comptes ou publie le premier message de ton fil.':'Aucune publication publique.');
  }catch(error){
    setStatus('SOCIAL indisponible',errorText(error));
  }
}

export async function loadExplore(query=''){
  setView('explore','Explorer');
  // On mobile, the sidebar search is hidden. Keep a real search control inside
  // the Explore view instead of routing users to an unusable empty screen.
  const form='<form id="social-mobile-search-form" class="pulse-mobile-search" role="search">'+
    '<label for="social-mobile-query">Rechercher dans SOCIAL</label>'+
    '<div class="pulse-mobile-search-row"><input id="social-mobile-query" type="search" name="query" minlength="2" maxlength="100" autocomplete="off" placeholder="Personne, sujet, publication…" value="'+esc(query)+'" required>'+
    '<button type="submit">Rechercher</button></div></form>';
  if(query.trim().length<2){
    dom.feed.innerHTML='<section class="pulse-view"><div class="pulse-view-head"><h2>Explorer SOCIAL</h2><p>Recherche des personnes, des sujets et des publications.</p></div>'+form+'</section>';
    return;
  }

  setStatus('Recherche','');
  try{
    const data=await api('/api/pulse/search?q='+encodeURIComponent(query.trim()));
    let html='<section class="pulse-view"><div class="pulse-view-head"><h2>Résultats</h2><p>'+esc(query)+'</p></div>'+form+'<div class="pulse-card-list">';
    data.users.forEach(function(user){
      html+='<div class="pulse-card pulse-user-card"><div class="pulse-avatar">'+esc(initials(user))+'</div><div><strong>'+esc(user.displayName)+'</strong><small>@'+esc(user.handle)+' · '+user.followers+' abonnés</small></div><button class="pulse-mini-button" data-profile="'+esc(user.handle)+'">Voir</button></div>';
    });
    html+='</div></section>';
    if(data.posts?.length)html+=data.posts.map(renderPost).join('');
    if(!data.users?.length&&!data.posts?.length)html+='<div class="pulse-status"><strong>Aucun résultat</strong>Essaie une autre recherche.</div>';
    dom.feed.innerHTML=html;
  }catch(error){
    setStatus('Recherche impossible',errorText(error));
  }
}

export async function loadCircles(){
  setView('circles','Communautés');
  setStatus('Chargement des communautés','');
  try{
    const data=await api('/api/pulse/circles');
    let html='<section class="pulse-view"><div class="pulse-view-head"><h2>Communautés</h2><p>Rejoignez des espaces autour d’un sujet, d’un projet ou d’un intérêt commun.</p></div>';
    if(state.user)html+='<form class="pulse-inline-form two" id="circle-create"><input name="name" minlength="3" maxlength="60" placeholder="Nom du cercle" required><input name="description" maxlength="240" placeholder="Description"><button class="pulse-mini-button primary">Créer</button></form>';
    html+='<div class="pulse-card-list">';
    if(!data.circles.length)html+='<div class="pulse-card"><p>Aucune communauté publique pour le moment.</p></div>';
    data.circles.forEach(function(circle){
      html+='<div class="pulse-card"><div class="pulse-card-row"><div><h3>'+esc(circle.name)+'</h3><div class="pulse-card-meta">'+circle.memberCount+' membres · '+esc(circle.visibility)+'</div></div><button class="pulse-mini-button '+(circle.joined?'':'primary')+'" data-circle-join="'+esc(circle.id)+'">'+(circle.joined?'Quitter':'Rejoindre')+'</button></div><p>'+esc(circle.description||'')+'</p></div>';
    });
    dom.feed.innerHTML=html+'</div></section>';
  }catch(error){
    setStatus('Communautés indisponibles',errorText(error));
  }
}

export async function loadNotifications(){
  if(!requireAuth())return;
  setView('notifications','Notifications');
  setStatus('Chargement','');
  try{
    const data=await api('/api/pulse/notifications');
    let html='<section class="pulse-view"><div class="pulse-view-head"><h2>Notifications</h2><p>Les interactions importantes, sans fabriquer une boucle d’attention.</p></div><div class="pulse-card-list">';
    if(!data.notifications.length)html+='<div class="pulse-card"><p>Aucune notification.</p></div>';
    data.notifications.forEach(function(notification){
      const actor=notification.actor||{};
      html+='<div class="pulse-card pulse-notification '+(notification.read?'':'unread')+'"><strong>'+esc(actor.displayName||'Quelqu’un')+'</strong> '+esc(notificationLabel(notification.type))+'<div class="pulse-card-meta">'+esc(timeAgo(notification.createdAt))+'</div></div>';
    });
    dom.feed.innerHTML=html+'</div></section>';
    await api('/api/pulse/notifications/read',{method:'POST',body:'{}'});
  }catch(error){
    setStatus('Notifications indisponibles',errorText(error));
  }
}

export async function loadSaved(){
  if(!requireAuth())return;
  setView('saved','Enregistrés');
  setStatus('Chargement','');
  try{
    const data=await api('/api/pulse/me/bookmarks');
    renderPosts(data.posts,'Tu n’as encore enregistré aucune publication.');
  }catch(error){
    setStatus('Enregistrés indisponibles',errorText(error));
  }
}

export async function loadProfile(handle){
  if(!handle){
    if(!requireAuth())return;
    handle=state.user.handle;
  }
  setView('profile','Profil');
  setStatus('Chargement du profil','');
  try{
    const data=await api('/api/pulse/users/'+encodeURIComponent(handle));
    const user=data.user;
    const self=state.user&&state.user.id===user.id;
    let actions='';

    if(self){
      actions='<button class="pulse-mini-button primary" data-profile-edit>Modifier</button><button class="pulse-mini-button" data-export>Exporter mes données</button><button class="pulse-mini-button danger" data-logout>Déconnexion</button>';
    }else if(state.user){
      actions='<button class="pulse-mini-button primary" data-follow="'+esc(user.handle)+'">'+(user.isFollowing?'Se désabonner':'Suivre')+'</button><button class="pulse-mini-button" data-message-user="'+esc(user.handle)+'">Message</button><button class="pulse-mini-button danger" data-block="'+esc(user.handle)+'">Bloquer</button>';
    }

    dom.feed.innerHTML='<section class="pulse-profile-hero"><div class="pulse-avatar">'+esc(initials(user))+'</div><h2>'+esc(user.displayName)+'</h2><div class="handle">@'+esc(user.handle)+'</div><p>'+esc(user.bio||'Aucune bio pour le moment.')+'</p><div class="pulse-profile-stats"><span><strong>'+user.followers+'</strong> abonnés</span><span><strong>'+user.following+'</strong> abonnements</span></div><div class="pulse-profile-actions">'+actions+'</div></section>'+((data.posts||[]).map(renderPost).join('')||'<div class="pulse-status"><strong>Aucune publication</strong></div>');
  }catch(error){
    setStatus('Profil indisponible',errorText(error));
  }
}

export async function loadMessages(){
  if(!requireAuth())return;
  setView('messages','Messages');
  setStatus('Chargement','');
  try{
    const data=await api('/api/pulse/conversations');
    let html='<section class="pulse-view"><div class="pulse-view-head"><h2>Messages privés</h2><p>Conversations directes entre comptes SOCIAL.</p></div><form class="pulse-inline-form two" id="new-message"><input name="handle" placeholder="@identifiant" required><input name="body" maxlength="2000" placeholder="Message" required><button class="pulse-mini-button primary">Envoyer</button></form><div class="pulse-card-list">';
    if(!data.conversations.length)html+='<div class="pulse-card"><p>Aucune conversation.</p></div>';
    data.conversations.forEach(function(conversation){
      if(!conversation.user)return;
      html+='<button class="pulse-card pulse-user-card" data-conversation="'+esc(conversation.user.handle)+'"><div class="pulse-avatar">'+esc(initials(conversation.user))+'</div><div><strong>'+esc(conversation.user.displayName)+'</strong><small>'+esc(conversation.lastMessage?.body||'Nouvelle conversation')+'</small></div><span class="circle-chevron">'+icon('pi-chevron')+'</span></button>';
    });
    dom.feed.innerHTML=html+'</div></section>';
  }catch(error){
    setStatus('Messages indisponibles',errorText(error));
  }
}

export async function loadConversation(handle){
  if(!requireAuth())return;
  setView('messages','@'+handle);
  setStatus('Chargement','');
  try{
    const data=await api('/api/pulse/messages/'+encodeURIComponent(handle));
    let html='<section class="pulse-view"><div class="pulse-view-head"><h2>'+esc(data.user.displayName)+'</h2><p>@'+esc(data.user.handle)+'</p></div><div class="pulse-message-list">';
    data.messages.forEach(function(message){
      html+='<div class="pulse-message '+(message.senderId===state.user.id?'mine':'')+'">'+esc(message.body)+'<small>'+esc(timeAgo(message.createdAt))+'</small></div>';
    });
    html+='</div><form class="pulse-message-form" id="conversation-form" data-handle="'+esc(handle)+'"><input name="body" maxlength="2000" placeholder="Écrire un message…" required><button class="pulse-mini-button primary">Envoyer</button></form></section>';
    dom.feed.innerHTML=html;
  }catch(error){
    setStatus('Conversation indisponible',errorText(error));
  }
}

export async function loadCirclePreview(){
  try{
    const data=await api('/api/pulse/circles');
    const target=document.getElementById('circle-preview');
    target.innerHTML=data.circles.slice(0,3).map(function(circle){
      return '<button class="circle" data-view="circles"><span class="circle-mark">'+esc(circle.name.slice(0,2).toUpperCase())+'</span><span><strong>'+esc(circle.name)+'</strong><small>'+circle.memberCount+' membres</small></span><span class="circle-chevron">'+icon('pi-chevron')+'</span></button>';
    }).join('')||'<div class="pulse-panel-loading">Aucune communauté publique.</div>';
  }catch{
    document.getElementById('circle-preview').innerHTML='<div class="pulse-panel-loading">Indisponible</div>';
  }
}
