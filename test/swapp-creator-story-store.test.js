'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCreatorStoryStore}=require('../modules/swapp-creator-story-store');
function harness({limit=0,failInsert=false}={}){
 const calls=[],state={commits:0,rollbacks:0};
 const conn={
  async beginTransaction(){calls.push('begin')},
  async execute(sql,args=[]){
   calls.push(sql);
   if(sql.startsWith('SELECT COUNT(*)'))return [[{total:limit}]];
   if(sql.startsWith('INSERT INTO swapp_creator_stories')&&failInsert)throw Error('db_injection_test');
   if(sql.startsWith('DELETE FROM swapp_creator_stories'))return [{affectedRows:1}];
   return [[{creator_login:'alice'}]];
  },
  async commit(){state.commits++;calls.push('commit')},
  async rollback(){state.rollbacks++;calls.push('rollback')},
  release(){calls.push('release')}
 };
 const pool={
  async query(sql){calls.push(sql);return [{}]},
  async getConnection(){return conn},
  async execute(sql,args){calls.push(sql);return [{affectedRows:1}]},
  async end(){}
 };
 const store=createCreatorStoryStore({uri:'mysql://user:pass@localhost/swapp',
  mysqlFactory:{createPool:()=>pool}});
 return {store,calls,state};
}
test('story publishing acquires a per-creator MySQL lock before count and insert',async()=>{
 const {store,calls,state}=harness();
 const published=await store.publish('alice',{title:'Annonce publique',theme:'glacier'});
 assert.equal(published.title,'Annonce publique');
 assert.match(published.id,/^[a-f0-9]{24}$/);
 const lock=calls.findIndex(x=>x.includes('FOR UPDATE'));
 const count=calls.findIndex(x=>x.includes('SELECT COUNT(*)'));
 const insert=calls.findIndex(x=>x.startsWith('INSERT INTO swapp_creator_stories'));
 assert.ok(lock>=0&&count>lock&&insert>count);
 assert.equal(state.commits,1);assert.equal(state.rollbacks,0);
 assert.ok(calls.some(x=>x.includes('DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY)')));
});
test('story publishing refuses >4 active and rolls back without inserting',async()=>{
 const {store,calls,state}=harness({limit:4});
 await assert.rejects(store.publish('alice',{title:'Annonce publique'}),/story_limit_reached/);
 assert.equal(state.commits,0);assert.equal(state.rollbacks,1);
 assert.equal(calls.filter(x=>x.startsWith('INSERT INTO swapp_creator_stories')).length,0);
});
test('a failed story insert triggers rollback, not a partial story',async()=>{
 const {store,calls,state}=harness({failInsert:true});
 await assert.rejects(store.publish('alice',{title:'Annonce publique'}),/db_injection_test/);
 assert.equal(state.commits,0);assert.equal(state.rollbacks,1);
 assert.ok(calls.includes('release'));
});
test('deletion is scoped to owner login and immutable 24-digit story id',async()=>{
 const {store,calls}=harness();
 assert.equal(await store.remove('alice','bad-id'),false);
 assert.equal(await store.remove('alice','a'.repeat(24)),true);
 assert.ok(calls.some(x=>x.includes('WHERE creator_login=? AND id=?')));
});
