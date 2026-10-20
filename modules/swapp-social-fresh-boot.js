'use strict';
// Hostinger-friendly one-shot SOCIAL fresh bootstrap. Never imports or deletes
// Render history, never overwrites any existing MySQL SOCIAL snapshot.
const crypto=require('node:crypto');
const {DDL}=require('../tools/swapp-social-mysql-import');
const {FRESH_MARKER,freshSummary}=require('../tools/swapp-social-fresh-start');
const CONFIRM_FLAGS={
 backend:'mysql', verified:'1',autoInit:'1',approved:'1'
};
function config(env=process.env){
 const requested=env.SWAPP_SOCIAL_FRESH_AUTO_INIT==='1';
 if(!requested)return {requested:false};
 if(String(env.SWAPP_SOCIAL_BACKEND||'').trim().toLowerCase()!=='mysql'||
   env.SWAPP_SOCIAL_FRESH_START_VERIFIED!=='1'||
   env.SWAPP_SOCIAL_FRESH_START_APPROVED!=='1'||
   env.SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED==='1')
  throw Error('fresh_social_bootstrap_approval_incomplete');
 const uri=env.SWAPP_SOCIAL_MYSQL_URL||env.SWAPP_MYSQL_URL||'';
 let parsed;
 try{parsed=new URL(uri)}catch{throw Error('social_mysql_url_missing')}
 if(parsed.protocol!=='mysql:'||!parsed.hostname||!parsed.username||
   !parsed.pathname||parsed.pathname==='/')throw Error('social_mysql_url_invalid');
 return {requested:true,uri};
}
function storedType(value){
 let data;
 try{data=typeof value==='string'?JSON.parse(value):value}catch{throw Error('existing_social_snapshot_unreadable')}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('existing_social_snapshot_invalid');
 if(data.swappSocialOrigin!==FRESH_MARKER)throw Error('existing_social_snapshot_not_fresh');
 if(!data.users||!data.posts||!data.messages)throw Error('existing_social_snapshot_invalid');
 return 'fresh';
}
async function bootstrapFreshSocial({env=process.env,driver}={}){
 const conf=config(env);
 if(!conf.requested)return {state:'not_requested'};
 const mysql=driver||require('mysql2/promise');
 const pool=mysql.createPool({uri:conf.uri,connectionLimit:2,waitForConnections:true,
  queueLimit:4,connectTimeout:5000,timezone:'Z'});
 let connection;
 try{
  connection=await pool.getConnection();
  await connection.query(DDL);
  await connection.beginTransaction();
  const [rows]=await connection.execute('SELECT data FROM swapp_social_native_store WHERE store_key=? FOR UPDATE',['pulse']);
  if(rows.length){
   storedType(rows[0].data);
   await connection.commit();
   return {state:'already_fresh'};
  }
  const {verified}=freshSummary();
  await connection.execute('INSERT INTO swapp_social_native_store (store_key,data) VALUES (?,?)',
    ['pulse',verified.serialized]);
  const [readBack]=await connection.execute('SELECT data FROM swapp_social_native_store WHERE store_key=?',['pulse']);
  if(readBack.length!==1)throw Error('fresh_social_readback_missing');
  const actual=typeof readBack[0].data==='string'?readBack[0].data:JSON.stringify(readBack[0].data);
  if(crypto.createHash('sha256').update(actual).digest('hex')!==verified.sha256)
   throw Error('fresh_social_readback_mismatch');
  await connection.commit();
  return {state:'created_fresh'};
 }catch(error){
  if(connection)await connection.rollback().catch(()=>{});
  // If two Node workers race, the primary key prevents double initialization.
  // The other worker can retry on a later startup; NEVER overwrite an existing row.
  throw error;
 }finally{
  if(connection)connection.release();
  await pool.end();
 }
}
module.exports={config,storedType,bootstrapFreshSocial,FRESH_MARKER,CONFIRM_FLAGS};
