'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const code=read('assets/swapp-article-player.js');
const player=require('../assets/swapp-article-player');

function mockBrowser(){
 const listeners={},created=[];
 function element(tag){
  const node={
   tagName:tag.toUpperCase(),children:[],attributes:{},removed:false,
   append(...nodes){this.children.push(...nodes)},
   setAttribute(name,value){this.attributes[name]=value},
   remove(){this.removed=true},
   className:'',textContent:'',href:'',title:''
  };
  created.push(node);
  return node;
 }
 const article={isConnected:true};
 const actus={classList:{contains:()=>true}};
 const doc={
  readyState:'complete',
  createElement:element,
  body:{children:[],append(node){this.children.push(node)}},
  querySelector:()=>article,
  getElementById:()=>actus
 };
 const browser={
  document:doc,
  location:{hostname:'swapp.tv'},
  innerWidth:1280,innerHeight:800,
  addEventListener:(event,fn)=>{listeners[event]=fn}
 };
 const context={window:browser,URL,console};
 vm.runInNewContext(code,context);
 return {browser,doc,created,listeners,article,api:browser.SwappArticlePlayer};
}

test('the Twitch player URL is constrained to a real channel and current site parent',()=>{
 const u=new URL(player.playerUrl('Creator_123','swapp.tv'));
 assert.equal(u.protocol,'https:');
 assert.equal(u.hostname,'player.twitch.tv');
 assert.equal(u.searchParams.get('channel'),'creator_123');
 assert.equal(u.searchParams.get('parent'),'swapp.tv');
 assert.equal(u.searchParams.get('autoplay'),'true');
 assert.equal(u.searchParams.get('muted'),'true');
 assert.equal(player.playerUrl('bad/login','swapp.tv'),null);
 assert.equal(player.playerUrl('valid','evil.com/anything'),null);
});

test('no video iframe or third party request is created before the user action',()=>{
 const app=mockBrowser();
 assert.ok(app.api);
 assert.equal(app.created.length,0);
 assert.equal(app.doc.body.children.length,0);
 assert.equal(app.api.open({login:'a'}),false);
 assert.equal(app.created.length,0);
});

test('one user click opens a contained video with a visible close and full-channel link',()=>{
 const app=mockBrowser();
 assert.equal(app.api.open({login:'creator_name',name:'Créateur',game:'Fortnite'}),true);
 const iframe=app.created.find(x=>x.tagName==='IFRAME');
 assert.ok(iframe);
 assert.match(iframe.src,/player\.twitch\.tv/);
 assert.match(iframe.allow,/fullscreen/);
 assert.equal(iframe.referrerPolicy,'strict-origin-when-cross-origin');
 const links=app.created.filter(x=>x.tagName==='A');
 assert.equal(links.length,1);
 assert.equal(links[0].href,'https://www.twitch.tv/creator_name');
 assert.equal(links[0].target,'_blank');
 assert.equal(links[0].rel,'noopener noreferrer');
 const close=app.created.find(x=>x.tagName==='BUTTON');
 assert.equal(close.attributes['aria-label'],'Fermer le mini-lecteur');
 close.onclick();
 assert.ok(app.doc.body.children[0].removed);
});

test('the mini-player is cleaned up on back navigation, Escape and replacement',()=>{
 const app=mockBrowser();
 assert.equal(app.api.open({login:'first_live'}),true);
 const first=app.doc.body.children[0];
 assert.equal(app.api.open({login:'second_live'}),true);
 assert.equal(first.removed,true);
 app.listeners.keydown({key:'Escape'});
 assert.ok(app.doc.body.children[1].removed);
 assert.equal(app.api.open({login:'third_live'}),true);
 app.listeners.popstate();
 assert.ok(app.doc.body.children[2].removed);
});


test('player respects Twitch minimum viewport and never starts an undersized iframe',()=>{
 const app=mockBrowser();
 assert.equal(app.api.canEmbed(430,500),true);
 assert.equal(app.api.canEmbed(429,500),false);
 assert.equal(app.api.canEmbed(800,499),false);
 app.browser.innerWidth=390;
 assert.equal(app.api.open({login:'creator'}),false);
 assert.equal(app.created.length,0);
 app.browser.innerWidth=1280;
 assert.equal(app.api.open({login:'creator'}),true);
 app.browser.innerWidth=375;
 app.listeners.resize();
 assert.equal(app.doc.body.children[0].removed,true);
});
test('mobile uses an accessible direct-watch alternative and embed viewport is at least 400×300',()=>{
 const app=read('assets/swapp-actus-app.js');
 const css=read('assets/swapp-art-direction.css');
 assert.match(app,/SwappArticlePlayer\?\.canEmbed\?\.\(window\.innerWidth,window\.innerHeight\)/);
 assert.match(app,/canEmbed\?'Voir la chaîne ↗':'Voir le live ↗'/);
 assert.match(css,/width:min\(500px,calc\(100vw - 24px\)\)/);
 assert.match(css,/\.swapp-article-mini-video\{height:300px;min-height:300px/);
});

test('full view opens the integrated SWAPP player; modified clicks use official Twitch fallback',()=>{
 const app=mockBrowser(),opened=[];
 app.browser.swappOpenLive1014=payload=>opened.push(JSON.parse(decodeURIComponent(payload)));
 assert.equal(app.api.open({login:'creator_name',name:'Créateur',game:'Fortnite'}),true);
 const link=app.created.find(x=>x.tagName==='A');
 let prevented=false;
 link.onclick({button:0,preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 assert.equal(opened.length,1);
 assert.equal(opened[0].platform,'twitch');
 assert.equal(opened[0].login,'creator_name');
 assert.equal(opened[0].game_name,'Fortnite');
 assert.ok(app.doc.body.children[0].removed);
 prevented=false;
 link.onclick({button:0,ctrlKey:true,preventDefault(){prevented=true}});
 assert.equal(prevented,false);
 assert.equal(opened.length,1);
});
test('the existing articles and stream cards expose accessible inline play without more sections',()=>{
 const app=read('assets/swapp-actus-app.js');
 const html=read('index.html');
 const css=read('assets/swapp-art-direction.css');
 const main=read('index_script.js');
 assert.ok(html.indexOf('/assets/swapp-article-player.js?v=20261015-player-40') <
   html.indexOf('/assets/swapp-actus-app.js?v=20261015-player-40'));
 assert.match(app,/swapp-reader-live-inline/);
 assert.match(app,/SwappArticlePlayer\?\.open/);
 assert.match(app,/SwappArticlePlayer\?\.close\(\)/);
 assert.match(app,/link=el\(native\?'a':'div','swapp-reader-live-card'\)/);
 assert.match(app,/SwappArticlePlayer\?\.openFull/);
 assert.match(app,/https:\/\/www\.twitch\.tv\//);
 assert.match(css,/\.swapp-article-mini-player/);
 assert.match(css,/\.swapp-live-pip1014/);
 assert.match(main,/swapp-live-pip1014/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/swapp-view-arrive/);
 assert.match(html,/swapp-art-direction\.css\?v=20261015-player-39/);
 assert.doesNotMatch(app,/swapp-actus-mini-sidebar-duplicated/);
});
