'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {gameHubs,renderMyGames,renderGamePage}=require('../modules/swapp-game-pages');
const live=require('../assets/swapp-my-games-live');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('known game aliases match without confusing games and sequels',()=>{
 assert.equal(live.sameGame('Grand Theft Auto VI','GTA VI'),true);
 assert.equal(live.sameGame('Planet Zoo II','Planet Zoo 2'),true);
 assert.equal(live.sameGame('Hades','Hades II'),false);
 assert.equal(live.sameGame('Planet Zoo','Planet Zoo 2'),false);
});
test('only platform-authoritative real streams from the requested game are accepted',()=>{
 const game={slug:'planet-zoo-2',game:'Planet Zoo 2'};
 const clean=live.checkedLives({success:true,game:'Planet Zoo II',items:[
  {platform:'oryon',login:'swappone',game_name:'Planet Zoo II',title:'Sur SWAPP',viewer_count:12},
  {platform:'twitch',login:'twitchone',game_name:'Planet Zoo 2',title:'Sur Twitch',viewer_count:15},
  {platform:'twitch',login:'wronggame',game_name:'Planet Zoo',title:'Autre jeu'},
  {platform:'twitch',login:'replays',game_name:'Planet Zoo II',title:'Replay de la veille'},
  {platform:'twitch',login:'javascript:bad',game_name:'Planet Zoo 2',title:'Invalide'},
  {platform:'unknown',login:'creator',game_name:'Planet Zoo 2',title:'Non vérifié'}
 ]},game);
 assert.deepEqual(clean.map(x=>x.login),['swappone','twitchone']);
 assert.throws(()=>live.checkedLives({success:false,game:'Planet Zoo 2',items:[]},game));
 assert.throws(()=>live.checkedLives({success:true,game:'Planet Zoo',items:[]},game));
});
test('SWAPP native leads the selection even when Twitch has more viewers',()=>{
 const entries=[
  {platform:'twitch',login:'a',slug:'minecraft',game:'Minecraft',viewers:200},
  {platform:'twitch',login:'a',slug:'minecraft',game:'Minecraft',viewers:200},
  {platform:'oryon',login:'b',slug:'minecraft',game:'Minecraft',viewers:2},
  {platform:'swapp',login:'c',slug:'minecraft',game:'Minecraft',viewers:1},
  {platform:'twitch',login:'d',slug:'minecraft',game:'Minecraft',viewers:20}
 ];
 assert.deepEqual(live.curateLiveRows([entries]).map(x=>x.login),['b','c','a']);
});
function ui(){
 const handlers=new Map(),calls=[],node=(tag='div')=>({
  tagName:tag.toUpperCase(),textContent:'',hidden:false,disabled:false,children:[],
  addEventListener(name,fn){this['on:'+name]=fn},
  append(...items){this.children.push(...items)},
  replaceChildren(...items){this.children=items}
 });
 const status=node(),results=node(),refresh=node('button'),more=node('button');
 const panel={querySelector:q=>({
  '[data-my-games-live-status]':status,
  '[data-my-games-live-results]':results,
  '[data-my-games-live-refresh]':refresh,
  '[data-my-games-live-more]':more
 })[q]||null};
 const doc={querySelector:q=>q==='[data-my-games-live]'?panel:null,createElement:node};
 let observer;
 const env={
  URL,AbortController,setTimeout,clearTimeout,
  addEventListener(name,fn){handlers.set(name,fn)},
  IntersectionObserver:class{
   constructor(cb){observer=cb}
   observe(){}
   disconnect(){}
  },
  async fetch(url,options){
   calls.push({url,options});
   const name=decodeURIComponent(String(url).split('&game=')[1]||'');
   return {ok:true,json:async()=>({success:true,game:name,items:[
    {platform:'twitch',login:'streamtwitch',game_name:name,title:'Twitch maintenant',viewer_count:350},
    {platform:'oryon',login:'streamswapp',game_name:name,title:'SWAPP maintenant',viewer_count:13}
   ]})};
  }
 };
 live.mount(doc,env);
 async function tick(){for(let i=0;i<35;i++)await Promise.resolve()}
 function interests(games){handlers.get('swapp:game-interests')({detail:{games}})}
 return {calls,status,results,refresh,more,interests,tick,show:()=>observer([{isIntersecting:true}])};
}
test('lazy player hub shows verified native SWAPP first, Twitch internally, and correct SOCIAL deep links',async()=>{
 const h=ui();
 h.interests([{slug:'minecraft',game:'Minecraft'}]);
 assert.equal(h.calls.length,0,'no request before section enters view');
 h.show();await h.tick();
 assert.equal(h.calls.length,1);
 assert.equal(h.results.children.length,2);
 const first=h.results.children[0].children[1].children[3].children[0];
 const second=h.results.children[1].children[1].children[3].children[0];
 assert.equal(first.href,'/streamswapp');
 assert.equal(second.href,'/live/twitch/streamtwitch?game=Minecraft');
 assert.equal(h.results.children[0].children[1].children[3].children[1].href,'/communaute?game=Minecraft');
 assert.match(h.status.textContent,/1 SWAPP · 1 Twitch/);
 h.refresh['on:click']();await h.tick();
 assert.equal(h.calls.length,2,'manual refresh instead of polling');
});
test('manual pagination examines remaining selected games and does not invent extra games',async()=>{
 const h=ui();
 h.interests(['one','two','three','four','five'].map(game=>({game,slug:game+'-game'})));
 assert.equal(h.more.hidden,false);
 h.show();await h.tick();
 assert.equal(h.calls.length,4);
 h.more['on:click']();await h.tick();
 assert.equal(h.calls.length,5);
 assert.match(h.calls[4].url,/game=five/);
});
test('SSR connects published games to live, SOCIAL, shop and both scripts without false live status',()=>{
 const articles=[
  {slug:'one-story',title:'Minecraft article 1',summary:'Publié',game:'Minecraft',status:'published'},
  {slug:'two-story',title:'Minecraft article 2',summary:'Publié',game:'Minecraft',status:'published'},
  {slug:'draft-story',title:'Non publié',summary:'Brouillon',game:'Minecraft',status:'draft'}
 ];
 const hub=gameHubs(articles),html=renderMyGames(hub),page=renderGamePage(hub[0]);
 assert.match(html,/data-my-games-live/);
 assert.match(html,/data-my-games-live-more hidden/);
 assert.match(html,/href="\/communaute\?game=Minecraft"/);
 assert.match(page,/href="\/communaute\?game=Minecraft"/);
 assert.match(html,/href="\/boutique"/);
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.doesNotMatch(html,/draft-story|Non publié|spectateurs connectés/);
 const spa=read('index.html'),shell=read('modules/swapp-news/site-shell.js');
 for(const file of [spa,shell]){
  assert.match(file,/swapp-my-games-live\.js\?v=20261019-live-journey-v3/);
  assert.match(file,/swapp-my-games\.js\?v=20261019-live-journey-v3/);
  assert.match(file,/swapp-my-games\.css\?v=20261019-live-journey-v3/);
  assert.ok(file.indexOf('swapp-my-games-live.js')<file.indexOf('swapp-my-games.js'));
 }
 const client=read('assets/swapp-my-games.js');
 assert.match(client,/swapp:game-interests/);
 const social=read('assets/swapp-social-next.js');
 assert.match(social,/socialGameMatch/);
 assert.match(social,/\/live\/twitch\//);
 assert.doesNotMatch(social,/https:\/\/www\.twitch\.tv\/'\+encodeURIComponent\(login\)/);
});
