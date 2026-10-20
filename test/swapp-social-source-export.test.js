'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSnapshot,normalizeSource}=require('../tools/swapp-social-render-export');
const {createNativeSocialReadiness}=require('../modules/swapp-social-native-status');
test('source export reads legacy MySQL without changing any row',async()=>{
 let reads=0,writes=0,closed=0;
 const fixture={users:{a:{id:'a'}},handles:{},posts:{},messages:{}};
 const mysql={async createConnection(){return{
  async execute(sql,args){
   if(!/^SELECT data FROM quantic_pulse_store/.test(sql))writes++;
   reads++;assert.deepEqual(args,['pulse']);
   return [[{data:JSON.stringify(fixture)}]];
  },
  async end(){closed++}
 }}};
 const result=await sourceSnapshot({env:{PULSE_DB_HOST:'mysql.internal',PULSE_DB_USER:'dbuser',
  PULSE_DB_NAME:'legacy',PULSE_DB_PASSWORD:'hidden'},deps:{mysql}});
 assert.equal(result.storage,'mysql');
 assert.equal(normalizeSource(result.data).users.a.id,'a');
 assert.equal(reads,1);assert.equal(writes,0);assert.equal(closed,1);
});
test('source export selects Postgres if the original backend does',async()=>{
 let read=0,ended=0;
 const pg={Client:class{async connect(){} async query(sql,args){
  assert.match(sql,/^SELECT data FROM quantic_pulse_store/);assert.deepEqual(args,['pulse']);
  read++;return{rows:[{data:{users:{},posts:{},messages:{},handles:{}}}]}
 }async end(){ended++}}};
 const result=await sourceSnapshot({env:{PULSE_DATABASE_URL:'postgresql://source/private'},
  deps:{pg}});
 assert.equal(result.storage,'postgres');assert.equal(read,1);assert.equal(ended,1);
});
test('readiness checks MySQL with read-only query, caches and reveals no private record',async()=>{
 let connects=0,queries=0,ends=0;
 const fakeMysql={async createConnection(){connects++;return{
  async execute(sql,args){
   queries++;assert.match(sql,/SELECT CHAR_LENGTH\(data\)/);
   assert.deepEqual(args,['pulse']);
   return [[{snapshot_bytes:11234}]];
  },async end(){ends++}
 }}};
 const probe=createNativeSocialReadiness({mysqlFactory:()=>fakeMysql,
  uri:'mysql://user:password@localhost:3306/swapp',now:()=>1000});
 const a=await probe.probe(),b=await probe.probe();
 assert.deepEqual(a,{database_reachable:true,snapshot_present:true});
 assert.deepEqual(b,a);
 assert.equal(connects,1);assert.equal(queries,1);assert.equal(ends,1);
 assert.ok(!Object.keys(a).some(key=>/password|user|record/.test(key)));
});
test('probe fails closed and does not claim an import if no table exists',async()=>{
 const mysql={async createConnection(){return{
  async execute(){throw Error('table missing')},async end(){}
 }}};
 const probe=createNativeSocialReadiness({mysqlFactory:()=>mysql,uri:'mysql://user:password@localhost/db'});
 const state=await probe.probe();
 assert.equal(state.database_reachable,true);
 assert.equal(state.snapshot_present,false);
});
test('server supports an explicit SWAPP-only write freeze during final export',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','server.js'),'utf8');
 assert.match(s,/SWAPP_SOCIAL_MIGRATION_FREEZE==='1'/);
 assert.match(s,/return res\.status\(503\)\.json\(\{error:'social_migration_write_frozen'\}\)/);
 assert.match(s,/SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED==='1'/);
 assert.match(s,/SWAPP_ACCOUNT_STORE\|\|''/);
});
