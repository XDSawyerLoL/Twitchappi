'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createNewsRouter}=require('../modules/swapp-news/router');

const input={title:'Un grand jeu rejoint la rédaction SWAPP',body:'Un texte original suffisamment long pour remplir le contrat de publication et illustrer le site SWAPP.',summary:'Le résumé du jeu',sources:[{url:'https://justplayer.fr/supporters/posts/266628',label:'Article JustPlayer'}],legacyUrl:'https://justplayer.fr/supporters/posts/266628',originalPublishedAt:'2026-09-05T10:00:00Z'};
function mockFirestore(){
 const all=new Map();
 const clone=v=>v && JSON.parse(JSON.stringify(v));
 function get(ref){const data=all.get(ref.key);return {exists:!!data,data:()=>clone(data)};}
 function ref(key){return {key, async get(){return get(this)}, async create(data){if(all.has(key)){const e=new Error('already exists');e.code=6;throw e;}all.set(key,clone(data));},async update(data){all.set(key,{...all.get(key),...clone(data)})}};}
 function collection(name){return {
   doc(id){return ref(`${name}/${id}`)},where(key,op,val){return {limit(){return {async get(){return {docs:[...all.entries()].filter(([k,v])=>k.startsWith(name+'/') && v[key]===val).map(([k,v])=>({id:k.split('/').at(-1),data:()=>clone(v)}))}}}}}},
   limit(){return {async get(){return {docs:[...all.entries()].filter(([k])=>k.startsWith(name+'/')).map(([k,v])=>({id:k.split('/').at(-1),data:()=>clone(v)}))}}}}
 };}
 return {all,collection,async runTransaction(cb){const writes=[]; const tx={get:async r=>get(r), create:(r,val)=>writes.push(()=>{if(all.has(r.key)){const e=new Error('exists');e.code=6;throw e;}all.set(r.key,clone(val));}),update:(r,val)=>writes.push(()=>all.set(r.key,{...all.get(r.key),...clone(val)}))}; const out=await cb(tx); for(const write of writes)write();return out;}};
}
function mockExpress(){const routes=[];return {Router:()=>({routes,get:(p,...h)=>routes.push(['GET',p,h]),post:(p,...h)=>routes.push(['POST',p,h]),patch:(p,...h)=>routes.push(['PATCH',p,h])})};}
function setup(){const firestore=mockFirestore(), express=mockExpress();const router=createNewsRouter({express,firestore,isReady:()=>true,requireEditor:(req,res,next)=>req.authorized?next():res.status(403).json({error:'forbidden'})});
 async function request(method,path,{body={},params={},authorized=true}={}){
  const route=router.routes.find(([m,p])=>m===method&&p===path);assert.ok(route,`route ${method} ${path} introuvable`);
  const req={body,params,authorized},res={statusCode:200,headers:{},payload:null,
   status(v){this.statusCode=v;return this;},json(v){this.payload=v;return this;},send(v){this.payload=v;return this;},type(v){this.headers.type=v;return this;},set(k,v){this.headers[k]=v;return this;}};
  async function nextAt(i){const h=route[2][i];if(!h)return;let nextCalled=false,nextErr=null;await h(req,res,e=>{nextErr=e||null;nextCalled=true;});if(nextErr)throw nextErr;if(nextCalled)await nextAt(i+1);}
  await nextAt(0);return res;
 }
 return {request,firestore};}

test('le CMS interdit toute écriture éditoriale à un visiteur',async()=>{
 const {request,firestore}=setup();const res=await request('POST','/api/editor/actus',{authorized:false,body:input});
 assert.equal(res.statusCode,403);assert.equal(firestore.all.size,0);
});
test('un brouillon validé est invisible publiquement',async()=>{
 const {request}=setup();const created=await request('POST','/api/editor/actus',{body:input});assert.equal(created.statusCode,201);
 const list=await request('GET','/api/actus');assert.equal(list.payload.articles.length,0);
});
test('publication transactionnelle : article public et événement social en pause',async()=>{
 const {request,firestore}=setup();await request('POST','/api/editor/actus',{body:input});
 const slug='un-grand-jeu-rejoint-la-redaction-swapp';
 const pub=await request('POST','/api/editor/actus/:slug/publish',{params:{slug}});
 assert.equal(pub.statusCode,200);assert.equal(pub.payload.status,'published');assert.equal(pub.payload.social,'paused');
 const event=firestore.all.get(`swapp_news_outbox/article_${slug}_r1`);
 assert.equal(event.status,'paused');assert.deepEqual(event.channels,[]);
 const again=await request('POST','/api/editor/actus/:slug/publish',{params:{slug}});
 assert.equal(again.payload.alreadyPublished,true);assert.equal(firestore.all.size,2);
 const listing=await request('GET','/actus');assert.match(listing.payload,/SWAPP/);assert.match(listing.payload,/Un grand jeu/);
});
test('import JustPlayer en dry-run ne modifie pas Firestore',async()=>{
 const {request,firestore}=setup();const r=await request('POST','/api/editor/actus/import',{body:{articles:[input]}});
 assert.equal(r.payload.dryRun,true);assert.equal(firestore.all.size,0);
});
test('import définitif conserve date et ancienne URL, puis bloque les doublons',async()=>{
 const {request,firestore}=setup();const opts={body:{articles:[input],dryRun:false,publish:true}};
 const first=await request('POST','/api/editor/actus/import',opts);
 assert.equal(first.statusCode,201);assert.equal(first.payload.results[0].status,'published');
 const item=firestore.all.get('swapp_news_articles/un-grand-jeu-rejoint-la-redaction-swapp');
 assert.equal(item.publishedAt,'2026-09-05T10:00:00.000Z');assert.equal(item.legacyUrl,input.legacyUrl);
 const next=await request('POST','/api/editor/actus/import',opts);
 assert.equal(next.payload.results[0].status,'skipped_existing');assert.equal(firestore.all.size,3);
});
test('import exige une URL JustPlayer valide et des sources pour publication',async()=>{
 const {request,firestore}=setup();const bad=await request('POST','/api/editor/actus/import',{body:{articles:[{...input,legacyUrl:'https://evil.com/supporters/posts/266628'}]}});
 assert.equal(bad.statusCode,400);
 const noSources=await request('POST','/api/editor/actus/import',{body:{articles:[{...input,sources:[]}],publish:true}});
 assert.equal(noSources.statusCode,400);assert.equal(firestore.all.size,0);
});
test('un article publié ne peut pas être modifié par PATCH',async()=>{
 const {request}=setup();await request('POST','/api/editor/actus',{body:input});const slug='un-grand-jeu-rejoint-la-redaction-swapp';await request('POST','/api/editor/actus/:slug/publish',{params:{slug}});
 const p=await request('PATCH','/api/editor/actus/:slug',{params:{slug},body:{title:'Titre modifié après publication'}});
 assert.equal(p.statusCode,409);
});