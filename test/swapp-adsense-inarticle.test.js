'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const client=read('assets/swapp-adsense-inarticle.js');

function harness({paragraphs=[260,300,300,260],cmp=true}={}){
 let callback=null;
 const scripts=[];
 class Node{
  constructor(tag){
   this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this._events={};
   this.className='';this.textContent='';this.isConnected=true;this.parent=null;this.style={};
  }
  append(...els){for(const el of els){this.children.push(el);el.parent=this}
   if(this.tagName==='HEAD')for(const el of els){
    scripts.push(el);el._events.load?.();
   }
  }
  after(el){const siblings=this.parent?.children;
   if(!siblings)throw Error('missing paragraph parent');
   siblings.splice(siblings.indexOf(this)+1,0,el);el.parent=this;
  }
  setAttribute(key,value){this.attrs[key]=String(value)}
  getAttribute(key){return this.attrs[key]||null}
  addEventListener(name,fn){this._events[name]=fn}
  querySelector(selector){
   if(selector===':scope > .swapp-ad-placement')
    return this.children.find(el=>el.className==='swapp-ad-placement')||null;
   return null;
  }
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this);
   this.isConnected=false;
  }
 }
 const content=new Node('div');content.className='swapp-actus-body';
 content.children=paragraphs.map(n=>{const p=new Node('p');p.textContent='A'.repeat(n);p.parent=content;return p});
 Object.defineProperty(content,'textContent',{get(){return this.children.map(x=>x.textContent).join(' ')}});
 const head=new Node('head'),body=new Node('body');
 const document={readyState:'complete',head,body,scripts,
  createElement:tag=>new Node(tag),
  querySelector:selector=>selector.includes('.swapp-actus-body')?content:null,
  querySelectorAll:()=>[],
 };
 const window={};
 if(cmp)window.__tcfapi=(cmd,version,fn)=>{
  assert.equal(cmd,'addEventListener');assert.equal(version,2);callback=fn;
 };
 const ctx={window,document,MutationObserver:class{observe(){}disconnect(){}},
  setInterval:()=>9,clearInterval:()=>{},requestAnimationFrame:fn=>fn(),console};
 vm.runInNewContext(client,ctx);
 return {window,content,scripts,get callback(){return callback},
  consent({purpose=true,vendor=true,gdpr=true}={}){
   assert.ok(callback,'TCF listener not registered');
   callback({eventStatus:'tcloaded',cmpStatus:'loaded',gdprApplies:gdpr,tcString:'valid-TCF-string',
    purpose:{consents:{'1':purpose}},vendor:{consents:{'755':vendor}}},true);
  }};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve()};
test('no certified CMP signal means no Google requests and no blank ad container',async()=>{
 const h=harness({cmp:false});await settle();
 assert.equal(h.scripts.length,0);
 assert.equal(h.content.children.some(x=>x.className==='swapp-ad-placement'),false);
});
test('TCF refusal of purpose 1 or vendor Google blocks loading',async()=>{
 for(const {purpose,vendor} of [{purpose:false,vendor:true},{purpose:true,vendor:false}]){
  const h=harness();h.consent({purpose,vendor});await settle();
  assert.equal(h.scripts.length,0);
  assert.equal(h.content.children.length,4);
 }
});
test('valid TCF consent inserts the supplied in-article slot after second paragraph only',async()=>{
 const h=harness();h.consent();await settle();
 assert.equal(h.scripts.length,1);
 assert.match(h.scripts[0].src,/adsbygoogle\.js\?client=ca-pub-6082969821681414/);
 const wrapper=h.content.children[2];
 assert.equal(wrapper.className,'swapp-ad-placement');
 assert.equal(wrapper.attrs['aria-label'],'Publicité');
 const slot=wrapper.children[1];
 assert.equal(slot.className,'adsbygoogle');
 assert.equal(slot.attrs['data-ad-layout'],'in-article');
 assert.equal(slot.attrs['data-ad-format'],'fluid');
 assert.equal(slot.attrs['data-ad-client'],'ca-pub-6082969821681414');
 assert.equal(slot.attrs['data-ad-slot'],'4776091558');
 assert.equal(h.window.adsbygoogle.length,1);
});
test('short articles have no ads even after affirmative consent',async()=>{
 const h=harness({paragraphs:[80,90]});h.consent();await settle();
 assert.equal(h.scripts.length,0);assert.equal(h.content.children.length,2);
});
test('CMP opt-out removes the placement and prevents a new request',async()=>{
 const h=harness();h.consent();await settle();
 h.consent({purpose:false});await settle();
 assert.equal(h.content.children.some(x=>x.className==='swapp-ad-placement'),false);
 assert.equal(h.window.adsbygoogle.length,1);
});
test('ad slot is loaded from both article shells, not on every homepage load',()=>{
 for(const html of [read('index.html'),read('modules/swapp-news/site-shell.js')]){
  assert.match(html,/swapp-adsense-inarticle\.js\?v=20261016-inarticle-1/);
  assert.doesNotMatch(html,/src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js/);
 }
 const css=read('assets/swapp-article-immersive.css');
 assert.match(css,/\.swapp-ad-placement/);
 assert.match(css,/\.swapp-ad-label/);
});
