'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {config,storedType,bootstrapFreshSocial,FRESH_MARKER}=require('../modules/swapp-social-fresh-boot');
const flags={
 SWAPP_SOCIAL_BACKEND:'mysql',
 SWAPP_SOCIAL_FRESH_START_VERIFIED:'1',
 SWAPP_SOCIAL_FRESH_START_APPROVED:'1',
 SWAPP_SOCIAL_FRESH_AUTO_INIT:'1',
 SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED:'0',
 SWAPP_MYSQL_URL:'mysql://user@localhost:3306/database',
 SWAPP_ACCOUNT_STORE:'firestore'
};
function mockDriver(initial=null){
 let row=initial,inserted=0,committed=0,rolledBack=0,closed=0,ddl=0;
 const connection={
  async query(sql){assert.match(sql,/CREATE TABLE IF NOT EXISTS swapp_social_native_store/);ddl++},
  async beginTransaction(){},
  async execute(sql,args){
   assert.deepEqual(args?.slice(0,1),['pulse']);
   if(sql.startsWith('SELECT'))return [row===null?[]:[{data:row}]];
   if(sql.startsWith('INSERT')){
    if(row!==null)throw Error('ER_DUP_ENTRY');
    row=args[1];inserted++;return [{affectedRows:1}];
   }
   throw Error('Unexpected SQL');
  },
  async commit(){committed++},async rollback(){rolledBack++},release(){}
 };
 return{
  driver:{createPool(){return{getConnection:async()=>connection,end:async()=>{closed++}}}},
  stats:()=>({row,inserted,committed,rolledBack,closed,ddl})
 };
}
test('disabled by default and never touches database',async()=>{
 let touched=0;
 const x=await bootstrapFreshSocial({env:{},driver:{createPool(){touched++;throw Error('forbidden')}}});
 assert.deepEqual(x,{state:'not_requested'});assert.equal(touched,0);
});
test('every explicit flag is necessary, but SWAPP identity can remain Firestore',()=>{
 assert.equal(config(flags).requested,true);
 for(const [key,value] of [
  ['SWAPP_SOCIAL_BACKEND','render'],
  ['SWAPP_SOCIAL_FRESH_START_VERIFIED','0'],
  ['SWAPP_SOCIAL_FRESH_START_APPROVED','0'],
  ['SWAPP_SOCIAL_MYSQL_MIGRATION_VERIFIED','1']
 ])assert.throws(()=>config({...flags,[key]:value}),/fresh_social_bootstrap_approval_incomplete/);
 assert.equal(config({...flags,SWAPP_ACCOUNT_STORE:'firestore'}).requested,true);
});
test('fresh store is created only once and preserved on subsequent boot',async()=>{
 const db=mockDriver();
 const first=await bootstrapFreshSocial({env:flags,driver:db.driver});
 assert.equal(first.state,'created_fresh');
 let info=db.stats();
 assert.equal(info.inserted,1);
 assert.equal(JSON.parse(info.row).swappSocialOrigin,FRESH_MARKER);
 const next=await bootstrapFreshSocial({env:flags,driver:db.driver});
 assert.equal(next.state,'already_fresh');
 info=db.stats();
 assert.equal(info.inserted,1);
 assert.equal(info.closed,2);
 assert.equal(info.rolledBack,0);
});
test('historic imported store is never replaced or deleted',async()=>{
 const old=JSON.stringify({users:{},posts:{},messages:{},swappSocialOrigin:'imported'});
 const db=mockDriver(old);
 await assert.rejects(()=>bootstrapFreshSocial({env:flags,driver:db.driver}),/existing_social_snapshot_not_fresh/);
 const info=db.stats();
 assert.equal(info.inserted,0);
 assert.equal(info.row,old);
 assert.equal(info.rolledBack,1);
});
test('garbled existing snapshot is preserved and rejected',()=>{
 assert.throws(()=>storedType('not-json'),/existing_social_snapshot_unreadable/);
 assert.throws(()=>storedType(JSON.stringify({swappSocialOrigin:FRESH_MARKER})),/existing_social_snapshot_invalid/);
});
test('SWAPP stores remain separate and startup mode never silently changes Render defaults',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 assert.match(src,/SWAPP_SOCIAL_BACKEND\|\|'render'/);
 assert.match(src,/SWAPP_SOCIAL_FRESH_AUTO_INIT==='1'/);
 assert.match(src,/const SOCIAL_MYSQL_APPROVED=SOCIAL_MIGRATED_APPROVED!==SOCIAL_FRESH_APPROVED/);
 assert.doesNotMatch(src,/SOCIAL_MYSQL_APPROVED=.*SWAPP_ACCOUNT_STORE/);
});
