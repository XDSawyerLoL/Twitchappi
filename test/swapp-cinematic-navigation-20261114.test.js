'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const {renderPage,SHARED_HEAD_SLOT}=require('../modules/swapp-page-shell');
const {renderIntoSpa}=require('../modules/swapp-catalogue-spa');

test('cinematic CSS is shared by SPA and native pages',()=>{
 const spa=renderIntoSpa(read('index.html'));
 const native=renderPage({head:'<meta charset="utf-8">'+SHARED_HEAD_SLOT,content:'<main>TV</main>'});
 for(const page of [spa,native])assert.equal((page.match(/swapp-route-motion\.css\?v=20261114-film-cut-v19/g)||[]).length,1);
 assert.match(spa,/swapp-route-motion\.js\?v=20261114-film-cut-v19/);
 assert.match(read('assets/swapp-catalogue-spa.css'),/--swapp-route-enter-duration/);
});
test('premium film cut is legible, stable and respects reduced motion',()=>{
 const css=read('assets/swapp-route-motion.css');
 for(const value of [
  '@view-transition{navigation:auto}','--swapp-route-enter-duration:540ms',
  '--swapp-route-exit-duration:240ms','@keyframes swapp-film-out','@keyframes swapp-film-in',
  'view-transition-name:swapp-masthead','::view-transition-group(root){isolation:isolate}',
  'clip-path:inset(0 0 0 1.6%)','@media(max-width:700px)',
  '@media(prefers-reduced-motion:reduce)'
 ])assert.ok(css.includes(value),value);
 assert.match(css,/animation:swapp-film-in[^;]*65ms both/);
 assert.ok(!css.includes('blur(')&&!css.includes('scale('),'the page must stay sharp, without zoom');
 assert.doesNotMatch(css,/swapp-transition-overlay|fixed;inset:0/);
 assert.match(css,/swapp-document-in/);
});
function harness({reduced=false,api=true}={}){
 const calls=[],root={dataset:{}},listeners={},current={id:'home'};
 let complete;
 const pending=new Promise(resolve=>{complete=resolve});
 const transitions=[];
 const document={
  documentElement:root,
  getElementById(id){return id==='home'||id==='swapp-catalogue-lab'?{id}:null},
  querySelector(s){return s==='main.app > .view.active'?current:null},
  querySelectorAll(){return []},
  addEventListener(k,f){listeners[k]=f},
  startViewTransition:api?fn=>{
   const result=fn();
   const t={result,finished:Promise.resolve(result),skipTransition(){this.skipped=true}};
   transitions.push(t);return t;
  }:undefined
 };
 const window={
  matchMedia:()=>({matches:reduced}),
  setView(name){calls.push(name);return pending.then(()=>{current.id=name})}
 };
 vm.runInNewContext(read('assets/swapp-catalogue-spa.js'),
  {document,window,location:{origin:'https://swapp.tv',href:'https://swapp.tv/'},URL,Promise,Set,Map});
 return {calls,window,root,current,complete,transitions};
}
test('actual asynchronous router promise controls snapshot lifecycle',async()=>{
 const h=harness();
 const t=h.window.swappNavigateSpa('categories');
 assert.equal(h.calls[0],'categories');
 assert.equal(typeof t.result.then,'function','ViewTransition must await setView');
 assert.equal(h.root.dataset.swappMotion,'cinematic');
 h.complete();
 await t.finished;
 await Promise.resolve();
 assert.equal(h.current.id,'categories');
 assert.equal(h.root.dataset.swappMotion,undefined);
});
test('fallback and reduced-motion route without snapshots',async()=>{
 for(const options of [{api:false},{reduced:true}]){
  const h=harness(options);
  const p=h.window.swappNavigateSpa('actus');
  h.complete();await p;
  assert.deepEqual(h.calls,['actus']);
  assert.equal(h.transitions.length,0);
  assert.equal(h.root.dataset.swappMotion,undefined);
 }
});
test('an existing snapshot does not trigger a second route entrance animation',()=>{
 const script=read('assets/swapp-route-motion.js');
 assert.match(script,/document\.documentElement\?\.dataset\?\.swappMotion==='cinematic'/);
 assert.match(script,/page\.classList\.add\('swapp-route-enter'\)/);
 assert.doesNotMatch(script,/setView\s*=|history\.pushState|innerHTML/);
});
