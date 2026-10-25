/* SWAPP Live Web: capture locally in the browser, no desktop installation.
 * Metadata editing reuses the established SWAPP native live controller.
 */
(function(){
 'use strict';
 const $=(s,root=document)=>root.querySelector(s);
 const make=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 const studio={capture};
 let dialog=null,activeRoom='',busy=false;
 let metadataPromise=null,managerBound=null,lastPublicFetch=0;
 const socketBound=new WeakSet();
 const current=()=>{try{return typeof state!=='undefined'?state:null}catch(_){return null}};
 const currentRoom=()=>{
  const stateNow=current();
  return String(stateNow?.channelProfile?.login||stateNow?.watchRoom||stateNow?.lastChannelLogin||'').trim().toLowerCase();
 };
 const ownRoom=()=>{
  const s=current();
  return !!s?.session?.local?.id&&!!currentRoom()&&String(s.session.local.login).toLowerCase()===currentRoom();
 };
 const active=el=>!!el?.classList.contains('active');
 const formUrl='/api/swapp/live/metadata';
 async function metadata(payload){
  const response=await fetch(formUrl,{credentials:'same-origin',cache:'no-store',
   method:payload?'POST':'GET',headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  const result=await response.json().catch(()=>({success:false,error:'Réponse invalide.'}));
  if(!response.ok||result.success===false)throw Error(result.error||'Enregistrement indisponible.');
  return result;
 }
 function useMetadata(info){
  const s=current();
  if(!s||!info)return;
  if(s.channelProfile?.login===info.room){
   s.channelProfile.current_live_title=info.title;
   s.channelProfile.current_live_category=info.category;
  }
  if(s.room===info.room && s.nativeLiveInfo){
   s.nativeLiveInfo.title=info.title;
   s.nativeLiveInfo.category=info.category;
  }
  const manager=$('#manager');
  if(manager && active(manager)){
   const title=$('#liveTitle',manager),category=$('#liveCategory',manager);
   if(title&&document.activeElement!==title)title.value=info.title;
   if(category&&document.activeElement!==category)category.value=info.category;
  }
  publicHeading(info);
 }
 async function save(title,category,status){
  if(busy)return;
  busy=true;
  if(status)status.textContent='Enregistrement…';
  try{
   const result=await metadata({title,category});
   useMetadata(result);
   if(status)status.textContent=result.is_live?'Direct mis à jour pour les spectateurs.':'Titre et catégorie enregistrés.';
   return result;
  }catch(error){if(status)status.textContent=error.message;return null}
  finally{busy=false}
 }
 function connectManager(){
  const manager=$('#manager'),s=current();
  if(!manager||!s?.session?.local||!manager.querySelector('.managerHero'))return;
  const panel=manager.querySelector('.managerHero > .panel');
  if(!panel)return;
  const existing=manager.querySelector('[data-swapp-studio-intro]');
  if(managerBound===panel&&existing)return;
  managerBound=panel;
  const head=manager.querySelector('.pageHead h1');
  if(head)head.textContent='SWAPP Live — Studio navigateur';
  const intro=manager.querySelector('.pageHead p');
  if(intro)intro.textContent='Diffuse ton écran, ta caméra et ton microphone directement sur SWAPP, sans logiciel à installer.';
  const modes=manager.querySelectorAll('.streamModeGrid .modeCard');
  if(modes[0]){
   const h=modes[0].querySelector('h2');if(h)h.textContent='SWAPP Live Web';
   const p=modes[0].querySelector('p');if(p)p.textContent='Méthode principale : diffusion depuis ce navigateur.';
  }
  if(modes[1]){
   modes[1].classList.remove('active');
   const h=modes[1].querySelector('h2');if(h)h.textContent='OBS — option avancée';
   const p=modes[1].querySelector('p');if(p)p.textContent='Pour les scènes et plugins OBS, l’application PC reste une option. Un navigateur ne capte pas directement le RTMP local d’OBS.';
  }
  const editor=make('section','swapp-studio-editor');
  editor.dataset.swappStudioIntro='1';
  const title=make('h2','','Paramètres du direct');
  const paragraph=make('p','', 'Modifie le titre et la catégorie à tout moment, même pendant la diffusion.');
  const buttons=make('div','swapp-studio-editor-actions');
  const saveButton=make('button','btn secondary','Enregistrer les modifications');
  saveButton.type='button';
  const status=make('span','swapp-studio-feedback','');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  saveButton.addEventListener('click',()=>{
   const t=$('#liveTitle',manager)?.value||'';
   const c=$('#liveCategory',manager)?.value||'';
   void save(t,c,status);
  });
  buttons.append(saveButton,status);
  editor.append(title,paragraph,buttons);
  const fields=panel.querySelector('.three');
  if(fields){fields.insertAdjacentElement('afterend',editor);}
  const titleField=$('#liveTitle',manager),catField=$('#liveCategory',manager);
  if(titleField){
   titleField.setAttribute('aria-label','Titre du direct');
   titleField.maxLength=120;
  }
  if(catField){
   catField.setAttribute('aria-label','Jeu ou catégorie du direct');
   catField.maxLength=60;
  }
  const launch=$('#startLiveBtn',manager);
  if(launch)launch.textContent='Démarrer SWAPP Live';
  const mainTitle=panel.querySelector('h2');
  if(mainTitle&&mainTitle!==title)mainTitle.textContent='Diffuser sans installation';
  const cfg=manager.querySelector('#oryonLivePanel');
  if(cfg){
   const explanatory=cfg.querySelector('p');
   if(explanatory)explanatory.textContent='Option facultative pour conserver les scènes OBS : le studio navigateur ci-contre ne nécessite aucun téléchargement.';
   const link=cfg.querySelector('a[download]');
   if(link)link.textContent='Télécharger SWAPP Live (option OBS)';
  }
  const deviceNote=make('p','swapp-studio-device-note',
   'Pour partager un jeu : choisis « Partage écran ». Le navigateur demandera quelle fenêtre capturer. Le microphone et le son système dépendent des autorisations et du navigateur. Garde cet onglet ouvert pendant le direct.');
  panel.insertBefore(deviceNote,editor);
  if(!navigator.mediaDevices?.getDisplayMedia){
   if(launch){launch.disabled=true;launch.title='Capture écran non disponible : utilise un navigateur récent en HTTPS';}
   status.textContent='Ce navigateur ne propose pas la capture d’écran sécurisée.';
  }
  // Do not overwrite edits while the owner is typing.
  const startTitle=titleField?.value||'';
  const startCategory=catField?.value||'';
  metadata().then(result=>{
   if(!panel.isConnected)return;
   if(titleField?.value===startTitle&&document.activeElement!==titleField)titleField.value=result.title||startTitle;
   if(catField?.value===startCategory&&document.activeElement!==catField)catField.value=result.category||startCategory;
   if(!current()?.channelProfile){} // The public channel may not be mounted.
  }).catch(()=>{});
 }
 function ensureDialog(){
  if(dialog)return dialog;
  dialog=make('dialog','swapp-studio-dialog');
  const frame=make('form','swapp-studio-dialog-content');
  frame.method='dialog';
  const heading=make('h2','','Modifier mon direct');
  const close=make('button','swapp-studio-dialog-close','×');
  close.type='button';close.setAttribute('aria-label','Fermer');
  close.addEventListener('click',()=>dialog.close());
  const titleLabel=make('label','','Titre du direct');
  const title=make('input','');title.name='title';title.maxLength=120;title.required=true;title.minLength=3;
  titleLabel.appendChild(title);
  const catLabel=make('label','','Jeu ou catégorie');
  const category=make('input','');category.name='category';category.maxLength=60;
  catLabel.appendChild(category);
  const actions=make('div','swapp-studio-dialog-actions');
  const saveButton=make('button','btn good','Enregistrer');saveButton.type='submit';
  const status=make('span','swapp-studio-dialog-status','');status.setAttribute('role','status');
  actions.append(saveButton,status);frame.append(heading,close,titleLabel,catLabel,actions);
  frame.addEventListener('submit',event=>{
   event.preventDefault();
   void save(title.value,category.value,status).then(result=>{if(result)dialog.close()});
  });
  dialog.append(frame);document.body.append(dialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  return dialog;
 }
 async function openEditor(){
  if(!ownRoom())return;
  const modal=ensureDialog();
  modal.showModal();
  const title=$('[name="title"]',modal),cat=$('[name="category"]',modal);
  const info=current()?.channelProfile;
  title.value=info?.current_live_title||'';
  cat.value=info?.current_live_category||'';
  try{
   const latest=await metadata();
   if(modal.open && ownRoom()){title.value=latest.title;cat.value=latest.category;}
  }catch(error){$('.swapp-studio-dialog-status',modal).textContent=error.message;}
 }
 function publicHeading(info){
  const page=$('#channel');
  if(!page||!active(page))return;
  const s=current();
  if(!s||!info||info.room!==currentRoom())return;
  const main=page.querySelector('.channelMainPlayer');
  if(!main)return;
  const isLive=Boolean(s.channelProfile?.is_live||s.channelOwner&&s.stream||info.live||info.is_live);
  let heading=main.querySelector(':scope > .swapp-stream-public-heading');
  if(!isLive){heading?.remove();return}
  if(!heading){heading=make('div','swapp-stream-public-heading');main.prepend(heading)}
  heading.replaceChildren();
  const title=make('strong','',info.title||'Direct SWAPP');
  const category=make('span','',info.category||'Gaming');
  heading.append(title,category);
 }
 function connectChannel(){
  const page=$('#channel'),s=current();
  if(!page||!active(page)||!s?.channelProfile?.login)return;
  const room=currentRoom();
  const profile=s.channelProfile;
  publicHeading({room,title:profile.current_live_title,category:profile.current_live_category,is_live:profile.is_live});
  const dock=page.querySelector('.channelActionDock');
  if(!dock)return;
  const existing=dock.querySelector('[data-swapp-live-owner-edit]');
  if(!ownRoom()){existing?.remove();return}
  if(existing)return;
  const edit=make('button','btn secondary swapp-studio-owner-edit','Modifier le direct');
  edit.type='button';edit.dataset.swappLiveOwnerEdit='1';
  edit.addEventListener('click',openEditor);dock.append(edit);
 }
 function wireSocket(){
  const s=current()?.socket;if(!s||socketBound.has(s))return;
  socketBound.add(s);
  s.on('native:metadata:updated',data=>{
   if(!data?.room)return;
   const stateNow=current();
   if(stateNow?.channelProfile?.login===data.room ||stateNow?.room===data.room)useMetadata(data);
  });
 }
 async function refreshPublic(){
  const page=$('#channel'),name=currentRoom();
  if(!active(page)||!name||Date.now()-lastPublicFetch<18000)return;
  lastPublicFetch=Date.now();
  try{
   const response=await fetch('/api/oryon/profile/'+encodeURIComponent(name),{cache:'no-store',credentials:'same-origin'});
   if(!response.ok)return;
   const json=await response.json();
   if(currentRoom()!==name||!json?.user)return;
   if(current()?.channelProfile?.login===name){
    const stateNow=current();
    stateNow.channelProfile.current_live_title=json.user.current_live_title;
    stateNow.channelProfile.current_live_category=json.user.current_live_category;
    stateNow.channelProfile.is_live=json.user.is_live;
   }
   publicHeading({room:name,title:json.user.current_live_title,category:json.user.current_live_category,is_live:json.user.is_live});
  }catch(_){}
 }
 let scheduled=false;
 function scan(){
  wireSocket();
  if(active($('#manager')))connectManager();
  if(active($('#channel'))){
   connectChannel();void refreshPublic();
  }
 }
 function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;scan()});
 }
 for(const id of ['manager','channel']){
  const root=document.getElementById(id);
  if(root)new MutationObserver(events=>{
   if(events.some(e=>e.target===root && e.addedNodes.length))schedule();
  }).observe(root,{childList:true});
 }
 window.addEventListener('popstate',schedule);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
 setInterval(scan,5500);
 globalThis.SwappBrowserStudio=studio;
 schedule();

 // Media stream construction for a real in-browser studio.
 async function capture({source='screen',video={}}={}){
  if(!navigator.mediaDevices)throw Error('media_devices_unavailable');
  const devices=navigator.mediaDevices;
  if(source==='camera'){
   return devices.getUserMedia({video,audio:{echoCancellation:true,noiseSuppression:true}});
  }
  const resources=[],screens=[],videos=[],listeners=[];
  let audioContext=null,animation=null,composite=null;
  try{
   const screen=await devices.getDisplayMedia({video,audio:true});
   resources.push(screen);screens.push(screen);
   let camera=null,microphone=null;
   if(source==='screen-camera'){
    try{
     camera=await devices.getUserMedia({video:{width:{ideal:640},height:{ideal:360}},audio:{echoCancellation:true,noiseSuppression:true}});
     resources.push(camera);
    }catch(e){console.warn('[SWAPP WEB STUDIO] camera unavailable, screen only');}
   }else{
    try{microphone=await devices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});resources.push(microphone);}
    catch(_){/* Microphone is optional; screen system audio may still work. */}
   }
   let videoTracks=screen.getVideoTracks();
   if(camera?.getVideoTracks()?.length){
    const canvas=document.createElement('canvas');
    canvas.width=video.width?.ideal||1920;canvas.height=video.height?.ideal||1080;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('canvas_unsupported');
    const screenVideo=document.createElement('video');
    const cameraVideo=document.createElement('video');
    for(const [element,stream] of [[screenVideo,screen],[cameraVideo,camera]]){
     element.srcObject=stream;element.muted=true;element.playsInline=true;
     element.play().catch(()=>{});videos.push(element);
    }
    const render=()=>{
     if(screen.getVideoTracks().every(x=>x.readyState==='ended'))return;
     ctx.fillStyle='#030508';ctx.fillRect(0,0,canvas.width,canvas.height);
     if(screenVideo.readyState>=2)try{ctx.drawImage(screenVideo,0,0,canvas.width,canvas.height)}catch(_){}
     const w=Math.round(canvas.width*.22),h=Math.round(w*9/16),x=canvas.width-w-24,y=24;
     if(cameraVideo.readyState>=2){
      ctx.fillStyle='rgba(0,0,0,.48)';ctx.fillRect(x-5,y-5,w+10,h+10);
      try{ctx.drawImage(cameraVideo,x,y,w,h)}catch(_){}
     }
     animation=requestAnimationFrame(render);
    };
    render();
    composite=canvas.captureStream(30);
    videoTracks=composite.getVideoTracks();
   }
   const sources=[...screen.getAudioTracks(),...(camera||microphone)?.getAudioTracks?.()||[]];
   const outgoing=new MediaStream(videoTracks);
   if(sources.length>=2){
    const Context=window.AudioContext||window.webkitAudioContext;
    if(Context){
     audioContext=new Context();
     const destination=audioContext.createMediaStreamDestination();
     for(const [i,track] of sources.entries()){
      const src=audioContext.createMediaStreamSource(new MediaStream([track]));
      const gain=audioContext.createGain();gain.gain.value=i===0?0.75:0.88;
      src.connect(gain);gain.connect(destination);
     }
     await audioContext.resume();
     for(const track of destination.stream.getAudioTracks())outgoing.addTrack(track);
    }else outgoing.addTrack(sources[0]);
   }else if(sources.length===1)outgoing.addTrack(sources[0]);
   outgoing._oryonSources=resources;
   outgoing._swappCleanup=()=>{
    if(animation!==null)cancelAnimationFrame(animation);
    for(const vid of videos){vid.pause();vid.srcObject=null}
    for(const [track,callback] of listeners)track.removeEventListener('ended',callback);
    if(audioContext)void audioContext.close().catch(()=>{});
    for(const track of composite?.getTracks()||[])track.stop();
   };
   const stopOnScreenEnd=()=>{try{if(typeof stopLive==='function'&&current()?.stream===outgoing)stopLive()}catch(_){}};
   for(const track of screen.getVideoTracks()){
    track.addEventListener('ended',stopOnScreenEnd,{once:true});
    listeners.push([track,stopOnScreenEnd]);
   }
   return outgoing;
  }catch(e){
   if(animation!==null)cancelAnimationFrame(animation);
   for(const vid of videos){vid.pause();vid.srcObject=null}
   if(audioContext)void audioContext.close().catch(()=>{});
   for(const resource of resources)for(const track of resource.getTracks())track.stop();
   throw e;
  }
 }
})();
