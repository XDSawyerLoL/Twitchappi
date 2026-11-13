'use strict';
/* SWAPP Live scenes: local server-owned scene list + actual FFmpeg camera layers.
 * No fake on-air switches: the current FFmpeg pipeline cannot cut scenes live.
 */
(function(){
 const $=id=>document.getElementById(id);
 let data=null,activeId='',busy=false,webcams=[];
 const locked=()=>busy||!!window.SWAPPStudioState?.().capturing||!!window.SWAPPStudioState?.().working;
 const current=()=>data?.scenes?.find(x=>x.id===activeId)||null;
 const notice=(message,error=false)=>{
  $('sceneNotice').textContent=message;
  $('sceneNotice').dataset.error=error?'1':'0';
 };
 async function api(url,options={}){
  const r=await fetch(url,{cache:'no-store',...options});
  const x=await r.json().catch(()=>({success:false,error:'Réponse invalide du moteur de scènes.'}));
  if(!r.ok||x.success===false)throw new Error(x.error||'Erreur '+r.status);
  return x;
 }
 function applyBase(scene){
  if(!scene)return;
  const base=scene.base;
  const mode=$('captureMode').querySelector('option[value="'+base.method+'"]');
  if(!mode||mode.disabled)return;
  $('captureMode').value=base.method;
  $('display').value=String(base.display||0);
  if(base.method==='window')$('windowSelect').value=base.windowHwnd||'';
  if(base.method==='libobs')$('obsSource').value='game';
  window.SWAPPStudioUpdate?.();
 }
 function render(){
  const list=$('sceneList'),layers=$('sceneLayerList');
  list.replaceChildren();
  layers.replaceChildren();
  const active=current();
  for(const scene of data?.scenes||[]){
   const button=document.createElement('button');
   button.type='button';
   button.className='scene-choice'+(scene.id===activeId?' active':'');
   button.textContent=scene.name;
   button.disabled=locked();
   button.setAttribute('role','option');
   button.setAttribute('aria-selected',String(scene.id===activeId));
   button.addEventListener('click',()=>void mutate({action:'select',id:scene.id}));
   list.appendChild(button);
  }
  $('sceneName').value=active?.name||'';
  if(active){
   const node=document.createElement('div'),label=document.createElement('span');
   node.className='scene-layer';
   label.textContent='Capture : '+({
    ddagrab:'Écran DirectX',gdigrab:'Bureau Windows',
    window:'Fenêtre sélectionnée',auto:'Automatique',libobs:'OBS Game Capture'
   }[active.base.method]||'Source principale');
   node.appendChild(label);layers.appendChild(node);
   for(const layer of active.overlays||[]){
    const line=document.createElement('div'),name=document.createElement('span');
    const remove=document.createElement('button');
    line.className='scene-layer';
    name.textContent='Webcam : '+layer.device+' (en superposition)';
    remove.type='button';remove.textContent='Retirer';remove.disabled=locked();
    remove.addEventListener('click',()=>void mutate({action:'remove-webcam',id:activeId,layerId:layer.id}));
    line.append(name,remove);
    layers.appendChild(line);
   }
   notice(active.name+' — '+(active.overlays.length?'capture et '+active.overlays.length+' caméra(s) composées dans la vidéo':'capture principale')+
    '. Les scènes sont conservées sur ton PC.');
  }else notice('Aucune scène disponible. Actualise la liste.',true);
  setLocked(locked());
 }
 function setLocked(isLocked){
  for(const id of ['sceneCreate','sceneDuplicate','sceneRemove','sceneRename','sceneAddWebcam','sceneRefreshDevices','sceneName','webcamSelect'])
   $(id).disabled=!!isLocked||!data;
  for(const button of $('sceneList').querySelectorAll('button'))button.disabled=!!isLocked;
  for(const button of $('sceneLayerList').querySelectorAll('button'))button.disabled=!!isLocked;
 }
 async function reload({apply=true}={}){
  try{
   const result=await api('/api/screen/scenes');
   data={version:result.version,scenes:result.scenes,activeId:result.activeId};
   activeId=result.activeId;
   if(apply)applyBase(current());
   render();
  }catch(e){notice('Scènes indisponibles : '+e.message,true)}
 }
 async function mutate(payload){
  if(locked())return;
  busy=true;setLocked(true);
  try{
   const result=await api('/api/screen/scenes',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
   });
   data={version:result.version,scenes:result.scenes,activeId:result.activeId};
   activeId=data.activeId;
   applyBase(current());busy=false;render();
  }catch(e){
   busy=false;render();notice('Impossible de modifier la scène : '+e.message,true);
  }
 }
 function setWebcams(devices){
  webcams=Array.isArray(devices)?devices:[];
  const select=$('webcamSelect'),old=select.value;
  select.replaceChildren();
  const placeholder=document.createElement('option');
  placeholder.value='';placeholder.textContent=webcams.length?'Choisir une webcam':'Aucune webcam détectée';
  select.appendChild(placeholder);
  for(const item of webcams){
   const option=document.createElement('option');
   option.value=item;option.textContent=item;
   select.appendChild(option);
  }
  select.value=webcams.includes(old)?old:'';
  setLocked(locked());
 }
 function setBase(base){
  const scene=current();
  if(!scene||locked())return;
  if(JSON.stringify(scene.base)===JSON.stringify(base))return;
  void mutate({action:'set-base',id:scene.id,base});
 }
 $('sceneCreate').addEventListener('click',()=>{
  const next='Scène '+((data?.scenes?.length||0)+1);
  void mutate({action:'create',name:next,base:current()?.base});
 });
 $('sceneDuplicate').addEventListener('click',()=>{if(activeId)void mutate({action:'duplicate',id:activeId})});
 $('sceneRemove').addEventListener('click',()=>{if(activeId)void mutate({action:'remove',id:activeId})});
 $('sceneRename').addEventListener('click',()=>{
  if(activeId)void mutate({action:'rename',id:activeId,name:$('sceneName').value});
 });
 $('sceneAddWebcam').addEventListener('click',()=>{
  if(!activeId||!$('webcamSelect').value){notice('Choisis une webcam détectée avant de l’ajouter.',true);return}
  void mutate({action:'add-webcam',id:activeId,device:$('webcamSelect').value});
 });
 $('sceneRefreshDevices').addEventListener('click',()=>void window.SWAPPRefreshDevices?.());
 const SceneAPI={activeId:()=>activeId,current,setLocked,setWebcams,setBase,reload};
 window.SWAPPScenes=SceneAPI;
 void reload();
 // The studio starts device discovery before this module has initialized.
 // Refresh once the scene editor exists so detected webcams actually appear.
 void window.SWAPPRefreshDevices?.();
})();
