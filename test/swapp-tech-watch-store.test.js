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
