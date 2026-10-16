'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function navigationInternals(){
 const source=read('assets/swapp-hub-nav.js');
 const marker=' function desktop(){';
 const index=source.indexOf(marker);
 assert.ok(index>0,'Navigation internals boundary changed');
 // Run the exact production account lookup/deduplication code in isolation.
 const script=source.slice(0,index)+'\n globalThis.__navTest={dest,dedupe};\n})();';
 const context={location:{origin:'https://swapp.tv',pathname:'/communaute'},URL};
 vm.runInNewContext(script,context);
 return context.__navTest;
}

function fakeMenu(){
 const root={elements:[]};
 root.querySelectorAll=()=>root.elements.slice();
 const link=(href='/compte',label='Compte')=>{
  const el={
   tagName:'A',href,textContent:label,
   getAttribute(name){return name==='href'?this.href:null},
   closest(sel){return sel==='#mobileNav'?root:null},
   remove(){root.elements=root.elements.filter(x=>x!==this)}
  };
  root.elements.push(el);
  return el;
 };
 return {root,link};
}

test('the account route is recognizable as a path and as a label',()=>{
 const {dest}=navigationInternals();
 const {link}=fakeMenu();
 assert.equal(dest(link()),'/compte');
 assert.equal(dest(link('/compte','Compte')),'/compte');
 assert.equal(dest(link('', 'Compte')),'/compte');
});

test('reconciliation collapses hundreds of repeated Compte links to one',()=>{
 const {dest,dedupe}=navigationInternals();
 const {root,link}=fakeMenu();
 for(let i=0;i<80;i++)link();
 const found=dedupe(root);
 assert.equal(found.has('/compte'),true);
 assert.equal(root.elements.length,1);
 assert.equal(dest(root.elements[0]),'/compte');
});

test('reconciliation is idempotent across repeated DOM observer passes',()=>{
 const {dest,dedupe}=navigationInternals();
 const {root,link}=fakeMenu();
 for(let pass=0;pass<30;pass++){
  dedupe(root);
  const existing=new Set(root.querySelectorAll('a,button').map(dest));
  if(!existing.has('/compte'))link();
 }
 assert.equal(root.elements.filter(x=>dest(x)==='/compte').length,1);
 dedupe(root);
 assert.equal(root.elements.length,1);
});

test('secondary Plus links are hidden while collapsed and are scroll-bounded',()=>{
 const css=read('assets/swapp-unified-nav.css');
 assert.match(css,/#mobileNav \.swapp-mobile-more:not\(\[open\]\) > \.swapp-mobile-more-links\s*\{\s*display:none!important/);
 assert.match(css,/#mobileNav \.swapp-mobile-more\[open\] > \.swapp-mobile-more-links\s*\{\s*max-height:min\(62dvh,480px\)/);
});

test('both public and native pages load the corrected nav versions',()=>{
 const version='swapp-hub-nav.js?v=20261016-account-dedupe-2';
 const style='swapp-unified-nav.css?v=20261016-account-dedupe-2';
 for(const file of ['index.html','modules/swapp-news/site-shell.js']){
  const source=read(file);
  assert.ok(source.includes(version),file+' JS cache');
  assert.ok(source.includes(style),file+' stylesheet cache');
 }
});
