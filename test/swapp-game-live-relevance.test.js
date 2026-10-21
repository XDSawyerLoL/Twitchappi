'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'assets/swapp-media-live.js'),'utf8');

function element(tag){
 return {
  tagName:tag.toUpperCase(),className:'',textContent:'',href:'',src:'',loading:'',
  children:[],dataset:{},isConnected:true,
  appendChild(node){this.children.push(node);return node},
  append(...nodes){this.children.push(...nodes)},
  replaceChildren(...nodes){this.children=nodes},
  querySelector(){return null}
 };
}
function fixture(games,reply,{observer=true}={}){
 const calls=[],observed=[],callbacks=[],targets=[];
 const shelves=games.map(game=>{
  const target=element('div');targets.push(target);
  const shelf=element('section');shelf.dataset.game=game;
  shelf.querySelector=sel=>sel.includes('[data-live-results]')?target:null;
  return shelf;
 });
 const document={
  querySelectorAll:sel=>sel==='[data-swapp-live-shelf]'?shelves:[],
  querySelector:()=>null,
  createElement:element
 };
 let observerApi=null;
 class StubObserver{
  constructor(callback,options){callbacks.push(callback);this.options=options;observerApi=this}
  observe(x){observed.push(x)}
  unobserve(x){this.unobserved=x}
 }
 const fakeWindow=observer?{IntersectionObserver:StubObserver}:{};
 const fetch=async url=>{
  calls.push(url);
  const data=typeof reply==='function'?reply(url):reply;
  if(data instanceof Error)throw data;
  return {ok:true,json:async()=>data};
 };
 vm.runInNewContext(script,{document,fetch,window:fakeWindow,IntersectionObserver:StubObserver,URL,AbortController,setTimeout,clearTimeout,console});
 async function flush(){
  // Resolves the promise chain from fetch + JSON + DOM rendering.
  for(let i=0;i<24;i++)await Promise.resolve();
 }
 async function reveal(index=0){
  const callback=callbacks[0];
  if(!callback)throw Error('IntersectionObserver not installed');
  callback([{target:shelves[index],isIntersecting:true}]);
  await flush();
 }
 return {calls,observed,targets,shelves,flush,reveal,observerApi:()=>observerApi};
}
test('article live shelf is lazy and queries verified game discovery, not 12 general suggestions',async()=>{
 const h=fixture(['Elden Ring'],{success:true,game:'Elden Ring',items:[
  {login:'one',platform:'twitch',game_name:'Elden Ring',viewer_count:27,title:'Live confirmé'}
 ]});
 assert.equal(h.calls.length,0);
 assert.equal(h.observed.length,1);
 await h.reveal();
 assert.equal(h.calls.length,1);
 assert.match(h.calls[0],/^\/api\/discovery\/game-lives\?limit=6&game=Elden%20Ring$/);
 assert.equal(h.targets[0].children.length,1);
 assert.equal(h.targets[0].children[0].href,'/live/twitch/one?game=Elden%20Ring');
 assert.match(h.targets[0].children[0].children[1].children[0].textContent,/Live confirmé/);
});
test('strict game identity handles documented aliases, without confusing sequels',async()=>{
 const h=fixture(['Planet Zoo 2'],{
  success:true,game:'Planet Zoo II',items:[
   {login:'zoo2',game_name:'Planet Zoo II',platform:'twitch',title:'Suite'},
   {login:'oldzoo',game_name:'Planet Zoo',platform:'twitch',title:'Ancien jeu'},
   {login:'invalid-handle!',game_name:'Planet Zoo 2',platform:'twitch'}
  ]
 });
 await h.reveal();
 assert.equal(h.targets[0].children.length,1);
 assert.match(h.targets[0].children[0].href,/zoo2/);
 assert.doesNotMatch(h.targets[0].children[0].href,/oldzoo/);
});
test('multiple article shelves for the same game share one request',async()=>{
 const h=fixture(['Fortnite','Fortnite'],{success:true,game:'Fortnite',items:[
  {login:'same',platform:'twitch',game_name:'Fortnite',title:'Partie'},
  {login:'same',platform:'twitch',game_name:'Fortnite',title:'Doublon'},
  {login:'natives',platform:'oryon',game_name:'Fortnite',title:'Créateur SWAPP'}
 ]});
 await h.reveal(0);
 await h.reveal(1);
 assert.equal(h.calls.length,1);
 assert.equal(h.targets[0].children.length,2);
 assert.equal(h.targets[1].children.length,2);
 assert.equal(h.targets[0].children[1].href,'/natives');
});
test('a game with no verified live does not invent an unrelated streamer',async()=>{
 const h=fixture(['Hades'],{success:true,game:'Hades',items:[
  {login:'sequel',platform:'twitch',game_name:'Hades II'}
 ]});
 await h.reveal();
 assert.equal(h.targets[0].children.length,1);
 assert.equal(h.targets[0].children[0].tagName,'P');
 assert.match(h.targets[0].children[0].textContent,/Aucun créateur en direct confirmé/);
});
test('errors preserve article reading and return a clear status rather than random lives',async()=>{
 const h=fixture(['Baldur’s Gate 3'],new Error('Twitch unavailable'));
 await h.reveal();
 assert.equal(h.targets[0].children.length,2);
 assert.match(h.targets[0].children[0].textContent,/momentanément indisponibles/);
 assert.equal(h.targets[0].children[1].tagName,'BUTTON');
 assert.equal(h.targets[0].children[1].textContent,'Réessayer');
 assert.equal(h.calls.length,1);
});
test('a temporary Twitch outage can be retried without reloading the article',async()=>{
 let attempts=0;
 const h=fixture(['Elden Ring'],()=>{
  attempts++;
  return attempts===1?new Error('temporary outage'):{success:true,game:'Elden Ring',items:[
   {login:'recovered',platform:'twitch',game_name:'Elden Ring',title:'Live retrouvé'}
  ]};
 });
 await h.reveal();
 assert.equal(h.calls.length,1);
 const retry=h.targets[0].children[1];
 assert.equal(retry.tagName,'BUTTON');
 retry.onclick();
 await h.flush();
 assert.equal(h.calls.length,2,'retry must discard failed cached fetch');
 assert.equal(h.targets[0].children.length,1);
 assert.match(h.targets[0].children[0].href,/recovered/);
});

test('no game uses existing general discovery only, without new sections',async()=>{
 const h=fixture([''],{success:true,items:[
  {login:'other',platform:'twitch',game_name:'Valorant',title:'Valorant'}
 ]});
 await h.reveal();
 assert.match(h.calls[0],/\/api\/discovery\/home-lives\?/);
 assert.equal(h.targets[0].children.length,1);
});
test('release uses the changed client version and never schedules a paid workflow',()=>{
 const shell=fs.readFileSync(path.join(root,'modules/swapp-news/site-shell.js'),'utf8');
 const core=fs.readFileSync(path.join(root,'modules/swapp-news/article-core.js'),'utf8');
 assert.match(shell,/swapp-media-live\.js\?v=20261021-auto-fair-v1/);
 assert.match(core,/swapp-media-live\.js\?v=20261021-auto-fair-v1/);
 assert.equal(fs.existsSync(path.join(root,'.github/workflows/swapp-quality.yml')),false);
});

test('Safari-compatible loading and the retry callback have no AbortSignal.timeout dependency',()=>{
 assert.equal(script.includes('AbortSignal.timeout('),false);
 assert.ok(script.includes('new AbortController()'));
 assert.ok(script.includes('function message(shelf,notice,'));
 assert.ok(script.includes("message(shelf,'Nouvelle tentative…')"));
});
