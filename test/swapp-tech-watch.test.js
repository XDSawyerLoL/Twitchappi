'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseFeed,SOURCES}=require('../tools/swapp-tech-watch');
test('RSS candidates retain source and are never marked verified',()=>{
 const xml='<rss><channel><item><title>New model &amp; tools</title><link>https://example.org/news/1</link><pubDate>Tue, 10 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>';
 const items=parseFeed(xml,SOURCES[0]);
 assert.equal(items.length,1);
 assert.equal(items[0].title,'New model & tools');
 assert.equal(items[0].status,'candidate_unverified');
 assert.equal(items[0].primarySourceVerified,false);
 assert.equal(items[0].officialVideoVerified,false);
 assert.equal(items[0].sourcePublishedAt,'2026-11-10T10:00:00.000Z');
});
test('Atom feed links and malformed URLs',()=>{
 const src=SOURCES[1];
 const xml='<feed><entry><title>Research release</title><link rel="alternate" href="https://example.org/a"/><updated>2026-11-10T12:00:00Z</updated></entry><entry><title>Unsafe</title><link href="javascript:alert(1)"/><updated>2026-11-10T12:00:00Z</updated></entry></feed>';
 const items=parseFeed(xml,src);
 assert.equal(items.length,1);
 assert.equal(items[0].url,'https://example.org/a');
 assert.equal(parseFeed(xml,src)[0].id,items[0].id);
});
