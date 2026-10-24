'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {verifyElectronDll,ensureElectronRuntime}=require('../local-agent/scripts/ensure-electron-runtime.cjs');
const pkg=require('../local-agent/package.json');

function fakePe(){
 const bytes=Buffer.alloc(150*1024);
 bytes.write('MZ',0,'ascii');
 return bytes;
}
test('rejects a missing, tiny or non-PE ffmpeg.dll',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-electron-test-'));
 try{
  const file=path.join(dir,'ffmpeg.dll');
  assert.throws(()=>verifyElectronDll(file),/ffmpeg\.dll absent/);
  fs.writeFileSync(file,Buffer.from('not a binary'));
  assert.throws(()=>verifyElectronDll(file),/incomplet/);
  fs.writeFileSync(file,Buffer.alloc(150*1024));
  assert.throws(()=>verifyElectronDll(file),/signature PE MZ/);
  fs.writeFileSync(file,fakePe());
  assert.equal(verifyElectronDll(file),150*1024);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('afterPack refuses Windows installer without matching Electron runtime and app resources',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'swapp-electron-test-'));
 try{
  const app=path.join(dir,'win-unpacked');
  fs.mkdirSync(app);
  const ctx={electronPlatformName:'win32',appOutDir:app};
  await assert.rejects(ensureElectronRuntime(ctx),/ffmpeg\.dll/);
  fs.writeFileSync(path.join(app,'ffmpeg.dll'),fakePe());
  await assert.rejects(ensureElectronRuntime(ctx),/exécutable principal absent/);
  fs.writeFileSync(path.join(app,'SWAPP Live.exe'),fakePe());
  await assert.rejects(ensureElectronRuntime(ctx),/dossier resources absent/);
  fs.mkdirSync(path.join(app,'resources'));
  await ensureElectronRuntime(ctx);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('the portable EXE avoids reusing an incomplete Windows extraction directory',()=>{
 assert.equal(pkg.version,'1.0.4');
 assert.equal(pkg.build.portable.unpackDirName,false);
 assert.match(pkg.build.afterPack,/ensure-electron-runtime/);
});
