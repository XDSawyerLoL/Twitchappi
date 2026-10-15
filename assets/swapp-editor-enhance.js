/* SWAPP Studio enhancements: safe native previews, preflight, in-tab draft recovery.
   Runs only on an authenticated editorial page; never uploads files or drafts
   to third parties, never uses localStorage, and never auto-publishes. */
(()=>{'use strict';
 const ready=()=>document.getElementById('ed-studio-live')&&document.getElementById('ed-view');
 if(!ready())return;
 const $=id=>document.getElementById(id);
 const edit=document.querySelector('.editor-view[data-view="edit"]');
 const keys=['contentType','title','summary','body','category','game','games','tags','seoTitle','seoDescription',
  'author','image','credit','rights','legacy','date','sources','trailerUrl','affTitle1','affUrl1',
  'affMerchant1','affKind1','affTitle2','affUrl2','affMerchant2','affKind2'];
 const draftPrefix='swapp-studio-tab-draft-v2:';
 let changed=false,timer=null,slug='new',lastPreviewVideo=null;
 function storeKey(){return draftPrefix+slug}
 function snapshot(){
  const out={};
  for(const id of keys){const field=$(id);if(field)out[id]=field.value}
  return out;
 }
 function store(){
  if(!changed)return;
  try{
   const raw=JSON.stringify({time:Date.now(),values:snapshot()});
   if(raw.length>165000)return;
   sessionStorage.setItem(storeKey(),raw);
   $('ed-studio-draft-state').textContent='Saisie conservée uniquement dans cet onglet';
   $('ed-studio-recover').hidden=true;
  }catch(_){$('ed-studio-draft-state').textContent='Sauvegarde de session indisponible : utilise Enregistrer'}
 }
 function stored(){
  try{const raw=sessionStorage.getItem(storeKey());
   const data=raw?JSON.parse(raw):null;
   return data&&data.values&&typeof data.values==='object'&&data.time>Date.now()-86400000?data:null;
  }catch(_){return null}
 }
 function showRecovery(){
  const saved=stored();
  $('ed-studio-recover').hidden=!saved;
  $('ed-studio-draft-state').textContent=saved?
   'Une saisie de cette session peut être restaurée manuellement.':
   'Brouillon à enregistrer dans SWAPP pour le conserver durablement.';
 }
 function restore(){
  const data=stored();if(!data)return;
  if(!confirm('Restaurer la saisie de cet onglet ? Les champs actuellement affichés seront remplacés.'))return;
  for(const [id,value] of Object.entries(data.values)){
   if(keys.includes(id)&&$(id))$(id).value=String(value??'');
  }
  changed=false;showRecovery();render();
  $('ed-studio-draft-state').textContent='Saisie restaurée ; enregistre-la pour la conserver';
 }
 function onLoaded(detail){
  // The server is always authoritative; local changes are opt-in to restore.
  slug=String(detail?.slug||$('ed-view')?.dataset?.editorSlug||'new');
  changed=false;
  if(timer)clearTimeout(timer);
  showRecovery();
  render();
 }
 function onSaved(detail){
  try{
   sessionStorage.removeItem(storeKey());
   if(detail?.fromNew)sessionStorage.removeItem(draftPrefix+'new');
   if(detail?.slug)sessionStorage.removeItem(draftPrefix+detail.slug);
  }catch(_){}
  changed=false;showRecovery();
 }
 function meta(){
  const title=$('seoTitle').value.trim()||$('title').value.trim()||'Titre de publication';
  const description=$('seoDescription').value.trim()||$('summary').value.trim()||'Ajoute un résumé pour améliorer le référencement.';
  $('ed-live-title').textContent=title;
  $('ed-live-description').textContent=description;
  const nTitle=title.length,nDesc=description.length;
  $('ed-live-lengths').textContent=
   'Titre : '+nTitle+'/70 caractères · Description : '+nDesc+'/160 caractères';
  $('ed-live-lengths').dataset.overLimit=String(nTitle>70||nDesc>160);
 }
 function videoId(raw){
  try{
   const u=new URL(String(raw||''));
   if(u.protocol!=='https:')return '';
   const hostname=u.hostname.toLowerCase();
   let id='';
   if(['www.youtube.com','youtube.com','m.youtube.com'].includes(hostname)){
    if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
    else if(/^\/(shorts|embed)\/[A-Za-z0-9_-]{11}$/.test(u.pathname))id=u.pathname.split('/')[2];
   }else if(hostname==='youtu.be'&&/^\/[A-Za-z0-9_-]{11}$/.test(u.pathname))id=u.pathname.slice(1);
   return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
  }catch{return ''}
 }
 function video(){
  const host=$('ed-live-video'),id=videoId($('trailerUrl').value);
  if(id===lastPreviewVideo)return;
  host.replaceChildren();lastPreviewVideo=id;
  if(!id){
   const p=document.createElement('p');
   p.textContent=['video','trailer'].includes($('contentType').value)
    ?'Ajoute une URL YouTube valide pour prévisualiser la vidéo.'
    :'Une bande-annonce est facultative pour cet article.';
   host.append(p);return;
  }
  const poster=document.createElement('button');
  poster.type='button';poster.className='editor-studio-video-poster';
  const img=document.createElement('img');img.src='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
  img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
  const label=document.createElement('span');label.textContent='▶ Prévisualiser la vidéo';
  poster.append(img,label);
  poster.addEventListener('click',()=>{
   const frame=document.createElement('iframe');
   frame.title='Prévisualisation de la bande-annonce';
   frame.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0';
   frame.referrerPolicy='strict-origin-when-cross-origin';
   frame.allow='autoplay; encrypted-media; picture-in-picture';
   frame.allowFullscreen=true;
   poster.replaceWith(frame);
  },{once:true});
  host.append(poster);
 }
 function render(){meta();video()}
 function fullPreview(){
  const section=$('ed-preview');
  section.replaceChildren();
  const add=(tag,text,cls)=>{
   const e=document.createElement(tag);e.textContent=text;
   if(cls)e.className=cls;section.append(e);return e;
  };
  add('small',$('contentType').selectedOptions[0]?.textContent||'Publication','editor-studio-preview-kind');
  add('h2',$('title').value.trim()||'Titre de publication');
  if($('summary').value.trim())add('p',$('summary').value.trim(),'editor-studio-preview-summary');
  const paragraphs=$('body').value.split(/\n{2,}/);
  for(const para of paragraphs.slice(0,80)){
   const trimmed=para.trim();if(!trimmed)continue;
   if(trimmed.startsWith('## '))add('h3',trimmed.slice(3));
   else add('p',trimmed.replace(/\*\*/g,'').replace(/^> ?/gm,'').replace(/^- /gm,'• '));
  }
  add('small','Aperçu local sécurisé · aucun contenu publié automatiquement');
  section.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
 function bodyForValidation(){
  return {
   contentType:$('contentType').value,title:$('title').value,
   summary:$('summary').value,body:$('body').value,category:$('category').value,
   game:$('game').value,games:$('games').value.split(',').map(x=>x.trim()).filter(Boolean),
   tags:$('tags').value.split(',').map(x=>x.trim()).filter(Boolean),
   seo:{title:$('seoTitle').value,description:$('seoDescription').value},
   author:$('author').value,legacyUrl:$('legacy').value.trim()||null,
   originalPublishedAt:$('date').value||null,
   sources:$('sources').value.split('\n').map(x=>x.trim()).filter(Boolean).map(url=>({url,label:'Source'})),
   image:$('image').value.trim()?{url:$('image').value.trim(),credit:$('credit').value,rights:$('rights').value}:null,
   trailerUrl:$('trailerUrl').value.trim()||null,
   commercialLinks:[1,2].map(i=>({title:$('affTitle'+i).value.trim(),merchant:$('affMerchant'+i).value.trim(),
    url:$('affUrl'+i).value.trim(),kind:$('affKind'+i).value})).filter(x=>x.title||x.merchant||x.url)
  };
 }
 async function checkBeforePublish(){
  const status=$('ed-studio-check-status');status.textContent='Vérification…';
  const button=$('ed-studio-check');button.disabled=true;
  try{
   const response=await fetch('/api/editor/actus/validate',{
    method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-SWAPP-Editor':'1'},
    body:JSON.stringify(bodyForValidation()),signal:AbortSignal.timeout(12000)
   });
   const data=await response.json();
   if(!response.ok||data.valid!==true)throw Error(data.error||'Validation indisponible');
   status.textContent='Prêt à publier · '+(data.games?.length||0)+' jeu(x) reconnu(s)';
   status.dataset.valid='true';
  }catch(error){
   status.textContent='À corriger : '+String(error.message||'Erreur').slice(0,180);
   status.dataset.valid='false';
  }finally{button.disabled=false}
 }
 function init(){
  if(!edit)return;
  $('ed-studio-recover').addEventListener('click',restore);
  $('ed-studio-check').addEventListener('click',checkBeforePublish);
  $('ed-preview-button').addEventListener('click',event=>{
   event.stopImmediatePropagation();event.preventDefault();fullPreview();
  },true);
  edit.addEventListener('input',event=>{
   if(!event.target.matches('input,textarea,select'))return;
   changed=true;render();
   if(timer)clearTimeout(timer);
   timer=setTimeout(store,750);
  });
  edit.addEventListener('change',event=>{
   if(!event.target.matches('input,textarea,select'))return;
   changed=true;render();
  });
  window.addEventListener('swapp:studio:loaded',event=>onLoaded(event.detail));
  window.addEventListener('swapp:studio:saved',event=>onSaved(event.detail));
  window.addEventListener('pagehide',store);
  // Allow keyboard saving without preventing ordinary typing.
  document.addEventListener('keydown',event=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
    event.preventDefault();
    const current=$('ed-save').disabled?$('ed-create'):$('ed-save');
    if(!current.disabled)current.click();
   }
  });
  onLoaded({slug:$('ed-view')?.dataset.editorSlug||'new'});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
