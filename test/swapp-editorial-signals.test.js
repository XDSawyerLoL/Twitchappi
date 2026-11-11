'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {editorialSignals,validateEditorial,watchCandidates,buildSignalResponse}=require('../modules/swapp-news/editorial-signals');
const sampleTime=new Date('2026-11-11T12:00:00.000Z');

test('SWAPP FLASH contains thirteen verified primary-source briefs, each with specific limits',()=>{
 const all=editorialSignals({now:sampleTime});
 assert.equal(all.length,13);
 assert.equal(new Set(all.map(s=>s.id)).size,13);
 for(const x of all){
  assert.doesNotThrow(()=>validateEditorial(x));
  assert.match(x.sourceUrl,/^https:\/\//);
  assert.ok(x.fact.length>40);
  assert.ok(x.impact.length>20);
  assert.ok(x.caveat.length>20);
  assert.equal(x.verification,'source_primaire_consultee');
  assert.match(x.imageUrl,/^https:\/\//);
  assert.ok(x.imageCredit.length>=8);
 }
});
test('multi-topic signals enrich all topic filters without double-counting the news',()=>{
 const all=editorialSignals({now:sampleTime});
 const count=k=>editorialSignals({now:sampleTime,topic:k}).length;
 assert.equal(count('AI'),11);
 assert.equal(count('ROBOTICS'),7);
 assert.equal(count('FUTURE'),9);
 assert.equal(count('GAMING'),0);
 assert.equal(all.length,13);
});
test('primary source validation rejects unverifiable headlines and malicious destinations',()=>{
 const sample=editorialSignals({now:sampleTime})[0];
 assert.throws(()=>validateEditorial({...sample,sourceUrl:'javascript:alert(1)'}));
 assert.throws(()=>validateEditorial({...sample,sourceUrl:'https://not-a-source.invalid/story'}));
 assert.throws(()=>validateEditorial({...sample,sourceDate:'not-a-date'}));
 assert.throws(()=>validateEditorial({...sample,caveat:''}));
 assert.throws(()=>validateEditorial({...sample,imageUrl:'https://evil.invalid/pixel.png'}));
 assert.throws(()=>validateEditorial({...sample,imageCredit:''}));
 assert.throws(()=>validateEditorial({...sample,imageUrl:null}));
});
test('unreviewed source candidates remain separately identified, not mixed with editorial flashes',async()=>{
 const watch=await watchCandidates({});
 assert.equal(watch.status,'unavailable');
 assert.deepEqual(watch.items,[]);
 const all=editorialSignals({now:sampleTime});
 const output=buildSignalResponse(all,{status:'ready',lastCollectionAt:'2026-11-11T10:00:00Z',items:[
  {id:'a',sourceUrl:all[0].sourceUrl,verification:'pending_review'},
  {id:'b',sourceUrl:'https://official.example/another',verification:'pending_review'}
 ]});
 assert.equal(output.editorial.length,13);
 assert.equal(output.watch.items.length,1);
 assert.equal(output.watch.items[0].verification,'pending_review');
 assert.match(output.disclaimer,/non vérifiés/);
});
test('route precedes native /api/actus/:slug and client remains inside single existing magazine',()=>{
 const root=path.resolve(__dirname,'..');
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const client=fs.readFileSync(path.join(root,'assets/swapp-actus-app.js'),'utf8');
 assert.ok(server.indexOf("app.get('/api/actus/signaux'")>0);
 assert.ok(server.indexOf("app.get('/api/actus/signaux'")<server.indexOf("const newsMysqlUrl="));
 assert.match(client,/swapp-flash-strip/);
 assert.match(client,/swapp-flash-thumb/);
 assert.match(client,/swapp-flash-cards/);
 assert.match(client,/scrollBy/);
 assert.doesNotMatch(client,/SWAPP FLASH · SOURCES PRIMAIRES/);
 assert.match(client,/SWAPP FLASH/);
 assert.match(client,/refreshSignalSection/);
 assert.match(client,/\/api\/actus\/signaux/);
 assert.doesNotMatch(client,/\/tech\/ai|\/tech\/future/);
});
