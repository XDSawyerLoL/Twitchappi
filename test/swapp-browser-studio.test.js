'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../assets/swapp-browser-studio.js'),'utf8');
function studio({screenAudio=true,microphone=true,cameraDeviceId=''}={}){
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
 const camera=new MediaStream([newTrack('video')]);
 let cameraConstraints=null;
 const mix=newTrack('audio');
 let captures=0,opened=0,closed=0,captureOptions=null;
 class AudioContext{
  constructor(){opened++}
  createMediaStreamDestination(){return{stream:new MediaStream([mix])}}
  createMediaStreamSource(){return{connect(){}}}
  createGain(){return{gain:{value:1},connect(){}}}
  async resume(){}
  async close(){closed++}
 }
 const root={
  document:{getElementById(){return null},querySelector(query){return query==='#swappStudioCameraDevice'?{value:cameraDeviceId}:null},addEventListener(){},hidden:false},
  navigator:{mediaDevices:{getDisplayMedia:async options=>{captures++;captureOptions=options;return screen},getUserMedia:async constraints=>{if(constraints?.video){cameraConstraints=constraints;return camera}return mic}}},
  window:{addEventListener(){},AudioContext},
  MediaStream,requestAnimationFrame:()=>0,setInterval:()=>0,cancelAnimationFrame(){},
  console,fetch(){throw Error('unexpected fetch')}
 };
 root.globalThis=root;
 vm.runInNewContext(script,root,{filename:'swapp-browser-studio.js'});
 return {api:root.SwappBrowserStudio,tracks,screen,mic,camera,mix,stats:()=>({captures,opened,closed,captureOptions,cameraConstraints})};
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
test('Edge game capture prefers a full monitor while retaining user choice',async()=>{
 const ctx=studio();
 const stream=await ctx.api.capture({source:'screen',video:{width:{ideal:1920},frameRate:{ideal:60}}});
 const options=ctx.stats().captureOptions;
 assert.equal(options.video.displaySurface,'monitor');
 assert.equal(options.video.width.ideal,1920);
 assert.equal(options.video.frameRate.ideal,60);
 assert.equal(options.monitorTypeSurfaces,'include');
 assert.equal(options.selfBrowserSurface,'exclude');
 assert.equal(options.systemAudio,'include');
 assert.equal(options.surfaceSwitching,'include');
 assert.equal(options.preferCurrentTab,false);
 assert.equal(options.audio,true);
 assert.equal(stream.getVideoTracks().length,1);
 stream._swappCleanup();
});
test('normal bordered game windows do not require borderless fullscreen mode',()=>{
 assert.match(script,/Fenêtre avec bordures \(jeu en mode fenêtré\)/);
 assert.match(script,/Pas besoin de mode sans bordure/);
 assert.doesNotMatch(script,/Fenêtre de jeu \(sans bordure\)/);
});
test('game window preference uses a window picker without excluding whole monitors',async()=>{
 const ctx=studio();
 const stream=await ctx.api.capture({source:'game-window',video:{width:{ideal:1280},frameRate:{ideal:30}}});
 const options=ctx.stats().captureOptions;
 assert.equal(options.video.displaySurface,'window');
 assert.equal(options.monitorTypeSurfaces,'include');
 assert.equal(options.video.width.ideal,1280);
 assert.equal(stream.getVideoTracks().length,1);
 stream._swappCleanup();
});
test('screen stream can run with no optional audio permissions',async()=>{
 const ctx=studio({screenAudio:false,microphone:false});
 const stream=await ctx.api.capture({source:'screen'});
 assert.equal(stream.getVideoTracks().length,1);
 assert.equal(stream.getAudioTracks().length,0);
 assert.equal(ctx.stats().opened,0);
 stream._swappCleanup();
});
test('OBS Virtual Camera is selected without requiring screen sharing',async()=>{
 const ctx=studio({cameraDeviceId:'obs-virtual-camera-123'});
 const result=await ctx.api.capture({source:'camera',video:{width:{ideal:1920},height:{ideal:1080}}});
 assert.equal(ctx.stats().captures,0);
 assert.equal(ctx.stats().cameraConstraints.video.deviceId.exact,'obs-virtual-camera-123');
 assert.equal(result.getVideoTracks().length,1);
 assert.equal(result.getAudioTracks().length,1);
 assert.equal(result._oryonSources[0],ctx.camera);
 assert.equal(result._oryonSources[1],ctx.mic);
 result._swappCleanup();
});
test('Camera mode does not need screen capture or microphone tracks',async()=>{
 const ctx=studio({microphone:false,cameraDeviceId:'obs-virtual-camera-123'});
 const result=await ctx.api.capture({source:'camera'});
 assert.equal(result.getVideoTracks().length,1);
 assert.equal(result.getAudioTracks().length,0);
 assert.equal(ctx.stats().captures,0);
});

test('browser-only diagnostic inspects video without publishing or requiring OBS',()=>{
 assert.match(script,/function installCaptureProbe\(panel,editor,launch\)/);
 assert.match(script,/getDisplayMedia\(options\)/);
 assert.match(script,/options\.audio=false/);
 assert.match(script,/getImageData\(0,0,48,27\)/);
 assert.match(script,/capture.*locale|Capture locale active/);
 assert.match(script,/launch\?\.addEventListener\('click',close,\{capture:true\}\)/);
 assert.match(script,/for\(const track of old\.getTracks\(\)\)/);
});
test('studio does not send audio, credentials or pixels to paid third-party APIs',()=>{
 assert.doesNotMatch(script,/https?:\/\/(?:api\.|www\.)?(?:openai|googleapis|cloudinary|agora)\./i);
 assert.match(script,/navigator\.mediaDevices/);
 assert.match(script,/same-origin/);
 assert.match(script,/\/api\/swapp\/live\/metadata/);
});
