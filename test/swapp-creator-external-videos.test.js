'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseVideoUrl,normalizeVideos,embedUrl}=require('../lib/swapp-creator-external-videos');
const yt='https://youtu.be/dQw4w9WgXcQ';
const od='https://odysee.com/@channel:abc123/video:def456';
test('accepts supported canonical URLs',()=>{
 assert.equal(parseVideoUrl(yt).provider,'youtube');
 assert.equal(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').id,'dQw4w9WgXcQ');
 assert.equal(parseVideoUrl(od).provider,'odysee');
 assert.match(embedUrl({url:od}),/^https:\/\/odysee\.com\/\$\/embed\//);
});
test('rejects unsafe and unsupported URLs',()=>{
 for(const url of ['javascript:alert(1)','http://youtu.be/dQw4w9WgXcQ','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://evil.test','https://youtube.com/watch?v=bad','https://user:pass@youtu.be/dQw4w9WgXcQ'])assert.equal(parseVideoUrl(url),null,url);
});
test('caps list and blocks duplicates',()=>{
 assert.equal(normalizeVideos([{url:yt},{url:od}]).length,2);
 assert.throws(()=>normalizeVideos(Array(6).fill({url:yt})),/Maximum/);
 assert.throws(()=>normalizeVideos([{url:yt},{url:'https://youtube.com/watch?v=dQw4w9WgXcQ'}]),/déjà/);
});
