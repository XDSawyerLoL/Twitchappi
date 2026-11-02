'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createNewsMysqlStore,mysqlUrl}=require('../modules/swapp-news/mysql-store');

function mockPool(){
 const data=new Map();
 const clone=x=>JSON.parse(JSON.stringify(x));
 let commits=0,rollbacks=0;
 const pool={
  async query(sql){assert.match(sql,/CREATE TABLE IF NOT EXISTS swapp_news_documents/);return []},
  async execute(sql,args){
   if(sql.startsWith('SELECT payload_json FROM swapp_news_documents WHERE collection_name=? AND document_id=?')){
    const raw=data.get(args[0]+'/'+args[1]);
    return [raw==null?[]:[{payload_json:raw}]];
   }
   if(sql.startsWith('SELECT document_id,payload_json FROM swapp_news_documents WHERE collection_name=?')){
    const prefix=args[0]+'/';
    return [[...data.entries()].filter(([key])=>key.startsWith(prefix))
     .map(([key,payload_json])=>({document_id:key.slice(prefix.length),payload_json}))];
   }
   if(sql.startsWith('INSERT INTO swapp_news_documents')){
    const key=args[0]+'/'+args[1];
    if(data.has(key))throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
    data.set(key,args[2]);return [{affectedRows:1}];
   }
   if(sql.startsWith('UPDATE swapp_news_documents')){
    const key=args[2]+'/'+args[3];
    assert.ok(data.has(key));data.set(key,args[0]);return [{affectedRows:1}];
   }
   if(sql.startsWith('DELETE FROM swapp_news_documents')){
    data.delete(args[0]+'/'+args[1]);return [{affectedRows:1}];
   }
   throw Error('Unrecognized SQL: '+sql);
  },
  async getConnection(){return {
   ...pool,async beginTransaction(){},async commit(){commits++},
   async rollback(){rollbacks++},release(){}
  }},
  async end(){}
 };
 return {pool,data,stats:()=>({commits,rollbacks})};
}
test('MySQL NEWS accepts only a validated Hostinger MySQL URI',()=>{
 assert.throws(()=>mysqlUrl('postgres://host/db'),/news_mysql_url_invalid/);
 assert.equal(mysqlUrl('mysql://writer:secret@localhost/swapp'),'mysql://writer:secret@localhost/swapp');
});
test('creates, reads, updates, and filters native articles without Firestore',async()=>{
 const testDb=mockPool(),store=createNewsMysqlStore({pool:testDb.pool,clock:()=>123});
 const articles=store.collection('swapp_news_articles');
 await articles.doc('slug-one').create({slug:'slug-one',status:'draft',body:'test'});
 await store.runTransaction(async tx=>{
  const ref=articles.doc('slug-one');
  const item=await tx.get(ref);
  assert.equal(item.data().status,'draft');
  tx.update(ref,{status:'published'});
  tx.create(store.collection('swapp_news_outbox').doc('article_slug-one_r1'),{status:'paused'});
 });
 const item=await articles.doc('slug-one').get();
 assert.equal(item.data().status,'published');
 const list=await articles.where('status','==','published').limit(10).get();
 assert.deepEqual(list.docs.map(x=>x.id),['slug-one']);
 assert.equal(testDb.stats().commits,1);
 await assert.rejects(()=>articles.doc('slug-one').create({status:'draft'}),e=>e.code===6);
 await assert.rejects(async()=>store.collection('oryon_users'),/news_mysql_collection_not_allowed/);
});
test('prevents silent overwrites by rejecting duplicate document IDs',async()=>{
 const {pool}=mockPool(),store=createNewsMysqlStore({pool});
 const doc=store.collection('swapp_news_articles').doc('abc-123');
 await doc.create({slug:'abc-123',status:'draft'});
 await assert.rejects(()=>doc.create({slug:'abc-123',status:'published'}),e=>e.code===6);
 assert.equal((await doc.get()).data().status,'draft');
});
