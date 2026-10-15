/* Native SWAPP community: public SOCIAL feed, optional SOCIAL-specific identity.
 * No third-party SDK, analytics, embedded app or stored bearer token.
 */
(()=>{'use strict';
 const shell=document.getElementById('swappCommunity');
 if(!shell)return;
 const feed=shell.querySelector('#swappCommunityFeed'),status=shell.querySelector('#swappSocialStatus');
 const refresh=shell.querySelector('#swappCommunityRefresh'),join=shell.querySelector('#swappCommunityJoin');
 const auth=shell.querySelector('#swappSocialAuth'),form=shell.querySelector('#swappSocialAuthForm');
 const error=shell.querySelector('#swappSocialAuthError'),close=shell.querySelector('.swapp-community-auth-close');
 const switchMode=shell.querySelector('#swappSocialSwitch'),displayField=form.querySelector('[data-swapp-register]');
 let token=null,user=null,loading=false,registering=false;
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x};
 function updateMode(){
  displayField.hidden=!registering;
  form.elements.displayName.required=registering;
  form.elements.password.autocomplete=registering?'new-password':'current-password';
  auth.querySelector('h2').textContent=registering?'Créer un compte SOCIAL':'Compte SOCIAL';
  form.querySelector('[type=submit]').textContent=registering?'Créer mon compte':'Se connecter';
  switchMode.textContent=registering?'J’ai déjà un compte':'Créer un compte SOCIAL';
 }
 function openLogin(){auth.hidden=false;error.textContent='';updateMode();form.elements.handle.focus()}
 function closeLogin(){auth.hidden=true;form.elements.password.value='';join.focus()}
 const changeJoin=()=>{
  join.textContent=user?'Se déconnecter de SOCIAL':'Connexion SOCIAL';
 };
 function useToken(path,body){
  return request(path,'POST',body,token);
 }
 async function request(url,method='GET',body,sessionToken){
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(sessionToken)headers.Authorization='Bearer '+sessionToken;
  const response=await fetch(url,{method,headers,credentials:'same-origin',cache:'no-store',
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
  let data;try{data=await response.json()}catch{throw Error('Réponse du serveur SOCIAL indisponible')}
  if(!response.ok)throw Error(({unauthorized:'Connexion SOCIAL nécessaire',invalid_credentials:'Identifiant ou mot de passe incorrect',rate_limited:'Trop de tentatives : réessaie ultérieurement',handle_taken:'Cet identifiant est déjà utilisé',invalid_registration:'Vérifie les informations de ton nouveau compte',invalid_display_name:'Le nom public est invalide',social_unavailable:'SOCIAL est temporairement indisponible',invalid_post:'Texte trop long ou vide'})[data.error]||'SOCIAL est actuellement indisponible');
  return data;
 }
 function composer(){
  const area=el('form','swapp-community-composer');
  area.classList.add('visible');
  const text=el('textarea');text.placeholder='Partager quelque chose avec la communauté…';text.maxLength=420;
  text.setAttribute('aria-label','Nouvelle publication SOCIAL');text.required=true;
  const controls=el('div','swapp-community-composer-footer');
  const count=el('small','', '420 caractères maximum');const submit=el('button','swapp-hub-action','Publier');
  submit.type='submit';controls.append(count,submit);area.append(text,controls);
  text.addEventListener('input',()=>count.textContent=(420-text.value.length)+' caractères restants');
  area.addEventListener('submit',async event=>{
   event.preventDefault();const body=text.value.trim();if(!body||body.length>420)return;
   submit.disabled=true;status.textContent='Publication en cours…';
   try{
    await useToken('/api/swapp/social/post',{body});
    text.value='';count.textContent='420 caractères maximum';await loadFeed();
    status.textContent='Publication envoyée sur SOCIAL.';
   }catch(err){status.textContent=err.message}
   finally{submit.disabled=false}
  });
  return area;
 }
 function postCard(post){
  const card=el('article','swapp-community-post');
  const author=el('div','swapp-community-author');
  const avatar=el('span','swapp-community-avatar',(post.author||'S').slice(0,1).toUpperCase());
  avatar.setAttribute('aria-hidden','true');
  const meta=el('div');
  meta.append(el('strong','',post.author||'Membre SOCIAL'));
  const date=post.createdAt?new Date(post.createdAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'';
  meta.append(el('small','',[post.handle?'@'+post.handle:'',date].filter(Boolean).join(' · ')));
  author.append(avatar,meta);card.append(author,el('p','swapp-community-content',post.body));
  const actions=el('div','swapp-community-post-footer');
  const like=el('button','','♡ Réagir');
  like.type='button';like.setAttribute('aria-label','Réagir à cette publication');
  like.addEventListener('click',async()=>{
   if(!token){openLogin();return}
   like.disabled=true;
   try{await useToken('/api/swapp/social/like/'+encodeURIComponent(post.id),{});like.textContent='♥ Réaction enregistrée'}
   catch(err){status.textContent=err.message}
   finally{like.disabled=false}
  });
  actions.append(like,el('span','','Publication publique SOCIAL'));
  card.append(actions);
  return card;
 }
 async function loadFeed(){
  if(loading)return;loading=true;refresh.disabled=true;
  status.textContent='Lecture des publications publiques…';
  try{
   const data=await request('/api/swapp/social-preview');
   if(!data.success||!Array.isArray(data.posts))throw Error('Réponse SOCIAL invalide');
   feed.replaceChildren();
   if(user)feed.append(composer());
   const articles=data.posts.filter(post=>post&&typeof post.body==='string'&&post.id);
   if(articles.length)feed.append(...articles.map(postCard));
   else feed.append(el('p','swapp-hub-empty','SOCIAL ne contient pas encore de publication publique. Aucun contenu fictif n’est affiché.'));
   status.textContent=articles.length+' publication'+(articles.length>1?'s':'')+' publique'+(articles.length>1?'s':'')+' · SOCIAL';
  }catch(_){
   feed.replaceChildren();
   if(user)feed.append(composer());
   feed.append(el('p','swapp-hub-empty','Impossible de charger le fil SOCIAL actuellement. SWAPP reste accessible.'));
   status.textContent='SOCIAL indisponible';
  }finally{loading=false;refresh.disabled=false}
 }
 join.addEventListener('click',()=>{
  if(user){token=null;user=null;changeJoin();loadFeed()}
  else openLogin();
 });
 close.addEventListener('click',closeLogin);
 switchMode.addEventListener('click',()=>{registering=!registering;updateMode();error.textContent=''});
 auth.addEventListener('click',event=>{if(event.target===auth)closeLogin()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!auth.hidden)closeLogin()});
 refresh.addEventListener('click',loadFeed);
 form.addEventListener('submit',async event=>{
  event.preventDefault();error.textContent='';
  const handle=form.elements.handle.value.trim().toLowerCase();
  const password=form.elements.password.value;
  const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try{
   const payload={handle,password};
   if(registering)payload.displayName=form.elements.displayName.value.trim();
   const data=await request('/api/swapp/social/'+(registering?'register':'login'),'POST',payload);
   if(typeof data.token!=='string'||!data.token||!data.user)throw Error('Session SOCIAL invalide');
   token=data.token;user=data.user;changeJoin();closeLogin();await loadFeed();
  }catch(err){error.textContent=err.message}
  finally{submit.disabled=false;form.elements.password.value=''}
 });
 updateMode();changeJoin();loadFeed();
})();
