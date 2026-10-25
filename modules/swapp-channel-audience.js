'use strict';
/* Single-node SWAPP audience + chain-local loyalty points.
 * A browser-side playing signal is not independent playback proof.
 * A logged-in SWAPP account, current joined socket and an active live are required.
 * Points persist as JSON on a writable Hostinger single-node filesystem.
 */
const fs=require('node:fs');
const path=require('node:path');
const cleanRoom=value=>/^[a-z0-9_][a-z0-9_-]{1,39}$/.test(String(value||'').toLowerCase())?String(value).toLowerCase():'';
const DATE=now=>new Date(now).toISOString().slice(0,10);
function installChannelAudience({app,io,getUser,getNativeRoom,isLocalLive,storageFile=path.join(process.cwd(),'.swapp-channel-loyalty.json'),clock=Date}){
 if(!app||!io||!getUser||!getNativeRoom||!isLocalLive)throw Error('missing channel audience dependency');
 let wallets={};
 try{
  if(fs.existsSync(storageFile)){
   const raw=JSON.parse(fs.readFileSync(storageFile,'utf8'));
   if(raw?.version===1&&raw.rooms&&typeof raw.rooms==='object')wallets=raw.rooms;
  }
 }catch(error){console.warn('[SWAPP CHANNEL LOYALTY] load failed:',error.message)}
 const watches=new Map();
 const MAX_DAILY=300,PTS_PER_MINUTE=5,TICK_MAX_MS=25000;
 const lookup=(room,id)=>wallets[room]?.[id]||null;
 function persist(){
  const target=storageFile, tmp=target+'.'+process.pid+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify({version:1,rooms:wallets}),{mode:0o600});fs.renameSync(tmp,target)}
  catch(error){try{fs.unlinkSync(tmp)}catch(_){}throw error}
 }
 function owner(req,room){
  const login=cleanRoom(req.session?.oryonUser?.login),stored=getUser(login);
  return !!login&&login===room&&stored&&String(stored.id)===String(req.session.oryonUser.id);
 }
 function identity(session){
  const candidate=session?.oryonUser;
  const login=cleanRoom(candidate?.login),stored=getUser(login);
  if(!login||!stored||String(stored.id)!==String(candidate.id))return null;
  return {id:String(stored.id),login,display_name:String(stored.display_name||login).slice(0,50)};
 }
 function live(room){const r=getNativeRoom(room);return !!r?.host||!!isLocalLive(room)}
 function active(room){
  const cutoff=clock.now()-55000;
  const members=[];
  const current=new Set();
  for(const socket of io.sockets.sockets.values()){
   if(socket.data.nativeRoom!==room||socket.data.nativeRole!=='viewer')continue;
   const session=identity(socket.request?.session);
   if(!session)continue;
   if(current.has(session.id))continue;
   current.add(session.id);
   const marker=socket.data.swappLoyaltyWatch;
   const watching=!!marker&&marker.room===room&&marker.playing===true&&marker.lastAt>cutoff;
   const saved=lookup(room,session.id);
   members.push({login:session.login,display_name:session.display_name,watching,points:Number(saved?.points||0)});
  }
  return members.sort((a,b)=>Number(b.watching)-Number(a.watching)||b.points-a.points||a.login.localeCompare(b.login));
 }
 app.get('/api/swapp/channel-audience/:room',(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const room=cleanRoom(req.params.room);
  if(!room||!owner(req,room))return res.status(403).json({success:false,error:'Accès réservé au créateur.'});
  const r=getNativeRoom(room),users=active(room);
  const leaderboard=Object.values(wallets[room]||{}).filter(v=>v&&typeof v==='object')
   .sort((a,b)=>Number(b.points||0)-Number(a.points||0))
   .slice(0,30).map(v=>({login:String(v.login||''),display_name:String(v.display_name||'').slice(0,50),
    points:Number(v.points||0),minutes:Number(v.minutes||0)}));
  return res.json({
   success:true,room,live:live(room),scope:'single_node_process',
   users,leaderboard,connected_accounts:users.length,
   signaled_playback:users.filter(u=>u.watching).length,
   anonymous_not_listed:true,
   native_room_connections:r?.viewers?.size||0,
   message:'Seuls les comptes SWAPP connectés apparaissent dans la liste. Lecture déclarée par le navigateur, sans preuve indépendante pour les lecteurs intégrés.',
   rule:{points_per_minute:PTS_PER_MINUTE,daily_cap:MAX_DAILY,rewards_enabled:false}
  });
 });
 app.get('/api/swapp/channel-points/:room',(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const room=cleanRoom(req.params.room),who=identity(req.session);
  if(!room||!who)return res.status(401).json({success:false,error:'Compte SWAPP requis.'});
  if(!getUser(room))return res.status(404).json({success:false,error:'Chaîne inconnue.'});
  const w=lookup(room,who.id);
  return res.json({success:true,room,points:Number(w?.points||0),
   points_per_minute:PTS_PER_MINUTE,daily_cap:MAX_DAILY,
   rewards_enabled:false,rule:'Lecture active, connecté et onglet visible. Les points ne sont pas échangeables actuellement.'});
 });
 function award(room,who,ms,now){
  const prev=lookup(room,who.id)||{points:0,minutes:0,date:DATE(now),earnedToday:0};
  const date=DATE(now),used=prev.date===date?Number(prev.earnedToday)||0:0;
  if(used>=MAX_DAILY)return false;
  const gain=Math.min(PTS_PER_MINUTE,MAX_DAILY-used);
  const next={login:who.login,display_name:who.display_name,points:Number(prev.points||0)+gain,
   minutes:Number(prev.minutes||0)+1,date,earnedToday:used+gain,updatedAt:now};
  wallets[room]??={};const old=wallets[room][who.id];
  wallets[room][who.id]=next;
  try{persist();return true}catch(error){
   if(old)wallets[room][who.id]=old;else delete wallets[room][who.id];
   console.warn('[SWAPP CHANNEL LOYALTY] save failed:',error.message);
   return false;
  }
 }
 function heartbeat(socket,payload){
  const room=cleanRoom(payload?.room),who=identity(socket.request?.session),now=clock.now();
  if(!room||!who||socket.data.nativeRoom!==room||socket.data.nativeRole!=='viewer'||!live(room))return;
  const current=getNativeRoom(room);
  // Browser WebRTC requires an earlier video-frame playback signal.
  if(current?.host&&!current.mediaViewers?.has(socket.id))return;
  const on=payload?.playing===true&&payload?.visible===true&&payload?.player==='html5';
  const key=room+'|'+who.id;
  if(!on){
   watches.delete(key);
   socket.data.swappLoyaltyWatch={room,playing:false,lastAt:now};
   return;
  }
  const before=watches.get(key);
  // A different tab cannot inherit progress from an existing session.
  const same=before?.socketId===socket.id&&now-before.lastAt>=10000&&now-before.lastAt<=55000;
  const delta=same?Math.min(TICK_MAX_MS,now-before.lastAt):0;
  const elapsed=(same?before.elapsed:0)+delta;
  const completed=elapsed>=60000;
  const remainder=completed?elapsed-60000:elapsed;
  watches.set(key,{socketId:socket.id,lastAt:now,elapsed:remainder});
  socket.data.swappLoyaltyWatch={room,playing:true,lastAt:now};
  if(completed&&award(room,who,60000,now))socket.emit('swapp:channel:points',{room,points:lookup(room,who.id).points,added:PTS_PER_MINUTE});
  if(watches.size>3000)for(const [k,v] of watches)if(now-v.lastAt>90000)watches.delete(k);
 }
 io.on('connection',socket=>{
  socket.on('swapp:channel:watch',payload=>heartbeat(socket,payload));
  socket.on('disconnect',()=>{
   const who=identity(socket.request?.session);
   if(!who)return;
   for(const [key,watch] of watches)if(watch.socketId===socket.id)watches.delete(key);
  });
 });
 return {heartbeat,active,lookup,rule:{points_per_minute:PTS_PER_MINUTE,daily_cap:MAX_DAILY}};
}
module.exports={installChannelAudience,cleanRoom};
