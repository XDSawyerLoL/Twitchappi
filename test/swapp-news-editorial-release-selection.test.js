'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {selectEditorialReleaseCandidates}=require('../modules/swapp-news/editorial-release-selection');
const old={slug:'old-news',status:'published',publishedAt:'2026-10-25T08:00:00.000Z'};
const fresh={slug:'new-news',status:'published',publishedAt:'2026-11-03T07:30:00.000Z'};
const withdrawn={slug:'withdrawn',status:'draft',publishedAt:'2026-11-04T07:30:00.000Z'};
test('before historical migration, MySQL may adopt ONLY approved post-cutover releases',()=>{
 assert.deepEqual(selectEditorialReleaseCandidates([old,fresh,withdrawn],{mysqlMode:true,migrationVerified:false}),[fresh]);
});
test('after verified migration, older release records are allowed, with CMS tombstones still authoritative',()=>{
 assert.deepEqual(selectEditorialReleaseCandidates([old,fresh],{mysqlMode:true,migrationVerified:true}),[old,fresh]);
});
test('Firestore retains its original complete list semantics',()=>{
 assert.deepEqual(selectEditorialReleaseCandidates([old,fresh],{mysqlMode:false,migrationVerified:false}),[old,fresh]);
});
