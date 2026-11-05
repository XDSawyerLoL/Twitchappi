'use strict';
// PASSAGE / ASCENSION: aggregated, one-time proof of actual landing.
// No viewer IP, account, cookie, fingerprint or session identifier is stored.
// Counts mean "a destination page opened", NOT unique viewers or follows.
const crypto=require('node:crypto');
const {equivalent}=require('./swapp-news/game-identity');
const DDL=`CREATE TABLE IF NOT EXISTS swapp_passage_arrivals (
 receipt_digest CHAR(64) NOT NULL PRIMARY KEY,
 source_platform VARCHAR(8) NOT NULL,
 source_login VARCHAR(40) NOT NULL,
 destination_platform VARCHAR(8) NOT NULL,
 destination_login VARCHAR(40) NOT NULL,
 game VARCHAR(90) NOT NULL,
 arrived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_swapp_passage_destination (destination_platform,destination_login,arrived_at),
 KEY idx_swapp_passage_source (source_platform,source_login,arrived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const TWITCH=/^[a-z0-9_]{2,25}$/,SWAPP=/^[a-z0-9_-]{2,40}$/;
const valid=(platform,login)=>['swapp','twitch'].includes(platform)&&
 (platform==='swapp'?SWAPP:TWITCH).test(login);
const validGame=game=>typeof game==='string'&&game.length>=2&&game.length<=90;
function createPassageMetrics({getPool,secret,now=Date.now,randomBytes=crypto.randomBytes}={}){
 if(typeof getPool!=='function')throw Error('passage_metrics_pool_required');
 const key=typeof secret==='string'&&secret.length>=32?secret:'';
 let schema=null,insertions=0;
 const enabled=()=>Boolean(key&&getPool());
 function signature(data){return crypto.createHmac('sha256',key).update(data).digest('hex')}
 async function ready(){
  const pool=getPool();if(!pool||!key)throw Error('passage_metrics_disabled');
  if(!schema)schema=Promise.resolve().then(()=>pool.query(DDL)).catch(e=>{schema=null;throw e});
  await schema;
  return pool;
 }
 function issue(source,destination){
  if(!enabled())return null;
  const sp=String(source?.platform||''),sl=String(source?.login||'').toLowerCase();
  const dp=String(destination?.platform||''),dl=String(destination?.login||'').toLowerCase();
  const game=String(destination?.game||'').trim().slice(0,90);
  if(!valid(sp,sl)||!valid(dp,dl)||!validGame(game)||
   !equivalent(game,source?.game)||(sp===dp&&sl===dl))return null;
  const payload={v:1,s:sp+':'+sl,d:dp+':'+dl,g:game,t:now(),r:randomBytes(12).toString('hex')};
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  if(encoded.length>360)return null;
  return encoded+'.'+signature(encoded);
 }
 function decode(receipt){
  if(!enabled()||typeof receipt!=='string'||receipt.length>500||
   !/^[A-Za-z0-9_-]{30,360}\.[a-f0-9]{64}$/.test(receipt))return null;
  const dot=receipt.lastIndexOf('.'),raw=receipt.slice(0,dot),sig=receipt.slice(dot+1);
  if(!crypto.timingSafeEqual(Buffer.from(signature(raw),'hex'),Buffer.from(sig,'hex')))return null;
  try{
   const payload=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));
   if(payload.v!==1||!Number.isFinite(payload.t)||now()-payload.t<0||
    now()-payload.t>120000||!validGame(payload.g)||!/^[-a-f0-9]{24}$/i.test(payload.r))return null;
   const source=String(payload.s||'').split(':'),destination=String(payload.d||'').split(':');
   if(source.length!==2||destination.length!==2||
    !valid(source[0],source[1])||!valid(destination[0],destination[1]))return null;
   return {source,destination,game:payload.g,digest:crypto.createHash('sha256').update(receipt).digest('hex')};
  }catch{return null}
 }
 async function arrive(receipt){
  const data=decode(receipt);if(!data)return {success:false,reason:'invalid_receipt'};
  const pool=await ready();
  const [outcome]=await pool.execute(
   'INSERT IGNORE INTO swapp_passage_arrivals(receipt_digest,source_platform,source_login,destination_platform,destination_login,game) VALUES (?,?,?,?,?,?)',
   [data.digest,...data.source,...data.destination,data.game]
  );
  insertions++;
  // Keep only recent aggregate events; never an indefinite viewer log.
  if(insertions%128===0)Promise.resolve().then(()=>pool.execute(
    'DELETE FROM swapp_passage_arrivals WHERE arrived_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)'
  )).catch(()=>{});
  return {success:true,recorded:Number(outcome.affectedRows||0)===1};
 }
 async function summary({swappLogin,twitchLogin}={}){
  const sl=String(swappLogin||'').toLowerCase(),tl=String(twitchLogin||'').toLowerCase();
  if(!SWAPP.test(sl))throw Error('invalid_creator');
  const pool=await ready();
  const inputs=[['swapp',sl],...(TWITCH.test(tl)?[['twitch',tl]]:[])];
  const sql='SELECT COUNT(*) AS total,COUNT(DISTINCT CONCAT(source_platform,\':\',source_login)) AS sources '+
   'FROM swapp_passage_arrivals WHERE arrived_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND ('+
   inputs.map(()=> '(destination_platform=? AND destination_login=?)').join(' OR ')+')';
  const sent='SELECT COUNT(*) AS total FROM swapp_passage_arrivals WHERE arrived_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND ('+
   inputs.map(()=> '(source_platform=? AND source_login=?)').join(' OR ')+')';
  const params=inputs.flat();
  const [[received],[forwarded]]=await Promise.all([pool.execute(sql,params),pool.execute(sent,params)]);
  return {success:true,period_days:30,received:Number(received[0]?.total||0),
   sent:Number(forwarded[0]?.total||0),source_creators:Number(received[0]?.sources||0),
   meaning:'confirmed_destination_page_open',unique_viewers:false,follows_measured:false};
 }
 return {enabled,issue,decode,arrive,summary,ready};
}
module.exports={createPassageMetrics,DDL,valid};
