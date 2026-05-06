#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const http = require('http');

const root = __dirname;
const localAgentDir = path.join(root, 'local-agent');
const cmd = (process.argv[2] || 'check').toLowerCase();

function run(command,args=[],opts={}){
  return spawnSync(command,args,{encoding:'utf8',stdio:opts.stdio||'pipe',shell:process.platform==='win32',...opts});
}
function checkBin(command,args=['--version']){
  const r = run(command,args,{timeout:5000});
  return { ok:r.status===0 || Boolean(r.stdout || r.stderr), output:String(r.stdout || r.stderr || '').split(/\r?\n/)[0] || '' };
}
function localPackage(){ return JSON.parse(fs.readFileSync(path.join(localAgentDir,'package.json'),'utf8')); }
function bundledFfmpeg(){ try{ const p=require(path.join(localAgentDir,'node_modules','ffmpeg-static')); return p && fs.existsSync(p) ? p : ''; }catch{return '';} }
function getJson(url, timeout=3500){
  return new Promise(resolve=>{
    const req=http.get(url,res=>{let data='';res.on('data',d=>data+=d);res.on('end',()=>{try{resolve({ok:res.statusCode>=200&&res.statusCode<300,json:JSON.parse(data)})}catch{resolve({ok:false,error:data})}})});
    req.on('error',e=>resolve({ok:false,error:e.message})); req.setTimeout(timeout,()=>{req.destroy();resolve({ok:false,error:'timeout'})});
  });
}
async function check(){
  const rows=[];
  rows.push(['Node', Number(process.versions.node.split('.')[0])>=18, process.version]);
  const deps = fs.existsSync(path.join(localAgentDir,'node_modules'));
  rows.push(['Dépendances local-agent', deps, deps?'installées':'npm --prefix local-agent install']);
  const ff = bundledFfmpeg();
  const sys = checkBin('ffmpeg');
  rows.push(['FFmpeg', Boolean(ff||sys.ok), ff?`intégré: ${ff}`:(sys.ok?sys.output:'absent')]);
  const lt = fs.existsSync(path.join(localAgentDir,'node_modules','localtunnel'));
  rows.push(['Tunnel localtunnel', lt, lt?'installé':'optionnel, installe les dépendances local-agent']);
  console.log('\nSwapp streaming check');
  console.log('=====================');
  for(const [name,ok,info] of rows) console.log(`${ok?'✅':'❌'} ${name}: ${info}`);
  const live = await getJson('http://127.0.0.1:8081/api/setup/check');
  if(live.ok) console.log('✅ Swapp Local répond:', JSON.stringify(live.json.checks?.account || {}, null, 2));
  else console.log('ℹ️ Swapp Local non lancé:', live.error || 'off');
  const hardFail = rows.some(([,,info],i)=> i<3 && String(info).includes('absent'));
  if(hardFail) process.exitCode = 1;
}
function local(){
  console.log('Démarrage de Swapp Local...');
  const child=spawn(process.platform==='win32'?'npm.cmd':'npm',['--prefix','local-agent','start'],{stdio:'inherit'});
  child.on('exit',code=>process.exit(code||0));
}
function demo(){
  console.log('Mode démonstration local');
  console.log('1) Ouvre http://127.0.0.1:8081');
  console.log('2) Dans OBS: Serveur rtmp://127.0.0.1:1935/live ; clé affichée dans Swapp Local');
  console.log('3) Clique “Démarrer sur Swapp” quand le flux est prêt');
  local();
}
function obs(){
  console.log('\nRéglages OBS recommandés');
  console.log('Serveur : rtmp://127.0.0.1:1935/live');
  console.log('Clé     : celle affichée dans Swapp Local ou /api/oryon/stream-key');
  console.log('Sortie  : 1080p60, 6000-8000 kbps, keyframe 2s');
}
(async()=>{
  if(cmd==='check') return check();
  if(cmd==='local' || cmd==='start') return local();
  if(cmd==='demo') return demo();
  if(cmd==='obs') return obs();
  console.log('Usage: node stream-manager.js check|local|demo|obs');
})();
