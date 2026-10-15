'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const EXPECTED=['Accueil','Découvrir','Catégories','Équipes','Actualité','Communauté','Vidéos','Boutique'];

class Element {
 constructor(tag,text='',href=null){
  this.tagName=tag.toUpperCase();this.textContent=text;this.attrs={};
  if(href!==null)this.attrs.href=href;
  this.children=[];this.parentElement=null;this.classList={add:()=>{},contains:()=>false};
 }
 getAttribute(name){return this.attrs[name]??null}
 setAttribute(name,value){this.attrs[name]=value}
 matches(selector){return selector.split(',').some(x=>x.trim().toUpperCase()===this.tagName)}
 append(child){if(child.parentElement)child.remove();child.parentElement=this;this.children.push(child)}
 insertBefore(child,before){if(child.parentElement)child.remove();const index=this.children.indexOf(before);child.parentElement=this;this.children.splice(index<0?this.children.length:index,0,child)}
 remove(){if(this.parentElement){const parent=this.parentElement;parent.children.splice(parent.children.indexOf(this),1);this.parentElement=null}}
 closest(selector){if(selector==='#nav'){let el=this;while(el){if(el===this.rootNav)return el;el=el.parentElement}}return null}
 querySelectorAll(selector){const nodes=[];function walk(el){for(const child of el.children){if(child.matches(selector))nodes.push(child);walk(child)}}walk(this);return nodes}
 querySelector(){return null}
 get lastElementChild(){return this.children.at(-1)||null}
}
function setup(){
 const nav=new Element('nav');nav.rootNav=nav;
 const group=new Element('div');nav.append(group);
 for(const label of EXPECTED){
  const button=new Element('button',label);button.rootNav=nav;group.append(button);
 }
 const hrefs=['/communaute','/bandes-annonces','/boutique'];
 for(let i=0;i<hrefs.length;i++){
  const a=new Element('a',EXPECTED[5+i],hrefs[i]);a.rootNav=nav;nav.append(a);
 }
 let observer;
 const document={
  readyState:'complete',
  getElementById(id){return id==='nav'?nav:null},
  createElement(tag){const el=new Element(tag);el.rootNav=nav;return el},
  addEventListener(){}
 };
 const MutationObserver=class{constructor(cb){observer=cb}observe(){}};
 const source=fs.readFileSync(path.join(ROOT,'assets/swapp-hub-nav.js'),'utf8');
 vm.runInNewContext(source,{document,MutationObserver,queueMicrotask:fn=>fn(),
   location:{origin:'https://swapp.tv',pathname:'/'},URL,setTimeout});
 return {nav,group,observe:()=>observer?.()};
}
test('eight SPA buttons win over three duplicate links; do not create tiny tabs',()=>{
 const {nav,group}=setup();
 assert.equal(nav.querySelectorAll('a,button').length,8);
 assert.deepEqual(group.children.map(x=>x.textContent),EXPECTED);
 assert.equal(nav.children.length,1);
 assert.equal(nav.querySelectorAll('a').length,0);
});
test('a later SPA or widget re-render cannot reintroduce duplicated destinations',()=>{
 const {nav,group,observe}=setup();
 group.append(new Element('a','Communauté','/communaute'));
 group.append(new Element('a','Vidéos','/bandes-annonces'));
 group.append(new Element('a','Boutique','/boutique'));
 observe();
 assert.equal(nav.querySelectorAll('a,button').length,8);
 assert.deepEqual(group.children.map(x=>x.textContent),EXPECTED);
});
test('uniform desktop styling covers both buttons and links, and assets are cache-busted',()=>{
 const css=fs.readFileSync(path.join(ROOT,'assets/swapp-unified-nav.css'),'utf8');
 assert.match(css,/header\.top #nav\.swapp-nav-consistent :is\(a,button\)/);
 assert.match(css,/font-size:13px!important/);
 assert.match(css,/font-weight:850!important/);
 const home=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const shell=fs.readFileSync(path.join(ROOT,'modules/swapp-news/site-shell.js'),'utf8');
 for(const source of [home,shell]){
  assert.match(source,/swapp-hub-nav\.js\?v=20261015-nav-dedup-9/);
  assert.match(source,/swapp-unified-nav\.css\?v=20261015-nav-dedup-9/);
 }
});
