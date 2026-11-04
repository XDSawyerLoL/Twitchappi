'use strict';
// SWAPP Creator Autopilot v1: opt-in discovery placements from the creator's
// own public programme. No viewer tracking, no Twitch chat automation, no fee.
const {expand}=require('./swapp-channel-programme');
const {validateOwner}=require('./swapp-spotlight');
const HALF_HOUR=30*60*1000;
const HOUR=60*60*1000;
const DAY=24*HOUR;
const MAX_CREATORS_PER_TICK=4;
const MAX_LOOKAHEAD=14*DAY;
const SUPPORTED=/^[a-z0-9_-]{3,40}$/;
const SCHEMA='CREATE TABLE IF NOT EXISTS swapp_creator_autopilot_actions ('+
 'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,'+
 'user_id VARCHAR(80) NOT NULL, creator_login VARCHAR(40) NOT NULL,'+
 'programme_id VARCHAR(80) NOT NULL, game_name VARCHAR(100) NOT NULL,'+
 'slot_start DATETIME NOT NULL, spotlight_id BIGINT UNSIGNED NOT NULL UNIQUE,'+
 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,'+
 'INDEX idx_autopilot_user_time (user_id,created_at)) '+
 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

function planSlots(programme,now=Date.now()){
 const from=now+HOUR,to=now+MAX_LOOKAHEAD;
 const items=expand(programme,now,{from,to});
 const unique=new Set(),out=[];
 for(const item of items){
  const game=String(item.game||'').replace(/\s+/g,' ').trim();
  const start=Date.parse(item.start_at||'');
  const minutes=Number(item.duration_minutes);
  if(game.length<2||game.length>100||!Number.isFinite(start)||!Number.isFinite(minutes))continue;
  // An exact 30-minute Spotlight must actually lie inside the announced programme.
  const slot=Math.ceil(start/HALF_HOUR)*HALF_HOUR;
  if(slot<from||slot+HALF_HOUR>start+minutes*60000||slot>to)continue;
  const key=slot+':'+game.toLowerCase();
  if(unique.has(key))continue;
  unique.add(key);
  out.push({game,start_at:new Date(slot).toISOString(),
   programme_id:String(item.id||'').slice(0,80),title:String(item.title||'').slice(0,120)});
 }
 return out.sort((a,b)=>a.start_at.localeCompare(b.start_at)).slice(0,24);
}

function requestOriginOk(req){
 const origin=String(req.get?.('origin')||req.headers?.origin||'');
 const host=String(req.get?.('host')||req.headers?.host||'');
 if(!origin||!host)return false;
 try{const u=new URL(origin);return u.protocol==='https:'&&u.host===host}catch{return false}
}

function createCreatorAutopilot({app,getUsers,findUser,saveUsers,restoreSession,
 spotlightStore,spotlightPublishedGame,getExactTwitchGameId,getPool,
 isReady,featureEnabled=false,metricsEnabled=()=>false,limiter,
 now=Date.now,schedule=true,logger=console}={}){
 if(!app||!getUsers||!findUser||!saveUsers||!spotlightStore||
 !spotlightPublishedGame||!getExactTwitchGameId||!getPool||!isReady)
  throw Error('autopilot_missing_dependencies');
 const available=()=>featureEnabled&&!!isReady();
 let cursor=0,running=false,table=null,lastCycle=null;
 let lastError=null;
 const latest={scheduled:0,examined:0};
 const actions=limiter?[limiter]:[];
 const code=e=>String(e?.message||'').slice(0,80);
 async function readyTable(){
  if(!table)table=Promise.resolve().then(async()=>{
   const pool=getPool();
   if(!pool)throw Error('autopilot_mysql_unavailable');
   await pool.query(SCHEMA);return pool;
  }).catch(e=>{table=null;throw e});
  return table;
 }
 function actor(req){
  const session=req.session?.oryonUser;
  const login=String(session?.login||'').toLowerCase();
  if(!session?.id||!SUPPORTED.test(login))return null;
  const user=findUser(login);
  return user&&String(user.id)===String(session.id)&&String(user.login).toLowerCase()===login?user:null;
 }
 async function authenticate(req,res){
  if(typeof restoreSession==='function')await restoreSession(req,res,{allowUserRecovery:false});
  return actor(req);
 }
 function ownerSafe(user){try{validateOwner(user);return true}catch{return false}}
 function allowedLink(user){return ownerSafe(user)&&String(user.swapp_creator_autopilot_twitch_id||'')===String(user.twitch_link?.id||'');}
 function common(user){return {enabled:user.swapp_creator_autopilot_enabled===true&&allowedLink(user),
   available:available(),twitchLinked:ownerSafe(user),
   programmeSlots:planSlots(user.swapp_channel_programme,now()).slice(0,5),
   scope:'auto-spotlight-from-programme',maxDaysAhead:14,
   note:'Ce pilotage réserve des créneaux Spotlight pour les jeux officiellement couverts par SWAPP. Une réservation ne prouve ni un spectateur ni un clic.'};}
 async function myActions(user){
  const pool=await readyTable();
  const [rows]=await pool.execute(
   'SELECT programme_id,game_name,spotlight_id,DATE_FORMAT(slot_start,"%Y-%m-%dT%H:%i:%sZ") AS start_at '+
   'FROM swapp_creator_autopilot_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 8',[String(user.id)]);
  return rows.map(x=>({game:String(x.game_name||''),start_at:String(x.start_at||''),
    spotlight_id:Number(x.spotlight_id),programme_id:String(x.programme_id||'')}));
 }
 async function impact(user){
  if(!metricsEnabled())return {available:false,reason:'fair_metrics_disabled'};
  try{
   const pool=getPool();
   if(!pool)return {available:false,reason:'mysql_unavailable'};
   const [rows]=await pool.execute('SELECT placement,SUM(opportunities) AS proposals '+
    'FROM swapp_fair_opportunities_daily WHERE platform=? AND creator_login=? '+
    'AND event_day>=UTC_DATE()-INTERVAL 6 DAY GROUP BY placement',['twitch',String(user.twitch_link?.login||'').toLowerCase()]);
   return {available:true,kind:'api-candidates-not-views',periodDays:7,
     placements:(rows||[]).map(x=>({placement:String(x.placement),proposals:Number(x.proposals)||0})),
     warning:'Ce sont des propositions dans des réponses API, pas des vues, des visiteurs uniques ou une audience acquise.'};
  }catch{return {available:false,reason:'not_collected'};}
 }
 app.get('/api/creator/autopilot',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  try{
   const user=await authenticate(req,res);
   if(!user)return res.status(401).json({success:false,error:'swapp_account_required'});
   const state=common(user);
   const upcoming=state.available&&state.twitchLinked?
     await spotlightStore.mine(String(user.id)).catch(()=>[]):[];
   const actions=state.available?await myActions(user).catch(()=>[]):[];
   return res.json({success:true,...state,upcomingSpotlights:upcoming,
     automaticActions:actions,discovery:state.available?await impact(user):{available:false},
     lastCycle:lastCycle?{at:lastCycle.at,state:lastCycle.state}:null});
  }catch{return res.status(503).json({success:false,error:'autopilot_temporarily_unavailable'});}
 });
 app.post('/api/creator/autopilot',...actions,async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!requestOriginOk(req)||req.get?.('x-swapp-creator-action')!=='autopilot'||
    !String(req.get?.('content-type')||'').toLowerCase().startsWith('application/json'))
   return res.status(403).json({success:false,error:'origin_denied'});
  if(typeof req.body?.enabled!=='boolean')
   return res.status(400).json({success:false,error:'enabled_boolean_required'});
  try{
   const user=await authenticate(req,res);
   if(!user)return res.status(401).json({success:false,error:'swapp_account_required'});
   if(req.body.enabled&&!available())
    return res.status(503).json({success:false,error:'autopilot_not_enabled_on_hostinger'});
   if(req.body.enabled&&!ownerSafe(user))
    return res.status(403).json({success:false,error:'verified_twitch_link_required'});
   const data=getUsers(),stored=(data.users||[]).find(u=>String(u.id)===String(user.id));
   if(!stored)return res.status(401).json({success:false,error:'swapp_account_unavailable'});
   if(stored.swapp_creator_autopilot_enabled===req.body.enabled)
    return res.json({success:true,...common(stored)});
   const previous=stored.swapp_creator_autopilot_enabled;
   const previousTwitch=stored.swapp_creator_autopilot_twitch_id;
   stored.swapp_creator_autopilot_enabled=req.body.enabled;
   stored.swapp_creator_autopilot_twitch_id=req.body.enabled?String(stored.twitch_link?.id||''):null;
   try{await saveUsers(data)}
   catch(e){stored.swapp_creator_autopilot_enabled=previous;stored.swapp_creator_autopilot_twitch_id=previousTwitch;throw e}
   if(req.body.enabled)setImmediate(()=>{void tick().catch(()=>{})});
   return res.json({success:true,...common(stored),
     note:'Désactiver arrête les nouvelles réservations automatiques. Les réservations existantes restent gérables dans Spotlight.'});
  }catch{return res.status(503).json({success:false,error:'autopilot_save_failed'});}
 });
 async function tick(){
  if(!available())return {state:'disabled'};
  if(running)return {state:'busy'};
  running=true;
  const report={state:'completed',examined:0,scheduled:0,skipped:0,failed:0,at:new Date(now()).toISOString()};
  try{
   const enabled=(getUsers().users||[]).filter(x=>x.swapp_creator_autopilot_enabled===true&&allowedLink(x));
   if(!enabled.length){lastCycle=report;return report;}
   const size=Math.min(MAX_CREATORS_PER_TICK,enabled.length);
   const users=Array.from({length:size},(_,i)=>enabled[(cursor+i)%enabled.length]);
   cursor=(cursor+size)%enabled.length;
   const pool=await readyTable();
   for(const user of users){
    report.examined++;
    try{
     const existing=await spotlightStore.mine(String(user.id));
     let capacity=Math.max(0,3-existing.length);
     if(!capacity){report.skipped++;continue;}
     // Cap per-creator work even if a weekly recurring calendar expands many events.
     const planned=planSlots(user.swapp_channel_programme,now()).slice(0,6);
     for(const slot of planned){
      if(!capacity)break;
      if(existing.some(x=>Date.parse(x.start_at||'')===Date.parse(slot.start_at)))continue;
      try{
       // No promoted article, no automatic booking.
       await spotlightPublishedGame(slot.game);
       const gameId=await getExactTwitchGameId(slot.game);
       if(!/^\d{1,48}$/.test(String(gameId||''))){report.skipped++;continue;}
       const item=await spotlightStore.reserve({
        user,game:slot.game,start_at:slot.start_at,twitchGameId:String(gameId)});
       capacity--;
       // Audit only successful reservations: never claim viewers or guaranteed reach.
       try{
        await pool.execute('INSERT IGNORE INTO swapp_creator_autopilot_actions '+
        '(user_id,creator_login,programme_id,game_name,slot_start,spotlight_id) '+
        'VALUES (?,?,?,?,?,?)',[String(user.id),String(user.login),slot.programme_id,slot.game,
          slot.start_at.slice(0,19).replace('T',' '),Number(item.id)]);
       }catch(e){logger.warn('[SWAPP AUTOPILOT] audit unavailable:',code(e));}
       report.scheduled++;
      }catch(e){
       if(/duplicate|already|ER_DUP_ENTRY|slot_already_reserved|spotlight_max_upcoming_reached/i.test(String(e?.code||'')+' '+code(e)))
        report.skipped++;
       else report.failed++;
      }
     }
    }catch(e){report.failed++;logger.warn('[SWAPP AUTOPILOT] creator skipped:',code(e));}
   }
   lastError=null;lastCycle=report;return report;
  }catch(e){
   lastError=code(e);lastCycle={...report,state:'unavailable'};
   return lastCycle;
  }finally{running=false;Object.assign(latest,{scheduled:report.scheduled,examined:report.examined});}
 }
 if(featureEnabled&&schedule){
  const first=setTimeout(()=>{void tick().catch(()=>{})},90000);first.unref?.();
  const interval=setInterval(()=>{void tick().catch(()=>{})},15*60*1000);interval.unref?.();
 }
 return {tick,common,planSlots,lastCycle:()=>lastCycle,lastError:()=>lastError};
}
module.exports={createCreatorAutopilot,planSlots,requestOriginOk,SCHEMA};
