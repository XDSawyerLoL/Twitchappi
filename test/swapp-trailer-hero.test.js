'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-article-trailer-bg.js'),'utf8');
function harness({reduced=false,initiallyHidden=false}={}){
 const scripts=[],listeners=[],events=[];
 const windowEvents=[],messages=[];
 const content={children:[],append(...nodes){this.children.push(...nodes)}};
 const poster={hidden:false};
 const scene={isConnected:true,parentElement:{querySelector(){return content}},
  getAttribute(n){return n==='data-swapp-trailer-id'?'uQuKE0KDgiM':null},
  querySelector(){return poster},
  classList:{added:[],removed:[],add(x){this.added.push(x)},remove(x){this.removed.push(x)}},
  append(iframe){scripts.push(iframe)}};
 const document={readyState:'loading',hidden:initiallyHidden,
  createElement(tag){return {tagName:tag,attributes:{},listeners:{},
   setAttribute(n,v){this.attributes[n]=String(v)},
   ...(tag==='iframe'?{contentWindow:{postMessage(data,origin){messages.push({data,origin})}}}:{}),
   addEventListener(n,fn){this.listeners[n]=fn},append(...nodes){this.children=nodes},
   remove(){this.removed=true}}},addEventListener(n,fn){listeners.push({n,fn})},
   removeEventListener(n,fn){const i=listeners.findIndex(x=>x.n===n&&x.fn===fn);if(i>=0)listeners.splice(i,1)},
   querySelectorAll(){return [scene]}};
 const window={matchMedia:()=>({matches:reduced}),addEventListener(n,fn){windowEvents.push({n,fn})},
  removeEventListener(n,fn){const i=windowEvents.findIndex(x=>x.n===n&&x.fn===fn);if(i>=0)windowEvents.splice(i,1)},
  __tcfapi(){throw Error('Video must not invoke AdSense CMP')},
  googlefc:{showRevocationMessage(){throw Error('Video must not open consent dialog')}}};
 vm.runInNewContext(script,{window,document,navigator:{},console,IntersectionObserver:undefined});
 window.SwappTrailerHero.mount(scene);
 const button=content.children[0].children[0];
 return {scene,scripts,button,document,events,listeners,windowEvents,messages};
}
test('trailer autoplays without clicks or CMP and starts silently at ten seconds',()=>{
 const h=harness();
 assert.equal(h.scripts.length,1);
 assert.match(h.scripts[0].src,/youtube-nocookie\.com\/embed\/uQuKE0KDgiM/);
 assert.match(h.scripts[0].src,/autoplay=1&mute=1/);
 assert.match(h.scripts[0].src,/loop=1&playlist=uQuKE0KDgiM/);
 assert.match(h.scripts[0].src,/start=10/);
 assert.equal(h.scripts[0].attributes.loading,'eager');
 assert.equal(h.scripts[0].attributes.allow,'autoplay; encrypted-media; picture-in-picture');
 assert.equal(h.button.textContent,'Ⅱ Mettre la vidéo en pause');
});
test('pause and resume work without a consent dialog',()=>{
 const h=harness();
 h.button.listeners.click();assert.equal(h.scripts[0].removed,true);
 h.button.listeners.click();assert.equal(h.scripts.length,2);
});
test('reduced motion prevents autoplay, but manual playback remains available',()=>{
 const h=harness({reduced:true});assert.equal(h.scripts.length,0);
 h.button.listeners.click();assert.equal(h.scripts.length,1);
});
test('hidden tabs defer autoplay until visible',()=>{
 const h=harness({initiallyHidden:true});assert.equal(h.scripts.length,0);
 h.document.hidden=false;
 h.listeners.find(x=>x.n==='visibilitychange').fn();
 assert.equal(h.scripts.length,1);
});
test('full-bleed scene covers the viewport and continues its original fade',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../assets/swapp-article-immersive.css'),'utf8');
 assert.match(css,/width:max\(100%,calc\(var\(--swapp-scene-height\) \* 1\.777778\)\)/);
 assert.match(css,/height:max\(100%,calc\(100vw \* \.5625\)\)/);
 assert.match(css,/\.swapp-article-scene\.has-trailer::before/);
 assert.match(css,/\.swapp-article-scene\.has-trailer \.swapp-article-trailer-poster/);
});

test('YouTube onReady forces a 10-second seek even when embed ignores start URL',()=>{
 const h=harness();
 const player=h.scripts[0];
 const onMessage=h.windowEvents.find(x=>x.n==='message');
 assert.ok(onMessage);
 const send=(origin,data)=>onMessage.fn({origin,source:player.contentWindow,data:JSON.stringify(data)});
 send('https://not-youtube.example',{event:'onReady'});
 assert.equal(h.messages.length,0);
 send('https://www.youtube-nocookie.com',{event:'onReady'});
 const commands=h.messages.map(x=>JSON.parse(x.data)).filter(x=>x.event==='command');
 assert.deepEqual?.(commands.map(x=>x.func),['seekTo','mute','playVideo']);
 assert.equal(commands[0].args[0],10);
 assert.equal(commands[0].args[1],true);
 assert.match(player.src,/enablejsapi=1/);
});
