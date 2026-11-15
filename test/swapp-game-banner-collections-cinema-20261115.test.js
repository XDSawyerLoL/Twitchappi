'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const catalogue=require('../assets/swapp-catalogue-lab');
const explorer=require('../assets/swapp-explorer');
const {GENRES,genreForGame}=require('../assets/swapp-genre-discovery');
const catalogueJs=read('assets/swapp-catalogue-lab.js');
const catalogueCss=read('assets/swapp-catalogue-lab.css');
const collectionsCss=read('assets/swapp-explorer.css');

test('game live banner combines official high-resolution cover with only confirmed matching game live',()=>{
 const game={kind:'game',game:'Street Fighter 6',gameSlug:'street-fighter-6',
  cover:'https://static-cdn.jtvnw.net/ttv-boxart/123-285x380.jpg'};
 const other={kind:'live',gameSlug:'cyberpunk-2077',image:'https://static-cdn.jtvnw.net/other-1280x720.jpg'};
 const actual={kind:'live',gameSlug:'street-fighter-6',image:'https://static-cdn.jtvnw.net/sf6-1280x720.jpg'};
 const before=catalogue.gameBannerSources(game,[other]);
 assert.equal(before.poster,'https://static-cdn.jtvnw.net/ttv-boxart/123-720x960.jpg');
 assert.equal(before.backdrop,'','an unrelated stream must not become the game banner');
 assert.equal(before.source,'poster');
 const after=catalogue.gameBannerSources(game,[other,actual]);
 assert.equal(after.backdrop,actual.image);
 assert.equal(after.source,'live');
 const malicious=catalogue.gameBannerSources({...game,cover:'https://example.invalid/a.jpg'},
  [{...actual,image:'javascript:alert(1)'}]);
 assert.equal(malicious.poster,'');
 assert.equal(malicious.backdrop,'');
});

test('game dialog places banner above the verified stream cards, with real genre link and accessible poster',()=>{
 const start=catalogueJs.indexOf('async function showGameLives(game){');
 const end=catalogueJs.indexOf("$('scl-search').addEventListener",start);
 const segment=catalogueJs.slice(start,end);
 assert.ok(start>0&&end>start);
 for(const key of [
  'scl-game-live-hero','scl-game-live-artwork','scl-game-live-poster-holder',
  'scl-game-live-backdrop','scl-game-live-poster',
  'scl-game-live-explore','scl-game-live-cards',
  "section.append(hero,body)","showDialog(section,'game')",
  "if(!dialog.open||!section.isConnected"
 ])assert.ok(segment.includes(key),key);
 assert.match(segment,/poster\.alt='Jaquette de '\+game\.game/);
 assert.match(segment,/gameBannerSources\(game,lives\)/);
 assert.match(segment,/paintBanner\(found\)/);
 assert.match(segment,/found\.slice\(0,12\)\.map\(createCard\)/);
 assert.match(catalogueCss,/#scl-dialog\.scl-dialog-game \.scl-game-live-hero\{/);
 assert.match(catalogueCss,/#scl-dialog\.scl-dialog-game \.scl-game-live-hero::after/);
 assert.match(catalogueCss,/\.scl-game-live-backdrop\{[\s\S]*?object-fit:cover/);
 assert.match(catalogueCss,/\.scl-game-live-poster\{[\s\S]*?image-rendering:auto/);
 assert.doesNotMatch(catalogueCss.slice(catalogueCss.indexOf('/* V33 \/ Actual game artwork')),
  /filter:blur\(|transform:scale\(/);
});

test('collection cards use distinct genuine covers, and preserve true live counts',()=>{
 const make=(name,id)=>explorer.game({name,
  box_art_url:'https://static-cdn.jtvnw.net/ttv-boxart/'+id+'-{width}x{height}.jpg'},genreForGame);
 const games=[make('Cyberpunk 2077','1'),make('Baldur’s Gate 3','2'),make('The Witcher 3: Wild Hunt','3')];
 assert.ok(games.every(x=>x?.genre==='rpg'));
 const lives=[explorer.live({user_login:'cplayer',game_name:'Cyberpunk 2077',viewer_count:23},'twitch',genreForGame)];
 const list=explorer.collections(games,lives,GENRES);
 const rpg=list.find(x=>x.id==='rpg');
 assert.equal(rpg.gameCount,3);
 assert.equal(rpg.liveCount,1);
 assert.equal(rpg.covers.length,3);
 assert.equal(new Set(rpg.covers).size,3);
 assert.ok(rpg.covers.every(x=>x.includes('720x960')));
 assert.deepEqual(explorer.collections([],[],GENRES),[]);
});

test('collections have a featured real group, no duplicate tile, and immersive game-art detail',()=>{
 const html=require('../modules/swapp-explorer').page({genre:'rpg'});
 for(const value of ['id="sx-featured-collection"','id="sx-collection-grid"',
  'id="sx-detail-visual"','id="sx-detail-title"','id="sx-detail-games"',
  'id="sx-detail-lives"'])assert.ok(html.includes(value),value);
 const js=read('assets/swapp-explorer.js');
 assert.match(js,/function collectionArtwork\(doc,group\)/);
 assert.match(js,/\(group\.covers\|\|\[\]\)\.slice\(0,4\)/);
 assert.match(js,/host\.replaceChildren\(\.\.\.groups\.slice\(initialGenre\?0:1\)/);
 assert.match(js,/featured\.append\(card\);featured\.hidden=false/);
 assert.match(js,/visual\?\.append\(collectionArtwork\(doc,group\)\)/);
 assert.match(collectionsCss,/#swapp-explorer \.sx-collection-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(collectionsCss,/#swapp-explorer \.sx-collection-frame img\{[\s\S]*?filter:none!important;transform:none!important/);
 assert.match(collectionsCss,/#swapp-explorer \.sx-detail-hero\{/);
 assert.match(read('modules/swapp-explorer.js'),/20261115-collections-cinema-v2/);
});

test('new presentation is bundled via existing Hostinger release, not a paid API',()=>{
 const spa=read('modules/swapp-catalogue-spa.js');
 const native=read('modules/swapp-catalogue-lab.js');
 const packageText=read('tools/swapp-hostinger-package.js');
 for(const html of [spa,native]){
  assert.match(html,/20261115-game-banners-v32/);
  assert.match(html,/20261115-game-banners-style-v28/);
 }
 for(const asset of ['assets/swapp-catalogue-lab.js','assets/swapp-catalogue-lab.css',
  'assets/swapp-explorer.js','assets/swapp-explorer.css'])assert.ok(packageText.includes(asset),asset);
 assert.match(read('tools/swapp-deploy-smoke.js'),/20261115-game-banners-v32/);
});
