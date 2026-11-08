'use strict';
/*
 * Persistent local scenes. Each scene has one base video source and up to two
 * webcam overlays. This is a genuine FFmpeg/OBS scene graph, not decorative UI.
 * Scenes belong to the local SWAPP installation and never contain stream keys.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const MAX_SCENES=16;
const MAX_CAMERAS=2;
const METHODS=['auto','ddagrab','gdigrab','window','libobs'];
const name=x=>String(x||'').trim().slice(0,55);
const id=()=>crypto.randomUUID();
const inRange=(x,min,max,defaultValue)=>Number.isFinite(Number(x))?
 Math.max(min,Math.min(max,Math.round(Number(x)))):defaultValue;

function cleanCamera(s){
 if(!s||typeof s!=='object'||s.type!=='webcam')throw new Error('Source non prise en charge.');
 const device=name(s.device).slice(0,160);
 if(!device)throw new Error('Choisis une caméra Windows disponible.');
 const width=inRange(s.width,100,960,320);
 const height=inRange(s.height,60,540,180);
 return {id:/^[\w-]{3,60}$/.test(s.id||'')?s.id:id(),type:'webcam',device,
  x:inRange(s.x,0,1920-width,1570),y:inRange(s.y,0,1080-height,850),width,height};
}
function cleanBase(s){
 const mode=METHODS.includes(s?.method)?s.method:'auto';
 return {method:mode,display:inRange(s?.display,0,3,0),
  windowHwnd:/^[1-9]\d{0,18}$/.test(String(s?.windowHwnd||''))?String(s.windowHwnd):''};
}
function cleanScene(scene){
 if(!scene||typeof scene!=='object')throw new Error('Scène invalide.');
 const sceneName=name(scene.name);
 if(!sceneName)throw new Error('Donne un nom à la scène.');
 const overlays=Array.isArray(scene.overlays)?scene.overlays:[];
 if(overlays.length>MAX_CAMERAS)throw new Error('Deux webcams maximum par scène pour protéger les performances.');
 const webcamDevices=overlays.map(x=>x.device);
 if(new Set(webcamDevices).size!==webcamDevices.length)throw new Error('Une webcam ne peut apparaître deux fois dans la scène.');
 return {id:/^[\w-]{3,60}$/.test(scene.id||'')?scene.id:id(),
  name:sceneName,base:cleanBase(scene.base),overlays:overlays.map(cleanCamera)};
}
function defaults(){
 const main=cleanScene({id:'scene-default',name:'Scène principale',base:{method:'ddagrab',display:0},overlays:[]});
 return {version:1,activeId:main.id,scenes:[main]};
}
function createSceneStore({filePath,fsImpl=fs}){
 if(!filePath)throw new Error('Scene store requires filePath.');
 const read=()=>{
  try{
   const obj=JSON.parse(fsImpl.readFileSync(filePath,'utf8'));
   if(obj.version!==1||!Array.isArray(obj.scenes)||obj.scenes.length<1||obj.scenes.length>MAX_SCENES)throw Error('invalid');
   const scenes=obj.scenes.map(cleanScene);
   if(new Set(scenes.map(x=>x.id)).size!==scenes.length)throw Error('duplicate ids');
   return {version:1,activeId:scenes.find(s=>s.id===obj.activeId)?.id||scenes[0].id,scenes};
  }catch(_){return defaults()}
 };
 const write=state=>{
  const dir=path.dirname(filePath);fsImpl.mkdirSync(dir,{recursive:true});
  const tmp=filePath+'.'+process.pid+'.tmp';
  fsImpl.writeFileSync(tmp,JSON.stringify(state,null,2),'utf8');
  fsImpl.renameSync(tmp,filePath);
 };
 const get=()=>read();
 const mutate=raw=>{
  const state=read(),action=String(raw?.action||'');
  const selected=state.scenes.find(x=>x.id===raw?.id);
  if(action==='create'){
   if(state.scenes.length>=MAX_SCENES)throw new Error('Limite de 16 scènes.');
   const added=cleanScene({name:name(raw.name)||'Nouvelle scène',
    base:raw.base||state.scenes.find(x=>x.id===state.activeId)?.base,overlays:[]});
   state.scenes.push(added);state.activeId=added.id;
  }else if(action==='duplicate'){
   if(!selected)throw new Error('Scène inexistante.');
   if(state.scenes.length>=MAX_SCENES)throw new Error('Limite de 16 scènes.');
   const copy=cleanScene({...selected,id:id(),name:(selected.name+' copie').slice(0,55),
    overlays:selected.overlays.map(o=>({...o,id:id()}))});
   state.scenes.push(copy);state.activeId=copy.id;
  }else if(action==='select'){
   if(!selected)throw new Error('Scène inexistante.');
   state.activeId=selected.id;
  }else if(action==='rename'){
   if(!selected)throw new Error('Scène inexistante.');
   selected.name=name(raw.name)||selected.name;
  }else if(action==='remove'){
   if(!selected)throw new Error('Scène inexistante.');
   if(state.scenes.length<=1)throw new Error('Conserve au moins une scène.');
   state.scenes=state.scenes.filter(x=>x.id!==selected.id);
   if(state.activeId===selected.id)state.activeId=state.scenes[0].id;
  }else if(action==='set-base'){
   if(!selected)throw new Error('Scène inexistante.');
   selected.base=cleanBase(raw.base);
  }else if(action==='add-webcam'){
   if(!selected)throw new Error('Scène inexistante.');
   if(selected.overlays.length>=MAX_CAMERAS)throw new Error('Deux webcams maximum par scène.');
   selected.overlays.push(cleanCamera({type:'webcam',device:raw.device,
    x:raw.x,y:raw.y,width:raw.width,height:raw.height}));
  }else if(action==='update-webcam'){
   if(!selected)throw new Error('Scène inexistante.');
   const index=selected.overlays.findIndex(x=>x.id===raw.layerId);
   if(index<0)throw new Error('Source webcam introuvable.');
   selected.overlays[index]=cleanCamera({...selected.overlays[index],...raw.overlay,
    id:selected.overlays[index].id,type:'webcam'});
  }else if(action==='remove-webcam'){
   if(!selected)throw new Error('Scène inexistante.');
   if(!selected.overlays.some(x=>x.id===raw.layerId))throw new Error('Source introuvable.');
   selected.overlays=selected.overlays.filter(x=>x.id!==raw.layerId);
  }else throw new Error('Action de scène inconnue.');
  // Validate the *complete* graph after every mutation, including duplicated
  // webcam devices. Never persist invalid sources or layer collections.
  state.scenes=state.scenes.map(cleanScene);
  if(new Set(state.scenes.map(x=>x.id)).size!==state.scenes.length)
   throw new Error('Identifiants de scènes dupliqués.');
  write(state);
  return state;
 };
 return {get,mutate,active:()=>{const x=read();return x.scenes.find(s=>s.id===x.activeId)}};
}
module.exports={createSceneStore,cleanScene,cleanBase,cleanCamera,defaults};
