'use strict';
const crypto=require('node:crypto');
const {sameOrigin}=require('./swapp-live-metadata');
const LOGIN=/^[a-z0-9_-]{2,48}$/;
const normal=x=>String(x||'').trim().toLowerCase();
const clean=(x,max)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function expand(items,now=Date.now()){
 const from=now-12*3600000,to=now+42*86400000,out=[];
 for(const raw of Array.isArray(items)?items:[]){
  const base=Date.parse(raw.start_at||'');
  if(!Number.isFinite(base))continue;
  for(let week=0;week<=(raw.repeat==='weekly'?6:0);week++){
   const time=base+week*7*86400000;
   if(time<from||time>to)continue;
   out.push({id:raw.id,occurrence:week,title:raw.title,game:raw.game||'',note:raw.note||'',start_at:new Date(time).toISOString(),duration_minutes:raw.duration_minutes||120,repeat:raw.repeat==='weekly'?'weekly':'none'});
  }
 }
 return out.sort((a,b)=>a.start_at.localeCompare(b.start_at)).slice(0,120);
}
function validate(body,now=Date.now()){
 const title=clean(body?.title,120),game=clean(body?.game,60),note=clean(body?.note,240);
 const start=Date.parse(String(body?.start_at||'')),duration=Number(body?.duration_minutes||120);
 const repeat=body?.repeat==='weekly'?'weekly':'none';
 if(title.length<3||String(body?.title||'').trim().length>120)throw Error('invalid_title');
 if(String(body?.game||'').length>60||String(body?.note||'').length>240)throw Error('invalid_description');
 if(!Number.isFinite(start)||start<now-3600000||start>now+180*86400000)throw Error('invalid_schedule_date');
 if(!Number.isInteger(duration)||duration<15||duration>720)throw Error('invalid_duration');
 return {title,game,note,start_at:new Date(start).toISOString(),duration_minutes:duration,repeat};
}
function installChannelProgramme({app,getUsers,saveUsers,findUser,limiter,twitchAPI}){
 if(!app||!getUsers||!saveUsers||!findUser)throw Error('programme_missing_dependencies');
 const session=req=>req.session?.oryonUser;
 const owner=(req,user)=>!!user&&!!session(req)?.id&&String(session(req).id)===String(user.id)&&normal(session(req).login)===normal(user.login);
 const login=req=>normal(req.params?.login);
 const userFor=req=>LOGIN.test(login(req))?findUser(login(req)):null;
 const reject=(req,res,user)=>{
  if(!owner(req,user)){res.status(401).json({success:false,error:'Compte propriétaire SWAPP requis.'});return true}
  if(!sameOrigin(req)){res.status(403).json({success:false,error:'Origine refusée.'});return true}
  return false;
 };
 app.get('/api/swapp/channel/:login/programme',(req,res)=>{
  res.set('Cache-Control','no-store');
  const user=userFor(req);
  if(!user||user.channel_public===false)return res.status(404).json({success:false,error:'Chaîne introuvable.'});
  return res.json({success:true,login:user.login,owner:owner(req,user),items:expand(user.swapp_channel_programme)});
 });
 const actions=limiter?[limiter]:[];
 app.post('/api/swapp/channel/:login/programme',...actions,async(req,res)=>{
  const user=userFor(req);if(reject(req,res,user))return;
  let entry;try{entry=validate(req.body)}catch(e){return res.status(400).json({success:false,error:e.message})}
  const data=getUsers(),record=(data.users||[]).find(u=>String(u.id)===String(user.id));
  if(!record)return res.status(404).json({success:false});
  const old=record.swapp_channel_programme;
  const items=Array.isArray(old)?[...old]:[];
  const provided=String(req.body?.id||'');
  const index=items.findIndex(x=>x.id===provided);
  if(index<0&&items.length>=32)return res.status(409).json({success:false,error:'Programme limité à 32 créneaux.'});
  entry.id=index>=0?provided:crypto.randomUUID();
  if(index>=0)items[index]=entry;else items.push(entry);
  record.swapp_channel_programme=items;
  try{await saveUsers(data)}catch(_){record.swapp_channel_programme=old;return res.status(503).json({success:false,error:'Enregistrement indisponible.'})}
  return res.json({success:true,items:expand(items)});
 });
 app.delete('/api/swapp/channel/:login/programme/:id',...actions,async(req,res)=>{
  const user=userFor(req);if(reject(req,res,user))return;
  const data=getUsers(),record=(data.users||[]).find(u=>String(u.id)===String(user.id));
  if(!record)return res.status(404).json({success:false});
  const old=record.swapp_channel_programme;
  const items=(Array.isArray(old)?old:[]).filter(x=>x.id!==req.params.id);
  if(items.length===(Array.isArray(old)?old:[]).length)return res.status(404).json({success:false,error:'Créneau introuvable'});
  record.swapp_channel_programme=items;
  try{await saveUsers(data)}catch(_){record.swapp_channel_programme=old;return res.status(503).json({success:false,error:'Enregistrement indisponible.'})}
  return res.json({success:true,items:expand(items)});
 });
 // Suggest, never silently overwrite the creator's selected category.
 // Only a linked Twitch channel provides trustworthy third-party metadata.
 app.get('/api/swapp/live/auto-game',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const ident=session(req),user=ident?.login&&findUser(normal(ident.login));
  if(!owner(req,user))return res.status(401).json({success:false,error:'Compte SWAPP requis.'});
  const link=user.twitch_link||{};
  const userLogin=normal(link.login||link.user_login||link.username);
  const broadcasterId=String(link.id||link.user_id||'').trim();
  if((!userLogin&&!/^\d+$/.test(broadcasterId))||typeof twitchAPI!=='function')
   return res.json({success:true,game:null,source:'twitch_not_linked'});
  try{
   if(userLogin){
    const live=await twitchAPI('streams?user_login='+encodeURIComponent(userLogin)+'&first=1');
    const row=(live?.data||[]).find(x=>normal(x.user_login)===userLogin);
    if(row?.game_name)return res.json({success:true,game:clean(row.game_name,60),source:'twitch_live',confirmed_live:true});
   }
   if(/^\d+$/.test(broadcasterId)){
    const channel=await twitchAPI('channels?broadcaster_id='+encodeURIComponent(broadcasterId));
    const row=(channel?.data||[])[0];
    if(row?.game_name)return res.json({success:true,game:clean(row.game_name,60),source:'twitch_channel',confirmed_live:false});
   }
   return res.json({success:true,game:null,source:'no_twitch_game'});
  }catch(_){return res.status(503).json({success:false,error:'Recherche Twitch indisponible.'})}
 });
}
module.exports={installChannelProgramme,expand,validate};
