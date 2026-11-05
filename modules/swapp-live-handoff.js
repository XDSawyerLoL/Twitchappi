'use strict';
/**
 * SWAPP PASSAGE — verified same-game handoff.
 * A live can be declared ended only after the upstream status confirms offline.
 * All Twitch responses are shared/cached between viewers to protect Helix quotas.
 * No user identifiers, private viewer history, paid placement or cross-game fallback.
 */
const {equivalent,searchNames}=require('./swapp-news/game-identity');
const TWITCH=/^[a-z0-9_]{2,25}$/,NATIVE=/^[a-z0-9_-]{2,40}$/;
// Short source TTL forces a FRESH upstream check after the 9s countdown.
const GAME_MAX=90,CACHE_MAX=320,STATUS_TTL=7000,DISCOVERY_TTL=25000;
const clean=v=>String(v||'').trim();
const safeGame=v=>clean(v).slice(0,GAME_MAX);
function hash(input){
 let n=2166136261;
 for(const ch of input)n=Math.imul(n^ch.charCodeAt(0),16777619);
 return n>>>0;
}
function choose(candidates,{game,platform,login,exclude=[],at=Date.now()}={}){
 const excluded=new Set((Array.isArray(exclude)?exclude:[]).slice(0,4).filter(x=>
  /^(?:swapp|twitch):[a-z0-9_-]{2,40}$/.test(String(x))).map(String));
 const slot=Math.floor(at/600000),seen=new Set(),accepted=[];
 for(const row of Array.isArray(candidates)?candidates:[]){
  const p=String(row?.platform||''),user=String(row?.login||'').toLowerCase();
  const key=p+':'+user;
  if(!['swapp','twitch'].includes(p)||!(p==='swapp'?NATIVE:TWITCH).test(user)||
     !equivalent(game,row?.game)||seen.has(key)||excluded.has(key)||(p===platform&&user===login))continue;
  seen.add(key);
  accepted.push(row);
 }
 // Small streams (1–50 viewers) receive more exposure. Unknown native
 // audience size is neutral and cannot exclude SWAPP creators.
 const small=row=>row.platform==='swapp'||(Number.isFinite(row.viewer_count)&&row.viewer_count>=0&&row.viewer_count<=50);
 accepted.sort((a,b)=>Number(small(b))-Number(small(a))||
  hash(slot+':'+a.platform+':'+a.login)-hash(slot+':'+b.platform+':'+b.login)||
  String(a.platform+':'+a.login).localeCompare(b.platform+':'+b.login));
 return accepted[0]||null;
}
function createHandoff({twitchAPI,twitchEnabled=()=>false,users=()=>[],nativeStreams=()=>[],
 nativeLive=()=>false,now=Date.now}={}){
 if(typeof twitchAPI!=='function')throw Error('handoff_twitch_api_required');
 const cache=new Map();
 async function cached(key,ttl,load){
  const at=now(),existing=cache.get(key);
  if(existing&&at<existing.expires)return existing.promise;
  if(cache.size>=CACHE_MAX){
   for(const [k,v] of cache){if(v.expires<=at)cache.delete(k)}
   if(cache.size>=CACHE_MAX)cache.delete(cache.keys().next().value);
  }
  const entry={expires:at+ttl,promise:null};
  entry.promise=Promise.resolve().then(load).catch(error=>{if(cache.get(key)===entry)cache.delete(key);throw error});
  cache.set(key,entry);
  return entry.promise;
 }
 const people=()=>{
  try{const result=users();return Array.isArray(result)?result:[]}catch{return []}
 };
 const findUser=login=>people().find(u=>String(u.login||'').toLowerCase()===login)||null;
 const streams=()=>{
  try{const result=nativeStreams();return Array.isArray(result)?result:[]}catch{return []}
 };
 async function twitchStream(login){
  return cached('twitch:'+login,STATUS_TTL,async()=>{
   const result=await twitchAPI('streams?user_login='+encodeURIComponent(login)+'&first=1');
   const stream=(result?.data||[]).find(x=>String(x.user_login||'').toLowerCase()===login);
   return stream||null;
  });
 }
 async function twitchGameIds(game){
  return cached('games:'+game.toLowerCase(),DISCOVERY_TTL,async()=>{
   const ids=new Set();
   for(const name of searchNames(game).slice(0,4)){
    const response=await twitchAPI('games?name='+encodeURIComponent(name));
    for(const found of response?.data||[]){
     if(equivalent(game,found.name)&&/^\d+$/.test(String(found.id||'')))ids.add(String(found.id));
    }
    if(ids.size>=2)break;
   }
   return [...ids].slice(0,3);
  });
 }
 async function twitchCandidates(game){
  if(!twitchEnabled())return [];
  const ids=await twitchGameIds(game),result=[];
  for(const id of ids){
   const rows=await cached('game-streams:'+id,DISCOVERY_TTL,async()=>
    (await twitchAPI('streams?first=100&game_id='+encodeURIComponent(id)))?.data||[]);
   for(const row of rows.slice(0,100)){
    const login=String(row.user_login||'').toLowerCase();
    if(!TWITCH.test(login)||String(row.game_id)!==id||!equivalent(game,row.game_name))continue;
    result.push({platform:'twitch',login,game:row.game_name,
     name:safeGame(row.user_name||login),viewer_count:Number(row.viewer_count)||0,url:'/live/twitch/'+encodeURIComponent(login)+
      '?game='+encodeURIComponent(game)+'&handoff=1'});
   }
  }
  return result;
 }
 function nativeCandidates(game){
  const directory=new Map(people().filter(u=>u?.channel_public!==false)
   .map(u=>[String(u.login||'').toLowerCase(),u]));
  const available=[];
  for(const stream of streams()){
   const login=String(stream.login||'').toLowerCase(),user=directory.get(login);
   if(!user||!NATIVE.test(login)||!equivalent(game,user.current_live_category||user.current_category||user.category)||
    !stream.media_verified||stream.player_url!=='/api/oryon/local-relay/'+encodeURIComponent(login)+'/player')continue;
   available.push({platform:'swapp',login,
    game:safeGame(user.current_live_category||user.current_category||user.category),
    name:clean(user.display_name||login).slice(0,70),
    url:'/'+encodeURIComponent(login)+'?handoff=1'});
  }
  return available;
 }
 async function check({platform,login,game,exclude=[]}={}){
  const from=String(platform||'').toLowerCase(),user=String(login||'').toLowerCase();
  if(!['swapp','twitch'].includes(from)||!(from==='swapp'?NATIVE:TWITCH).test(user))
   return {success:false,error:'invalid_stream',status:400};
  let live=false,verifiedGame='';
  if(from==='twitch'){
   if(!twitchEnabled())return {success:false,error:'twitch_status_unavailable',status:503};
   const status=await twitchStream(user);live=!!status;
   verifiedGame=safeGame(status?.game_name||game);
  }else{
   const creator=findUser(user);
   if(!creator||creator.channel_public===false)return {success:false,error:'channel_unavailable',status:404};
   live=Boolean(nativeLive(user)||streams().some(x=>String(x.login).toLowerCase()===user&&x.media_verified));
   verifiedGame=safeGame(live?(creator.current_live_category||creator.current_category||game):
    (game||creator.current_live_category||creator.current_category));
  }
  const current={platform:from,login:user,live,game:verifiedGame};
  if(live)return {success:true,current,next:null,reason:'still_live'};
  if(verifiedGame.length<2)return {success:true,current,next:null,reason:'game_unknown'};
  let twitch=[];
  // Native discovery remains available if Twitch is unavailable. The current
  // Twitch source check, unlike recommendations, must fail closed on errors.
  try{twitch=await twitchCandidates(verifiedGame)}catch(_){twitch=[]}
  let pool=[...nativeCandidates(verifiedGame),...twitch],next=null;
  for(let attempt=0;attempt<6&&pool.length;attempt++){
   const selected=choose(pool,{game:verifiedGame,platform:from,login:user,exclude,at:now()});
   if(!selected)break;
   if(selected.platform==='swapp'){next=selected;break}
   // Game-list cache can be 25s old. Validate the chosen Twitch broadcaster
   // *individually* before telling a viewer that playback is available.
   try{
    const fresh=await twitchStream(selected.login);
    if(fresh&&equivalent(verifiedGame,fresh.game_name)){next=selected;break}
   }catch(_){}
   pool=pool.filter(x=>x.platform!==selected.platform||x.login!==selected.login);
  }
  return {success:true,current,next,reason:next?'same_game_live':'no_same_game_live'};
 }
 return {check,choose,cacheSize:()=>cache.size};
}
module.exports={choose,createHandoff,hash,TWITCH,NATIVE};
