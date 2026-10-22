'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const script=read('assets/swapp-article-handoff.js');

function harness({pathname='/',stored=new Map(),reduce=false,imgSrc='https://images.example.net/witcher.webp',slug='witcher-3-remastered',heroCta=false,visible=true}={}){
 const events={},timeouts=[];
 const origin='https://swapp.tv';
 const location={origin,pathname,href:origin+pathname};
 const img={
  style:{},isConnected:true,complete:true,naturalWidth:1280,
  src:imgSrc,currentSrc:imgSrc,
  getAttribute:name=>name==='src'?imgSrc:null,
  getClientRects:()=>visible?[{}]:[],
  getBoundingClientRect:()=>({top:15,bottom:185,left:30,right:330}),
  closest:selector=>selector==='.article-wrap'?{dataset:{swappArticleSlug:slug}}:null
 };
 const link={
  href:origin+'/actus/'+slug,target:'',hasAttribute:()=>false,
  querySelector:()=>heroCta?null:img,
  closest:selector=>heroCta&&selector==='.swapp-home-feature-bridge'?
   {parentElement:{querySelector:()=>img}}:null
 };
 const document={
  readyState:'complete',
  addEventListener:(name,fn)=>{events['document:'+name]=fn},
  querySelector:selector=>selector.includes('article-wrap[data-swapp-article-slug]')?img:null
 };
 const window={
  matchMedia:()=>({matches:reduce}),
  addEventListener:(name,fn)=>{events['window:'+name]=fn},
  innerHeight:950,innerWidth:1300
 };
 const sessionStorage={
  getItem:key=>stored.get(key)||null,
  setItem:(key,val)=>stored.set(key,val),
  removeItem:key=>stored.delete(key)
 };
 vm.runInNewContext(script,{window,document,location,sessionStorage,URL,Date,setTimeout:fn=>{timeouts.push(fn);return timeouts.length},clearTimeout:()=>{}});
 const click=opts=>{
  const target={closest:selector=>selector==='a[href]'?link:null};
  events['document:click']({target,button:0,defaultPrevented:false,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,...opts});
 };
 return {window,events,img,link,click,stored,timeouts};
}

test('a valid visible homepage article image is named and stored for native handoff',()=>{
 const h=harness();
 h.click();
 assert.equal(h.img.style.viewTransitionName,'swapp-article-artwork');
 const saved=JSON.parse(h.stored.get('swapp_article_handoff_v1'));
 assert.equal(saved.slug,'witcher-3-remastered');
 assert.equal(saved.src,'https://images.example.net/witcher.webp');
 assert.ok(Number.isFinite(saved.at));
});

test('the separate Lire article CTA can use its neighbouring hero poster',()=>{
 const h=harness({heroCta:true});
 h.click();
 assert.equal(h.img.style.viewTransitionName,'swapp-article-artwork');
});

test('native editorial page matches slug and image before morphing',()=>{
 const stored=new Map([['swapp_article_handoff_v1',JSON.stringify({slug:'witcher-3-remastered',src:'https://images.example.net/witcher.webp',at:Date.now()})]]);
 const h=harness({pathname:'/actus/witcher-3-remastered',stored});
 assert.equal(h.img.style.viewTransitionName,'swapp-article-artwork');
 assert.equal(stored.has('swapp_article_handoff_v1'),false);
});

test('different picture, different slug or stale navigation cannot morph',()=>{
 const make=(slug,src,at)=>new Map([['swapp_article_handoff_v1',JSON.stringify({slug,src,at})]]);
 const wrongImage=harness({pathname:'/actus/witcher-3-remastered',stored:make('witcher-3-remastered','https://images.example.net/else.webp',Date.now())});
 const wrongSlug=harness({pathname:'/actus/witcher-3-remastered',stored:make('another-article','https://images.example.net/witcher.webp',Date.now())});
 const expired=harness({pathname:'/actus/witcher-3-remastered',stored:make('witcher-3-remastered','https://images.example.net/witcher.webp',Date.now()-13000)});
 for(const item of [wrongImage,wrongSlug,expired])assert.notEqual(item.img.style.viewTransitionName,'swapp-article-artwork');
});

test('modified clicks, invisible thumbnails and reduced motion preserve normal links',()=>{
 const ctrl=harness(),hidden=harness({visible:false}),reduce=harness({reduce:true});
 ctrl.click({ctrlKey:true});hidden.click();reduce.click();
 for(const item of [ctrl,hidden,reduce]){
  assert.notEqual(item.img.style.viewTransitionName,'swapp-article-artwork');
  assert.equal(item.stored.size,0);
 }
});

test('native + SPA share one safe transition contract and preserve reduced motion',()=>{
 const spa=read('index.html');
 const native=read('modules/swapp-news/site-shell.js');
 const css=read('assets/swapp-article-handoff.css');
 for(const file of [spa,native]){
  assert.match(file,/swapp-article-handoff\.css\?v=20261022-article-context-v1/);
  assert.match(file,/swapp-article-handoff\.js\?v=20261022-article-context-v1/);
 }
 assert.match(native,/swapp-route-motion\.css\?v=20261022-navigation-v1/);
 assert.match(css,/@view-transition\{navigation:auto\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/::view-transition-group\(swapp-article-artwork\)/);
 assert.doesNotMatch(script,/preventDefault|history\.pushState|location\.assign|innerHTML/);
});
