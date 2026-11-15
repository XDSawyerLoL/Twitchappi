'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'..',name),'utf8');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
const {page}=require('../modules/swapp-catalogue-lab');
const {renderPage,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');

test('SWAPP no longer blurs cards, header or account menu at the theme source',()=>{
 const css=read('assets/swapp-obsidian-ice.css');
 assert.doesNotMatch(css,/backdrop-filter:\s*blur\((?:14|22|24)px\)/);
 assert.match(css,/html body #home :is\(\.scl-story-card,\.scl-card,\.scl-empty\)/);
 assert.match(css,/backdrop-filter:none!important;\s*-webkit-backdrop-filter:none!important/);
 assert.match(css,/html body header\.top\{\s*background:[\s\S]*?backdrop-filter:none!important/);
 assert.match(css,/html body header\.top #userMenu\{\s*backdrop-filter:none!important/);
});

test('live and editorial images do not zoom/resample the full card or the images on hover',()=>{
 const css=read('assets/swapp-catalogue-lab.css');
 assert.doesNotMatch(css,/transform:translateZ\(0\)/);
 assert.doesNotMatch(css,/transform:scale\(1\.075\)/);
 assert.doesNotMatch(css,/transform:translateY\(-5px\) scale\(1\.025\)/);
 assert.doesNotMatch(css,/\.scl-(?:card:hover \.scl-card-media|story-card:hover \.scl-story-media) img\{transform:scale/);
 assert.match(css,/\.scl-card:hover,\.scl-card\.scl-is-focused,\.scl-card:focus-within\{\s*transform:translateY\(-3px\)/);
 assert.match(css,/body\[data-swapp-home-spa="v16"\] #home :is\(\.scl-story-card,\.scl-card,\.scl-empty/);
 assert.match(css,/backdrop-filter:none!important;-webkit-backdrop-filter:none!important/);
});

test('poster and genre artwork remain unfiltered even while hovered',()=>{
 const css=read('assets/swapp-genre-discovery.css');
 assert.doesNotMatch(css,/filter:brightness\(/);
 assert.doesNotMatch(css,/transform:scale\(1\.055\)/);
 assert.match(css,/\.scl-genre-card:hover \.scl-genre-visual img\{transform:none;filter:none\}/);
 assert.match(css,/\.scl-game-poster:hover \.scl-game-poster-image img\{transform:none;filter:none\}/);
});

test('native and SPA serve a new fingerprint for all three corrected CSS resources',()=>{
 const index=read('index.html');
 const htmls=[renderIntoSpa(index),page({publicHome:true}),renderPage({head:SHARED_HEAD_SLOT,content:'<main>ACTUS</main>'})];
 const theme='swapp-obsidian-ice.css?v=20261115-solid-sharp-theme-v21';
 const lab='swapp-catalogue-lab.css?v=20261115-explorer-toolbar-v26';
 const genres='swapp-genre-discovery.css?v=20261115-hidpi-genre-v8';
 for(const html of htmls){
  assert.equal(html.split(theme).length-1,1,'must use exactly one updated global theme');
  assert.ok(html.indexOf(theme)<html.indexOf('</head>'));
 }
 for(const html of htmls.slice(0,2)){
  assert.ok(html.includes(lab),'new home stylesheet included');
  assert.ok(html.includes(genres),'new genre stylesheet included');
  assert.doesNotMatch(html,/20261114-smoked-glass-v20|20261115-obsession-sharp-v23|20261115-real-racing-v6/);
 }
});
