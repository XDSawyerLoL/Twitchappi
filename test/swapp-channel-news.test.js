'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function fixture({live=null,articles=[],errorAt='',pathname='/alice'}={}){
 const requests=[],listeners={},route={pathname};
 let host;
 const element=tag=>{
  const el={tagName:tag.toUpperCase(),children:[],dataset:{},textContent:'',
   isConnected:true,parent:null,className:'',href:'',src:'',
   append(...nodes){for(const child of nodes){child.parent=this;this.children.push(child)}},
   replaceChildren(...nodes){for(const child of this.children)child.isConnected=false;this.children=[];this.append(...nodes)},
   setAttribute(name,value){this[name]=value},
   querySelector(query){return query==='h2'?this.children.find(x=>x.tagName==='H2')||null:null},
   remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this)}
  };
  return el;
 };
 host=element('section');
 const document={
  body:element('body'),
  createElement:element,
  querySelector(selector){
   if(selector==='.channelPage, .watchShell.channelWatch'||selector==='.channelPage')
    return route.pathname==='/alice'?host:null;
   if(selector==='[data-swapp-live-articles]')
    return host.children.find(x=>x.dataset.swappLiveArticles)||null;
   return null;
  }
 };
 const fetch=async endpoint=>{
  requests.push(endpoint);
  if(errorAt&&endpoint.includes(errorAt))throw Error('simulated offline');
  return {ok:true,json:async()=>{
   if(endpoint.includes('/api/oryon/channel/'))return {live};
   if(endpoint==='/api/actus')return {articles};
   throw Error('unexpected '+endpoint);
  }};
 };
 const callbacks=[];
 vm.runInNewContext(read('assets/swapp-live-articles.js'),{
  document,location:route,fetch,URL,AbortController,
  MutationObserver:class{observe(){}},
  addEventListener:(type,fn)=>{listeners[type]=fn},
  setTimeout(fn,delay){if(delay===250)queueMicrotask(fn);return 1},
  clearTimeout(){}
 },{timeout:1000});
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
 const shelf=()=>document.querySelector('[data-swapp-live-articles]');
 return {route,requests,listeners,flush,shelf,host,callbacks};
}

test('channel without a known game gets a readable status without requesting ACTUS',async()=>{
 const app=fixture();
 await app.flush();
 const shelf=app.shelf();
 assert.ok(shelf);
 assert.match(shelf.children[1].textContent,/Aucun jeu identifié/);
 assert.equal(app.requests.length,1);
});

test('a verified game shows only articles about that exact title, not its sequel',async()=>{
 const app=fixture({live:{category:'Hades'},articles:[
  {slug:'hades-guide-2026',game:'Hades',title:'Le guide Hades',summary:'Conseils de jeu'},
  {slug:'hades-ii-news-2026',game:'Hades II',title:'Hades II sort demain'},
  {slug:'fortnite-next-2026',game:'Fortnite',title:'Fortnite : nouveautés'}
 ]});
 await app.flush();
 const shelf=app.shelf();
 assert.equal(shelf.children[0].textContent,'À lire sur Hades');
 assert.equal(shelf.children[2].children.length,1);
 assert.equal(shelf.children[2].children[0].href,'/actus/hades-guide-2026');
 assert.match(shelf.children[1].textContent,/Articles SWAPP consacrés/);
 assert.match(shelf.children[2].children[0].children.at(-1).children[0].textContent,/Même jeu · Hades/);
});

test('documented aliases work without mixing game franchises',async()=>{
 const app=fixture({live:{game_name:'Planet Zoo II'},articles:[
  {slug:'planet-zoo-2-news',game:'Planet Zoo 2',title:'Planet Zoo 2'},
  {slug:'planet-zoo-legacy',game:'Planet Zoo',title:'Planet Zoo'}
 ]});
 await app.flush();
 assert.equal(app.shelf().children[2].children.length,1);
 assert.equal(app.shelf().children[2].children[0].href,'/actus/planet-zoo-2-news');
});

test('a failed ACTUS response does not erase the channel shelf or its status',async()=>{
 const app=fixture({live:{category:'Fortnite'},errorAt:'/api/actus'});
 await app.flush();
 assert.ok(app.shelf());
 assert.match(app.shelf().children[1].textContent,/Actualités temporairement indisponibles/);
});

test('navigating away removes old recommendations and invalidates pending callbacks',async()=>{
 const app=fixture({live:{category:'Fortnite'}});
 await app.flush();
 app.route.pathname='/actus';
 app.listeners.popstate();
 await app.flush();
 assert.equal(app.shelf(),null);
});

test('release fingerprint and public smoke include native channel news script',()=>{
 const index=read('index.html');
 const release=read('tools/swapp-release.js');
 const smoke=read('tools/swapp-deploy-smoke.js');
 assert.match(index,/swapp-live-articles\.js\?v=20261017-channel-news-v13/);
 assert.ok(release.includes("'assets/swapp-live-articles.js'"));
 assert.ok(smoke.includes('nativeArticles.body.includes'));
 assert.ok(smoke.includes('20261017-channel-news-v13'));
});
