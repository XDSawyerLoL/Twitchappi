'use strict';
/* Pre-payment campaign applications. Records are not paid campaigns.
 * Caller must establish ownership server-side before calling create().
 */
const crypto=require('node:crypto');
const {normalizeCampaignRequest}=require('../lib/swapp-server-ad-requests');
function createServerAdRequestStore({uri=process.env.SWAPP_MYSQL_URL||process.env.SWAPP_ACCOUNT_MYSQL_URL,mysqlFactory,clock=()=>Date.now()}={}){
 if(!uri||!/^mysql:\/\//.test(uri))throw Error('server_ad_requests_mysql_not_configured');
 let initializing;
 async function db(){
  if(!initializing)initializing=(async()=>{
   const driver=mysqlFactory||require('mysql2/promise');
   const pool=driver.createPool({uri,connectionLimit:2,waitForConnections:true,queueLimit:30,connectTimeout:5000});
   try{
    await pool.query('CREATE TABLE IF NOT EXISTS swapp_server_ad_requests ('+
     'id CHAR(36) PRIMARY KEY, owner_id VARCHAR(80) NOT NULL,server_id VARCHAR(80) NOT NULL,'+
     'plan_id VARCHAR(40) NOT NULL,slot VARCHAR(40) NOT NULL,contact_email VARCHAR(254) NOT NULL,'+
     'message VARCHAR(500) NOT NULL,amount_cents INT UNSIGNED NOT NULL,duration_days SMALLINT UNSIGNED NOT NULL,'+
     'status VARCHAR(24) NOT NULL DEFAULT \'pending_review\',payment_verified TINYINT(1) NOT NULL DEFAULT 0,'+
     'created_at BIGINT NOT NULL,INDEX idx_ad_owner(owner_id,created_at),INDEX idx_ad_review(status,created_at)'+
     ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    return pool;
   }catch(error){await pool.end?.().catch(()=>{});throw error}
  })().catch(error=>{initializing=null;throw error});
  return initializing;
 }
 async function create({ownerId,request,ownsServer}){
  if(typeof ownerId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(ownerId))throw Error('invalid_owner_id');
  if(typeof ownsServer!=='function')throw Error('ownership_check_required');
  const data=normalizeCampaignRequest(request);
  if(await ownsServer(ownerId,data.serverId)!==true)throw Error('server_ownership_required');
  const id=crypto.randomUUID(),createdAt=clock();
  await (await db()).execute('INSERT INTO swapp_server_ad_requests (id,owner_id,server_id,plan_id,slot,contact_email,message,amount_cents,duration_days,status,payment_verified,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
   [id,ownerId,data.serverId,data.planId,data.slot,data.contactEmail,data.message,data.amountCents,data.durationDays,'pending_review',0,createdAt]);
  return {id,serverId:data.serverId,planId:data.planId,slot:data.slot,amountCents:data.amountCents,durationDays:data.durationDays,status:'pending_review',paymentVerified:false,createdAt};
 }
 async function listMine(ownerId){
  if(typeof ownerId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(ownerId))throw Error('invalid_owner_id');
  const [rows]=await (await db()).execute('SELECT id,server_id AS serverId,plan_id AS planId,slot,amount_cents AS amountCents,duration_days AS durationDays,status,created_at AS createdAt FROM swapp_server_ad_requests WHERE owner_id=? ORDER BY created_at DESC LIMIT 50',[ownerId]);
  return rows;
 }
 return {create,listMine};
}
module.exports={createServerAdRequestStore};
