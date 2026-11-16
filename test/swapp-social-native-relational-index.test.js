'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {capture,syncDelta,rebuildIndex,SQL}=require('../modules/swapp-social-native/relational-index.cjs');
const stamp='2026-11-16T09:00:00.000Z';
const post=(id='p_abc')=>({id,authorId:'u_one',createdAt:stamp,body:'Message public',circleId:null,replyToId:null,deletedAt:null});
const msg=(id='m_abc')=>({id,conversationKey:'u_one:u_two',senderId:'u_one',recipientId:'u_two',body:'Message privé',createdAt:stamp,readAt:null});
test('DDL is additive, indexed and never drops the existing SOCIAL snapshot',()=>{
 assert.equal(SQL.length,3);
 assert.ok(SQL.every(sql=>sql.startsWith('CREATE TABLE IF NOT EXISTS')));
 assert.match(SQL.join('\n'),/snp_feed/);
 assert.match(SQL.join('\n'),/snm_thread/);
 assert.doesNotMatch(SQL.join('\n'),/DROP TABLE|swapp_social_native_store/);
});
test('same-transaction delta writes only changed posts/messages with bound parameters',async()=>{
 const store={posts:{p_abc:post()},messages:{m_abc:msg()}},base=capture(store);
 store.posts.p_abc.deletedAt=stamp;
 store.messages.m_abc.readAt=stamp;
 store.posts.p_new=post('p_new');
 const calls=[];
 const conn={execute:async(sql,args)=>{calls.push({sql,args});return sql.includes('SELECT migration_version')?[[{migration_version:1}]]:[{affectedRows:1}]}};
 const delta=await syncDelta(conn,base,store);
 assert.deepEqual(delta,{posts:2,messages:1});
 assert.equal(calls.filter(c=>c.sql.startsWith('INSERT INTO ')).length,3);
 assert.ok(calls.every(c=>!c.sql.includes('Message privé')));
 const again=await syncDelta(conn,capture(store),store);
 assert.deepEqual(again,{posts:0,messages:0});
 assert.equal(calls.filter(c=>c.sql.startsWith('INSERT INTO ')).length,3);
});
test('no SQL side effects before full validation of imported records',async()=>{
 const calls=[],conn={execute:async(sql,args)=>{calls.push({sql,args});return [{affectedRows:1}]}};
 await assert.rejects(rebuildIndex(conn,{posts:{p_bad:{...post('p_bad'),createdAt:'not-a-date'}},messages:{}}),/invalid_date/);
 assert.equal(calls.length,0);
});
test('no silent dual-write until the backfill marker exists',async()=>{
 const store={posts:{},messages:{}},calls=[];
 const conn={execute:async(sql,args)=>{calls.push(sql);return [[]]}};
 await assert.rejects(syncDelta(conn,capture(store),store),/backfill_required/);
 assert.equal(calls.length,1);
});
test('rebuild only changes the two projection tables and marks schema version at end',async()=>{
 const calls=[],conn={execute:async(sql,args)=>{calls.push({sql,args});return [{affectedRows:1}]}};
 const result=await rebuildIndex(conn,{posts:{p_abc:post()},messages:{m_abc:msg()}});
 assert.deepEqual(result,{posts:1,messages:1});
 assert.equal(calls[0].sql,'DELETE FROM swapp_social_native_posts_v2');
 assert.equal(calls[1].sql,'DELETE FROM swapp_social_native_messages_v2');
 assert.match(calls.at(-1).sql,/INSERT INTO swapp_social_native_index_meta/);
});
test('production keeps dual writes disabled unless explicitly enabled',()=>{
 const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../modules/swapp-social-native/pulse.mjs'),'utf8');
 assert.match(src,/SWAPP_SOCIAL_RELATIONAL_DUALWRITE==='1'/);
 assert.match(src,/if\(RELATIONAL_DUALWRITE\)await relationalIndex\.syncDelta\(conn,before,store\)/);
 assert.ok(src.indexOf('relationalIndex.syncDelta')<src.indexOf('await conn.commit()'));
});


test('backfill batches statements instead of issuing one INSERT per row',async()=>{
 const calls=[],conn={execute:async(sql,args)=>{calls.push({sql,args});return [{affectedRows:1}]}};
 const posts={},messages={};
 for(let i=0;i<130;i++)posts['p_'+i]={...post('p_'+i)};
 for(let i=0;i<67;i++)messages['m_'+i]={...msg('m_'+i)};
 const result=await rebuildIndex(conn,{posts,messages});
 assert.deepEqual(result,{posts:130,messages:67});
 const inserts=calls.filter(c=>c.sql.startsWith('INSERT INTO swapp_social_native_posts_v2')||
  c.sql.startsWith('INSERT INTO swapp_social_native_messages_v2'));
 assert.equal(inserts.length,5,'130 posts => 3 batches and 67 messages => 2 batches');
 assert.ok(inserts.every(c=>c.args.length<=64*7));
});

test('index parity detects missing, altered and untrusted rows without revealing private texts',async()=>{
 const {verifyIndex}=require('../modules/swapp-social-native/relational-index.cjs');
 const state={posts:{p_abc:post()},messages:{m_abc:msg()}};
 function connection({missing=false,altered=false}={}){
  return {execute:async sql=>{
   if(sql.startsWith('SELECT migration_version'))return [[{migration_version:1}]];
   if(sql.includes('FROM swapp_social_native_posts_v2'))return [[missing?[]:[{
    id:'p_abc',payload_json:JSON.stringify(state.posts.p_abc),
    author_id:'u_one',circle_id:null,reply_to_id:null
   }]].flat()];
   if(sql.includes('FROM swapp_social_native_messages_v2'))return [[{
    id:'m_abc',payload_json:altered?'{"wrong":true}':JSON.stringify(state.messages.m_abc),
    conversation_key:'u_one:u_two',sender_id:'u_one',recipient_id:'u_two'
   }]];
   throw Error('Unexpected '+sql);
  }};
 }
 const verified=await verifyIndex(connection(),state);
 assert.equal(verified.ok,true);
 assert.equal((await verifyIndex(connection({missing:true}),state)).ok,false);
 const drift=await verifyIndex(connection({altered:true}),state);
 assert.equal(drift.ok,false);
 assert.equal(drift.messages.mismatched,1);
 assert.doesNotMatch(JSON.stringify(drift),/Message privé|m_abc|u_one/);
});
test('verification requires the migration marker even when source is empty',async()=>{
 const {verifyIndex}=require('../modules/swapp-social-native/relational-index.cjs');
 await assert.rejects(verifyIndex({execute:async()=>[[]]},{posts:{},messages:{}}),/backfill_required/);
});
test('CLI exposes status, apply and verify with consistent transactions and rollback',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const cli=fs.readFileSync(path.join(__dirname,'../tools/swapp-social-relational-migrate.cjs'),'utf8');
 assert.match(cli,/process.argv.includes\('--verify'\)/);
 assert.match(cli,/SET TRANSACTION ISOLATION LEVEL REPEATABLE READ/);
 assert.match(cli,/const checked=await verifyIndex\(conn,snapshot\)/);
 assert.match(cli,/if\(!checked.ok\)throw Error\('social_relational_index_drift'\)/);
 assert.ok(cli.indexOf('if(!checked.ok)throw')<cli.indexOf('await conn.commit()'));
});
