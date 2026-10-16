'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {community,trailers,shop,shopProduct,shopAdmin,verifiedTrailers,curatedVideos,safeProducts}=require('../modules/swapp-hubs');
const {assertArticle}=require('../modules/swapp-news/article-core');
const extras=require('../assets/swapp-article-extras');

test('all three SWAPP hubs preserve the original navigation and design',()=>{
 const routes=[['community',community()],['trailers',trailers()],['shop',shop()]];
 for(const [name,html] of routes){
  assert.match(html,/SWAPP/);
  assert.match(html,/class="mainNav"/);
  assert.match(html,/id="mobileNav"/);
  assert.match(html,/swapp-hubs\.css/);
  assert.match(html,/swapp-companion-core\.js/);
  assert.match(html,/href="\/communaute"/);
  assert.match(html,/href="\/bandes-annonces"/);
  assert.match(html,/href="\/boutique"/);
 }
 assert.match(routes[0][1],/aria-current="page">Communauté<\/a>/);
 assert.match(routes[1][1],/aria-current="page">Vidéos<\/a>/);
 assert.match(routes[2][1],/aria-current="page">Boutique<\/a>/);
});

test('SOCIAL is the complete Quantic network inside SWAPP, not an article preview',()=>{
 const html=community();
 assert.match(html,/id="swappSocialNative"/);
 assert.match(html,/id="pulse-feed"/);
 assert.match(html,/id="pulse-text"/);
 assert.match(html,/id="auth-modal"/);
 assert.match(html,/data-view="circles"/);
 assert.match(html,/data-view="messages"/);
 assert.match(html,/data-view="notifications"/);
 assert.match(html,/data-view="profile"/);
 assert.match(html,/swapp-social-native\/social-swapp\.css/);
 assert.match(html,/swapp-social-native\/app\.js/);
 assert.doesNotMatch(html,/id="swappCommunityFeed"/);
 const client=fs.readFileSync(path.resolve(__dirname,'../assets/swapp-social-native/core.js'),'utf8');
 assert.match(client,/API_BASE=''/);
 assert.match(client,/sessionStorage\.getItem/);
 assert.doesNotMatch(client,/https:\/\/quanticminds\.onrender\.com/);
});
test('all verified videos and original artwork appear in the SWAPP gallery',()=>{
 const videos=curatedVideos();
 assert.equal(videos.length,8);
 assert.equal(videos.filter(v=>v.series).length,5);
 assert.equal(videos.filter(v=>/^[A-Za-z0-9_-]{11}$/.test(v.youtubeId||'')).length,7);
 assert.equal(videos.filter(v=>!v.youtubeId).length,1);
 assert.ok(videos.every(v=>v.source.startsWith('https://justplayer.fr/supporters/video_embeds/')));
 const html=trailers();
 assert.match(html,/LES TRAILERS/);
 assert.match(html,/swapp-video-gallery\.css/);
 assert.match(html,/swapp-video-player\.js/);
 assert.match(html,/CODE VEIN II/);
 assert.match(html,/PLANET ZOO 2/);
 assert.match(html,/data-swapp-video-play="1"/);
 assert.match(html,/swapp-video-external/);
 assert.match(html,/href="https:\/\/justplayer\.fr\/supporters\/video_embeds\/bioshock-bientot-sur-netflix"/);
 assert.equal((html.match(/data-swapp-video-play="1"/g)||[]).length,7);
 assert.doesNotMatch(html,/data-swapp-video-youtube=""/);
 assert.match(html,/storage\.googleapis\.com/);
 assert.doesNotMatch(html,/<iframe/);
});

test('commercial catalog never invents products or follows unsafe merchant links',()=>{
 assert.deepEqual(safeProducts([{title:'Surprise',url:'javascript:alert(1)'}]),[]);
 const product={id:'casquette-test',kind:'caps',title:'Accessoire',description:'Produit réel',
  merchant:'Vendeur',url:'https://merchant.example/produit',image:'https://cdn.example/photo.jpg',affiliate:true,demo:false,visible:true};
 const html=shopProduct(product,[product]);
 assert.match(html,/Lien affilié/);
 assert.match(html,/rel="sponsored nofollow noopener noreferrer"/);
 assert.match(html,/merchant\.example\/produit/);
 const examples=shop();
 assert.match(examples,/La Boutique prend forme/);
 assert.match(examples,/Clair Obscur/);
 assert.match(examples,/Casquettes/);
 assert.match(examples,/Tapis de souris/);
 assert.doesNotMatch(examples,/instant-gaming\.com|igr=SANSAHD/);
 assert.doesNotMatch(examples,/Prix barré|Acheter maintenant/);
 assert.equal((examples.match(/class="swapp-store-product-img"/g)||[]).length,7);
});

test('editorial YouTube trailer is click-to-play only and labels every commercial link',()=>{
 assert.equal(extras.trailerId('https://www.youtube.com/watch?v=M7lc1UVf-VE'),'M7lc1UVf-VE');
 assert.equal(extras.trailerId('https://youtu.be/M7lc1UVf-VE'),'M7lc1UVf-VE');
 assert.equal(extras.trailerId('https://www.youtube.com.evil.example/watch?v=M7lc1UVf-VE'),null);
 assert.equal(extras.trailerId('javascript:alert(1)'),null);
 const article=assertArticle({
  title:'Un nouveau jeu annoncé en octobre',body:'Un texte d’article suffisamment détaillé et utile pour le lecteur, avec ses références.',
  sources:[{url:'https://example.com'}],
  trailerUrl:'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  commercialLinks:[{title:'Voir le jeu',merchant:'Marchand',url:'https://marchand.example/jeu',kind:'affiliate'}]
 },{publish:true});
 const html=extras.renderServer(article);
 assert.match(html,/swapp-trailer-launch/);
 assert.match(html,/Lien affilié|LIEN AFFILIÉ/);
 assert.match(html,/rel="sponsored nofollow noopener noreferrer"/);
 assert.doesNotMatch(html,/<iframe/);
 assert.throws(()=>assertArticle({...article,trailerUrl:'https://malicious.example/watch?v=M7lc1UVf-VE'}),/bande-annonce/);
 assert.throws(()=>assertArticle({...article,commercialLinks:[{url:'https://example.com',title:'Acheter'}]}),/commercial/);
 assert.throws(()=>assertArticle({...article,commercialLinks:Array(3).fill({title:'A',merchant:'B',url:'https://example.com',kind:'affiliate'})}),/Deux/);
});

test('both native and SPA articles display only validated editorial extras',()=>{
 const client=fs.readFileSync(path.resolve(__dirname,'../assets/swapp-actus-app.js'),'utf8');
 const native=fs.readFileSync(path.resolve(__dirname,'../modules/swapp-news/native-pages.js'),'utf8');
 const editor=fs.readFileSync(path.resolve(__dirname,'../modules/swapp-news/editor-ui.js'),'utf8');
 assert.match(client,/SwappArticleExtras\?\.mount\(article,a\)/);
 assert.match(native,/articleExtras\.renderServer\(article\)/);
 for(const id of ['trailerUrl','affTitle1','affUrl1','affMerchant1','affTitle2','affUrl2']){
  assert.ok(editor.includes('id="'+id+'"'),id+' missing');
 }
});


test('Amazon partner disclosure only on genuine affiliate commerce links',()=>{
 const {isAmazonLink,amazonDisclosure}=extras;
 assert.equal(isAmazonLink('https://www.amazon.fr/dp/EXAMPLE'),true);
 assert.equal(isAmazonLink('https://link.amazon/test-short'),true);
 assert.equal(isAmazonLink('https://amzn.to/test-short'),true);
 assert.equal(isAmazonLink('https://amazon.fr.evil.example/dp/item'),false);
 assert.equal(isAmazonLink('http://amazon.fr/dp/item'),false);
 const amazon={id:'casquette-amazon',kind:'caps',title:'Casquette vérifiée',
  merchant:'Amazon',url:'https://link.amazon/test-short',affiliate:true,demo:false,visible:true};
 const storefront=shop([amazon],{source:'managed'});
 assert.match(storefront,/Lien rémunéré par Amazon/);
 assert.match(storefront,/En tant que Partenaire Amazon, je réalise un bénéfice sur les achats remplissant les conditions requises/);
 assert.match(storefront,/rel="sponsored nofollow noopener noreferrer"/);
 assert.match(storefront,/https:\/\/link\.amazon\/test-short/);
 assert.equal((storefront.match(/En tant que Partenaire Amazon/g)||[]).length,1);
 const unremunerated=shop([{...amazon,affiliate:false}],{source:'managed'});
 assert.doesNotMatch(unremunerated,/Partenaire Amazon|Lien rémunéré par Amazon/);
 const others=shop([{...amazon,url:'https://merchant.example/product',merchant:'Autre marchand'}],{source:'managed'});
 assert.doesNotMatch(others,/Partenaire Amazon|Lien rémunéré par Amazon/);
 const demo=shop([{...amazon,demo:true}],{source:'managed'});
 assert.doesNotMatch(demo,/Partenaire Amazon|Lien rémunéré par Amazon/);
 assert.match(shopAdmin(),/Pour un lien Amazon Partenaires/);
 assert.ok(amazonDisclosure.startsWith('En tant que Partenaire Amazon'));
});

test('native and SPA articles identify Amazon commercial links without new third-party scripts',()=>{
 const article={commercialLinks:[
  {title:'Casque',merchant:'Amazon',url:'https://amzn.to/example',kind:'affiliate'},
  {title:'Autre matériel',merchant:'Autre',url:'https://merchant.example/item',kind:'affiliate'}
 ]};
 const html=extras.renderServer(article);
 assert.match(html,/LIEN RÉMUNÉRÉ PAR AMAZON/);
 assert.match(html,/LIEN AFFILIÉ · COMMISSION POSSIBLE/);
 assert.match(html,/En tant que Partenaire Amazon/);
 assert.equal((html.match(/En tant que Partenaire Amazon/g)||[]).length,1);
 assert.equal((html.match(/rel="sponsored nofollow noopener noreferrer"/g)||[]).length,2);
 assert.doesNotMatch(extras.renderServer({commercialLinks:[]}),/Partenaire Amazon/);
 assert.doesNotMatch(extras.renderServer({commercialLinks:[{
  title:'Casque',merchant:'Autre',url:'https://example.com/item',kind:'affiliate'}]}),/Partenaire Amazon/);
 const index=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const shell=fs.readFileSync(path.resolve(__dirname,'../modules/swapp-news/site-shell.js'),'utf8');
 const version='swapp-article-extras.js?v=20261016-amazon-disclosures-1';
 assert.match(index,/swapp-article-extras\.js\?v=20261016-amazon-disclosures-1/);
 assert.ok(shell.includes(version));
 const shared=fs.readFileSync(path.resolve(__dirname,'../assets/swapp-article-extras.js'),'utf8');
 assert.doesNotMatch(shared,/fetch\(|sendBeacon|localStorage/);
});
