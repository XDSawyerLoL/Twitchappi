'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/swapp-channel-showcase.js'),'utf8');

class Node {
 constructor(tag='',classes=''){
  this.tagName=tag;this.dataset={};this.attrs={};this.children=[];this.events={};
  this.parentElement=null;this.observers=[];this._connected=false;this.open=false;
  this.style={removeProperty(name){delete this[name]}};
  this.classList={values:new Set(classes.split(' ').filter(Boolean)),
   contains:key=>this.classList.values.has(key),
   add:key=>this.classList.values.add(key),
   remove:key=>this.classList.values.delete(key)};
 }
 get isConnected(){return this._connected||Boolean(this.parentElement?.isConnected)}
 get firstElementChild(){return this.children[0]||null}
 get childElementCount(){return this.children.length}
 get className(){return [...this.classList.values].join(' ')}
 set className(text){this.classList.values=new Set(text.split(/\s+/).filter(Boolean))}
 append(...children){
  for(const child of children){
   if(child.parentElement)child.parentElement.children.splice(child.parentElement.children.indexOf(child),1);
   child.parentElement=this;this.children.push(child);
  }
  this.observers.forEach(fn=>fn([{addedNodes:children}]));
 }
 appendChild(node){this.append(node);return node}
 prepend(node){
  if(node.parentElement)node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);
  node.parentElement=this;this.children.unshift(node);
  this.observers.forEach(fn=>fn([{addedNodes:[node]}]));
 }
 remove(){if(this.parentElement){
  this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;
 }}
 setAttribute(key,value){this.attrs[key]=value}
 getAttribute(key){return this.attrs[key]||''}
 addEventListener(name,fn){(this.events[name]||=[]).push(fn)}
 removeEventListener(name,fn){this.events[name]=(this.events[name]||[]).filter(handler=>handler!==fn)}
 fire(name){for(const fn of this.events[name]||[])fn({target:this})}
 getBoundingClientRect(){return {top:120,bottom:157,left:320,right:450}}
 querySelector(selector){
  if(selector==='.channelActionDock')return this.dock||null;
  if(selector==='.swapp-studio-owner-edit')
   return this.children.find(node=>node.classList.contains('swapp-studio-owner-edit'))||null;
  return null;
 }
 querySelectorAll(selector){
  if(selector==='.creatorRefine.swapp-channel-polish')return this.page?[this.page]:[];
  return [];
 }
}
class Observer {
 constructor(callback){this.callback=callback}
 observe(node){node.observers.push(this.callback)}
 disconnect(){}
}
function setup({owner=true,initial=['profile','settings']}={}){
 const body=new Node('body'),root=new Node('section','active'),
  page=new Node('section','creatorRefine swapp-channel-polish'),
  dock=new Node('div','channelActionDock');
 body._connected=true;root._connected=true;root.append(page);root.page=page;
 page.dataset.channelOwner=String(owner);page.dataset.channelLive='true';page.dock=dock;page.append(dock);
 for(const cls of initial)dock.append(new Node('button','btn '+cls));
 let edits=0;
 const document={body,readyState:'complete',createElement:tag=>new Node(tag),
  getElementById:id=>id==='channel'?root:null,addEventListener(){},removeEventListener(){}};
 const window={innerWidth:1200,innerHeight:900,addEventListener(){},removeEventListener(){}};
 const globalThis={SwappBrowserStudio:{editLive(){edits++}}};
 vm.runInNewContext(source,{document,window,MutationObserver:Observer,
  requestAnimationFrame:fn=>fn(),location:{pathname:'/sansahd'},globalThis,
  AbortSignal:{timeout:()=>null},fetch:()=>{throw Error('unexpected network')}});
 return {body,root,page,dock,Node,getEdits:()=>edits};
}
test('Gérer ma chaîne stays in the same dock positions when opened or when a new button arrives',()=>{
 const f=setup();
 const edit=f.dock.children.find(n=>n.classList.contains('swapp-studio-owner-edit'));
 const menu=f.dock.children.find(n=>n.classList.contains('swapp-showcase-owner-menu'));
 assert.ok(edit);assert.ok(menu);
 assert.equal(f.dock.firstElementChild,edit);
 const content=menu.children.find(n=>n.classList.contains('swapp-showcase-menu-content'));
 assert.equal(content.childElementCount,2);
 const fixed=f.dock.children.slice();
 edit.fire('click');assert.equal(f.getEdits(),1);
 const late=new Node('button','btn late');f.dock.append(late);
 assert.equal(late.parentElement,content);
 assert.deepEqual(f.dock.children,fixed);
 menu.open=true;menu.fire('toggle');
 assert.equal(content.parentElement,f.body);
 assert.deepEqual(f.dock.children,fixed);
 menu.open=false;menu.fire('toggle');
 assert.equal(content.parentElement,menu);
 assert.deepEqual(f.dock.children,fixed);
});
test('Visitor follow action remains separate, while late secondary actions join Plus',()=>{
 const f=setup({owner:false,initial:[]});
 const menu=f.dock.children.find(n=>n.classList.contains('swapp-showcase-visitor-menu'));
 assert.ok(menu);assert.equal(menu.hidden,true);
 const follow=new Node('button','swapp-channel-follow-btn');
 f.dock.append(follow);
 assert.equal(follow.parentElement,f.dock);
 assert.equal(menu.hidden,true);
 const more=new Node('button','btn extra');f.dock.append(more);
 const content=menu.children.find(n=>n.classList.contains('swapp-showcase-menu-content'));
 assert.equal(more.parentElement,content);
 assert.equal(menu.hidden,false);
});
