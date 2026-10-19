'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {forArticle,findByGame,catalog,referralHome}=require('../assets/swapp-instant-gaming');
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
 assert.match(html,/OFFRE INSTANT GAMING · LIEN AFFILIÉ/);
 assert.match(html,/href="https:\/\/www\.instant-gaming\.com\/fr\/20157-acheter-valor-mortis-pc-steam\/\?igr=SANSAHD"/);
 assert.match(html,/rel="sponsored nofollow noopener noreferrer"/);
 assert.match(html,/Voir l’offre ↗/);
 assert.doesNotMatch(html,/SWAPP peut toucher une commission/);
 assert.match(read('modules/swapp-news/legal-pages.js'),/Liens affiliés et offres partenaires/);
 assert.match(read('modules/swapp-news/legal-pages.js'),/SWAPP peut recevoir une commission/);
 assert.equal((html.match(/class="swapp-affiliate-offer"/g)||[]).length,1);
 const other=renderNewsStory({slug:'game-news',title:'World of Warcraft : actualités',game:'World of Warcraft',body:'Texte'});
 assert.doesNotMatch(other,/swapp-affiliate-offer/);
});
test('Boutique stays independent and never adds Instant Gaming products automatically',()=>{
 const html=shop();
 assert.match(html,/La Boutique prend forme/);
 assert.match(html,/Aucun des exemples n’est proposé|aperçus non commercialisés/);
 assert.doesNotMatch(html,/igr=SANSAHD|instant-gaming\.com/);
 for(const offer of catalog)assert.ok(!html.includes(offer.game));
 assert.doesNotMatch(html,/Lien affilié : SWAPP peut percevoir une commission/);
});
test('editor-provided Boutique products remain visible without editorial affiliate spillover',()=>{
 const html=shop([{id:'creation-swapp',kind:'caps',title:'Création SWAPP',
  url:'https://merchant.example/item',image:'https://cdn.example/item.jpg',merchant:'Partenaire',affiliate:false,demo:false,visible:true}],{source:'managed'});
 assert.match(html,/Création SWAPP/);
 assert.doesNotMatch(html,/igr=SANSAHD/);
});
test('SPA and native reader have the same affiliate disclosure and no tracking scripts',()=>{
 const spa=read('assets/swapp-actus-app.js'),native=read('modules/swapp-news/native-pages.js'),shell=read('index.html');
 assert.match(spa,/SwappInstantGaming\?\.forArticle\?\.\(a\)/);
 assert.match(spa,/OFFRE INSTANT GAMING · LIEN AFFILIÉ/);
 assert.match(spa,/shopLink\.rel='sponsored nofollow noopener noreferrer'/);
 assert.match(native,/instantGaming\.forArticle\(article\)/);
 assert.match(shell,/swapp-instant-gaming\.js\?v=20261016-ig-offers-1/);
 assert.match(read('assets/swapp-article-immersive.css'),/swapp-affiliate-offer/);
 assert.doesNotMatch(read('assets/swapp-instant-gaming.js'),/fetch\(|sendBeacon\(|localStorage\./);
});


test('a game article with an existing commercial partner is not overloaded with another ad',()=>{
 const article={slug:'valor-mortis-with-partner',title:'Valor Mortis',game:'Valor Mortis',
  body:'## Test\n\nLecture du jeu',commercialLinks:[{title:'Voir le jeu',merchant:'Partenaire',url:'https://example.com/item',kind:'affiliate'}]};
 const html=renderNewsStory(article);
 assert.equal((html.match(/class="swapp-affiliate-offer swapp-affiliate-manual"/g)||[]).length,1);
 assert.match(html,/href="https:\/\/example\.com\/item"/);
 assert.match(read('assets/swapp-actus-app.js'),/SwappArticleExtras\?\.partnerOffersHtml\?\.\(a\)/);
 assert.doesNotMatch(html,/swapp-article-commerce|Pour aller plus loin/);
});

test('Witcher manually entered Instant Gaming URL uses right-hand À découvrir ensuite offer',()=>{
 const referral='https://www.instant-gaming.com/fr/1497-acheter-the-witcher-3-wild-hunt/?igr=SANSAHD';
 const article={slug:'the-witcher-3-remastered-le-retour-spectaculaire-de-geralt-onze-ans-apres',
  title:'The Witcher 3 Remastered : le retour spectaculaire de Geralt',
  game:'The Witcher 3: Wild Hunt Remastered',
  category:'Actualités JV',body:'## Retour de Geralt\n\nUne analyse de la rédaction.',
  commercialLinks:[{title:'Offre toi le jeu!',merchant:'Instant Gaming',url:referral,kind:'affiliate'}]};
 const html=renderNewsStory(article);
 const rail=html.match(/<details class="swapp-reader-next" open>([\s\S]*?)<\/details>/)?.[1]||'';
 assert.match(rail,/À découvrir ensuite/);
 assert.match(rail,/class="swapp-affiliate-offer swapp-affiliate-manual"/);
 assert.match(rail,/OFFRE INSTANT GAMING · LIEN AFFILIÉ/);
 assert.match(rail,/Voir l’offre ↗/);
 assert.match(rail,/href="https:\/\/www\.instant-gaming\.com\/fr\/1497-acheter-the-witcher-3-wild-hunt\/\?igr=SANSAHD"/);
 assert.match(rail,/rel="sponsored nofollow noopener noreferrer"/);
 assert.equal((html.match(/swapp-affiliate-offer swapp-affiliate-manual/g)||[]).length,1);
 assert.doesNotMatch(html,/Pour aller plus loin|swapp-article-commerce/);
 const library=read('assets/swapp-article-extras.js');
 assert.match(library,/function partnerOffersHtml\(a\)/);
 assert.match(library,/function renderServer\(article\)\{return sourcesHtml\(article\)\+editorialVerdictHtml\(article\)\}/);
 assert.match(read('modules/swapp-news/native-pages.js'),/const manualPartner=articleExtras\.partnerOffersHtml\(article\)/);
 const spa=read('assets/swapp-actus-app.js');
 assert.match(spa,/SwappArticleExtras\?\.partnerOffersHtml\?\.\(a\)/);
 assert.match(spa,/recommend\.append\(\.\.\.holder\.children\)/);
});
test('editor supplied Amazon commercial offers still carry statutory partner disclosure',()=>{
 const html=renderNewsStory({slug:'article-affiliation-amazon',title:'Un jeu',body:'Article de test',
  commercialLinks:[{title:'Offre Amazon',merchant:'Amazon',url:'https://link.amazon/example',kind:'affiliate'}]});
 assert.match(html,/En tant que Partenaire Amazon, je réalise un bénéfice/);
 assert.match(html,/swapp-affiliate-offer swapp-affiliate-manual/);
 assert.doesNotMatch(html,/Pour aller plus loin/);
});
