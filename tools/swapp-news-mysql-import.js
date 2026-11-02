'use strict';
/*
 * Explicit, non-destructive migration of SWAPP editorial records to existing
 * Hostinger MySQL. Requires either a private Firestore JSONL export already
 * obtained, or an already populated Hostinger pilot staging table.
 *
 * Dry-run by default. Never connects to Firebase or deletes source data.
 * NEVER automatically marks an incomplete migration as verified.
 */
const crypto=require('node:crypto');
const {readPilot,prepareRecord}=require('./swapp-mysql-pilot');
const {createNewsMysqlStore,mysqlUrl}=require('../modules/swapp-news/mysql-store');
const MAX_DOCUMENTS=500;
function validateRecords(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>MAX_DOCUMENTS)throw Error('news_import_invalid_count');
 const ids=new Set();
 for(const row of rows){
  if(!row||typeof row!=='object'||!row.id||ids.has(row.id))throw Error('news_import_duplicate_id');
  ids.add(row.id);
  const a=JSON.parse(row.json);
  if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.slug!=='string')throw Error('news_import_invalid_article');
  if(a.slug!==row.id)throw Error('news_import_slug_mismatch');
  if(!['published','draft','review','archived','withdrawn','unpublished'].includes(a.status))
   throw Error('news_import_status_unrecognized');
  const digest=crypto.createHash('sha256').update(row.json).digest('hex');
  if(digest!==row.sha256)throw Error('news_import_checksum_mismatch');
 }
 return rows;
}
async function fromPilot(pool){
 const [table]=await pool.query("SHOW TABLES LIKE 'swapp_migration_news_articles'");
 if(!table.length)throw Error('news_import_pilot_table_missing');
 const [rows]=await pool.query(
  'SELECT document_id,article_json,content_sha256 FROM swapp_migration_news_articles LIMIT 501');
 return validateRecords(rows.map(r=>({id:r.document_id,json:r.article_json,
  sha256:r.content_sha256})));
}
function fromFile(file){
 return validateRecords(readPilot(file).map(r=>({id:r.id,json:r.json,sha256:r.sha256})));
}
async function migrate({records,store}){
 validateRecords(records);
 const articles=store.collection('swapp_news_articles');
 const existing=[];
 await store.runTransaction(async tx=>{
  for(const row of records){
   const ref=articles.doc(row.id),snap=await tx.get(ref);
   if(snap.exists){
    if(crypto.createHash('sha256').update(JSON.stringify(snap.data())).digest('hex')!==row.sha256)
     throw Error('news_import_existing_conflict:'+row.id);
    existing.push(row.id);continue;
   }
   tx.create(ref,JSON.parse(row.json));
  }
 });
 for(const row of records){
  const snap=await articles.doc(row.id).get();
  if(!snap.exists||crypto.createHash('sha256').update(JSON.stringify(snap.data())).digest('hex')!==row.sha256)
   throw Error('news_import_postcommit_verification_failed');
 }
 return {verified:records.length,alreadyPresent:existing.length,imported:records.length-existing.length};
}
async function main(argv=process.argv.slice(2),env=process.env,deps={}){
 const source=argv.includes('--pilot')?'pilot':'file';
 const file=argv.find(s=>s.startsWith('--file='))?.slice(7);
 if(source==='file'&&!file)throw Error('news_import_requires_private_file_or_pilot');
 if(source==='pilot'&&file)throw Error('news_import_choose_one_source');
 const commit=argv.includes('--commit');
 if(commit&&env.SWAPP_NEWS_IMPORT_APPROVED!=='YES')throw Error('news_import_approval_missing');
 let pool=null;
 try{
  let rows;
  if(source==='file')rows=fromFile(file);
  else{
   const uri=mysqlUrl(env.SWAPP_NEWS_MYSQL_URL||env.SWAPP_MYSQL_URL);
   const mysql=deps.mysql||require('mysql2/promise');
   pool=mysql.createPool({uri,connectionLimit:2,connectTimeout:5000,waitForConnections:true,queueLimit:20});
   rows=await fromPilot(pool);
  }
  const preview={source,mode:commit?'commit':'preview',count:rows.length,
   statuses:Object.fromEntries([...new Set(rows.map(r=>JSON.parse(r.json).status))]
    .sort().map(status=>[status,rows.filter(r=>JSON.parse(r.json).status===status).length]))};
  if(!commit){process.stdout.write(JSON.stringify({...preview,writes:false})+'\n');return preview}
  // No new hosting or third party. Pool is created only for approved import.
  const url=mysqlUrl(env.SWAPP_NEWS_MYSQL_URL||env.SWAPP_MYSQL_URL);
  const store=deps.store||createNewsMysqlStore({uri:url,pool:pool||undefined});
  try{
   const migrated=await migrate({records:rows,store});
   const output={...preview,...migrated,migrationVerifiedFlagUpdated:false,
    note:'Verify export completeness including withdrawn records BEFORE setting SWAPP_NEWS_MIGRATION_VERIFIED=1'};
   process.stdout.write(JSON.stringify(output)+'\n');
   return output;
  }finally{if(!pool)await store.close()}
 }finally{if(pool)await pool.end()}
}
if(require.main===module)main().catch(e=>{console.error('[SWAPP NEWS IMPORT]',e.message);process.exitCode=1});
module.exports={validateRecords,fromPilot,fromFile,migrate,main};
