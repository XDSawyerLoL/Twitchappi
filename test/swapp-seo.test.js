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
