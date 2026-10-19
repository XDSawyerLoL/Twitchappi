'use strict';
// Fair Discovery v4: counts public, signed candidates in completed server API
// responses. NOT actual card views, visitors, impressions or conversions.
// Queued in memory; first-party MySQL aggregate writes do not block the API.
const fs=require('node:fs');
const path=require('node:path');
const PLACEMENTS=new Set(['home','discover','game']);
const BANDS=new Set(['small','growing','established']);
const MAX_PENDING=512,MAX_BATCH=50,FLUSH_DELAY_MS=15000;
const DAYS=14;
function createFairOffers({getPool,isEnabled,verify,now=Date.now,
 schedule=(cb,delay)=>{const t=setTimeout(cb,delay);t.unref?.();return t},
 cancel=clearTimeout}={}){
 if(typeof getPool!=='function'||typeof isEnabled!=='function'||typeof verify!=='function')throw Error('fair_offers_configuration_invalid');
 const enabled=()=>!!isEnabled()&&!!getPool();
 let schema=null,retryAfter=0,lastCleanup=0,pending=new Map(),timer=null,inFlight=null;
 async function ready(){
  if(!enabled())throw Error('fair_offers_disabled');
  if(now()<retryAfter)throw Error('fair_offers_storage_unavailable');
  if(!schema){
   schema=(async()=>{
    const ddl=fs.readFileSync(path.join(__dirname,'..','migrations','mysql','011_swapp_fair_opportunities_daily.sql'),'utf8')
     .split('\n').filter(row=>!row.trim().startsWith('--')).join('\n').trim().replace(/;\s*$/,'');
    if(!/^CREATE TABLE IF NOT EXISTS swapp_fair_opportunities_daily\s*\(/i.test(ddl)||ddl.includes(';'))
     throw Error('fair_offers_schema_invalid');
    await getPool().query(ddl);
   })().catch(error=>{schema=null;retryAfter=now()+60000;throw error});
  }
  await schema;
  return getPool();
 }
 const stableKey=x=>[x.day,x.placement,x.platform,x.creator,x.game,x.band].join('\u0000');
 function capture(items,{placement}={}){
  if(!enabled()||!PLACEMENTS.has(placement)||!Array.isArray(items))return 0;
  const unique=new Set(),day=new Date(now()).toISOString().slice(0,10);
  const maximum=placement==='discover'?60:placement==='home'?12:24;
  let accepted=0;
  for(const item of items.slice(0,maximum)){
   // Only HMACs actually issued in the existing SWAPP discovery response.
   const decoded=verify(item?.fairProof);
   if(!decoded||decoded.p!==placement||!PLACEMENTS.has(decoded.p)||
    !['twitch','oryon','swapp'].includes(decoded.s)||
    !/^[a-z0-9_]{2,40}$/.test(decoded.c)||!BANDS.has(decoded.b)||
    typeof decoded.g!=='string'||decoded.g.length<2||decoded.g.length>90)continue;
   const row={day,placement,platform:decoded.s,creator:decoded.c,game:decoded.g,band:decoded.b};
   const key=stableKey(row);
   if(unique.has(key))continue;
   unique.add(key);
   if(!pending.has(key)&&pending.size>=MAX_PENDING)continue;
   const old=pending.get(key);
   pending.set(key,{...row,opportunities:Math.min(4294967295,(old?.opportunities||0)+1)});
   accepted++;
  }
  if(accepted&&!timer){
   timer=schedule(()=>{timer=null;void flush().catch(()=>{})},FLUSH_DELAY_MS);
  }
  if(pending.size>=MAX_PENDING)void flush().catch(()=>{});
  return accepted;
 }
 async function flush(){
  if(timer){cancel(timer);timer=null}
  if(inFlight){await inFlight;if(!pending.size)return 0}
  if(!pending.size)return 0;
  if(!enabled()){pending.clear();return 0}
  const batch=[...pending.entries()].slice(0,MAX_BATCH);
  for(const [key] of batch)pending.delete(key);
  const process=async()=>{
   const pool=await ready();
   const placeholders=batch.map(()=>'(?,?,?,?,?,?,?)').join(',');
   const args=batch.flatMap(([,v])=>[v.day,v.placement,v.platform,v.creator,v.game,v.band,v.opportunities]);
   await pool.execute('INSERT INTO swapp_fair_opportunities_daily '+
    '(event_day,placement,platform,creator_login,game_name,audience_band,opportunities) VALUES '+placeholders+
    ' ON DUPLICATE KEY UPDATE opportunities=opportunities+VALUES(opportunities)',args);
   if(now()-lastCleanup>24*60*60*1000){
    lastCleanup=now();
    try{await pool.query('DELETE FROM swapp_fair_opportunities_daily WHERE event_day < UTC_DATE() - INTERVAL '+(DAYS-1)+' DAY')}catch{}
   }
   return batch.length;
  };
  // Never restore unsafely after a failed write: the store is best-effort
  // and overcounting from a partial MySQL failure would be less transparent.
  inFlight=process();
  try{return await inFlight}finally{
   inFlight=null;
   if(pending.size&&!timer)timer=schedule(()=>{timer=null;void flush().catch(()=>{})},FLUSH_DELAY_MS);
  }
 }
 async function summary({days=7,placement='all'}={}){
  if(![7,14].includes(days)||!(placement==='all'||PLACEMENTS.has(placement)))throw Error('fair_offers_invalid_filters');
  if(!enabled())return {enabled:false,sample:'not_collected'};
  await flush();
  const pool=await ready();
  const filter=placement==='all'?'':' AND placement=?';
  const params=placement==='all'?[]:[placement];
  const where='WHERE event_day>=UTC_DATE() - INTERVAL '+(days-1)+' DAY AND event_day<=UTC_DATE()'+filter;
  const [bands]=await pool.execute('SELECT audience_band,COUNT(DISTINCT platform,creator_login) AS creators,'+
   'SUM(opportunities) AS opportunities FROM swapp_fair_opportunities_daily '+where+
   ' GROUP BY audience_band',params);
  const [distinct]=await pool.execute('SELECT COUNT(DISTINCT platform,creator_login) AS creators '+
   'FROM swapp_fair_opportunities_daily '+where,params);
  return {enabled:true,bands,uniqueCreators:Number(distinct?.[0]?.creators)||0};
 }
 return {enabled,capture,flush,summary};
}
module.exports={createFairOffers};
