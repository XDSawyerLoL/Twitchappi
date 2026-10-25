'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-browser-studio.js'),'utf8');
function studio({screenAudio=true,microphone=true}={}){
 const tracks=[],newTrack=kind=>{
  const track={kind,readyState:'live',stop(){this.readyState='ended'},addEventListener(){},removeEventListener(){}};
  tracks.push(track);return track;
 };
 class MediaStream{
  constructor(items=[]){this.items=[...items]}
  getTracks(){return this.items}
  getVideoTracks(){return this.items.filter(t=>t.kind==='video')}
  getAudioTracks(){return this.items.filter(t=>t.kind==='audio')}
  addTrack(t){this.items.push(t)}
 }
 const screen=new MediaStream([newTrack('video'),...(screenAudio?[newTrack('audio')]:[])]);
 const mic=new MediaStream(microphone?[newTrack('audio')]:[]);
 const mix=newTrack('audio');
 let captures=0,opened=0,closed=0;
 class AudioContext{
  constructor(){opened++}
  createMediaStreamDestination(){return{stream:new MediaStream([mix])}}
  createMediaStreamSource(){return{connect(){}}}
  createGain(){return{gain:{value:1},connect(){}}}
  async resume(){}
  async close(){closed++}
 }
 const root={
  document:{getElementById(){return null},addEventListener(){},hidden:false},
  navigator:{mediaDevices:{getDisplayMedia:async()=>{captures++;return screen},getUserMedia:async()=>mic}},
  window:{addEventListener(){},AudioContext},
  MediaStream,requestAnimationFrame:()=>0,setInterval:()=>0,cancelAnimationFrame(){},
  console,fetch(){throw Error('unexpected fetch')}
 };
 root.globalThis=root;
 vm.runInNewContext(script,root,{filename:'swapp-browser-studio.js'});
 return {api:root.SwappBrowserStudio,tracks,screen,mic,mix,stats:()=>({captures,opened,closed})};
}
test('screen stream mixes shared audio with optional microphone',async()=>{
 const ctx=studio();
 const stream=await ctx.api.capture({source:'screen',video:{width:{ideal:1920}}});
 assert.equal(stream.getVideoTracks().length,1);
 assert.equal(stream.getAudioTracks().length,1);
 assert.equal(stream.getAudioTracks()[0],ctx.mix);
 assert.equal(stream._oryonSources.length,2);
 stream._swappCleanup();
 for(const source of stream._oryonSources)for(const track of source.getTracks())track.stop();
 assert.ok(ctx.tracks.every(t=>t.readyState==='ended'||t===ctx.mix));
 assert.equal(ctx.stats().opened,1);
 assert.equal(ctx.stats().closed,1);
});
test('screen stream can run with no optional audio permissions',async()=>{
 const ctx=studio({screenAudio:false,microphone:false});
 const stream=await ctx.api.capture({source:'screen'});
 assert.equal(stream.getVideoTracks().length,1);
 assert.equal(stream.getAudioTracks().length,0);
 assert.equal(ctx.stats().opened,0);
 stream._swappCleanup();
});
test('studio does not send audio, credentials or pixels to paid third-party APIs',()=>{
 assert.doesNotMatch(script,/https?:\/\/(?:api\.|www\.)?(?:openai|googleapis|cloudinary|agora)\./i);
 assert.match(script,/navigator\.mediaDevices/);
 assert.match(script,/same-origin/);
 assert.match(script,/\/api\/swapp\/live\/metadata/);
});
