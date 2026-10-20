'use strict';
/** Read-only snapshot exporter for a CURRENT Quantic SOCIAL backend environment.
 * Run from the backend directory in an authorized administrative shell.
 * It never sends the snapshot to a network host and never modifies the source.
 */
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const path=require('node:path');
async function sourceSnapshot({env=process.env,baseDir=process.cwd(),deps={}}={}){
 if(env.PULSE_DATABASE_URL){
  const mod=deps.pg||require('pg');
  const client=new mod.Client({connectionString:env.PULSE_DATABASE_URL});
  try{
   await client.connect();
   const result=await client.query('SELECT data FROM quantic_pulse_store WHERE store_key=$1',['pulse']);
   if(result.rows.length!==1)throw Error('source_store_missing');
   return {storage:'postgres',data:result.rows[0].data};
  }finally{await client.end().catch(()=>{})}
 }
 if(env.PULSE_DB_HOST&&env.PULSE_DB_USER&&env.PULSE_DB_NAME){
  const mysql=deps.mysql||require('mysql2/promise');
  const client=await mysql.createConnection({
   host:env.PULSE_DB_HOST,port:Number(env.PULSE_DB_PORT||3306),
   user:env.PULSE_DB_USER,password:env.PULSE_DB_PASSWORD,
   database:env.PULSE_DB_NAME,connectTimeout:5000
  });
  try{
   const [rows]=await client.execute('SELECT data FROM quantic_pulse_store WHERE store_key=?',['pulse']);
   if(rows.length!==1)throw Error('source_store_missing');
   return {storage:'mysql',data:rows[0].data};
  }finally{await client.end().catch(()=>{})}
 }
 const base=path.resolve(baseDir,env.DATA_DIR||'./data');
 const data=await fs.readFile(path.join(base,'pulse.json'),'utf8');
 return {storage:'json_file',data};
}
function normalizeSource(value){
 const source=typeof value==='string'?JSON.parse(value):value;
 if(!source||typeof source!=='object'||Array.isArray(source)||
   !source.users||!source.posts||!source.messages||!source.handles)
  throw Error('source_snapshot_invalid');
 return source;
}
async function run(argv=process.argv.slice(2),{env=process.env,baseDir=process.cwd(),deps={}}={}){
 const arg=argv.find(x=>x.startsWith('--output='));
 if(!arg)throw Error('output_absolute_path_required');
 const dest=arg.slice('--output='.length);
 if(!path.isAbsolute(dest))throw Error('output_absolute_path_required');
 const {storage,data}=await sourceSnapshot({env,baseDir,deps});
 const state=normalizeSource(data);
 const snapshot=JSON.stringify(state);
 if(Buffer.byteLength(snapshot,'utf8')>12*1024*1024)throw Error('snapshot_too_large_for_safe_import');
 const counts=Object.fromEntries(['users','posts','messages','follows','circles'].map(k=>
  [k,Object.keys(state[k]||{}).length]));
 const sha256=crypto.createHash('sha256').update(snapshot).digest('hex');
 // 0600 and wx: refuse to replace an existing backup or place data in stdout.
 await fs.writeFile(dest,snapshot,{flag:'wx',mode:0o600});
 return {source:storage,file:dest,bytes:Buffer.byteLength(snapshot),sha256,counts};
}
if(require.main===module)run().then(result=>{
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}).catch(error=>{
 process.stderr.write('Export refused: '+String(error?.code||error?.message||'export_failed')+'\n');
 process.exitCode=1;
});
module.exports={sourceSnapshot,normalizeSource,run};
