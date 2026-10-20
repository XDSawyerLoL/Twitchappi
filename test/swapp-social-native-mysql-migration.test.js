'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {verifyPulseSnapshot,commitPulseSnapshot}=require('../tools/swapp-social-mysql-import');
const {createInProcessPulseFetch,INTERNAL_ORIGIN}=require('../modules/swapp-social-local-bridge');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function sample(){
 const id='u_'+'a'.repeat(24),other='u_'+'b'.repeat(24);
 const base={version:1,users:{},handles:{},sessions:{secret:'do_not_reuse'},posts:{},follows:{},likes:{},reposts:{},
  bookmarks:{},circles:{},circleMembers:{},notifications:{},reports:{},blocks:{},
  conversations:{},messages:{},quanticChallenges:{secret:{expiresAt:99999999}},quanticKeys:{}};
 base.users[id]={id,handle:'firstuser',passwordSalt:'s',passwordHash:'h',displayName:'First'};
 base.users[other]={id:other,handle:'seconduser',passwordSalt:'s',passwordHash:'h',displayName:'Second'};
 base.handles.firstuser=id;base.handles.seconduser=other;
 base.posts['p_1']={id:'p_1',authorId:id,body:'Bonjour',createdAt:'2026-10-19T10:00:00Z'};
 base.messages['m_1']={id:'m_1',senderId:id,recipientId:other,body:'Secret',createdAt:'2026-10-19T10:00:00Z'};
 base.conversations[[id,other].sort().join(':')]={messageIds:['m_1']};
 base.follows[id]=[other];
 return base;
}
test('valid snapshot retains posts and DMs, but removes active login tokens and temporary challenges',()=>{
 const raw=sample(),verified=verifyPulseSnapshot(raw),imported=JSON.parse(verified.serialized);
 assert.equal(verified.counts.users,2);
 assert.equal(verified.counts.posts,1);
 assert.equal(verified.counts.messages,1);
 assert.equal(imported.messages.m_1.body,'Secret');
 assert.deepEqual(imported.sessions,{});
 assert.deepEqual(imported.quanticChallenges,{});
 assert.ok(raw.sessions.secret);
 assert.match(verified.sha256,/^[a-f0-9]{64}$/);
});
test('orphan posts, broken message references and incomplete exports are rejected',()=>{
 const orphan=sample();orphan.posts.p_1.authorId='unknown';
 assert.throws(()=>verifyPulseSnapshot(orphan),/post_author_missing/);
 const broken=sample();broken.conversations[Object.keys(broken.conversations)[0]].messageIds=['ghost'];
 assert.throws(()=>verifyPulseSnapshot(broken),/conversation_messages_corrupt/);
 const partial=sample();delete partial.messages;
 assert.throws(()=>verifyPulseSnapshot(partial),/missing_pulse_collection_messages/);
});
test('migration inserts exactly once in a transaction, then verifies persisted checksum',async()=>{
 const verified=verifyPulseSnapshot(sample());
 let written='',began=0,commits=0,rollbacks=0,releases=0;
 const conn={
  async query(sql){assert.match(sql,/CREATE TABLE IF NOT EXISTS/)},
  async beginTransaction(){began++},
  async execute(sql,args){
   if(sql.startsWith('SELECT')&&sql.includes('FOR UPDATE'))return[[]];
   if(sql.startsWith('INSERT')){written=args[1];return[{affectedRows:1}]}
   if(sql.startsWith('SELECT'))return[[{data:written}]];
   throw Error('unexpected SQL');
  },
  async commit(){commits++},
  async rollback(){rollbacks++},
  release(){releases++}
 };
 const mysql={createPool(){return{getConnection:async()=>conn,end:async()=>{}}}};
 const result=await commitPulseSnapshot({mysql,uri:'mysql://demo@localhost/db',verified});
 assert.equal(result.sha256,verified.sha256);
 assert.equal(result.imported,true);
 assert.equal(began,1);assert.equal(commits,1);assert.equal(rollbacks,0);assert.equal(releases,1);
});
test('migration never replaces an existing store',async()=>{
 const verified=verifyPulseSnapshot(sample());let rolledBack=false;
 const conn={
  query:async()=>{},beginTransaction:async()=>{},
  execute:async(sql)=>sql.startsWith('SELECT')?[[{data:'old_snapshot'}]]:[{affectedRows:1}],
  commit:async()=>{throw Error('should not commit')},
  rollback:async()=>{rolledBack=true},
  release(){}
 };
 const mysql={createPool(){return{getConnection:async()=>conn,end:async()=>{}}}};
 await assert.rejects(()=>commitPulseSnapshot({mysql,uri:'mysql://demo@localhost/db',verified}),/destination_already_initialized/);
 assert.equal(rolledBack,true);
});
test('internal Pulse adapter refuses third-party hosts and routes',async()=>{
 const fetch=createInProcessPulseFetch({load:async()=>({handlePulse:async(req,res)=>{res.writeHead(200);res.end('{"ok":true}') }})});
 await assert.rejects(()=>fetch('https://quanticminds.onrender.com/api/pulse/health'),/social_internal_destination_denied/);
 await assert.rejects(()=>fetch(INTERNAL_ORIGIN+'/api/private'),/social_internal_destination_denied/);
 const ok=await fetch(INTERNAL_ORIGIN+'/api/pulse/health');
 assert.equal(ok.status,200);assert.equal((await ok.json()).ok,true);
});
test('backend remains on Render unless explicit mode is chosen and verified migration is approved',()=>{
 const server=source('server.js'),proxy=source('modules/swapp-social-native-proxy.js');
 const local=source('modules/swapp-social-native/pulse.mjs');
 assert.match(server,/SWAPP_SOCIAL_BACKEND\|\|'render'/);
 assert.match(server,/SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED==='1'/);
 assert.match(server,/social_migration_not_verified/);
 assert.match(proxy,/upstreamOrigin=SOCIAL_ORIGIN/);
 assert.match(local,/social_mysql_import_required/);
 assert.doesNotMatch(local,/INSERT IGNORE INTO quantic_pulse_store/);
 assert.match(local,/SELECT data FROM swapp_social_native_store/);
});

test('SWAPP native proxy may use ONLY the pinned in-process destination',async()=>{
 const {createSocialNativeProxy}=require('../modules/swapp-social-native-proxy');
 const calls=[];
 const proxy=createSocialNativeProxy(async(url,opts)=>{
  calls.push(url);
  return {status:200,text:async()=>JSON.stringify({ok:true})}
 },{production:true,upstreamOrigin:INTERNAL_ORIGIN});
 const req={method:'GET',path:'/health',headers:{},originalUrl:'/api/pulse/health',session:{}};
 const res={statusCode:0,body:null,set(){return this},status(n){this.statusCode=n;return this},
  json(data){this.body=data;return this}};
 await proxy(req,res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.ok,true);
 assert.deepEqual(calls,[INTERNAL_ORIGIN+'/api/pulse/health']);
 assert.throws(()=>createSocialNativeProxy(async()=>{},{
  upstreamOrigin:'https://attacker.example'}),/invalid_social_upstream_origin/);
});
