const express = require('express');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

let bundledFfmpeg = null;
try { bundledFfmpeg = require('ffmpeg-static'); } catch (_) { bundledFfmpeg = null; }

const HTTP_PORT = Number(process.env.ORYON_LOCAL_HTTP_PORT || process.env.SWAPP_LOCAL_HTTP_PORT || 8081);
const RTMP_PORT = Number(process.env.ORYON_LOCAL_RTMP_PORT || process.env.SWAPP_LOCAL_RTMP_PORT || 1935);
// A different loopback-only origin is exposed by the public tunnel. Never expose local account/config APIs.
const PUBLIC_HTTP_PORT = Number(process.env.SWAPP_LOCAL_PUBLIC_HTTP_PORT || (HTTP_PORT+1));
const MEDIA_ROOT = process.env.ORYON_LOCAL_MEDIA_ROOT || process.env.SWAPP_LOCAL_MEDIA_ROOT || path.join(process.env.APPDATA || os.homedir(), 'SwappLocal', 'media');
const DEFAULT_KEY = process.env.ORYON_STREAM_KEY || process.env.SWAPP_STREAM_KEY || 'ta-cle-swapp';
const DEFAULT_SWAPP_SITE_URL = process.env.ORYON_SITE_URL || process.env.SWAPP_SITE_URL || 'https://swapp.tv';
const FFMPEG_PATH = process.env.FFMPEG_PATH || (bundledFfmpeg && bundledFfmpeg.replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)) || 'ffmpeg';
const LOCAL_BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;
const TRANSCODE_MODE = String(process.env.ORYON_LOCAL_TRANSCODE || process.env.SWAPP_LOCAL_TRANSCODE || 'copy').toLowerCase();
const TUNNEL_RETRIES = Math.min(2, Math.max(1, Number(process.env.SWAPP_TUNNEL_RETRIES || process.env.ORYON_TUNNEL_RETRIES || 1)));
const CLOUDFLARE_429_COOLDOWN_MS = 30 * 60 * 1000;
const TUNNEL_CHECK_TIMEOUT_MS = Math.max(8000, Number(process.env.SWAPP_TUNNEL_CHECK_TIMEOUT_MS || 30000));

const APPDATA_DIR = process.env.APPDATA || os.homedir();
const CONFIG_DIR = path.join(APPDATA_DIR, 'SwappLocal');
const LEGACY_CONFIG_DIR = path.join(APPDATA_DIR, 'OryonLocal');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const LEGACY_CONFIG_FILE = path.join(LEGACY_CONFIG_DIR, 'config.json');
const BIN_DIR = path.join(CONFIG_DIR, 'bin');
const TUNNEL_COOLDOWN_FILE = path.join(CONFIG_DIR, 'cloudflare-cooldown.json');

fs.mkdirSync(path.join(MEDIA_ROOT, 'live'), { recursive: true });
fs.mkdirSync(BIN_DIR, { recursive: true });

const active = {};
const ffmpegJobs = {};
const events = [];
let publicTunnelInfo = null;
let publishedLiveKey = null;
let lastHeartbeatLive = false;
let cloudflaredProcess = null;
let cloudflaredLastLog = '';
let sshTunnelProcess = null;
let sshTunnelLastLog = '';
let repairingTunnel = false;
let tunnelStartPromise = null;
let directRelayUplink = null;
let cloudflareCooldownUntil = (()=>{try{return Number(JSON.parse(fs.readFileSync(TUNNEL_COOLDOWN_FILE,'utf8')).until)||0}catch(_){return 0}})();
function noteCloudflare429(){
 cloudflareCooldownUntil=Date.now()+CLOUDFLARE_429_COOLDOWN_MS;
 try{fs.writeFileSync(TUNNEL_COOLDOWN_FILE,JSON.stringify({until:cloudflareCooldownUntil}))}catch(e){log('warn','Impossible de mémoriser la pause Cloudflare',{error:e.message})}
 log('warn','Cloudflare refuse les nouveaux tunnels (429). Pause de 30 minutes et essai du secours SSH gratuit.');
}
function tunnelDiagnostics(){return {direct_uplink:directRelayUplink?.getStatus?.()||null,cloudflare_log:cloudflaredLastLog.slice(-1000),ssh_log:sshTunnelLastLog.slice(-1000),cloudflare_retry_after:cloudflareCooldownUntil>Date.now()?new Date(cloudflareCooldownUntil).toISOString():null}}
function isLoopbackPublicUrl(value){try{const u=new URL(value);const h=u.hostname.toLowerCase();return h==='localhost'||h.endsWith('.localhost')||h==='127.0.0.1'||h==='[::1]'}catch(_){return true}}

function log(type, message, data = {}) {
  const entry = { at: new Date().toISOString(), type, message, data };
  events.unshift(entry);
  while (events.length > 260) events.pop();
  console.log(`[Swapp Local] ${type}: ${message}`, data || '');
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function safeKey(value) { return String(value || DEFAULT_KEY).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_KEY; }
function cleanSiteUrl(value){
  let base = String(value || DEFAULT_SWAPP_SITE_URL || '').trim();
  if (!base) return '';
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  return base.replace(/\/$/, '');
}
function loadLocalConfig(){
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) {}
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8'));
    if (legacy && typeof legacy === 'object') {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...legacy, migratedFrom: 'OryonLocal', site_url: cleanSiteUrl(legacy.site_url || DEFAULT_SWAPP_SITE_URL) }, null, 2));
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}
function saveLocalConfig(cfg){
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...loadLocalConfig(), ...cfg }, null, 2));
  return loadLocalConfig();
}
function clearLocalConfig(){ try { fs.unlinkSync(CONFIG_FILE); } catch (_) {} }
function currentConfiguredKey(){ return safeKey(loadLocalConfig().stream_key || DEFAULT_KEY); }
function hlsDir(key = currentConfiguredKey()) { return path.join(MEDIA_ROOT, 'live', safeKey(key)); }
function hlsPath(key = currentConfiguredKey()) { return path.join(hlsDir(key), 'index.m3u8'); }
function hlsUrl(key = currentConfiguredKey()) { return `${LOCAL_BASE_URL}/hls/${encodeURIComponent(safeKey(key))}/index.m3u8`; }
function playerUrl(key = currentConfiguredKey()) { return `${LOCAL_BASE_URL}/player/${encodeURIComponent(safeKey(key))}`; }
function publicPlayerUrl(key = currentConfiguredKey()) {
 if(publicTunnelInfo?.provider==='swapp-direct-hls')return `${publicTunnelInfo.url}/api/oryon/local-relay/${encodeURIComponent(publicTunnelInfo.login)}/player`;
 return publicTunnelInfo?.url ? `${publicTunnelInfo.url}/player/${encodeURIComponent(safeKey(key))}` : '';
}
function publicStatusUrl() {
 if(publicTunnelInfo?.provider==='swapp-direct-hls')return `${publicTunnelInfo.url}/api/oryon/local-relay/${encodeURIComponent(publicTunnelInfo.login)}/state`;
 return publicTunnelInfo?.url ? `${publicTunnelInfo.url}/health` : '';
}
function ffmpegInfo() { return { path: FFMPEG_PATH, bundled: Boolean(bundledFfmpeg), exists: FFMPEG_PATH === 'ffmpeg' ? null : fs.existsSync(FFMPEG_PATH), mode: TRANSCODE_MODE }; }
function listFiles(dir) { try { return fs.readdirSync(dir); } catch (_) { return []; } }
function streamStatus(key = currentConfiguredKey()) {
  const k = safeKey(key);
  const files = listFiles(hlsDir(k));
  return {
    key: k,
    active: Boolean(active[k]),
    ffmpeg_running: Boolean(ffmpegJobs[k]),
    hls_exists: fs.existsSync(hlsPath(k)),
    hls_url: hlsUrl(k),
    hls_path: hlsPath(k),
    hls_files: files,
    started_at: active[k]?.startedAt || null,
    last_seen: active[k]?.lastSeen || null,
    public_player_url: publicPlayerUrl(k),
    public_status_url: publicStatusUrl()
  };
}

function cleanupHls(key) {
  const dir = hlsDir(key);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of listFiles(dir)) {
    if (f.endsWith('.ts') || f.endsWith('.m3u8') || f.endsWith('.tmp')) {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    }
  }
}
function startHlsTransmux(key) {
  const k = safeKey(key);
  if (ffmpegJobs[k]) return;
  const dir = hlsDir(k);
  fs.mkdirSync(dir, { recursive: true });
  cleanupHls(k);
  const input = `rtmp://127.0.0.1:${RTMP_PORT}/live/${k}`;
  const output = hlsPath(k);
  const segmentPattern = path.join(dir, 'seg_%03d.ts');
  const args = ['-hide_banner', '-loglevel', 'warning', '-fflags', 'nobuffer', '-i', input];
  if (TRANSCODE_MODE === 'transcode') args.push('-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-b:a', '128k');
  else args.push('-c:v', 'copy', '-c:a', 'aac', '-ar', '44100', '-b:a', '128k');
  args.push('-f', 'hls', '-hls_time', '2', '-hls_list_size', '8', '-hls_flags', 'delete_segments+append_list+omit_endlist', '-hls_segment_filename', segmentPattern, output);
  log('ffmpeg', 'Démarrage conversion RTMP → HLS', { key: k, input, output, ffmpeg: FFMPEG_PATH });
  const child = spawn(FFMPEG_PATH, args, { windowsHide: true });
  ffmpegJobs[k] = child;
  child.stderr.on('data', d => { const t = String(d).trim(); if (t) log('ffmpeg', t.slice(0, 1200), { key: k }); });
  child.on('error', err => { log('error', 'FFmpeg impossible à lancer', { key: k, error: err.message }); delete ffmpegJobs[k]; });
  child.on('exit', (code, signal) => { log('ffmpeg', 'FFmpeg arrêté', { key: k, code, signal }); delete ffmpegJobs[k]; });
}
function stopHlsTransmux(key) { const k = safeKey(key); if (ffmpegJobs[k]) { try { ffmpegJobs[k].kill('SIGTERM'); } catch (_) {} delete ffmpegJobs[k]; } }

async function waitForHlsReady(key = currentConfiguredKey(), timeoutMs = 45000) {
  const start = Date.now();
  const k = safeKey(key);
  while (Date.now() - start < timeoutMs) {
    const st = streamStatus(k);
    if (st.active && st.hls_exists) return st;
    await sleep(1000);
  }
  return streamStatus(k);
}

const nms = new NodeMediaServer({ logType: 2, rtmp: { port: RTMP_PORT, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 } });
nms.on('prePublish', (_id, streamPath) => {
  const key = safeKey(streamPath.split('/').pop());
  active[key] = { key, streamPath, startedAt: active[key]?.startedAt || new Date().toISOString(), lastSeen: new Date().toISOString() };
  log('rtmp', 'OBS essaie de publier', { streamPath, key });
});
nms.on('postPublish', (_id, streamPath) => {
  const key = safeKey(streamPath.split('/').pop());
  active[key] = { key, streamPath, startedAt: active[key]?.startedAt || new Date().toISOString(), lastSeen: new Date().toISOString() };
  log('rtmp', 'Flux OBS reçu', { streamPath, key });
  setTimeout(() => startHlsTransmux(key), 500);
});
nms.on('donePublish', (_id, streamPath) => {
  const key = safeKey(streamPath.split('/').pop());
  delete active[key];
  stopHlsTransmux(key);
  log('rtmp', 'Flux OBS arrêté', { streamPath, key });
  if (publishedLiveKey === key) {
    publishedLiveKey = null;
    if(directRelayUplink){try{directRelayUplink.stop()}catch(_){} directRelayUplink=null}
    publicTunnelInfo=null;
  }
  setTimeout(() => sendHeartbeatToSwapp(key, false).catch(()=>{}), 250);
});
try { nms.run(); log('system', 'Serveur RTMP lancé', { rtmp: `rtmp://127.0.0.1:${RTMP_PORT}/live`, ffmpeg: ffmpegInfo() }); } catch (e) { log('error', 'RTMP impossible', { error: e.message }); }

function normalizePublicBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(url)) throw new Error('URL publique invalide : elle doit commencer par https://');
  if (isLoopbackPublicUrl(url)) throw new Error('URL locale refusée. Il faut une URL publique HTTPS.');
  return url;
}
function isBlockedTunnelUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'loca.lt' || h.endsWith('.loca.lt') || h.endsWith('.localtunnel.me');
  } catch (_) { return true; }
}
function setManualPublicUrl(url) {
  const normalized = normalizePublicBaseUrl(url);
  if (isBlockedTunnelUrl(normalized)) throw new Error('localtunnel/loca.lt est refusé : il affiche une page de sécurité dans le lecteur et casse le live public. Utilise Cloudflare Tunnel ou le mode automatique.');
  publicTunnelInfo = { url: normalized, startedAt: new Date().toISOString(), provider: 'manual' };
  log('tunnel', 'URL publique manuelle', publicTunnelInfo);
  return publicTunnelInfo;
}
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label || 'Délai dépassé')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function cloudflaredBundledPath() {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, 'bin', exe) : '';
  if (packaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, 'bin', exe);
}
function cloudflaredManagedPath() {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return path.join(BIN_DIR, exe);
}
function cloudflaredDownloadUrl() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'win32' && arch === 'x64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  if (platform === 'win32') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe';
  if (platform === 'darwin' && arch === 'arm64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz';
  if (platform === 'darwin') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
  if (platform === 'linux' && arch === 'arm64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64';
  return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
}
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.download';
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const proto = url.startsWith('https:') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Swapp-Local' } }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return downloadFile(new URL(res.headers.location, url).toString(), dest).then(resolve, reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`Téléchargement refusé (${res.statusCode})`));
      }
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          try { fs.renameSync(tmp, dest); fs.chmodSync(dest, 0o755); } catch (_) {}
          resolve(dest);
        });
      });
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('Téléchargement cloudflared trop long')));
  });
}
async function ensureCloudflaredExecutable() {
  if (process.env.CLOUDFLARED_PATH && fs.existsSync(process.env.CLOUDFLARED_PATH)) return process.env.CLOUDFLARED_PATH;
  const bundled = cloudflaredBundledPath();
  if (fs.existsSync(bundled)) return bundled;
  const managed = cloudflaredManagedPath();
  if (fs.existsSync(managed)) return managed;
  if (process.platform !== 'win32') return 'cloudflared';
  const url = cloudflaredDownloadUrl();
  log('tunnel', 'Téléchargement automatique de Cloudflare Tunnel', { url, dest: managed });
  await downloadFile(url, managed);
  return managed;
}
async function dnsReady(hostname) {
  if (!hostname) return false;
  try { await dns.lookup(hostname); return true; } catch (_) { return false; }
}
async function validatePublicTunnel(url, timeoutMs = TUNNEL_CHECK_TIMEOUT_MS) {
  const base = normalizePublicBaseUrl(url);
  if (isBlockedTunnelUrl(base)) throw new Error('Tunnel localtunnel/loca.lt refusé : page de sécurité non lisible par Swapp.');
  const parsed = new URL(base);
  if(publicTunnelInfo?.provider==='swapp-direct-hls' && publicTunnelInfo.url===base){
   const stateUrl=publicStatusUrl();
   const result=await withTimeout(fetch(stateUrl,{cache:'no-store'}),8000,'Relais SWAPP inaccessible');
   const body=await result.json().catch(()=>({}));
   if(!result.ok||!body.active||!body.segment_count)throw new Error('Relais direct SWAPP inactif ou fragments vidéo manquants');
   return {ok:true,url:base,health:body};
  }
  const start = Date.now();
  let lastErr = '';
  while (Date.now() - start < timeoutMs) {
    try {
      if (parsed.hostname.endsWith('.trycloudflare.com')) {
        const okDns = await dnsReady(parsed.hostname);
        if (!okDns) throw new Error(`DNS pas encore propagé pour ${parsed.hostname}`);
      }
      const r = await withTimeout(fetch(`${base}/health?t=${Date.now()}`, { cache: 'no-store', redirect: 'follow' }), 7000, 'health timeout');
      const text = await r.text();
      if (!r.ok) throw new Error(`health HTTP ${r.status}`);
      if (/localtunnel|You are about to visit|loca\.lt/i.test(text)) throw new Error('page de sécurité localtunnel détectée');
      let j = null;
      try { j = JSON.parse(text); } catch (_) {}
      if (!j?.success) throw new Error('health ne renvoie pas JSON success:true');
      return { ok: true, url: base, health: j };
    } catch (e) {
      lastErr = e.message || String(e);
      await sleep(1500);
    }
  }
  throw new Error(`Tunnel non joignable après ${Math.round(timeoutMs/1000)}s : ${lastErr}`);
}
async function startCloudflaredProviderOnce() {
  const exe = await ensureCloudflaredExecutable();
  cloudflaredLastLog = '';
  return await withTimeout(new Promise((resolve, reject) => {
    const child = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PUBLIC_HTTP_PORT}`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    cloudflaredProcess = child;
    let resolved = false;
    const onData = async buf => {
      const text = String(buf || '');
      cloudflaredLastLog = (cloudflaredLastLog + text).slice(-10000);
      const match = cloudflaredLastLog.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        const candidate = { url: match[0], startedAt: new Date().toISOString(), provider: 'cloudflared', exe };
        log('tunnel', 'URL Cloudflare reçue, validation en cours', candidate);
        try {
          await validatePublicTunnel(candidate.url, TUNNEL_CHECK_TIMEOUT_MS);
          if (child.exitCode !== null || child.signalCode !== null) throw new Error('cloudflared est arrêté avant validation du tunnel');
          publicTunnelInfo = candidate;
          log('tunnel', 'Cloudflare Tunnel validé', publicTunnelInfo);
          resolve(publicTunnelInfo);
        } catch (e) {
          try { child.kill(); } catch (_) {}
          publicTunnelInfo = null;
          cloudflaredProcess = null;
          reject(e);
        }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', err => { if (!resolved) reject(new Error(`cloudflared impossible à lancer : ${err.message}`)); });
    child.on('exit', (code, signal) => {
      if (publicTunnelInfo?.provider === 'cloudflared') publicTunnelInfo = null;
      cloudflaredProcess = null;
      if (!resolved) reject(new Error(`cloudflared arrêté sans URL. Code=${code || ''} Signal=${signal || ''}. ${cloudflaredLastLog.slice(-1200)}`));
    });
  }), 65000, 'Cloudflare Tunnel ne donne pas d’URL valide après 65 secondes').catch(err => {
    if(cloudflaredProcess){try{cloudflaredProcess.kill()}catch(_){}}
    cloudflaredProcess=null;
    publicTunnelInfo=null;
    throw err;
  });
}
async function stopPublicTunnel() {
  if(directRelayUplink){try{directRelayUplink.stop()}catch(_){} directRelayUplink=null}
  if (sshTunnelProcess) { try { sshTunnelProcess.kill(); } catch (_) {} }
  sshTunnelProcess = null;
  if (cloudflaredProcess) { try { cloudflaredProcess.kill(); } catch (_) {} }
  cloudflaredProcess = null;
  publicTunnelInfo = null;
  return { success: true };
}
// Prefer the existing SWAPP hosting over any third-party temporary tunnel.
// OBS/FFmpeg produce HLS locally, and only the media fragments go to swapp.tv
// using the connected user's existing bearer token.
async function trySwappDirectRelay(key){
 const st=streamStatus(key);
 if(!st.active||!st.hls_exists)throw new Error('OBS ne fournit pas encore de fragments HLS. Lance la diffusion OBS avant de publier.');
 const cfg=loadLocalConfig();
 const login=String(cfg.user?.login||'').toLowerCase();
 if(!cfg.token||!/^[a-z0-9_-]{2,48}$/.test(login))throw new Error('Connecte ton compte SWAPP dans l’application pour autoriser la diffusion.');
 const siteUrl=cleanSiteUrl(cfg.site_url||DEFAULT_SWAPP_SITE_URL);
 if(!siteUrl.startsWith('https://'))throw new Error('Le site SWAPP doit utiliser HTTPS.');
 let response;
 try{
  response=await withTimeout(fetch(siteUrl+'/api/oryon/local-relay/capabilities',{cache:'no-store'}),8000,'Site SWAPP indisponible');
 }catch(e){log('error','Relais direct SWAPP non joignable',{error:e.message});throw new Error('Le site SWAPP ne répond pas : '+e.message)}
 const capabilities=await response.json().catch(()=>({}));
 if(!response.ok||!capabilities.success||capabilities.transport!=='swapp-direct-hls'){
  throw new Error('Le relais direct SWAPP est absent sur Hostinger (HTTP '+response.status+'). Il faut déployer la branche master sur swapp.tv avant de lancer OBS.');
 }
 const {startSwappHlsUplink}=require('./swapp-direct-uplink');
 if(directRelayUplink){try{directRelayUplink.stop()}catch(_){} directRelayUplink=null}
 const uploader=startSwappHlsUplink({key,login,siteUrl,token:cfg.token,
  mediaDir:hlsDir(key),fetchFn:fetch,
  isLive:()=>!!streamStatus(key).active,
  onLog:log});
 directRelayUplink=uploader;
 try{
  await uploader.ready;
  if(directRelayUplink!==uploader)throw new Error('Relais SWAPP remplacé');
  publicTunnelInfo={url:siteUrl,startedAt:new Date().toISOString(),provider:'swapp-direct-hls',login};
  log('publish','Relais vidéo direct actif : aucun tunnel externe nécessaire',{url:publicPlayerUrl(key)});
  return publicTunnelInfo;
 }catch(e){
  log('error','Relais direct SWAPP indisponible',{error:e.message});
  if(directRelayUplink===uploader){uploader.stop();directRelayUplink=null}
  throw new Error('Envoi HLS direct vers SWAPP impossible : '+e.message);
 }
}
// Free, no-account SSH tunnel using the OpenSSH client shipped with Windows.
// Only the isolated public video server on port 8082 is exposed.
async function startLocalhostRunProviderOnce(){
 const systemSsh=path.join(process.env.WINDIR||'C:\\Windows','System32','OpenSSH','ssh.exe');
 const ssh=process.env.SWAPP_SSH_PATH || (process.platform==='win32'&&fs.existsSync(systemSsh)?systemSsh:'ssh');
 sshTunnelLastLog='';
 const args=['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=accept-new',
  '-o','ExitOnForwardFailure=yes','-o','ConnectTimeout=15',
  '-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3',
  '-R','80:127.0.0.1:'+PUBLIC_HTTP_PORT,'nokey@localhost.run'];
 return withTimeout(new Promise((resolve,reject)=>{
  const child=spawn(ssh,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  sshTunnelProcess=child;
  let urlFound=false,settled=false;
  const rejectOnce=e=>{if(settled)return;settled=true;reject(e)};
  const readLog=async buf=>{
   sshTunnelLastLog=(sshTunnelLastLog+String(buf||'')).slice(-9000);
   if(urlFound||settled)return;
   const matches=sshTunnelLastLog.match(/https:\/\/(?:[a-z0-9-]+\.)+(?:lhr\.life|localhost\.run|lhr\.rocks)/gi);
   if(!matches?.length)return;
   const url=matches[0];
   urlFound=true;
   const candidate={url,startedAt:new Date().toISOString(),provider:'localhost-run'};
   log('tunnel','Secours HTTPS localhost.run reçu; validation du lecteur public',candidate);
   try{
    await validatePublicTunnel(url,TUNNEL_CHECK_TIMEOUT_MS);
    if(child.exitCode!==null||child.signalCode!==null)throw new Error('Tunnel SSH arrêté avant validation');
    publicTunnelInfo=candidate;
    settled=true;
    resolve(candidate);
   }catch(e){rejectOnce(e)}
  };
  child.stdout.on('data',readLog);
  child.stderr.on('data',readLog);
  child.on('error',e=>rejectOnce(new Error('Secours SSH indisponible: '+e.message+'. Vérifie que le client OpenSSH Windows est installé.')));
  child.on('exit',(code,signal)=>{
   if(sshTunnelProcess===child){
     sshTunnelProcess=null;
     if(publicTunnelInfo?.provider==='localhost-run')publicTunnelInfo=null;
   }
   if(!settled)rejectOnce(new Error('Secours localhost.run arrêté sans tunnel valide (code '+code+', signal '+signal+'): '+sshTunnelLastLog.slice(-850)));
  });
 }),60000,'Secours SSH localhost.run sans URL publique après 60 secondes').catch(e=>{
  if(sshTunnelProcess){try{sshTunnelProcess.kill()}catch(_){}}
  sshTunnelProcess=null;
  if(publicTunnelInfo?.provider==='localhost-run')publicTunnelInfo=null;
  throw e;
 });
}
async function actuallyStartPublicTunnel(provider,key=currentConfiguredKey()){
 const requested=String(provider||'auto').toLowerCase();
 if(requested==='localtunnel'||requested==='loca.lt')
  throw new Error('localtunnel/loca.lt reste désactivé: sa page de sécurité bloque le lecteur.');
 if(publicTunnelInfo?.url){
  try{await validatePublicTunnel(publicTunnelInfo.url,9000);return publicTunnelInfo}
  catch(e){log('warn','Tunnel précédent inaccessible, changement de tunnel',{error:e.message});await stopPublicTunnel()}
 }
 const failures=[];
 if(requested==='auto'||requested==='swapp-direct'){
  // Do not fall back automatically to unstable Quick Tunnels that repeatedly
  // respond with 429 or third-party interstitial HTML.
  return await trySwappDirectRelay(key);
 }
 if(requested==='auto'||requested==='cloudflared'||requested==='cloudflare'){
  if(cloudflareCooldownUntil>Date.now()){
   failures.push('Cloudflare 429: pause active jusqu’à '+new Date(cloudflareCooldownUntil).toLocaleTimeString('fr-FR'));
  }else{
   for(let i=1;i<=TUNNEL_RETRIES;i++){
    try{
     log('tunnel','Demande Cloudflare temporaire ('+i+'/'+TUNNEL_RETRIES+')');
     return await startCloudflaredProviderOnce();
    }catch(e){
     failures.push('Cloudflare: '+e.message);
     log('error','Création Cloudflare échouée',{error:e.message});
     if(/(?:status\s*429|\bhttp\s*429\b|too many requests)/i.test(e.message)){
      noteCloudflare429();break;
     }
     if(i<TUNNEL_RETRIES)await sleep(3500);
    }
   }
  }
 }
 if(requested==='auto'||requested==='localhost-run'||requested==='ssh'){
  try{
   log('tunnel','Tentative de secours gratuit localhost.run via SSH Windows');
   return await startLocalhostRunProviderOnce();
  }catch(e){failures.push('Secours SSH: '+e.message);log('error','Tunnel SSH de secours impossible',{error:e.message})}
 }
 throw new Error('Aucun tunnel public opérationnel. '+failures.join(' | ')+
  '. Le secours localhost.run est gratuit mais soumis à des limites de débit.');
}
async function startPublicTunnel(provider='auto',key=currentConfiguredKey()){
 if(tunnelStartPromise)return tunnelStartPromise;
 const pending=actuallyStartPublicTunnel(provider,key);
 tunnelStartPromise=pending;
 try{return await pending}finally{if(tunnelStartPromise===pending)tunnelStartPromise=null}
}
async function ensureValidTunnelForLive(key) {
  if (!publicTunnelInfo?.url) return await startPublicTunnel('auto',key);
  try { await validatePublicTunnel(publicTunnelInfo.url, 9000); return publicTunnelInfo; }
  catch (e) {
    log('warn', 'Tunnel mort pendant live, refresh automatique', { error: e.message });
    await stopPublicTunnel();
    const info = await startPublicTunnel('auto',key);
    if (key) await registerPublicUrlOnSwapp({ key });
    return info;
  }
}
// Health alone is not a sufficient signal: the remote video manifest and segments
// must both be available from the *public* tunnel before announcing live.
async function validatePublicVideo(key) {
  const k=safeKey(key);
  const manifestUrl=publicTunnelInfo.provider==='swapp-direct-hls'
   ? `${publicTunnelInfo.url}/api/oryon/local-relay/${encodeURIComponent(publicTunnelInfo.login)}/index.m3u8`
   : `${publicTunnelInfo.url}/hls/${encodeURIComponent(k)}/index.m3u8`;
  const response=await withTimeout(fetch(manifestUrl,{cache:'no-store'}),10000,'Délai playlist HLS publique dépassé');
  if(!response.ok)throw new Error(`Playlist HLS inaccessible depuis Internet (HTTP ${response.status})`);
  const playlist=await response.text();
  if(!playlist.startsWith('#EXTM3U')||!playlist.includes('#EXTINF'))throw new Error('Playlist HLS publique vide ou invalide');
  const segment=playlist.split(/\r?\n/).map(line=>line.trim()).find(line=>line&&!line.startsWith('#')&&/^[A-Za-z0-9_.-]+\.ts$/.test(line));
  if(!segment)throw new Error('Aucun segment vidéo HLS trouvé dans la playlist publique');
  const segmentResponse=await withTimeout(fetch(new URL(segment,manifestUrl),{method:'HEAD',cache:'no-store'}),10000,'Délai segment HLS public dépassé');
  if(!segmentResponse.ok)throw new Error(`Segment vidéo inaccessible depuis Internet (HTTP ${segmentResponse.status})`);
  return true;
}
async function registerPublicUrlOnSwapp({ siteUrl, key }) {
  const cfg = loadLocalConfig();
  const base = cleanSiteUrl(siteUrl || cfg.site_url || DEFAULT_SWAPP_SITE_URL);
  if (!base || !/^https?:\/\//i.test(base)) throw new Error('URL du site Swapp invalide');
  if (!publicTunnelInfo?.url) throw new Error('Tunnel public non lancé');
  await validatePublicTunnel(publicTunnelInfo.url, 12000);
  await validatePublicVideo(key);
  const player = publicPlayerUrl(key);
  if (!player || isLoopbackPublicUrl(player)) throw new Error('URL publique invalide : le tunnel n’a pas fourni d’adresse publique.');
  if (isBlockedTunnelUrl(player)) throw new Error('URL loca.lt refusée : elle affiche une page de sécurité et casse le lecteur.');
  const payload = { stream_key: safeKey(key), public_base_url: publicTunnelInfo.url, player_url: player, status_url: publicStatusUrl(), provider: publicTunnelInfo.provider || 'cloudflared' };
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
  const r = await fetch(`${base}/api/oryon/local-agent/register-public-url`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || `Swapp a refusé l’enregistrement (${r.status})`);
  publishedLiveKey = safeKey(key);
  log('publish', 'Live envoyé à Swapp', { siteUrl: base, player_url: payload.player_url });
  return { success: true, site_url: base, ...payload, response: j };
}
async function sendHeartbeatToSwapp(key, live){
  try {
    const cfg = loadLocalConfig();
    if(!cfg.token && !cfg.stream_key) return;
    const k = safeKey(key || cfg.stream_key || DEFAULT_KEY);
    if (live) await ensureValidTunnelForLive(k);
    const base = cleanSiteUrl(cfg.site_url || DEFAULT_SWAPP_SITE_URL);
    const headers = { 'Content-Type':'application/json' };
    if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
    const body = JSON.stringify({ stream_key:k, live_active:!!live, player_url:live?publicPlayerUrl(k):'', status_url:live?publicStatusUrl():'' });
    const r = await fetch(`${base}/api/oryon/local-agent/heartbeat`, { method:'POST', headers, body });
    const j = await r.json().catch(()=>({}));
    if(!r.ok || !j.success) throw new Error(j.error || `Heartbeat refusé (${r.status})`);
    lastHeartbeatLive = !!live;
    return j;
  } catch(e) { log('error', 'Heartbeat Swapp impossible', { error: e.message }); return null; }
}
async function repairTunnelNow(key = currentConfiguredKey()) {
  if (repairingTunnel) return { success:false, error:'Réparation déjà en cours.' };
  repairingTunnel = true;
  try {
    // Keep an already valid URL; repair only if validation fails.
    await startPublicTunnel('auto',key);
    const st=streamStatus(key);
    if(!st.active||!st.hls_exists){
      log('tunnel','Tunnel réparé : en attente du signal OBS avant publication');
      return {success:true,tunnel:publicTunnelInfo,register:null,waiting_for_obs:true};
    }
    const reg = await registerPublicUrlOnSwapp({ key });
    const hb = await sendHeartbeatToSwapp(key, true);
    if(!hb)throw new Error('Lecteur public accessible, mais le statut du live SWAPP reste non confirmé.');
    return { success:true, tunnel:publicTunnelInfo, register:reg };
  } finally { repairingTunnel = false; }
}

const app = express();
// Public routes deliberately live on a separate HTTP listener. Quick Tunnel otherwise
// exposes /api/account/status (stream key), tunnel controls and pairing callback.
const publicApp = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
const hlsStatic = express.static(path.join(MEDIA_ROOT, 'live'), {
  fallthrough: true,
  setHeaders(res, filePath) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    } else if (filePath.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=10');
    }
  }
});
app.use('/hls',hlsStatic);
publicApp.use('/hls',hlsStatic);
const hlsJsPath=path.join(__dirname,'node_modules','hls.js','dist','hls.min.js');
function serveHlsJs(_req,res){res.sendFile(hlsJsPath)}
app.get('/assets/hls.min.js',serveHlsJs);
publicApp.get('/assets/hls.min.js',serveHlsJs);
publicApp.get('/health',(_req,res)=>res.json({success:true,name:'SWAPP Public Video'}));

function pageHtml(key){
  const cfg = loadLocalConfig();
  const site = cleanSiteUrl(cfg.site_url || DEFAULT_SWAPP_SITE_URL);
  const login = cfg.user?.login || '';
  const purl = playerUrl(key);
  const rtmp = `rtmp://127.0.0.1:${RTMP_PORT}/live`;
  return String.raw`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Swapp Local</title><style>
:root{color-scheme:dark;background:#070914;color:#f6f7fb;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#3b1b7a55,transparent 35%),#070914}.wrap{max-width:1160px;margin:auto;padding:26px}.card{border:1px solid #262b42;background:#101423cc;border-radius:24px;padding:22px;box-shadow:0 20px 60px #0008}.hero{display:grid;grid-template-columns:.92fr 1.08fr;gap:18px}.tag{display:inline-flex;padding:7px 10px;border-radius:999px;background:#7c3aed22;border:1px solid #7c3aed66;color:#d7c6ff;font-size:13px}.btn{border:0;border-radius:14px;padding:13px 16px;background:#7c3aed;color:white;font-weight:900;cursor:pointer}.btn.secondary{background:#1d2335}.btn.good{background:#18bf72}.btn.warn{background:#b45309}.btn.big{font-size:18px;padding:16px 22px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.small{color:#aab3c7;font-size:14px;line-height:1.5}.player{aspect-ratio:16/9;background:#02040a;border-radius:22px;overflow:hidden;border:1px solid #30364f}iframe{width:100%;height:100%;border:0;overflow:hidden}input{width:100%;background:#070914;border:1px solid #30364f;color:white;border-radius:12px;padding:12px;margin:6px 0}.status{margin-top:12px;padding:12px;border:1px solid #30364f;border-radius:14px;background:#070914;color:#cfe5ff;font-size:14px;white-space:pre-wrap}.code{background:#050710;border:1px solid #30364f;border-radius:14px;padding:13px;word-break:break-all;font-family:ui-monospace,monospace;color:#cfe5ff}.muted{color:#aab3c7}.ok{color:#86efac}.warnText{color:#fde68a}.hidden{display:none!important}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.center{text-align:center}.topConnect{margin-bottom:18px}.previewHint{margin-top:10px}.mini{font-size:12px;color:#7e8aa3}@media(max-width:900px){.hero,.steps{grid-template-columns:1fr}.wrap{padding:14px}}</style></head><body><div class="wrap">
<section class="card topConnect"><span class="tag">Swapp Local</span><h1>Connecte ton compte Swapp</h1><p class="small">L’application récupère ta clé de stream et publie ton direct automatiquement. Aucun terminal à ouvrir.</p><label class="small">Adresse du site Swapp</label><input id="oryonSite" value="${site}"><div class="row"><button class="btn big" onclick="connectWithBrowser()">Connecter avec mon compte Swapp</button><button class="btn secondary" onclick="disconnectAccount()">Déconnecter</button><button class="btn secondary" onclick="loadAccount()">Actualiser</button></div><div id="accountStatus" class="status">${login ? '✅ Connecté à '+login : 'Non connecté'}</div></section>
<div class="hero"><section class="card"><h1>Diffuser avec OBS</h1><p class="small">Laisse cette app ouverte. Dans OBS, utilise le serveur et la clé ci-dessous.</p><h3>Serveur OBS</h3><div class="code" id="rtmp">${rtmp}</div><h3>Clé de stream</h3><input id="key" value="${key}" oninput="updateKey()"><div class="row"><button class="btn secondary" onclick="copy('rtmp')">Copier serveur</button><button class="btn secondary" onclick="copyKey()">Copier clé</button></div><p class="small">OBS → Paramètres → Diffusion → Service personnalisé. Désactive la vidéo multipiste.</p><div id="simpleStatus" class="status">En attente d’OBS.</div><div class="row"><button class="btn good big" onclick="goLive()">Démarrer sur Swapp</button><button class="btn warn" onclick="repairTunnel()">Réparer le tunnel</button><button class="btn secondary" onclick="stopTunnel()">Arrêter</button></div></section><section class="card"><h2>Prévisualisation locale</h2><div class="player"><iframe id="frame" src="${purl}"></iframe></div><p class="small previewHint">Aperçu local. Le public lit la vidéo directement sur swapp.tv : aucun tunnel temporaire n’est nécessaire.</p></section></div>
<div class="steps"><div class="card"><h3>1. Connecte</h3><p class="small">Swapp Local récupère ta clé.</p></div><div class="card"><h3>2. Lance OBS</h3><p class="small">Serveur personnalisé + clé Swapp.</p></div><div class="card"><h3>3. Démarre</h3><p class="small">La vidéo OBS est envoyée en HTTPS vers SWAPP, puis publiée sur ta chaîne.</p></div></div>
<details class="card" style="margin-top:16px" open><summary class="small" style="cursor:pointer">Diagnostic technique</summary><div id="diag" class="status">Diagnostic en cours…</div><div id="publicUrl" class="status">Tunnel non lancé.</div></details>
</div><script>
function copy(id){navigator.clipboard.writeText(document.getElementById(id).textContent)}function copyKey(){navigator.clipboard.writeText(document.getElementById('key').value)}function currentKey(){return document.getElementById('key').value.replace(/[^a-zA-Z0-9_-]/g,'')||'${DEFAULT_KEY}'}
function updateKey(){const u='/player/'+encodeURIComponent(currentKey());const f=document.getElementById('frame'); if(!f.src.endsWith(u)) f.src=u; refreshDiag();}
async function loadAccount(){try{const r=await fetch('/api/account/status?t='+Date.now());const d=await r.json();if(d.connected){document.getElementById('key').value=d.stream_key;document.getElementById('oryonSite').value=d.site_url||document.getElementById('oryonSite').value;document.getElementById('accountStatus').innerHTML='✅ Connecté à <b>'+(d.user?.login||'Swapp')+'</b>';updateKey();return true}else{document.getElementById('accountStatus').textContent='Non connecté';return false}}catch(e){return false}}
async function connectWithBrowser(){const box=document.getElementById('accountStatus');const raw=(document.getElementById('oryonSite').value||'').trim();const site=/^https?:\/\//i.test(raw)?raw.replace(/\/$/,''):'https://'+raw.replace(/\/$/,'');document.getElementById('oryonSite').value=site;const cb='http://127.0.0.1:${HTTP_PORT}/api/account/browser-callback';const url=site+'/api/oryon/local-agent/browser-connect?callback='+encodeURIComponent(cb);box.textContent='Ouverture du navigateur…';window.open(url,'_blank');let attempts=0;const timer=setInterval(async()=>{attempts++;if(await loadAccount()){clearInterval(timer);box.innerHTML='✅ Compte connecté. Tu peux lancer OBS.'}if(attempts>120){clearInterval(timer);box.textContent='Connexion non confirmée. Vérifie que tu es connecté à Swapp puis réessaie.'}},1000)}
async function disconnectAccount(){await fetch('/api/account/disconnect',{method:'POST'});document.getElementById('accountStatus').textContent='Non connecté'}
async function sendHeartbeat(live){try{const key=currentKey();const tun=await fetch('/api/tunnel/status?key='+encodeURIComponent(key)+'&t='+Date.now()).then(r=>r.json()).catch(()=>({}));await fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,live_active:!!live,player_url:tun.player_url||'',status_url:tun.status_url||''})})}catch(e){}}
async function refreshDiag(){try{const r=await fetch('/api/status?key='+encodeURIComponent(currentKey())+'&t='+Date.now());const d=await r.json();const st=d.stream||{};const ok=st.active&&st.ffmpeg_running&&st.hls_exists;document.getElementById('simpleStatus').innerHTML=ok?'✅ Flux prêt. Tu peux démarrer sur Swapp.':(st.active?'⏳ Flux reçu. Préparation…':'En attente d’OBS.'); const diag=document.getElementById('diag'); if(diag) diag.innerHTML=(ok?'Flux prêt.':'')+'\nOBS actif: '+!!st.active+'\nFFmpeg: '+!!st.ffmpeg_running+'\nHLS: '+!!st.hls_exists+'\nTunnel: '+(st.public_player_url||'non publié'); if(window.__publishedLiveKey){ await sendHeartbeat(ok); }}catch(e){document.getElementById('simpleStatus').textContent='Diagnostic indisponible.'}}
async function goLive(){const box=document.getElementById('publicUrl');box.textContent='Vérification OBS → envoi vidéo HTTPS vers SWAPP → publication du direct…';try{const r=await fetch('/api/go-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),site_url:document.getElementById('oryonSite').value.trim()})});const d=await r.json();if(!d.success)throw new Error([d.error||'Publication impossible',(d.ssh_log||d.cloudflare_log||d.log||'').slice(-650)].filter(Boolean).join('\n'));window.__publishedLiveKey=currentKey(); box.textContent='✅ Live en ligne sur ta chaîne Swapp.\n'+(d.player_url||'')+'\nRelais : '+(d.tunnel?.provider==='swapp-direct-hls'?'SWAPP HTTPS direct':(d.tunnel?.provider||'indisponible')); document.getElementById('simpleStatus').textContent='✅ Live en ligne sur Swapp.'; await sendHeartbeat(true)}catch(e){box.textContent='❌ '+(e.message||e)}}
async function repairTunnel(){const box=document.getElementById('publicUrl');box.textContent='Vérification du relais vidéo direct SWAPP…';try{const r=await fetch('/api/tunnel/repair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),site_url:document.getElementById('oryonSite').value.trim()})});const d=await r.json();if(!d.success)throw new Error([d.error||'Réparation impossible',(d.ssh_log||d.cloudflare_log||d.log||'').slice(-650)].filter(Boolean).join('\n'));box.textContent=d.waiting_for_obs?'✅ Relais opérationnel ('+(d.tunnel?.provider||'auto')+'). Lance OBS puis clique sur Démarrer sur Swapp.':'✅ Relais vérifié ('+(d.tunnel?.provider||'auto')+').\n'+(d.register?.player_url||d.tunnel?.url||'');if(!d.waiting_for_obs)window.__publishedLiveKey=currentKey();}catch(e){box.textContent='❌ '+(e.message||e)}}
async function stopTunnel(){try{await sendHeartbeat(false); window.__publishedLiveKey=null; await fetch('/api/tunnel/stop',{method:'POST'});document.getElementById('publicUrl').textContent='Diffusion arrêtée.'}catch(e){document.getElementById('publicUrl').textContent='Erreur: '+e.message}}
setInterval(refreshDiag,3000);loadAccount();refreshDiag();
</script></body></html>`;
}

app.get('/', (req, res) => { const cfg = loadLocalConfig(); const key = safeKey(req.query.key || cfg.stream_key || DEFAULT_KEY); res.type('html').send(pageHtml(key)); });
app.get('/api/setup/check', (_req, res) => {
  const cfg = loadLocalConfig();
  res.json({ success:true, app:'Swapp Local', version:'1.0.5', site_url:cleanSiteUrl(cfg.site_url || DEFAULT_SWAPP_SITE_URL), account:cfg.user || null, connected:Boolean(cfg.token && cfg.stream_key), rtmp:`rtmp://127.0.0.1:${RTMP_PORT}/live`, stream_key:cfg.stream_key || DEFAULT_KEY, ffmpeg:ffmpegInfo(), media_root:MEDIA_ROOT, tunnel:publicTunnelInfo, localtunnel_disabled:true });
});
app.get('/api/account/browser-callback', (req, res) => {
  try {
    if (String(req.query.ok || '') !== '1') return res.status(400).send('Connexion Swapp refusée.');
    const token = String(req.query.token || '').trim();
    const stream_key = safeKey(req.query.stream_key || '');
    const login = String(req.query.login || '').trim();
    const display_name = String(req.query.display_name || login).trim();
    const site_url = cleanSiteUrl(req.query.site_url || DEFAULT_SWAPP_SITE_URL);
    if (!token || !stream_key || !login) return res.status(400).send('Réponse Swapp incomplète.');
    saveLocalConfig({ site_url, token, stream_key, user: { login, display_name }, connectedAt: new Date().toISOString(), authMode: 'browser' });
    res.type('html').send('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Swapp Local connecté</title><style>body{font-family:system-ui;background:#070914;color:white;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:560px;border:1px solid #30364f;background:#101423;border-radius:22px;padding:24px;text-align:center}</style></head><body><div class="box"><h1>Swapp Local connecté ✅</h1><p>Compte lié : <b>'+login+'</b></p><p>Tu peux revenir dans l’application Swapp Local.</p><script>setTimeout(function(){try{window.close()}catch(e){}},1800)<\/script></div></body></html>');
  } catch(e) { res.status(500).send('Erreur Swapp Local: ' + e.message); }
});
app.get('/api/account/status', (_req, res) => { const cfg = loadLocalConfig(); res.json({ success:true, connected: Boolean(cfg.token && cfg.stream_key), site_url: cleanSiteUrl(cfg.site_url || DEFAULT_SWAPP_SITE_URL), user: cfg.user || null, stream_key: cfg.stream_key || DEFAULT_KEY }); });
app.post('/api/account/connect', async (req, res) => {
  try {
    const base = cleanSiteUrl(req.body?.site_url || DEFAULT_SWAPP_SITE_URL);
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');
    if (!base || !/^https?:\/\//i.test(base)) return res.status(400).json({ success:false, error:'Adresse du site Swapp invalide.' });
    if (!login || !password) return res.status(400).json({ success:false, error:'Pseudo et mot de passe requis.' });
    const r = await fetch(`${base}/api/oryon/local-agent/connect`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ login, password, app:'Swapp Local' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) return res.status(r.status || 500).json({ success:false, error:j.error || 'Connexion Swapp refusée.' });
    const cfg = saveLocalConfig({ site_url: base, token: j.token, stream_key: j.stream_key, user: j.user, connectedAt: new Date().toISOString() });
    return res.json({ success:true, site_url: cfg.site_url, token: cfg.token, stream_key: cfg.stream_key, user: cfg.user });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
});
app.post('/api/account/disconnect', (_req, res) => { clearLocalConfig(); res.json({ success:true }); });

app.post('/api/go-live', async (req, res) => {
  const cfg = loadLocalConfig();
  const key = safeKey(req.body?.key || cfg.stream_key || DEFAULT_KEY);
  try {
    if (!cfg.token) return res.status(401).json({ success:false, error:'Connecte d’abord ton compte Swapp dans l’application.' });
    const st = await waitForHlsReady(key, 45000);
    if (!st.active) return res.status(400).json({ success:false, error:`Aucun flux OBS détecté. Mets OBS sur rtmp://127.0.0.1:${RTMP_PORT}/live avec ta clé Swapp.` });
    if (!st.hls_exists) return res.status(400).json({ success:false, error:'OBS est détecté, mais le player local n’est pas encore prêt. Attends 5 à 15 secondes puis réessaie.' });
    await startPublicTunnel('auto',key);
    const result = await registerPublicUrlOnSwapp({ siteUrl: req.body?.site_url, key });
    const heartbeat=await sendHeartbeatToSwapp(key, true);
    if(!heartbeat)throw new Error('Le tunnel vidéo fonctionne, mais SWAPP ne confirme pas le statut En direct. Vérifie ta connexion au compte.');
    return res.json({ success:true, ...result, stream: streamStatus(key), tunnel: publicTunnelInfo });
  } catch (e) {
    log('error', 'Go live auto impossible', { error: e.message });
    return res.status(500).json({ success:false, error:e.message, stream: streamStatus(key), tunnel: publicTunnelInfo, ...tunnelDiagnostics() });
  }
});
app.post('/api/tunnel/start', async (req, res) => {
  try { const key = safeKey(req.body?.key || currentConfiguredKey()); const info = await startPublicTunnel(req.body?.provider || 'auto'); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl(), ...tunnelDiagnostics() }); }
  catch(e) { log('error', 'Tunnel impossible', { error: e.message }); res.status(500).json({ success:false, error:e.message, ...tunnelDiagnostics() }); }
});
app.post('/api/tunnel/manual', async (req, res) => { try { const key = safeKey(req.body?.key || currentConfiguredKey()); const info = setManualPublicUrl(req.body?.url); await validatePublicTunnel(info.url, 12000); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl() }); } catch(e) { res.status(400).json({ success:false, error:e.message }); } });
app.post('/api/tunnel/repair', async (req, res) => { try { const key = safeKey(req.body?.key || currentConfiguredKey()); const out = await repairTunnelNow(key); res.json(out); } catch(e) { res.status(500).json({ success:false, error:e.message, ...tunnelDiagnostics() }); } });
app.post('/api/tunnel/stop', async (_req, res) => { try { await sendHeartbeatToSwapp(publishedLiveKey || currentConfiguredKey(), false); publishedLiveKey = null; await stopPublicTunnel(); res.json({ success:true }); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });
app.get('/api/tunnel/status', async (req, res) => {
  const key = safeKey(req.query.key || currentConfiguredKey());
  let valid = false;
  let error = '';
  if (publicTunnelInfo?.url) {
    try { await validatePublicTunnel(publicTunnelInfo.url, 5000); valid = true; } catch(e) { error = e.message; }
  }
  res.json({ success:true, active:Boolean(publicTunnelInfo?.url), valid, error, tunnel:publicTunnelInfo, player_url:valid?publicPlayerUrl(key):'', status_url:valid?publicStatusUrl():'', ...tunnelDiagnostics() });
});
app.post('/api/publish-to-oryon', async (req, res) => { try { const cfg = loadLocalConfig(); const key = safeKey(req.body?.key || cfg.stream_key || DEFAULT_KEY); if (!cfg.token) return res.status(401).json({ success:false, error:'Connecte d’abord ton compte Swapp.' }); if (!publicTunnelInfo?.url) await startPublicTunnel('auto',key); const result = await registerPublicUrlOnSwapp({ siteUrl:req.body?.site_url, key }); res.json(result); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });
app.post('/api/heartbeat', async (req, res) => {
  try {
    const cfg = loadLocalConfig();
    if(!cfg.token && !cfg.stream_key) return res.status(401).json({ success:false, error:'Compte Swapp non connecté.' });
    const key = safeKey(req.body?.key || cfg.stream_key || DEFAULT_KEY);
    const live = !!req.body?.live_active;
    const j = await sendHeartbeatToSwapp(key, live);
    if(!j)return res.status(502).json({success:false,error:'Heartbeat vers SWAPP non confirmé'});
    return res.json({ success:true, live, response:j });
  } catch(e) { return res.status(500).json({ success:false, error:e.message }); }
});

app.get('/health', (_req, res) => res.json({ success:true, name:'Swapp Local', rtmp:`rtmp://127.0.0.1:${RTMP_PORT}/live`, local_base_url:LOCAL_BASE_URL, media_root:MEDIA_ROOT, ffmpeg:ffmpegInfo(), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), tunnel:publicTunnelInfo, account: loadLocalConfig().user || null, localtunnel_disabled:true }));
app.get('/api/status', (req, res) => res.json({ success:true, ffmpeg:ffmpegInfo(), media_root:MEDIA_ROOT, stream:streamStatus(req.query.key || currentConfiguredKey()), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), events }));
function servePlayer(req, res) {
  const key = safeKey(req.params.key);
  // Relative path is essential: remote viewers must request HLS via trycloudflare.com,
  // not 127.0.0.1 on their own computers.
  const hls = `/hls/${encodeURIComponent(key)}/index.m3u8`;
  // Serve the same responsive player to the local preview and external iframe.
  // Keep HLS URLs relative so Cloudflare routes requests to this streamer's PC.
  // The token is a literal, never executable HTML: key was sanitized by safeKey.
  const html = fs.readFileSync(path.join(__dirname,'player.html'),'utf8')
    .replace('__SWAPP_HLS_SRC__',JSON.stringify(hls));
  res.type('html').send(html);
}
app.get('/player/:key',servePlayer);
publicApp.get('/player/:key',servePlayer);
publicApp.use((_req,res)=>res.status(404).json({success:false,error:'Route publique non autorisée'}));

setInterval(async () => {
  const key = publishedLiveKey || currentConfiguredKey();
  const st = streamStatus(key);
  if (publishedLiveKey && st.active && st.hls_exists) {
    if (!repairingTunnel) {
      try { await ensureValidTunnelForLive(key); await sendHeartbeatToSwapp(key, true); }
      catch (e) { log('error', 'Surveillance tunnel/live en échec', { error:e.message }); }
    }
  }
}, 15000);

app.listen(HTTP_PORT,'127.0.0.1', () => { console.log(`[Swapp Local] Interface: http://127.0.0.1:${HTTP_PORT}`); console.log(`[Swapp Local] OBS server: rtmp://127.0.0.1:${RTMP_PORT}/live`); });
publicApp.listen(PUBLIC_HTTP_PORT,'127.0.0.1',()=>{log('system','Origine vidéo publique distincte lancée',{url:`http://127.0.0.1:${PUBLIC_HTTP_PORT}`})});
