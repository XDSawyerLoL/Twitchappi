'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('ACTUS follows the existing user colour variable, without a parallel palette',()=>{
 const css=read('assets/swapp-art-direction.css');
 const app=read('index.html');
 assert.match(css,/#actus\s*\{\s*--swapp-news-accent:var\(--brand,#22d3ee\)/);
 assert.match(css,/body:has\(#actus\.view\.active\)/);
 assert.match(css,/#actus \.swapp-actus-game-chip\.active\s*\{/);
 assert.match(css,/#actus \.swapp-reading-progress span\s*\{/);
 assert.match(css,/#actus \.swapp-actus-go-live\s*\{/);
 assert.match(css,/#actus \.swapp-reader-source-link/);
 assert.match(app,/swapp-art-direction\.css\?v=20261015-actus-theme-30/);
 const script=read('index_script.js');
 assert.match(script,/document\.documentElement\.style\.setProperty\('--brand',c\)/);
 assert.match(script,/oryon_viewer_accent/);
});
