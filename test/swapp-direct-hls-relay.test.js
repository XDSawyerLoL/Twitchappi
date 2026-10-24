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
 async function call(method,route,{name,body,token='VALID_TOKEN',login='vnhz',segment,audioTrack,range}={}){
  const fn=routes[method].get(route);
  assert.ok(fn,'route missing: '+route);
  let status=200,type='',payload=null,headers={};
  const req={params:{login,segment},body, get(k){
   if(k==='authorization')return token?'Bearer '+token:'';
   if(k==='x-swapp-media-name')return name||'';
   if(k==='x-swapp-audio-track')return audioTrack||'';
   if(k==='range')return range||'';
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
 assert.match(player.payload,/\/api\/oryon\/local-relay\/vnhz\/dvr\.m3u8/);
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
 assert.equal(capability.payload.version,3);
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
test('default SWAPP stream is now native OBS without 720p and 1600kbps recompression',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','local-agent','server.js'),'utf8');
 assert.match(source,/SWAPP_LOCAL_TRANSCODE \|\| process\.env\.ORYON_LOCAL_TRANSCODE \|\| 'copy'/);
 assert.match(source,/args\.push\('-c:v','copy','-c:a','copy'\)/);
 assert.match(source,/'-hls_time','2'/);
 assert.doesNotMatch(source,/scale=w='min\(1280,iw\)'/);
 assert.doesNotMatch(source,/'-b:v','1600k'/);
 assert.match(source,/mode:TRANSCODE_MODE==='transcode'\?'compatibility':'native'/);
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

test('DVR retains a bounded short timeshift window so Pause and Resume preserve recent content',async()=>{
 const b=backend(),upload='/api/oryon/local-relay/upload';
 for(let i=0;i<60;i++){
  const name='seg_'+String(i).padStart(3,'0')+'.ts';
  const data=Buffer.alloc(188*100,0);data[0]=0x47;
  assert.equal((await b.call('post',upload,{name,body:data})).status,200);
  const first=Math.max(0,i-7);
  const playlist=Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:'+first+'\n'+
   Array.from({length:i-first+1},(_,j)=>'#EXTINF:2,\nseg_'+String(first+j).padStart(3,'0')+'.ts\n').join(''));
  assert.equal((await b.call('post',upload,{name:'index.m3u8',body:playlist})).status,200);
 }
 const dvr=await b.call('get','/api/oryon/local-relay/:login/dvr.m3u8');
 assert.equal(dvr.status,200);
 const manifest=dvr.payload.toString();
 const names=manifest.match(/seg_\d+\.ts/g)||[];
 assert.ok(names.length>8&&names.length<=40);
 assert.ok(manifest.includes('#EXT-X-MEDIA-SEQUENCE:20'));
 assert.ok(!manifest.includes('seg_000.ts'));
 const retained=await b.call('get','/api/oryon/local-relay/:login/:segment',{segment:'seg_021.ts'});
 assert.equal(retained.status,200,'paused viewer can fetch an older segment');
 const evicted=await b.call('get','/api/oryon/local-relay/:login/:segment',{segment:'seg_000.ts'});
 assert.equal(evicted.status,404,'old historical segments are evicted');
 assert.ok(b.relay.rooms.get('vnhz').bytes<=b.relay.MAX_ROOM_BYTES);
 const player=await b.call('get','/api/oryon/local-relay/:login/player');
 assert.match(player.payload,/\/vnhz\/dvr\.m3u8/);
 for(const control of ['play','pause','stop','live'])assert.ok(player.payload.includes('id="'+control+'"'));
 assert.match(player.payload,/<\/div>\s*<div class="toolbar" role="group"/);
 assert.ok(!player.payload.includes('.toolbar{position:absolute'),'toolbar must never overlay video');
});
test('Discord short MP4 gallery asset supports HTTP Range and rejects oversize or unauthenticated uploads',async()=>{
 const b=backend(),upload='/api/oryon/local-relay/upload';
 const bytes=Buffer.alloc(10000);bytes.write('ftyp',4,'ascii');
 assert.equal((await b.call('post',upload,{name:'preview.mp4',body:bytes,token:'INVALID'})).status,403);
 assert.equal((await b.call('post',upload,{name:'preview.mp4',body:Buffer.alloc(4*1024*1024+1)})).status,422);
 // room only becomes public when an actual live manifest was sent
 const media=Buffer.alloc(188*2);media[0]=0x47;
 await b.call('post',upload,{name:'seg_001.ts',body:media});
 await b.call('post',upload,{name:'index.m3u8',body:Buffer.from('#EXTM3U\n#EXTINF:2,\nseg_001.ts\n')});
 assert.equal((await b.call('post',upload,{name:'preview.mp4',body:bytes})).status,200);
 assert.ok(b.relay.clipForLogin('vnhz').url.endsWith('/preview.mp4'));
 const range=await b.call('get','/api/oryon/local-relay/:login/preview.mp4',{range:'bytes=0-999'});
 assert.equal(range.status,206);
 assert.equal(range.payload.length,1000);
 assert.equal(range.headers['Content-Range'],'bytes 0-999/10000');
 const full=await b.call('get','/api/oryon/local-relay/:login/preview.mp4');
 assert.equal(full.status,200);
 assert.equal(full.type,'video/mp4');
 assert.equal(full.payload.length,10000);
});
test('local OBS uplink periodically uploads a short MP4 teaser independently of the main HLS stream',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-discord-mp4-test-'));
 const {startSwappHlsUplink}=require('../local-agent/swapp-direct-uplink.js');
 const names=Array.from({length:5},(_,i)=>'seg_'+String(i).padStart(3,'0')+'.ts');
 for(const n of names){const data=Buffer.alloc(564);data[0]=0x47;fs.writeFileSync(path.join(tmp,n),data)}
 fs.writeFileSync(path.join(tmp,'index.m3u8'),'#EXTM3U\n'+names.map(n=>'#EXTINF:2,\n'+n+'\n').join(''));
 const mp4=Buffer.alloc(10000);mp4.write('ftyp',4,'ascii');
 const requests=[];
 const uploader=startSwappHlsUplink({key:'test',login:'vnhz',siteUrl:'https://swapp.tv',token:'TOKEN',mediaDir:tmp,
  ffmpegPath:'ffmpeg',posterGenerator:async()=>({poster:null,audioTrack:'present'}),
  clipGenerator:async paths=>{assert.equal(paths.length,5);return mp4},
  fetchFn:async(url,opts)=>{
   if(opts?.headers?.['X-Swapp-Media-Name'])requests.push(opts.headers['X-Swapp-Media-Name']);
   if(String(url).endsWith('/state'))return{ok:true,json:async()=>({active:true,segment_count:5})};
   return{ok:true,json:async()=>({success:true})};
  }});
 try{
  await uploader.ready;
  for(let i=0;i<30&&!requests.includes('preview.mp4');i++)await new Promise(r=>setTimeout(r,20));
  assert.ok(requests.includes('preview.mp4'));
  assert.equal(uploader.getStatus().lastClipAt>0,true);
  assert.equal(requests.indexOf('preview.mp4')>requests.indexOf('index.m3u8'),true);
 }finally{uploader.stop();fs.rmSync(tmp,{recursive:true,force:true})}
});


test('SWAPP accepts a sustained native 8 Mbps stream well above the former 5 Mbps per-minute cap',async()=>{
 const b=backend();
 const capabilities=await b.call('get','/api/oryon/local-relay/capabilities');
 assert.equal(capabilities.payload.version,3);
 assert.equal(capabilities.payload.native_passthrough,true);
 assert.ok(capabilities.payload.max_room_bytes>=48*1024*1024);
 assert.ok(capabilities.payload.max_minute_bytes>=120*1024*1024);
 const segment=Buffer.alloc(3*1024*1024);segment[0]=0x47;
 for(let i=0;i<16;i++){
  const res=await b.call('post','/api/oryon/local-relay/upload',{
   name:'seg_'+String(i).padStart(3,'0')+'.ts',body:segment
  });
  assert.equal(res.status,200,'native 48 MiB per minute should not hit 429: segment '+i);
 }
 assert.ok(b.relay.rooms.get('vnhz').bytes<=b.relay.MAX_ROOM_BYTES);
});

test('DVR HLS metadata respects the actual OBS keyframe interval, not invented 2.0s fragments',async()=>{
 const b=backend(),upload='/api/oryon/local-relay/upload';
 const ts=Buffer.alloc(188*2);ts[0]=0x47;
 const parts=Array.from({length:4},(_,i)=>'seg_'+String(i).padStart(3,'0')+'.ts');
 for(const name of parts)assert.equal((await b.call('post',upload,{name,body:ts})).status,200);
 const playlist=Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:4\n'+parts.map(n=>'#EXTINF:3.500,\n'+n+'\n').join(''));
 assert.equal((await b.call('post',upload,{name:'index.m3u8',body:playlist})).status,200);
 const dvr=await b.call('get','/api/oryon/local-relay/:login/dvr.m3u8');
 assert.equal(dvr.status,200);
 assert.match(dvr.payload,/#EXT-X-TARGETDURATION:4/);
 assert.equal((dvr.payload.match(/#EXTINF:3\.500,/g)||[]).length,4);
 const state=await b.call('get','/api/oryon/local-relay/:login/state');
 assert.equal(state.payload.dvr_seconds,14);
});
