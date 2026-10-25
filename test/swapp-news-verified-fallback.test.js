'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createVerifiedPublishedCache}=require('../modules/swapp-news/verified-cache');
const route=fs.readFileSync(path.join(__dirname,'..','modules/swapp-news/router.js'),'utf8');
const article=(slug='valid-article-slug',status='published')=>({slug,title:'Article éditorial SWAPP publié',status,
 publishedAt:'2026-10-24T08:00:00Z',body:'Article réellement publié dans le CMS.',summary:'Résumé'});
test('cache starts empty: a CMS outage cannot bootstrap from unchecked releases',()=>{
 const c=createVerifiedPublishedCache();
 assert.equal(c.all(),null);
 assert.equal(c.get('valid-article-slug'),null);
});
test('only confirmed published articles are eligible',()=>{
 const c=createVerifiedPublishedCache();
 c.remember([article(),article('private-draft-slug','draft'),article('private-review-slug','review'),{...article('invalid slug'),slug:'INVALID SLUG'}]);
 const result=c.all();
 assert.equal(result.length,1);
 assert.equal(result[0].slug,'valid-article-slug');
 assert.equal(c.get('private-draft-slug'),null);
 assert.ok(c.get('valid-article-slug').body);
});
test('verified snapshot expires after ten minutes and cannot remain stale forever',()=>{
 let now=1000;
 const c=createVerifiedPublishedCache({clock:()=>now,ttlMs:600000});
 c.remember([article()]);
 assert.equal(c.all().length,1);
 now+=599999;
 assert.equal(c.all().length,1);
 now++;
 assert.equal(c.all(),null);
 assert.equal(c.get('valid-article-slug'),null);
});
test('editor mutation explicitly invalidates last known snapshot',()=>{
 const c=createVerifiedPublishedCache();
 c.remember([article()]);
 c.invalidate();
 assert.equal(c.all(),null);
});
test('public list, article JSON and article HTML routes are allowed to degrade',()=>{
 assert.match(route,/router\.get\('\/api\/actus',async\(req,res,next\)=>/);
 assert.match(route,/router\.get\('\/api\/actus\/:slug',async\(req,res,next\)=>/);
 assert.match(route,/router\.get\('\/actus\/:slug',async\(req,res,next\)=>/);
 assert.match(route,/X-SWAPP-Editorial-State/);
 assert.match(route,/verifiedPublished\.remember\(list\)/);
 assert.match(route,/res\.json\(\{articles:fallback\.map/);
 assert.match(route,/renderNewsStory\(fallback,\{baseUrl,relatedArticles:\[\]\}\)/);
});
test('withdraw, edit and publish cannot silently preserve a now-invalid cached article',()=>{
 const n=(route.match(/verifiedPublished\.invalidate\(\)/g)||[]).length;
 assert.ok(n>=3,'all editorial mutations must invalidate the verified snapshot');
 assert.match(route,/news_storage_unavailable/);
 assert.doesNotMatch(route,/verifiedPublished\.remember\(swappReleaseArticles\)/);
});
