'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function harness({missing=false}={}){
 const source=read('assets/swapp-discover-comfort.js');
 const styles=[],listeners={},calls={watch:0},attrs={};
 const hero={textContent:'Elden Ring en direct'};
 const image={
  src:missing?'https://static-cdn.jtvnw.net/ttv-static/404_preview-1280x720.jpg':'https://img.example/thumb.jpg',
  currentSrc:'',complete:false,naturalWidth:640,hidden:false,
  getAttribute:()=>null,addEventListener(name,cb){listeners['image:'+name]=cb}
 };
 const card={
  id:'v4SwipeCard',dataset:{},attrs,querySelector(s){return s==='img'?image:s==='.v4LiveTitle'?hero:null},
  setAttribute(key,value){this.attrs[key]=value},classList:{added:[],add(name){this.added.push(name)}}
 };
 card.closest=s=>s==='#v4SwipeCard'?card:null;
 const discover={
  querySelector(s){return s==='.v4Page'?{}:s==='#v4SwipeCard'?card:null},
  querySelectorAll(s){return s==='.v4DeckSlot img,.v4FollowCard img'?[]:[]},
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
  MutationObserver:class{
   constructor(cb){this.callback=cb;observer=this}
   observe(){this.observed=true}
  }
 };
 vm.runInNewContext(source,{window:win,document:doc,console});
 return {win,doc,styles,discover,card,image,observer:()=>observer,listeners,calls};
}
test('current Discover V4 script loads after its legacy JS in the SPA',()=>{
 const html=read('index.html');
 const legacy=html.indexOf('<script src="/index_script.js?');
 const comfort=html.indexOf('<script defer src="/assets/swapp-discover-comfort.js?v=20261016-v4-mobile-1"');
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
 assert.match(html,/index_script\.js\?v=20261016-discover-v4-39/);
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
