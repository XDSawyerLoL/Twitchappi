'use strict';
// Public readiness checks expose status only, never snapshot content or credentials.
function createNativeSocialReadiness({mysqlFactory=()=>require('mysql2/promise'),
  uri=process.env.SWAPP_SOCIAL_MYSQL_URL||process.env.SWAPP_MYSQL_URL||'',
  now=Date.now,cacheMs=30000}={}){
 let cache={until:0,payload:{database_reachable:false,snapshot_present:false,snapshot_type:'none'}},
   pending=null;
 async function probe(){
  if(now()<cache.until)return cache.payload;
  if(pending)return pending;
  pending=(async()=>{
   let conn=null;
   const payload={database_reachable:false,snapshot_present:false,snapshot_type:'none'};
   try{
    const u=new URL(String(uri||''));
    if(u.protocol!=='mysql:'||!u.hostname||!u.username||!u.pathname||u.pathname==='/')
     throw Error('invalid_mysql_connection');
    const mysql=mysqlFactory();
    conn=await mysql.createConnection({uri,connectTimeout:5000});
    payload.database_reachable=true;
    const [rows]=await conn.execute(
     'SELECT CHAR_LENGTH(data) AS snapshot_bytes, JSON_UNQUOTE(JSON_EXTRACT(data, \'$.swappSocialOrigin\')) AS snapshot_origin FROM swapp_social_native_store WHERE store_key=? LIMIT 1',['pulse']);
    payload.snapshot_present=Boolean(rows.length&&Number(rows[0].snapshot_bytes)>100);
    payload.snapshot_type=!payload.snapshot_present?'none':
      rows[0]?.snapshot_origin==='fresh-v1'?'fresh':'imported';
   }catch(_){/* Probe is read-only and intentionally never exposes backend errors. */}
   finally{if(conn)await conn.end().catch(()=>{})}
   cache={until:now()+Math.max(5000,cacheMs),payload};
   return payload;
  })().finally(()=>{pending=null});
  return pending;
 }
 // A bootstrap may finish after a status probe has cached 'none'.
 // Drop only the in-memory health cache; never alter the MySQL table.
 function invalidate(){cache.until=0;cache.payload={database_reachable:false,snapshot_present:false,snapshot_type:'none'};}
 return {probe,invalidate};
}
module.exports={createNativeSocialReadiness};
