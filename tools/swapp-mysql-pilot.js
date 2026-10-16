'use strict';
// Hostinger MySQL pilot. No connection is attempted by default.
// Does not modify the SWAPP application or any production Firestore collection.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const CREATE_SQL=path.join(ROOT,'migrations/mysql/001_news_pilot.sql');
const MAX_BYTES=32*1024*1024;
const MAX_DOCUMENTS=100;
const TABLE='swapp_migration_news_articles';
const idOk=x=>typeof x==='string'&&x.length>=1&&x.length<=160&&!/[\x00-\x1f]/.test(x);
function prepareRecord(record){
 if(!record||typeof record!=='object'||Array.isArray(record)||!idOk(record.id))
  throw Error('Invalid source document identifier');
 if(!record.data||typeof record.data!=='object'||Array.isArray(record.data))
  throw Error('Missing source article data');
 const data=record.data;
 const slug=String(data.slug||record.id);
 if(slug.length>128||!slug||/[\x00-\x1f]/.test(slug))throw Error('Invalid article slug: '+record.id);
 const title=typeof data.title==='string'?data.title:'';
 if(title.length>180)throw Error('Article title too long: '+record.id);
 const status=typeof data.status==='string'?data.status:'unknown';
 if(status.length>32)throw Error('Article status too long: '+record.id);
 const updated=data.updatedAt==null?null:String(data.updatedAt);
 if(updated!==null&&updated.length>40)throw Error('Invalid timestamp: '+record.id);
 const json=JSON.stringify(data);
 if(!json||Buffer.byteLength(json,'utf8')>1024*1024)throw Error('Article too large: '+record.id);
 return {
  id:record.id,slug,title,status,json,updated,
  sha256:crypto.createHash('sha256').update(json).digest('hex')
 };
}
function readPilot(file){
 if(typeof file!=='string'||!file)throw Error('A private JSONL file is required via --file=/absolute/path');
 const absolute=path.resolve(file);
 if(absolute===ROOT||absolute.startsWith(ROOT+path.sep))
  throw Error('Keep migration exports outside the SWAPP web/application directory');
 const stat=fs.statSync(absolute);
 if(!stat.isFile()||stat.size>MAX_BYTES)throw Error('Pilot export must be a file smaller than 32 MiB');
 // Read-only input; fail closed before any SQL write.
 const raw=fs.readFileSync(absolute,'utf8'),lines=raw.split(/\r?\n/).filter(x=>x.trim());
 if(!lines.length||lines.length>MAX_DOCUMENTS)throw Error('Pilot must contain 1–100 documents');
 const out=[],ids=new Set();
 for(const [i,line] of lines.entries()){
  let value;try{value=JSON.parse(line)}catch{throw Error('Invalid JSONL line '+(i+1))}
  const row=prepareRecord(value);
  if(ids.has(row.id))throw Error('Duplicate document identifier in export');
  ids.add(row.id);out.push(row);
 }
 return out;
}
function connectionOptions(env=process.env){
 const host=String(env.SWAPP_MYSQL_HOST||'localhost').trim();
 const database=String(env.SWAPP_MYSQL_DATABASE||'').trim();
 const user=String(env.SWAPP_MYSQL_USER||'').trim();
 const password=String(env.SWAPP_MYSQL_PASSWORD||'');
 if(!host||!database||!user||!password)
  throw Error('Set SWAPP_MYSQL_HOST, SWAPP_MYSQL_DATABASE, SWAPP_MYSQL_USER and SWAPP_MYSQL_PASSWORD securely in Hostinger');
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(database))throw Error('Invalid MySQL database identifier');
 const port=Number(env.SWAPP_MYSQL_PORT||3306);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid MySQL port');
 return {host,port,user,password,database,
  connectTimeout:8000,connectionLimit:2,waitForConnections:true,multipleStatements:false,
  namedPlaceholders:false,charset:'utf8mb4',timezone:'Z'};
}
function requireWritePermission(args,env=process.env){
 if(!args.includes('--confirm-write')||env.SWAPP_MYSQL_PILOT_WRITE!=='YES')
  throw Error('Pilot write blocked. Requires --confirm-write AND SWAPP_MYSQL_PILOT_WRITE=YES');
}
async function mysqlPool(env=process.env){
 let mysql;
 try{mysql=require('mysql2/promise')}catch(_){
  throw Error('mysql2 is not installed. Install the free mysql2 driver on Hostinger before DB commands');
 }
 return mysql.createPool(connectionOptions(env));
}
async function verifyRows(conn,rows){
 const ids=rows.map(x=>x.id);
 const [data]=await conn.query(
  'SELECT document_id, content_sha256 FROM '+TABLE+' WHERE document_id IN ('+
  ids.map(()=>'?').join(',')+')',ids);
 const byId=new Map(data.map(row=>[row.document_id,row.content_sha256]));
 return {expected:rows.length,matched:rows.filter(row=>byId.get(row.id)===row.sha256).length,
  missing:rows.filter(row=>!byId.has(row.id)).length,
  changed:rows.filter(row=>byId.has(row.id)&&byId.get(row.id)!==row.sha256).length};
}
async function main(argv=process.argv.slice(2),env=process.env){
 const mode=argv[0]||'help';
 if(mode==='help'||argv.includes('--help')){
  process.stdout.write('SWAPP MySQL pilot: preview --file=/private/export.jsonl | probe | init --confirm-write | import --file=... --confirm-write | verify --file=...\n');
  return;
 }
 const flag=argv.find(x=>x.startsWith('--file='));
 const file=flag?.slice('--file='.length);
 if(mode==='preview'){
  const rows=readPilot(file);
  process.stdout.write(JSON.stringify({mode,count:rows.length,statuses:[...new Set(rows.map(x=>x.status))].sort(),safe:true})+'\n');
  return;
 }
 if(!['probe','init','import','verify'].includes(mode))throw Error('Unknown MySQL pilot command');
 const writing=mode==='init'||mode==='import';
 if(writing)requireWritePermission(argv,env);
 const rows=['import','verify'].includes(mode)?readPilot(file):null;
 const pool=await mysqlPool(env);
 try{
  if(mode==='probe'){
   const [r]=await pool.query('SELECT 1 AS ready, VERSION() AS engine, DATABASE() AS db_name');
   process.stdout.write(JSON.stringify({ready:r?.[0]?.ready===1,engine:r?.[0]?.engine,databaseConnected:!!r?.[0]?.db_name})+'\n');
   return;
  }
  if(mode==='init'){
   const sql=fs.readFileSync(CREATE_SQL,'utf8');
   await pool.query(sql);
   process.stdout.write(JSON.stringify({stage:'schema_ready',table:TABLE})+'\n');
   return;
  }
  if(mode==='verify'){
   const outcome=await verifyRows(pool,rows);
   process.stdout.write(JSON.stringify({stage:'verified',...outcome})+'\n');
   if(outcome.matched!==outcome.expected)process.exitCode=1;
   return;
  }
  const conn=await pool.getConnection();
  try{
   await conn.beginTransaction();
   for(const row of rows){
    await conn.execute('INSERT INTO '+TABLE+
     ' (document_id,slug,title,article_status,article_json,content_sha256,source_updated_at) VALUES (?,?,?,?,?,?,?)'+
     ' ON DUPLICATE KEY UPDATE slug=VALUES(slug),title=VALUES(title),article_status=VALUES(article_status),'+
     'article_json=VALUES(article_json),content_sha256=VALUES(content_sha256),source_updated_at=VALUES(source_updated_at)',
     [row.id,row.slug,row.title,row.status,row.json,row.sha256,row.updated]);
   }
   const check=await verifyRows(conn,rows);
   if(check.matched!==check.expected)throw Error('SQL verification failed; rolling back staging import');
   await conn.commit();
   process.stdout.write(JSON.stringify({stage:'imported_and_verified',...check})+'\n');
  }catch(error){await conn.rollback();throw error}finally{conn.release()}
 }finally{await pool.end()}
}
if(require.main===module){
 main().catch(error=>{
  process.stderr.write('SWAPP MySQL pilot: '+error.message+'\n');
  process.exitCode=1;
 });
}
module.exports={prepareRecord,readPilot,connectionOptions,requireWritePermission,verifyRows,main};
