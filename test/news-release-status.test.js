'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readEditorialReleaseStates}=require('../modules/swapp-news/editorial-release-sync');

function limitedCollection(){
 let pending=0,peak=0;
 return {get peak(){return peak},doc(slug){return {async get(){
   if(pending>=33)throw Error('Queue limit reached');
   pending++;peak=Math.max(peak,pending);
   await new Promise(resolve=>setImmediate(resolve));
   pending--;
   return {exists:slug!=='missing',data:()=>({status:slug==='withdrawn'?'draft':'published'})};
 }}}};
}

test('diagnostic handles more release rows than the Hostinger connection and queue limits',async()=>{
 const releaseCandidates=Array.from({length:57},(_,i)=>({slug:'article-'+i}));
 const overloaded=limitedCollection();
 await assert.rejects(Promise.all(releaseCandidates.map(a=>overloaded.doc(a.slug).get())),/Queue limit/);
 const articles=limitedCollection();
 const result=await readEditorialReleaseStates({articles,releaseCandidates});
 assert.equal(result.length,57);
 assert.ok(result.every(a=>a.editableInStudio===true));
 assert.equal(articles.peak,1);
 assert.deepEqual(result.map(a=>a.slug),releaseCandidates.map(a=>a.slug));
});

test('reports actual existence without treating withdrawal as absence or exposing draft data',async()=>{
 const articles=limitedCollection();
 assert.deepEqual(await readEditorialReleaseStates({articles,releaseCandidates:[{slug:'published'},{slug:'withdrawn'},{slug:'missing'}]}),[
   {slug:'published',editableInStudio:true},{slug:'withdrawn',editableInStudio:true},{slug:'missing',editableInStudio:false}
 ]);
});

test('database failures remain errors instead of fabricated successful checks',async()=>{
 const articles={doc(){return {get:async()=>{throw Error('database unavailable')}}}};
 await assert.rejects(readEditorialReleaseStates({articles,releaseCandidates:[{slug:'a'}]}),/database unavailable/);
});
