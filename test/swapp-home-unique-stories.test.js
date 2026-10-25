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
   remove:(...names)=>{this.className=this.className.split(' ').filter(s=>!names.includes(s)).join(' ')},
   contains:name=>this.className.split(' ').includes(name)
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
 const root=new Element('div');root.root=true;root.className='active';
 const main=new Element('main');main.className='swappHome1014';root.append(main);
 const hero=new Element('div');hero.className='homeHeroInner1014';
 const live=new Element('section');live.className='homeLiveSection1014';main.append(hero,live);
 const timers=[];const calls=[];
 const document={getElementById:id=>id==='home'?root:null,createElement:tag=>new Element(tag),addEventListener(){},visibilityState:'visible'};
 const fetch=async url=>{calls.push(url);return {ok:true,json:async()=>url==='/api/actus'?{articles}:{items:[]}}};
 const context={document,window:{addEventListener(){},dispatchEvent(){}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},MutationObserver:class{observe(){}},
  setTimeout:(cb,ms)=>{if(ms===220)timers.push(cb);return 1},clearTimeout(){},fetch,AbortController,URL};
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
 publishedAt:'2026-10-'+String(25-n).padStart(2,'0')+'T10:00:00Z',
 image:hasImage?{url:'https://example.com/game-'+n+'.jpg'}:null,
 trailerUrl:'https://www.youtube.com/watch?v=AbcdEfgh012'
});
test('large hero and article grid contain five unique stories, without duplicate first card',async()=>{
 const view=await render([0,1,2,3,4].map(i=>make(i)));
 assert.equal(view.feature.href,'/actus/game-release-0');
 assert.equal(view.gridLinks().length,4);
 assert.equal(new Set([view.feature.href,...view.gridLinks()]).size,5);
 assert.equal(view.main.children[1],view.shelf,'article grid follows the featured hero');
 assert.equal(view.main.children[2],view.live,'lives follow the articles');
 assert.equal(view.calls.filter(x=>x==='/api/actus').length,1);
 assert.equal(view.calls.some(x=>x.includes('game-lives')),true,'featured game checked for real creators');
 assert.ok(view.shelf.querySelector('.swapp-home-video-feature'),'one playable trailer appears alongside the editorial title');
});
test('a missing image picks the next valid lead, or falls back to full story grid',async()=>{
 const next=await render([make(0,false),...([1,2,3,4].map(i=>make(i)))]);
 assert.equal(next.feature.href,'/actus/game-release-1');
 assert.equal(new Set([next.feature.href,...next.gridLinks()]).size,5);
 const noImages=await render([0,1,2,3,4].map(i=>make(i,false)));
 assert.equal(noImages.feature,null);
 assert.ok(noImages.hero.classList.contains('swapp-hero-unavailable'));
 assert.equal(noImages.hero.attributes['aria-busy'],'false');
 assert.equal(noImages.gridLinks().length,5);
});
test('failed lead image restores its article to the grid instead of hiding it',async()=>{
 const view=await render([0,1,2,3,4].map(i=>make(i)));
 const afterFailure=view.failHero();
 assert.equal(afterFailure.length,5);
 assert.equal(new Set(afterFailure).size,5);
 assert.equal(view.hero.querySelector('.swapp-home-hero-feature'),null);
 assert.ok(view.hero.classList.contains('swapp-hero-unavailable'));
 assert.equal(view.hero.attributes['aria-busy'],'false');
});


test('large editorial video has its own column and the news CTA stays beside the headline',async()=>{
 const view=await render([0,1,2,3,4].map(i=>make(i)));
 const top=view.shelf.querySelector('.swapp-home-editorial-top');
 const intro=top.querySelector('.swapp-home-editorial-intro');
 const videoColumn=top.querySelector('.swapp-home-hero-actions');
 assert.ok(intro,'editorial introduction remains visible');
 assert.ok(intro.querySelector('.swapp-media-button'),'Actualité CTA stays with headline');
 assert.equal(videoColumn.querySelector('.swapp-media-button'),null,'CTA must not squeeze the trailer');
 const trailer=videoColumn.querySelector('.swapp-home-video-feature');
 assert.ok(trailer,'trailer remains in the current editorial section');
 const launch=trailer.querySelector('.swapp-video-open');
 assert.equal(launch.dataset.videoYoutube,'AbcdEfgh012','latest article trailer remains playable');
 assert.equal(launch.dataset.swappVideoPlay,'1');
 assert.equal(view.main.children.length,3,'no new homepage sections');
});
test('trailer is full-width cinematic 16:9 and responsive rather than 290px wide',()=>{
 const css=fs.readFileSync(path.resolve(__dirname,'../assets/swapp-video-gallery.css'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 assert.match(css,/#home \.swapp-home-editorial-top\{\s*display:grid!important/);
 assert.match(css,/grid-template-columns:minmax\(0,\.84fr\) minmax\(0,1\.16fr\)/);
 assert.match(css,/\.swapp-home-video-feature\{\s*width:100%!important/);
 assert.match(css,/aspect-ratio:16\/9!important/);
 assert.match(css,/@media\(max-width:980px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.doesNotMatch(css,/width:clamp\(190px,19vw,290px\)/);
 assert.match(html,/swapp-home-news\.js\?v=20261025-latest-video-v1/);
 assert.match(html,/swapp-video-gallery\.css\?v=20261025-latest-video-v1/);
});

test('no usable article trailer leaves no empty video column or historical campaign',async()=>{
 const data=[0,1,2].map(i=>({...make(i),trailerUrl:''}));
 const view=await render(data);
 const top=view.shelf.querySelector('.swapp-home-editorial-top');
 assert.equal(top.classList.contains('swapp-home-has-video'),false);
 assert.equal(top.querySelector('.swapp-home-video-feature'),null);
});
test('the newest published article supplies its own video and destination',async()=>{
 const data=[
  {...make(0),publishedAt:'2026-10-20T10:00:00Z'},
  {...make(1),publishedAt:'2026-10-25T10:00:00Z',trailerUrl:'https://youtu.be/Qwerty12345'}
 ];
 const view=await render(data);
 const tile=view.shelf.querySelector('.swapp-home-video-feature');
 assert.equal(tile.querySelector('.swapp-video-open').dataset.videoYoutube,'Qwerty12345');
 assert.equal(tile.querySelector('.swapp-video-caption').children.find(node=>node.tagName==='H3').textContent,'Gaming news 1');
});
