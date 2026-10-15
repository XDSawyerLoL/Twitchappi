'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(ROOT,relative),'utf8');

test('one new editorial stylesheet applies consistently to SPA and public media routes',()=>{
  const main=read('index.html'),publicPage=read('modules/swapp-news/site-shell.js');
  const stylesheet='/assets/swapp-art-direction.css?v=20261015-actus-glow-37';
  for(const page of [main,publicPage]){
    assert.ok(page.includes(stylesheet));
    assert.ok(page.indexOf(stylesheet)>page.indexOf('/assets/swapp-visual-polish.css'));
  }
});

test('homepage no longer presents artificial explainer dashboards',()=>{
  const js=read('index_script.js');
  const from=js.lastIndexOf('window.renderHome = async function renderHome1014');
  const to=js.indexOf('window.swappRefreshHome1014',from);
  assert.ok(from>0&&to>from);
  const template=js.slice(from,to);
  assert.doesNotMatch(template,/Règle d’accueil|homeHeroPanel1014|homeBottomCard1014/);
  assert.match(template,/homeLiveGrid1014/);
  assert.match(template,/setView\('discover'\)/);
  assert.match(template,/loadLives\(true\)/);
});

test('no changes remove editorial shelf, cards or user-facing actions',()=>{
  const app=read('assets/swapp-home-news.js'),css=read('assets/swapp-art-direction.css');
  assert.match(app,/fetchItems\('\/api\/actus'/);
  assert.match(app,/grid\.append\(story\(item,i\)\)/);
  assert.doesNotMatch(app,/browseLive\.href='\/decouvrir'/);
  assert.match(css,/#home \.swapp-home-story/);
  assert.match(css,/#home \.homeLiveCard1014/);
  assert.match(css,/#actus \.swapp-actus-card/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css, /#home \.swapp-home-story\s*\{[^}]*display:none/i);
});
