'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preparePost,validatePostUrl,createSocialPublisher}=require('../modules/swapp-news/social-publisher');
const article={slug:'phantom-blade-zero-guide',status:'published',title:'Phantom Blade Zero : guide pour débuter',summary:'Conseils de combat et de progression.'};
function mock(){
 const data=new Map(),key=ref=>ref.collection+'/'+ref.id;
 const snapshot=ref=>({id:ref.id,exists:data.has(key(ref)),data:()=>data.get(key(ref))});
 const firestore={
  collection(name){return {doc(id){return {collection:name,id,async get(){return snapshot(this)}}},
   limit(n){return {async get(){return {docs:[...data].filter(([k])=>k.startsWith(name+'/')).slice(0,n).map(([k,v])=>({id:k.split('/')[1],data:()=>v}))}}}}}},
  async runTransaction(fn){return fn({get:async ref=>snapshot(ref),
   create:(ref,v)=>{if(data.has(key(ref)))throw Error('exists');data.set(key(ref),v)},
   update:(ref,v)=>data.set(key(ref),{...data.get(key(ref)),...v})})}
 };
 return {data,firestore};
}
test('builds share intent with unique article URL and no invented media',()=>{
 const p=preparePost(article);assert.equal(p.media,null);assert.match(p.intentUrl,/x.com\/intent\/tweet/);
 const u=new URL(p.intentUrl);assert.equal(u.searchParams.get('url'),p.url);
 assert.equal(u.searchParams.get('text')+'\n'+p.url,p.text);
 assert.ok(p.text.length<280);
});
test('rejects drafts, wrong domains and excessively long inputs',()=>{
 const p=preparePost({...article,title:'🔥'.repeat(800),summary:'Testing'.repeat(200)});
 assert.ok(p.text.length<600);assert.ok(p.intentUrl.length<1800);
 assert.throws(()=>preparePost({...article,status:'draft'}),/not_published/);
 assert.throws(()=>preparePost(article,{baseUrl:'https://evil.example'}),/invalid_origin/);
});
test('validates the linked X post belongs to SWAPP',()=>{
 assert.equal(validatePostUrl('https://twitter.com/swappstreaming/status/123456789012345678'),'https://x.com/swappstreaming/status/123456789012345678');
 for(const u of ['https://x.com/other/status/123456789012345678','https://x.com.evil.test/swappstreaming/status/123456789012345678','javascript:alert(1)'])
  assert.throws(()=>validatePostUrl(u),/invalid_x_post_url/);
});
test('queues once and only records unverified editor reported links',async()=>{
 const {firestore,data}=mock(),publisher=createSocialPublisher({firestore});
 data.set('swapp_news_articles/'+article.slug,article);
 assert.equal(await firestore.runTransaction(tx=>publisher.recordPublication(tx,article,'2026-11-10T00:00:00Z')),true);
 assert.equal(await firestore.runTransaction(tx=>publisher.recordPublication(tx,article,'2026-11-10T00:00:00Z')),false);
 assert.equal((await publisher.queue())[0].status,'pending');
 assert.equal((await publisher.reportManuallyPublished(article.slug,'https://x.com/swappstreaming/status/123456789012345678')).status,'reported');
 assert.equal((await publisher.queue())[0].status,'reported');
 assert.equal(data.get('swapp_news_social_outbox/x-'+article.slug).confirmationMethod,'editor_supplied_url_unverified');
});
