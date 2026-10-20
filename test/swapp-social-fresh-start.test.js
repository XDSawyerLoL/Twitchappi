'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {FRESH_MARKER,CONFIRM,freshPulseStore,freshSummary,approvedEnvironment,run}=require('../tools/swapp-social-fresh-start');
const source=filename=>fs.readFileSync(path.join(__dirname,'..',filename),'utf8');

test('a fresh SOCIAL contains no historic users, posts or messages but all Pulse collections',()=>{
 const store=freshPulseStore();
 assert.equal(store.swappSocialOrigin,FRESH_MARKER);
 for(const name of ['users','handles','sessions','posts','follows','likes','reposts','bookmarks',
  'circles','circleMembers','notifications','reports','blocks','conversations','messages',
  'quanticChallenges','quanticKeys']){
  assert.deepEqual(store[name],{},name);
 }
 const result=freshSummary();
 assert.equal(result.summary.fresh,true);
 assert.equal(result.summary.counts.users,0);
 assert.equal(result.summary.counts.posts,0);
 assert.equal(result.summary.counts.messages,0);
 assert.equal(JSON.parse(result.verified.serialized).swappSocialOrigin,FRESH_MARKER);
});
test('dry-run requires no database connection and cannot affect Render',async()=>{
 let connections=0;
 const mysql={createPool(){connections++;throw Error('must not connect')}};
 const result=await run([],{}, {mysql});
 assert.equal(result.mode,'dry-run');
 assert.equal(connections,0);
});
test('activation requires a named confirmation and opt-in for fresh storage',async()=>{
 const env={SWAPP_ACCOUNT_STORE:'mysql',SWAPP_SOCIAL_FRESH_START_APPROVED:'1',
  SWAPP_SOCIAL_BACKEND:'render',SWAPP_MYSQL_URL:'mysql://demo@localhost/db'};
 assert.throws(()=>approvedEnvironment({...env,SWAPP_SOCIAL_FRESH_START_APPROVED:'0'}),/explicit_fresh_start_approval_required/);
 assert.throws(()=>approvedEnvironment({...env,SWAPP_ACCOUNT_STORE:'json'}),/swapp_accounts_must_use_mysql/);
 assert.throws(()=>approvedEnvironment({...env,SWAPP_SOCIAL_BACKEND:'mysql'}),/refuse_bootstrap_while_native_backend_active/);
 await assert.rejects(()=>run(['--commit'],env),/fresh_social_history_confirmation_required/);
 assert.equal(CONFIRM,'NEW_SOCIAL_WITHOUT_HISTORY');
});
test('fresh initialization inserts one isolated snapshot, then refuses to overwrite it',async()=>{
 const env={SWAPP_ACCOUNT_STORE:'mysql',SWAPP_SOCIAL_FRESH_START_APPROVED:'1',
  SWAPP_SOCIAL_BACKEND:'render',SWAPP_MYSQL_URL:'mysql://demo@localhost/db'};
 let content=null,writes=0;
 const conn={
  query:async sql=>{assert.match(sql,/CREATE TABLE IF NOT EXISTS swapp_social_native_store/)},
  beginTransaction:async()=>{},
  async execute(sql,args){
   if(sql.includes('FOR UPDATE'))return [content===null?[]:[{data:content}]];
   if(sql.startsWith('INSERT')){writes++;content=args[1];return[{affectedRows:1}]}
   if(sql.startsWith('SELECT'))return[[{data:content}]];
   throw Error('unexpected_sql');
  },commit:async()=>{},rollback:async()=>{},release(){}
 };
 const mysql={createPool(){return{getConnection:async()=>conn,end:async()=>{}}}};
 const first=await run(['--commit','--confirm='+CONFIRM],env,{mysql});
 assert.equal(first.mode,'committed');
 assert.equal(writes,1);
 assert.equal(JSON.parse(content).swappSocialOrigin,FRESH_MARKER);
 await assert.rejects(()=>run(['--commit','--confirm='+CONFIRM],env,{mysql}),
  /destination_already_initialized/);
 assert.equal(writes,1);
});
test('server keeps Render as default and requires a matching store type for MySQL mode',()=>{
 const server=source('server.js');
 const proxy=source('modules/swapp-social-native-proxy.js');
 assert.match(server,/SWAPP_SOCIAL_BACKEND\|\|'render'/);
 assert.match(server,/SWAPP_SOCIAL_FRESH_START_VERIFIED==='1'/);
 assert.match(server,/snapshot_type==='fresh'/);
 assert.match(server,/snapshot_type==='imported'/);
 assert.match(server,/social_storage_not_ready/);
 assert.match(proxy,/cached\?\.backend===upstreamOrigin/);
 assert.match(proxy,/backend:upstreamOrigin/);
});
