'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {indexedPosts}=require('../modules/swapp-social-native/relational-index.cjs');
const stamp='2026-11-16T12:00:00.000Z';
function fixtures(){
 const posts={
  p_1:{id:'p_1',authorId:'u_1',body:'Public',replyToId:null,deletedAt:null,createdAt:stamp},
  p_2:{id:'p_2',authorId:'u_1',body:'Réponse',replyToId:'p_1',deletedAt:null,createdAt:stamp},
  p_3:{id:'p_3',authorId:'u_2',body:'Privé',replyToId:'p_1',circleId:'c_1',deletedAt:null,createdAt:stamp},
  p_4:{id:'p_4',authorId:'u_1',body:'Supprimé',replyToId:'p_1',deletedAt:stamp,createdAt:stamp}
 };
 return {posts,messages:{}};
}
function connection(store,{omit='',alter=''}={}){
 return {execute:async(sql,params)=>{
  if(sql.startsWith('SELECT migration_version'))return [[{migration_version:1}]];
  if(sql.includes('FROM swapp_social_native_posts_v2')){
   const [identity]=params;
   const rows=Object.values(store.posts).filter(p=>!p.deletedAt&&(
    sql.includes('WHERE reply_to_id=')?p.replyToId===identity:
    p.authorId===identity&&!p.replyToId)).filter(p=>p.id!==omit)
    .map(p=>({id:p.id,payload_json:p.id===alter?'{}':JSON.stringify(p)}));
   return [rows];
  }
  throw Error('Unexpected query '+sql);
 }};
}
test('indexed read retrieves exactly the expected non-deleted replies',async()=>{
 const store=fixtures(),conn=connection(store);
 const rows=await indexedPosts(conn,store,{kind:'replies',ownerOrPost:'p_1',expectedCount:2});
 assert.equal(rows.length,2);
 assert.equal(rows.every(r=>r.replyToId==='p_1'&&!r.deletedAt),true);
});
test('indexed read of a profile excludes replies and deleted posts',async()=>{
 const store=fixtures(),conn=connection(store);
 const rows=await indexedPosts(conn,store,{kind:'author',ownerOrPost:'u_1',expectedCount:1});
 assert.deepEqual(rows.map(p=>p.id),['p_1']);
});
test('missing or corrupt indexed content produces an error, never partial content',async()=>{
 const store=fixtures();
 await assert.rejects(indexedPosts(connection(store,{omit:'p_3'}),store,{kind:'replies',ownerOrPost:'p_1',expectedCount:2}),/index_drift/);
 await assert.rejects(indexedPosts(connection(store,{alter:'p_2'}),store,{kind:'replies',ownerOrPost:'p_1',expectedCount:2}),/index_drift/);
});
test('SQL read gate depends on dual write and transactionally reads the same snapshot',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../modules/swapp-social-native/pulse.mjs'),'utf8');
 assert.match(src,/RELATIONAL_READS=RELATIONAL_DUALWRITE&&process\.env\.SWAPP_SOCIAL_RELATIONAL_READS==='1'/);
 assert.match(src,/SET TRANSACTION ISOLATION LEVEL REPEATABLE READ/);
 assert.match(src,/relationalIndex\.indexedPosts\(conn,store,\{kind:'replies'/);
 assert.match(src,/relationalIndex\.indexedPosts\(conn,store,\{kind:'author'/);
 assert.match(src,/viewMetrics\(store\)\.topLevelByAuthor/);
});
