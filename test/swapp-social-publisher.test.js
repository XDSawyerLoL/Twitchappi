'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {preparePost,createSocialPublisher}=require('../modules/swapp-news/social-publisher');
const article={slug:'phantom-blade-zero-guide',status:'published',title:'Phantom Blade Zero : guide pour débuter',summary:'Conseils de combat et de progression.'};
test('builds a safe French share message',()=>{
 const p=preparePost(article);
 assert.match(p.text,/https:\/\/swapp.tv\/actus\/phantom-blade-zero-guide/);
 assert.equal(p.media,null);
 assert.ok(p.text.length<=280);
});
test('rejects unpublished articles and foreign origins',()=>{
 assert.throws(()=>preparePost({...article,status:'draft'}),/not_published/);
 assert.throws(()=>preparePost(article,{baseUrl:'https://example.com'}),/invalid_origin/);
});
test('records exactly one event within the editorial transaction',async()=>{
 const docs=new Map();
 const collection=name=>({doc:id=>({id,async get(){return {exists:docs.has(name+id),data:()=>docs.get(name+id)}}})});
 const firestore={collection,runTransaction:async cb=>cb({
  get:async ref=>({exists:docs.has('swapp_news_social_outbox'+ref.id)}),
  create:(ref,data)=>docs.set('swapp_news_social_outbox'+ref.id,data)
 })};
 const p=createSocialPublisher({firestore});
 assert.equal(await firestore.runTransaction(tx=>p.recordPublication(tx,article,'2026-11-10T00:00:00Z')),true);
 assert.equal(await firestore.runTransaction(tx=>p.recordPublication(tx,article,'2026-11-10T00:00:00Z')),false);
});
