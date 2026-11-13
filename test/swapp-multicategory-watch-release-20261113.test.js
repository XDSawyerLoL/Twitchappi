'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SOURCES,parseFeed,run}=require('../tools/swapp-tech-watch');
const {assertCandidate}=require('../modules/swapp-tech-watch-store');
const {assertArticle}=require('../modules/swapp-news/article-core');
const {loadEditorialReleases}=require('../modules/swapp-news/editorial-release-sync');
const release=require('../data/swapp-veille-native-20261113-multicategories-sourcees.json');

test('watch covers gaming, AI, robotics, future and creator-streaming from trusted feeds',()=>{
 const sections=new Set(SOURCES.map(s=>s.section));
 for(const s of ['GAMING','IA','Robotique','FUTURE'])assert.ok(sections.has(s),s);
 for(const id of ['playstation','xbox-wire','nvidia-gaming','obs-releases'])assert.ok(SOURCES.some(s=>s.id===id),id);
 assert.ok(SOURCES.some(s=>s.beat==='Streaming'));
 assert.equal(new Set(SOURCES.map(s=>s.id)).size,SOURCES.length);
});

test('RSS polling stays unverified and rejects stale or future-dated headlines',async()=>{
 const now=new Date('2026-11-13T10:00:00Z');
 const feed=`<rss><channel>
 <item><title>Fresh official update</title><link>https://example.com/news/new</link><pubDate>Thu, 12 Nov 2026 10:00:00 GMT</pubDate></item>
 <item><title>Stale post</title><link>https://example.com/news/old</link><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate></item>
 <item><title>Future post</title><link>https://example.com/news/future</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate></item>
 </channel></rss>`;
 const result=await run({output:null,now,fetchFeed:async()=>feed,maxAgeDays:21});
 assert.equal(result.checks.length,SOURCES.length);
 assert.ok(result.checks.every(s=>s.ok && s.count===1));
 assert.equal(result.candidates.length,SOURCES.length);
 assert.equal(result.candidates.filter(c=>c.section==='GAMING').length,
   SOURCES.filter(s=>s.section==='GAMING').length);
 for(const c of result.candidates){
   assert.equal(c.status,'candidate_unverified');
   assert.equal(c.primarySourceVerified,false);
   assert.equal(c.officialVideoVerified,false);
   assert.doesNotThrow(()=>assertCandidate(c));
 }
 assert.equal(parseFeed(feed,SOURCES[0]).length,3);
});

test('new editorial release is validated, contains no duplicate slug or fictional score',()=>{
 assert.equal(release.articles.length,4);
 const slugs=new Set();
 const sectionTags=new Set();
 for(const article of release.articles){
   assert.doesNotThrow(()=>assertArticle(article,{publish:true}),article.slug);
   assert.ok(!slugs.has(article.slug),article.slug);
   slugs.add(article.slug);
   for(const tag of article.tags)sectionTags.add(tag);
   assert.ok(article.body.length>=1800,'article is substantial');
   assert.ok(article.sources.length>=1);
   assert.ok(!article.editorialVerdict,'SWAPP Score must not be invented');
   assert.ok(!article.image && !article.thumbnail,'do not reuse unlicensed images');
   assert.equal(article.publishedAt,'2026-11-13T07:00:00.000Z');
 }
 for(const section of ['GAMING','AI','ROBOTICS','FUTURE'])assert.ok(sectionTags.has(section));
 const all=loadEditorialReleases();
 assert.equal(all.filter(a=>slugs.has(a.slug)).length,4);
 assert.equal(new Set(all.map(a=>a.slug)).size,all.length);
});
