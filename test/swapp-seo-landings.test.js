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
