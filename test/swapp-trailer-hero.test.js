'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-article-trailer-bg.js'),'utf8');
function harness({cmp=false,reduced=false,saveData=false}={}){
 const scripts=[],listeners={},elements=[];
 let tcfCallback=null,revoked=0;
 function element(tag){
  const el={tagName:tag,attributes:{},children:[],_events:{},hidden:false,
   setAttribute(name,value){this.attributes[name]=String(value)},
   getAttribute(name){return this.attributes[name]||null},
   addEventListener(name,fn){this._events[name]=fn},
   append(...items){this.children.push(...items)},
   remove(){this.removed=true}};
  elements.push(el);return el;
 }
 const content={append(...items){this.children=(this.children||[]).concat(items)}};
 const scene={isConnected:true,parentElement:{querySelector(){return content}},
  getAttribute(name){return name==='data-swapp-trailer-id'?'uQuKE0KDgiM':null},
  querySelector(){return {hidden:false}},classList:{add(){},remove(){}},
  append(node){scripts.push(node)}};
 const document={readyState:'loading',hidden:false,createElement:element,
  addEventListener(name,fn){listeners[name]=fn},
  removeEventListener(name){delete listeners[name]},
  querySelectorAll(){return [scene]}};
 const window={matchMedia:()=>({matches:reduced}),addEventListener(){},
  googlefc:{showRevocationMessage(){revoked++}}};
 if(cmp)window.__tcfapi=(method,version,callback)=>{
  assert.equal(method,'addEventListener');assert.equal(version,0);
  tcfCallback=callback;
 };
 vm.runInNewContext(script,{window,document,navigator:{connection:{saveData}},
  console,IntersectionObserver:undefined});
 window.SwappTrailerHero.mount(scene);
 const button=content.children[0].children[0];
 return {scene,scripts,button,
  get revoked(){return revoked},
  consent({purpose=true,vendor=true,gdpr=true}={}){
   assert.ok(tcfCallback);tcfCallback({eventStatus:'tcloaded',cmpStatus:'loaded',
    gdprApplies:gdpr,tcString:'tcf-valid',
    purpose:{consents:{'1':purpose}},vendor:{consents:{'755':vendor}}},true);
  }};
}
test('trailer never contacts YouTube without an opt-in or affirmative CMP signal',()=>{
 const h=harness();
 assert.equal(h.scripts.length,0);
 h.button._events.click();
 assert.equal(h.scripts.length,1);
 assert.match(h.scripts[0].src,/youtube-nocookie\.com\/embed\/uQuKE0KDgiM/);
 assert.match(h.scripts[0].src,/autoplay=1&mute=1/);
 assert.match(h.scripts[0].src,/start=10/);
 h.button._events.click();
 assert.equal(h.scripts[0].removed,true);
});
test('TCF purpose/vendor refusal blocks autoplay and explicit bypass',()=>{
 const h=harness({cmp:true});h.consent({purpose:false});
 assert.equal(h.scripts.length,0);
 h.button._events.click();assert.equal(h.scripts.length,0);
 assert.equal(h.revoked,1);
});
test('accepted TCF signal enables soundless background video',()=>{
 const h=harness({cmp:true});h.consent();
 assert.equal(h.scripts.length,1);
});
test('reduced motion and save-data disable automatic background requests',()=>{
 for(const opts of [{reduced:true},{saveData:true}]){
  const h=harness({...opts,cmp:true});h.consent();
  assert.equal(h.scripts.length,0);
 }
});
