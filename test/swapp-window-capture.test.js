'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseWindows,resolveSelectedWindow,listCapturableWindows}=require('../local-agent/swapp-window-picker');
const {captureArgs,createScreenCapture}=require('../local-agent/swapp-screen-studio');

test('Windows list accepts concrete HWND and title, rejects duplicated or invalid entries',()=>{
 const items=parseWindows(JSON.stringify([
  {hwnd:'102030',title:'Where Winds Meet',pid:19,minimized:false},
  {hwnd:'876543',title:'Bloc-notes',pid:29,minimized:false},
  {hwnd:'2345',title:'Bloc-notes',pid:39,minimized:false},
  {hwnd:'0',title:'Malicious',pid:40},
  {hwnd:'1;rm -rf /',title:'Invalid',pid:41},
  {hwnd:'102030',title:'Duplicate handle',pid:19}
 ]));
 assert.equal(items.length,3);
 assert.equal(items.find(w=>w.hwnd==='102030').title,'Where Winds Meet');
 assert.equal(items.filter(w=>w.ambiguous).length,2);
 assert.equal(items.find(w=>w.hwnd==='102030').ambiguous,false);
});

test('window is resolved from live enumeration, cannot inject arbitrary title or stale handle',async()=>{
 const windows=[
  {hwnd:'123456',title:'Where Winds Meet',pid:120,minimized:false,ambiguous:false},
  {hwnd:'223456',title:'Other game',pid:130,minimized:true,ambiguous:false},
  {hwnd:'323456',title:'Same',pid:140,minimized:false,ambiguous:true}
 ];
 const listWindows=async()=>windows;
 assert.equal((await resolveSelectedWindow('123456',{listWindows})).title,'Where Winds Meet');
 await assert.rejects(()=>resolveSelectedWindow('777777',{listWindows}),/fermée|changé/);
 await assert.rejects(()=>resolveSelectedWindow('223456',{listWindows}),/réduite/);
 await assert.rejects(()=>resolveSelectedWindow('323456',{listWindows}),/même titre/);
 await assert.rejects(()=>resolveSelectedWindow('123456&evil',{listWindows}),/Sélectionne/);
});

test('window capture uses ffmpeg-static 6 compatible title= and NEVER desktop or ffmpeg 7 hwnd=',()=>{
 const args=captureArgs({method:'window',display:0,fps:30,bitrate:6000,encoder:'x264',
  windowTitle:'Where Winds Meet',rtmpUrl:'rtmp://127.0.0.1:1935/live/test'});
 assert.equal(args[args.indexOf('-i')+1],'title=Where Winds Meet');
 assert.ok(!args.includes('desktop'));
 assert.ok(!args.some(x=>x.startsWith('hwnd=')));
 assert.throws(()=>captureArgs({method:'window',rtmpUrl:'abc',windowTitle:''}),/fenêtre/);
});

test('selected window is validated at each start, no silent desktop fallback if it goes missing',async()=>{
 const {EventEmitter}=require('node:events');
 let executableArgs=[];
 let ready=false;
 const child=new EventEmitter();
 child.exitCode=null;
 child.stderr=new EventEmitter();
 child.kill=()=>{child.exitCode=0;child.emit('exit',0,null)};
 const capture=createScreenCapture({
  platform:'win32',ffmpegPath:'ffmpeg.exe',rtmpPort:1935,
  currentConfiguredKey:()=> 'test-key',
  listWindows:async()=>[{hwnd:'54321',title:'Notepad',pid:123,minimized:false,ambiguous:false}],
  streamStatus:()=>ready?{active:true,hls_exists:true,ffmpeg_running:true,started_at:new Date(200000).toISOString()}:{active:false},
  now:()=>200000,sleep:async()=>{},
  spawnProcess:(_binary,args)=>{executableArgs=args;ready=true;return child}
 });
 await assert.rejects(()=>capture.start({method:'window',windowHwnd:'12345'}),/fermée|changé/);
 const result=await capture.start({method:'window',windowHwnd:'54321',encoder:'x264'});
 assert.equal(result.method,'window');
 assert.deepEqual(result.window,{hwnd:'54321',title:'Notepad'});
 assert.ok(executableArgs.includes('title=Notepad'));
 capture.stop();
});

test('PowerShell enumerator script describes native API enumeration and valid JSON output',()=>{
 const script=fs.readFileSync(path.join(__dirname,'..','local-agent','list-capture-windows.ps1'),'utf8');
 assert.match(script,/EnumWindows/);
 assert.match(script,/GetWindowTextW/);
 assert.match(script,/ConvertTo-Json -InputObject/);
 assert.match(script,/OutputEncoding/);
});

test('actual Windows PowerShell enumerator launches successfully', {
 skip:process.platform!=='win32'
},async()=>{
 const items=await listCapturableWindows();
 assert.ok(Array.isArray(items));
 for(const item of items){
  assert.match(item.hwnd,/^[1-9]\d+$/);
  assert.equal(typeof item.title,'string');
 }
});
