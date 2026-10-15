'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {publicArticle,nativeSlug,legacyDraft}=require('../modules/swapp-news/editorial-identity');
const {createNewsRouter}=require('../modules/swapp-news/router');
const {renderStudio,js:studioJs}=require('../modules/swapp-news/editor-ui');
const {assertArticle}=require('../modules/swapp-news/article-core');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');

const item={id:'266628',type:'post',title:'007 First Light : James Bond réussit son retour',
 url:'https://justplayer.fr/supporters/posts/266628',publishedAt:'2026-09-05'};
const body='<p>IO Interactive redéfinit les sensations du jeu d’espionnage avec des missions ambitieuses et une liberté accrue.</p>'.repeat(8);
const html='<html><head><meta property="og:title" content="'+item.title+'"></head><div class="post-content prose"><h2>Un vrai Bond jouable</h2>'+body+'</div></html>';
function makeDB(){
 const records=new Map();
 const clone=value=>value===undefined?value:JSON.parse(JSON.stringify(value));
 const ref=key=>({key,async get(){return {exists:records.has(key),data:()=>clone(records.get(key))}}});
 const collection=name=>({
  doc:id=>ref(name+'/'+id),
  limit:()=>({get:async()=>({docs:[...records.entries()].filter(([k])=>k.startsWith(name+'/')).map(([k,v])=>({data:()=>clone(v)}))})}),
  where:(field,op,value)=>({limit:()=>({get:async()=>({docs:[...records.entries()].filter(([k,v])=>k.startsWith(name+'/')&&v[field]===value).map(([k,v])=>({data:()=>clone(v)}))})})})
 });
 return {records,collection,runTransaction:async fn=>{
  const writes=[];const tx={
    get:async r=>r.get(),
    create:(r,value)=>writes.push(()=>{if(records.has(r.key))throw Error('existing');records.set(r.key,clone(value))}),
    update:(r,value)=>writes.push(()=>records.set(r.key,{...records.get(r.key),...clone(value)}))
  };
  const result=await fn(tx);for(const write of writes)write();return result;
 }};
}
function setup(){
 const db=makeDB(),routes=[];
 const express={Router:()=>({routes,
  get:(path,...handlers)=>routes.push({method:'GET',path,handlers}),
  post:(path,...handlers)=>routes.push({method:'POST',path,handlers}),
  patch:(path,...handlers)=>routes.push({method:'PATCH',path,handlers})
 })};
 createNewsRouter({express,firestore:db,requireEditor:(req,res,next)=>req.authorized?next():res.status(403).json({error:'forbidden'}),
  publicCatalog:{items:[item]},publicFetch:async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>html})});
 async function request(method,path,{body={},params={},authorized=true}={}){
  const route=routes.find(r=>r.method===method&&r.path===path);
  assert.ok(route,'missing route '+method+' '+path);
  const req={params,body,authorized,session:{}},res={statusCode:200,payload:null,headers:{},
   status(n){this.statusCode=n;return this},json(obj){this.payload=obj;return this},
   send(x){this.payload=x;return this},set(k,v){this.headers[k]=v;return this},
   type(type){this.headers.type=type;return this},
   redirect(code,path){this.statusCode=code;this.headers.Location=path;return this}
  };
  async function nextAt(i){const handler=route.handlers[i];if(!handler)return;
   let nextCalled=false,nextErr;await handler(req,res,e=>{nextCalled=true;nextErr=e});
   if(nextErr)throw nextErr;if(nextCalled)await nextAt(i+1);
  }
  await nextAt(0);return res;
 }
 return {db,request};
}
test('public identity is SWAPP while source URL and original people stay intact',()=>{
 const raw={slug:'justplayer-266628',title:item.title,category:'JustPlayer',
  author:'Rédaction JustPlayer',legacyUrl:item.url,sourceAuthor:'Rédaction JustPlayer'};
 const shown=publicArticle(raw);
 assert.equal(shown.category,'Actualités JV');
 assert.equal(shown.author,'Rédaction SWAPP');
 assert.equal(shown.legacyUrl,item.url);
 assert.equal(raw.author,'Rédaction JustPlayer'); // stored original is untouched
 assert.equal(publicArticle({...raw,author:'Alice Durand'}).author,'Alice Durand');
 assert.equal(nativeSlug(raw),'266628');
 assert.equal(legacyDraft(raw).status,'draft');
 const rendered=renderNewsStory({...shown,body:'Un article complet '.repeat(30)});
 assert.match(rendered,/Rédaction SWAPP/);
 assert.doesNotMatch(rendered,/Par <strong>Rédaction JustPlayer<\/strong>/);
});
test('publication from historical source must not use unverified image rights',()=>{
 const article={title:'Article SWAPP avec une couverture à vérifier',body:'Une analyse complète '.repeat(20),
  sources:[{url:'https://example.com/story',label:'Source'}],
  image:{url:'https://example.com/art.jpg',credit:'Studio du jeu',rights:'Droits à vérifier'}};
 assert.throws(()=>assertArticle(article,{publish:true}),/droits vérifiés/);
 assert.doesNotThrow(()=>assertArticle(article,{publish:false}));
});
test('Studio contains transfer tools, without a public JustPlayer section',()=>{
 const page=renderStudio();
 assert.doesNotThrow(()=>new Function(studioJs));
 assert.match(page,/Finaliser la reprise/);
 assert.match(page,/id="ed-legacy-progress"/);
 assert.match(page,/id="ed-legacy-results"/);
 assert.match(studioJs,/async function refreshLegacy\(/);
 assert.match(studioJs,/api\/editor\/actus\/adopt/);
 assert.doesNotMatch(page,/>⇩ Importer JustPlayer</);
});
test('editor adopts recoverable article in a protected and editable native draft',async()=>{
 const {request,db}=setup();
 const pre=await request('GET','/api/actus');
 assert.equal(pre.payload.articles.length,1);
 assert.equal(pre.payload.articles[0].category,'Actualités JV');
 assert.equal(pre.payload.articles[0].slug,'266628');
 const alreadyPublic=await request('GET','/api/actus/:slug',{params:{slug:'266628'}});
 assert.equal(alreadyPublic.statusCode,200);
 assert.equal(alreadyPublic.payload.slug,'266628');
 const status=await request('GET','/api/editor/actus/legacy-status');
 assert.equal(status.payload.pending.length,1);
 assert.equal(status.payload.readyToClose,false);
 const denied=await request('POST','/api/editor/actus/adopt',{authorized:false,body:{slug:'justplayer-266628'}});
 assert.equal(denied.statusCode,403);
 const invalid=await request('POST','/api/editor/actus/adopt',{body:{slug:'not-in-catalog'}});
 assert.equal(invalid.statusCode,400);
 const adopted=await request('POST','/api/editor/actus/adopt',{body:{slug:'justplayer-266628'}});
 assert.equal(adopted.statusCode,201);
 assert.equal(adopted.payload.slug,'266628');
 const stored=db.records.get('swapp_news_articles/266628');
 assert.equal(stored.status,'draft');
 assert.equal(stored.legacyUrl,item.url);
 assert.equal(stored.author,'Rédaction SWAPP');
 assert.ok(stored.body.length>220);
 const again=await request('POST','/api/editor/actus/adopt',{body:{slug:'justplayer-266628'}});
 assert.equal(again.payload.status,'already_exists');
 const editor=await request('GET','/api/editor/actus');
 assert.equal(editor.payload.articles.length,1);
 const changed=await request('PATCH','/api/editor/actus/:slug',{params:{slug:'266628'},body:{summary:'Nouvelle analyse écrite dans SWAPP'}});
 assert.equal(changed.statusCode,200);
 assert.equal(db.records.get('swapp_news_articles/266628').summary,'Nouvelle analyse écrite dans SWAPP');
});
test('after publication SWAPP takes over the canonical URL; withdrawal cannot resurrect the archive',async()=>{
 const {request,db}=setup();
 await request('GET','/api/actus');
 await request('POST','/api/editor/actus/adopt',{body:{slug:'justplayer-266628'}});
 const publish=await request('POST','/api/editor/actus/:slug/publish',{params:{slug:'266628'}});
 assert.equal(publish.statusCode,200);
 const api=await request('GET','/api/actus/:slug',{params:{slug:'justplayer-266628'}});
 assert.equal(api.payload.slug,'266628');
 const seo=await request('GET','/actus/:slug',{params:{slug:'justplayer-266628'}});
 assert.equal(seo.statusCode,301);
 assert.equal(seo.headers.Location,'/actus/266628');
 const feed=await request('GET','/api/actus');
 assert.equal(feed.payload.articles.length,1);
 assert.equal(feed.payload.articles[0].slug,'266628');
 const withdraw=await request('POST','/api/editor/actus/:slug/unpublish',{params:{slug:'266628'}});
 assert.equal(withdraw.statusCode,200);
 assert.equal(db.records.get('swapp_news_articles/266628').legacySuppressRecovery,true);
 const after=await request('GET','/api/actus');
 assert.equal(after.payload.articles.length,0);
 const stale=await request('GET','/api/actus/:slug',{params:{slug:'justplayer-266628'}});
 assert.equal(stale.statusCode,404);
});
