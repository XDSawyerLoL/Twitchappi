'use strict';
// SWAPP Fair Discovery v2 — explicit opt-in, verified *visible* creator cards.
// This stores public creator/game identities + daily aggregate counts only.
// Never stores viewer identifiers, IPs, cookies, sessions, URLs or raw events.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {searchNames}=require('./swapp-news/game-identity');
const TOKEN_WINDOW_MS=15*60*1000;
const VALID_PLATFORM=new Set(['twitch','swapp','oryon']);
const LOGIN=/^[a-z0-9_]{2,40}$/;
const TOKEN=/^[A-Za-z0-9_-]{30,500}\.[a-f0-9]{64}$/;
const PLACEMENT='game';
const MIN_IMPRESSIONS=50;
const MIN_CREATORS=5;
function canonicalGame(raw){
 const input=String(raw||'').trim().slice(0,90);
 if(input.length<2)return '';
 return String(searchNames(input)[0]||input).trim().slice(0,90);
}
function band(viewers){
 const n=Number(viewers);
 if(!Number.isFinite(n)||n<0)return '';
 return n<=25?'small':n<=100?'growing':'established';
}
function createFairMetrics({getPool,isEnabled,secret,now=Date.now}={}){
 if(typeof getPool!=='function'||typeof isEnabled!=='function')throw Error('fair_configuration_invalid');
 const key=String(secret||'');
 const enabled=()=>!!isEnabled()&&!!getPool()&&key.length>=32;
 let init=null,retryUntil=0,lastCleanup=0;
 function sign(raw){
  return crypto.createHmac('sha256',key).update('swapp-fair-game-v2:'+raw).digest('hex');
 }
 function issue(card,{placement=PLACEMENT}={}){
  if(!enabled()||placement!==PLACEMENT)return '';
  const platform=String(card?.platform||'').toLowerCase();
  const login=String(card?.login||card?.user_login||'').trim().toLowerCase();
  const game=canonicalGame(card?.game_name||card?.game);
  const audience=band(card?.viewer_count??card?.viewers);
  if(!VALID_PLATFORM.has(platform)||!LOGIN.test(login)||!game||!audience)return '';
  const payload={v:2,t:Math.floor(now()/TOKEN_WINDOW_MS),p:placement,s:platform,c:login,g:game,b:audience};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body+'.'+sign(body);
 }
 function verify(token){
  try{
   if(typeof token!=='string'||!TOKEN.test(token))return null;
   const [body,provided]=token.split('.');
   const expected=sign(body),a=Buffer.from(provided,'hex'),b=Buffer.from(expected,'hex');
   if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
   const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
   const current=Math.floor(now()/TOKEN_WINDOW_MS);
   if(p.v!==2||p.p!==PLACEMENT||!Number.isSafeInteger(p.t)||p.t>current||p.t<current-2
    ||!VALID_PLATFORM.has(p.s)||!LOGIN.test(p.c)||p.g!==canonicalGame(p.g)
    ||!['small','growing','established'].includes(p.b))return null;
   return p;
  }catch{return null}
 }
 async function ready(){
  if(!enabled())throw Error('fair_disabled');
  const moment=now();
  if(moment<retryUntil)throw Error('fair_storage_unavailable');
  if(!init){
   const pool=getPool();
   init=(async()=>{
    const script=fs.readFileSync(path.join(__dirname,'..','migrations','mysql','010_swapp_fair_exposure_daily.sql'),'utf8');
    const ddl=script.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n').trim().replace(/;\s*$/,'');
    if(!/^CREATE TABLE IF NOT EXISTS swapp_fair_exposure_daily\s*\(/i.test(ddl)||ddl.includes(';'))throw Error('fair_schema_invalid');
    await pool.query(ddl);
   })().catch(error=>{init=null;retryUntil=now()+60000;throw error});
  }
  await init;
  return getPool();
 }
 async function record(token,event){
  if(!enabled())return {ok:false,status:503};
  if(event!=='impression'&&event!=='click')return {ok:false,status:400};
  const decoded=verify(token);
  if(!decoded)return {ok:false,status:400};
  const pool=await ready();
  const impressions=event==='impression'?1:0,clicks=event==='click'?1:0;
  await pool.execute(
   'INSERT INTO swapp_fair_exposure_daily (event_day,placement,platform,creator_login,game_name,audience_band,impressions,clicks) '+
   'VALUES (UTC_DATE(),?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE impressions=impressions+VALUES(impressions),clicks=clicks+VALUES(clicks)',
   [decoded.p,decoded.s,decoded.c,decoded.g,decoded.b,impressions,clicks]
  );
  // Bounded retention; deletion is not a per-request query.
  if(now()-lastCleanup>24*60*60*1000){
   lastCleanup=now();
   try{await pool.query('DELETE FROM swapp_fair_exposure_daily WHERE event_day < UTC_DATE() - INTERVAL 14 DAY')}catch{}
  }
  return {ok:true,status:202};
 }
 async function summary(){
  if(!enabled())return {enabled:false,scope:'game-card-opt-in',sample:'not_collected'};
  const pool=await ready();
  const [rows]=await pool.execute(
   'SELECT audience_band,COUNT(DISTINCT CONCAT(platform,":",creator_login)) AS creators,SUM(impressions) AS impressions,SUM(clicks) AS clicks '+
   'FROM swapp_fair_exposure_daily WHERE event_day>=UTC_DATE() - INTERVAL 6 DAY AND event_day<=UTC_DATE() AND placement=? GROUP BY audience_band',[PLACEMENT]);
  const normalized=(rows||[]).map(row=>({band:String(row.audience_band),creators:Number(row.creators)||0,impressions:Number(row.impressions)||0,clicks:Number(row.clicks)||0}))
   .filter(x=>['small','growing','established'].includes(x.band));
  const allImpressions=normalized.reduce((sum,x)=>sum+x.impressions,0);
  const allCreators=normalized.reduce((sum,x)=>sum+x.creators,0);
  // Suppress low-volume results entirely, including individual cohort counts.
  if(allImpressions<MIN_IMPRESSIONS||allCreators<MIN_CREATORS)return {enabled:true,scope:'game-card-opt-in',sample:'insufficient',minimumImpressions:MIN_IMPRESSIONS,minimumCreators:MIN_CREATORS};
  const small=normalized.find(x=>x.band==='small')?.impressions||0;
  return {enabled:true,scope:'game-card-opt-in',sample:'limited-voluntary',periodDays:7,impressions:allImpressions,
   creatorCohortCount:allCreators,smallAudienceImpressionShare:Math.round(small/allImpressions*1000)/10,
   caveat:'Échantillon volontaire ; pas une mesure exhaustive ou une preuve de parité.'};
 }
 return {enabled,issue,verify,record,summary};
}
module.exports={createFairMetrics,canonicalGame,band};
