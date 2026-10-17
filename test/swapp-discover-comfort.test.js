'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function harness({missing=false,saved=false,invite=false}={}){
 const source=read('assets/swapp-discover-comfort.js');
 const styles=[],listeners={},calls={watch:0},attrs={};
 const hero={textContent:'Elden Ring en direct'};
 const image={
  src:missing?'https://static-cdn.jtvnw.net/ttv-static/404_preview-1280x720.jpg':'https://img.example/thumb.jpg',
  currentSrc:'',complete:false,naturalWidth:640,hidden:false,
  getAttribute(name){return name==='src'?this.src:null},addEventListener(name,cb){listeners['image:'+name]=cb}
 };
 const card={
  id:'v4SwipeCard',dataset:{},attrs,querySelector(s){return s==='img'?image:s==='.v4LiveTitle'?hero:null},
  setAttribute(key,value){this.attrs[key]=value},
  getAttribute(key){return this.attrs[key]||null},
  classList:{added:[],add(name){if(!this.added.includes(name))this.added.push(name)},
   remove(name){this.added=this.added.filter(x=>x!==name)},contains(name){return this.added.includes(name)}}
 };
 card.closest=s=>s==='#v4SwipeCard'?card:null;
 const savedHolder={classList:{names:new Set(),add(name){this.names.add(name)},remove(name){this.names.delete(name)},contains(name){return this.names.has(name)}}};
 const savedImage={
  src:'https://img.example/saved-live.jpg',complete:false,naturalWidth:640,
  hidden:false,loading:'',decoding:'',getAttribute:()=>null,
  closest:()=>savedHolder,
  addEventListener(name,cb){listeners['saved:'+name]=cb}
 };
 const inviteHost={
  nodes:[],
  querySelector(s){return s==='.swapp-discover-creator-join'?this.nodes[0]||null:null},
  appendChild(node){this.nodes.push(node)}
 };
 const discover={
  querySelector(s){return s==='.v4Page'?{}:s==='#v4SwipeCard'?card:s==='.v4Hero > div'&&invite?inviteHost:null},
  querySelectorAll(s){return s==='.v4DeckSlot img,.v4FollowCard img'&&saved?[savedImage]:[]},
  addEventListener(name,cb){listeners[name]=cb}
 };
 const doc={
  readyState:'complete',head:{appendChild(node){styles.push(node)}},
  getElementById(id){return id==='discover'?discover:null},
  querySelector(s){return s==='#discover.view.active #v4SwipeCard'?card:null},
  createElement(tag){return {tag,textContent:'',id:''}}
 };
 let observer;
 const win={
  requestAnimationFrame:fn=>fn(),
  v4Watch(){calls.watch++},
  streamTargetView(){return 'manager'},
  setView(view){calls.view=view},
  MutationObserver:class{
   constructor(cb){this.callback=cb;observer=this}
   observe(){this.observed=true}
  }
 };
 vm.runInNewContext(source,{window:win,document:doc,console});
 return {win,doc,styles,discover,card,image,savedImage,savedHolder,inviteHost,observer:()=>observer,listeners,calls};
}
test('current Discover V4 script loads after its legacy JS in the SPA',()=>{
 const html=read('index.html');
 const legacy=html.indexOf('<script src="/index_script.js?');
 const comfort=html.indexOf('<script defer src="/assets/swapp-discover-comfort.js?v=20261017-journey-v17"');
 assert.ok(legacy>=0&&comfort>legacy);
 assert.equal((html.match(/swapp-discover-comfort\.js/g)||[]).length,1);
 assert.equal(fs.existsSync(path.join(root,'.github/workflows/swapp-quality.yml')),false);
});
test('Discover compact card and actions are mobile-first and isolated to V4',()=>{
 const s=read('assets/swapp-discover-comfort.js');
 assert.match(s,/body\.oryonDiscoverV4 #discover \.v4CardText/);
 assert.match(s,/body\.oryonDiscoverV4 #discover \.v4Card\{/);
 assert.match(s,/aspect-ratio:16\/10!important/);
 assert.match(s,/min-height:0!important/);
 assert.match(s,/max-height:390px!important/);
 assert.match(s,/min-height:46px!important/);
 assert.match(s,/font-size:15px!important/);
 assert.match(s,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(s,/fetch\(|sendBeacon|localStorage|axios|XMLHttpRequest|setInterval/);
});
test('DeckLurker keeps saved lives and removes empty placeholders without changing storage',()=>{
 const s=read('assets/swapp-discover-comfort.js');
 assert.match(s,/\.v4DeckSlot\.empty\{display:none!important\}/);
 assert.match(s,/\.v4Deck:has\(\.v4DeckSlot:not\(\.empty\)\)/);
 assert.match(s,/LURK sur un live/);
 assert.doesNotMatch(s,/removeChild|\.remove\(\)|\.replaceChildren\(/);
});
test('Discover hero card is keyboard accessible and opens the integrated viewer once',()=>{
 const h=harness();
 assert.equal(h.styles.length,1);
 assert.match(h.styles[0].textContent,/\.v4CardText/);
 assert.equal(h.card.attrs.role,'button');
 assert.equal(h.card.attrs.tabindex,'0');
 assert.match(h.card.attrs['aria-label'],/Elden Ring/);
 h.listeners.click({target:h.card});
 assert.equal(h.calls.watch,1);
 let prevented=false;
 h.listeners.keydown({target:h.card,key:'Enter',preventDefault(){prevented=true}});
 assert.equal(h.calls.watch,2);
 assert.equal(prevented,true);
 h.listeners.keydown({target:h.card,key:' ',preventDefault(){}});
 assert.equal(h.calls.watch,3);
});
test('swipes never open the video by accident',()=>{
 const h=harness();
 h.listeners.pointerdown({target:h.card,clientX:100,clientY:200});
 h.listeners.pointermove({target:h.card,clientX:180,clientY:201});
 h.listeners.click({target:h.card});
 assert.equal(h.calls.watch,0);
 h.listeners.pointerdown({target:h.card,clientX:100,clientY:200});
 h.listeners.click({target:h.card});
 assert.equal(h.calls.watch,1);
});
test('missing Twitch thumbnail gets a premium gradient fallback, no network substitute',()=>{
 const h=harness({missing:true});
 assert.equal(h.image.hidden,true);
 assert.ok(h.card.classList.added.includes('swapp-discover-no-image'));
 assert.match(h.image.alt,/Elden Ring/);
});
test('Discover V4 respects API score and diversity ordering all the way to the player',()=>{
 const code=read('index_script.js');
 const intro=code.indexOf('function renderDiscoverV4()');
 const search=code.lastIndexOf('async function fetchPool(',intro);
 assert.ok(search>0&&intro>search);
 const actual=code.slice(search,intro);
 assert.match(actual,/setItems\(items\)/);
 assert.match(actual,/already ranked these lives by mood, relevance and diversity/);
 assert.doesNotMatch(actual,/items\.sort\(\(a,b\)=>Math\.abs/);
 const html=read('index.html');
 assert.match(html,/index_script\.js\?v=20261018-home-clean-v23/);
});

test('live-card decorations refresh on actual DOM replacements without polling',()=>{
 const h=harness();
 assert.equal(h.observer()?.observed,true);
 const observer=h.observer();
 observer.callback();
 assert.equal(h.styles.length,1);
 assert.equal(h.card.attrs.tabindex,'0');
 assert.equal(h.calls.watch,0);
});

test('mobile action hierarchy puts Watch on a full-width row, with readable secondary controls',()=>{
 const h=harness();
 const css=h.styles[0].textContent;
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.v4Actions \.v4Btn\.primary\{\s*grid-column:1\/-1!important;grid-row:1!important/);
 assert.match(css,/min-height:51px!important;font-size:16px!important/);
 assert.match(css,/\.v4Card:after\{/);
 assert.match(css,/linear-gradient\(180deg/);
 assert.match(css,/\.v4CardText\{z-index:2!important\}/);
 assert.match(css,/\.v4Tags\{z-index:3!important\}/);
});

test('swiping to another creator refreshes alt, keyboard label and image fallback',()=>{
 const h=harness({missing:true});
 assert.equal(h.card.classList.contains('swapp-discover-no-image'),true);
 assert.equal(h.image.hidden,true);
 h.image.src='https://img.example/new-live.jpg';
 h.image.complete=false;
 h.image.naturalWidth=640;
 h.card.querySelector=function(s){
  if(s==='img')return h.image;
  if(s==='.v4LiveTitle')return {textContent:'Nouveau créateur sur Minecraft'};
  return null;
 };
 h.observer().callback();
 assert.equal(h.image.hidden,false);
 assert.equal(h.card.classList.contains('swapp-discover-no-image'),false);
 assert.match(h.image.alt,/Minecraft/);
 assert.match(h.card.attrs['aria-label'],/Minecraft/);
 h.listeners['image:error']();
 assert.equal(h.image.hidden,true);
 assert.equal(h.card.classList.contains('swapp-discover-no-image'),true);
});

test('late thumbnail errors never hide a different creator after a swipe',()=>{
 const h=harness();
 const oldError=h.listeners['image:error'];
 h.image.src='https://img.example/next-live.jpg';
 h.observer().callback();
 oldError();
 assert.equal(h.image.hidden,false);
 assert.equal(h.card.classList.contains('swapp-discover-no-image'),false);
});

test('observer sees changed thumbnails and text without an interval or network calls',()=>{
 const h=harness();
 assert.equal(h.observer()?.observed,true);
 const source=read('assets/swapp-discover-comfort.js');
 assert.match(source,/characterData:true/);
 assert.match(source,/attributeFilter:\['src'\]/);
 assert.doesNotMatch(source,/setInterval|fetch\(|sendBeacon|localStorage/);
});

test('DeckLurker and followed-creator images fall back without removing saved cards',()=>{
 const h=harness({saved:true});
 assert.equal(h.savedImage.hidden,false);
 h.savedImage.src='https://static-cdn.jtvnw.net/ttv-static/404_preview-1280x720.jpg';
 h.observer().callback();
 assert.equal(h.savedImage.hidden,true);
 assert.equal(h.savedHolder.classList.contains('swapp-discover-no-image'),true);
 assert.match(h.styles[0].textContent,/\.v4FollowCard\)\.swapp-discover-no-image/);
 h.savedImage.src='https://img.example/recovered-live.jpg';
 h.observer().callback();
 assert.equal(h.savedImage.hidden,false);
 assert.equal(h.savedHolder.classList.contains('swapp-discover-no-image'),false);
});
test('stale saved-card image errors cannot damage a newly loaded preview',()=>{
 const h=harness({saved:true});
 const oldFail=h.listeners['saved:error'];
 assert.equal(typeof oldFail,'function');
 h.savedImage.src='https://img.example/new.jpg';
 h.observer().callback();
 oldFail();
 assert.equal(h.savedImage.hidden,false);
 assert.equal(h.savedHolder.classList.contains('swapp-discover-no-image'),false);
});

test('Discover invites new creators through the existing account flow without a duplicate banner',()=>{
 const h=harness({invite:true});
 assert.equal(h.inviteHost.nodes.length,1);
 const button=h.inviteHost.nodes[0];
 assert.equal(button.tag,'button');
 assert.equal(button.type,'button');
 assert.match(button.className,/swapp-discover-creator-join/);
 assert.match(button.textContent,/Créer ta chaîne sur SWAPP/);
 button.onclick();
 assert.equal(h.calls.view,'manager');
 // The decorated Discover view can be re-rendered without duplicate CTA.
 h.observer().callback();
 assert.equal(h.inviteHost.nodes.length,1);
 // Guest visitors are routed to the existing registration/login screen.
 h.win.streamTargetView=undefined;
 button.onclick();
 assert.equal(h.calls.view,'settings');
 const source=read('assets/swapp-discover-comfort.js');
 assert.doesNotMatch(source,/fetch\(|sendBeacon|localStorage|XMLHttpRequest/);
});
