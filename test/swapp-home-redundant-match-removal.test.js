'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('homepage only shows editorial stories and existing live section, no redundant ACTUS × LIVE panel',()=>{
 const code=read('assets/swapp-home-news.js');
 assert.match(code,/valid\.forEach\(\(item,i\)=>grid\.append\(story\(item,i\)\)\)/);
 assert.match(code,/decorateHero\(modern,valid\)/);
 assert.match(code,/const liveShelf=modern\?\.querySelector\('\.homeLiveSection1014'\)/);
 assert.doesNotMatch(code,/ACTUS × LIVE|swapp-home-match-zone|swapp-home-match-item/);
 assert.doesNotMatch(code,/\/api\/discovery\/game-lives/);
 assert.doesNotMatch(code,/Promise\.allSettled\(featuredGames/);
});
test('ACTUS article pages still connect articles to their relevant live games',()=>{
 const code=read('assets/swapp-actus-app.js');
 assert.match(code,/\/api\/discovery\/game-lives\?limit=12&game=/);
 assert.match(code,/swapp-article-lives/);
});
test('orphan home match styles are removed, while design and caches remain',()=>{
 for(const p of ['assets/swapp-media.css','assets/swapp-art-direction.css']){
  const css=read(p);
  assert.doesNotMatch(css,/\.swapp-home-match(?:-|\b)/);
 }
 const main=read('index.html'),publicPage=read('modules/swapp-news/site-shell.js');
 for(const html of [main,publicPage]){
  assert.match(html,/swapp-art-direction\.css\?v=20261015-home-clean-27/);
  assert.match(html,/swapp-media\.css\?v=20261015-home-clean-27/);
 }
 assert.match(main,/swapp-home-news\.js\?v=20261015-home-clean-27/);
});
