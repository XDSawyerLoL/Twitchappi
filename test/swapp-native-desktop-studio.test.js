'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const {captureArgs,localOriginOnly}=require('../local-agent/swapp-screen-studio');

test('Windows DirectX capture is sent through the existing local RTMP ingest without OBS',()=>{
 const args=captureArgs({method:'ddagrab',display:1,fps:60,bitrate:8000,audioDevice:'',
  rtmpUrl:'rtmp://127.0.0.1:1935/live/abc'});
 assert.ok(args.includes('ddagrab=output_idx=1:framerate=60,hwdownload,format=bgra,format=yuv420p'));
 assert.ok(args.includes('libx264'));
 assert.ok(args.includes('aac'));
 assert.ok(args.includes('anullsrc=r=48000:cl=stereo'));
 assert.ok(args.includes('rtmp://127.0.0.1:1935/live/abc'));
 assert.ok(!args.includes('-shell'));
});
test('classic Windows capture fallback covers full desktop and optional DirectShow audio',()=>{
 const args=captureArgs({method:'gdigrab',display:0,fps:30,bitrate:6000,
  audioDevice:'Stereo Mix (Realtek Audio)',rtmpUrl:'rtmp://127.0.0.1:1935/live/test'});
 assert.ok(args.includes('gdigrab'));
 assert.ok(args.includes('desktop'));
 assert.ok(args.includes('audio=Stereo Mix (Realtek Audio)'));
 assert.ok(!args.some(a=>a.includes('anullsrc')));
 assert.throws(()=>captureArgs({method:'unknown'}),/inconnue/);
});
test('native hardware encoding and two audio sources produce one AAC mix',()=>{
 const args=captureArgs({method:'ddagrab',display:0,fps:60,bitrate:8000,
  encoder:'nvenc',audioDevice:'Stereo Mix',micDevice:'Microphone',
  rtmpUrl:'rtmp://127.0.0.1:1935/live/test'});
 assert.ok(args.includes('h264_nvenc'));
 assert.ok(!args.includes('libx264'));
 assert.ok(args.includes('audio=Stereo Mix'));
 assert.ok(args.includes('audio=Microphone'));
 assert.ok(args.some(x=>x.includes('amix=inputs=2')));
 assert.ok(args.includes('[a]'));
 assert.equal(args.filter(x=>x==='-i').length,3);
});
test('native capture routes reject external website origins',()=>{
 let called=false,result=null;
 const middleware=(origin,host)=>localOriginOnly({
  get(name){return name==='Origin'?origin:host}
 },{status(code){result={code};return{json(){}}}},()=>{called=true});
 middleware('https://evil.example','127.0.0.1:8081');
 assert.equal(called,false);assert.equal(result.code,403);
 middleware('http://127.0.0.1:8081','127.0.0.1:8081');
 assert.equal(called,true);
});
test('desktop studio is the default; OBS screen remains available',()=>{
 const main=source('local-agent/main.js');
 const server=source('local-agent/server.js');
 const html=source('local-agent/studio.html');
 const js=source('local-agent/studio.js');
 assert.match(main,/loadURL\('http:\/\/127\.0\.0\.1:'\+port\+'\/studio'\)/);
 assert.match(server,/mountScreenStudio\(app/);
 assert.match(html,/id="video"/);
 assert.match(html,/id="previewButton"/);
 assert.match(html,/id="liveButton"/);
 assert.match(html,/href="\/"/);
 assert.match(js,/\/api\/screen\/start/);
 assert.match(js,/\/api\/go-live/);
 assert.match(js,/\/api\/tunnel\/stop/);
 assert.doesNotThrow(()=>new (require('node:vm').Script)(js));
 assert.equal(JSON.parse(source('local-agent/package.json')).version,'1.2.0');
});
