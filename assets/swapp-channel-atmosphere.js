/* SWAPP Channel Atmosphere: truly per-creator backdrop, independent of banner.
 * Backdrop is stored on SWAPP account with the already persistent MySQL media.
 */
(function(){
 'use strict';
 const channel=document.getElementById('channel'),manager=document.getElementById('manager');
 if(!channel)return;
 const $=(q,p=document)=>p.querySelector(q);
 const make=(tag,cls,value)=>{
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(value!==undefined)n.textContent=String(value);
  return n;
 };
 const cleanLogin=s=>/^[a-z0-9_-]{3,40}$/.test(String(s||''))?String(s):'';
 const defaultTheme={background_url:'',background_opacity:35,background_blur:0,background_x:50,
  background_y:30,accent:'#9b78f4',background_fit:'cover'};
 const safeUrl=(login,url)=>{
  const str=String(url||'');
  return new RegExp('^/api/oryon/panel-image/'+login+'/[a-f0-9]{64}$','i').test(str)?str:'';
 };
 let active='',dialog=null,selectedFile=null,previewURL='',cached=null,busy=false;
 const profile=()=>{try{return typeof state!=='undefined'?state.channelProfile:null}catch(_){return null}};
 const me=()=>{try{return typeof state!=='undefined'?state.session?.local:null}catch(_){return null}};
 const isOwner=login=>!!me()?.id&&String(me().login||'').toLowerCase()===login;
 const currentLogin=()=>{
  const page=channel.querySelector('.creatorRefine');
  const fromPage=cleanLogin(String(page?.dataset?.channelLogin||'').toLowerCase());
  if(fromPage)return fromPage;
  const fromState=cleanLogin(String(profile()?.login||'').toLowerCase());
  if(fromState)return fromState;
  const matched=location.pathname.match(/^\/(?:c\/)?([a-z0-9_-]{3,40})\/?$/i);
  return matched?matched[1].toLowerCase():'';
 };
 const number=(v,fallback,min,max)=>{
  const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;
 };
 function normalize(raw,login){
  const t=raw&&typeof raw==='object'?raw:{};
  return {background_url:safeUrl(login,t.background_url),
   background_opacity:number(t.background_opacity,35,0,70),
   background_blur:number(t.background_blur,0,0,20),
   background_x:number(t.background_x,50,0,100),
   background_y:number(t.background_y,30,0,100),
   background_fit:t.background_fit==='contain'?'contain':'cover',
   accent:/^#[a-f0-9]{6}$/i.test(t.accent||'')?t.accent:'#9b78f4'};
 }
 function display(theme,urlOverride){
  const login=active||currentLogin();if(!login)return;
  const t=normalize(theme,login),image=urlOverride||t.background_url;
  const safe=image.startsWith('blob:')?image:safeUrl(login,image);
  if(safe)channel.style.setProperty('--swapp-background-image','url('+JSON.stringify(safe)+')');
  else channel.style.removeProperty('--swapp-background-image');
  channel.dataset.swappHasBackground=safe?'true':'false';
  channel.style.setProperty('--swapp-background-opacity',String(t.background_opacity/100));
  channel.style.setProperty('--swapp-background-blur',t.background_blur+'px');
  channel.style.setProperty('--swapp-background-x',t.background_x+'%');
  channel.style.setProperty('--swapp-background-y',t.background_y+'%');
  channel.style.setProperty('--swapp-background-fit',t.background_fit);
  // Per-channel color only, independent of the viewer's global UI theme.
  const main=channel.querySelector('.creatorRefine');
  if(main)main.style.setProperty('--channel-accent',t.accent);
 }
 async function getPublic(login){
  const r=await fetch('/api/oryon/profile/'+encodeURIComponent(login),{
   credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.success||j.user?.login!==login)throw Error('Profil de chaîne indisponible.');
  return j.user;
 }
 function input(label,type,id,value){
  const outer=make('label','swapp-atmosphere-field'),title=make('span','',label);
  const field=make('input','');field.id='swapp-atmosphere-'+id;field.type=type;
  if(type==='range'){field.min=id==='background_blur'?'0':'0';field.max=id==='background_opacity'?'70':id==='background_blur'?'20':'100';field.step='1'}
  if(value!==undefined)field.value=value;
  outer.append(title,field);return {outer,field};
 }
 function close(){
  if(previewURL){URL.revokeObjectURL(previewURL);previewURL=''}
  selectedFile=null;dialog?.close();
  if(cached)display(cached);
 }
 function ensureDialog(){
  if(dialog)return dialog;
  dialog=make('dialog','swapp-atmosphere-dialog');
  dialog.setAttribute('aria-label','Personnaliser le fond de ma chaîne');
  const header=make('header','swapp-atmosphere-head');
  header.append(make('h2','','Fond & ambiance de chaîne'),
   make('p','','Un fond public distinct de ta bannière et de ton écran hors ligne.'));
  const closeBtn=make('button','swapp-atmosphere-close','×');
  closeBtn.type='button';closeBtn.setAttribute('aria-label','Fermer');
  closeBtn.addEventListener('click',close);header.append(closeBtn);
  const artwork=make('label','swapp-atmosphere-upload');
  artwork.append(make('strong','','Importer un fond personnalisé'),
   make('span','','JPG, PNG ou WebP · image horizontale recommandée · stockage SWAPP'));
  const file=make('input','');file.type='file';file.accept='image/jpeg,image/png,image/webp';
  file.setAttribute('aria-label','Choisir une image de fond');artwork.append(file);
  const grid=make('div','swapp-atmosphere-fields');
  const fields=[
   input('Intensité du fond','range','background_opacity',35),
   input('Flou','range','background_blur',0),
   input('Cadrage horizontal','range','background_x',50),
   input('Cadrage vertical','range','background_y',30),
   input('Couleur de chaîne','color','accent','#9b78f4')
  ];
  fields.forEach(x=>grid.append(x.outer));
  const fitting=make('label','swapp-atmosphere-field');
  fitting.append(make('span','','Affichage de l’image'));
  const fit=make('select','');
  fit.id='swapp-atmosphere-background_fit';
  for(const [value,label] of [['cover','Remplir le fond'],['contain','Voir toute l’image']]){
   const option=make('option','',label);option.value=value;fit.append(option);
  }
  fitting.append(fit);grid.append(fitting);
  const status=make('p','swapp-atmosphere-status','');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const footer=make('footer','swapp-atmosphere-buttons');
  const reset=make('button','swapp-atmosphere-reset','Retirer le fond');
  reset.type='button';
  const cancel=make('button','','Annuler');cancel.type='button';cancel.addEventListener('click',close);
  const save=make('button','swapp-atmosphere-save','Publier ma personnalisation');
  save.type='button';footer.append(reset,cancel,save);
  dialog.append(header,artwork,grid,status,footer);document.body.append(dialog);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
  dialog.addEventListener('click',event=>{if(event.target===dialog)close()});
  const read=()=>({
   background_url:dialog.dataset.backgroundUrl||'',
   background_opacity:fields[0].field.value,background_blur:fields[1].field.value,
   background_x:fields[2].field.value,background_y:fields[3].field.value,
   accent:fields[4].field.value,background_fit:fit.value
  });
  const preview=()=>display(read(),previewURL);
  for(const {field} of fields)field.addEventListener('input',preview);
  fit.addEventListener('change',preview);
  file.addEventListener('change',()=>{
   if(previewURL){URL.revokeObjectURL(previewURL);previewURL=''}
   selectedFile=file.files?.[0]||null;
   if(!selectedFile)return preview();
   if(!['image/jpeg','image/png','image/webp'].includes(selectedFile.type)||selectedFile.size>12*1024*1024){
    selectedFile=null;file.value='';status.textContent='Image JPG/PNG/WebP, 12 Mo maximum avant compression.';return;
   }
   previewURL=URL.createObjectURL(selectedFile);
   preview();status.textContent='Prévisualisation seulement : clique sur Publier pour enregistrer.';
  });
  reset.addEventListener('click',()=>{
   selectedFile=null;file.value='';
   if(previewURL){URL.revokeObjectURL(previewURL);previewURL=''}
   dialog.dataset.backgroundUrl='';
   preview();status.textContent='Fond retiré dans la prévisualisation. Publie pour confirmer.';
  });
  save.addEventListener('click',async()=>{
   if(busy||!isOwner(active))return;
   busy=true;save.disabled=true;status.textContent='Enregistrement du fond…';
   try{
    const theme=read();
    if(selectedFile)theme.background_image_data=await compress(selectedFile);
    const result=await fetch('/api/oryon/profile',{method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json',Accept:'application/json'},
     body:JSON.stringify({channel_theme:theme})});
    const body=await result.json().catch(()=>({}));
    if(!result.ok||body.success!==true)throw Error(body.error||'Publication refusée.');
    const verified=await getPublic(active);
    const expected=normalize(body.user?.channel_theme,active),
     actual=normalize(verified.channel_theme,active);
    if(JSON.stringify(expected)!==JSON.stringify(actual))
     throw Error('Le serveur a enregistré le fond, mais la page publique n’est pas encore synchronisée.');
    if(typeof state!=='undefined'&&state.channelProfile?.login===active)state.channelProfile.channel_theme=actual;
    cached=actual;
    display(actual);
    status.textContent='Fond enregistré et vérifié sur la page publique.';
    // Close without resetting the committed appearance.
    if(previewURL){URL.revokeObjectURL(previewURL);previewURL=''}
    selectedFile=null;setTimeout(()=>{if(dialog?.open)dialog.close()},700);
   }catch(error){status.textContent=String(error.message||'Publication impossible.');}
   finally{busy=false;save.disabled=false}
  });
  return dialog;
 }
 async function compress(file){
  const url=URL.createObjectURL(file);
  let img;
  try{
   img=new Image();
   await new Promise((resolve,reject)=>{
    img.onload=resolve;img.onerror=()=>reject(Error('Image illisible.'));
    img.src=url;
   });
   let scale=Math.min(1,1920/Math.max(img.naturalWidth,1),1080/Math.max(img.naturalHeight,1));
   for(let attempt=0;attempt<6;attempt++){
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    const quality=Math.max(.46,.80-attempt*.06);
    const output=canvas.toDataURL('image/webp',quality);
    if(output.startsWith('data:image/webp;base64,')&&(output.length-23)*.75<1050000)return output;
    scale*=.82;
   }
   throw Error('Image trop volumineuse après compression. Choisis un fond plus simple.');
  }finally{URL.revokeObjectURL(url)}
 }
 async function open(){
  const login=active||currentLogin();
  if(!isOwner(login))return;
  ensureDialog();
  selectedFile=null;if(previewURL){URL.revokeObjectURL(previewURL);previewURL=''}
  dialog.querySelector('input[type=file]').value='';
  const status=$('.swapp-atmosphere-status',dialog);status.textContent='Chargement de ta personnalisation…';
  dialog.showModal();
  try{
   const data=await getPublic(login);
   if(login!==active)return;
   cached=normalize(data.channel_theme,login);
   dialog.dataset.backgroundUrl=cached.background_url;
   for(const [key,value] of Object.entries(cached)){
    const input=dialog.querySelector('#swapp-atmosphere-'+key);
    if(input)input.value=value;
   }
   display(cached);
   status.textContent='Les changements s’affichent en direct. Publie pour les rendre publics.';
  }catch(error){status.textContent=String(error.message||'Chargement impossible.');}
 }
 const makeButton=()=>{
  const button=make('button','swapp-atmosphere-open','Fond & ambiance');
  button.type='button';button.title='Personnaliser tout le fond de la chaîne';
  button.addEventListener('click',open);return button;
 };
 async function syncPublic(login){
  if(!login||login===cached?.__login)return;
  try{
   const user=await getPublic(login);
   if(active!==login)return;
   cached=normalize(user.channel_theme,login);
   cached.__login=login;
   display(cached);
  }catch(_){}
 }
 function scan(){
  const root=channel.querySelector('.creatorRefine');
  if(root){
   const login=currentLogin();
   if(login!==active){
    active=login;cached=null;
    channel.style.removeProperty('--swapp-background-image');
    channel.dataset.swappHasBackground='false';
    if(login)void syncPublic(login);
   }
   if(isOwner(login)&&!root.querySelector('.swapp-atmosphere-open')){
    const dock=root.querySelector('.swapp-showcase-owner-menu .swapp-showcase-menu-content')||
     root.querySelector('.channelActionDock');
    if(dock)dock.append(makeButton());
   }
   if(profile()?.login===login&&profile()?.channel_theme&&!dialog?.open&&
    !cached?.background_url&&cached?.__login!==login){
    cached=normalize(profile().channel_theme,login);cached.__login=login;display(cached);
   }
  }
  if(manager?.classList.contains('active')&&me()?.login){
   const main=manager.querySelector('.swapp-creator-main');
   if(main&&!main.querySelector('.swapp-atmosphere-open')){
    const button=makeButton();button.classList.add('btn','secondary');
    main.prepend(button);
   }
   if(!active)active=cleanLogin(me().login.toLowerCase());
  }
 }
 let scheduled=false;
 const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;scan()})};
 new MutationObserver(schedule).observe(channel,{childList:true,subtree:false});
 if(manager)new MutationObserver(schedule).observe(manager,{childList:true,subtree:false});
 window.addEventListener('popstate',schedule);
 setInterval(()=>{if(channel.classList.contains('active')||manager?.classList.contains('active'))schedule()},3500);
 schedule();
})();
