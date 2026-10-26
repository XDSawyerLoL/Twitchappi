'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','modules','swapp-direct-hls-relay.js'),'utf8');
function backend(env={}){
 const routes={get:new Map(),post:new Map(),put:new Map()};
 const express={raw:()=>(_req,_res,next)=>next(),json:()=>(_req,_res,next)=>next()};
 const module={exports:{}};
 vm.runInNewContext(source,{
  require(id){if(id==='express')return express;if(id==='./swapp-ts-inspect')return require('../modules/swapp-ts-inspect');if(id==='./swapp-obs-hls-playlist')return require('../modules/swapp-obs-hls-playlist');return require(id)},
  module,__dirname:path.join(__dirname,'..','modules'),
  process:{env,pid:process.pid},Buffer,Date,setInterval(){return{unref(){}}}
 });
 const app={
  get(route,fn){routes.get.set(route,fn)},
  post(route,...fns){routes.post.set(route,fns.at(-1))},
  put(route,...fns){routes.put.set(route,fns.at(-1))}
 };
 const relay=module.exports.attachSwappDirectRelay(app,{lookupOwner:async token=>token==='VALID_TOKEN'?{login:'vnhz'}:null,
 lookupObsOwner:async key=>key==='a'.repeat(48)?{login:'vnhz'}:null,
 lookupDashboardOwner:async req=>req.session?.oryonUser?.login==='vnhz'?{login:'vnhz'}:null});
 async function call(method,route,{name,body,token='VALID_TOKEN',login='vnhz',segment,audioTrack,range}={}){
  const fn=routes[method].get(route);
  assert.ok(fn,'route missing: '+route);
  let status=200,type='',payload=null,headers={};
  const req={params:{login,segment},session:{oryonUser:{id:'test-owner',login:'vnhz'}},query:{cid:token,file:name},headers:{},body, get(k){
   if(k==='x-swapp-media-name')return this.headers['x-swapp-media-name']||name||'';
   if(k==='authorization')return token?'Bearer '+token:'';
   if(k==='x-swapp-media-name')return name||'';
   if(k==='x-swapp-audio-track')return audioTrack||'';
   if(k==='range')return range||'';
   return '';
  }};
  const res={
   statusCode:200,
   set(k,v){headers[k]=v;return this},
   status(code){status=code;this.statusCode=code;return this},
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
 assert.match(player.payload,/src="\/assets\/hls\.min\.js"/);
 assert.doesNotMatch(player.payload,/cdn\.jsdelivr\.net|unpkg\.com/);
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
 assert.match(source,/h264_mp4toannexb,extract_extradata,dump_extra=freq=keyframe/);
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
 assert.match(player.payload,/\/vnhz\/index\.m3u8/);
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

test('public player boots without a blocking playlist preflight',async()=>{
 const b=backend();
 const player=await b.call('get','/api/oryon/local-relay/:login/player');
 assert.equal(player.status,200);
 assert.ok(player.payload.includes('/vnhz/index.m3u8'));
 assert.ok(!player.payload.includes('playlistReady()'));
 assert.ok(player.payload.includes('Hls.Events.MEDIA_ATTACHED'));
 assert.ok(player.payload.includes('Hls.Events.ERROR'));
});

test('HLS player prioritizes hls.js over unreliable native canPlayType report',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','local-agent','player.html'),'utf8');
 const hls=html.indexOf('if(window.Hls && Hls.isSupported())');
 const native=html.indexOf("if(v.canPlayType('application/vnd.apple.mpegurl'))");
 assert.ok(hls>0,'MSE support must be checked');
 assert.ok(native>hls,'native playback is fallback, not the default');
 assert.doesNotMatch(html,/async function playlistReady\(/,'no blocking manifest preflight');
 assert.match(html,/Hls\.Events\.ERROR/,'HLS errors must remain visible');
});

test('Swappers audience counts active playback sessions, never an invented figure',async()=>{
 const b=backend(),base='/api/oryon/local-relay/:login';
 const audience=base+'/audience',beat=audience+'/heartbeat',leave=audience+'/leave';
 const onlineBefore=await b.call('get',audience);
 assert.equal(onlineBefore.payload.swappers,0);
 assert.equal(onlineBefore.payload.live,false);
 const seg=Buffer.alloc(188*3);seg[0]=0x47;
 await b.call('post','/api/oryon/local-relay/upload',{name:'seg_001.ts',body:seg});
 await b.call('post','/api/oryon/local-relay/upload',{name:'index.m3u8',
  body:Buffer.from('#EXTM3U\n#EXTINF:2,\nseg_001.ts\n')});
 const alice='a'.repeat(32),bob='b'.repeat(32);
 assert.equal((await b.call('post',beat,{body:{session:'not-a-token'}})).status,400);
 assert.equal((await b.call('post',beat,{body:{session:alice}})).payload.swappers,1);
 assert.equal((await b.call('post',beat,{body:{session:alice}})).payload.swappers,1,
  'refreshing one player must not double-count it');
 assert.equal((await b.call('post',beat,{body:{session:bob}})).payload.swappers,2);
 const live=await b.call('get',audience);
 assert.equal(live.payload.swappers,2);
 assert.equal(live.payload.live,true);
 await b.call('post',leave,{body:{session:alice}});
 assert.equal((await b.call('get',audience)).payload.swappers,1);
 const room=b.relay.rooms.get('vnhz');
 room.viewers.set(bob,Date.now()-46000);
 assert.equal((await b.call('get',audience)).payload.swappers,0,'inactive playback expires');
});
test('embedded SWAPP player can export a vertical Short without affecting HLS transport',async()=>{
 const b=backend();
 const player=await b.call('get','/api/oryon/local-relay/:login/player');
 assert.match(player.payload,/swapp-live-enhancements\.js/);
 assert.match(player.payload,/swapp-short-toggle/);
 assert.match(player.payload,/class="toolbar"/);
 const short=fs.readFileSync(path.join(__dirname,'..','assets','swapp-live-enhancements.js'),'utf8');
 new Function(short);
 assert.match(short,/preview\.width=540;preview\.height=960/);
 assert.match(short,/new MediaRecorder\(mixed,/);
 assert.match(short,/15000/);
 assert.match(short,/URL\.createObjectURL\(blob\)/);
 assert.match(short,/captureStream/);
 assert.doesNotMatch(short,/getUserMedia/);
});

test('live status requires fresh accepted video segments rather than only a cached playlist',async()=>{
 const b=backend();
 const upload='/api/oryon/local-relay/upload';
 const seg=Buffer.alloc(188*3);seg[0]=0x47;
 const playlist=Buffer.from('#EXTM3U\\n#EXT-X-TARGETDURATION:2\\n#EXTINF:2,\\nseg_123.ts\\n');
 assert.equal((await b.call('post',upload,{name:'seg_123.ts',body:seg})).status,200);
 assert.equal((await b.call('post',upload,{name:'index.m3u8',body:playlist})).status,200);
 const room=b.relay.rooms.get('vnhz');
 assert.equal((await b.call('get','/api/oryon/local-relay/:login/state')).payload.active,true);
 const last=room.lastSegmentAt;
 room.lastSegmentAt=Date.now()-31000;
 const stale=await b.call('get','/api/oryon/local-relay/:login/state');
 assert.equal(stale.payload.active,false,'a frozen live must not be reported as active');
 assert.equal(stale.payload.media_fresh,false);
 assert.ok(stale.payload.segment_age_ms>=30000);
 assert.equal((await b.call('get','/api/oryon/local-relay/:login/audience')).payload.live,false);
 assert.equal((await b.call('get','/api/oryon/local-relay/:login/probe')).payload.active,false);
 room.lastSegmentAt=last;
 assert.equal((await b.call('get','/api/oryon/local-relay/:login/state')).payload.active,true);
});


test('re-uploading the same stalled MPEG-TS bytes cannot fake fresh playback',async()=>{
 const b=backend(),upload='/api/oryon/local-relay/upload';
 const bytes=Buffer.alloc(564);bytes[0]=0x47;
 assert.equal((await b.call('post',upload,{name:'seg_004.ts',body:bytes})).status,200);
 const playlist=Buffer.from('#EXTM3U\n#EXTINF:2,\nseg_004.ts\n');
 assert.equal((await b.call('post',upload,{name:'index.m3u8',body:playlist})).status,200);
 const room=b.relay.rooms.get('vnhz');
 room.lastSegmentAt=Date.now()-31000;
 assert.equal((await b.call('post',upload,{name:'seg_004.ts',body:bytes})).status,200);
 const state=(await b.call('get','/api/oryon/local-relay/:login/state')).payload;
 assert.equal(state.active,false,'identical retransmission must not reactivate a frozen live');
 const changed=Buffer.from(bytes);changed[1]=1;
 assert.equal((await b.call('post',upload,{name:'seg_004.ts',body:changed})).status,200);
 assert.equal((await b.call('get','/api/oryon/local-relay/:login/state')).payload.active,true);
});

test('native TV inventory lists only actual fresh OBS media, never a stalled relay',async()=>{
 const b=backend(),upload='/api/oryon/local-relay/upload';
 assert.deepEqual(b.relay.activeStreams(),[]);
 const seg=Buffer.alloc(188*3,0);seg[0]=0x47;
 const playlist=Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nseg_001.ts\n');
 assert.equal((await b.call('post',upload,{name:'seg_001.ts',body:seg})).status,200);
 assert.deepEqual(b.relay.activeStreams(),[],'a segment without a manifest is not playable');
 assert.equal((await b.call('post',upload,{name:'index.m3u8',body:playlist})).status,200);
 const streams=b.relay.activeStreams();
 assert.equal(streams.length,1);
 assert.equal(streams[0].login,'vnhz');
 assert.equal(streams[0].media,'hls');
 assert.equal(streams[0].media_verified,true);
 assert.equal(streams[0].player_url,'/api/oryon/local-relay/vnhz/player');
 assert.match(streams[0].broadcast_id,/^[a-f0-9]{24}$/);
 const room=b.relay.rooms.get('vnhz');
 room.lastSegmentAt=Date.now()-31000;
 assert.deepEqual(b.relay.activeStreams(),[],'stalled media cannot remain on SWAPP TV');
 const changed=Buffer.from(seg);changed[1]=1;
 assert.equal((await b.call('post',upload,{name:'seg_001.ts',body:changed})).status,200);
 assert.equal(b.relay.activeStreams().length,1,'fresh video returns to verified native TV');
});

test('native broadcast capacity shows measured per-process HLS load without inventing a CDN',async()=>{
 const b=backend(),cap='/api/oryon/local-relay/capacity',upload='/api/oryon/local-relay/upload';
 const fresh=await b.call('get',cap);
 assert.equal(fresh.status,200);
 assert.equal(fresh.payload.scope,'single_node_process');
 assert.equal(fresh.payload.verified_live_rooms,0);
 assert.equal(fresh.payload.available_slots,fresh.payload.max_rooms);
 const segment=Buffer.alloc(188*3);segment[0]=0x47;
 assert.equal((await b.call('post',upload,{name:'seg_001.ts',body:segment})).status,200);
 const before=await b.call('get',cap);
 assert.equal(before.payload.verified_live_rooms,0,'media must be playlist-verified');
 assert.equal((await b.call('post',upload,{
  name:'index.m3u8',body:Buffer.from('#EXTM3U\\n#EXTINF:2,\\nseg_001.ts\\n')
 })).status,200);
 const ready=await b.call('get',cap);
 assert.equal(ready.payload.verified_live_rooms,1);
 assert.equal(ready.payload.available_slots,Math.max(0,ready.payload.max_rooms-1));
 assert.ok(ready.payload.video_bytes_in_memory>=segment.length);
 const got=await b.call('get','/api/oryon/local-relay/:login/:segment',{segment:'seg_001.ts'});
 assert.equal(got.status,200);
 const measured=await b.call('get',cap);
 assert.ok(measured.payload.segment_response_bytes_60s>=segment.length,
  'count actually served segment response bytes');
 assert.ok(measured.payload.estimated_segment_mbps>=0);
 assert.match(measured.payload.note,/processus Node/);
});


test('native OBS HLS PUT receives MPEG-TS segments without SWAPP Local',async()=>{
 const b=backend();
 const dest='/api/swapp/obs-hls/put';
 const streamKey='a'.repeat(48);
 const video=Buffer.alloc(188*4);video[0]=0x47;
 const manifest=Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nindex0.ts\n');
 assert.equal((await b.call('put',dest,{name:'index0.ts',body:video,token:'b'.repeat(48)})).status,403);
 assert.equal((await b.call('put',dest,{name:'../passwd',body:video,token:streamKey})).status,400);
 assert.equal((await b.call('put',dest,{name:'index.m3u8',body:manifest,token:streamKey})).status,200);
 assert.equal((await b.call('get','/api/oryon/local-relay/:login/state')).payload.active,false,'live needs a playable segment');
 assert.equal((await b.call('put',dest,{name:'index0.ts',body:video,token:streamKey})).status,200);
 assert.equal((await b.call('put',dest,{name:'index.m3u8',body:manifest,token:streamKey})).status,200);
 const st=await b.call('get','/api/oryon/local-relay/:login/state');
 assert.equal(st.payload.active,true);
 const list=await b.call('get','/api/oryon/local-relay/:login/index.m3u8');
 assert.match(list.payload.toString(),/seg_0\\.ts/);
 const ts=await b.call('get','/api/oryon/local-relay/:login/:segment',{segment:'seg_0.ts'});
 assert.equal(ts.status,200);
 assert.deepEqual(Buffer.from(ts.payload),video);
});

test('owner-only OBS diagnostics separate missing ingress, segment reception and verified playlist',async()=>{
 const b=backend();
 const path='/api/swapp/obs-hls/diagnostics';
 const ping=await b.call('put','/api/swapp/obs-hls/ping');
 assert.equal(ping.status,200);
 assert.equal(ping.payload.http_put_forwarded,true);
 const initial=await b.call('get',path);
 assert.equal(initial.payload.stage,'no_upload');
 assert.equal(initial.payload.transport,'obs-hls-http-put');
 assert.equal(Object.keys(initial.payload).some(k=>/token|key|secret|cid/i.test(k)),false);
 const bytes=Buffer.alloc(188*3);bytes[0]=0x47;
 const seg=await b.call('put','/api/swapp/obs-hls/put',{name:'index0.ts',token:'a'.repeat(48),body:bytes});
 assert.equal(seg.status,200);
 const partial=await b.call('get',path);
 assert.equal(partial.payload.stage,'segments_only');
 assert.equal(partial.payload.last_file_type,'segment');
 const manifest=Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nindex0.ts\n');
 assert.equal((await b.call('put','/api/swapp/obs-hls/put',{name:'index.m3u8',token:'a'.repeat(48),body:manifest})).status,200);
 const done=await b.call('get',path);
 assert.equal(done.payload.stage,'live');
 assert.equal(done.payload.has_playlist,true);
 assert.equal(done.payload.segment_count,1);
 assert.equal(done.payload.last_status,200);
});

test('owner diagnostics report missing decoded HLS PUT request bodies',async()=>{
 const b=backend();
 const response=await b.call('put','/api/swapp/obs-hls/put',{name:'index0.ts',token:'a'.repeat(48),body:undefined});
 assert.equal(response.status,400);
 assert.match(response.payload.error,/PUT vide|chunked/i);
 const status=await b.call('get','/api/swapp/obs-hls/diagnostics');
 assert.equal(status.payload.stage,'rejected');
 assert.equal(status.payload.last_status,400);
 assert.equal(status.payload.last_file_type,'segment');
});


test('OBS/FFmpeg uploads a playlist with query-bearing segment URI; no stream key leaks',async()=>{
 const b=backend(),url='/api/swapp/obs-hls/put',key='a'.repeat(48);
 const manifest=Buffer.from('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1.920000,\nput?cid='+key+'&file=index0.ts\n');
 const premature=await b.call('put',url,{token:key,name:'index.m3u8',body:manifest});
 assert.equal(premature.status,200,'FFmpeg can send playlist before the TS file');
 assert.equal((await b.call('get','/api/oryon/local-relay/:login/state')).payload.active,false);
 const media=Buffer.alloc(188*5);media[0]=0x47;
 const uploaded=await b.call('put',url,{token:key,name:'index0.ts',body:media});
 assert.equal(uploaded.status,200);
 const state=await b.call('get','/api/oryon/local-relay/:login/state');
 assert.equal(state.payload.active,true);
 const pl=await b.call('get','/api/oryon/local-relay/:login/index.m3u8');
 const txt=pl.payload.toString('utf8');
 assert.match(txt,/#EXTINF:1\.920000/);
 assert.match(txt,/seg_0\.ts/);
 assert.doesNotMatch(txt,/cid=|index0\.ts|put\?|aaaaaaaa/);
 const diagnostic=await b.call('get','/api/swapp/obs-hls/diagnostics');
 assert.equal(diagnostic.payload.stage,'live');
 assert.equal(diagnostic.payload.last_status,200);
});

test('OBS playlist rejects forged credentials and unsupported URLs or encryption',async()=>{
 const b=backend(),url='/api/swapp/obs-hls/put',key='a'.repeat(48);
 for(const badRef of [
  'put?cid='+'b'.repeat(48)+'&file=index0.ts',
  'http://remote.example/media.ts','../../etc/passwd','put?cid='+key+'&file=../secret'
 ]){
  const manifest=Buffer.from('#EXTM3U\n#EXTINF:2,\n'+badRef+'\n');
  const rejected=await b.call('put',url,{token:key,name:'index.m3u8',body:manifest});
  assert.equal(rejected.status,422);
  assert.equal(rejected.payload.reason,'playlist_segment_uri');
 }
 const encrypted=Buffer.from('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="private.key"\n#EXTINF:2,\nindex0.ts\n');
 assert.equal((await b.call('put',url,{token:key,name:'index.m3u8',body:encrypted})).status,422);
 const d=await b.call('get','/api/swapp/obs-hls/diagnostics');
 assert.equal(d.payload.last_error_file_type,'playlist');
 assert.doesNotMatch(JSON.stringify(d.payload),/a{48}|b{48}/);
});

test('shared HLS directory serves actual playlist and segment across isolated Node relay instances',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-shared-hls-'));
 try{
  const env={SWAPP_DIRECT_RELAY_SHARED_DIR:tmp};
  const writer=backend(env),reader=backend(env);
  const push='/api/oryon/local-relay/upload';
  const manifest='/api/oryon/local-relay/:login/index.m3u8';
  const segment='/api/oryon/local-relay/:login/:segment';
  const media=Buffer.alloc(188*4,0);media[0]=0x47;
  const playlist=Buffer.from('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nseg_007.ts\n');
  assert.equal((await writer.call('post',push,{name:'seg_007.ts',body:media})).status,200);
  assert.equal((await writer.call('post',push,{name:'index.m3u8',body:playlist})).status,200);
  assert.equal(reader.relay.rooms.size,0,'independent process has no in-memory room');
  const remoteState=await reader.call('get','/api/oryon/local-relay/:login/state');
  assert.equal(remoteState.payload.active,true,'remote worker must not incorrectly mark live offline');
  const external=await reader.call('get',manifest);
  assert.equal(external.status,200,'second process can serve shared manifest');
  assert.match(external.payload.toString('utf8'),/seg_007\.ts/);
  const chunk=await reader.call('get',segment,{segment:'seg_007.ts'});
  assert.equal(chunk.status,200,'second process can serve shared media');
  assert.deepEqual(Buffer.from(chunk.payload),media);
  assert.equal((await reader.call('get',segment,{segment:'../secret'})).status,404);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
