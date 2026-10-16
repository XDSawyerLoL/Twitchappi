'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {injectSpaMetadata,rssXml,registerSeoRoutes}=require('../modules/swapp-seo');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

test('HTML initial includes crawlable, visible editorial content and internal links for public SPA routes',()=>{
 for(const url of ['/','/actus','/decouvrir','/categories','/equipes']){
  const rendered=injectSpaMetadata(html,url);
  assert.match(rendered,/<h1>[^<]+<\/h1>/,url);
  assert.match(rendered,/aria-label="Explorer SWAPP"/,url);
  assert.match(rendered,/<a href="\/actus">|<a href="\/decouvrir">/,url);
  assert.ok(rendered.includes('<link rel="canonical" href="https://swapp.tv'+url+'">'));
  assert.equal((rendered.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(rendered.includes('/index_script.js'),url);
 }
});

test('private routes are noindex and do not receive public fallback copy',()=>{
 const rendered=injectSpaMetadata(html,'/compte');
 assert.match(rendered,/name="robots" content="noindex,nofollow"/);
 assert.doesNotMatch(rendered,/swappSeoIntro/);
});

test('home site schema includes declared brand and no fabricated search endpoint',()=>{
 const rendered=injectSpaMetadata(html,'/');
 assert.match(rendered,/"@type":"WebSite"/);
 assert.match(rendered,/"inLanguage":"fr-FR"/);
 assert.doesNotMatch(rendered,/SearchAction/);
});

test('RSS contains only published, valid, correctly escaped editorials',()=>{
 const rss=rssXml([
  {slug:'jeux-sorties-2026',title:'Jeux & nouveautés',summary:'Info <brut>',status:'published',publishedAt:'2026-10-16T10:00:00Z'},
  {slug:'brouillon-interne',title:'Interne',status:'draft'},
  {slug:'bad/slug',title:'Mauvais',status:'published'}
 ]);
 assert.match(rss,/<rss version="2.0">/);
 assert.match(rss,/Jeux &amp; nouveautés/);
 assert.match(rss,/Info &lt;brut&gt;/);
 assert.match(rss,/https:\/\/swapp\.tv\/actus\/jeux-sorties-2026/);
 assert.doesNotMatch(rss,/brouillon-interne|bad\/slug/);
});

test('RSS and sitemap share one cached article read',async()=>{
 const handlers=new Map();
 const app={get:(url,fn)=>handlers.set(url,fn)};
 let reads=0;
 registerSeoRoutes(app,{getPublished:async()=>{reads++;return [{slug:'jeux-sorties-2026',title:'Une sortie',status:'published'}]}});
 const response=()=>({set(){return this},type(){return this},status(){return this},send(body){this.body=body;return this}});
 const a=response(),b=response();
 await handlers.get('/feed.xml')({},a);
 await handlers.get('/sitemap.xml')({},b);
 assert.equal(reads,1);
 assert.match(a.body,/Une sortie/);
 assert.match(b.body,/jeux-sorties-2026/);
});

test('legacy duplicate public paths redirect to one canonical destination',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(server,/app\.get\(\['\/discover','\/teams'\]/);
 assert.match(server,/res\.redirect\(301,destination\+query\)/);
});

test('html sitemap is linked from home, has valid canonical and omits draft or hostile HTML',()=>{
 const {sitemapHtml,sitemapEntries}=require('../modules/swapp-seo');
 const articles=[
  {slug:'le-nouveau-jeu',status:'published',title:'Les jeux & nouveautés',publishedAt:'2026-10-16T10:00:00Z'},
  {slug:'brouillon',status:'draft',title:'Texte secret'},
  {slug:'strange-title',status:'published',title:'<script>alert(1)</script>'},
  {slug:'bad/slug',status:'published',title:'Invalide'}
 ];
 const page=sitemapHtml(articles);
 assert.match(injectSpaMetadata(html,'/'),/href="\/plan-du-site"/);
 assert.match(page,/<title>Plan du site — SWAPP<\/title>/);
 assert.match(page,/rel="canonical" href="https:\/\/swapp.tv\/plan-du-site"/);
 assert.match(page,/Les jeux &amp; nouveautés/);
 assert.match(page,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(page,/<script>alert\(1\)<\/script>|Texte secret|bad\/slug/);
 assert.ok(sitemapEntries(articles).some(x=>x.loc==='https://swapp.tv/plan-du-site'));
});

test('sitemap, HTML sitemap and RSS share a single concurrent published lookup',async()=>{
 const handlers=new Map();
 let reads=0,unlock;
 const pending=new Promise(resolve=>{unlock=resolve});
 registerSeoRoutes({get:(url,handler)=>handlers.set(url,handler)},{
  getPublished:async()=>{
   reads++;
   await pending;
   return [{slug:'publication-visible',title:'Une actualité',status:'published'}];
  }
 });
 const response=()=>({body:'',set(){return this},type(){return this},status(){return this},send(body){this.body=body;return this}});
 const r1=response(),r2=response(),r3=response();
 const calls=[
  handlers.get('/sitemap.xml')({},r1),
  handlers.get('/feed.xml')({},r2),
  handlers.get('/plan-du-site')({},r3)
 ];
 await Promise.resolve();
 assert.equal(reads,1);
 unlock();
 await Promise.all(calls);
 assert.match(r1.body,/publication-visible/);
 assert.match(r2.body,/publication-visible/);
 assert.match(r3.body,/publication-visible/);
 assert.equal(reads,1);
});

test('Google News sitemap includes only fresh, original, published editorial articles',()=>{
 const {newsSitemapXml,robotsText}=require('../modules/swapp-seo');
 const clock=Date.parse('2026-10-16T12:00:00.000Z');
 const xml=newsSitemapXml([
  {slug:'fresh-editorial',title:'Nouvelle sortie & suite',contentType:'article',status:'published',publishedAt:'2026-10-16T10:00:00.000Z'},
  {slug:'past',title:'Too old',contentType:'article',status:'published',publishedAt:'2026-10-10T10:00:00.000Z'},
  {slug:'imported',title:'Original ancien',contentType:'article',status:'published',publishedAt:'2026-10-16T10:00:00.000Z',originalPublishedAt:'2023-01-01T10:00:00Z'},
  {slug:'private',title:'Privé',contentType:'article',status:'draft',publishedAt:'2026-10-16T10:00:00.000Z'},
  {slug:'video',title:'Vidéo officielle',contentType:'video',status:'published',publishedAt:'2026-10-16T10:00:00.000Z'},
  {slug:'future',title:'Futur',contentType:'article',status:'published',publishedAt:'2026-10-18T10:00:00.000Z'}
 ],clock);
 assert.match(xml,/xmlns:news="http:\/\/www.google.com\/schemas\/sitemap-news\/0.9"/);
 assert.match(xml,/<news:language>fr<\/news:language>/);
 assert.match(xml,/<news:title>Nouvelle sortie &amp; suite<\/news:title>/);
 assert.match(xml,/2026-10-16T10:00:00.000Z/);
 // Older published articles can remain as ordinary URLs, but MUST NOT
 // advertise a fake Google News publication date after migration.
 for(const slug of ['past','imported']){
  const match=xml.match(new RegExp('<url><loc>https://swapp\\.tv/actus/'+slug+'<\\/loc>([\\s\\S]*?)<\\/url>'));
  assert.ok(match,'archived editorial omitted: '+slug);
  assert.doesNotMatch(match[1],/<news:news>/);
 }
 for(const slug of ['private','video','future'])assert.doesNotMatch(xml,new RegExp('/actus/'+slug));
 assert.equal((xml.match(/<news:news>/g)||[]).length,1);
 assert.match(robotsText(),/news-sitemap\.xml/);
});


test('older published editorials keep a valid URL in an otherwise empty Google News sitemap',()=>{
 const {newsSitemapXml}=require('../modules/swapp-seo');
 const clock=Date.parse('2026-10-16T12:00:00Z');
 const archived=[
  {slug:'old-original',status:'published',title:'Ancien article JustPlayer',contentType:'article',
   publishedAt:'2026-10-16T10:00:00Z',originalPublishedAt:'2023-06-01T08:00:00Z'},
  {slug:'old-no-date',status:'published',title:'Ancienne archive',contentType:'article'}
 ];
 const xml=newsSitemapXml(archived,clock);
 assert.match(xml,/<url><loc>https:\/\/swapp\.tv\/actus\/old-original<\/loc><\/url>/);
 assert.match(xml,/<url><loc>https:\/\/swapp\.tv\/actus\/old-no-date<\/loc><\/url>/);
 assert.doesNotMatch(xml,/<news:news>|<news:publication_date>/);
 assert.doesNotMatch(xml,/2026-10-16T10:00:00Z/);
 assert.equal((xml.match(/<url>/g)||[]).length,2);
 // No fabricated URLs when a publisher legitimately has no articles.
 const empty=newsSitemapXml([],clock);
 assert.doesNotMatch(empty,/<url>|<news:news>/);
});

test('Google News metadata never leaks into future, private or imported archive URLs',()=>{
 const {newsSitemapXml}=require('../modules/swapp-seo');
 const clock=Date.parse('2026-10-16T12:00:00Z');
 const published=[
  {slug:'legit-news',status:'published',title:'Actualité & sortie',contentType:'article',publishedAt:'2026-10-16T11:00:00Z'},
  {slug:'legacy-import',status:'published',title:'Article ancien',contentType:'article',
   publishedAt:'2026-10-16T11:00:00Z',originalPublishedAt:'2022-01-01T10:00:00Z'},
  {slug:'draft-hidden',status:'draft',title:'Pas public',contentType:'article',publishedAt:'2026-10-16T11:00:00Z'},
  {slug:'future-dated',status:'published',title:'Dans le futur',contentType:'article',publishedAt:'2026-10-20T11:00:00Z'}
 ];
 const xml=newsSitemapXml(published,clock);
 assert.match(xml,/<news:title>Actualité &amp; sortie<\/news:title>/);
 const oldUrl=xml.match(/<url><loc>https:\/\/swapp\.tv\/actus\/legacy-import<\/loc>(.*?)<\/url>/);
 assert.ok(oldUrl);
 assert.doesNotMatch(oldUrl[1],/news:news/);
 assert.doesNotMatch(xml,/draft-hidden|future-dated/);
 assert.equal((xml.match(/<news:news>/g)||[]).length,1);
});

test('IndexNow exposes only public key and makes a single safe free request for published URLs',async()=>{
 const {INDEXNOW_KEY,INDEXNOW_KEY_PATH,registerSeoRoutes,notifyIndexNow}=require('../modules/swapp-seo');
 const handlers=new Map();
 registerSeoRoutes({get:(url,handler)=>handlers.set(url,handler)});
 const response={set(){return this},status(){return this},type(){return this},send(value){this.body=value;return this}};
 handlers.get(INDEXNOW_KEY_PATH)({},response);
 assert.equal(response.body.trim(),INDEXNOW_KEY);
 const seen=[];
 const result=await notifyIndexNow(['valid-news','valid-news','../../bad'],{
  enabled:true,
  fetchImpl:async(url,options)=>{
   seen.push({url,payload:JSON.parse(options.body)});
   return {status:202};
  }
 });
 assert.equal(result.accepted,true);
 assert.equal(seen.length,1);
 assert.equal(seen[0].url,'https://api.indexnow.org/indexnow');
 assert.deepEqual(seen[0].payload.urlList,['https://swapp.tv/actus/valid-news']);
 assert.equal(seen[0].payload.keyLocation,'https://swapp.tv'+INDEXNOW_KEY_PATH);
 const disabled=await notifyIndexNow(['valid-news'],{enabled:false,fetchImpl:async()=>{throw Error('Unwanted outbound request')}});
 assert.equal(disabled.attempted,false);
 const failed=await notifyIndexNow(['valid-news'],{enabled:true,fetchImpl:async()=>{throw Error('Network down')}});
 assert.equal(failed.attempted,true);
 assert.equal(failed.accepted,false);
});

test('IndexNow runs only on trusted editorial commits and is optional in production',()=>{
 const router=fs.readFileSync(path.join(__dirname,'../modules/swapp-news/router.js'),'utf8');
 assert.match(router,/SWAPP_INDEXNOW_ENABLED/);
 assert.match(router,/process\.env\.NODE_ENV!=='production'/);
 assert.match(router,/!result\.alreadyPublished&&result\.status==='published'/);
 assert.match(router,/newlyPublished\.length/);
 assert.doesNotMatch(router,/setInterval\(/);
});

test('public streamer pages get a unique self-canonical, social preview and true ProfilePage schema',()=>{
 const {injectCreatorMetadata,creatorSitemapXml,robotsText}=require('../modules/swapp-seo');
 const sample={login:'stream_fr',display_name:'Le & créateur <b>',bio:'Je diffuse mes jeux préférés.',avatar_url:'https://cdn.example.test/avatar.png',channel_public:true};
 const output=injectCreatorMetadata(html,sample,'stream_fr');
 assert.match(output,/<title>Le &amp; créateur &lt;b&gt; — Chaîne SWAPP<\/title>/);
 assert.match(output,/<link rel="canonical" href="https:\/\/swapp.tv\/stream_fr">/);
 assert.equal((output.match(/rel="canonical"/g)||[]).length,1);
 assert.match(output,/"@type":"ProfilePage"/);
 assert.match(output,/property="og:image"/);
 assert.doesNotMatch(output,/<b>/);
 assert.doesNotMatch(output,/noindex/);
 const xml=creatorSitemapXml([sample,{...sample,channel_public:false,login:'private_account'},{...sample,login:'stream_fr'}]);
 assert.match(xml,/https:\/\/swapp.tv\/stream_fr/);
 assert.doesNotMatch(xml,/private_account/);
 assert.equal((xml.match(/<url>/g)||[]).length,1);
 assert.match(robotsText(),/creators-sitemap\.xml/);
});

test('unknown and opt-out creator pages remain noindex, never revealing account secrets',()=>{
 const {injectCreatorMetadata}=require('../modules/swapp-seo');
 const user={login:'private_account',channel_public:false,display_name:'Privé',email:'private@example.test',password_hash:'secret'};
 const unseen=injectCreatorMetadata(html,null,'unknown');
 const privateHtml=injectCreatorMetadata(html,user,'private_account');
 for(const page of [unseen,privateHtml]){
  assert.match(page,/name="robots" content="noindex,follow"/);
  assert.doesNotMatch(page,/rel="canonical"/);
  assert.doesNotMatch(page,/private@example\.test|password_hash|secret/);
 }
 const mismatched=injectCreatorMetadata(html,{...user,channel_public:true},'other_account');
 assert.match(mismatched,/noindex,follow/);
});

test('creator SEO reuses loaded server cache, does not fetch external identities',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(server,/async function sendSwappPublicChannelUi/);
 assert.match(server,/injectCreatorMetadata\(html,/);
 assert.match(server,/getCreators:async=>\{/);
 assert.match(server,/return readOryonUsers\(\)\.users\|\|\[\];/);
});

test('an editorial commit refreshes sitemap immediately without paid polling',async()=>{
 const {invalidateSeoCache}=require('../modules/swapp-seo');
 const handlers=new Map();
 let reads=0;
 registerSeoRoutes({get:(route,fn)=>handlers.set(route,fn)},{
  getPublished:async()=>[{slug:reads++===0?'before-news':'after-news',status:'published'}]
 });
 const response=()=>({body:'',set(){return this},type(){return this},status(){return this},send(text){this.body=text;return this}});
 const before=response(),same=response(),after=response();
 await handlers.get('/sitemap.xml')({},before);
 await handlers.get('/sitemap.xml')({},same);
 assert.equal(reads,1);
 assert.equal(before.body,same.body);
 invalidateSeoCache();
 await handlers.get('/sitemap.xml')({},after);
 assert.equal(reads,2);
 assert.match(after.body,/after-news/);
 assert.doesNotMatch(after.body,/before-news/);
 const router=fs.readFileSync(path.join(__dirname,'../modules/swapp-news/router.js'),'utf8');
 assert.match(router,/invalidateSeoCache\(\)/);
});

test('Search Console verification survives alternate Hostinger UI_FILE without duplicate tags',()=>{
 const {injectSpaMetadata,ensureSearchConsoleMeta}=require('../modules/swapp-seo');
 const token='G7mGoV76GdKsvAMEGkyKILyzsiW4U-GXIfuWza9G4N4';
 const otherTemplate='<html><head><title>SWAPP alternate UI</title></head><body>SWAPP</body></html>';
 const homepage=injectSpaMetadata(otherTemplate,'/');
 assert.match(homepage,new RegExp('google-site-verification" content="'+token+'"'));
 assert.ok(homepage.indexOf(token)>homepage.indexOf('<head>'));
 assert.ok(homepage.indexOf(token)<homepage.indexOf('</head>'));
 assert.equal((injectSpaMetadata(homepage,'/').match(/google-site-verification/g)||[]).length,1);
 assert.doesNotMatch(injectSpaMetadata(otherTemplate,'/decouvrir'),/google-site-verification/);
 const existing='<html><head><meta name="google-site-verification" content="another-owner"></head><body></body></html>';
 const joined=ensureSearchConsoleMeta(existing);
 assert.match(joined,/content="another-owner"/);
 assert.match(joined,new RegExp(token));
 const file=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.equal((injectSpaMetadata(file,'/').match(/google-site-verification/g)||[]).length,1);
});
