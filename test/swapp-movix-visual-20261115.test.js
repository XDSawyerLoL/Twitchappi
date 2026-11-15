'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {catalogueContent}=require('../modules/swapp-catalogue-lab');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');
const {rankGames,rankGenres,GENRES}=require('../assets/swapp-genre-discovery');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('Magazine leads home rails, and genre image ribbon precedes compact posters',()=>{
 const html=catalogueContent({publicHome:true});
 const ordered=['scl-articles','scl-favorites','scl-top-games','scl-live','scl-small','scl-genres','scl-games','scl-genre-shelves'];
 for(const id of ordered)assert.ok(html.includes('id="'+id+'"'),id);
 for(let i=1;i<ordered.length;i++)
  assert.ok(html.indexOf('id="'+ordered[i-1]+'"')<html.indexOf('id="'+ordered[i]+'"'),
   ordered[i-1]+' must be before '+ordered[i]);
 assert.match(html,/TROUVE TON CONTENU PAR GENRE/);
 assert.match(html,/LES JEUX DU MOMENT/);
 assert.match(html,/JEUX À DÉCOUVRIR/);
 assert.match(html,/data-scroll-left="scl-genre-cards"/);
 assert.match(html,/data-scroll-right="scl-genre-cards"/);
 assert.match(html,/class="scl-cards scl-game-poster-rail" id="scl-game-cards"/);
 assert.equal(GENRES.length,25);
});

test('Movix reference: genre thumbnails are authentic game covers and horizontal',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 const css=read('assets/swapp-genre-discovery.css');
 assert.match(js,/const media=create\('span','scl-genre-visual'\)/);
 assert.match(js,/if\(group\.image\)/);
 assert.match(js,/card\.append\(media,detail\)/);
 assert.match(js,/image\.addEventListener\('error',\(\)=>image\.remove\(\)/);
 assert.match(css,/\.scl-genre-cards\s*\{\s*display:flex/);
 assert.match(css,/overflow-x:auto;overflow-y:hidden/);
 assert.match(css,/aspect-ratio:1\.81\/1/);
 assert.match(css,/\.scl-genre-visual img/);
 assert.doesNotMatch(css,/\.scl-genre-cards\s*\{\s*display:grid/);
 const genres=rankGenres([{kind:'game',game:'Aion 2',gameSlug:'aion-2',image:'https://static-cdn.jtvnw.net/ttv-boxart/aion.jpg'}],[]);
 assert.equal(genres.find(g=>g.id==='mmorpg').image,'https://static-cdn.jtvnw.net/ttv-boxart/aion.jpg');
 assert.equal(genres.find(g=>g.id==='mmorpg').liveCount,0);
});

test('Movix reference: poster art remains visible, badges persist, hover reveals metadata',()=>{
 const js=read('assets/swapp-catalogue-lab.js');
 const css=read('assets/swapp-genre-discovery.css');
 assert.match(js,/card\.append\(create\('span','scl-game-poster-kind',item\.liveCount\?'LIVE':'JEU'\)\)/);
 assert.match(js,/if\(item\.cover\)/);
 assert.match(js,/void showGameLives\(item\)/);
 assert.match(js,/function renderAllGames\(games\)/);
 assert.match(js,/renderAllGames\(games\)/);
 assert.match(js,/group\.label\.toLocaleUpperCase\('fr-FR'\)/);
 assert.match(css,/\.scl-game-poster\s*\{[\s\S]*?aspect-ratio:2\/3/);
 assert.match(css,/\.scl-game-poster-image img/);
 assert.match(css,/object-fit:cover/);
 assert.match(css,/\.scl-game-poster-details\s*\{[\s\S]*?opacity:0/);
 assert.match(css,/\.scl-game-poster:hover \.scl-game-poster-details/);
 assert.match(css,/@media\(hover:none\)/);
 assert.match(css,/\.scl-game-poster-rank\s*\{[\s\S]*?-webkit-text-stroke:2px/);
 assert.match(css,/\.scl-top-games \.scl-game-poster-rail/);
 assert.match(css,/\.scl-all-games \.scl-game-poster-rail/);
 assert.match(css,/\.scl-genre-game-rail \.scl-game-poster-rail/);
});

test('Movix style: ranks only when actual confirmed lives are present',()=>{
 const games=[
  {kind:'game',game:'Valorant',gameSlug:'valorant',image:'https://static-cdn.jtvnw.net/valorant.jpg'},
  {kind:'game',game:'Aion 2',gameSlug:'aion-2',image:'https://static-cdn.jtvnw.net/aion.jpg'}
 ];
 const streams=[{kind:'live',id:'twitch:alice',game:'Aion 2',gameSlug:'aion-2',viewers:130,audienceVerified:true}];
 const ranked=rankGames(games,streams);
 assert.deepEqual(ranked.map(g=>g.game),['Aion 2','Valorant']);
 assert.equal(ranked[0].liveCount,1);
 assert.equal(ranked[0].audience,130);
 assert.equal(ranked[1].liveCount,0);
 const js=read('assets/swapp-catalogue-lab.js');
 assert.match(js,/active\.forEach\(\(item,index\)=>fragment\.append\(createGamePoster\(item,index\+1\)\)\)/);
 assert.match(js,/heading\.textContent='Top des jeux en ce moment'/);
 assert.match(js,/renderGenreShelves\(\)/);
});

test('Movix CSS and JS versions are the same in SPA and standalone catalogue',()=>{
 const spa=renderIntoSpa(read('index.html'));
 const native=require('../modules/swapp-catalogue-lab').page();
 for(const html of [spa,native]){
  assert.match(html,/swapp-genre-discovery\.css\?v=20261115-hidpi-genre-v8/);
  assert.match(html,/swapp-genre-discovery\.js\?v=20261115-hidpi-genre-v8/);
  assert.match(html,/swapp-catalogue-lab\.js\?v=20261115-game-banners-v32/);
 }
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(smoke,/swapp-catalogue-lab\.js\?v=20261115-game-banners-v32/);
});

test('game posters use a non-blurred normal stacking context at native pixel density',()=>{
 const css=read('assets/swapp-genre-discovery.css');
 assert.match(css,/#swapp-catalogue-lab \.scl-game-poster-image\{z-index:0\}/);
 assert.match(css,/#swapp-catalogue-lab \.scl-game-poster-image::after\{content:none!important\}/);
 assert.match(css,/#swapp-catalogue-lab \.scl-game-poster-image img\{[\s\S]*?filter:none!important;transform:none!important/);
});
