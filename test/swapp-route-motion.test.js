'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function harness({reduced=false,loaded=false}={}){
 let active='home',observer,readyFrames=[],scrolls=[],historyCallback;
 const listeners={};
 const classList=id=>{
  const list=new Set(['view',...(id===active?['active']:[])]);
  return {contains:name=>list.has(name),add:name=>list.add(name),remove:name=>list.delete(name),values:()=>[...list]};
 };
 const pages=['home','actus','settings'].map(id=>({id,classList:classList(id)}));
 const app={
  children:pages,
  addEventListener(name,fn){listeners['app:'+name]=fn}
 };
 const document={
  readyState:loaded?'complete':'loading',
  querySelector(selector){return selector==='main.app'?app:null}
 };
 const window={
  __SWAPP_ROUTE_MOTION__:false,
  matchMedia:()=>({matches:reduced}),
  addEventListener(name,fn){listeners[name]=fn},
  scrollTo(...args){scrolls.push(args)}
 };
 class MutationObserver {
  constructor(callback){observer={callback,observed:[]}}
  observe(node,options){observer.observed.push({node,options})}
 }
 const context={window,document,MutationObserver,location:{hash:''},
  requestAnimationFrame:fn=>{readyFrames.push(fn)}};
 vm.runInNewContext(read('assets/swapp-route-motion.js'),context);
 function paint(){const frames=readyFrames.splice(0);frames.forEach(fn=>fn())}
 function route(next){
  pages.find(x=>x.id===active).classList.remove('active');
  pages.find(x=>x.id===next).classList.add('active');
  active=next;
  observer.callback();
 }
 return {
  pages,window,observer,listeners,scrolls,paint,route,
  history:()=>{listeners.popstate();},hash:value=>{context.location.hash=value;},
  eventEnd:page=>listeners['app:animationend']({animationName:'swapp-route-reveal',target:page})
 };
}

test('does not animate the initial hydration or a duplicate route',()=>{
 const x=harness({loaded:true});
 x.route('actus');
 assert.equal(x.pages[1].classList.contains('swapp-route-enter'),false);
 x.paint();x.paint();
 x.route('actus');
 assert.equal(x.scrolls.length,0);
 x.route('settings');
 assert.equal(x.pages[2].classList.contains('swapp-route-enter'),true);
 assert.equal(x.scrolls.length,1);
 x.eventEnd(x.pages[2]);
 assert.equal(x.pages[2].classList.contains('swapp-route-enter'),false);
});

test('only one page gets the animation and changing route clears previous animation',()=>{
 const x=harness({loaded:true});
 x.paint();x.paint();
 x.route('actus');
 x.route('settings');
 assert.equal(x.pages[1].classList.contains('swapp-route-enter'),false);
 assert.equal(x.pages[2].classList.contains('swapp-route-enter'),true);
});

test('history and hash routes retain scroll restoration',()=>{
 const x=harness({loaded:true});
 x.paint();x.paint();
 x.history();x.route('actus');
 assert.equal(x.scrolls.length,0);
 x.paint(); // history marker may be reset after route observer executes
 x.hash('#article-section');x.route('settings');
 assert.equal(x.scrolls.length,0);
});

test('reduced motion disables the animation but keeps sensible top-of-page navigation',()=>{
 const x=harness({loaded:true,reduced:true});
 x.paint();x.paint();x.route('actus');
 assert.equal(x.pages[1].classList.contains('swapp-route-enter'),false);
 assert.equal(x.scrolls.length,1);
});

test('asset wiring is CSS-first, only one script and loaded after SPA',()=>{
 const html=read('index.html');
 const css=read('assets/swapp-route-motion.css');
 assert.equal(html.match(/swapp-route-motion\.css\?v=/g)?.length,1);
 assert.equal(html.match(/swapp-route-motion\.js\?v=/g)?.length,1);
 assert.ok(html.indexOf('/index_script.js?')<html.indexOf('/assets/swapp-route-motion.js?'));
 assert.ok(html.indexOf('/assets/swapp-route-motion.css?')<html.indexOf('</head>'));
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@view-transition\{navigation:auto\}/);
 assert.match(css,/header\.top\{view-transition-name:swapp-masthead\}/);
 assert.doesNotMatch(read('assets/swapp-route-motion.js'),/setView\s*=|history\.pushState|innerHTML/);
});
