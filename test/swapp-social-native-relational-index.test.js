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
