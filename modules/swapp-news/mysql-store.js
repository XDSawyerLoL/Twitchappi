'use strict';
/*
 * SWAPP News — Hostinger MySQL JSON-document adapter.
 * Scope is deliberately limited to the editorial collections below.
 * This is NOT a Firebase emulator for the rest of SWAPP.
 * MySQL data is authoritative only after a verified editorial migration.
 */
const COLLECTIONS = new Set([
 'swapp_news_articles', 'swapp_news_outbox', 'swapp_news_import_keys',
 'swapp_news_discord_outbox', 'swapp_article_scores', 'swapp_article_votes'
]);
const DDL = `CREATE TABLE IF NOT EXISTS swapp_news_documents (
  collection_name VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  document_id VARCHAR(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  payload_json LONGTEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (collection_name,document_id),
  KEY swapp_news_documents_updated_idx (collection_name,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
const MAX_JSON_BYTES=1024*1024;
const MAX_QUERY=500;
const idValid=x=>typeof x==='string'&&x.length>=1&&x.length<=160&&!/[\x00-\x1f\x7f]/.test(x);
function mysqlUrl(uri){
 let u;try{u=new URL(String(uri||''))}catch{throw Error('news_mysql_url_invalid')}
 if(u.protocol!=='mysql:'||!u.hostname||!u.username||!u.pathname||u.pathname==='/'
   ||['host','your-host','hostname','localhost.example'].includes(u.hostname.toLowerCase()))
  throw Error('news_mysql_url_invalid');
 return u.href;
}
function safeData(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('news_mysql_bad_document');
 const json=JSON.stringify(value);
 if(!json||Buffer.byteLength(json)>MAX_JSON_BYTES)throw Error('news_mysql_document_too_large');
 return json;
}
function decode(row){
 if(!row)return null;
 const raw=row.payload_json;
 const value=typeof raw==='string'?JSON.parse(raw):raw;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('news_mysql_corrupted_document');
 return value;
}
function snapshot(id,row){
 const value=decode(row);
 return {id,exists:!!row,data:()=>value==null?undefined:JSON.parse(JSON.stringify(value))};
}
function queryResult(docs){
 return {docs,size:docs.length,empty:docs.length===0,forEach(fn){docs.forEach(fn)}};
}
function createNewsMysqlStore({uri,driver,pool,clock=Date.now}={}){
 let client=pool||null,initialization=null;
 async function ensure(){
  if(!initialization){
   initialization=(async()=>{
    if(!client){
     const mysql=driver||require('mysql2/promise');
     client=mysql.createPool({uri:mysqlUrl(uri),connectionLimit:3,waitForConnections:true,
       queueLimit:30,connectTimeout:5000,enableKeepAlive:true,timezone:'Z'});
    }
    await client.query(DDL);
   })().catch(error=>{initialization=null;throw error});
  }
  await initialization;return client;
 }
 const checkCollection=name=>{
  if(!COLLECTIONS.has(name))throw Error('news_mysql_collection_not_allowed');
  return name;
 };
 const ref=(collection,id)=>{
  checkCollection(collection);
  if(!idValid(id))throw Error('news_mysql_document_id_invalid');
  return {collection,id};
 };
 async function getRef(r,executor,locking=false){
  const [rows]=await executor.execute(
   'SELECT payload_json FROM swapp_news_documents WHERE collection_name=? AND document_id=? LIMIT 1'+(locking?' FOR UPDATE':''),
   [r.collection,r.id]);
  return snapshot(r.id,rows?.[0]||null);
 }
 async function write(executor,action,r,data,merge=false){
  if(action==='create'){
   try{await executor.execute(
     'INSERT INTO swapp_news_documents (collection_name,document_id,payload_json,updated_at) VALUES (?,?,?,?)',
     [r.collection,r.id,safeData(data),clock()]);}
   catch(error){if(error?.code==='ER_DUP_ENTRY'){error.code=6}throw error}
   return;
  }
  if(action==='delete'){
   await executor.execute('DELETE FROM swapp_news_documents WHERE collection_name=? AND document_id=?',[r.collection,r.id]);
   return;
  }
  const prev=await getRef(r,executor,false);
  if(action==='update'&&!prev.exists)throw Error('news_mysql_document_missing');
  const next=merge||action==='update'?{...(prev.exists?prev.data():{}),...data}:data;
  if(prev.exists){
   await executor.execute(
    'UPDATE swapp_news_documents SET payload_json=?,updated_at=? WHERE collection_name=? AND document_id=?',
    [safeData(next),clock(),r.collection,r.id]);
  }else{
   await write(executor,'create',r,next);
  }
 }
 function document(collection,id){
  const r=ref(collection,id);
  return {
   id,
   async get(){const db=await ensure();return getRef(r,db)},
   async create(data){const db=await ensure();return write(db,'create',r,data)},
   async set(data,options={}){const db=await ensure();return write(db,'set',r,data,!!options?.merge)},
   async update(data){const db=await ensure();return write(db,'update',r,data)},
   async delete(){const db=await ensure();return write(db,'delete',r)}
  };
 }
 function collection(name){
  checkCollection(name);
  function query(filters=[],sorting=null,cap=MAX_QUERY){
   return {
    where(key,op,value){
     if(op!=='=='||typeof key!=='string'||!key)throw Error('news_mysql_query_not_supported');
     return query([...filters,{key,value}],sorting,cap);
    },
    orderBy(key,dir='asc'){return query(filters,{key,dir},cap)},
    limit(n){
     if(!Number.isInteger(n)||n<1||n>MAX_QUERY)throw Error('news_mysql_query_limit');
     return query(filters,sorting,n);
    },
    async get(){
     const db=await ensure();
     // Bound scans to keep memory and MySQL usage predictable on shared hosting.
     // Do not silently truncate before filtering if the table grows too large.
     const [rows]=await db.execute(
      'SELECT document_id,payload_json FROM swapp_news_documents WHERE collection_name=? ORDER BY updated_at DESC LIMIT 1001',
      [name]);
     if(rows.length>1000)throw Error('news_mysql_collection_scan_limit');
     let docs=rows.map(row=>({id:row.document_id,value:decode(row)}))
      .filter(row=>filters.every(f=>row.value?.[f.key]===f.value));
     if(sorting)docs.sort((a,b)=>{
      const x=String(a.value?.[sorting.key]??'');
      const y=String(b.value?.[sorting.key]??'');
      return (sorting.dir==='desc'?-1:1)*x.localeCompare(y);
     });
     return queryResult(docs.slice(0,cap).map(row=>snapshot(row.id,{payload_json:row.value})));
    }
   };
  }
  return {...query(),doc(id){return document(name,id)}};
 }
 async function runTransaction(fn){
  const db=await ensure();
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const operations=[];
   const tx={
    async get(r){return getRef(ref(r.collection,r.id),conn,true)},
    create(r,data){operations.push({action:'create',r:ref(r.collection,r.id),data})},
    set(r,data,options){operations.push({action:'set',r:ref(r.collection,r.id),data,merge:!!options?.merge})},
    update(r,data){operations.push({action:'update',r:ref(r.collection,r.id),data})},
    delete(r){operations.push({action:'delete',r:ref(r.collection,r.id)})}
   };
   const result=await fn(tx);
   for(const op of operations)await write(conn,op.action,op.r,op.data,op.merge);
   await conn.commit();return result;
  }catch(e){
   try{await conn.rollback()}catch(_){}
   throw e;
  }finally{conn.release()}
 }
 return {backend:'mysql',collection,runTransaction,ensure,close:async()=>{if(client&&typeof client.end==='function')await client.end()}};
}
module.exports={createNewsMysqlStore,DDL,decode,queryResult,mysqlUrl,safeData};
