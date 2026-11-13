'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const sdkSource=read('assets/swapp-tv-twitch-player.js');
const station=read('assets/swapp-tv-broadcast.js');

function sdkHarness(){
 const spawned=[],scripts=[];
 class TwitchPlayer{
  static READY='ready';static PLAYING='playing';static PLAYBACK_BLOCKED='blocked';static OFFLINE='offline';
  constructor(id,options){this.id=id;this.options=options;this.callbacks={};this.muted=null;this.playCalls=0;spawned.push(this)}
  addEventListener(event,callback){this.callbacks[event]=callback}
  emit(event){this.callbacks[event]?.()}
  setMuted(flag){this.muted=flag}
  play(){this.playCalls++}
 }
 const win={document:{
  createElement(tag){
   if(tag==='script'){
    const handlers={};const script={tag,addEventListener(k,cb){handlers[k]=cb},emit(k){handlers[k]?.()}};
    scripts.push(script);return script;
   }
   return {tag,id:null,className:'',isConnected:true,remove(){this.isConnected=false}};
  },
  head:{append(script){Promise.resolve().then(()=>{win.Twitch={Player:TwitchPlayer};script.emit('load')})}}
 }};
 const module={exports:{}};
 vm.runInNewContext(sdkSource,{window:win,module,Promise,setTimeout,clearTimeout,Error});
 return {sdk:module.exports,spawned,scripts,win,TwitchPlayer};
}
test('official Twitch SDK loads once, mutes first, then explicitly plays on READY',async()=>{
 const h=sdkHarness(),events=[];
 const container={append(){}};
 const player=h.sdk.mount({container,login:'valid_live',parent:'swapp.tv',
  onReady:()=>events.push('ready'),onPlaying:()=>events.push('playing'),
  onBlocked:()=>events.push('blocked')});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.scripts.length,1);
 assert.equal(h.scripts[0].src,'https://player.twitch.tv/js/embed/v1.js');
 assert.equal(h.spawned.length,1);
 const embed=h.spawned[0];
 assert.equal(embed.options.channel,'valid_live');
 assert.deepEqual(Array.from(embed.options.parent),['swapp.tv']);
 assert.equal(embed.options.autoplay,true);
 assert.equal(embed.options.muted,true);
 assert.equal(embed.options.width,'100%');
 assert.equal(embed.options.height,'100%');
 embed.emit(h.TwitchPlayer.READY);
 assert.equal(embed.muted,true,'mute must precede the programmatic autoplay request');
 assert.equal(embed.playCalls,1,'autoplay must call Twitch.play() after READY');
 assert.deepEqual(events,['ready']);
 embed.emit(h.TwitchPlayer.PLAYBACK_BLOCKED);
 assert.deepEqual(events,['ready','blocked']);
 assert.equal(player.resume(),true);
 assert.equal(embed.playCalls,2,'real viewer gesture retries via official API');
 embed.emit(h.TwitchPlayer.PLAYING);
 assert.deepEqual(events,['ready','blocked','playing']);
 player.destroy();
 embed.emit(h.TwitchPlayer.PLAYBACK_BLOCKED);
 assert.deepEqual(events,['ready','blocked','playing'],'old callbacks are ignored after removal');
});
test('SWAPP TV only confirms playback after Twitch PLAYING, and handles blocked autoplay',()=>{
 const a=station.indexOf('function renderScreen(');
 const b=station.indexOf('// SWAPP PASSAGE:',a);
 assert.ok(a>=0&&b>a);
 const element=(tag,cls,value)=>({
  tag,className:cls||'',textContent:value||'',children:[],style:{},hidden:false,removed:false,
  append(...items){this.children.push(...items)},replaceChildren(){this.children=[]},
  remove(){this.removed=true},setAttribute(k,v){this[k]=v},
  addEventListener(){}
 });
 const screen=element('section'),inner=element('div'),watch=element('button'),health=element('div');
 screen.querySelector=()=>screen.children.find(x=>x.className==='stv-player-layer'&&!x.removed)||null;
 const nodes={'stv-screen':screen,'stv-screen-inner':inner,'stv-watch':watch,
  'stv-playback-health':health,'stv-air-state':element('span'),'stv-now-name':element('span'),
  'stv-now-game':element('span'),'stv-screen-game':element('span'),
  'stv-stage-status':element('span')};
 const state={selection:null,playing:null,playingPlatform:null,playingBroadcastId:null,consent:false,
  autoAdvance:false,autoStartPending:true,autoSource:null,
  twitchHandle:null,twitchPlaybackState:'idle',twitchPlaybackConfirmed:false,twitchWatchdog:null};
 let callbacks=null,resumptions=0,disposals=0;
 const win={SwappTwitchPlayback:{mount(options){
  callbacks=options;return {resume(){resumptions++;return true},destroy(){disposals++}};
 }}};
 const fakeDocument={visibilityState:'visible',createTextNode:text=>({textContent:text})};
 const api=new Function('state','$','by','setText','safeLogin','safeNativeLogin','location',
  'URLSearchParams','updateTwitchChat','document','window','resetPassage','maybePassage',
  'setTimeout','clearTimeout',station.slice(a,b)+
  'return {renderScreen,play,stopPlayback,resumeTwitchPlayback,syncWatchButton};')(
  state,id=>nodes[id],element,(id,text)=>{nodes[id].textContent=text},
  login=>/^[a-z0-9_]{3,25}$/.test(login),
  login=>/^[a-z0-9_-]{2,32}$/.test(login),
  {hostname:'swapp.tv'},URLSearchParams,()=>{},fakeDocument,win,()=>{},()=>{},
  ()=>1,()=>{}
 );
 api.renderScreen({login:'valid_live',platform:'twitch',game:'Fortnite',display_name:'Un streamer'});
 assert.equal(state.playing,'valid_live','player is mounted automatically');
 assert.equal(state.twitchPlaybackState,'loading');
 assert.equal(state.twitchPlaybackConfirmed,false,'iframe existence is not playback');
 assert.equal(watch.textContent,'■ ANNULER');
 assert.equal(watch['aria-pressed'],'false');
 assert.equal(screen.querySelector('.stv-player-layer').children[0].className,'stv-twitch-embed');
 callbacks.onBlocked('playback_blocked');
 assert.equal(state.twitchPlaybackState,'blocked');
 assert.equal(watch.textContent,'▶ LANCER TWITCH');
 assert.equal(health.hidden,false);
 assert.match(health.children[0].textContent,/Twitch demande une action/);
 api.resumeTwitchPlayback();
 assert.equal(resumptions,1);
 callbacks.onPlaying();
 assert.equal(state.twitchPlaybackState,'playing');
 assert.equal(state.twitchPlaybackConfirmed,true);
 assert.equal(watch.textContent,'■ ARRÊTER');
 assert.equal(watch['aria-pressed'],'true');
 assert.equal(health.hidden,true);
 const oldCallbacks=callbacks;
 api.stopPlayback();
 assert.equal(disposals,1);
 assert.equal(state.autoAdvance,false);
 oldCallbacks.onPlaying();
 assert.equal(state.playing,null,'stale SDK event must not restart stopped playback');
});
test('blocked Twitch autoplay is not misreported as five minutes of actual playback',()=>{
 assert.match(station,/state\.twitchPlaybackState==='playing'/);
 assert.match(station,/state\.twitchPlaybackConfirmed=true/);
 assert.match(station,/state\.twitchPlaybackState==='blocked'/);
 assert.match(station,/resumeTwitchPlayback\(\)/);
 const html=require('../modules/swapp-program').page('tv');
 assert.match(html,/swapp-tv-twitch-player\.js\?v=20261113-twitch-events-v12/);
 assert.match(html,/swapp-tv-broadcast\.js\?v=20261113-twitch-events-v12/);
 assert.match(html,/id="stv-playback-health"/);
 const css=read('assets/swapp-program.css');
 assert.match(css,/\.stv \.stv-twitch-sdk-slot iframe/);
 assert.match(css,/\.stv \.stv-playback-health\[hidden\]/);
});
