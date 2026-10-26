'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {registerObsInstallerDownload,sha256,size}=require('../modules/swapp-obs-installer-download');
const fs=require('node:fs');
const path=require('node:path');
const page=fs.readFileSync(path.join(__dirname,'../assets/swapp-obs-direct-dashboard.js'),'utf8');
test('EXE bundle has verified 64-bit PE identity and immutable SHA256',()=>{
 assert.equal(size,7680);
 assert.equal(sha256,'19e68ff5502365db5e94afc01b516797c5a40a0611ce51aebd3b910d6a14c28a');
});
test('install EXE is a direct public attachment registered as a first-party route',()=>{
 let registered=null;
 const app={get:(path,handler)=>{registered={path,handler}}};
 registerObsInstallerDownload(app);
 assert.equal(registered.path,'/assets/downloads/SWAPP-OBS-HLS-Installer-x64.exe');
 const headers={};
 let result=null;
 const res={set:(key,value)=>{headers[key]=value;return res},send:buffer=>{result=buffer;return res}};
 registered.handler({},res);
 assert.ok(Buffer.isBuffer(result));
 assert.equal(result.length,size);
 assert.equal(result.subarray(0,2).toString('ascii'),'MZ');
 assert.match(headers['Content-Disposition'],/SWAPP-OBS-HLS-Installer-x64.exe/);
});
test('compact OBS settings use the EXE, never an unrelated SWAPP Live application or PowerShell link',()=>{
 assert.match(page,/const setupUrl='\/assets\/downloads\/SWAPP-OBS-HLS-Installer-x64.exe'/);
 assert.match(page,/download\.href=setupUrl/);
 assert.match(page,/swapp-obs-advanced/);
 assert.match(page,/swapp-obs-redundant-modes/);
 assert.doesNotMatch(page,/configurer-obs-swapp-hls\.ps1|swapp-obs-hls-preset\.json/);
});
test('server routes EXE before non-fallthrough static assets',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const register=server.indexOf('registerObsInstallerDownload(app)');
 const staticRoute=server.indexOf("app.use('/assets', express.static");
 assert.ok(register>0&&staticRoute>register);
});
