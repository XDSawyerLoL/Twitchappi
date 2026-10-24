'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','local-agent','server.js'),'utf8');
const from=source.indexOf('function startHlsTransmux(key) {');
const to=source.indexOf('function stopHlsTransmux(',from);
assert.ok(from>=0&&to>from,'live muxer present');
const functionText=source.slice(from,to);

function ffmpegArgsFor(mode='copy'){
 let args=[],command='',quality=null;
 const ctx={
  safeKey:x=>x,hlsDir:()=>'/tmp/swapp-quality',hlsPath:()=>'/tmp/swapp-quality/index.m3u8',
  fs:{mkdirSync(){}},cleanupHls(){},path,
  RTMP_PORT:1935,TRANSCODE_MODE:mode,FFMPEG_PATH:'ffmpeg',
  ffmpegJobs:{},log(_type,_message,data){quality=data},
  spawn(exe,p){command=exe;args=p;return{stderr:{on(){}},on(){},kill(){}}}
 };
 vm.runInNewContext(functionText+'; startHlsTransmux("test");',ctx);
 return{args,command,quality};
}

test('default video uses FFmpeg stream copy without re-encoding either OBS track',()=>{
 assert.match(source,/SWAPP_LOCAL_TRANSCODE \|\| process\.env\.ORYON_LOCAL_TRANSCODE \|\| 'copy'/);
 const {args,quality}=ffmpegArgsFor();
 const param=name=>args[args.indexOf(name)+1];
 assert.equal(param('-c:v'),'copy');
 assert.equal(param('-c:a'),'copy');
 assert.equal(param('-bsf:v'),'h264_mp4toannexb,extract_extradata,dump_extra=freq=keyframe',
  'every segment needs SPS/PPS for H264 keyframes without re-encoding');
 assert.equal(param('-f'),'hls');
 assert.equal(param('-hls_time'),'2');
 assert.equal(quality.mode,'native');
 assert.equal(quality.video_transcoded,false);
 for(const forbidden of ['-vf','-s','-r','-b:v','-maxrate','-pix_fmt','libx264','1600k','1280','720']){
  assert.ok(!args.includes(forbidden),'native quality incorrectly modifies '+forbidden);
 }
 assert.ok(args.includes('0:a:0?'),'audio is kept if present');
 assert.equal(args[args.indexOf('-map')+1],'0:v:0');
});
test('optional manual compatibility mode never silently downgrades to 720p/1600kbps',()=>{
 const {args,quality}=ffmpegArgsFor('transcode');
 const param=name=>args[args.indexOf(name)+1];
 assert.equal(quality.mode,'compatibility');
 assert.equal(quality.video_transcoded,true);
 assert.equal(param('-c:v'),'libx264');
 assert.equal(param('-b:v'),'6000k');
 assert.equal(param('-b:a'),'160k');
 assert.ok(!args.includes('-vf'),'do not shrink the original resolution');
});
test('a viewer gets the original video frames; the player is not CSS-blurred',()=>{
 const player=fs.readFileSync(path.join(__dirname,'..','local-agent','player.html'),'utf8');
 assert.match(player,/object-fit:cover/);
 assert.ok(!player.includes('filter:blur('));
 assert.match(player,/id="fit"/);
});
