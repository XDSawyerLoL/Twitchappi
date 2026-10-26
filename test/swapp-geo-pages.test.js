'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pageHtml,registerGeoRoutes}=require('../modules/swapp-geo-pages');
const {CORE_PATHS,sitemapXml,sitemapHtml,robotsText}=require('../modules/swapp-seo');

test('GEO reference pages are server-rendered and carry one canonical URL',()=>{
 for(const route of ['/a-propos','/alternative-twitch']){
  const html=pageHtml(route);
  assert.match(html,/<html lang="fr">/);
  assert.match(html,/<main id="main-content" class="swapp-geo">/);
  assert.match(html,/<h1>[^<]+<\/h1>/);
  assert.match(html,/<meta name="description" content="[^"]+"/);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes('<link rel="canonical" href="https://swapp.tv'+route+'">'));
  assert.ok(html.includes('href="/decouvrir"'));
  assert.ok(html.includes('href="/actus"'));
  const schemaMatch=html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
  assert.ok(schemaMatch,route+' has structured data');
  const schema=JSON.parse(schemaMatch[1]);
  assert.equal(schema['@context'],'https://schema.org');
  assert.ok(schema['@graph'].some(item=>item['@id']==='https://swapp.tv'+route+'#page'));
 }
});
test('about and alternative pages honestly describe the product without invented metrics',()=>{
 const about=pageHtml('/a-propos');
 const comparison=pageHtml('/alternative-twitch');
 assert.match(about,/plateforme gaming française/);
 assert.match(about,/réseau social/);
 assert.match(comparison,/Twitch ou Kick/);
 assert.match(comparison,/encore en développement/);
 assert.doesNotMatch(comparison,/zéro latence|meilleur taux|leader français|[0-9]{3} ?%/i);
 assert.equal(pageHtml('/page-inconnue'),'');
});
test('GEO routes are public, cacheable and independent of the database',()=>{
 const handlers=new Map();
 registerGeoRoutes({get:(name,handler)=>handlers.set(name,handler)});
 assert.equal(handlers.size,2);
 for(const [route,handler] of handlers){
  const result={statusCode:0,headers:{},body:'',
   set(k,v){this.headers[k]=v;return this},
   status(code){this.statusCode=code;return this},
   type(t){this.headers['content-type']=t;return this},
   send(str){this.body=str;return this}};
  handler({},result);
  assert.equal(result.statusCode,200,route);
  assert.match(result.headers['Cache-Control'],/max-age=300/);
  assert.match(result.headers['content-type'],/html/);
  assert.match(result.body,/<main id="main-content"/);
 }
});
test('sitemap and human navigation expose both reference pages',()=>{
 for(const route of ['/a-propos','/alternative-twitch']){
  assert.ok(CORE_PATHS.includes(route));
  assert.ok(sitemapXml().includes('<loc>https://swapp.tv'+route+'</loc>'));
  assert.ok(sitemapHtml().includes('href="'+route+'"'));
 }
 const footer=fs.readFileSync(path.join(__dirname,'../assets/swapp-footer.js'),'utf8');
 assert.ok(footer.includes('href="/a-propos"'));
 assert.ok(footer.includes('href="/alternative-twitch"'));
 const robots=robotsText();
 assert.match(robots,/User-agent: \*/);
 assert.doesNotMatch(robots,/Disallow: \/a-propos|Disallow: \/alternative-twitch/);
});
