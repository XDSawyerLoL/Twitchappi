'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {CORE_PATHS,sitemapEntries,sitemapXml,robotsText,registerSeoRoutes,injectSpaMetadata}=require('../modules/swapp-seo');
const root=path.resolve(__dirname,'..');

function appHarness({articles=[],fail=false}={}){
 const handlers=new Map();
 const app={get:(route,fn)=>handlers.set(route,fn)};
 let reads=0,clock=1_000_000;
 registerSeoRoutes(app,{now:()=>clock,getPublished:async()=>{reads++;if(fail)throw Error('Firestore offline');return articles}});
 const response=()=>{
  const r={headers:{},statusCode:200,body:'',
   set(k,v){this.headers[k]=v;return this},
   type(value){this.headers['Content-Type']=value;return this},
   status(value){this.statusCode=value;return this},
   send(body){this.body=body;return this}
  };
  return r;
 };
 return {handlers,response,reads:()=>reads,advance:ms=>{clock+=ms}};
}
test('robots excludes private and API routes and names the canonical sitemap',()=>{
 const text=robotsText();
 assert.match(text,/User-agent: \*/);
 assert.match(text,/Disallow: \/api\//);
 // Account routes are crawlable so the server's noindex tag can be honored.
 assert.doesNotMatch(text,/Disallow: \/compte/);
 assert.match(text,/Disallow: \/actus\/studio/);
 assert.match(text,/Sitemap: https:\/\/swapp\.tv\/sitemap\.xml/);
 const h=appHarness(),res=h.response();
 h.handlers.get('/robots.txt')({},res);
 assert.equal(res.statusCode,200);
 assert.match(res.headers['Content-Type'],/text\/plain/);
 assert.equal(res.body,text);
});
test('sitemap exposes stable public routes and only actual published slugs',()=>{
 const data=[
  {slug:'actualite-de-jeux',status:'published',publishedAt:'2026-10-15T08:00:00Z'},
  {slug:'brouillon-prive',status:'draft'},
  {slug:'gestionnaire',status:'review'},
  {slug:'actualite-de-jeux',status:'published'},
  {slug:'../unsafe',status:'published'},
  {slug:'another-game',status:'published',updatedAt:'invalid date'},
  {slug:'preview-only',status:'archived'}
 ];
 const entries=sitemapEntries(data);
 assert.equal(entries.length,CORE_PATHS.length+2);
 assert.equal(entries.filter(v=>v.loc.endsWith('/actus/actualite-de-jeux')).length,1);
 const xml=sitemapXml(data);
 assert.match(xml,/https:\/\/swapp\.tv\/actus\/actualite-de-jeux/);
 assert.match(xml,/<lastmod>2026-10-15<\/lastmod>/);
 assert.doesNotMatch(xml,/brouillon-prive|preview-only|\.\.\/unsafe/);
 assert.doesNotMatch(xml,/compte|\/api\/|\/studio/);
 assert.equal(xml.includes('<urlset'),true);
});
test('sitemap only reads Firestore once within the six-hour cache window',async()=>{
 const h=appHarness({articles:[{slug:'un-jeu-sorti',status:'published'}]});
 const first=h.response(),second=h.response();
 await h.handlers.get('/sitemap.xml')({},first);
 await h.handlers.get('/sitemap.xml')({},second);
 assert.equal(h.reads(),1);
 assert.equal(first.statusCode,200);
 assert.match(first.headers['Content-Type'],/application\/xml/);
 assert.equal(first.body,second.body);
 h.advance(6*60*60*1000+1);
 await h.handlers.get('/sitemap.xml')({},h.response());
 assert.equal(h.reads(),2);
});
test('Firestore outages never make sitemap fail with 500',async()=>{
 const h=appHarness({fail:true});
 const first=h.response(),second=h.response();
 const originalWarn=console.warn;console.warn=()=>{};
 try{
  await h.handlers.get('/sitemap.xml')({},first);
  await h.handlers.get('/sitemap.xml')({},second);
 }finally{console.warn=originalWarn}
 assert.equal(h.reads(),1);
 assert.equal(first.statusCode,200);
 assert.match(first.body,/https:\/\/swapp\.tv\/actus/);
 assert.doesNotMatch(first.body,/<loc>.*brouillon/);
});
test('home, Discover, Actualité have unique canonical and preview metadata',()=>{
 const html='<html><head><title>Ancien titre</title></head><body>SWAPP</body></html>';
 for(const pathName of ['/','/decouvrir','/actus']){
  const out=injectSpaMetadata(html,pathName);
  assert.match(out,/<meta name="description"/);
  assert.ok(out.includes('<link rel="canonical" href="https://swapp.tv'+pathName+'">'));
  assert.ok(out.includes('<meta property="og:title"'));
  assert.equal((out.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(out.includes('SWAPP'));
 }
});
test('account and administration screens are not indexable',()=>{
 const html='<html><head><title>Compte</title></head></html>';
 for(const route of ['/compte','/gestionnaire','/admin','/reset-password/secret-token']){
  const out=injectSpaMetadata(html,route);
  assert.match(out,/name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(out,/rel="canonical"/);
  assert.ok(!out.includes('secret-token'));
 }
 assert.equal(injectSpaMetadata(html,'/unknown-creator'),html);
});
test('SEO module is wired to the deployed server without external API',()=>{
 const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 assert.match(server,/registerSeoRoutes\(app/);
 assert.match(server,/sendSwappUi\(res\)/);
 assert.match(server,/injectSpaMetadata\(html,res\.req\?\.path\|\|'\/'\)/);
 assert.match(server,/where\('status','==','published'\)\.limit\(500\)/);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.scripts.test,'node --test test/*.test.js');
 assert.equal(fs.existsSync(path.join(root,'.github/workflows/swapp-quality.yml')),false);
});

test('physical robots.txt fallback and Express response stay byte-for-byte identical',()=>{
 const physical=fs.readFileSync(path.join(root,'robots.txt'),'utf8');
 assert.equal(physical,robotsText());
 assert.match(physical,/^User-agent: \*\nAllow: \/\n/);
 assert.match(physical,/Sitemap: https:\/\/swapp\.tv\/sitemap\.xml\n/);
 assert.doesNotMatch(physical,/google-site-verification|Disallow: \/\s*$/m);
});

test('News sitemap treats first Firestore outage as temporary failure, never an empty success',async()=>{
 const h=appHarness({fail:true});
 const response=h.response();
 const oldWarn=console.warn;console.warn=()=>{};
 try{
  await h.handlers.get('/news-sitemap.xml')({},response);
 }finally{console.warn=oldWarn}
 assert.equal(response.statusCode,503);
 assert.equal(response.headers['Retry-After'],'60');
 assert.equal(response.headers['Cache-Control'],'no-store');
 assert.doesNotMatch(response.body,/<urlset|<url>/);
 const main=h.response();
 await h.handlers.get('/sitemap.xml')({},main);
 assert.equal(main.statusCode,200,'core URLs still work during an editorial outage');
 assert.match(main.body,/<url><loc>https:\/\/swapp\.tv\/<\/loc><\/url>/);
});

test('News sitemap keeps HTTP 200 and actual XML after a confirmed published read',async()=>{
 const h=appHarness({articles:[{
  slug:'a-genuine-article',title:'Un article effectivement publié',contentType:'article',
  status:'published',publishedAt:'1970-01-01T00:10:00Z'
 }]});
 const response=h.response();
 await h.handlers.get('/news-sitemap.xml')({},response);
 assert.equal(response.statusCode,200);
 assert.match(response.headers['Content-Type'],/application\/xml/);
 assert.match(response.body,/<url><loc>https:\/\/swapp\.tv\/actus\/a-genuine-article<\/loc>/);
 assert.equal(h.reads(),1,'the shared sitemap cache makes one storage read');
});

test('SEO status endpoint diagnoses unavailable storage without exposing details',async()=>{
 const h=appHarness({fail:true});
 const response=h.response();
 response.json=function(obj){this.body=obj;return this};
 const warn=console.warn;console.warn=()=>{};
 try{await h.handlers.get('/api/seo/status')({},response)}
 finally{console.warn=warn}
 assert.equal(response.statusCode,200);
 assert.equal(response.body.articleSource,'unavailable');
 assert.equal(response.body.newsSitemapStatus,'source_unavailable');
 assert.equal(response.body.sitemapReady,true);
 assert.equal(response.body.publishedCount,0);
 assert.equal(h.reads(),1);
 assert.deepEqual(Object.keys(response.body).sort(),[
  'articleSource','newsSitemapStatus','publishedCount','service','sitemapReady'
 ].sort());
});

test('SEO status endpoint diagnoses an empty published source and does not return a false XML success',async()=>{
 const h=appHarness({articles:[]});
 const status=h.response();
 status.json=function(obj){this.body=obj;return this};
 await h.handlers.get('/api/seo/status')({},status);
 assert.equal(status.body.articleSource,'ready');
 assert.equal(status.body.publishedCount,0);
 assert.equal(status.body.newsSitemapStatus,'no_published_articles');
 const news=h.response();
 await h.handlers.get('/news-sitemap.xml')({},news);
 assert.equal(news.statusCode,503);
 assert.equal(news.headers['Retry-After'],'3600');
 assert.doesNotMatch(news.body,/<urlset/);
 assert.equal(h.reads(),1);
});

test('SEO status reuses the cache when a verified editorial sitemap is available',async()=>{
 const h=appHarness({articles:[{slug:'real-story-today',
  status:'published',title:'Actualité SWAPP vérifiée',
  publishedAt:'1970-01-01T00:00:30Z'}]});
 const status=h.response();
 status.json=function(obj){this.body=obj;return this};
 await h.handlers.get('/api/seo/status')({},status);
 assert.equal(status.body.articleSource,'ready');
 assert.equal(status.body.publishedCount,1);
 assert.equal(status.body.newsSitemapStatus,'ready');
 const news=h.response();
 await h.handlers.get('/news-sitemap.xml')({},news);
 assert.equal(news.statusCode,200);
 assert.match(news.body,/https:\/\/swapp\.tv\/actus\/real-story-today/);
 assert.equal(h.reads(),1);
});


test('inherited homepage SEO is replaced with exactly one route-specific canonical and preview',()=>{
 const inherited='<html><head><title>Old SWAPP</title>'+
  '<meta name="description" content="Home description">'+
  '<meta name="theme-color" content="#111827">'+
  '<meta name="google-site-verification" content="proof">'+
  '<link rel="canonical" href="https://swapp.tv/">'+
  '<link rel="alternate" type="application/rss+xml" href="/feed.xml">'+
  '<meta property="og:url" content="https://swapp.tv/">'+
  '<meta property="og:title" content="Old title">'+
  '<meta name="twitter:title" content="Old title"></head><body>SWAPP</body></html>';
 for(const route of ['/','/actus','/decouvrir','/categories','/equipes']){
  const head=injectSpaMetadata(inherited,route).split('</head>')[0];
  assert.equal((head.match(/rel="canonical"/g)||[]).length,1,route+' canonical count');
  assert.match(head,new RegExp('<link rel="canonical" href="https://swapp\.tv'+(route==='/'?'/':route)+'">'));
  assert.equal((head.match(/property="og:url"/g)||[]).length,1,route+' OG URL count');
  assert.equal((head.match(/name="description"/g)||[]).length,1,route+' description count');
  assert.equal((head.match(/name="twitter:title"/g)||[]).length,1,route+' Twitter title count');
  assert.equal((head.match(/application\/rss\+xml/g)||[]).length,1,route+' feed count');
  assert.match(head,/name="google-site-verification" content="proof"/);
  assert.match(head,/name="theme-color" content="#111827"/);
 }
});

test('account route removes homepage canonical and preview while remaining noindex',()=>{
 const base='<html><head><title>Accueil</title><link rel="canonical" href="https://swapp.tv/">'+
  '<meta property="og:url" content="https://swapp.tv/">'+
  '<meta name="description" content="Homepage"></head><body>Compte</body></html>';
 const out=injectSpaMetadata(base,'/compte');
 const head=out.split('</head>')[0];
 assert.match(head,/name="robots" content="noindex,nofollow"/);
 assert.doesNotMatch(head,/rel="canonical"|property="og:url"|name="description"/);
});

test('landing SEO fallback is no-script only and cannot overlay interactive views',()=>{
 const base='<html><head><title>SWAPP</title></head><body><main>'+
  '<section id="discover" class="view"><p>Card</p></section>'+
  '<section id="actus" class="view"><p>News</p></section></main></body></html>';
 for(const route of ['/decouvrir','/actus']){
  const output=injectSpaMetadata(base,route);
  assert.match(output,/<noscript><div class="swappSeoIntro">/);
  assert.match(output,/<\/div><\/noscript>/);
  assert.equal((output.match(/swappSeoIntro"/g)||[]).length,1);
  assert.match(output,/<p>Card<\/p>/);
 }
});

test('public creator metadata drops inherited canonical rather than duplicating it',()=>{
 const {injectCreatorMetadata}=require('../modules/swapp-seo');
 const page='<html><head><title>Accueil</title><link rel="canonical" href="https://swapp.tv/">'+
  '<meta name="description" content="Accueil">'+
  '<meta property="og:url" content="https://swapp.tv/"></head><body></body></html>';
 const out=injectCreatorMetadata(page,{login:'petitstream',display_name:'Petit Stream',channel_public:true},'petitstream');
 const head=out.split('</head>')[0];
 assert.equal((head.match(/rel="canonical"/g)||[]).length,1);
 assert.match(head,/rel="canonical" href="https:\/\/swapp.tv\/petitstream"/);
 assert.equal((head.match(/property="og:url"/g)||[]).length,1);
});
