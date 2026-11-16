'use strict';
// Manual Hostinger maintenance. Never uses a paid API, writes outside MySQL,
// or replaces the authoritative SWAPP SOCIAL native snapshot.
const {ensureSchema,rebuildIndex,verifyIndex}=require('../modules/swapp-social-native/relational-index.cjs');
const apply=process.argv.includes('--apply');
const verify=process.argv.includes('--verify');
if(apply&&verify)throw Error('social_relational_mode_conflict');
const url=String(process.env.SWAPP_SOCIAL_MYSQL_URL||process.env.SWAPP_MYSQL_URL||'');
(async()=>{
 if(!/^mysql:\/\//.test(url))throw Error('SWAPP_SOCIAL_MYSQL_URL or SWAPP_MYSQL_URL required');
 const mysql=require('mysql2/promise');
 const pool=mysql.createPool({uri:url,connectionLimit:1,connectTimeout:5000,waitForConnections:true,timezone:'Z'});
 try{
  if(apply)await ensureSchema(pool);
  const conn=await pool.getConnection();
  try{
   if(apply||verify){
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.beginTransaction();
   }
   const [rows]=await conn.execute('SELECT data FROM swapp_social_native_store WHERE store_key=?'+(apply?' FOR UPDATE':''),['pulse']);
   if(rows.length!==1)throw Error('native_snapshot_missing');
   const snapshot=JSON.parse(rows[0].data);
   const counts={posts:Object.keys(snapshot.posts||{}).length,messages:Object.keys(snapshot.messages||{}).length};
   if(!apply&&!verify){console.log(JSON.stringify({mode:'dry-run',...counts,notice:'Pass --apply only during a maintenance window.'}));return}
   if(verify){
    const result=await verifyIndex(conn,snapshot);
    console.log(JSON.stringify({mode:'verify',...result}));
    if(!result.ok)throw Error('social_relational_index_drift');
    await conn.rollback();
    return;
   }
   const result=await rebuildIndex(conn,snapshot);
   const checked=await verifyIndex(conn,snapshot);
   if(!checked.ok)throw Error('social_relational_index_drift');
   await conn.commit();
   console.log(JSON.stringify({mode:'applied',...result,verified:checked.ok,notice:'Dual writes remain disabled until SWAPP_SOCIAL_RELATIONAL_DUALWRITE=1 is explicitly configured.'}));
  }catch(e){if(apply||verify)await conn.rollback().catch(()=>{});throw e}
  finally{conn.release()}
 }finally{await pool.end()}
})().catch(e=>{console.error('[SWAPP SOCIAL] Relational migration failed:',String(e?.message||'database_error'));process.exitCode=1});
