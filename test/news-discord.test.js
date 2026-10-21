'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {isDiscordWebhook,buildDiscordMessage,createDiscordPublisher}=require('../modules/swapp-news/discord-publisher');
const VALID='https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const article={
 slug:'nouvelle-actus-jeu',title:'SWAPP annonce un nouveau jeu',summary:'Une annonce officielle avec gameplay, date et plateformes.',
 game:'Le Jeu',status:'published',publishedAt:'2026-10-21T11:00:00Z',
 trailerUrl:'https://www.youtube.com/watch?v=mOMUnP5fAdo'
};
function db(){
 const records=new Map(),clone=x=>JSON.parse(JSON.stringify(x));
 const doc=key=>({id:key.split('/').at(-1),async get(){return {exists:records.has(key),data:()=>clone(records.get(key))}},
  async update(patch){records.set(key,{...records.get(key),...clone(patch)})}});
 const collection=name=>({doc(id){return doc(name+'/'+id)},where(field,op,value){return {limit(){return {async get(){
  return {docs:[...records.entries()].filter(([k,v])=>k.startsWith(name+'/')&&v[field]===value)
   .map(([key,v])=>({id:key.slice(name.length+1),data:()=>clone(v)}))};
 }}}}}});
 const firestore={collection,async runTransaction(fn){
  const pending=[];
  const tx={
   get:ref=>ref.get(),
   create(ref,data){pending.push(()=>{const key='swapp_news_discord_outbox/'+ref.id;if(records.has(key))throw Error('exists');records.set(key,clone(data))})},
   update(ref,data){pending.push(()=>{const key='swapp_news_discord_outbox/'+ref.id;records.set(key,{...records.get(key),...clone(data)})})}
  };
  const outcome=await fn(tx);
  for(const op of pending)op();
  return outcome;
 }};
 return {records,firestore,articles:collection('swapp_news_articles')};
}
test('only Discord webhook endpoints are accepted, not arbitrary URLs',()=>{
 assert.equal(isDiscordWebhook(VALID),true);
 assert.equal(isDiscordWebhook('https://evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz'),false);
 assert.equal(isDiscordWebhook('http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz'),false);
 assert.equal(isDiscordWebhook(VALID+'?token=abc'),false);
});
test('rich article embed includes SWAPP link, original video thumbnail, and no mass ping',()=>{
 const m=buildDiscordMessage(article);
 assert.equal(m.embeds[0].url,'https://swapp.tv/actus/nouvelle-actus-jeu');
 assert.match(m.embeds[0].image.url,/i\.ytimg\.com\/vi\/mOMUnP5fAdo/);
 assert.deepEqual(m.allowed_mentions,{parse:[]});
 assert.match(m.embeds[0].description,/annonce officielle/);
});
test('disabled webhook never calls Discord but still queues newly published article',async()=>{
 const store=db();
 const publisher=createDiscordPublisher({...store,env:{NODE_ENV:'production'},fetchImpl:()=>{throw Error('Unexpected network access')}});
 store.records.set('swapp_news_articles/'+article.slug,article);
 await store.firestore.runTransaction(tx=>publisher.recordPublication(tx,article,'2026-10-21T11:00:00Z'));
 assert.equal(publisher.status().enabled,false);
 assert.deepEqual(await publisher.processQueue(),{enabled:false});
 assert.equal(store.records.get('swapp_news_discord_outbox/'+article.slug).status,'pending');
});
test('confirmed Discord delivery has a persisted message id and no duplicates',async()=>{
 const store=db();
 store.records.set('swapp_news_articles/'+article.slug,article);
 let calls=0;
 const publisher=createDiscordPublisher({...store,env:{NODE_ENV:'production',SWAPP_DISCORD_WEBHOOK_URL:VALID},
  fetchImpl:async(url,opt)=>{calls++;assert.match(url,/\?wait=true$/);assert.equal(opt.method,'POST');
   assert.deepEqual(JSON.parse(opt.body).allowed_mentions,{parse:[]});
   return {ok:true,status:200,json:async()=>({id:'987654321098765432'})}},
  clock:()=>new Date('2026-10-21T11:00:00Z').getTime()
 });
 await store.firestore.runTransaction(tx=>publisher.recordPublication(tx,article,'2026-10-21T11:00:00Z'));
 await store.firestore.runTransaction(tx=>publisher.recordPublication(tx,article,'2026-10-21T11:00:01Z'));
 assert.equal(store.records.size,2);
 const once=await publisher.processQueue();
 assert.equal(once.processed,1);
 assert.equal(store.records.get('swapp_news_discord_outbox/'+article.slug).status,'sent');
 assert.equal(store.records.get('swapp_news_discord_outbox/'+article.slug).messageId,'987654321098765432');
 await publisher.processQueue();
 assert.equal(calls,1);
});
test('withdrawn article is not advertised, even with pending event',async()=>{
 const store=db();
 store.records.set('swapp_news_articles/'+article.slug,{...article,status:'draft'});
 const publisher=createDiscordPublisher({...store,env:{NODE_ENV:'production',SWAPP_DISCORD_WEBHOOK_URL:VALID},
  fetchImpl:()=>{throw Error('Must not send')},clock:()=>new Date('2026-10-21T11:00:00Z').getTime()});
 await store.firestore.runTransaction(tx=>publisher.recordPublication(tx,article,'2026-10-21T11:00:00Z'));
 const result=await publisher.processQueue();
 assert.equal(result.processed,1);
 assert.equal(store.records.get('swapp_news_discord_outbox/'+article.slug).status,'cancelled');
});
