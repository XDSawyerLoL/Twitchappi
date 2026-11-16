'use strict';
// Manual Hostinger maintenance. Never uses a paid API, writes outside MySQL,
// or replaces the authoritative SWAPP SOCIAL native snapshot.
const {ensureSchema,rebuildIndex}=require('../modules/swapp-social-native/relational-index.cjs');
const apply=process.argv.includes('--apply');
const url=String(process.env.SWAPP_SOCIAL_MYSQL_URL||process.env.SWAPP_MYSQL_URL||'');
(async()=>{
 if(!/^mysql:\/\//.test(url))throw Error('SWAPP_SOCIAL_MYSQL_URL or SWAPP_MYSQL_URL required');
 const mysql=require('mysql2/promise');
 const pool=mysql.createPool({uri:url,connectionLimit:1,connectTimeout:5000,waitForConnections:true});
 try{
  if(apply)await ensureSchema(pool);
  const conn=await pool.getConnection();
  try{
   if(apply)await conn.beginTransaction();
   const [rows]=await conn.execute('SELECT data FROM swapp_social_native_store WHERE store_key=?'+(apply?' FOR UPDATE':''),['pulse']);
   if(rows.length!==1)throw Error('native_snapshot_missing');
   const snapshot=JSON.parse(rows[0].data);
   const counts={posts:Object.keys(snapshot.posts||{}).length,messages:Object.keys(snapshot.messages||{}).length};
   if(!apply){console.log(JSON.stringify({mode:'dry-run',...counts,notice:'Pass --apply only during a maintenance window.'}));return}
   const result=await rebuildIndex(conn,snapshot);
   await conn.commit();
   console.log(JSON.stringify({mode:'applied',...result,notice:'Dual writes remain disabled until SWAPP_SOCIAL_RELATIONAL_DUALWRITE=1 is explicitly configured.'}));
  }catch(e){if(apply)await conn.rollback().catch(()=>{});throw e}
  finally{conn.release()}
 }finally{await pool.end()}
})().catch(e=>{console.error('[SWAPP SOCIAL] Relational migration failed:',String(e?.message||'database_error'));process.exitCode=1});
