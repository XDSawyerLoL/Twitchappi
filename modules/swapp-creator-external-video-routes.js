'use strict';
const {normalizeVideos}=require('../lib/swapp-creator-external-videos');
const {createCreatorVideoStore}=require('./swapp-creator-external-video-store');
function installCreatorVideos(app,{restoreSession,readUsers,mutationLimiter}){
 let store;
 function getStore(){return store||(store=createCreatorVideoStore());}
 const login=value=>/^[a-z0-9_-]{2,48}$/.test(String(value||'').toLowerCase())?String(value).toLowerCase():null;
 app.get('/api/creator/external-videos/:login',async(req,res)=>{
  const target=login(req.params.login);
  if(!target)return res.status(400).json({success:false,error:'Créateur invalide.'});
  try{
   const users=readUsers().users||[],owner=users.find(u=>u.login===target);
   if(!owner)return res.status(404).json({success:false,error:'Créateur introuvable.'});
   // Private profiles never expose external video metadata to strangers.
   if(owner.channel_public===false){
    await restoreSession(req,res,{allowUserRecovery:false});
    if(req.session?.oryonUser?.id!==owner.id)return res.status(404).json({success:false,error:'Profil indisponible.'});
   }
   res.setHeader('Cache-Control','private, no-store');
   return res.json({success:true,videos:await getStore().list(target)});
  }catch(_){return res.status(503).json({success:false,error:'Vidéos temporairement indisponibles.'})}
 });
 app.put('/api/creator/external-videos/:login',mutationLimiter,async(req,res)=>{
  const target=login(req.params.login);
  if(!target)return res.status(400).json({success:false,error:'Créateur invalide.'});
  try{
   await restoreSession(req,res,{allowUserRecovery:false});
   const current=req.session?.oryonUser;
   if(!current?.id)return res.status(401).json({success:false,error:'Connexion SWAPP requise.'});
   const owner=(readUsers().users||[]).find(u=>u.login===target);
   if(!owner||owner.id!==current.id)return res.status(403).json({success:false,error:'Modification non autorisée.'});
   // Reject cross-origin browser mutations; do not trust a client-supplied login.
   const origin=req.get('origin');
   if(!origin||new URL(origin).origin!==req.protocol+'://'+req.get('host'))
    return res.status(403).json({success:false,error:'Origine non autorisée.'});
   const videos=normalizeVideos(req.body?.videos);
   if(videos.filter(v=>v.pinned).length>1)return res.status(400).json({success:false,error:'Une seule vidéo à la une.'});
   await getStore().replace(target,videos);
   res.setHeader('Cache-Control','no-store');
   return res.json({success:true,videos});
  }catch(error){
   if(/Maximum|Lien vidéo|déjà ajoutée|seule vidéo/.test(error.message))return res.status(400).json({success:false,error:error.message});
   return res.status(503).json({success:false,error:'Sauvegarde temporairement indisponible.'});
  }
 });
}
module.exports={installCreatorVideos};
