'use strict';
const {URL}=require('node:url');
// Native SWAPP Live metadata — owner-only server-side writes.
function cleanTitle(value){
 const input=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 return input.length>=3&&input.length<=120?input:null;
}
function cleanCategory(value){
 const input=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 return input.length<=60?input:null;
}
function ownSession(req,stored){
 const sess=req.session?.oryonUser;
 return !!sess?.id&&!!stored&&String(sess.id)===String(stored.id)&&String(sess.login).toLowerCase()===String(stored.login).toLowerCase();
}
function sameOrigin(req){
 const origin=String(req.get?.('origin')||req.headers?.origin||'');
 const host=String(req.get?.('host')||req.headers?.host||'');
 if(!origin||!host)return false;
 try{const parsed=new URL(origin);return ['https:','http:'].includes(parsed.protocol)&&parsed.host===host}catch(_){return false}
}
function installLiveMetadata({app,io,getUsers,findUser,saveUsers,getRoom,limiter}){
 if(!app||!io||!getUsers||!findUser||!saveUsers||!getRoom)throw Error('live_metadata_invalid_dependencies');
 function authorized(req,res){
  const login=String(req.session?.oryonUser?.login||'').toLowerCase();
  const user=login&&findUser(login);
  if(!ownSession(req,user)){res.status(401).json({success:false,error:'Compte SWAPP requis.'});return null}
  return user;
 }
 function result(user,room){
  return {success:true,room:user.login,title:String(room?.title||user.current_live_title||('Live de '+(user.display_name||user.login))),
   category:String(room?.category??user.current_live_category??''),
   is_live:!!room||user.live_status==='live'&&!!user.local_agent_live,
   editor:'owner'};
 }
 app.get('/api/swapp/live/metadata',(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const user=authorized(req,res);if(!user)return;
  res.json(result(user,getRoom(user.login)));
 });
 const actions=[];
 if(limiter)actions.push(limiter);
 app.post('/api/swapp/live/metadata',...actions,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!sameOrigin(req)||!String(req.get?.('content-type')||req.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))
   return res.status(403).json({success:false,error:'Origine ou type de requête refusé.'});
  const user=authorized(req,res);if(!user)return;
  const title=cleanTitle(req.body?.title),category=cleanCategory(req.body?.category);
  if(title===null||category===null)
   return res.status(400).json({success:false,error:'Titre de 3 à 120 caractères et catégorie de 60 caractères maximum.'});
  const users=getUsers();
  const record=(users.users||[]).find(u=>String(u.id)===String(user.id));
  if(!record)return res.status(404).json({success:false,error:'Compte introuvable.'});
  const prev={title:record.current_live_title,category:record.current_live_category,updated:record.live_metadata_dashboard_updated_at};
  const now=Date.now(),room=getRoom(record.login);
  record.current_live_title=title;
  record.current_live_category=category;
  record.live_metadata_dashboard_updated_at=now;
  record.channel_updatedAt=now;
  try{await saveUsers(users)}
  catch(_){
   record.current_live_title=prev.title;
   record.current_live_category=prev.category;
   record.live_metadata_dashboard_updated_at=prev.updated;
   return res.status(503).json({success:false,error:'Sauvegarde momentanément indisponible.'});
  }
  if(room){
   room.title=title;room.category=category;
  }
  const packet={room:record.login,title,category,updated_at:now,live:!!room||!!record.local_agent_live};
  io.to('native:'+record.login).emit('native:metadata:updated',packet);
  io.emit('native:lives:update');
  res.json({...result(record,room),updated_at:now});
 });
 return {cleanTitle,cleanCategory,ownSession,sameOrigin};
}
module.exports={installLiveMetadata,cleanTitle,cleanCategory,ownSession,sameOrigin};
