'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/swapp-page-colors.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/swapp-social-appearance.css'),'utf8');
const globalCSS=fs.readFileSync(path.join(root,'assets/swapp-page-colors.css'),'utf8');
const hub=fs.readFileSync(path.join(root,'modules/swapp-hubs.js'),'utf8');

function harness({area='social',mobile=false,collapsed=false,storage={}}={}){
 const attrs=(object)=>({
  setProperty:(k,v)=>object[k]=v,
  removeProperty:k=>delete object[k]
 });
 class Node{
  constructor(tag){
   this.tag=tag;this.children=[];this.parentElement=null;this.attributes={};this.dataset={};
   this.className='';this.listeners={};this.styleData={};this.style=attrs(this.styleData);
   this.classList={
    toggle:(name,enabled)=>{const names=new Set(this.className.split(/\s+/).filter(Boolean));
     if(enabled)names.add(name);else names.delete(name);
     this.className=[...names].join(' ');return enabled},
    contains:name=>this.className.split(/\s+/).includes(name)
   };
  }
  append(...nodes){for(const child of nodes){
   if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(x=>x!==child);
   child.parentElement=this;this.children.push(child)
  }}
  insertAdjacentElement(where,child){assert.equal(where,'afterend');this.inserted=child;child.parentElement=this.parentElement||this}
  setAttribute(k,v){this.attributes[k]=String(v)}
  addEventListener(event,cb){(this.listeners[event]||=[]).push(cb)}
  contains(node){return this===node||this.children.some(x=>x.contains(node))}
  click(){for(const cb of this.listeners.click||[])cb()}
 }
 const sidebar=new Node('aside'),topbar=new Node('header'),social=new Node('div'),shopLine=new Node('div');
 social.querySelector=q=>q==='.pulse-sidebar'?sidebar:q==='.pulse-topbar'?topbar:null;
 const rootNode=new Node('html'),body=new Node('body'),docs={};
 const document={
  documentElement:rootNode,body,
  querySelector:q=>q==='.swapp-social-viewport'&&area==='social'?social:
   q==='.swapp-store-topline'&&area==='shop'?shopLine:null,
  createElement:tag=>new Node(tag),
  addEventListener:(type,listener)=>{docs[type]=listener}
 };
 const media={mobile:{matches:mobile,events:[]},collapsed:{matches:collapsed,events:[]}};
 for(const m of Object.values(media))m.addEventListener=(_type,cb)=>m.events.push(cb);
 const saved={...storage};
 const context={document,window:{matchMedia:q=>q.includes('max-width: 650px')?media.mobile:media.collapsed},
  localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v}};
 vm.runInNewContext(source,context);
 const host=sidebar.children.find(x=>x.className.includes('swapp-page-appearance'))||
  topbar.children.find(x=>x.className.includes('swapp-page-appearance'))||
  shopLine.inserted;
 const detail=host.children[0],group=detail.children[1];
 const buttons=group.children;
 return {social,sidebar,topbar,shopLine,host,detail,buttons,media,rootNode,body,saved,
  change:(name,value)=>{media[name].matches=value;for(const cb of media[name].events)cb()},
  clickLabel:label=>{const button=buttons.find(x=>x.attributes['aria-label']===label);assert.ok(button,'palette control '+label);button.click()},
  eventOutside:()=>docs.pointerdown?.({target:new Node('outside')})
 };
}
test('desktop: SOCIAL palette is in its sidebar, not before the entire website',()=>{
 const ctx=harness();
 assert.equal(ctx.host.parentElement,ctx.sidebar);
 assert.equal(ctx.detail.open,true);
 assert.equal(ctx.buttons.length,8);
 assert.equal(ctx.host.className.includes('swapp-page-appearance--social'),true);
 assert.equal(ctx.social.children.length,0,'no color toolbar at page root');
});
test('saved legacy color persists, changing a SOCIAL color cannot recolor Boutique',()=>{
 const ctx=harness({storage:{'swapp-page-accent-v1':'#a3e635'}});
 assert.equal(ctx.rootNode.dataset.swappPageColor,'#a3e635');
 ctx.clickLabel('Rose');
 assert.equal(ctx.rootNode.styleData['--swapp-page-accent'],'#f472b6');
 assert.equal(ctx.saved['swapp-social-accent-v1'],'#f472b6');
 const shop=harness({area:'shop',storage:ctx.saved});
 assert.equal(shop.rootNode.dataset.swappPageColor,'#a3e635');
 assert.equal(shop.buttons.length,7,'Boutique appearance remains unchanged');
 assert.equal(shop.shopLine.inserted,shop.host);
});
test('mobile palette moves into the compact header and closes after choice',()=>{
 const ctx=harness({mobile:true});
 assert.equal(ctx.host.parentElement,ctx.topbar);
 assert.equal(ctx.detail.open,false);
 ctx.detail.open=true;
 ctx.clickLabel('Violet');
 assert.equal(ctx.rootNode.dataset.swappPageColor,'#a78bfa');
 assert.equal(ctx.detail.open,false);
 ctx.change('mobile',false);
 assert.equal(ctx.host.parentElement,ctx.sidebar);
 assert.equal(ctx.detail.open,true);
});
test('collapsed desktop palette is an icon with a popover and keeps the chosen color',()=>{
 const ctx=harness({collapsed:true});
 assert.equal(ctx.host.parentElement,ctx.sidebar);
 assert.equal(ctx.host.classList.contains('is-compact'),true);
 assert.equal(ctx.detail.open,false);
 ctx.detail.open=true;
 ctx.clickLabel('Orange');
 assert.equal(ctx.detail.open,false);
 assert.equal(ctx.saved['swapp-social-accent-v1'],'#fb923c');
 ctx.change('collapsed',false);
 assert.equal(ctx.host.classList.contains('is-compact'),false);
 assert.equal(ctx.detail.open,true);
});
test('Auto clears page-specific inline tint and remains selected after returning',()=>{
 const ctx=harness({storage:{'swapp-social-accent-v1':'#a3e635'}});
 ctx.clickLabel('Ambiance automatique');
 assert.equal(ctx.rootNode.styleData['--swapp-page-accent'],undefined);
 assert.equal(ctx.saved['swapp-social-accent-v1'],'auto');
 assert.equal(ctx.rootNode.dataset.swappPageColor,'auto');
 const again=harness({storage:ctx.saved});
 assert.equal(again.rootNode.dataset.swappPageColor,'auto');
});
test('premium sidebar stylesheet is last; no full-width SOCIAL bar remains',()=>{
 assert.ok(hub.includes('swapp-social-appearance.css?v=20261019-no-top-gap-v3'));
 assert.ok(hub.indexOf('swapp-social-appearance.css')>hub.indexOf('swapp-social-product-v3.css'));
 assert.ok(!globalCSS.includes('.swapp-social-viewport>.swapp-page-appearance'));
 assert.ok(css.includes('.swapp-appearance-indicator'));
 assert.ok(css.includes('pulse-topbar>.swapp-page-appearance--social'));
 assert.ok(css.includes('swapp-page-appearance--social.is-compact'));
});

test('community header never sits below a phantom top spacer',()=>{
 assert.match(css,/body:has\(#swappSocialNative\) header\.top/);
 assert.match(css,/inset-block-start:0!important/);
 assert.match(css,/margin-top:0!important/);
 assert.doesNotMatch(css,/body\s*>\s*div:not/);
});
