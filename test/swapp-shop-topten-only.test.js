'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {shop,shopProduct,shopAdmin}=require('../modules/swapp-hubs');
const {createShopRouter}=require('../modules/swapp-shop-router');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('public Boutique has exactly ten Steam France games and no retail departments',()=>{
 const html=shop();
 assert.match(html,/SWAPP \/ GAME STORE · FRANCE/);
 assert.match(html,/<h1 id="swapp-editorial-top-title">LES 10 JEUX <em>DU MOMENT\.<\/em><\/h1>/);
 assert.match(html,/Les meilleures ventes Steam France, sélectionnées au 16 octobre 2026/);
 assert.equal((html.match(/class="swapp-editorial-game" aria-label="Rang /g)||[]).length,10);
 assert.equal((html.match(/data-steam-app="[0-9]+"/g)||[]).length,10);
 for(const gone of ['swapp-store-departments','swapp-store-campaign','swapp-store-products',
  'swapp-store-catalogue','swapp-store-toolbar','swapp-store-footer',
  'La Boutique prend forme','Casquettes','Tapis de souris','Clair Obscur',
  'swapp-storefront.js','swapp-shop.css'])
   assert.ok(!html.includes(gone),'unexpected obsolete section: '+gone);
 assert.match(html,/swapp-editorial-top\.css\?v=20261017-top10-only-v20/);
 assert.doesNotMatch(html,/Ajouter au panier|Paiement sécurisé|Payer sur SWAPP/);
});

test('Steam cards lead to official pages and disclose dated prices',()=>{
 const html=shop();
 assert.equal((html.match(/>Voir sur Steam ↗<\/a>/g)||[]).length,10);
 assert.match(html,/https:\/\/store\.steampowered\.com\/charts\/topselling\/FR/);
 assert.match(html,/Sélection éditoriale datée du 16\/10\/2026, non synchronisée en direct/);
 assert.match(html,/ordre du classement et prix à vérifier/i);
 assert.match(html,/Liens marchands externes non affiliés/);
});

test('rendered Boutique is independent of admin catalogue, with data unchanged',()=>{
 const before=shop();
 const modified=shop([{id:'test-private',kind:'caps',title:'Invisible product',
   image:'https://example.com/image.jpg',visible:true,demo:false}],{source:'managed'});
 assert.equal(modified,before,'product drafts never change public ranking');
 assert.doesNotMatch(modified,/Invisible product/);
 assert.match(shopAdmin(),/shop-admin-editor/);
 assert.match(read('modules/swapp-hubs.js'),/function shopProduct\(product,products=demoProducts\)/);
});

test('public route does not query paid database, admin routes remain available',async()=>{
 const routes=[];
 const express={Router:()=>({
  get:(name,...handlers)=>routes.push({method:'GET',name,handlers}),
  put:(name,...handlers)=>routes.push({method:'PUT',name,handlers})
 })};
 const store={load:()=>{throw Error('Firestore must not run for public static top ten')},save:()=>{}};
 createShopRouter({express,store,shop,shopProduct,shopAdmin,requireEditor:(_req,_res,next)=>next()});
 const route=routes.find(r=>r.method==='GET'&&r.name==='/boutique');
 assert.ok(route);
 const response={headers:{},set(k,v){this.headers[k]=v;return this},
  type(v){this.headers.contentType=v;return this},send(v){this.body=v;return this}};
 await route.handlers[0]({},response);
 assert.match(response.body,/LES 10 JEUX/);
 assert.equal(response.headers['Cache-Control'],'public, max-age=180');
 for(const routeName of ['/boutique/admin','/api/editor/boutique','/boutique/produit/:id'])
  assert.ok(routes.some(r=>r.name===routeName),'preserve legacy or admin route: '+routeName);
});

test('ten-game responsive stylesheet remains lightweight and keyboard-accessible',()=>{
 const css=read('assets/swapp-editorial-top.css');
 const last=css.slice(css.indexOf('SWAPP GAME STORE V20'));
 assert.ok(last.length>3500);
 assert.match(last,/\.swapp-store-steam-only/);
 assert.match(last,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(last,/@media\(max-width:1150px\)/);
 assert.match(last,/@media\(max-width:740px\)/);
 assert.match(last,/@media\(max-width:380px\)/);
 assert.match(last, /:focus-visible/);
 assert.match(last,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(last,/@import|url\(https?:|@keyframes/i);
 let braces=0;
 for(const c of css.replace(/\/\*[\s\S]*?\*\//g,'')){
  braces+=c==='{'?1:c==='}'?-1:0;assert.ok(braces>=0);
 }
 assert.equal(braces,0);
});
