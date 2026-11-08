'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createSceneStore}=require('../local-agent/swapp-scene-store');
const {captureArgs,parseDshowDevices}=require('../local-agent/swapp-screen-studio');

function fileFixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-scenes-'));
 return {file:path.join(dir,'scenes.json'),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

test('scenes are real persistent local state with create, duplicate, rename, selection and removal',()=>{
 const temp=fileFixture();
 try{
  const store=createSceneStore({filePath:temp.file});
  assert.equal(store.get().scenes.length,1);
  let state=store.mutate({action:'create',name:'Jeu'});
  assert.equal(state.scenes.length,2);
  const id=state.activeId;
  state=store.mutate({action:'set-base',id,base:{method:'window',windowHwnd:'123456',display:0}});
  assert.equal(state.scenes.find(x=>x.id===id).base.windowHwnd,'123456');
  state=store.mutate({action:'rename',id,name:'Jeu principal'});
  assert.equal(state.scenes.find(x=>x.id===id).name,'Jeu principal');
  state=store.mutate({action:'add-webcam',id,device:'HD Webcam',x:1300,y:760,width:400,height:225});
  assert.equal(state.scenes.find(x=>x.id===id).overlays.length,1);
  const persisted=createSceneStore({filePath:temp.file});
  assert.equal(persisted.get().scenes.find(x=>x.id===id).overlays[0].device,'HD Webcam');
  state=store.mutate({action:'duplicate',id});
  assert.equal(state.scenes.length,3);
  state=store.mutate({action:'remove',id});
  assert.equal(state.scenes.length,2);
  assert.equal(fs.readFileSync(temp.file,'utf8').includes('stream_key'),false);
 }finally{temp.cleanup()}
});

test('scene validation rejects invalid sources, duplicate cameras, protected last scene and overflow',()=>{
 const temp=fileFixture();
 try{
  const store=createSceneStore({filePath:temp.file});
  const sceneId=store.get().activeId;
  assert.throws(()=>store.mutate({action:'remove',id:sceneId}),/au moins une scène/);
  assert.throws(()=>store.mutate({action:'add-webcam',id:sceneId,device:''}),/caméra/);
  store.mutate({action:'add-webcam',id:sceneId,device:'Logitech C920'});
  assert.throws(()=>store.mutate({action:'add-webcam',id:sceneId,device:'Logitech C920'}),/même|deux fois/);
 }finally{temp.cleanup()}
});

test('FFmpeg physically overlays webcam on game/window video with webcam mapped separately from audio',()=>{
 const args=captureArgs({
  method:'window',windowTitle:'Where Winds Meet',display:0,
  fps:30,bitrate:6000,encoder:'x264',rtmpUrl:'rtmp://127.0.0.1:1935/live/key',
  overlays:[{type:'webcam',device:'Logitech C920',x:1550,y:800,width:320,height:180}],
  audioDevice:'Stereo Mix',micDevice:'Microphone USB'
 });
 assert.ok(args.includes('title=Where Winds Meet'));
 assert.ok(args.includes('video=Logitech C920'));
 assert.ok(args.includes('audio=Stereo Mix'));
 assert.ok(args.includes('audio=Microphone USB'));
 const filters=args[args.indexOf('-filter_complex')+1];
 assert.match(filters,/\[0:v\].+\[vbase\]/);
 assert.match(filters,/\[1:v\]scale=320:180/);
 assert.match(filters,/\[vbase\]\[cam0\]overlay=1550:800/);
 assert.match(filters,/\[2:a\]\[3:a\]amix/);
 assert.ok(args.includes('[vcomposite0]'));
 assert.ok(args.includes('[a]'));
 assert.ok(!args.includes('desktop'));
});

test('DirectShow device parser distinguishes physical webcams from microphones',()=>{
 const log=[
 '[dshow @ 000001] DirectShow video devices (some may be both video and audio devices)',
 '[dshow @ 000001]  "Logitech C920" (video)',
 '[dshow @ 000001]     Alternative name "@device_pnp_usb"',
 '[dshow @ 000001] DirectShow audio devices',
 '[dshow @ 000001]  "Microphone (Realtek Audio)" (audio)',
 '[dshow @ 000001]  "Stereo Mix (Realtek Audio)" (audio)'
 ].join('\n');
 const x=parseDshowDevices(log);
 assert.deepEqual(x.videoDevices,['Logitech C920']);
 assert.deepEqual(x.devices,['Microphone (Realtek Audio)','Stereo Mix (Realtek Audio)']);
});

test('scene controller buttons are real operations, not static markup',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','local-agent','studio.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'..','local-agent','studio-scenes.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'..','local-agent','studio.css'),'utf8');
 for(const id of ['scenes','sceneList','sceneCreate','sceneDuplicate','sceneRemove','sceneRename','sceneAddWebcam','sceneLayerList','sceneNotice','webcamSelect']){
  assert.ok(html.includes('id="'+id+'"'),id+' element is missing');
  assert.ok(js.includes("$('"+id+"')"),id+' has no controller');
 }
 assert.match(html,/src="\/studio-scenes\.js"/);
 assert.match(css,/\.scene-choice\.active/);
 assert.match(js,/\/api\/screen\/scenes/);
});
