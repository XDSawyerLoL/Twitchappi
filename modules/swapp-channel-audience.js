'use strict';
/* Single-node SWAPP audience + chain-local loyalty points.
 * A browser-side playing signal is not independent playback proof.
 * A logged-in SWAPP account, current joined socket and an active live are required.
 * Points persist as JSON on a writable Hostinger single-node filesystem.
 */
const fs=require('node:fs');
const path=require('node:path');
const cleanRoom=value=>{const v=String(value||'').trim().toLowerCase();return /^[a-z0-9_][a-z0-9_-]{1,39}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v)?v:'';};
const DATE=now=>new Date(now).toISOString().slice(0,10);
function installChannelAudience({app,io,getUser,getUsers,getModState,getNativeRoom,isLocalLive,mysqlUri='',storageFile=path.join(process.cwd(),'.swapp-channel-loyalty.json'),clock=Date}){
 if(!app||!io||!getUser||!getNativeRoom||!isLocalLive)throw Error('missing channel audience dependency');
 const sql=mysqlUri?require('./swapp-channel-points-mysql').createChannelPointsMysql({uri:mysqlUri,now:()=>clock.now()}):null;
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
 async function hydrate(room){if(sql)wallets[room]=await sql.getRoom(room);}
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
 app.get('/api/swapp/channel-audience/:room',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const room=cleanRoom(req.params.room);
  if(!room||!owner(req,room))return res.status(403).json({success:false,error:'Accès réservé au créateur.'});
  try{if(sql)await hydrate(room)}catch(_){return res.status(503).json({success:false,error:'Points MySQL indisponibles.'})}
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

 // Owner-only roster of people who actually follow this channel. Data comes
 // from the already established account follow list (not live presence).
 // Points are from the existing channel-local point store, never global SWAPP rewards.
 app.get('/api/swapp/channel-followers/:room',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const room=cleanRoom(req.params.room);
  if(!room||!owner(req,room))return res.status(403).json({success:false,error:'Accès réservé au propriétaire.'});
  if(typeof getUsers!=='function'||typeof getModState!=='function')
   return res.status(503).json({success:false,error:'Annuaire indisponible.'});
  const rawPage=String(req.query?.page??'1');
  if(!/^[1-9][0-9]{0,3}$/.test(rawPage))return res.status(400).json({success:false,error:'Page invalide.'});
  const page=Number(rawPage),perPage=50;
  const query=String(req.query?.q||'').trim().toLocaleLowerCase('fr');
  if(query.length>60||/[\\u0000-\\u001f]/.test(query))return res.status(400).json({success:false,error:'Recherche invalide.'});
  try{
   const userData=getUsers();
   const users=Array.isArray(userData?.users)?userData.users:[];
   const matched=users.filter(user=>{
    const login=cleanRoom(user?.login);
    if(!login||login===room||!user?.id||!Array.isArray(user.following)||!user.following.includes(room))return false;
    const display=String(user.display_name||login).toLocaleLowerCase('fr');
    return !query||login.includes(query)||display.includes(query);
   }).sort((a,b)=>String(a.login).localeCompare(String(b.login),'fr'));
   const count=matched.length,start=(page-1)*perPage,selected=matched.slice(start,start+perPage);
   const {state}=getModState(room);
   const moderators=new Set(Array.isArray(state?.moderators)?state.moderators:[]);
   const banned=new Set(Array.isArray(state?.banned)?state.banned:[]);
   let pointsAvailable=true,pointsById=Object.create(null);
   if(sql){
    try{pointsById=await sql.getByIds(room,selected.map(user=>String(user.id)));}
    catch(_){pointsAvailable=false;}
   }else{
    const rows=wallets[room]||{};
    for(const user of selected)if(Object.prototype.hasOwnProperty.call(rows,String(user.id)))
     pointsById[String(user.id)]=rows[String(user.id)];
   }
   const followers=selected.map(user=>{
    const login=cleanRoom(user.login),value=pointsById[String(user.id)];
    return {login,display_name:String(user.display_name||login).slice(0,80),
     points:pointsAvailable?Math.max(0,Number(value?.points)||0):null,
     minutes:pointsAvailable?Math.max(0,Number(value?.minutes)||0):null,
     moderator:moderators.has(login),banned:banned.has(login)};
   });
   res.json({success:true,room,role:'owner',total:count,page,per_page:perPage,
    has_more:start+selected.length<count,points_available:pointsAvailable,followers,
    ban_scope:'native_swapp_chat_only',points_scope:'channel_local_verified_playback'});
  }catch(_){res.status(503).json({success:false,error:'Liste des followers indisponible.'});}
 });
 app.get('/api/swapp/channel-points/:room',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  const room=cleanRoom(req.params.room),who=identity(req.session);
  if(!room||!who)return res.status(401).json({success:false,error:'Compte SWAPP requis.'});
  if(!getUser(room))return res.status(404).json({success:false,error:'Chaîne inconnue.'});
  try{if(sql)await hydrate(room)}catch(_){return res.status(503).json({success:false,error:'Points MySQL indisponibles.'})}
  const w=lookup(room,who.id);
  return res.json({success:true,room,points:Number(w?.points||0),
   points_per_minute:PTS_PER_MINUTE,daily_cap:MAX_DAILY,
   rewards_enabled:false,rule:'Lecture active, connecté et onglet visible. Les points ne sont pas échangeables actuellement.'});
 });
 function award(room,who,ms,now){
  if(sql)return sql.credit(room,who,DATE(now),MAX_DAILY,PTS_PER_MINUTE).then(result=>{
   if(result?.row){wallets[room]??={};wallets[room][who.id]=result.row;}
   return !!result?.awarded;
  }).catch(e=>{console.warn('[SWAPP CHANNEL LOYALTY] mysql credit failed:',String(e?.code||e?.name||'error'));return false;});
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
  if(completed){
   const announce=awarded=>{if(awarded)socket.emit('swapp:channel:points',{room,points:lookup(room,who.id).points,added:PTS_PER_MINUTE})};
   const result=award(room,who,60000,now);
   if(result&&typeof result.then==='function')void result.then(announce);
   else announce(result);
  }
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
