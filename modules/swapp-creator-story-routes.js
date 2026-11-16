'use strict';
const {normalizeStory,StoryInputError}=require('../lib/swapp-creator-stories');
const {createCreatorStoryStore}=require('./swapp-creator-story-store');
function installCreatorStories(app,{restoreSession,readUsers,mutationLimiter,storeFactory=createCreatorStoryStore}){
 const login=value=>/^[a-z0-9_-]{2,48}$/.test(String(value||'').toLowerCase())?String(value).toLowerCase():null;
 let store;
 const getStore=()=>store||(store=storeFactory());
 const send=(res,status,error)=>res.status(status).json({success:false,error});
 const creator=loginName=>(readUsers().users||[]).find(u=>String(u.login||'').toLowerCase()===loginName);
 async function owner(req,res,target){
  try{await restoreSession(req,res,{allowUserRecovery:false})}
  catch(_){send(res,503,'Session indisponible.');return false}
  const current=req.session?.oryonUser;
  if(!current?.id){send(res,401,'Connexion SWAPP requise.');return false}
  if(!creator(target)||creator(target).id!==current.id){
   send(res,403,'Modification non autorisée.');return false
  }
  const origin=req.get('origin');
  const valid=['https://swapp.tv','https://www.swapp.tv',...(process.env.NODE_ENV==='production'?[]:['http://localhost:3000','http://127.0.0.1:3000'])];
  if(!origin||!valid.includes(origin)){send(res,403,'Origine non autorisée.');return false}
  return true;
 }
 app.get('/api/creator/stories/:login',async(req,res)=>{
  const target=login(req.params.login);
  if(!target)return send(res,400,'Créateur invalide.');
  try{
   const profile=creator(target);
   if(!profile)return send(res,404,'Créateur introuvable.');
   if(profile.channel_public===false){
    try{await restoreSession(req,res,{allowUserRecovery:false})}
    catch(_){return send(res,404,'Profil indisponible.')}
    if(req.session?.oryonUser?.id!==profile.id)return send(res,404,'Profil indisponible.');
   }
   res.setHeader('Cache-Control','private, no-store');
   return res.json({success:true,stories:await getStore().list(target)});
  }catch(_){return send(res,503,'Stories temporairement indisponibles.')}
 });
 app.post('/api/creator/stories/:login',mutationLimiter,async(req,res)=>{
  const target=login(req.params.login);
  if(!target)return send(res,400,'Créateur invalide.');
  if(!(await owner(req,res,target)))return;
  try{
   const content=normalizeStory(req.body);
   const published=await getStore().publish(target,content);
   res.setHeader('Cache-Control','no-store');
   return res.status(201).json({success:true,story:published});
  }catch(error){
   if(error instanceof StoryInputError)return send(res,400,error.code);
   if(error.message==='story_limit_reached')return send(res,409,'Maximum de quatre stories actives.');
   return send(res,503,'Publication temporairement indisponible.');
  }
 });
 app.delete('/api/creator/stories/:login/:storyId',mutationLimiter,async(req,res)=>{
  const target=login(req.params.login);
  if(!target)return send(res,400,'Créateur invalide.');
  if(!(await owner(req,res,target)))return;
  try{
   const removed=await getStore().remove(target,req.params.storyId);
   if(!removed)return send(res,404,'Story introuvable.');
   res.setHeader('Cache-Control','no-store');
   return res.json({success:true,removed:true});
  }catch(_){return send(res,503,'Suppression temporairement indisponible.')}
 });
}
module.exports={installCreatorStories};
