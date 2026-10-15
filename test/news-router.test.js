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
function setup(extra={}){const firestore=mockFirestore(), express=mockExpress();const router=createNewsRouter({express,firestore,isReady:()=>true,requireEditor:(req,res,next)=>req.authorized?next():res.status(403).json({error:'forbidden'}),publicCatalog:{items:[]},...extra});
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
test('un article publié peut être corrigé sans perdre sa date de publication',async()=>{
 const {request,firestore}=setup();
 await request('POST','/api/editor/actus',{body:input});
 const slug='un-grand-jeu-rejoint-la-redaction-swapp';
 await request('POST','/api/editor/actus/:slug/publish',{params:{slug}});
 const previous=firestore.all.get('swapp_news_articles/'+slug).publishedAt;
 const p=await request('PATCH','/api/editor/actus/:slug',{params:{slug},body:{title:'Titre modifié après publication'}});
 assert.equal(p.statusCode,200);
 assert.equal(p.payload.status,'published');
 assert.equal(firestore.all.get('swapp_news_articles/'+slug).publishedAt,previous);
 assert.equal(firestore.all.get('swapp_news_articles/'+slug).title,'Titre modifié après publication');
});
test('un article peut revenir en brouillon sans perdre son contenu',async()=>{
 const {request,firestore}=setup();
 await request('POST','/api/editor/actus',{body:input});
 const slug='un-grand-jeu-rejoint-la-redaction-swapp';
 await request('POST','/api/editor/actus/:slug/publish',{params:{slug}});
 const unpublished=await request('POST','/api/editor/actus/:slug/unpublish',{params:{slug}});
 assert.equal(unpublished.statusCode,200);
 assert.equal(firestore.all.get('swapp_news_articles/'+slug).status,'draft');
 const list=await request('GET','/api/actus');
 assert.equal(list.payload.articles.length,0);
});
test('l’importateur JustPlayer exige un compte éditeur et ne modifie pas les articles lors du scan',async()=>{
 const link='https://justplayer.fr/supporters/posts/266628';
 const {request,firestore}=setup({publicCatalog:{items:[{type:'post',url:link,title:'007 First Light : James Bond réussit son retour',publishedAt:'2026-09-05'}]},
 publicFetch:async()=>({ok:true,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=> '<html><article><p>Une analyse longue, originale et utile consacrée à ce jeu vidéo, à sa jouabilité et ses personnages.</p><p>La rédaction compare plusieurs éléments de l’expérience avec des références pertinentes pour le public.</p></article></html>'})});
 const denied=await request('POST','/api/editor/actus/scan-public',{authorized:false,body:{offset:0}});
 assert.equal(denied.statusCode,403);
 const result=await request('POST','/api/editor/actus/scan-public',{body:{offset:0,limit:1}});
 assert.equal(result.statusCode,200);
 assert.equal(result.payload.total,1);
 assert.equal(firestore.all.size,0);
});

test('ACTUS affiche la découverte des lives même sans article publié',async()=>{
 const {request}=setup();
 const response=await request('GET','/actus');
 assert.equal(response.statusCode,200);
 assert.match(response.payload,/Lis l’actu/);
 assert.match(response.payload,/data-swapp-live-shelf/);
});
test('une chaîne Twitch reste lisible dans SWAPP sans URL arbitraire',async()=>{
 const {request}=setup();
 const ok=await request('GET','/live/twitch/:login',{params:{login:'streamer_2026'}});
 assert.equal(ok.statusCode,200);
 assert.match(ok.payload,/player.twitch.tv/);
 assert.match(ok.payload,/parent=swapp.tv/);
 const bad=await request('GET','/live/twitch/:login',{params:{login:'..'}});
 assert.equal(bad.statusCode,404);
});


test('les anciennes publications ont une fiche SWAPP sans redirection obligatoire',async()=>{
  const entry={type:'post',id:'266628',title:'007 First Light : James Bond réussit son retour',
    url:'https://justplayer.fr/supporters/posts/266628',publishedAt:'2026-09-05'};
  const {request,firestore}=setup({publicCatalog:{items:[entry]},publicFetch:async()=>{throw Error('offline');}});
  const result=await request('GET','/actus/justplayer/:key',{params:{key:'266628'}});
  assert.equal(result.statusCode,200);
  assert.match(result.payload,/Texte complet en cours d’intégration/);
  assert.match(result.payload,/Retour à SWAPP Actualités/);
  assert.equal(firestore.all.size,0);
  const bad=await request('GET','/actus/justplayer/:key',{params:{key:'unknown'}});
  assert.equal(bad.statusCode,404);
});

test('statut édition public ne révèle pas d’articles ou de secrets',async()=>{
  const {request}=setup({canEdit:()=>false});
  const status=await request('GET','/api/editor/actus/access');
  assert.equal(status.statusCode,200);
  assert.deepEqual(status.payload,{authenticated:false,canEdit:false});
});


test('un véritable texte JustPlayer devient un article lisible avec son image dans les API SWAPP',async()=>{
 const item={type:'post',id:'266628',title:'007 First Light : James Bond réussit son retour',
 url:'https://justplayer.fr/supporters/posts/266628',publishedAt:'2026-09-05'};
 const paragraph='<p>James Bond retrouve l’espionnage, les déplacements et les choix du joueur avec IO Interactive dans un cadre spectaculaire et ouvert.</p>';
 const html='<html><head><meta property="og:title" content="'+item.title+'"><meta property="og:image" content="https://cdn.fourthwall.com/007-cover.jpg"></head><div class="post-content prose">'+paragraph.repeat(6)+'</div></html>';
 const {request,firestore}=setup({publicCatalog:{items:[item]},publicFetch:async()=>({
   ok:true,status:200,headers:{get:()=>null},text:async()=>html
 })});
 const list=await request('GET','/api/actus');
 assert.equal(list.statusCode,200);
 assert.equal(list.payload.articles.length,1);
 assert.equal(list.payload.articles[0].slug,'justplayer-266628');
 assert.equal(list.payload.articles[0].image.url,'https://cdn.fourthwall.com/007-cover.jpg');
 const article=await request('GET','/api/actus/:slug',{params:{slug:'justplayer-266628'}});
 assert.equal(article.statusCode,200);
 assert.match(article.payload.body,/James Bond retrouve/);
 assert.equal(firestore.all.size,0);
});

test('première vidéo de vérification : autorisation, brouillon, prévol, publication, galerie et retrait',async()=>{
 const {trailers}=require('../modules/swapp-hubs');
 const video={
  contentType:'trailer',
  title:'CODE VEIN II — bande-annonce officielle (vérification SWAPP)',
  summary:'Bande-annonce Story Trailer de CODE VEIN II — source Bandai Namco Entertainment.',
  body:'Vérification du lecteur vidéo SWAPP avec la bande-annonce officielle Story Trailer de CODE VEIN II.',
  category:'Actualités JV',
  game:'CODE VEIN II',tags:['code vein ii','bande-annonce','jeu vidéo'],
  author:'Sansahd',
  sources:[{url:'https://www.youtube.com/watch?v=Z9SaRLSibak',label:'Bandai Namco Entertainment'}],
  trailerUrl:'https://www.youtube.com/watch?v=Z9SaRLSibak'
 };
 const {request,firestore}=setup();
 const denied=await request('POST','/api/editor/actus/validate',{authorized:false,body:video});
 assert.equal(denied.statusCode,403);
 assert.equal(firestore.all.size,0);
 const incomplete=await request('POST','/api/editor/actus/validate',{
  body:{...video,trailerUrl:null}});
 assert.equal(incomplete.statusCode,422);
 assert.equal(incomplete.payload.valid,false);
 assert.equal(firestore.all.size,0);
 const checked=await request('POST','/api/editor/actus/validate',{body:video});
 assert.equal(checked.statusCode,200);
 assert.equal(checked.payload.valid,true);
 assert.equal(checked.payload.contentType,'trailer');
 assert.equal(firestore.all.size,0);
 const created=await request('POST','/api/editor/actus',{body:video});
 assert.equal(created.statusCode,201);
 const slug=created.payload.slug;
 const stored=firestore.all.get('swapp_news_articles/'+slug);
 assert.equal(stored.status,'draft');
 assert.equal(stored.trailerUrl,video.trailerUrl);
 assert.deepEqual(stored.games,['CODE VEIN II']);
 const before=await request('GET','/api/actus');
 assert.ok(before.payload.articles.every(a=>a.slug!==slug));
 const live=await request('POST','/api/editor/actus/:slug/publish',{params:{slug}});
 assert.equal(live.statusCode,200);
 const published=firestore.all.get('swapp_news_articles/'+slug);
 assert.equal(published.status,'published');
 const publicFeed=await request('GET','/api/actus');
 assert.ok(publicFeed.payload.articles.some(a=>a.slug===slug));
 const card=trailers([published]);
 assert.match(card,/CODE VEIN II/);
 assert.match(card,/data-video-youtube="Z9SaRLSibak"/);
 assert.match(card,/i\.ytimg\.com\/vi\/Z9SaRLSibak/);
 const withdrawn=await request('POST','/api/editor/actus/:slug/unpublish',{params:{slug}});
 assert.equal(withdrawn.statusCode,200);
 assert.equal(firestore.all.get('swapp_news_articles/'+slug).status,'draft');
 const after=await request('GET','/api/actus');
 assert.ok(after.payload.articles.every(a=>a.slug!==slug));
});
