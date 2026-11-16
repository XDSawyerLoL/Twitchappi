'use strict';
/* MySQL-backed sponsored inventory, read-only until a signed payment and
 * manual moderation flow is available. Never accepts browser-supplied rights.
 */
const {selectSponsored,validCampaign}=require('../lib/swapp-server-ads');
const VALID_SLOT=new Set(['server_category','server_discovery','site_editorial']);
function createServerAdsStore({uri=process.env.SWAPP_MYSQL_URL||process.env.SWAPP_ACCOUNT_MYSQL_URL,mysqlFactory,clock=()=>Date.now()}={}){
 if(!uri||!/^mysql:\/\//.test(uri))throw Error('server_ads_mysql_not_configured');
 let pool,pending;
 async function ready(){
  if(!pending)pending=(async()=>{
   const driver=mysqlFactory||require('mysql2/promise');
   const candidate=driver.createPool({uri,connectionLimit:2,waitForConnections:true,queueLimit:30,connectTimeout:5000});
   try{
    await candidate.query('CREATE TABLE IF NOT EXISTS swapp_server_ad_campaigns ('+
     'id VARCHAR(80) PRIMARY KEY,server_id VARCHAR(80) NOT NULL,plan_id VARCHAR(40) NOT NULL,'+
     'status VARCHAR(24) NOT NULL DEFAULT \'pending\',payment_verified TINYINT(1) NOT NULL DEFAULT 0,'+
     'review_status VARCHAR(24) NOT NULL DEFAULT \'pending\',starts_at BIGINT NOT NULL,ends_at BIGINT NOT NULL,'+
     'slots_json TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,'+
     'INDEX idx_swapp_ad_window(status,starts_at,ends_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    pool=candidate;return pool;
   }catch(error){await candidate.end?.().catch(()=>{});throw error}
  })().catch(error=>{pending=null;throw error});
  return pending;
 }
 async function eligible(slot){
  if(!VALID_SLOT.has(slot))return [];
  const now=clock(),p=await ready();
  const [rows]=await p.execute('SELECT id,server_id,plan_id,status,payment_verified,review_status,starts_at,ends_at,slots_json FROM swapp_server_ad_campaigns WHERE status=? AND payment_verified=1 AND review_status=? AND starts_at<=? AND ends_at>? LIMIT 100',['active','approved',now,now]);
  return rows.map(row=>{
   let slots;try{slots=JSON.parse(row.slots_json)}catch{slots=[]}
   return {id:row.id,serverId:row.server_id,planId:row.plan_id,status:row.status,
    paymentVerified:row.payment_verified===1||row.payment_verified===true,reviewStatus:row.review_status,
    startsAt:Number(row.starts_at),endsAt:Number(row.ends_at),slots};
  }).filter(c=>validCampaign(c,now)&&c.slots.includes(slot));
 }
 async function pick(slot,{seed=0,impressionsToday={}}={}){
  return selectSponsored(await eligible(slot),{slot,now:clock(),seed,impressionsToday});
 }
 return {eligible,pick};
}
module.exports={createServerAdsStore};
