'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {community,trailers,shop,verifiedTrailers,safeProducts}=require('../modules/swapp-hubs');
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

test('public SOCIAL has real posts, separate sign-in and safe same-origin actions',()=>{
 const html=community();
 assert.match(html,/id="swappCommunityFeed"/);
 assert.match(html,/id="swappSocialAuthForm"/);
 assert.match(html,/swapp-community-page\.js/);
 const client=fs.readFileSync(path.resolve(__dirname,'../assets/swapp-community-page.js'),'utf8');
 assert.match(client,/\/api\/swapp\/social-preview/);
 assert.match(client,/\/api\/swapp\/social\/login/);
 assert.match(client,/\/api\/swapp\/social\/post/);
 assert.doesNotMatch(client,/localStorage\.setItem|sessionStorage\.setItem/);
 assert.doesNotMatch(client,/innerHTML\s*=/);
});

test('trailer archive only uses the verified original domain and explicit video entries',()=>{
 assert.ok(verifiedTrailers().length>0);
 assert.deepEqual(verifiedTrailers([{type:'video_embed',url:'https://evil.example/video_embeds/1234'}]),[]);
 assert.deepEqual(verifiedTrailers([{type:'post',url:'https://justplayer.fr/supporters/video_embeds/valid'}]),[]);
 const html=trailers();
 assert.match(html,/Voir la vidéo originale/);
 assert.match(html,/id="swappTrailersNative"/);
 assert.match(html,/swapp-trailers-page\.js/);
 assert.doesNotMatch(html,/<iframe/);
});

test('commercial catalog never invents products or follows unsafe merchant links',()=>{
 assert.deepEqual(safeProducts([{title:'Surprise',url:'javascript:alert(1)'}]),[]);
 const product={title:'Accessoire',description:'Produit réel',merchant:'Vendeur',url:'https://merchant.example/produit',affiliate:true};
 const html=shop([product]);
 assert.match(html,/Lien affilié/);
 assert.match(html,/rel="sponsored nofollow noopener noreferrer"/);
 assert.match(html,/merchant\.example\/produit/);
 const empty=shop();
 assert.match(empty,/Aucun produit n’est inventé/);
 assert.doesNotMatch(empty,/Prix barré|Acheter maintenant/);
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
