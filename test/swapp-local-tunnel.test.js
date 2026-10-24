'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const server = read('local-agent/server.js');
const pkg = JSON.parse(read('local-agent/package.json'));
function runLocalServer(){
 const apps=[];
 function fakeExpress(){
  const routes=[];
  const app={
   routes,port:null,host:null,
   use(...args){routes.push({type:'use',path:typeof args[0]==='string'?args[0]:'*',handler:args[1]||args[0]})},
   get(p,handler){routes.push({type:'get',path:p,handler})},
   post(p,handler){routes.push({type:'post',path:p,handler})},
   listen(port,host,cb){app.port=port;app.host=host;cb?.()}
  };
  apps.push(app);return app;
 }
 fakeExpress.json=()=>()=>{};
 fakeExpress.static=()=>()=>{};
 const fakeFs={mkdirSync(){},existsSync(){return false},readFileSync(file,encoding){if(path.basename(file)==='player.html')return fs.readFileSync(file,encoding);throw Error('test config absent')},writeFileSync(){},readdirSync(){return []},unlinkSync(){}};
 class FakeMediaServer{on(){}run(){}}
 vm.runInNewContext(server,{
  require(id){
   if(id==='express')return fakeExpress;
   if(id==='node-media-server')return FakeMediaServer;
   if(id==='fs')return fakeFs;
   if(id==='ffmpeg-static')return null;
   return require(id);
  },
  __dirname:path.join(__dirname,'..','local-agent'),
  process:{env:{APPDATA:'test-directory'},platform:'win32',arch:'x64',resourcesPath:'test-resources'},
  console:{log(){}},setInterval(){},setTimeout(){},clearTimeout(){},URL,Buffer,Promise,
  fetch(){throw Error('unexpected network call')}
 },{timeout:5000});
 return apps;
}
test('remote SWAPP viewer receives relative HLS media and bundled decoder',()=>{
 const [local,publicOnly]=runLocalServer();
 assert.equal(local.port,8081);assert.equal(local.host,'127.0.0.1');
 assert.equal(publicOnly.port,8082);assert.equal(publicOnly.host,'127.0.0.1');
 const player=publicOnly.routes.find(r=>r.type==='get'&&r.path==='/player/:key');
 assert.ok(player);
 let html='';
 player.handler({params:{key:'demo'}},{type(){return this},send(x){html=x}});
 assert.ok(html.includes('/hls/demo/index.m3u8'));
 assert.ok(html.includes('/assets/hls.min.js'));
 assert.ok(!html.includes('http://127.0.0.1'));
 assert.ok(html.includes('id="audio"'),'viewer needs a sound toggle');
 assert.ok(html.includes('id="volume"'),'viewer needs a volume slider');
 assert.ok(html.includes('id="screen"'),'viewer needs fullscreen control');
 assert.ok(html.includes('id="fit"'),'viewer needs fill/contain image control');
 assert.ok(html.includes('requestFullscreen'),'fullscreen should use the browser fullscreen API');
 assert.ok(html.includes('object-fit:cover'),'video should fill the player by default');
 assert.ok(html.includes('object-fit:contain'),'viewer should be able to see un-cropped video');
});
test('public Cloudflare tunnel cannot access user settings or local control APIs',()=>{
 const [local,publicOnly]=runLocalServer();
 const paths=publicOnly.routes.filter(r=>r.path!=='*').map(r=>r.path);
 for(const p of ['/health','/hls','/player/:key','/assets/hls.min.js'])assert.ok(paths.includes(p),p);
 assert.ok(!paths.some(p=>p.startsWith('/api/')));
 assert.ok(local.routes.some(r=>r.path==='/api/account/status'));
 assert.ok(publicOnly.routes.some(r=>r.type==='use'&&r.path==='*'));
 assert.ok(server.includes('PUBLIC_HTTP_PORT'));
});
test('Windows executable bundles validated cloudflared and a local HLS player dependency',()=>{
 assert.equal(pkg.version,'1.0.5');
 assert.ok(pkg.dependencies['hls.js']);
 assert.ok(pkg.build.extraResources.some(x=>x.from==='bin/cloudflared.exe'&&x.to==='bin/cloudflared.exe'));
 assert.ok(server.includes('process.resourcesPath'));
 const workflow=read('.github/workflows/swapp-live-windows.yml');
 assert.ok(workflow.includes('Get-FileHash'));
 assert.ok(workflow.includes('cloudflared-windows-amd64.exe'));
 assert.ok(workflow.includes('swapp-live-windows-v1.0.5'));
});
test('SWAPP only announces the tunnel once public playlist and segments respond',()=>{
 assert.ok(server.includes('async function validatePublicVideo'));
 assert.ok(server.includes("playlist.startsWith('#EXTM3U')"));
 assert.ok(server.includes('segmentResponse.ok'));
 assert.ok(server.includes('await validatePublicVideo(key)'));
});
