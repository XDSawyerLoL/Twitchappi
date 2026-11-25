'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {editorialSignals,validateEditorial,watchCandidates,buildSignalResponse}=require('../modules/swapp-news/editorial-signals');
const catalog=require('../data/swapp-editorial-signals.json');
const sampleTime=new Date('2026-11-25T12:00:00.000Z');

test('rolling SWAPP FLASH catalog loads every reviewed brief without a module-wide failure',()=>{
 for(const item of catalog.items)assert.doesNotThrow(()=>validateEditorial(item),item.id);
 const all=editorialSignals({now:sampleTime,limit:40});
 assert.ok(all.length>0&&all.length<=40);
 assert.equal(new Set(all.map(s=>s.id)).size,all.length);
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
 for(const topic of ['AI','ROBOTICS','FUTURE','GAMING']){
  const all=editorialSignals({now:sampleTime,topic,limit:40});
  assert.ok(all.length>0);
  assert.ok(all.every(item=>item.topics.includes(topic)));
  assert.equal(new Set(all.map(item=>item.id)).size,all.length);
 }
 const robotics=editorialSignals({now:sampleTime,topic:'ROBOTICS',limit:40});
 const ai=editorialSignals({now:sampleTime,topic:'AI',limit:40});
 assert.ok(robotics.some(item=>item.topics.includes('AI')&&ai.some(other=>other.id===item.id)));
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
 assert.equal(output.editorial.length,all.length);
 assert.equal(output.watch.items.length,1);
 assert.equal(output.watch.items[0].verification,'pending_review');
 assert.match(output.disclaimer,/non vérifiés/);
});
test('review timestamps preserve real UTC precision and reject invalid dates',()=>{
 const sample=catalog.items[0];
 for(const reviewedAt of ['2026-11-25','2026-11-25T05:30:00Z','2026-11-25T05:30:00.123Z','2026-11-25T05:30:00.123456Z'])
  assert.doesNotThrow(()=>validateEditorial({...sample,reviewedAt}));
 for(const reviewedAt of ['2026-02-30','2026-11-25T24:00:00Z','2026-11-25T25:30:00Z','2026-11-25T05:60:00Z','2026-11-25T05:30:00','tomorrow'])
  assert.throws(()=>validateEditorial({...sample,reviewedAt}),/invalid_signal_dates/);
 assert.throws(()=>validateEditorial({...sample,sourceDate:'2026-02-30'}),/invalid_signal_dates/);
});
test('publisher allowlists still reject spoofed hosts, credentials and unrelated shared image accounts',()=>{
 const sample=catalog.items[0];
 for(const sourceUrl of ['https://news.xbox.com.evil.invalid/story','https://user:pass@news.xbox.com/story','http://news.xbox.com/story'])
  assert.throws(()=>validateEditorial({...sample,sourceUrl}),/signal_requires_primary_source/);
 assert.throws(()=>validateEditorial({...sample,imageUrl:'https://res.cloudinary.com/unrelated/image/upload/pixel.jpg'}),/invalid_official_signal_image/);
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
