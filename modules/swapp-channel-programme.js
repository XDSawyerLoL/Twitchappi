'use strict';
const crypto=require('node:crypto');
const {sameOrigin}=require('./swapp-live-metadata');
const LOGIN=/^[a-z0-9_-]{2,48}$/;
const normal=x=>String(x||'').trim().toLowerCase();
const clean=(x,max)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
// Calendar expansion handles weekly series that began before the visible month.
const WEEK_MS=7*86400000;
const timezoneFormats=new Map();
function localParts(timestamp,timezone){
 let formatter=timezoneFormats.get(timezone);
 if(!formatter){
  formatter=new Intl.DateTimeFormat('en-US',{
   timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  });
  timezoneFormats.set(timezone,formatter);
 }
 return Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(x=>[x.type,Number(x.value)]));
}
// Weekly streams keep the creator's wall-clock hour through daylight saving.
function occurrenceTime(base,week,timezone){
 if(week===0||!timezone||timezone==='UTC')return base+week*WEEK_MS;
 const p=localParts(base,timezone);
 const wanted=Date.UTC(p.year,p.month-1,p.day+7*week,p.hour,p.minute,p.second);
 let guess=wanted;
 for(let i=0;i<3;i++){
  const current=localParts(guess,timezone);
  const wall=Date.UTC(current.year,current.month-1,current.day,current.hour,current.minute,current.second);
  guess+=wanted-wall;
 }
 return guess+base%1000;
}
function expand(items,now=Date.now(),window=null){
 const from=window?.from??now-12*3600000;
 const to=window?.to??now+42*86400000;
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>75*86400000)
  throw Error('invalid_calendar_range');
 const out=[];
 for(const raw of Array.isArray(items)?items:[]){
  const base=Date.parse(raw.start_at||'');
  if(!Number.isFinite(base))continue;
  const recurring=raw.repeat==='weekly';
  const first=recurring?Math.max(0,Math.floor((from-base)/WEEK_MS)):0;
  const last=recurring?Math.min(first+12,Math.max(first,Math.ceil((to-base)/WEEK_MS))):0;
  for(let week=first;week<=last;week++){
   const time=occurrenceTime(base,week,raw.timezone||'UTC');
   if(time<from||time>=to)continue;
   out.push({id:raw.id,occurrence:week,base_start_at:new Date(base).toISOString(),
    title:raw.title,game:raw.game||'',note:raw.note||'',timezone:raw.timezone||'UTC',start_at:new Date(time).toISOString(),
    duration_minutes:raw.duration_minutes||120,repeat:recurring?'weekly':'none'});
  }
 }
 return out.sort((a,b)=>a.start_at.localeCompare(b.start_at)).slice(0,160);
}
function calendarWindow(month,now=Date.now()){
 if(!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(String(month||'')))
  throw Error('invalid_calendar_month');
 const [year,monthIndex]=month.split('-').map(Number);
 const current=new Date(now),delta=(year-current.getUTCFullYear())*12+(monthIndex-1-current.getUTCMonth());
 if(delta< -2||delta>7)throw Error('calendar_month_out_of_range');
 return {from:Date.UTC(year,monthIndex-1,1)-7*86400000,
         to:Date.UTC(year,monthIndex,1)+7*86400000};
}
function validate(body,now=Date.now()){
 const title=clean(body?.title,120),game=clean(body?.game,60),note=clean(body?.note,240);
 const start=Date.parse(String(body?.start_at||'')),duration=Number(body?.duration_minutes||120);
 const repeat=body?.repeat==='weekly'?'weekly':'none';
 const timezone=String(body?.timezone||'UTC').trim();
 if(!timezone||timezone.length>64)throw Error('invalid_timezone');
 try{new Intl.DateTimeFormat('en-US',{timeZone:timezone})}
 catch(_){throw Error('invalid_timezone')}
 if(title.length<3||String(body?.title||'').trim().length>120)throw Error('invalid_title');
 if(String(body?.game||'').length>60||String(body?.note||'').length>240)throw Error('invalid_description');
 if(!Number.isFinite(start)||start<now-3600000||start>now+180*86400000)throw Error('invalid_schedule_date');
 if(!Number.isInteger(duration)||duration<15||duration>720)throw Error('invalid_duration');
 return {title,game,note,start_at:new Date(start).toISOString(),duration_minutes:duration,repeat,timezone};
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
  let range=null;
  if(req.query?.month){
   try{range=calendarWindow(req.query.month)}
   catch(error){return res.status(400).json({success:false,error:error.message})}
  }
  return res.json({success:true,login:user.login,owner:owner(req,user),
   items:expand(user.swapp_channel_programme,Date.now(),range)});
 });
 const actions=limiter?[limiter]:[];
 app.post('/api/swapp/channel/:login/programme',...actions,async(req,res)=>{
  const user=userFor(req);if(reject(req,res,user))return;
  const data=getUsers(),record=(data.users||[]).find(u=>String(u.id)===String(user.id));
  if(!record)return res.status(404).json({success:false});
  const old=record.swapp_channel_programme;
  const items=Array.isArray(old)?[...old]:[];
  const provided=String(req.body?.id||'');
  const index=items.findIndex(x=>x.id===provided);
  if(index<0&&items.length>=32)return res.status(409).json({success:false,error:'Programme limité à 32 créneaux.'});
  // A weekly event may have started months ago. Allow changing its title/game
  // without forcing a new date, but only when the original timestamp is unchanged.
  const previous=index>=0?items[index]:null;
  const preservingWeekly=previous?.repeat==='weekly'&&req.body?.repeat==='weekly'&&
   String(req.body?.start_at||'')===String(previous.start_at||'');
  const validationNow=preservingWeekly?Math.min(Date.now(),Date.parse(previous.start_at)+60000):Date.now();
  let entry;try{entry=validate(req.body,validationNow)}
  catch(e){return res.status(400).json({success:false,error:e.message})}
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
module.exports={installChannelProgramme,expand,calendarWindow,validate};
