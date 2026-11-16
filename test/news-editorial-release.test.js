'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadEditorialReleases,createEditorialReleaseSync}=require('../modules/swapp-news/editorial-release-sync');

function mockStore(){
 const records=new Map();
 const clone=data=>JSON.parse(JSON.stringify(data));
 const articles={doc(id){return {id}}};
 const firestore={async runTransaction(fn){
  const pending=[];
  const tx={
   async get(ref){return {exists:records.has(ref.id),data:()=>clone(records.get(ref.id))}},
   create(ref,record){pending.push({kind:'create',ref,record:clone(record)})},
   update(ref,patch){pending.push({kind:'update',ref,patch:clone(patch)})}
  };
  const result=await fn(tx);
  for(const item of pending){
   if(item.kind==='update'){
    if(!records.has(item.ref.id))throw Error('missing record');
    records.set(item.ref.id,{...records.get(item.ref.id),...item.patch});
   }else{
    if(records.has(item.ref.id))throw Error('already exists');
    records.set(item.ref.id,item.record);
   }
  }
  return result;
 }};
 return {records,firestore,articles};
}
test('the release manifest has the three SWAPP news items and official trailers',()=>{
 const articles=loadEditorialReleases();
 assert.ok(articles.length>=3);
 for(const game of ['Cyberpunk 2077','Crimson Desert','Ordinary Oddness']){
  const article=articles.find(a=>a.game===game);
  assert.ok(article,game);
  assert.ok(article.trailerUrl.startsWith('https://www.youtube.com/watch?v='));
  assert.ok(article.sources.length>=1);
 }
});
test('promotes release records to editable published CMS documents exactly once',async()=>{
 const store=mockStore(),releases=loadEditorialReleases();
 const sync=createEditorialReleaseSync({...store,releaseArticles:releases,clock:()=> '2026-10-21T10:00:00.000Z'});
 const [a,b]=await Promise.all([sync.sync(),sync.sync()]);
 assert.equal(a.complete,true);
 assert.equal(b.complete,true);
 assert.equal(store.records.size,releases.length);
 for(const source of releases){
  const row=store.records.get(source.slug);
  assert.equal(row.status,'published');
  assert.equal(row.publishedAt,source.publishedAt);
  assert.equal(row.title,source.title);
  assert.equal(row.revision,1);
  assert.equal(row.provenance,'swapp-editorial-release');
 }
 const again=await sync.sync();
 assert.equal(again.alreadySynced,true);
 assert.equal(again.created,0);
});
test('respects any existing editor revision or withdrawn draft',async()=>{
 const store=mockStore(),releases=loadEditorialReleases();
 store.records.set(releases[0].slug,{slug:releases[0].slug,title:'Titre corrige',status:'published',revision:5});
 store.records.set(releases[1].slug,{slug:releases[1].slug,title:'Article retire',status:'draft',revision:2});
 const sync=createEditorialReleaseSync({...store,releaseArticles:releases});
 const result=await sync.sync();
 assert.equal(result.created,releases.length-2);
 assert.equal(store.records.get(releases[0].slug).title,'Titre corrige');
 assert.equal(store.records.get(releases[0].slug).revision,5);
 assert.equal(store.records.get(releases[1].slug).status,'draft');
 assert.equal(store.records.size,releases.length);
});

test('repairs missing images only on untouched published release records',async()=>{
 const store=mockStore();
 const releases=loadEditorialReleases();
 const withCover=releases.find(a=>a.image?.url&&a.thumbnail?.url);
 assert.ok(withCover,'At least one release must have an official cover');
 const base={slug:withCover.slug,status:'published',revision:1,provenance:'swapp-editorial-release',image:null,thumbnail:null,title:'Original'};
 store.records.set(withCover.slug,base);
 const sync=createEditorialReleaseSync({...store,releaseArticles:[withCover]});
 const result=await sync.sync();
 assert.equal(result.mediaRepaired,1);
 assert.equal(store.records.get(withCover.slug).image.url,withCover.image.url);
 assert.equal(store.records.get(withCover.slug).title,'Original');
 const protectedCases=[{...base,revision:2},{...base,status:'draft'},{...base,provenance:'manual'},{...base,image:{url:'https://example.com/custom.jpg'}}];
 for(const original of protectedCases){
  const local=mockStore();local.records.set(withCover.slug,original);
  const run=createEditorialReleaseSync({...local,releaseArticles:[withCover]});
  const out=await run.sync();
  assert.equal(out.mediaRepaired,0);
  assert.deepEqual(local.records.get(withCover.slug),original);
 }
});
