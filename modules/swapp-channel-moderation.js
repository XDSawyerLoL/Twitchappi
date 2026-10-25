'use strict';

// Native SWAPP channel moderation. Keeps existing bans, mutes and words in
// .oryon-moderation.json; privileges are always resolved from server sessions.
const cleanLogin=value=>{
 const s=String(value||'').trim().toLowerCase();
 return /^[a-z0-9_][a-z0-9_-]{1,39}$/.test(s)&&!['__proto__','prototype','constructor'].includes(s)?s:'';
};
const safeString=(value,max)=>String(value||'').trim().slice(0,max);
const limitedArray=value=>Array.isArray(value)?value:[];
function actorRole(session,room,state,lookup){
 const local=session&&session.oryonUser;
 if(!local||!local.id)return 'viewer';
 const stored=lookup(cleanLogin(local.login));
 if(!stored||String(stored.id)!==String(local.id))return 'viewer';
 const login=cleanLogin(stored.login);
 if(login===room)return 'owner';
 return limitedArray(state.moderators).includes(login)?'moderator':'viewer';
}
function postAllowed(req){
 const ct=String(req.headers?.['content-type']||'').split(';')[0].toLowerCase();
 if(ct!=='application/json')return false;
 const origin=req.headers?.origin;
 if(!origin)return true;
 try{
  const u=new URL(origin);
  const host=String(req.headers?.host||'');
  return u.host===host && (u.protocol==='https:'||u.protocol==='http:');
 }catch(_){return false}
}
function installChannelModeration({app,io,getModState,saveModState,getNativeChat,getAnySocketDisplay,getOryonUserByLogin}){
 if(!app||!io||!getModState||!saveModState||!getNativeChat||!getAnySocketDisplay||!getOryonUserByLogin)throw Error('missing channel moderation dependencies');
 const lastSent=new Map();
 const actionRate=new Map();
 const cooldownKey=(room,u)=>room+':'+String(u.type)+':'+String(u.id);
 function role(req,room,state){return actorRole(req.session,room,state,getOryonUserByLogin);}
 function overview(room,state,identity){
  const messages=getNativeChat(room).slice(-40).reverse().map(m=>({
   id:m.id,user:m.user,user_display:m.user_display,ts:m.ts,
   text:safeString(m.text,500),gif:!!m.gif,emote:!!m.emote
  }));
  return {success:true,room,role:identity,state:{
   banned:limitedArray(state.banned),muted:limitedArray(state.muted),
   moderators:limitedArray(state.moderators),
   blocked_words:limitedArray(state.blocked_words),
   timeouts:state.timeouts&&typeof state.timeouts==='object'?state.timeouts:{},
   slow_seconds:Number(state.slow_seconds)||0,
   audit:limitedArray(state.audit).slice(-30).reverse()
  },messages};
 }
 app.get('/api/swapp/channel-moderation/:room',(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const room=cleanLogin(req.params.room);
  if(!room||!getOryonUserByLogin(room))return res.status(404).json({success:false,error:'Chaîne introuvable.'});
  const {state}=getModState(room);
  const identity=role(req,room,state);
  if(identity==='viewer')return res.json({success:true,room,role:identity});
  return res.json(overview(room,state,identity));
 });
 app.post('/api/swapp/channel-moderation/:room',(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!postAllowed(req))return res.status(403).json({success:false,error:'Requête refusée.'});
  const room=cleanLogin(req.params.room);
  if(!room||!getOryonUserByLogin(room))return res.status(404).json({success:false,error:'Chaîne introuvable.'});
  const {data,state}=getModState(room);
  const identity=role(req,room,state);
  if(identity==='viewer')return res.status(403).json({success:false,error:'Modération réservée à la chaîne.'});
  const actor=cleanLogin(req.session.oryonUser.login);
  const actionKey=room+':'+String(req.session.oryonUser.id);
  const time=Date.now();
  const requests=(actionRate.get(actionKey)||[]).filter(at=>time-at<10000);
  if(requests.length>=25)return res.status(429).json({success:false,error:'Trop de commandes, réessaie dans quelques secondes.'});
  requests.push(time);actionRate.set(actionKey,requests);
  if(actionRate.size>2000)for(const [key,stamps] of actionRate){if(stamps.every(at=>time-at>10000))actionRate.delete(key);}
  const action=safeString(req.body?.action,25);
  const target=cleanLogin(req.body?.target);
  const privileged=['add_mod','remove_mod','words','slow'];
  if(privileged.includes(action)&&identity!=='owner')return res.status(403).json({success:false,error:'Réservé au propriétaire.'});
  const needTarget=['add_mod','remove_mod','ban','unban','mute','unmute','timeout','untimeout'];
  if(needTarget.includes(action)&&!target)return res.status(400).json({success:false,error:'Compte invalide.'});
  if(needTarget.includes(action)&&action!=='unban'&&action!=='unmute'&&action!=='untimeout'){
   if(target===room||target===actor||identity==='moderator'&&limitedArray(state.moderators).includes(target))
    return res.status(403).json({success:false,error:'Action interdite sur ce compte.'});
  }
  const now=Date.now();
  let removed=null;
  switch(action){
   case 'add_mod':
    if(!getOryonUserByLogin(target))return res.status(404).json({success:false,error:'Compte SWAPP introuvable.'});
    state.moderators=limitedArray(state.moderators);
    if(!state.moderators.includes(target)){
     if(state.moderators.length>=25)return res.status(400).json({success:false,error:'Maximum 25 modérateurs.'});
     state.moderators.push(target);
    }
    break;
   case 'remove_mod':state.moderators=limitedArray(state.moderators).filter(x=>x!==target);break;
   case 'ban':
    state.banned=limitedArray(state.banned);
    if(!state.banned.includes(target))state.banned.push(target);
    break;
   case 'unban':state.banned=limitedArray(state.banned).filter(x=>x!==target);break;
   case 'mute':
    state.muted=limitedArray(state.muted);
    if(!state.muted.includes(target))state.muted.push(target);
    break;
   case 'unmute':state.muted=limitedArray(state.muted).filter(x=>x!==target);break;
   case 'timeout':{
    const minutes=Number(req.body?.minutes);
    if(!Number.isInteger(minutes)||minutes<1||minutes>1440)return res.status(400).json({success:false,error:'Durée limitée à 1–1440 minutes.'});
    state.timeouts=state.timeouts&&typeof state.timeouts==='object'&&!Array.isArray(state.timeouts)?state.timeouts:{};
    state.timeouts[target]=now+minutes*60000;break;
   }
   case 'untimeout':
    if(state.timeouts&&typeof state.timeouts==='object')delete state.timeouts[target];
    break;
   case 'words':
    state.blocked_words=String(req.body?.words||'').toLowerCase()
     .split(/[,;\n]/).map(x=>x.trim().slice(0,50)).filter(x=>x.length>=2).slice(0,100);
    break;
   case 'slow':{
    const seconds=Number(req.body?.seconds);
    if(![0,3,5,10,20,30].includes(seconds))return res.status(400).json({success:false,error:'Ralentissement invalide.'});
    state.slow_seconds=seconds;break;
   }
   case 'delete':{
    const id=safeString(req.body?.id,100);
    const history=getNativeChat(room);
    const index=history.findIndex(m=>m.id===id);
    if(index<0)return res.status(404).json({success:false,error:'Message introuvable dans le tchat récent.'});
    removed=history[index];
    history.splice(index,1);
    break;
   }
   default:return res.status(400).json({success:false,error:'Action inconnue.'});
  }
  state.audit=limitedArray(state.audit);
  state.audit.push({action,by:actor,target:target||(removed?.user||''),ts:now});
  state.audit=state.audit.slice(-100);
  try{saveModState(data);}
  catch(e){
   if(removed)getNativeChat(room).push(removed);
   return res.status(503).json({success:false,error:'Enregistrement indisponible.'});
  }
  if(removed)io.emit('native:chat:deleted',{room,id:removed.id});
  io.to('native:'+room).emit('native:moderation:updated',{room});
  return res.json(overview(room,state,identity));
 });
 // Runs before the existing native:chat handler; never trusts a client role.
 io.on('connection',socket=>{
  socket.use((packet,next)=>{
   if(packet?.[0]!=='native:chat')return next();
   const msg=packet[1]||{};
   const room=cleanLogin(msg.room||socket.data.nativeRoom);
   const user=getAnySocketDisplay(socket);
   if(!room||!user)return next();
   const {state}=getModState(room);
   const login=cleanLogin(user.login);
   const forbidden=limitedArray(state.banned).includes(login)||
    limitedArray(state.muted).includes(login)||
    Number(state.timeouts?.[login]||0)>Date.now();
   if(forbidden){
    socket.emit('native:error',{message:'Tu ne peux pas écrire dans ce salon pour le moment.'});
    return;
   }
   const key=cooldownKey(room,user);
   const now=Date.now();
   const previous=lastSent.get(key);
   const delay=Math.max(0,Number(state.slow_seconds)||0)*1000;
   const isPrivileged=login===room||limitedArray(state.moderators).includes(login);
   if(!isPrivileged&&previous&&delay>0&&now-previous.at<delay){
    socket.emit('native:error',{message:'Mode lent : attends avant de renvoyer un message.'});
    return;
   }
   const fingerprint=safeString(msg.text,500).toLowerCase()+'|'+safeString(msg.gif,800);
   if(!isPrivileged&&previous&&fingerprint!=='|'&&previous.text===fingerprint&&now-previous.at<10000){
    socket.emit('native:error',{message:'Message identique déjà envoyé.'});
    return;
   }
   lastSent.set(key,{at:now,text:fingerprint});
   if(lastSent.size>3000)for(const [k,v] of lastSent){if(now-v.at>120000)lastSent.delete(k);}
   return next();
  });
 });
 return {actorRole};
}
module.exports={installChannelModeration,cleanLogin,actorRole,postAllowed};
