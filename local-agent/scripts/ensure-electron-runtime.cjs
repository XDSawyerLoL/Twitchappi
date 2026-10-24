'use strict';

// electron-builder afterPack hook: Electron's ffmpeg.dll is a native, runtime
// dependency of SWAPP Live.exe. The independent ffmpeg-static binary is NOT
// an acceptable replacement for this DLL.
const fs=require('node:fs');
const path=require('node:path');

function verifyElectronDll(file){
 if(!fs.existsSync(file))throw new Error('SWAPP Live: ffmpeg.dll absent: '+file);
 const stat=fs.statSync(file);
 if(stat.size<100*1024)throw new Error('SWAPP Live: ffmpeg.dll incomplet: '+file+' ('+stat.size+' octets)');
 const fd=fs.openSync(file,'r');
 try{
  const magic=Buffer.alloc(2);
  if(fs.readSync(fd,magic,0,2,0)!==2||magic.toString('ascii')!=='MZ')
   throw new Error('SWAPP Live: ffmpeg.dll non valide (signature PE MZ absente): '+file);
 }finally{fs.closeSync(fd)}
 return stat.size;
}

async function ensureElectronRuntime(context){
 if(context.electronPlatformName!=='win32')return;
 const appDir=context.appOutDir;
 if(!appDir)throw new Error('SWAPP Live: répertoire de paquet Electron manquant');
 const dll=path.join(appDir,'ffmpeg.dll');
 if(!fs.existsSync(dll)){
  const source=path.resolve(__dirname,'..','node_modules','electron','dist','ffmpeg.dll');
  // Never retrieve random DLL binaries from the Internet: use the exact
  // electron version installed for this build and require a valid PE.
  verifyElectronDll(source);
  fs.copyFileSync(source,dll);
  console.log('[SWAPP Live] ffmpeg.dll restauré depuis Electron officiel.');
 }
 const size=verifyElectronDll(dll);
 const executable=path.join(appDir,'SWAPP Live.exe');
 if(!fs.existsSync(executable))
  throw new Error('SWAPP Live: exécutable principal absent du paquet: '+executable);
 const resources=path.join(appDir,'resources');
 if(!fs.existsSync(resources))
  throw new Error('SWAPP Live: dossier resources absent du paquet: '+resources);
 console.log('[SWAPP Live] Intégrité Electron vérifiée, ffmpeg.dll '+size+' octets, à côté de SWAPP Live.exe');
}

module.exports={default:ensureElectronRuntime,ensureElectronRuntime,verifyElectronDll};
