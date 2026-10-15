'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {forArticle,findByGame,shopProducts,catalog,referralHome}=require('../assets/swapp-instant-gaming');
const {renderNewsStory}=require('../modules/swapp-news/native-pages');
const {shop}=require('../modules/swapp-hubs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('only verified game matches receive a product-specific SANSAHD referral link',()=>{
 const expected={
  'Valor Mortis':'20157-acheter-valor-mortis-pc-steam/',
  'Planet Zoo 2':'21064-acheter-planet-zoo-2-pc-steam/',
  '007 First Light':'22735-acheter-007-first-light-pc-steam/',
  'CODE VEIN II':'19500-acheter-code-vein-ii-pc-steam/'
 };
 assert.equal(catalog.length,4);
 for(const [game,path] of Object.entries(expected)){
  const offer=findByGame(game);
  assert.equal(offer.game.toLocaleLowerCase('fr'),game.toLocaleLowerCase('fr'));
  assert.equal(offer.url,'https://www.instant-gaming.com/fr/'+path+'?igr=SANSAHD');
  assert.equal(offer.affiliate,true);
 }
 assert.equal(referralHome,'https://www.instant-gaming.com/fr/?igr=SANSAHD');
});
test('a generic franchise, similar title or unrelated game does not show a bogus purchase',()=>{
 for(const game of ['Planet Zoo','World of Warcraft','007','Valor Mortis Deluxe','Spiderman','',null])
  assert.equal(findByGame(game),null);
 assert.equal(forArticle({game:'World of Warcraft',title:'Un détour par 007 First Light'}),null);
 assert.equal(forArticle({title:'Planet Zoo 2 est disponible !'}).game,'Planet Zoo 2');
 assert.equal(forArticle({title:'Conseils pour World of Warcraft'}),null);
 assert.equal(forArticle({game:'Code Vein 2'}).id,'code-vein-ii');
});
test('native article displays a single disclosed partner link adjacent to discovery',()=>{
 const html=renderNewsStory({slug:'valor-mortis-analyse',title:'Valor Mortis est sorti',game:'Valor Mortis',category:'Actualités JV',
  summary:'Un jeu napoléonien',body:'## Histoire\n\nNotre analyse complète.'});
 assert.match(html,/À découvrir ensuite/);
 assert.match(html,/PARTENAIRE · LIEN AFFILIÉ/);
 assert.match(html,/href="https:\/\/www\.instant-gaming\.com\/fr\/20157-acheter-valor-mortis-pc-steam\/\?igr=SANSAHD"/);
 assert.match(html,/rel="sponsored nofollow noopener noreferrer"/);
 assert.match(html,/SWAPP peut toucher une commission/);
 assert.equal((html.match(/class="swapp-affiliate-offer"/g)||[]).length,1);
 const other=renderNewsStory({slug:'game-news',title:'World of Warcraft : actualités',game:'World of Warcraft',body:'Texte'});
 assert.doesNotMatch(other,/swapp-affiliate-offer/);
});
test('Boutique includes real curated offers and always labels affiliate commissions',()=>{
 const html=shop();
 for(const {game,url} of shopProducts()){
  assert.ok(html.includes(game));
  assert.ok(html.includes(url.replace(/&/g,'&amp;')));
 }
 assert.equal((html.match(/rel="sponsored nofollow noopener noreferrer"/g)||[]).length,4);
 assert.equal((html.match(/Lien affilié : SWAPP peut percevoir une commission/g)||[]).length,4);
 assert.doesNotMatch(html,/\b(?:29\.99|36\.99|46\.99)\s*€/);
});
test('editor-provided Boutique products remain prioritized above default affiliate catalogue',()=>{
 const html=shop([{title:'Création SWAPP',url:'https://merchant.example/item',merchant:'Partenaire',affiliate:false}]);
 assert.match(html,/Création SWAPP/);
 assert.doesNotMatch(html,/igr=SANSAHD/);
});
test('SPA and native reader have the same affiliate disclosure and no tracking scripts',()=>{
 const spa=read('assets/swapp-actus-app.js'),native=read('modules/swapp-news/native-pages.js'),shell=read('index.html');
 assert.match(spa,/SwappInstantGaming\?\.forArticle\?\.\(a\)/);
 assert.match(spa,/PARTENAIRE · LIEN AFFILIÉ/);
 assert.match(spa,/shopLink\.rel='sponsored nofollow noopener noreferrer'/);
 assert.match(native,/instantGaming\.forArticle\(article\)/);
 assert.match(shell,/swapp-instant-gaming\.js\?v=20261016-ig-offers-1/);
 assert.match(read('assets/swapp-article-immersive.css'),/swapp-affiliate-offer/);
 assert.doesNotMatch(read('assets/swapp-instant-gaming.js'),/fetch\(|sendBeacon\(|localStorage\./);
});
