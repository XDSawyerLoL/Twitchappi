#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');

const root = __dirname;
const envPath = path.join(root, '.env');
const quickEnvPath = path.join(root, '.env.quickstart');
const localAgentDir = path.join(root, 'local-agent');
const localAgentEnvPath = path.join(localAgentDir, '.env.local');

function parseEnv(text){
  const out = {};
  for(const line of String(text || '').split(/\r?\n/)){
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if(!m) continue;
    let v = m[2] || '';
    if((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
    out[m[1]] = v;
  }
  return out;
}
function writeEnv(file, values){
  const lines = Object.entries(values).map(([k,v]) => `${k}=${String(v ?? '').replace(/\r?\n/g,'\\n')}`);
  fs.writeFileSync(file, lines.join(os.EOL) + os.EOL, 'utf8');
}
function exists(file){ try{return fs.existsSync(file)}catch{return false} }
function checkBin(cmd,args=['--version']){
  try{
    const r=spawnSync(cmd,args,{encoding:'utf8',timeout:5000});
    return { ok:r.status===0 || Boolean(r.stdout || r.stderr), output:String(r.stdout||r.stderr||'').split(/\r?\n/)[0] || '' };
  }catch(e){ return {ok:false, output:e.message}; }
}
function bundledFfmpeg(){
  try { const p = require(path.join(localAgentDir,'node_modules','ffmpeg-static')); return p && fs.existsSync(p) ? p : ''; } catch { return ''; }
}
function localDepsInstalled(){ return exists(path.join(localAgentDir,'node_modules','ffmpeg-static')) && exists(path.join(localAgentDir,'node_modules','node-media-server')); }
function rlAsk(){
  const rl = readline.createInterface({input:process.stdin,output:process.stdout});
  const ask = (q, def='') => new Promise(resolve => rl.question(def ? `${q} (${def}) : ` : `${q} : `, a => resolve(a.trim() || def)));
  ask.close = () => rl.close();
  return ask;
}
async function main(){
  const nonInteractive = process.argv.includes('--yes') || process.argv.includes('-y');
  const localOnly = process.argv.includes('--local-agent');
  const current = exists(envPath) ? parseEnv(fs.readFileSync(envPath,'utf8')) : {};
  const ask = rlAsk();
  console.log('\nSwapp setup wizard');
  console.log('==================');
  console.log(`Dossier : ${root}`);
  console.log(`Node    : ${process.version}`);
  console.log(`OS      : ${process.platform} ${process.arch}`);
  const ff = bundledFfmpeg();
  const sysFf = checkBin('ffmpeg');
  console.log(`FFmpeg  : ${ff ? 'intégré local-agent' : (sysFf.ok ? 'système détecté' : 'non détecté')}`);
  console.log(`Local deps : ${localDepsInstalled() ? 'OK' : 'à installer avec npm --prefix local-agent install'}`);

  if(localOnly){
    const site = nonInteractive ? (process.env.ORYON_SITE_URL || 'https://swapp.tv') : await ask('URL du site Swapp', process.env.ORYON_SITE_URL || 'https://swapp.tv');
    writeEnv(localAgentEnvPath,{ ORYON_SITE_URL:site, ORYON_LOCAL_HTTP_PORT:process.env.ORYON_LOCAL_HTTP_PORT||8081, ORYON_LOCAL_RTMP_PORT:process.env.ORYON_LOCAL_RTMP_PORT||1935, ORYON_LOCAL_TRANSCODE:process.env.ORYON_LOCAL_TRANSCODE||'copy' });
    console.log(`\nConfiguration locale écrite : ${localAgentEnvPath}`);
    ask.close();
    return;
  }

  const values = {
    NODE_ENV: current.NODE_ENV || 'production',
    PUBLIC_BASE_URL: current.PUBLIC_BASE_URL || 'https://swapp.tv',
    APP_URL: current.APP_URL || current.PUBLIC_BASE_URL || 'https://swapp.tv',
    SESSION_SECRET: current.SESSION_SECRET || 'CHANGE_ME_' + Math.random().toString(36).slice(2) + Date.now(),
    SWAPP_ACCOUNT_RECOVERY_SECRET: current.SWAPP_ACCOUNT_RECOVERY_SECRET || 'CHANGE_ME_' + Math.random().toString(36).slice(2) + Date.now(),
    SWAPP_ADMIN_KEY: current.SWAPP_ADMIN_KEY || 'CHANGE_ME_ADMIN_' + Math.random().toString(36).slice(2) + Date.now(),
    TWITCH_REDIRECT_URI: current.TWITCH_REDIRECT_URI || 'https://swapp.tv/twitch_auth_callback',
    ORYON_LIVE_SIGNAL_TIMEOUT_MS: current.ORYON_LIVE_SIGNAL_TIMEOUT_MS || '45000',
    ORYON_NATIVE_RECONNECT_GRACE_MS: current.ORYON_NATIVE_RECONNECT_GRACE_MS || '120000',
    SWAPP_EMAIL_FROM: current.SWAPP_EMAIL_FROM || 'noreply@swapp.tv'
  };
  if(!nonInteractive){
    values.PUBLIC_BASE_URL = await ask('URL publique', values.PUBLIC_BASE_URL);
    values.APP_URL = values.PUBLIC_BASE_URL;
    values.TWITCH_REDIRECT_URI = await ask('Redirect Twitch', values.TWITCH_REDIRECT_URI);
    values.SWAPP_EMAIL_FROM = await ask('Email expéditeur', values.SWAPP_EMAIL_FROM);
    const addResend = await ask('Coller RESEND_API_KEY maintenant ? laisser vide sinon', current.RESEND_API_KEY || '');
    if(addResend) values.RESEND_API_KEY = addResend;
    const keepFirebase = await ask('FIREBASE_SERVICE_KEY_BASE64 déjà configuré chez Hostinger ? oui/non', current.FIREBASE_SERVICE_KEY_BASE64 ? 'oui' : 'oui');
    if(current.FIREBASE_SERVICE_KEY_BASE64 && keepFirebase.toLowerCase().startsWith('o')) values.FIREBASE_SERVICE_KEY_BASE64 = current.FIREBASE_SERVICE_KEY_BASE64;
  }else if(current.RESEND_API_KEY) values.RESEND_API_KEY = current.RESEND_API_KEY;

  writeEnv(quickEnvPath, values);
  if(!exists(envPath)) writeEnv(envPath, values);
  const site = values.PUBLIC_BASE_URL || 'https://swapp.tv';
  writeEnv(localAgentEnvPath,{ ORYON_SITE_URL:site, ORYON_LOCAL_HTTP_PORT:8081, ORYON_LOCAL_RTMP_PORT:1935, ORYON_LOCAL_TRANSCODE:'copy' });

  console.log('\nFichiers générés :');
  console.log(`- ${quickEnvPath}`);
  if(exists(envPath)) console.log(`- ${envPath}`);
  console.log(`- ${localAgentEnvPath}`);
  console.log('\nProchaines commandes :');
  console.log('npm install');
  console.log('npm --prefix local-agent install');
  console.log('npm run stream:check');
  console.log('npm start');
  ask.close();
}
main().catch(e=>{ console.error('Setup impossible:', e.message); process.exit(1); });
