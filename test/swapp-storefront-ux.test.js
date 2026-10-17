'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-storefront.js'),'utf8');

function fixture(){
 const node=(data={})=>({
  dataset:data,hidden:false,listeners:{},attributes:{},
  classList:{contains(){return false},toggle(name,on){this[name]=on}},
  addEventListener(name,fn){this.listeners[name]=fn},
  setAttribute(name,value){this.attributes[name]=value},
  focus(){this.focused=true},
  click(){this.listeners.click?.()},
  input(){this.listeners.input?.()},
  change(){this.listeners.change?.()}
 });
 const cards=[
  node({shopKind:'games',shopTitle:'Clair Obscur'}),
  node({shopKind:'caps',shopTitle:'Casquette noire'}),
  node({shopKind:'pads',shopTitle:'Deskmat'}),
  node({shopKind:'games',shopTitle:'Hades II'})
 ];
 const filters=['all','games','caps','pads'].map(v=>node({shopFilter:v}));
 const targets=['games','caps','pads'].map(v=>node({shopCategoryTarget:v}));
 const search=node(),sort=node(),count=node(),empty=node(),reset=node();
 search.value='';sort.value='featured';count.textContent='';
 const grid={
  ordered:cards.slice(),
  querySelectorAll:()=>cards,
  appendChild(fragment){this.ordered=fragment.children}
 };
 const images=[node({shopImage:'https://cdn.example/one.jpg'}),node({shopImage:'https://cdn.example/two.jpg'})];
 const main={src:'https://cdn.example/one.jpg'};
 const byId={
  'swapp-store-products':grid,'swapp-store-search':search,'swapp-store-sort':sort,
  'shop-result-count':count,'swapp-store-no-results':empty,
  'swapp-store-reset':reset,'swapp-store-main-image':main
 };
 const root={querySelectorAll(selector){
  if(selector==='[data-shop-filter]')return filters;
  if(selector==='[data-shop-category-target]')return targets;
  throw Error('Unexpected selector '+selector);
 }};
 const document={
  querySelector:selector=>selector==='.swapp-store'?root:null,
  querySelectorAll:selector=>selector==='[data-shop-image]'?images:[],
  getElementById:id=>byId[id],
  createDocumentFragment:()=>({children:[],appendChild(n){this.children.push(n)}})
 };
 vm.runInNewContext(script,{document});
 return {cards,filters,targets,search,sort,count,empty,reset,grid,images,main};
}
test('shopfront initially renders every actual product and all filters are keyboard-ready',()=>{
 const f=fixture();
 assert.equal(f.count.textContent,'4 résultats');
 assert.ok(f.cards.every(c=>!c.hidden));
 assert.equal(f.filters[0].attributes['aria-pressed'],'true');
 assert.equal(f.filters[1].attributes['aria-pressed'],'false');
});
test('a department filters products and the search bar narrows the results',()=>{
 const f=fixture();
 f.filters[1].click();
 assert.equal(f.count.textContent,'2 résultats');
 assert.equal(f.cards.filter(c=>!c.hidden).length,2);
 f.search.value='hades';f.search.input();
 assert.equal(f.count.textContent,'1 résultat');
 assert.equal(f.cards.find(c=>c.dataset.shopTitle==='Hades II').hidden,false);
 f.search.value='nothing';f.search.input();
 assert.equal(f.empty.hidden,false);
 f.reset.click();
 assert.equal(f.count.textContent,'4 résultats');
 assert.equal(f.empty.hidden,true);
 assert.equal(f.search.value,'');
 assert.equal(f.search.focused,true);
});
test('clicking a department card sets its filter, sorting reorders matching products',()=>{
 const f=fixture();
 f.targets[1].click();
 assert.equal(f.count.textContent,'1 résultat');
 f.filters[0].click();
 f.sort.value='za';f.sort.change();
 assert.equal(f.grid.ordered[0].dataset.shopTitle,'Hades II');
 assert.equal(f.grid.ordered[f.grid.ordered.length-1].dataset.shopTitle,'Casquette noire');
});
test('gallery thumbnails update the actual main picture, with HTTPS validation',()=>{
 const f=fixture();
 f.images[1].click();
 assert.equal(f.main.src,'https://cdn.example/two.jpg');
 assert.equal(f.images[1].attributes['aria-pressed'],'true');
 assert.equal(f.images[0].attributes['aria-pressed'],'false');
 f.images[0].dataset.shopImage='javascript:alert(1)';
 f.images[0].click();
 assert.equal(f.main.src,'https://cdn.example/two.jpg');
});
test('legacy gallery editor stays safe but its retail client is not loaded by Steam-only public store',()=>{
 assert.doesNotMatch(script,/fetch\(|localStorage|sessionStorage|sendBeacon|gtag\(/i);
 const source=fs.readFileSync(path.join(__dirname,'../modules/swapp-hubs.js'),'utf8');
 assert.match(source,/function shopProduct\(product,products=demoProducts\)/);
 assert.match(source,/SWAPP \/ GAME STORE · FRANCE/);
 const page=source.slice(source.indexOf('function shop(_products='),source.indexOf('function shopProduct('));
 assert.doesNotMatch(page,/swapp-storefront\.js|swapp-store-products|swapp-store-departments/);
 assert.match(page,/swapp-editorial-top\.css\?v=20261017-top10-only-v20/);
 assert.doesNotMatch(source,/Ajouter au panier|Paiement sécurisé|Fausse disponibilité/);

});
