'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('Quantic recovery actions do not self-trigger an endless MutationObserver remount',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/swapp-quantic-id-site.js'),'utf8');
 let observe=null,scheduled=false,pending=[],observedMutations=0;
 function notify(target){
  if(!observe||!target.isConnected)return;
  if(++observedMutations>60)return; // Stop a broken build instead of starving the test runner.
  pending.push({target});
  if(!scheduled){
   scheduled=true;
   queueMicrotask(()=>{
    scheduled=false;
    const batch=pending;pending=[];
    observe(batch);
   });
  }
 }
 class Element{
  constructor(tag){
   this.tagName=tag;this.nodeType=1;this.id='';this.className='';this.parentElement=null;
   this.children=[];this._text='';this.hidden=false;
  }
  get isConnected(){
   let n=this;
   while(n){if(n===body)return true;n=n.parentElement;}
   return false;
  }
  get textContent(){return this._text;}
  set textContent(value){this._text=String(value);this.children=[];notify(this);}
  setAttribute(){}
  addEventListener(){}
  append(...children){
   for(const child of children){child.parentElement=this;this.children.push(child);}
   notify(this);
  }
  prepend(...children){
   for(const child of children)child.parentElement=this;
   this.children.unshift(...children);notify(this);
  }
  remove(){
   if(!this.parentElement)return;
   const p=this.parentElement;
   p.children=p.children.filter(n=>n!==this);this.parentElement=null;notify(p);
  }
  querySelector(selector){
   if(!selector.startsWith('#'))return null;
   const id=selector.slice(1);
   const visit=node=>{
    for(const child of node.children){
     if(child.id===id)return child;
     const nested=visit(child);if(nested)return nested;
    }
    return null;
   };
   return visit(this);
  }
  closest(selectors){
   const matches=node=>selectors.split(',').some(selector=>{
    const value=selector.trim();
    if(value.startsWith('#'))return node.id===value.slice(1);
    return node.className.split(/\s+/).includes(value.slice(1));
   });
   for(let current=this;current;current=current.parentElement){
    if(matches(current))return current;
   }
   return null;
  }
 }
 const body=new Element('body'),root=new Element('div');
 root.id='settings';body.append(root);
 const fakeDocument={
  body,visibilityState:'visible',
  getElementById(id){return id==='settings'?root:body.querySelector('#'+id);},
  createElement(tag){return new Element(tag);},
  addEventListener(){}
 };
 const fakeFetch=async url=>{
  if(url==='/api/quantic-id/account/status')return {
   ok:true,headers:{get:()=> 'application/json'},
   json:async()=>({loggedIn:true,linked:true,quanticSession:true,recoveryReady:true,strict:false})
  };
  if(url==='http://127.0.0.1:47621/v1/status')return {
   ok:true,json:async()=>({product:'Quantic Identity Vault',identityAvailable:false})
  };
  throw Error('Unexpected request: '+url);
 };
 class Observer{
  constructor(callback){observe=callback;}
  observe(){}
 }
 const context={
  document:fakeDocument,
  window:{setInterval(){},addEventListener(){}},
  MutationObserver:Observer,
  fetch:fakeFetch,
  sessionStorage:{getItem(){return null;}},
  AbortSignal,
  console
 };
 vm.runInNewContext(source,context,{filename:'swapp-quantic-id-site.js',timeout:1000});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(root.querySelector('#swapp-vault-recovery-actions'),'recovery UI is mounted');
 assert.ok(observedMutations<12,'self-repeating DOM updates must not starve browser: '+observedMutations);
 const prior=observedMutations;
 body.append(new Element('section')); // A normal SPA DOM update still must be safe.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(observedMutations,prior+1,'remount of a stable view must not mutate it again');
});
