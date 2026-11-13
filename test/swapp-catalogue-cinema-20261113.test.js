'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const js=read('assets/swapp-catalogue-lab.js');
const css=read('assets/swapp-catalogue-lab.css');
const html=require('../modules/swapp-catalogue-lab').page();

test('cinema lab keeps an isolated page with the real SWAPP header and versioned resources',()=>{
 assert.match(html,/id="swapp-catalogue-lab"/);
 assert.match(html,/id="scl-feature-prev"/);
 assert.match(html,/id="scl-feature-next"/);
 assert.match(html,/id="scl-feature-dots"/);
 assert.match(html,/scl-feature-vignette/);
 assert.match(html,/swapp-catalogue-lab\.js\?v=20261113-public-home-audience-v5/);
 assert.match(html,/swapp-catalogue-lab\.css\?v=20261113-public-home-small-v4/);
 assert.match(html,/robots" content="noindex,nofollow,noarchive"/);
 assert.match(html,/id="nav"/);
 assert.doesNotMatch(read('assets/swapp-navigation.js'),/catalogue-test/);
});

function node(){
 return {
  disabled:false,children:[],attributes:{},listeners:{},
  type:'',setAttribute(k,v){this.attributes[k]=String(v)},
  addEventListener(k,fn){this.listeners[k]=fn},
  append(...children){this.children.push(...children)},
  replaceChildren(...children){this.children=[...children]}
 };
}
function heroHarness(){
 const start=js.indexOf('function setHeroItems(){');
 const end=js.indexOf("$('scl-feature-watch').addEventListener",start);
 assert.ok(start>0&&end>start);
 const featureCalls=[],dots=node(),prev=node(),next=node();
 const live=[
  {id:'swapp:alice',kind:'live',platform:'swapp',image:'https://swapp.tv/a.jpg'},
  {id:'twitch:bob',kind:'live',platform:'twitch',image:'https://static-cdn.jtvnw.net/b.jpg'},
  {id:'twitch:carol',kind:'live',platform:'twitch',image:''}
 ];
 const games=[{id:'game:minecraft',kind:'game',image:'https://static-cdn.jtvnw.net/c.jpg'}];
 const state={lives:live,games,featured:null,heroItems:[],heroIndex:0,heroTimer:null};
 let timer;
 const api=new Function('state','heroDots','feature','create','$','window','document','dialog','hero','setInterval','clearInterval',
  js.slice(start,end)+'; return {setHeroItems,showHero,startHeroRotation};')(
   state,dots,item=>featureCalls.push(item),()=>node(),id=>id==='scl-feature-prev'?prev:next,
   {matchMedia:()=>({matches:false})},{hidden:false},{open:false},
   {matches(){return false}},
   fn=>{timer=fn;return 1},()=>{timer=null}
  );
 return {api,state,featureCalls,dots,prev,next,getTimer:()=>timer};
}
test('hero carousel favors actual SWAPP live art, has accessible pagination and wraps',()=>{
 const h=heroHarness();
 h.api.setHeroItems();
 assert.equal(h.state.heroItems[0].id,'swapp:alice');
 assert.equal(h.featureCalls.at(-1).id,'swapp:alice');
 assert.equal(h.dots.children.length,3);
 assert.equal(h.dots.children[0].attributes['aria-pressed'],'true');
 assert.match(h.dots.children[1].attributes['aria-label'],/sélection 2 sur 3/);
 h.api.showHero(1);
 assert.equal(h.featureCalls.at(-1).id,'twitch:bob');
 assert.equal(h.dots.children[1].attributes['aria-pressed'],'true');
 h.api.showHero(-1);
 assert.equal(h.state.heroIndex,2);
 assert.equal(h.featureCalls.at(-1).id,'game:minecraft');
 h.api.startHeroRotation();
 assert.equal(typeof h.getTimer(),'function');
 h.getTimer()();
 assert.equal(h.state.heroIndex,0);
});
test('a one-item hero has no active next or previous control',()=>{
 const h=heroHarness();
 h.state.lives=[h.state.lives[0]];
 h.state.games=[];
 h.api.setHeroItems();
 assert.equal(h.prev.disabled,true);
 assert.equal(h.next.disabled,true);
 h.api.startHeroRotation();
 assert.equal(h.getTimer(),undefined);
});
test('hover previews are time-delayed, single-instance, muted and properly removed',()=>{
 const start=js.indexOf('function stopHoverPreview(){');
 const end=js.indexOf('document.addEventListener(\'visibilitychange\'',start);
 assert.ok(start>0&&end>start);
 const document={hidden:false},dialog={open:false},card={
  isConnected:true,
  matches(selector){return selector===':hover'},
  classList:{list:new Set(),add(value){this.list.add(value)},remove(value){this.list.delete(value)}}
 };
 const media={children:[],append(child){this.children.push(child)}};
 const state={hoverTimer:null,hoverIframe:null,hoverCard:null};
 let clock=null;
 const create=()=>({
  listeners:{},attributes:{},removed:false,
  addEventListener(k,fn){this.listeners[k]=fn},
  setAttribute(k,v){this.attributes[k]=v},
  remove(){this.removed=true}
 });
 const functions=new Function('state','document','dialog','window','navigator','create','setTimeout','clearTimeout','URL',
  js.slice(start,end)+';return {stopHoverPreview,scheduleHoverPreview}')(
   state,document,dialog,
   {matchMedia:q=>({matches:q.includes('hover: hover')}),location:{hostname:'swapp.tv'}},
   {connection:{saveData:false}},create,
   (fn,delay)=>{clock={fn,delay};return 77},
   ()=>{clock=null},URL);
 const twitch={kind:'live',platform:'twitch',login:'verified_twitch',name:'Twitch Verified',image:'https://static-cdn.jtvnw.net/example.jpg'};
 functions.scheduleHoverPreview(twitch,card,media);
 assert.equal(clock.delay,1250);
 assert.equal(media.children.length,0,'no network player before intentional hover duration');
 clock.fn();
 assert.equal(media.children.length,1);
 assert.match(media.children[0].src,/player\.twitch\.tv/);
 assert.match(media.children[0].src,/channel=verified_twitch/);
 assert.match(media.children[0].src,/parent=swapp\.tv/);
 assert.match(media.children[0].src,/muted=true/);
 assert.match(media.children[0].src,/autoplay=true/);
 assert.equal(state.hoverIframe,media.children[0]);
 functions.stopHoverPreview();
 assert.equal(media.children[0].removed,true);
 assert.equal(state.hoverIframe,null);
 const native={...twitch,platform:'swapp'};
 functions.scheduleHoverPreview(native,card,media);
 assert.equal(state.hoverTimer,null,'native SWAPP must not claim to embed an unsupported mini player');
});
test('hover never moves the global featured banner or creates an automatic full-screen player',()=>{
 const start=js.indexOf('function createCard(item){');
 const end=js.indexOf('const matching=item=>',start);
 assert.ok(start>0&&end>start);
 const code=js.slice(start,end);
 assert.doesNotMatch(code,/feature\(item\)/);
 assert.match(code,/mouseenter.*scheduleHoverPreview/);
 assert.match(code,/mouseleave.*stopHoverPreview/);
 assert.match(code,/focusout/);
 assert.match(code,/scl-card-peek/);
 assert.match(js,/document\.addEventListener\('scroll',stopHoverPreview,true\)/);
 assert.match(js,/document\.addEventListener\('visibilitychange'/);
 assert.match(js,/navigator\.connection\?\.saveData/);
 assert.match(js,/prefers-reduced-motion: reduce/);
});
test('Netflix-like hierarchy is full bleed, poster first, with desktop reveal and touch fallback',()=>{
 for(const selector of ['.scl-feature-switch','.scl-feature-dots','.scl-feature-vignette',
  '.scl-card-details','.scl-card-action-row','.scl-card-hover-player',
  '.scl-cards-games .scl-card','.scl-side-link'])assert.ok(css.includes(selector),selector);
 assert.match(css,/\.scl-feature\{\s*margin:0;width:100%;height:clamp/);
 assert.match(css,/#scl-live\{margin-top:-113px\}/);
 assert.match(css,/\.scl-card:hover \.scl-card-action-row/);
 assert.match(css,/@media \(hover:none\),\(pointer:coarse\)/);
 assert.match(css,/\.scl-card-action-row\{display:flex;pointer-events:auto/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('detail modal has its own correctly labelled heading',()=>{
 assert.match(js,/title\.id='scl-dialog-title'/);
 assert.match(html,/aria-labelledby="scl-dialog-title"/);
});
