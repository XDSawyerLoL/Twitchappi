'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const script=fs.readFileSync(path.resolve(__dirname,'../assets/swapp-home-news.js'),'utf8');

class Element {
 constructor(tag='div'){
  this.tagName=tag.toUpperCase();this.className='';this.dataset={};
  this.children=[];this.parentNode=null;this.attributes={};
  this.classList={
   add:name=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),name])].join(' ')},
   remove:name=>{this.className=this.className.split(' ').filter(s=>s!==name).join(' ')}
  };
 }
 get firstChild(){return this.children[0]||null}
 get isConnected(){return !!this.root||!!this.parentNode?.isConnected}
 append(...children){for(const child of children){child.remove();child.parentNode=this;this.children.push(child)}}
 insertBefore(child,reference){child.remove();child.parentNode=this;const index=this.children.indexOf(reference);this.children.splice(index<0?this.children.length:index,0,child)}
 replaceChildren(...children){for(const old of this.children)old.parentNode=null;this.children=[];this.append(...children)}
 remove(){if(!this.parentNode)return;this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null}
 setAttribute(k,v){this.attributes[k]=v}
 addEventListener(){}
 matches(selector){
  if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));
  return selector==='[data-swapp-home-editorial]'&&this.dataset.swappHomeEditorial==='1';
 }
 querySelector(selector){for(const part of selector.split(',')){const match=this.find(part.trim());if(match)return match}return null}
 find(selector){for(const child of this.children){if(child.matches(selector))return child;const found=child.find(selector);if(found)return found}return null}
}

async function render(articles){
 const root=new Element('div');root.root=true;
 const main=new Element('main');main.className='swappHome1014';root.append(main);
 const hero=new Element('div');hero.className='homeHeroInner1014';
 const live=new Element('section');live.className='homeLiveSection1014';main.append(hero,live);
 const timers=[];const calls=[];
 const document={getElementById:id=>id==='home'?root:null,createElement:tag=>new Element(tag)};
 const fetch=async url=>{calls.push(url);return {ok:true,json:async()=>url==='/api/actus'?{articles}:{items:[]}}};
 const context={document,window:{addEventListener(){}},MutationObserver:class{observe(){}},
  setTimeout:cb=>timers.push(cb),fetch,AbortSignal,URL};
 vm.runInNewContext(script,context,{timeout:2000});
 for(let i=0;i<30;i++){while(timers.length)timers.shift()();await Promise.resolve()}
 const shelf=main.querySelector('.swapp-home-editorial');
 const getGridLinks=()=>shelf.querySelector('.swapp-home-story-grid').children.map(x=>x.href).filter(Boolean);
 const feature=hero.querySelector('.swapp-home-hero-feature');
 return {main,hero,live,shelf,feature,calls,gridLinks:getGridLinks,
  failHero:()=>{feature?.children.find(x=>x.tagName==='IMG')?.onerror();return getGridLinks()}};
}

const make=(n,hasImage=true)=>({
 slug:'game-release-'+n,title:'Gaming news '+n,game:'Game '+n,
 image:hasImage?{url:'https://example.com/game-'+n+'.jpg'}:null
});
test('large hero and article grid contain five unique stories, without duplicate first card',async()=>{
 const view=await render([0,1,2,3,4].map(i=>make(i)));
 assert.equal(view.feature.href,'/actus/game-release-0');
 assert.equal(view.gridLinks().length,4);
 assert.equal(new Set([view.feature.href,...view.gridLinks()]).size,5);
 assert.equal(view.main.children[1],view.shelf,'news shelf follows the hero');
 assert.equal(view.main.children[2],view.live,'lives remain immediately after the stories');
 assert.equal(view.calls.filter(x=>x==='/api/actus').length,1);
 assert.equal(view.calls.some(x=>x.includes('game-lives')),false);
});
test('a missing image picks the next valid lead, or falls back to full story grid',async()=>{
 const next=await render([make(0,false),...([1,2,3,4].map(i=>make(i)))]);
 assert.equal(next.feature.href,'/actus/game-release-1');
 assert.equal(new Set([next.feature.href,...next.gridLinks()]).size,5);
 const noImages=await render([0,1,2,3,4].map(i=>make(i,false)));
 assert.equal(noImages.feature,null);
 assert.equal(noImages.gridLinks().length,5);
});
test('failed lead image restores its article to the grid instead of hiding it',async()=>{
 const view=await render([0,1,2,3,4].map(i=>make(i)));
 const afterFailure=view.failHero();
 assert.equal(afterFailure.length,5);
 assert.equal(new Set(afterFailure).size,5);
 assert.equal(view.hero.querySelector('.swapp-home-hero-feature'),null);
});
