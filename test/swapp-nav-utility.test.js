'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {latestSnapshot,isNewer}=require('../assets/swapp-nav-utility');
const {renderPage,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');
const {catalogueContent}=require('../modules/swapp-catalogue-lab');

const old=[{slug:'article-deja-lu',publishedAt:'2026-11-13T12:00:00Z'}];
const fresh=[...old,{slug:'nouvelle-actualite',publishedAt:'2026-11-14T12:00:00Z'}];

test('une nouvelle publication réelle déclenche le témoin',()=>{
 assert.equal(isNewer(latestSnapshot(fresh),latestSnapshot(old)),true);
});
test('un même catalogue ou un article retiré ne provoque aucune fausse alerte',()=>{
 assert.equal(isNewer(latestSnapshot(old),latestSnapshot(old)),false);
 assert.equal(isNewer(latestSnapshot(old),latestSnapshot(fresh)),false);
 assert.equal(latestSnapshot([{slug:'manque-date'}]),null);
});
test('une seconde publication au même instant est détectée par son slug',()=>{
 const t='2026-11-14T12:00:00Z';
 assert.equal(isNewer(latestSnapshot([{slug:'article-deja-lu',publishedAt:t},{slug:'nouvelle-actualite',publishedAt:t}]),
   latestSnapshot([{slug:'article-deja-lu',publishedAt:t}])),true);
});
test('la navigation serveur inclut loupe, témoin et CSS commun',()=>{
 const html=renderPage({head:SHARED_HEAD_SLOT,content:'<main>SWAPP</main>'});
 assert.match(html,/swapp-nav-utility\.js/);
 assert.match(html,/swapp-nav-utility\.css/);
 assert.match(html,/id="nav"/);
});
test('la SPA inclut les contrôles et le catalogue conserve son filtrage natif',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const script=fs.readFileSync(path.join(__dirname,'..','assets','swapp-catalogue-lab.js'),'utf8');
 assert.match(html,/swapp-nav-utility\.js/);
 assert.match(html,/swapp-nav-utility\.css/);
 assert.match(catalogueContent({publicHome:true}),/id="scl-search"/);
 assert.match(script,/const initialSearch=new URLSearchParams\(window\.location\.search\)\.get\('q'\)/);
});

test('la loupe, le filtrage immédiat et la bulle sont opérationnels sans API extérieure',()=>{
 const {install}=require('../assets/swapp-nav-utility');
 const cl=()=>{const set=new Set();return {add:x=>set.add(x),contains:x=>set.has(x),toggle(x,v){if(v)set.add(x);else set.delete(x)}}};
 const node=tag=>({
  tagName:tag,children:[],attributes:{},listeners:{},classList:cl(),hidden:false,
  append(...elements){this.children.push(...elements)},
  setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]||null},
  removeAttribute(k){delete this.attributes[k]},
  addEventListener(k,cb){this.listeners[k]=cb},
  focus(){this.focused=true},contains(target){return this===target}
 });
 const header=node('div'),account=node('div'),nav=node('nav'),mobile=node('nav');
 const catalogue=node('input'),desktopNews=node('a'),mobileNews=node('a');
 header.querySelector=k=>k==='.userArea'?account:null;
 header.insertBefore=element=>header.children.push(element);
 const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};
 const listeners={};
 const document={
  visibilityState:'visible',documentElement:{classList:cl()},
  querySelector:k=>k==='header.top .topbar'?header:k==='main.app > #home.view.active'?{}:null,
  querySelectorAll:k=>k.includes('a[href="/actus"]')?[desktopNews,mobileNews]:[],
  getElementById:k=>({'nav':nav,'mobileNav':mobile,'scl-search':catalogue})[k]||null,
  createElement:node,addEventListener:(k,cb)=>{listeners[k]=cb}
 };
 let didFilter=false;
 catalogue.dispatchEvent=event=>{if(event.type==='input')didFilter=true};
 const win={
  document,location:{pathname:'/',search:'',assign(){throw Error('Unwanted navigation')}},
  Event:function(type){this.type=type},localStorage:storage(),sessionStorage:storage(),
  addEventListener(k,cb){this[k]=cb},setInterval(){},setTimeout(){}
 };
 const original=global.MutationObserver;
 global.MutationObserver=class{observe(){}};
 try{
  install(win);
  const [search,bell]=header.children[0].children;
  const [toggle,panel]=search.children;
  const input=panel.children[1];
  assert.equal(bell.className,'swapp-nav-news-bell');
  assert.equal(bell.href,'/actus');
  assert.equal(bell.attributes['aria-label'],'Actualités — ouvrir le magazine SWAPP');
  assert.equal(panel.hidden,true);
  toggle.listeners.click();
  assert.equal(panel.hidden,false);
  assert.equal(toggle.attributes['aria-expanded'],'true');
  assert.equal(input.focused,true);
  input.value='jeu recherché';input.listeners.input();
  assert.equal(catalogue.value,'jeu recherché');
  assert.equal(didFilter,true);
  const old=[{slug:'premiere-actu',publishedAt:'2026-11-13T12:00:00Z'}];
  const current=[{slug:'nouvelle-actu',publishedAt:'2026-11-14T12:00:00Z'}];
  win['swapp:news-loaded']({detail:{articles:old}});
  assert.equal(bell.classList.contains('swapp-nav-news-unread'),false);
  win['swapp:news-loaded']({detail:{articles:current}});
  assert.equal(bell.classList.contains('swapp-nav-news-unread'),true);
  assert.equal(bell.attributes['aria-label'],'Nouvelle actualité — ouvrir le magazine SWAPP');
  assert.equal(desktopNews.classList.contains('swapp-nav-news-unread'),false);
  assert.equal(mobileNews.classList.contains('swapp-nav-news-unread'),false);
  listeners.click({target:{closest:()=>bell}});
  assert.equal(bell.classList.contains('swapp-nav-news-unread'),false);
  assert.equal(bell.attributes['aria-label'],'Actualités — ouvrir le magazine SWAPP');
  listeners.keydown({key:'Escape',preventDefault(){}});
  assert.equal(panel.hidden,true);
 }finally{
  if(original===undefined)delete global.MutationObserver;
  else global.MutationObserver=original;
 }
});

test('le point de notification est attaché à la cloche, jamais au menu Actualité',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','assets','swapp-nav-utility.css'),'utf8');
 assert.match(css,/\.swapp-nav-news-bell\.swapp-nav-news-unread::after/);
 assert.doesNotMatch(css,/a\[href="\/actus"\]\.swapp-nav-news-unread/);
});
