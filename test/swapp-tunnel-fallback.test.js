'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');

const server=fs.readFileSync(path.join(__dirname,'..','local-agent','server.js'),'utf8');
function mockTunnelApp(){
 const calls=[],cooldowns=new Map();
 function expressApp(){return {use(){},get(){},post(){},listen(_port,_host,ready){ready?.()}}}
 expressApp.json=()=>()=>{};
 expressApp.static=()=>()=>{};
 class FakeNms{on(){}run(){}}
 function spawn(exe,args){
  const provider=String(exe).toLowerCase().includes('cloudflared')?'cloudflared':'ssh';
  calls.push({provider,args});
  const proc=new EventEmitter();
  proc.stdout=new EventEmitter();
  proc.stderr=new EventEmitter();
  proc.exitCode=null;
  proc.signalCode=null;
  proc.kill=()=>{proc.exitCode=0;proc.emit('exit',0,'SIGTERM')};
  setImmediate(()=>{
   if(provider==='cloudflared'){
    proc.stderr.emit('data',Buffer.from('Requesting new quick Tunnel on trycloudflare.com...\nquick tunnel provisioning failed with status 429\n'));
    proc.exitCode=1;
    proc.emit('exit',1,null);
   }else{
    proc.stdout.emit('data',Buffer.from('Welcome to localhost.run!\nstream-abc.lhr.life tunneled with tls termination, https://stream-abc.lhr.life\n'));
   }
  });
  return proc;
 }
 const fakeFs={
  mkdirSync(){},existsSync(p){return String(p).endsWith('cloudflared.exe')},
  readFileSync(p){if(cooldowns.has(p))return cooldowns.get(p);throw Error('no config')},
  writeFileSync(p,v){cooldowns.set(p,v)},readdirSync(){return []},unlinkSync(){}
 };
 const ctx={
  require(name){
   if(name==='express')return expressApp;
   if(name==='node-media-server')return FakeNms;
   if(name==='child_process')return {spawn};
   if(name==='fs')return fakeFs;
   if(name==='ffmpeg-static')return null;
   return require(name);
  },
  __dirname:path.join(__dirname,'..','local-agent'),
  process:{env:{APPDATA:'test-appdata',WINDIR:'C:\\Windows'},platform:'win32',arch:'x64',resourcesPath:'test-resources'},
  console:{log(){}},Buffer,Promise,Date,URL,setTimeout,clearTimeout,setInterval(){},
  fetch:async url=>{
   assert.match(url,/https:\/\/stream-abc\.lhr\.life\/health\?/);
   return {ok:true,status:200,text:async()=>JSON.stringify({success:true,name:'SWAPP Public Video'})};
  }
 };
 vm.runInNewContext(server+'\n;globalThis.testTunnel={startPublicTunnel,stopPublicTunnel,isLoopbackPublicUrl,normalizePublicBaseUrl,tunnelDiagnostics};',ctx,{timeout:5000});
 return {ctx,calls,cooldowns};
}
test('a Cloudflare 429 stops retries immediately and switches automatically to a verified free SSH tunnel',async()=>{
 const {ctx,calls,cooldowns}=mockTunnelApp();
 const [a,b]=await Promise.all([ctx.testTunnel.startPublicTunnel('auto'),ctx.testTunnel.startPublicTunnel('auto')]);
 assert.equal(a.url,'https://stream-abc.lhr.life');
 assert.equal(a.provider,'localhost-run');
 assert.equal(b.url,a.url);
 assert.deepEqual(calls.map(c=>c.provider),['cloudflared','ssh']);
 const args=calls[1].args.join(' ');
 assert.match(args,/BatchMode=yes/);
 assert.match(args,/StrictHostKeyChecking=accept-new/);
 assert.match(args,/80:127\.0\.0\.1:8082/);
 assert.ok(cooldowns.size>0,'429 cooldown survives application restarts');
 assert.ok(ctx.testTunnel.tunnelDiagnostics().cloudflare_retry_after);
 await ctx.testTunnel.stopPublicTunnel();
 await ctx.testTunnel.startPublicTunnel('auto');
 assert.equal(calls.filter(c=>c.provider==='cloudflared').length,1,'no Cloudflare request during cooldown');
 assert.equal(calls.filter(c=>c.provider==='ssh').length,2);
 await ctx.testTunnel.stopPublicTunnel();
});
test('free localhost.run domains are permitted while actual localhost is rejected',()=>{
 const {ctx}=mockTunnelApp();
 const {normalizePublicBaseUrl,isLoopbackPublicUrl}=ctx.testTunnel;
 assert.equal(normalizePublicBaseUrl('https://abc.localhost.run'),'https://abc.localhost.run');
 assert.equal(normalizePublicBaseUrl('https://abc.lhr.life'),'https://abc.lhr.life');
 assert.equal(isLoopbackPublicUrl('https://abc.localhost.run/player/demo'),false);
 assert.equal(isLoopbackPublicUrl('http://127.0.0.1:8081/'),true);
 assert.throws(()=>normalizePublicBaseUrl('https://localhost/player/demo'),/URL locale refusée/);
 assert.throws(()=>normalizePublicBaseUrl('https://127.0.0.1/player/demo'),/URL locale refusée/);
});
