'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assertCandidate,saveCandidates,withWatchLock}=require('../modules/swapp-tech-watch-store');
const candidate={id:'a'.repeat(20),section:'IA',source:'Official',title:'New research',url:'https://example.org/research',sourcePublishedAt:'2026-11-10T12:00:00Z'};
test('candidate validation rejects unsafe URLs',()=>{
 assert.doesNotThrow(()=>assertCandidate(candidate));
 assert.throws(()=>assertCandidate({...candidate,url:'javascript:alert(1)'}));
 assert.throws(()=>assertCandidate({...candidate,section:'Gaming'}));
});
test('upsert never changes editorial status',async()=>{
 const queries=[];
 const pool={query:async sql=>{queries.push(sql);return [[]]},execute:async(sql,params)=>{queries.push(sql);assert.equal(params[0],candidate.id);return [[]]}};
 assert.equal(await saveCandidates(pool,[candidate]),1);
 assert.match(queries[1],/ON DUPLICATE KEY UPDATE last_seen_at/);
 assert.doesNotMatch(queries[1],/UPDATE status/);
});
test('database lock skips concurrent instances',async()=>{
 let released=false;
 const pool={getConnection:async()=>({query:async()=>[[{acquired:0}]],release(){released=true;}})};
 const result=await withWatchLock(pool,()=>{throw Error('must not run')});
 assert.equal(result.skipped,'another_instance_running');assert.equal(released,true);
});

test('cooldown is shared between workers after the MySQL advisory lock is released',async()=>{
 let last=0,executions=0,releases=0;
 const conn={
  async query(sql){
   if(sql.startsWith('SELECT GET_LOCK'))return [[{acquired:1}]];
   if(sql.startsWith('SELECT RELEASE_LOCK')){releases++;return [[]];}
   if(sql.startsWith('CREATE TABLE'))return [[]];
   throw Error('unexpected query '+sql);
  },
  async execute(sql,params){
   if(sql.startsWith('SELECT last_started_ms'))return [[last?{last_started_ms:last}:undefined].filter(Boolean)];
   if(sql.startsWith('INSERT INTO swapp_tech_watch_schedule')){last=params[1];return [[]];}
   throw Error('unexpected execute '+sql);
  },
  release(){}
 };
 const pool={getConnection:async()=>conn},run=()=>{executions++;return {saved:1};};
 assert.deepEqual(await withWatchLock(pool,run,{intervalMs:3600000,nowMs:()=>10000000}),{saved:1});
 assert.deepEqual(await withWatchLock(pool,run,{intervalMs:3600000,nowMs:()=>10010000}),{skipped:'recently_collected'});
 assert.deepEqual(await withWatchLock(pool,run,{intervalMs:3600000,nowMs:()=>13600000}),{saved:1});
 assert.equal(executions,2);
 assert.equal(releases,3);
});
