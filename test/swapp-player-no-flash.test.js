'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','local-agent','player.html'),'utf8');
const script=html.match(/<script>\n([\s\S]*?)\n<\/script>/)?.[1];
if(!script)throw Error('Embedded HLS script missing');

test('HLS fragment refresh cannot flash the player and real buffering does not obscure frames',async()=>{
 const elements={},timeouts=[],hls=[];
 let nextTimeout=0;
 function get(id){
  if(elements[id])return elements[id];
  const classes=new Set();
  return elements[id]={
   id,hidden:id!=='state',textContent:'',innerHTML:'',events:{},
   readyState:2,videoWidth:1920,videoHeight:1080,volume:0.8,muted:true,
   paused:false,seekable:{length:0},currentTime:20,
   classList:{
    add(key){classes.add(key)},remove(key){classes.delete(key)},
    contains(key){return classes.has(key)},
    toggle(key,on){if(on===undefined)on=!classes.has(key);if(on)classes.add(key);else classes.delete(key);return on}
   },
   addEventListener(event,fn){this.events[event]=fn},
   setAttribute(){},removeAttribute(){},load(){},
   pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}
  };
 }
 class FakeHls{
  static Events={MEDIA_ATTACHED:'attached',MANIFEST_LOADED:'manifest',
   FRAG_LOADED:'fragment',MANIFEST_PARSED:'parsed',ERROR:'error'};
  static ErrorTypes={MEDIA_ERROR:'media'};
  static isSupported(){return true}
  constructor(config){this.config=config;this.handlers={};hls.push(this)}
  on(name,fn){this.handlers[name]=fn}
  attachMedia(){this.handlers.attached?.()}
  loadSource(){}
  destroy(){}
 }
 const doc={getElementById:get,addEventListener(){},head:{append(){}},
  documentElement:{requestFullscreen(){}},fullscreenElement:null};
 const setTimeoutFake=(fn,ms)=>{const handle=++nextTimeout;timeouts.push({handle,fn,ms,canceled:false});return handle};
 const clearTimeoutFake=handle=>{const t=timeouts.find(x=>x.handle===handle);if(t)t.canceled=true};
 const start=new Function('document','window','Hls','setTimeout','clearTimeout','setInterval','fetch',
  script.replace('__SWAPP_HLS_SRC__',JSON.stringify('/api/oryon/local-relay/vnhz/index.m3u8')));
 start(doc,{Hls:FakeHls},FakeHls,setTimeoutFake,clearTimeoutFake,()=>0,async()=>({ok:false}));
 await Promise.resolve();await Promise.resolve();
 assert.equal(hls.length,1,'HLS should initialize once');
 const video=get('video'),overlay=get('state');
 video.events.loadeddata();
 assert.equal(overlay.hidden,true,'first real frame hides loading overlay');
 hls[0].handlers.fragment();
 hls[0].handlers.manifest();
 assert.equal(overlay.hidden,true,'subsequent HLS refreshes must not cover the video');
 video.events.waiting();
 assert.equal(overlay.hidden,true,'brief network buffering should not flash a loading veil');
 const delayed=timeouts.find(x=>x.ms===3000&&!x.canceled);
 assert.ok(delayed,'brief stall should use a delayed check');
 delayed.fn();
 assert.equal(overlay.hidden,false,'sustained stalls should be indicated');
 assert.equal(overlay.classList.contains('soft-buffering'),true,
  'stalls should use a small non-obscuring indicator');
 video.events.timeupdate();
 assert.equal(overlay.hidden,true,'resumed frames should clear stall status');
 assert.equal(overlay.classList.contains('soft-buffering'),false);
});
test('player does not show a full black loading veil on normal completed segments',()=>{
 assert.match(html,/#state\.soft-buffering/);
 assert.doesNotMatch(script,/FRAG_LOADED,[\s\S]{0,180}message\('Chargement des images vidéo/);
 assert.match(script,/function showStartupProgress\(text\)/);
 assert.match(script,/if\(!everDecoded&&!manualStop\)message\(text\)/);
});
