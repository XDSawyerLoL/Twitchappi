'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {CATEGORIES,demoProducts,normalizeAll,createCatalogStore}=require('../modules/swapp-shop-catalog');
const {shop,shopAdmin}=require('../modules/swapp-hubs');
const {createShopRouter}=require('../modules/swapp-shop-router');
const {makeNewsEditorGuard}=require('../modules/swapp-news/editor-auth');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

function db(){
 const state=new Map();
 const ref={
  async get(){return state.has('catalog')?{exists:true,data:()=>structuredClone(state.get('catalog'))}:{exists:false}},
  key:'catalog'
 };
 return {state,collection:name=>{
  assert.equal(name,'swapp_shop');
  return {doc:id=>{assert.equal(id,'catalog_v1');return ref}};
 },async runTransaction(fn){
  const changes=[];
  const tx={
   get:async r=>r.get(),
   update:(_r,v)=>changes.push(()=>state.set('catalog',structuredClone(v))),
   create:(_r,v)=>changes.push(()=>state.set('catalog',structuredClone(v)))
  };
  const out=await fn(tx);changes.forEach(x=>x());return out;
 }};
}
function real(extra={}){return {id:'cap-real',kind:'caps',title:'Casquette test',description:'Marchandise vérifiée',badge:'Sélection',merchant:'Marchand',
 url:'https://merchant.example/casquette',image:'https://cdn.example/img.jpg',affiliate:true,demo:false,visible:true,...extra}}

test('shop has seven honest examples and exactly three editorial columns',()=>{
 assert.equal(demoProducts.length,7);
 assert.deepEqual(CATEGORIES.map(x=>x.id),['games','caps','pads']);
 const html=shop();
 assert.match(html,/swapp-shop-hero/);
 assert.match(html,/swapp-shop-categories/);
 assert.match(html,/Clair Obscur: Expedition 33/);
 assert.match(html,/Hades II/);
 assert.match(html,/Ghost of Yōtei/);
 for(const label of ['Jeux vidéo','Casquettes','Tapis de souris'])assert.ok(html.includes(label),label);
 assert.equal((html.match(/class="swapp-shop-aisle" id=/g)||[]).length,3);
 assert.equal((html.match(/class="swapp-shop-card /g)||[]).length,3);
 assert.equal((html.match(/class="swapp-shop-demo-chip"/g)||[]).length,7);
 assert.doesNotMatch(html,/swapp-shop-buy|Ajouter au panier|Paiement sécurisé|Prix barré/);
 assert.match(html,/Vitrine de démonstration/);
});
test('normalization prevents unsafe external links, duplicates, excessive content and fake paid demos',()=>{
 assert.throws(()=>normalizeAll([real({url:'javascript:alert(1)'})]),/HTTPS/);
 assert.throws(()=>normalizeAll([real({image:'http://evil.example/asset'})]),/HTTPS/);
 assert.throws(()=>normalizeAll([real({merchant:''})]),/marchand/i);
 assert.throws(()=>normalizeAll([real(),real()]),/dupliqué/i);
 assert.throws(()=>normalizeAll([real({id:'__proto__'})]),/Identifiant/);
 assert.throws(()=>normalizeAll(Array(37).fill(real())),/36/);
 const demo=normalizeAll([real({demo:true,affiliate:true,url:'',merchant:''})])[0];
 assert.equal(demo.affiliate,false);assert.equal(demo.url,'');
 const unsafeText=real({title:'<img src=x onerror=alert(1)>'});
 const html=shop([unsafeText],{source:'managed'});
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img/);
 assert.match(html,/rel="sponsored nofollow noopener noreferrer"/);
 assert.match(html,/https:\/\/merchant\.example\/casquette/);
});
test('published catalog is used instead of demos; hidden items stay hidden',()=>{
 const html=shop([real({visible:false}),real({id:'second',title:'Visible',affiliate:false})],{source:'managed'});
 assert.doesNotMatch(html,/Casquette test/);
 assert.match(html,/Visible/);
 assert.doesNotMatch(html,/Lien affilié|Vitrine de démonstration/);
});
test('catalog persists with revision-safe Firestore transactions, without altering editorials',async()=>{
 const database=db(),store=createCatalogStore({firestore:database});
 const initial=await store.load();assert.equal(initial.source,'demo');assert.equal(initial.revision,0);
 const edited=await store.save({revision:0,products:[real()]});
 assert.equal(edited.revision,1);
 const after=await store.load();
 assert.equal(after.source,'managed');assert.deepEqual(after.products.map(x=>x.id),['cap-real']);
 await assert.rejects(store.save({revision:0,products:[real()]}),e=>e.status===409);
 assert.deepEqual([...database.state.keys()],['catalog']);
});
test('read-only fallback does not claim an admin edit was persisted',async()=>{
 const store=createCatalogStore({});
 const fallback=await store.load();
 assert.equal(fallback.writable,false);assert.equal(fallback.products.length,7);
 await assert.rejects(store.save({revision:0,products:[real()]}),e=>e.status===503);
});
function mockExpress(){
 const routes=[];return {routes,Router:()=>({
  get:(name,...h)=>routes.push({method:'GET',name,handlers:h}),
  put:(name,...h)=>routes.push({method:'PUT',name,handlers:h})
 })};
}
async function send(router,method,name,{authorized=false,origin='https://swapp.tv',headers={},body={}}={}){
 const route=router.routes.find(x=>x.name===name&&x.method===method);assert.ok(route,name);
 const req={method,path:name,headers:{origin,...headers},body,
  session:{oryonUser:authorized?{login:'admin',id:'owner-id'}:null}};
 const res={statusCode:200,headers:{},status(code){this.statusCode=code;return this},
  json(value){this.data=value;return this},type(type){this.headers.type=type;return this},
  set(name,value){this.headers[name]=value;return this},send(value){this.data=value;return this}};
 async function step(i){
  const fn=route.handlers[i];if(!fn)return;
  let called=false;
  await fn(req,res,()=>{called=true});
  if(called)await step(i+1);
 }
 await step(0);return res;
}
test('admin and editor endpoints require pinned admin role, same origin and explicit CSRF header',async()=>{
 const database=db(),store=createCatalogStore({firestore:database});
 const express=mockExpress(),guard=makeNewsEditorGuard({
  isSessionAdmin:req=>!!req.session?.oryonUser?.id,allowedOrigins:['https://swapp.tv'],
  isProduction:true
 });
 const router=createShopRouter({express,store,requireEditor:guard,shop,shopAdmin});
 const denied=await send(router,'PUT','/api/editor/boutique',{body:{revision:0,products:[real()]}});
 assert.equal(denied.statusCode,403);assert.equal(database.state.size,0);
 const noCsrf=await send(router,'PUT','/api/editor/boutique',{authorized:true,body:{revision:0,products:[real()]}});
 assert.equal(noCsrf.statusCode,403);
 const forged=await send(router,'PUT','/api/editor/boutique',{authorized:true,origin:'https://evil.example',headers:{'x-swapp-editor':'1'},body:{revision:0,products:[real()]}});
 assert.equal(forged.statusCode,403);
 const saved=await send(router,'PUT','/api/editor/boutique',{authorized:true,headers:{'x-swapp-editor':'1'},body:{revision:0,products:[real()]}});
 assert.equal(saved.statusCode,200);assert.equal(saved.data.revision,1);
 const published=await send(router,'GET','/boutique');
 assert.match(published.data,/Casquette test/);
 assert.doesNotMatch(published.data,/Casquette Nocturne/);
 const secret=await send(router,'GET','/boutique/admin');
 assert.equal(secret.statusCode,403);
 const admin=await send(router,'GET','/boutique/admin',{authorized:true});
 assert.match(admin.data,/shop-admin-editor/);assert.match(admin.data,/noindex,nofollow/);
});
test('admin menu, editor scripts and CSS are wired on every SWAPP page without checkout',()=>{
 for(const html of [read('index.html'),read('modules/swapp-news/site-shell.js')]){
  assert.match(html,/swapp-editor-nav\.js\?v=20261016-shop-admin-1/);
 }
 const nav=read('assets/swapp-editor-nav.js');
 assert.match(nav,/data\.swappShopAdminLink|swappShopAdminLink/);
 assert.match(nav,/href='\/boutique\/admin'/);
 assert.match(read('modules/swapp-news/editor-ui.js'),/Gestion Boutique · Produits/);
 const admin=shopAdmin();
 for(const target of ['shop-admin-new','shop-admin-list','shop-admin-editor','shop-admin-save'])
  assert.ok(admin.includes('id="'+target+'"'));
 const client=read('assets/swapp-shop-admin.js');
 assert.match(client,/credentials:'same-origin'/);
 assert.match(client,/'x-swapp-editor'='1'|options\.headers\['x-swapp-editor'\]='1'/);
 assert.match(client,/revision,products/);
 assert.doesNotMatch(client,/localStorage|Stripe|paypal/i);
 const styles=read('assets/swapp-shop.css');
 assert.match(styles,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(styles,/@media\(max-width:700px\)/);
 assert.match(styles,/safe-area|swapp-shop-hero/);
});


test('Amazon draft link is prepared as an unpublished product without guessing details',()=>{
 const html=shopAdmin();
 assert.match(html,/shop-admin-amazon-start/);
 assert.match(html,/value="https:\/\/link\.amazon\/B01fj5Alw"/);
 assert.match(html,/shop-admin-preview/);
 assert.match(html,/Le lien a été fourni par l’administrateur/);
 assert.match(html,/v=20261016-shop-v3-amazon-drafts/);
 const src=read('assets/swapp-shop-admin.js');
 const start=src.indexOf(' function amazonLink(raw){');
 const end=src.indexOf(' function updatePreview(){',start);
 assert.ok(start>0&&end>start);
 const accept=new Function('URL',src.slice(start,end)+'\nreturn amazonLink;')(URL);
 for(const url of ['https://link.amazon/B01fj5Alw','https://amzn.to/my-link','https://www.amazon.fr/dp/B012345678'])
  assert.equal(accept(url),url);
 for(const url of ['https://amazon.fr.bad.example/any','http://amazon.fr/p','javascript:alert(1)','https://evil.example/x'])
  assert.equal(accept(url),'');
 assert.match(src,/field\('visible'\)\.checked=false/);
 assert.match(src,/field\('affiliate'\)\.checked=true/);
 assert.match(src,/field\('demo'\)\.checked=false/);
 assert.match(src,/field\('merchant'\)\.value='Amazon'/);
 assert.match(src,/field\('url'\)\.value=link/);
 assert.match(src,/if\(select\(-1,true\)===false\)return/);
 assert.match(src,/if\(!input\.title\)throw Error/);
 assert.match(src,/if\(!writable\)return/);
 assert.doesNotMatch(src,/fetch\(['"]https:\/\/|sendBeacon|gtag\(/);
});

test('draft product preview stays local, keyboard-accessible, and does not publish or invent a price',()=>{
 const html=shopAdmin(),source=read('assets/swapp-shop-admin.js');
 const css=read('assets/swapp-shop-admin.css');
 assert.match(html,/role="status" aria-live="polite"/);
 assert.match(source,/function updatePreview\(\)/);
 assert.match(source,/root\.replaceChildren\(\)/);
 assert.match(source,/picture\.addEventListener\('error'/);
 assert.match(source,/picture\.decoding='async'/);
 assert.match(source,/Prévisualisation locale/);
 assert.doesNotMatch(source,/Math\.random|Prix garanti|en stock/i);
 assert.match(css,/swapp-shop-amazon-row/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/swapp-shop-editor-preview/);
});
