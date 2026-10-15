'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('ACTUS game filters expand rather than rendering a native horizontal scrollbar',()=>{
 const script=read('assets/swapp-actus-app.js');
 const styles=read('assets/swapp-art-direction.css');
 assert.match(script,/const chips=el\('div','swapp-actus-game-options'/);
 assert.match(script,/gamesExpanded=!gamesExpanded;renderGames\(\)/);
 assert.match(script,/toggle\.setAttribute\('aria-expanded',String\(gamesExpanded\)\)/);
 assert.match(script,/aria-pressed/);
 assert.match(styles,/#actus \.swapp-actus-game-filters/);
 assert.match(styles,/overflow:visible!important/);
 assert.match(styles,/swapp-actus-game-options:not\(\.is-expanded\)/);
 assert.match(styles,/@media\(max-width:700px\)/);
});

test('homepage hero uses actual article imagery with reserved loading dimensions',()=>{
 const script=read('assets/swapp-home-news.js');
 const css=read('assets/swapp-art-direction.css');
 assert.match(script,/function decorateHero\(modern,articles,onImageError\)/);
 assert.match(script,/feature=articles\.find\(item=>slugOk\(item\.slug\)/);
 assert.match(script,/swapp-home-hero-placeholder/);
 assert.match(script,/hero\.classList\.add\('swapp-hero-has-story'\)/);
 assert.match(script,/valid\.forEach\(\(item,i\)=>grid\.append\(story\(item,i\)\)\)/);
 assert.match(script,/image\.onerror=\(\)=>\{tile\.remove\(\)/);
 assert.match(css,/#home \.swapp-home-hero-placeholder/);
 assert.match(css,/#home \.swapp-home-hero-feature/);
});

test('latest ACTUS and homepage assets load after design CSS in the canonical app',()=>{
 const app=read('index.html');
 const shell=read('modules/swapp-news/site-shell.js');
 assert.match(app,/swapp-actus-app\.js\?v=20261015-private-36/);
 assert.match(app,/swapp-home-news\.js\?v=20261015-private-36/);
 assert.match(app,/swapp-art-direction\.css\?v=20261015-cinematic-38/);
 assert.match(shell,/swapp-art-direction\.css\?v=20261015-cinematic-38/);
});
