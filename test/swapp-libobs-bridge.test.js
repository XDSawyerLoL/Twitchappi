'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const path=require('node:path');
const {
 nativeHostPath,completeLibobsRuntime,createLibobsCapture,createHybridCapture
}=require('../local-agent/swapp-libobs-bridge');

test('only the packaged or developer-built libobs executable can be selected',()=>{
 const prefix=path.join('/resources','swapp-libobs');
 const required=['win-capture','win-wasapi','obs-outputs','obs-x264','obs-ffmpeg','rtmp-services'];
 const present=new Set([
  path.join(prefix,'swapp-libobs-host.exe'),path.join(prefix,'libobs.dll'),path.join(prefix,'libobs-d3d11.dll'),
  ...required.map(n=>path.join(prefix,'core',n,n+'.dll'))
 ]);
 const exists=p=>present.has(p);
 const found=nativeHostPath({root:'/project/local-agent',resourcesPath:'/resources',exists});
 assert.equal(found,path.join(prefix,'swapp-libobs-host.exe'));
 assert.equal(completeLibobsRuntime(found,exists),true);
 present.delete(path.join(prefix,'core','win-capture','win-capture.dll'));
 assert.equal(completeLibobsRuntime(found,exists),false);
 assert.equal(nativeHostPath({root:'/none',resourcesPath:null,exists:()=>false}),null);
});

test('native host receives fixed local RTMP URL and bounded streaming options',async()=>{
 let invocation;
 let stateReads=0;
 const child=new EventEmitter();
 child.exitCode=null;
 child.stdin={write(){}};
 child.stdout=new EventEmitter();
 child.stderr=new EventEmitter();
 child.kill=()=>{child.exitCode=0;child.emit('exit',0,null)};
 const host=createLibobsCapture({
  executable:'C:\\swapp-libobs-host.exe',platform:'win32',
  currentConfiguredKey:()=> 'valid-key_123',rtmpPort:1935,
  streamStatus:()=>{
   stateReads++;
   return stateReads<3?{active:false,hls_exists:false}:{
    active:true,hls_exists:true,ffmpeg_running:true,
    started_at:new Date(200000).toISOString()
   };
  },now:()=>200000,sleep:async()=>{},
  spawnProcess:(bin,args,opts)=>{invocation={bin,args,opts};return child;}
 });
 const started=await host.start({fps:60,display:99,bitrate:100000,source:'game',encoder:'nvenc'});
 assert.equal(started.engine,'libobs');
 assert.equal(started.ready,true);
 assert.equal(invocation.args[invocation.args.indexOf('--rtmp')+1],'rtmp://127.0.0.1:1935/live');
 assert.equal(invocation.args[invocation.args.indexOf('--display')+1],'3');
 assert.equal(invocation.args[invocation.args.indexOf('--bitrate')+1],'10000');
 assert.equal(invocation.opts.shell,undefined);
 host.stop();
 assert.equal(host.status().capturing,false);
});

test('native missing: automatic mode continues through existing FFmpeg, explicit libobs fails',async()=>{
 const ffmpeg={
  status(){return{capturing:true,method:'ddagrab'}},
  start:async opts=>({success:true,method:opts.method}),
  stop:()=>({success:true})
 };
 const native={available:()=>false,status:()=>({}),start:async()=>{throw Error('missing')},stop:()=>({})};
 const hybrid=createHybridCapture({ffmpeg,native});
 const live=await hybrid.start({method:'auto'});
 assert.equal(live.engine,'ffmpeg');
 assert.equal(live.method,'auto');
 hybrid.stop();
 await assert.rejects(()=>hybrid.start({method:'libobs'}),/not installed|pas installé/i);
});

test('capture module exposes libobs bridge and studio selection',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','local-agent','swapp-screen-studio.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'..','local-agent','studio.html'),'utf8');
 const frontend=fs.readFileSync(path.join(__dirname,'..','local-agent','studio.js'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','local-agent','package.json'),'utf8'));
 assert.match(src,/createHybridCapture/);
 assert.match(html,/value="libobs"/);
 assert.match(html,/value="game"/);
 assert.match(frontend,/libobsAvailable/);
 assert.ok(pkg.build.extraResources.some(x=>x.to==='swapp-libobs'));
 assert.doesNotThrow(()=>new (require('node:vm').Script)(frontend));
});
