'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {prepareRecord,readPilot,connectionOptions,requireWritePermission,verifyRows}=require('../tools/swapp-mysql-pilot');
const {exportOptions}=require('../tools/swapp-firestore-news-export');

test('MySQL pilot preserves the full article document and verifies its SHA256',()=>{
 const original={slug:'world-of-warcraft-trailer',title:'World of Warcraft : bande-annonce',
  status:'published',body:'Texte français complet, source, image, médias.',
  nested:{unknownField:'preserved',commercialLinks:[{url:'https://example.com',rel:'sponsored'}]},
  updatedAt:'2026-10-16T08:00:00.000Z'};
 const row=prepareRecord({id:original.slug,data:original});
 assert.equal(row.slug,original.slug);
 assert.equal(row.status,'published');
 assert.deepEqual(JSON.parse(row.json),original);
 assert.equal(row.sha256,crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'));
 assert.match(row.sha256,/^[0-9a-f]{64}$/);
});

test('unsafe or truncated pilot documents are rejected, not silently shortened',()=>{
 for(const row of [
  null,{id:'',data:{}},{id:'bad\nnewline',data:{}},{id:'ok',data:null},
  {id:'ok',data:{slug:'x'.repeat(130)}},
  {id:'ok',data:{title:'a'.repeat(181)}},
  {id:'ok',data:{body:'x'.repeat(1024*1024)}}
 ])assert.throws(()=>prepareRecord(row));
});

test('pilot preview never needs database access and catches duplicate IDs',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-mysql-'));
 const file=path.join(dir,'articles.jsonl');
 try{
  const rows=[{id:'article-one',data:{title:'Premier article',slug:'article-one',status:'draft'}},
   {id:'article-two',data:{title:'Second article',slug:'article-two',status:'published'}}];
  fs.writeFileSync(file,rows.map(JSON.stringify).join('\n')+'\n',{mode:0o600});
  assert.equal(readPilot(file).length,2);
  fs.writeFileSync(file,JSON.stringify(rows[0])+'\n'+JSON.stringify(rows[0]));
  assert.throws(()=>readPilot(file),/Duplicate/);
  fs.writeFileSync(file,'not json\n');
  assert.throws(()=>readPilot(file),/Invalid JSONL/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('no staging write unless both explicit flags are provided',()=>{
 assert.throws(()=>requireWritePermission([],{}));
 assert.throws(()=>requireWritePermission(['--confirm-write'],{}));
 assert.throws(()=>requireWritePermission([],{SWAPP_MYSQL_PILOT_WRITE:'YES'}));
 assert.doesNotThrow(()=>requireWritePermission(['--confirm-write'],{SWAPP_MYSQL_PILOT_WRITE:'YES'}));
});

test('Hostinger MySQL connection validation keeps credentials off output',()=>{
 const env={SWAPP_MYSQL_DATABASE:'swappdb',SWAPP_MYSQL_HOST:'localhost',
  SWAPP_MYSQL_USER:'swapp_user',SWAPP_MYSQL_PASSWORD:'secret-password'};
 const opts=connectionOptions(env);
 assert.equal(opts.database,'swappdb');
 assert.equal(opts.multipleStatements,false);
 assert.equal(opts.connectionLimit,2);
 assert.equal(opts.password,env.SWAPP_MYSQL_PASSWORD);
 assert.throws(()=>connectionOptions({...env,SWAPP_MYSQL_DATABASE:'swappdb; DROP TABLE users'}));
 assert.throws(()=>connectionOptions({...env,SWAPP_MYSQL_PASSWORD:''}));
 assert.throws(()=>connectionOptions({...env,SWAPP_MYSQL_PORT:'0'}));
});

test('row verification checks digest equality without exposing original content',async()=>{
 const record=prepareRecord({id:'article-one',data:{title:'Article',status:'draft'}});
 const good={query:async(sql,args)=>{
  assert.match(sql,/SELECT document_id, content_sha256 FROM swapp_migration_news_articles/);
  assert.deepEqual(args,['article-one']);
  return [[{document_id:record.id,content_sha256:record.sha256}]];
 }};
 assert.deepEqual(await verifyRows(good,[record]),{expected:1,matched:1,missing:0,changed:0});
 const corrupted={query:async()=>[[{document_id:record.id,content_sha256:'0'.repeat(64)}]]};
 assert.deepEqual(await verifyRows(corrupted,[record]),{expected:1,matched:0,missing:0,changed:1});
});

test('Firestore snapshot cannot start without explicit consent and private file path',()=>{
 const env={SWAPP_FIRESTORE_EXPORT:'YES'};
 assert.throws(()=>exportOptions(['--file=/tmp/swapp.jsonl'],env));
 assert.throws(()=>exportOptions(['--confirm-read','--file=relative.jsonl'],env));
 assert.throws(()=>exportOptions(['--confirm-read','--file=/tmp/swapp.jsonl','--limit=1000'],env));
 assert.deepEqual(exportOptions(['--confirm-read','--file=/tmp/swapp.jsonl','--limit=25'],env),
  {target:'/tmp/swapp.jsonl',limit:25});
});

test('staging DDL is isolated and does not DROP or ALTER existing tables',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../migrations/mysql/001_news_pilot.sql'),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS swapp_migration_news_articles/);
 assert.match(sql,/ENGINE=InnoDB/);
 assert.match(sql,/content_sha256 CHAR\(64\)/);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE FROM|ALTER TABLE)\s+(?:TABLE\s+)?(?:swapp|oryon|users)/i);
});
