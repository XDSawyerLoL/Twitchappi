'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','modules','swapp-direct-hls-relay.js'),'utf8');
function backend(){
 const routes={get:new Map(),post:new Map()};
 const express={raw:()=>(_req,_res,next)=>next()};
 const module={exports:{}};
 vm.runInNewContext(source,{
  require(id){if(id==='express')return express;return require(id)},
  module,__dirname:path.join(__dirname,'..','modules'),
  process:{env:{}},Buffer,Date,setInterval(){return{unref(){}}}
 });
 const app={
  get(route,fn){routes.get.set(route,fn)},
  post(route,...fns){routes.post.set(route,fns.at(-1))}
 };
 const relay=module.exports.attachSwappDirectRelay(app,{lookupOwner:async token=>token==='VALID_TOKEN'?{login:'vnhz'}:null});
 async function call(method,route,{name,body,token='VALID_TOKEN',login='vnhz',segment,audioTrack}={}){
  const fn=routes[method].get(route);
  assert.ok(fn,'route missing: '+route);
  let status=200,type='',payload=null,headers={};
  const req={params:{login,segment},body, get(k){
   if(k==='authorization')return token?'Bearer '+token:'';
   if(k==='x-swapp-media-name')return name||'';
   if(k==='x-swapp-audio-track')return audioTrack||'';
   return '';
  }};
  const res={
   set(k,v){headers[k]=v;return this},
   status(code){status=code;return this},
   type(v){type=v;return this},
   json(v){payload=v;return this},
   send(v){payload=v;return this},
   sendStatus(code){status=code;payload=null;return this}
  };
  await fn(req,res);
  return {status,type,payload,headers};
 }
 return {routes,relay,call};
}
test('OBS media push accepts owner token and publishes fragments before playlist',async()=>{
 const b=backend();
 const upload='/api/oryon/local-relay/upload';
 const state='/api/oryon/local-relay/:login/state';
 const manifest='/api/oryon/local-relay/:login/index.m3u8';
 const ts='/api/oryon/local-relay/:login/:segment';
 const playlist=Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:2,\nseg_000.ts\n');
 const segment=Buffer.alloc(188*3,0);
 segment[0]=0x47;
 assert.equal((await b.call('post',upload,{name:'seg_000.ts',body:segment,token:''})).status,401);
 assert.equal((await b.call('post',upload,{name:'seg_000.ts',body:segment,token:'BAD'})).status,403);
 assert.equal((await b.call('post',upload,{name:'../config.json',body:segment})).status,400);
 assert.equal((await b.call('post',upload,{name:'index.m3u8',body:playlist})).status,409,'cannot announce missing media');
 assert.equal((await b.call('post',upload,{name:'seg_000.ts',body:segment})).status,200);
 assert.equal((await b.call('post',upload,{name:'index.m3u8',body:playlist})).status,200);
 const live=await b.call('get',state);
 assert.equal(live.payload.active,true);
 assert.equal(live.payload.segment_count,1);
 const m=await b.call('get',manifest);
 assert.match(m.payload.toString(),/#EXTM3U/);
 const media=await b.call('get',ts,{segment:'seg_000.ts'});
 assert.equal(media.status,200);
 assert.deepEqual(Buffer.from(media.payload),segment);
 const missing=await b.call('get',ts,{segment:'../../secret'});
 assert.equal(missing.status,404);
});
test('same-origin player keeps volume/fullscreen and does not expose streaming credentials',async()=>{
 const b=backend();
 const player=await b.call('get','/api/oryon/local-relay/:login/player');
 assert.equal(player.status,200);
 assert.match(player.payload,/id="volume"/);
 assert.match(player.payload,/requestFullscreen/);
 assert.match(player.payload,/\/api\/oryon\/local-relay\/vnhz\/index\.m3u8/);
 assert.ok(!player.payload.includes('VALID_TOKEN'));
 assert.match(player.payload,/hls\.js@1\.6\.15/);
 const supported=await b.call('get','/api/oryon/local-relay/capabilities');
 assert.equal(supported.payload.transport,'swapp-direct-hls');
});
test('uplink pushes HLS media outbound and finishes with a valid playlist',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-direct-test-'));
 const module=require('../local-agent/swapp-direct-uplink.js');
 const ts=Buffer.alloc(188*3,0);ts[0]=0x47;
 fs.writeFileSync(path.join(tmp,'seg_000.ts'),ts);
 fs.writeFileSync(path.join(tmp,'index.m3u8'),'#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:2,\nseg_000.ts\n');
 const requests=[];
 const service=module.startSwappHlsUplink({key:'test',login:'vnhz',siteUrl:'https://swapp.tv',token:'PRIVATE_TOKEN',mediaDir:tmp,
  fetchFn:async(url,opts)=>{
   requests.push({url:String(url),name:opts?.headers?.['X-Swapp-Media-Name'],authorization:opts?.headers?.Authorization});
   if(String(url).endsWith('/state'))return {ok:true,json:async()=>({active:true,segment_count:1})};
   return {ok:true,json:async()=>({success:true})};
  }
 });
 try{
  await service.ready;
  assert.deepEqual(requests.filter(x=>x.name).map(x=>x.name),['seg_000.ts','index.m3u8']);
  assert.ok(requests[0].url.startsWith('https://swapp.tv/'));
  assert.equal(requests[0].authorization,'Bearer PRIVATE_TOKEN');
  assert.equal(service.getStatus().published,true);
 }finally{service.stop();fs.rmSync(tmp,{recursive:true,force:true})}
});

test('a previously rejected 4.5 MiB OBS MPEG-TS segment can reach the SWAPP server',async()=>{
 const b=backend();
 const buffer=Buffer.alloc(Math.floor(4.5*1024*1024),0); buffer[0]=0x47;
 const posted=await b.call('post','/api/oryon/local-relay/upload',{name:'seg_001.ts',body:buffer});
 assert.equal(posted.status,200);
 const capability=await b.call('get','/api/oryon/local-relay/capabilities');
 assert.equal(capability.payload.version,2);
 assert.ok(capability.payload.max_segment_bytes>=8*1024*1024);
 assert.ok(capability.payload.max_room_bytes>=24*1024*1024);
 const playlist=Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:2,\nseg_001.ts\n');
 assert.equal((await b.call('post','/api/oryon/local-relay/upload',{name:'index.m3u8',body:playlist})).status,200);
 const res=await b.call('get','/api/oryon/local-relay/:login/:segment',{segment:'seg_001.ts'});
 assert.equal(res.status,200);
 assert.equal(res.payload.length,buffer.length);
});
test('uploader accepts an OBS segment above the former 3 MiB hard limit',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-hls-oversize-'));
 const {startSwappHlsUplink}=require('../local-agent/swapp-direct-uplink.js');
 const segment=Buffer.alloc(4*1024*1024,0);segment[0]=0x47;
 fs.writeFileSync(path.join(tmp,'seg_001.ts'),segment);
 fs.writeFileSync(path.join(tmp,'index.m3u8'),'#EXTM3U\n#EXTINF:2,\nseg_001.ts\n');
 const calls=[];
 const uplink=startSwappHlsUplink({key:'test',login:'vnhz',siteUrl:'https://swapp.tv',token:'TEST_TOKEN',mediaDir:tmp,
   fetchFn:async(url,opts)=>{
    if(opts?.body)calls.push({name:opts.headers['X-Swapp-Media-Name'],bytes:opts.body.length});
    if(String(url).endsWith('/state'))return{ok:true,json:async()=>({active:true,segment_count:1})};
    return{ok:true,json:async()=>({success:true})};
   }});
 try{
  await uplink.ready;
  assert.deepEqual(calls.map(x=>x.name),['seg_001.ts','index.m3u8']);
  assert.equal(calls[0].bytes,4*1024*1024);
 }finally{uplink.stop();fs.rmSync(tmp,{recursive:true,force:true})}
});
test('default FFmpeg HLS muxing forces 2s keyframes at a bounded 720p bitrate',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','local-agent','server.js'),'utf8');
 assert.match(source,/SWAPP_LOCAL_TRANSCODE \|\| process\.env\.ORYON_LOCAL_TRANSCODE \|\| 'transcode'/);
 assert.match(source,/force_key_frames','expr:gte\(t,n_forced\*2\)'/);
 assert.match(source,/'-b:v','1600k','-maxrate','2000k','-bufsize','4000k'/);
 assert.match(source,/'-hls_time', '2'/);
 assert.match(source,/force_original_aspect_ratio=decrease/);
});

test('live 1200x630 JPEG poster is authenticated, bounded, served publicly and exposes audio status',async()=>{
 const b=backend();
 const jpg=Buffer.alloc(80*1024,7);jpg[0]=0xff;jpg[1]=0xd8;jpg[jpg.length-2]=0xff;jpg[jpg.length-1]=0xd9;
 const upload='/api/oryon/local-relay/upload';
 const poster='/api/oryon/local-relay/:login/poster.jpg';
 const seg=Buffer.alloc(188*2);seg[0]=0x47;
 const pl=Buffer.from('#EXTM3U\n#EXTINF:2,\nseg_001.ts\n');
 assert.equal((await b.call('post',upload,{name:'poster.jpg',body:jpg,token:'BAD'})).status,403);
 const big=Buffer.alloc(700*1024);big[0]=0xff;big[1]=0xd8;big[big.length-2]=0xff;big[big.length-1]=0xd9;
 assert.equal((await b.call('post',upload,{name:'poster.jpg',body:big})).status,422);
 assert.equal((await b.call('post',upload,{name:'seg_001.ts',body:seg})).status,200);
 assert.equal((await b.call('post',upload,{name:'index.m3u8',body:pl})).status,200);
 assert.equal((await b.call('post',upload,{name:'poster.jpg',body:jpg,audioTrack:'missing'})).status,200);
 const photo=await b.call('get',poster);
 assert.equal(photo.status,200);
 assert.equal(photo.payload.length,jpg.length);
 assert.equal(photo.type,'image/jpeg');
 assert.ok(b.relay.posterForLogin('vnhz').url.endsWith('/poster.jpg'));
 const st=await b.call('get','/api/oryon/local-relay/:login/state');
 assert.equal(st.payload.audio_track,'missing');
});
test('local uploader generates Discord JPEG in background without blocking HLS',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-discord-poster-test-'));
 const {startSwappHlsUplink}=require('../local-agent/swapp-direct-uplink.js');
 const bytes=Buffer.alloc(564);bytes[0]=0x47;
 fs.writeFileSync(path.join(tmp,'seg_012.ts'),bytes);
 fs.writeFileSync(path.join(tmp,'index.m3u8'),'#EXTM3U\n#EXTINF:2,\nseg_012.ts\n');
 const jpeg=Buffer.alloc(10000,4);jpeg[0]=0xff;jpeg[1]=0xd8;jpeg[jpeg.length-2]=0xff;jpeg[jpeg.length-1]=0xd9;
 const uploads=[],logs=[];
 const service=startSwappHlsUplink({key:'test',login:'vnhz',siteUrl:'https://swapp.tv',token:'TOKEN',
   mediaDir:tmp,ffmpegPath:'ffmpeg',posterGenerator:async()=>({poster:jpeg,audioTrack:'missing'}),
   onLog:(...args)=>logs.push(args),
   fetchFn:async(url,opts)=>{
    if(opts?.method==='POST')uploads.push({name:opts.headers['X-Swapp-Media-Name'],audio:opts.headers['X-Swapp-Audio-Track']});
    if(String(url).endsWith('/state'))return{ok:true,json:async()=>({active:true,segment_count:1})};
    return{ok:true,json:async()=>({success:true})};
   }});
 try{
  await service.ready;
  for(let i=0;i<20&&!uploads.some(x=>x.name==='poster.jpg');i++)await new Promise(r=>setTimeout(r,20));
  assert.deepEqual(uploads.map(x=>x.name),['seg_012.ts','index.m3u8','poster.jpg']);
  assert.equal(uploads[2].audio,'missing');
  assert.equal(service.getStatus().audioTrack,'missing');
  assert.ok(service.getStatus().lastPosterAt>0);
 }finally{service.stop();fs.rmSync(tmp,{recursive:true,force:true})}
});
