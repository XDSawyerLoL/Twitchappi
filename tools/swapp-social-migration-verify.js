'use strict';
// Compare an authorized, private, frozen source backup to the imported MySQL
// document. Prints ONLY collection counts, byte lengths and checksums.
const fs=require('node:fs');
const path=require('node:path');
const {verifyPulseSnapshot,MAX_BYTES}=require('./swapp-social-mysql-import');
function failure(code){const error=new Error(code);error.code=code;throw error}
function compareVerified(source,destination){
 if(!source||!destination||!source.sha256||!destination.sha256)failure('snapshots_required');
 const keys=new Set([...Object.keys(source.counts||{}),...Object.keys(destination.counts||{})]);
 const differences=[...keys].filter(k=>source.counts[k]!==destination.counts[k]);
 return {matches:source.sha256===destination.sha256&&differences.length===0,
  source_sha256:source.sha256,target_sha256:destination.sha256,
  source_bytes:source.bytes,target_bytes:destination.bytes,
  source_counts:source.counts,target_counts:destination.counts,
  count_differences:differences};
}
async function inspectDestination({mysql,uri}={}){
 if(!mysql?.createConnection||!uri)failure('mysql_connection_required');
 const db=await mysql.createConnection({uri,connectTimeout:5000});
 try{
  const [rows]=await db.execute('SELECT data FROM swapp_social_native_store WHERE store_key=? LIMIT 1',['pulse']);
  if(rows.length!==1)failure('destination_snapshot_not_found');
  return verifyPulseSnapshot(typeof rows[0].data==='string'?JSON.parse(rows[0].data):rows[0].data);
 }finally{await db.end()}
}
function secureSource(file){
 if(!file||!path.isAbsolute(file))failure('absolute_source_backup_path_required');
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>MAX_BYTES)failure('invalid_backup_file');
 return verifyPulseSnapshot(JSON.parse(fs.readFileSync(file,'utf8')));
}
async function run(args=process.argv.slice(2),env=process.env){
 const file=args.find(a=>!a.startsWith('--'));
 const source=secureSource(file);
 const compare=args.includes('--compare');
 const output={source_sha256:source.sha256,source_bytes:source.bytes,
  source_counts:source.counts,comparison_performed:compare};
 if(compare){
  const uri=env.SWAPP_SOCIAL_MYSQL_URL||env.SWAPP_MYSQL_URL;
  if(!uri)failure('mysql_url_missing');
  const mysql=require('mysql2/promise');
  const result=compareVerified(source,await inspectDestination({mysql,uri}));
  Object.assign(output,result);
  if(!result.matches)failure('source_destination_snapshot_mismatch');
 }
 process.stdout.write(JSON.stringify(output,null,2)+'\n');
 return output;
}
if(require.main===module)run().catch(e=>{
 process.stderr.write('SOCIAL verification failed: '+String(e.code||e.message||'unknown_error')+'\n');
 process.exitCode=1;
});
module.exports={compareVerified,inspectDestination,secureSource,run};
