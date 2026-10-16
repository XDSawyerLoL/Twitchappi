'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {layout}=require('../modules/swapp-news/site-shell');

const PAGE_PATHS=[
 ['community','/communaute','Communauté'],
 ['trailers','/bandes-annonces','Vidéos'],
 ['shop','/boutique','Boutique']
];
test('native public hubs have one canonical and a readable social preview',()=>{
 for(const [active,pathname,title] of PAGE_PATHS){
  const page=layout({title,description:'Découvre SWAPP',content:'<main>Test</main>',active});
  assert.match(page,/<meta property="og:site_name" content="SWAPP">/);
  assert.ok(page.includes('<link rel="canonical" href="https://swapp.tv'+pathname+'">'));
  assert.ok(page.includes('<meta property="og:url" content="https://swapp.tv'+pathname+'">'));
  assert.equal((page.match(/rel="canonical"/g)||[]).length,1);
  assert.match(page,/<main>Test<\/main>/);
 }
});
test('article editorial metadata is not overwritten by a generic hub canonical',()=>{
 const canonical='<link rel="canonical" href="https://swapp.tv/actus/existing-story">';
 const page=layout({title:'Article',active:'actus',metadata:canonical,content:'Article'});
 assert.ok(page.includes(canonical));
 assert.equal((page.match(/rel="canonical"/g)||[]).length,1);
});
test('native metadata escapes untrusted title and description',()=>{
 const page=layout({title:'<video>Gaming',description:'" & <foo>',active:'community'});
 assert.doesNotMatch(page,/<title><video>/);
 assert.match(page,/&lt;video&gt;/);
 assert.match(page,/&quot; &amp; &lt;foo&gt;/);
});
