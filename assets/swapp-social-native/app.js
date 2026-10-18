import { TOKEN_KEY, state, dom, api, errorText } from './core.js';
import { openAuth, closeAuth, updateAuthModal, updateAccount, requireAuth, applySession, clearSession, restoreSession } from './session.js';
import { setView, loadHome, loadExplore, loadCircles, loadNotifications, loadSaved, loadProfile, loadMessages, loadConversation, loadCirclePreview, loadNewsRss } from './views.js?v=20261018-social-structure-v2';
import {setupVoiceNotes} from './dm-audio.js?v=20261018-direct-audio-v1';
import {setupDirectCalls} from './dm-calls.js?v=20261018-direct-audio-v1';

/* Keep the SOCIAL sticky stack exactly beneath the real SWAPP header.
   Hostinger's server shell has different heights across phone sizes; a
   hard-coded 68px top offset can create a jump or overlap after scrolling.
   ResizeObserver runs only when the header changes size, not on page scroll. */
function installSocialHeaderOffset(){
 const header=document.querySelector('.site-header')||document.querySelector('header.top');
 const stack=document.querySelector('.swapp-social-sticky-stack');
 if(!header||!stack)return;
 const update=()=>{
  const top=Math.ceil(header.getBoundingClientRect().height);
  const height=Math.ceil(stack.getBoundingClientRect().height);
  const root=document.documentElement.style;
  if(Number.isFinite(top)&&top>=40&&top<=220)
   root.setProperty('--swapp-social-header-height',top+'px');
  if(Number.isFinite(height)&&height>=45&&height<=350)
   root.setProperty('--swapp-social-stack-height',height+'px');
 };
 update();
 if(typeof ResizeObserver==='function'){
  const observer=new ResizeObserver(update);
  observer.observe(header);
  observer.observe(stack);
 }
 // A feed switch can hide its tabs without resizing the overall document.
 // This also handles devices that lack ResizeObserver.
 const tabs=document.getElementById('feed-tabs');
 if(tabs&&typeof MutationObserver==='function'){
  const observer=new MutationObserver(update);
  observer.observe(tabs,{attributes:true,attributeFilter:['hidden']});
 }
 window.addEventListener('resize',update,{passive:true});
 window.addEventListener('pageshow',update,{passive:true});
}
installSocialHeaderOffset();

/* After a deliberate view change, align the first post beneath the sticky
   SOCIAL stack. Never change scroll position during ordinary finger scrolling. */
function revealSocialContent(){
  const phone=window.matchMedia?.('(max-width:920px) and (orientation:portrait), (max-width:650px)')?.matches;
  if(!phone)return;
  window.requestAnimationFrame?.(()=>{
    const target=(state.view==='play'||state.view==='rooms')
      ?document.querySelector('.swapp-interactive:not([hidden])')
      :document.getElementById('pulse-feed');
    if(target?.scrollIntoView)target.scrollIntoView({block:'start',behavior:'auto'});
  });
}


function setReply(postId,handle){
  state.replyTo=postId;
  const context=document.getElementById('pulse-context');
  context.hidden=false;
  context.textContent='Réponse à @'+handle;
  document.getElementById('cancel-context').hidden=false;
  dom.textarea.focus();
}

function clearReply(){
  state.replyTo=null;
  document.getElementById('pulse-context').hidden=true;
  document.getElementById('cancel-context').hidden=true;
}

function safeHttpsUrl(value){
  try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:''}catch{return''}
}

function updateMediaPreview(){
  const box=document.getElementById('pulse-media-preview');
  if(!box)return;
  const media=state.attachment||{};
  const image=safeHttpsUrl(media.mediaUrl||media.imageUrl);
  const link=safeHttpsUrl(media.linkUrl);
  if(!image&&!link){box.hidden=true;box.innerHTML='';return}
  box.hidden=false;
  box.innerHTML=(image?'<img src="'+image.replace(/"/g,'&quot;')+'" alt="" referrerpolicy="no-referrer">':'')+
    '<div><strong>'+String(media.linkTitle||media.mediaType||'Média').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))+'</strong>'+
    (link?'<span>'+link.replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]))+'</span>':'')+'</div>'+
    '<button type="button" data-remove-media aria-label="Retirer">×</button>';
}

async function publishPost(){
  if(!requireAuth()||dom.publish.disabled)return;
  const body=dom.textarea.value.trim();
  if(!body)return;
  dom.publish.disabled=true;
  try{
    await api('/api/pulse/posts',{method:'POST',body:JSON.stringify({body,replyToId:state.replyTo,...(state.attachment||{})})});
    dom.textarea.value='';
    dom.count.textContent='0 / 420';
    clearReply();
    state.attachment=null;
    updateMediaPreview();
    // Preserve the visitor's selected feed. News has no composer, so land
    // on discovery after a successful publication from a shared article.
    if(state.feed==='news')state.feed='discover';
    await loadHome();
  }catch(error){
    alert(errorText(error));
  }finally{
    // A successful post previously left Publier permanently disabled.
    dom.publish.disabled=false;
  }
}

async function toggleAction(postId,action){
  if(!requireAuth())return;
  try{
    await api('/api/pulse/posts/'+encodeURIComponent(postId)+'/'+action,{method:'POST',body:'{}'});
    if(state.view==='home')await loadHome();
  }catch(error){
    alert(errorText(error));
  }
}

async function reportPost(postId){
  if(!requireAuth())return;
  const reason=prompt('Pourquoi signales-tu cette publication ?');
  if(!reason)return;
  try{
    await api('/api/pulse/report',{method:'POST',body:JSON.stringify({targetType:'post',targetId:postId,reason})});
    alert('Signalement transmis.');
  }catch(error){
    alert(errorText(error));
  }
}

async function doLogout(){
  // SWAPP manages sign-out; SOCIAL does not maintain a separate login.
  window.location.assign('/compte');
}

async function exportData(){
  if(!requireAuth())return;
  try{
    const data=await api('/api/pulse/export');
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const anchor=document.createElement('a');
    anchor.href=URL.createObjectURL(blob);
    anchor.download='zoon-export.json';
    anchor.click();
    setTimeout(function(){URL.revokeObjectURL(anchor.href)},1000);
  }catch(error){
    alert(errorText(error));
  }
}

async function editProfile(){
  if(!state.user)return;
  const displayName=prompt('Nom affiché',state.user.displayName);
  if(displayName===null)return;
  const bio=prompt('Bio',state.user.bio||'');
  if(bio===null)return;
  try{
    const data=await api('/api/pulse/me',{method:'PATCH',body:JSON.stringify({displayName,bio})});
    state.user=data.user;
    updateAccount();
    await loadProfile(state.user.handle);
  }catch(error){
    alert(errorText(error));
  }
}

async function health(){
  try{
    await api('/api/pulse/health');
    document.getElementById('api-state').textContent='En ligne';
    document.getElementById('api-state').title='Service SOCIAL disponible';
  }catch{
    document.getElementById('api-state').textContent='Hors ligne';
  }
}

// Only the GEKKO native, origin-checked browser bridge injects this event.
// It carries a backend-issued short-lived token, never an identity private key.
window.addEventListener('quantic-gekkko-session',event=>{
  if(location.origin!=='https://xdsawyerlol.github.io'||
    !['/QuanticSillage/zoon.html','/QuanticSillage/zoon'].includes(location.pathname))return;
  const session=event.detail;
  if(session?.token && typeof session.token==='string' && session.user?.id){
    const first=!state.user;
    applySession(session);
    closeAuth();
    if(first)loadHome().catch(()=>{});
  }else if(session && session.token===''){
    clearSession();
    loadHome().catch(()=>{});
  }
});

function bindStaticEvents(){
  dom.textarea.addEventListener('input',function(){
    dom.count.textContent=dom.textarea.value.length+' / 420';
    dom.publish.disabled=!dom.textarea.value.trim();
  });

  dom.publish.addEventListener('click',publishPost);
  document.querySelector('[data-tool="news"]')?.addEventListener('click',function(){loadNewsRss();});
  document.querySelector('[data-tool="image"]')?.addEventListener('click',function(){
    const raw=prompt('Adresse HTTPS de l’image');
    if(raw===null)return;
    const imageUrl=safeHttpsUrl(raw);
    if(!imageUrl){alert('Utilise une adresse d’image HTTPS valide.');return}
    state.attachment={imageUrl};
    updateMediaPreview();
  });
  document.getElementById('pulse-media-preview')?.addEventListener('click',function(event){
    if(!event.target.closest('[data-remove-media]'))return;
    state.attachment=null;
    updateMediaPreview();
  });
  document.getElementById('cancel-context').addEventListener('click',clearReply);
  document.getElementById('compose-focus').addEventListener('click',function(){
    if(requireAuth()){
      state.feed='following';
      document.querySelectorAll('.pulse-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.feed==='following'));
      setView('home','Accueil');
      dom.textarea.focus();
      window.scrollTo({top:0,behavior:'smooth'});
    }
  });
  document.getElementById('mobile-compose').addEventListener('click',function(){
    if(requireAuth()){
      state.feed='following';
      document.querySelectorAll('.pulse-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.feed==='following'));
      setView('home','Accueil');
      dom.textarea.focus();
      window.scrollTo({top:0,behavior:'smooth'});
    }
  });
  // SWAPP is the visible account authority. The duplicate SOCIAL entrypoints were removed.
  // Legacy SOCIAL credentials removed: SWAPP session is the only login.

  // Single delegated controller: switching away from an RSS request must always
  // work, even if the news endpoint is slow or the feed DOM has been replaced.
  const feedTabs=document.getElementById('feed-tabs');
  feedTabs?.addEventListener('click',function(event){
    const button=event.target.closest('button[data-feed]');
    if(!button||!feedTabs.contains(button))return;
    const next=button.dataset.feed;
    if(!['following','discover','news'].includes(next))return;
    event.preventDefault();
    state.feed=next;
    // Keep navigation responsive synchronously; network responses may arrive later.
    setView('home',next==='news'?'SWAPP Actualité':'Le fil');
    document.querySelectorAll('.pulse-tab').forEach(function(candidate){
      const active=candidate===button;
      candidate.classList.toggle('active',active);
      candidate.setAttribute('aria-pressed',String(active));
    });
    const operation=next==='news'?loadNewsRss():loadHome();
    Promise.resolve(operation).catch(error=>{
      if(state.view==='home'&&state.feed===next)
        console.warn('[SWAPP SOCIAL] Impossible de charger le fil :',error?.message||'indisponible');
    });
    // Do not auto-scroll the document on a feed-tab change: on narrow screens
    // this can move the other two controls out of the user's visible area.
  });

  // All view buttons, including those rendered AFTER initialization, are handled
  // by the delegated click handler below. Binding only at startup broke the
  // sidebar's dynamic community preview and other newly rendered controls.

  let searchTimer;
  const sidebarSearch=document.getElementById('pulse-search');
  const searchForm=document.getElementById('swapp-social-search-form');
  const doSearch=()=>{
    const query=String(sidebarSearch?.value||'').trim();
    void loadExplore(query);
    revealSocialContent();
  };
  searchForm?.addEventListener('submit',event=>{
    event.preventDefault();
    clearTimeout(searchTimer);
    doSearch();
  });
  sidebarSearch?.addEventListener('input',event=>{
    clearTimeout(searchTimer);
    const query=String(event.target.value||'').trim();
    if(!query){
      if(state.view==='explore')void loadExplore('');
      return;
    }
    if(query.length>=2){
      searchTimer=setTimeout(()=>void loadExplore(query),360);
    }
  });
  sidebarSearch?.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!sidebarSearch.value&&state.view==='explore')void loadExplore('');
  });
}

function bindDelegatedEvents(){
 // Games/rooms stay underneath Communities, sharing the existing controller.
 document.addEventListener('swapp:social-view',event=>{
  const view=event.detail?.view;
  if(view==='play'||view==='rooms'){
   setView(view,view==='play'?'Jeux et équipes':'Salons de discussion');
   revealSocialContent();
  }
 });
 let dmLookupTimer=null,dmLookupSeq=0;
 document.addEventListener('input',event=>{
  if(!event.target.matches?.('#new-message [name="handle"]'))return;
  const input=event.target,form=input.closest('#new-message');
  const results=form?.querySelector('#pulse-dm-user-results');
  if(!results)return;
  const query=input.value.trim().replace(/^@/,'').slice(0,100);
  const revision=++dmLookupSeq;
  clearTimeout(dmLookupTimer);
  results.replaceChildren();
  if(query.length<2)return;
  dmLookupTimer=setTimeout(async()=>{
   try{
    const data=await api('/api/pulse/search?q='+encodeURIComponent(query));
    if(revision!==dmLookupSeq||!form.isConnected||form.hidden)return;
    const users=Array.isArray(data.users)?data.users.slice(0,8):[];
    results.replaceChildren();
    for(const user of users){
     if(!user?.handle)continue;
     const button=document.createElement('button');
     button.type='button';
     button.className='pulse-dm-member';
     button.dataset.dmRecipient=String(user.handle);
     button.textContent=(user.displayName||user.handle)+' · @'+user.handle;
     results.append(button);
    }
    if(!results.children.length)results.textContent='Aucun membre trouvé.';
   }catch{
    if(revision===dmLookupSeq&&form.isConnected)results.textContent='Recherche indisponible. Saisis un pseudo SWAPP.';
   }
  },280);
 });
  document.addEventListener('click',async function(event){
    const openNew=event.target.closest('[data-new-message-toggle]');
    if(openNew){
      const form=document.getElementById('new-message');
      if(form){
        form.hidden=!form.hidden;
        openNew.setAttribute('aria-expanded',String(!form.hidden));
        if(!form.hidden)form.querySelector('[name="handle"]')?.focus();
      }
      return;
    }
    const selectedUser=event.target.closest('[data-dm-recipient]');
    if(selectedUser){
      const form=selectedUser.closest('#new-message');
      if(form){
        form.querySelector('[name="handle"]').value=selectedUser.dataset.dmRecipient;
        form.querySelector('#pulse-dm-user-results')?.replaceChildren();
        form.querySelector('[name="body"]')?.focus();
      }
      return;
    }
    const navigate=event.target.closest('button[data-view]');
    if(navigate){
      // Do not hijack links, but accept dynamically inserted sidebar buttons.
      const view=navigate.dataset.view;
      event.preventDefault();
      if(view==='home'){
        // A returning member must not land on an empty following feed by default.
        if(state.feed==='news')state.feed='discover';
        void loadHome();
      }else if(view==='explore')void loadExplore(document.getElementById('pulse-search')?.value||'');
      else if(view==='circles')void loadCircles();
      else if(view==='notifications')void loadNotifications();
      else if(view==='messages')void loadMessages();
      else if(view==='play')setView('play','Jouer ensemble');
      else if(view==='rooms')setView('rooms','Salons & discussion');
      else if(view==='saved')void loadSaved();
      else if(view==='profile')void loadProfile();
      revealSocialContent();
      return;
    }
    if(event.target.closest('[data-social-create-circle]')){
      loadCircles();
      return;
    }
    const newsRepost=event.target.closest('[data-news-repost]');
    if(newsRepost){
      if(!requireAuth())return;
      const title=String(newsRepost.dataset.newsTitle||'Actualité').trim();
      const url=safeHttpsUrl(newsRepost.dataset.newsUrl);
      const image=safeHttpsUrl(newsRepost.dataset.newsImage);
      const source=String(newsRepost.dataset.newsSource||'SWAPP Actualité').trim();
      const body=(title+(source?'\n\nSource : '+source:'')).slice(0,420);
      const previous=newsRepost.textContent;
      newsRepost.disabled=true;
      newsRepost.textContent='Repost…';
      try{
        await api('/api/pulse/posts',{method:'POST',body:JSON.stringify({body,linkUrl:url,linkTitle:title,imageUrl:image})});
        newsRepost.textContent='Reposté ✓';
        newsRepost.classList.add('done');
      }catch(error){
        newsRepost.disabled=false;
        newsRepost.textContent=previous;
        alert(errorText(error));
      }
      return;
    }

    const profile=event.target.closest('[data-profile]');
    if(profile){
      loadProfile(profile.dataset.profile);
      return;
    }

    const post=event.target.closest('.pulse-post');
    const action=event.target.closest('[data-action]');
    if(post&&action){
      const postId=post.dataset.id;
      if(['like','repost','bookmark'].includes(action.dataset.action)){
        toggleAction(postId,action.dataset.action);
        return;
      }
      if(action.dataset.action==='reply'){
        const handle=post.querySelector('[data-profile]')?.dataset.profile||'';
        setView('home','Accueil');
        setReply(postId,handle);
        return;
      }
      if(action.dataset.action==='share'){
        const shareUrl=location.origin+location.pathname+'?post='+encodeURIComponent(postId);
        if(navigator.share)navigator.share({title:'SOCIAL',url:shareUrl}).catch(function(){});
        else navigator.clipboard?.writeText(shareUrl);
        return;
      }
      if(action.dataset.action==='report'){
        reportPost(postId);
        return;
      }
    }

    const join=event.target.closest('[data-circle-join]');
    if(join){
      if(!requireAuth())return;
      try{
        await api('/api/pulse/circles/'+encodeURIComponent(join.dataset.circleJoin)+'/join',{method:'POST',body:'{}'});
        await loadCircles();
        await loadCirclePreview();
      }catch(error){alert(errorText(error))}
      return;
    }

    const follow=event.target.closest('[data-follow]');
    if(follow){
      try{
        await api('/api/pulse/users/'+encodeURIComponent(follow.dataset.follow)+'/follow',{method:'POST',body:'{}'});
        await loadProfile(follow.dataset.follow);
      }catch(error){alert(errorText(error))}
      return;
    }

    const block=event.target.closest('[data-block]');
    if(block){
      if(!confirm('Bloquer @'+block.dataset.block+' ?'))return;
      try{
        await api('/api/pulse/users/'+encodeURIComponent(block.dataset.block)+'/block',{method:'POST',body:'{}'});
        await loadHome();
      }catch(error){alert(errorText(error))}
      return;
    }

    if(event.target.closest('[data-social-back-messages]')){loadMessages();return;}

    const message=event.target.closest('[data-message-user]');
    if(message){
      loadConversation(message.dataset.messageUser);
      return;
    }

    const conversation=event.target.closest('[data-conversation]');
    if(conversation){
      loadConversation(conversation.dataset.conversation);
      return;
    }

    if(event.target.closest('[data-export]')){exportData();return}
    if(event.target.closest('[data-profile-edit]')){editProfile();return}
    if(event.target.closest('[data-logout]')){doLogout();return}
  });

  document.addEventListener('submit',async function(event){
    if(event.target.id==='social-mobile-search-form'){
      event.preventDefault();
      const query=String(event.target.querySelector('[name="query"]')?.value||'').trim().slice(0,100);
      if(query.length>=2)await loadExplore(query);
      return;
    }
    if(event.target.id==='circle-create'){
      event.preventDefault();
      if(!requireAuth())return;
      const form=new FormData(event.target);
      try{
        await api('/api/pulse/circles',{method:'POST',body:JSON.stringify({name:form.get('name'),description:form.get('description')})});
        await loadCircles();
        await loadCirclePreview();
      }catch(error){alert(errorText(error))}
    }

    if(event.target.id==='new-message'){
      event.preventDefault();
      const submit=event.target.querySelector('[type="submit"]');
      if(submit?.disabled)return;
      if(submit)submit.disabled=true;
      const form=new FormData(event.target);
      const handle=String(form.get('handle')||'').trim().replace(/^@/,'');
      try{
        await api('/api/pulse/messages',{method:'POST',body:JSON.stringify({handle,body:form.get('body')})});
        // Open the thread after a first DM, rather than sending the user
        // back to the empty conversation directory.
        await loadConversation(handle);
      }catch(error){alert(errorText(error))}
      finally{if(submit)submit.disabled=false}
    }

    if(event.target.id==='conversation-form'){
      event.preventDefault();
      const submit=event.target.querySelector('[type="submit"]');
      if(submit?.disabled)return;
      if(submit)submit.disabled=true;
      const form=new FormData(event.target);
      const handle=event.target.dataset.handle;
      try{
        await api('/api/pulse/messages',{method:'POST',body:JSON.stringify({handle,body:form.get('body')})});
        await loadConversation(handle);
      }catch(error){alert(errorText(error))}
      finally{if(submit)submit.disabled=false}
    }
  });
}

function applyIncomingShare(){
  const params=new URLSearchParams(location.search);
  if(params.get('share')!=='news')return;
  const title=(params.get('title')||'').trim();
  const url=safeHttpsUrl(params.get('url'));
  const image=safeHttpsUrl(params.get('image'));
  if(title||url){
    dom.textarea.value=(title+(url?'\n\n'+url:'')).slice(0,420);
    dom.count.textContent=dom.textarea.value.length+' / 420';
    dom.publish.disabled=!dom.textarea.value.trim();
  }
  if(url||image)state.attachment={linkUrl:url,linkTitle:title,imageUrl:image};
  updateMediaPreview();
  history.replaceState({},document.title,location.pathname);
}

async function init(){
  bindStaticEvents();
  applyIncomingShare();
  bindDelegatedEvents();
  setupVoiceNotes({onConversationChange:loadConversation});

  // Public content must not wait for separate health / identity requests.
  // On a cold backend these used to block first content for several seconds.
  await restoreSession();
  setupDirectCalls();
  void health();
  // Recover a temporarily sleeping upstream without asking the member to refresh.
  setInterval(()=>{
    if(document.visibilityState==='hidden')return;
    void health();
    if(!state.user&&document.getElementById('swapp-social-access')?.classList.contains('is-unlocked')){
      void restoreSession().then(()=>{
        if(state.user&&state.view==='home')void loadHome();
      }).catch(()=>{});
    }
  },60000);
  const requestedView=document.getElementById('swappSocialNative')?.dataset.requestedSocialView;
  if(requestedView==='play'||requestedView==='rooms'){
    setView(requestedView,requestedView==='play'?'Jeux et équipes':'Salons de discussion');
  }
  // Do not overwrite an intentional view after a delayed SSO response.
  await Promise.allSettled([...(state.view==='home'?[loadHome()]:[]),loadCirclePreview()]);
}

init().catch(error=>{
  const feed=document.getElementById('pulse-feed');
  if(feed){
    const fallback=document.createElement('div');
    fallback.className='pulse-status';
    const heading=document.createElement('strong');
    heading.textContent='SOCIAL ne peut pas démarrer';
    const message=document.createElement('p');
    message.textContent='Le réseau SOCIAL est temporairement indisponible. Actualise la page pour réessayer.';
    fallback.append(heading,message);
    feed.replaceChildren(fallback);
  }
  console.error('[SWAPP SOCIAL] Initialisation interrompue',error);
});
