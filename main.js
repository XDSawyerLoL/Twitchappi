const express = require('express');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns').promises;
const https = require('https');
const { spawn } = require('child_process');

const localtunnel = null; // désactivé volontairement: loca.lt casse les lecteurs intégrés
let bundledFfmpeg = null;
try { bundledFfmpeg = require('ffmpeg-static'); } catch (_) { bundledFfmpeg = null; }

const HTTP_PORT = Number(process.env.ORYON_LOCAL_HTTP_PORT || 8081);
const RTMP_PORT = Number(process.env.ORYON_LOCAL_RTMP_PORT || 1935);
const MEDIA_ROOT = process.env.ORYON_LOCAL_MEDIA_ROOT || path.join(__dirname, 'media');
const DEFAULT_KEY = process.env.ORYON_STREAM_KEY || 'ta-cle-swapp';
const DEFAULT_ORYON_SITE_URL = process.env.SWAPP_SITE_URL || process.env.ORYON_SITE_URL || 'https://swapp.tv';
function cleanSiteUrl(value){
  let base = String(value || DEFAULT_ORYON_SITE_URL || '').trim();
  if (!base) return '';
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  return base.replace(/\/$/, '');
}
const FFMPEG_PATH = process.env.FFMPEG_PATH || bundledFfmpeg || 'ffmpeg';
const CLOUDFLARED_PATH = process.env.CLOUDFLARED_PATH || 'cloudflared';
const LOCAL_BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;
const TRANSCODE_MODE = String(process.env.ORYON_LOCAL_TRANSCODE || 'copy').toLowerCase();

const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), 'SwappLocal');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
function loadLocalConfig(){ try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) { return {}; } }
function saveLocalConfig(cfg){ fs.mkdirSync(CONFIG_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...loadLocalConfig(), ...cfg }, null, 2)); return loadLocalConfig(); }
function clearLocalConfig(){ try { fs.unlinkSync(CONFIG_FILE); } catch (_) {} }

fs.mkdirSync(path.join(MEDIA_ROOT, 'live'), { recursive: true });

const active = {};
const ffmpegJobs = {};
const events = [];
let publicTunnel = null;
let publicTunnelInfo = null;
let publishedLiveKey = null;
let lastHeartbeatLive = false;
let cloudflaredProcess = null;
let cloudflaredLastLog = '';
let tunnelRetryBlockedUntil = 0;
let lastTunnelFailure = '';
const QUICK_TUNNEL_RATE_LIMIT_COOLDOWN_MS = Number(process.env.SWAPP_TUNNEL_RATE_LIMIT_COOLDOWN_MS || 10 * 60 * 1000);

function log(type, message, data = {}) {
  const entry = { at: new Date().toISOString(), type, message, data };
  events.unshift(entry);
  while (events.length > 200) events.pop();
  console.log(`[Swapp Local] ${type}: ${message}`, data || '');
}
function safeKey(value) { return String(value || DEFAULT_KEY).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_KEY; }
function currentConfiguredKey(){ return safeKey(loadLocalConfig().stream_key || DEFAULT_KEY); }
function hlsDir(key = currentConfiguredKey()) { return path.join(MEDIA_ROOT, 'live', safeKey(key)); }
function hlsPath(key = currentConfiguredKey()) { return path.join(hlsDir(key), 'index.m3u8'); }
function hlsUrl(key = currentConfiguredKey()) { return `${LOCAL_BASE_URL}/hls/${encodeURIComponent(safeKey(key))}/index.m3u8`; }
function playerUrl(key = currentConfiguredKey()) { return `${LOCAL_BASE_URL}/player/${encodeURIComponent(safeKey(key))}`; }
function publicPlayerUrl(key = currentConfiguredKey()) { return publicTunnelInfo?.url ? `${publicTunnelInfo.url}/player/${encodeURIComponent(safeKey(key))}` : ''; }
function publicStatusUrl() { return publicTunnelInfo?.url ? `${publicTunnelInfo.url}/health` : ''; }
function ffmpegInfo() { return { path: FFMPEG_PATH, bundled: Boolean(bundledFfmpeg), exists: FFMPEG_PATH === 'ffmpeg' ? null : fs.existsSync(FFMPEG_PATH), mode: TRANSCODE_MODE }; }
function listFiles(dir) { try { return fs.readdirSync(dir); } catch (_) { return []; } }
function streamStatus(key = currentConfiguredKey()) {
  const k = safeKey(key);
  const files = listFiles(hlsDir(k));
  const hls_exists = fs.existsSync(hlsPath(k));
  const hls_segments = files.filter(f => f.endsWith('.ts')).length;
  let manifest_size = 0;
  try { manifest_size = fs.statSync(hlsPath(k)).size || 0; } catch (_) {}
  const hls_ready = Boolean(hls_exists && hls_segments > 0 && manifest_size > 0);
  return {
    key: k,
    active: Boolean(active[k]),
    ffmpeg_running: Boolean(ffmpegJobs[k]),
    hls_exists,
    hls_ready,
    hls_segments,
    manifest_size,
    hls_url: hlsUrl(k),
    hls_path: hlsPath(k),
    player_url: playerUrl(k),
    public_player_url: publicPlayerUrl(k),
    hls_files: files,
    started_at: active[k]?.startedAt || null,
    last_seen: active[k]?.lastSeen || null
  };
}
async function waitForHlsReady(key = currentConfiguredKey(), timeoutMs = 35000) {
  const start = Date.now();
  const k = safeKey(key);
  while (Date.now() - start < timeoutMs) {
    const st = streamStatus(k);
    if (st.hls_ready) return st;
    await new Promise(r => setTimeout(r, 1000));
  }
  return streamStatus(k);
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
  args.push('-f', 'hls', '-hls_time', '2', '-hls_list_size', '6', '-hls_flags', 'delete_segments+append_list+omit_endlist', '-hls_segment_filename', segmentPattern, output);
  log('ffmpeg', 'Démarrage conversion RTMP → HLS', { key: k, input, output, ffmpeg: FFMPEG_PATH });
  const child = spawn(FFMPEG_PATH, args, { windowsHide: true });
  ffmpegJobs[k] = child;
  child.stderr.on('data', d => { const t = String(d).trim(); if (t) log('ffmpeg', t.slice(0, 1200), { key: k }); });
  child.on('error', err => { log('error', 'FFmpeg impossible à lancer', { key: k, error: err.message }); delete ffmpegJobs[k]; });
  child.on('exit', (code, signal) => { log('ffmpeg', 'FFmpeg arrêté', { key: k, code, signal }); delete ffmpegJobs[k]; });
}
function stopHlsTransmux(key) { const k = safeKey(key); if (ffmpegJobs[k]) { try { ffmpegJobs[k].kill('SIGTERM'); } catch (_) {} delete ffmpegJobs[k]; } }

const nms = new NodeMediaServer({ logType: 2, rtmp: { port: RTMP_PORT, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 } });
nms.on('prePublish', (_id, streamPath) => { const key = safeKey(streamPath.split('/').pop()); active[key] = { key, streamPath, startedAt: active[key]?.startedAt || new Date().toISOString(), lastSeen: new Date().toISOString() }; log('rtmp', 'OBS essaie de publier', { streamPath, key }); });
nms.on('postPublish', (_id, streamPath) => { const key = safeKey(streamPath.split('/').pop()); active[key] = { key, streamPath, startedAt: active[key]?.startedAt || new Date().toISOString(), lastSeen: new Date().toISOString() }; log('rtmp', 'Flux OBS reçu', { streamPath, key }); setTimeout(() => startHlsTransmux(key), 500); });
nms.on('donePublish', (_id, streamPath) => { const key = safeKey(streamPath.split('/').pop()); delete active[key]; stopHlsTransmux(key); log('rtmp', 'Flux OBS arrêté', { streamPath, key }); setTimeout(() => sendHeartbeatToSwapp(key, false).catch(()=>{}), 250); });
try { nms.run(); log('system', 'Serveur RTMP lancé', { rtmp: `rtmp://127.0.0.1:${RTMP_PORT}/live`, ffmpeg: ffmpegInfo() }); } catch (e) { log('error', 'RTMP impossible', { error: e.message }); }

function normalizePublicBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(url)) throw new Error('URL publique invalide : elle doit commencer par https://');
  return rejectBadTunnelUrl(url);
}
function setManualPublicUrl(url) { publicTunnelInfo = { url: normalizePublicBaseUrl(url), startedAt: new Date().toISOString(), provider: 'manual' }; log('tunnel', 'URL publique manuelle', publicTunnelInfo); return publicTunnelInfo; }
function withTimeout(promise, ms, label) { let timer; const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label || 'Délai dépassé')), ms); }); return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)); }
function delay(ms){ return new Promise(r => setTimeout(r, ms)); }
function isCloudflareRateLimitText(text){ return /429|Too Many Requests|1015|rate limit|unmarshalling QuickTunnel/i.test(String(text || '')); }
function setTunnelFailure(message, cooldownMs = 0){
  lastTunnelFailure = String(message || 'Tunnel indisponible');
  if (cooldownMs > 0) tunnelRetryBlockedUntil = Date.now() + cooldownMs;
  log('error', lastTunnelFailure, { cooldown_until: tunnelRetryBlockedUntil ? new Date(tunnelRetryBlockedUntil).toISOString() : null });
}
function assertTunnelRetryAllowed(){
  if (tunnelRetryBlockedUntil && Date.now() < tunnelRetryBlockedUntil) {
    const sec = Math.ceil((tunnelRetryBlockedUntil - Date.now()) / 1000);
    throw new Error(`Cloudflare limite temporairement les tunnels rapides. Réessaie dans ${Math.ceil(sec/60)} min. Le flux OBS/HLS local reste prêt.`);
  }
}
function clearTunnelFailure(){ tunnelRetryBlockedUntil = 0; lastTunnelFailure = ''; }
function fileExists(p){ try { return !!p && fs.existsSync(p); } catch (_) { return false; } }
function rejectBadTunnelUrl(url){
  try {
    const u = new URL(String(url || ''));
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1') throw new Error('URL locale refusée.');
    if (h.endsWith('loca.lt') || h.includes('localtunnel')) throw new Error('localtunnel / loca.lt est refusé : ce tunnel affiche une page de sécurité et casse le player.');
    return u.toString().replace(/\/$/, '');
  } catch (e) {
    throw new Error(e.message || 'URL tunnel invalide.');
  }
}
function cloudflaredStorePath(){
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(CONFIG_DIR, 'bin', 'cloudflared' + ext);
}
function bundledCloudflaredPath(){
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(__dirname, 'bin', 'cloudflared' + ext);
}
function findCloudflaredOnPath(){
  if (CLOUDFLARED_PATH && CLOUDFLARED_PATH !== 'cloudflared' && fileExists(CLOUDFLARED_PATH)) return CLOUDFLARED_PATH;
  return 'cloudflared';
}
function cloudflaredDownloadUrl(){
  if (process.platform === 'win32') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz';
  if (process.platform === 'darwin') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64';
  if (process.platform === 'linux') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
  return '';
}
function downloadFile(url, dest){
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive:true });
    const tmp = dest + '.download';
    const file = fs.createWriteStream(tmp);
    const request = https.get(url, { headers:{ 'User-Agent':'Swapp-Local' } }, response => {
      if ([301,302,303,307,308].includes(response.statusCode) && response.headers.location) {
        file.close(() => { try { fs.unlinkSync(tmp); } catch(_){} });
        return resolve(downloadFile(response.headers.location, dest));
      }
      if (response.statusCode !== 200) {
        file.close(() => { try { fs.unlinkSync(tmp); } catch(_){} });
        return reject(new Error('Téléchargement cloudflared refusé HTTP ' + response.statusCode));
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => {
        try { fs.renameSync(tmp, dest); if (process.platform !== 'win32') fs.chmodSync(dest, 0o755); } catch(e) { return reject(e); }
        resolve(dest);
      }));
    });
    request.on('error', err => { try { file.close(); fs.unlinkSync(tmp); } catch(_){} reject(err); });
    request.setTimeout(45000, () => { request.destroy(new Error('Téléchargement cloudflared trop long.')); });
  });
}
async function ensureCloudflaredPath(){
  const bundled = bundledCloudflaredPath();
  if (fileExists(bundled)) return bundled;
  const stored = cloudflaredStorePath();
  if (fileExists(stored)) return stored;
  const pathCandidate = findCloudflaredOnPath();
  if (pathCandidate && pathCandidate !== 'cloudflared') return pathCandidate;
  const url = cloudflaredDownloadUrl();
  if (url && process.platform === 'win32') {
    log('tunnel', 'Téléchargement automatique de Cloudflare Tunnel', { url: 'cloudflared-windows-amd64.exe' });
    return await downloadFile(url, stored);
  }
  return pathCandidate || 'cloudflared';
}
async function fetchWithTimeout(url, ms = 8000){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { cache:'no-store', signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
async function verifyPublicTunnel(baseUrl, tries = 8){
  const base = rejectBadTunnelUrl(baseUrl);
  const host = new URL(base).hostname;
  let lastError = '';
  for (let i = 0; i < tries; i++) {
    try {
      await dns.lookup(host);
      const r = await fetchWithTimeout(base + '/health?t=' + Date.now(), 9000);
      const text = await r.text().catch(() => '');
      if (r.ok && !/You are about to visit|localtunnel|phishing/i.test(text)) return true;
      lastError = 'health HTTP ' + r.status;
    } catch(e) { lastError = e.message || String(e); }
    await delay(1500);
  }
  throw new Error('Tunnel non joignable publiquement : ' + lastError);
}
async function ensurePublicTunnelReady(options = {}){
  assertTunnelRetryAllowed();
  const attempts = Number(options.attempts || 2);
  const errors = [];
  for (let i = 0; i < attempts; i++) {
    try {
      if (publicTunnelInfo?.url) {
        await verifyPublicTunnel(publicTunnelInfo.url, 2);
        clearTunnelFailure();
        return publicTunnelInfo;
      }
      const info = await startCloudflaredProvider();
      await verifyPublicTunnel(info.url, 8);
      clearTunnelFailure();
      return info;
    } catch(e) {
      const msg = e.message || String(e);
      errors.push(msg);
      if (isCloudflareRateLimitText(msg + '\n' + cloudflaredLastLog)) {
        await stopPublicTunnel({ keepFailure:true });
        setTunnelFailure('Cloudflare a répondu 429 / Too Many Requests sur les tunnels rapides. Les relances en boucle aggravent le blocage.', QUICK_TUNNEL_RATE_LIMIT_COOLDOWN_MS);
        break;
      }
      log('error', 'Tunnel invalide, relance automatique contrôlée', { attempt:i+1, error:msg });
      await stopPublicTunnel({ keepFailure:true });
      await delay(4000 + i * 2500);
    }
  }
  throw new Error('Tunnel non publié. ' + (lastTunnelFailure || errors.slice(-3).join(' | ')));
}
async function startCloudflaredProvider() {
  if (cloudflaredProcess && publicTunnelInfo?.url) return publicTunnelInfo;
  cloudflaredLastLog = '';
  const cfPath = await ensureCloudflaredPath();
  return await withTimeout(new Promise((resolve, reject) => {
    const child = spawn(cfPath, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${HTTP_PORT}`], { windowsHide: true });
    cloudflaredProcess = child;
    let resolved = false;
    const onData = buf => {
      const text = String(buf || '');
      cloudflaredLastLog = (cloudflaredLastLog + text).slice(-6000);
      if (!resolved && isCloudflareRateLimitText(cloudflaredLastLog)) {
        resolved = true;
        try { child.kill(); } catch (_) {}
        return reject(new Error('Cloudflare Quick Tunnel rate limit : 429 Too Many Requests / 1015.'));
      }
      const match = cloudflaredLastLog.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) { resolved = true; const candidate = rejectBadTunnelUrl(match[0]); publicTunnelInfo = { url: candidate, startedAt: new Date().toISOString(), provider: 'cloudflared' }; log('tunnel', 'Cloudflare URL reçue, vérification santé', publicTunnelInfo); verifyPublicTunnel(candidate, 8).then(() => { log('tunnel', 'Cloudflare vérifié', publicTunnelInfo); resolve(publicTunnelInfo); }).catch(err => { publicTunnelInfo = null; reject(err); }); }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('error', err => { if (!resolved) reject(new Error(`cloudflared introuvable : ${err.message}`)); });
    child.on('exit', (code, signal) => { const ok = resolved; if (publicTunnelInfo?.provider === 'cloudflared') publicTunnelInfo = null; cloudflaredProcess = null; if (!ok) { const tail = cloudflaredLastLog.slice(-1200); const msg = isCloudflareRateLimitText(tail) ? 'Cloudflare Quick Tunnel rate limit : 429 Too Many Requests / 1015.' : `cloudflared arrêté sans URL. Code=${code || ''} Signal=${signal || ''}. ${tail}`; reject(new Error(msg)); } });
  }), 25000, 'cloudflared ne donne pas d’URL après 25 secondes');
}
async function startLocalTunnelProvider() { throw new Error('localtunnel désactivé : il affiche une page de sécurité et casse le player Swapp.'); }
async function startPublicTunnel(provider = 'auto') {
  if (publicTunnelInfo?.url) { await verifyPublicTunnel(publicTunnelInfo.url, 2); return publicTunnelInfo; }
  return await ensurePublicTunnelReady({ attempts: 3 });
}
async function stopPublicTunnel(options = {}) { if (publicTunnel) { try { publicTunnel.close(); } catch (_) {} } if (cloudflaredProcess) { try { cloudflaredProcess.kill(); } catch (_) {} } publicTunnel = null; cloudflaredProcess = null; publicTunnelInfo = null; if (!options.keepFailure) clearTunnelFailure(); return { success: true }; }
async function registerPublicUrlOnOryon({ siteUrl, key }) {
  const cfg = loadLocalConfig();
  const base = cleanSiteUrl(siteUrl || cfg.site_url || DEFAULT_ORYON_SITE_URL);
  if (!base || !/^https?:\/\//i.test(base)) throw new Error('URL du site Swapp invalide');
  if (!publicTunnelInfo?.url) throw new Error('Tunnel public non lancé');
  const player = publicPlayerUrl(key);
  if (!player || /localhost|127\.0\.0\.1/i.test(player)) throw new Error('URL publique invalide : le tunnel n’a pas fourni d’adresse publique.');
  const payload = { stream_key: safeKey(key), public_base_url: publicTunnelInfo.url, player_url: player, status_url: publicStatusUrl(), provider: publicTunnelInfo.provider || 'auto' };
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
  const r = await fetch(`${base}/api/oryon/local-agent/register-public-url`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || `Swapp a refusé l’enregistrement (${r.status})`);
  log('publish', 'Live envoyé à Swapp', { siteUrl: base, player_url: payload.player_url });
  return { success: true, site_url: base, ...payload, response: j };
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((_, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });

const HLS_PUBLIC_ROOT = path.join(MEDIA_ROOT, 'live');
app.use('/hls', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
}, express.static(HLS_PUBLIC_ROOT, {
  fallthrough: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.m3u8')) res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    if (filePath.endsWith('.ts')) res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));

function pageHtml(key){
  const cfg = loadLocalConfig();
  const site = cfg.site_url || DEFAULT_ORYON_SITE_URL;
  const login = cfg.user?.login || '';
  const purl = playerUrl(key);
  const rtmp = `rtmp://127.0.0.1:${RTMP_PORT}/live`;
  return String.raw`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Swapp Local</title><style>
:root{color-scheme:dark;background:#070914;color:#f6f7fb;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#3b1b7a55,transparent 35%),#070914}.wrap{max-width:1160px;margin:auto;padding:26px}.card{border:1px solid #262b42;background:#101423cc;border-radius:24px;padding:22px;box-shadow:0 20px 60px #0008}.hero{display:grid;grid-template-columns:.92fr 1.08fr;gap:18px}.tag{display:inline-flex;padding:7px 10px;border-radius:999px;background:#7c3aed22;border:1px solid #7c3aed66;color:#d7c6ff;font-size:13px}.btn{border:0;border-radius:14px;padding:13px 16px;background:#7c3aed;color:white;font-weight:900;cursor:pointer}.btn.secondary{background:#1d2335}.btn.good{background:#18bf72}.btn.big{font-size:18px;padding:16px 22px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.small{color:#aab3c7;font-size:14px;line-height:1.5}.player{aspect-ratio:16/9;background:#02040a;border-radius:22px;overflow:hidden;border:1px solid #30364f}iframe{width:100%;height:100%;border:0;overflow:hidden}input{width:100%;background:#070914;border:1px solid #30364f;color:white;border-radius:12px;padding:12px;margin:6px 0}.status{margin-top:12px;padding:12px;border:1px solid #30364f;border-radius:14px;background:#070914;color:#cfe5ff;font-size:14px;white-space:pre-wrap}.code{background:#050710;border:1px solid #30364f;border-radius:14px;padding:13px;word-break:break-all;font-family:ui-monospace,monospace;color:#cfe5ff}.muted{color:#aab3c7}.ok{color:#86efac}.warn{color:#fde68a}.hidden{display:none!important}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.center{text-align:center}.topConnect{margin-bottom:18px}.previewHint{margin-top:10px}.mini{font-size:12px;color:#7e8aa3}@media(max-width:900px){.hero,.steps{grid-template-columns:1fr}.wrap{padding:14px}}</style></head><body><div class="wrap">
<section class="card topConnect"><span class="tag">Swapp Local</span><h1>Connecte ton compte Swapp</h1><p class="small">Connecte une fois ton compte. Ensuite Swapp Local récupère ta clé et publie ton direct automatiquement.</p><label class="small">Adresse du site Swapp</label><input id="swappSite" value="${site}"><div class="row"><button class="btn big" onclick="connectWithBrowser()">Connecter avec mon compte Swapp</button><button class="btn secondary" onclick="disconnectAccount()">Déconnecter</button><button class="btn secondary" onclick="loadAccount()">Actualiser</button></div><div id="accountStatus" class="status">${login ? '✅ Connecté à '+login : 'Non connecté'}</div></section>
<div class="hero"><section class="card"><h1>Diffuser avec OBS</h1><p class="small">Laisse cette app ouverte. Dans OBS, utilise le serveur et la clé ci-dessous.</p><h3>Serveur OBS</h3><div class="code" id="rtmp">${rtmp}</div><h3>Clé de stream</h3><input id="key" value="${key}" oninput="updateKey()"><div class="row"><button class="btn secondary" onclick="copy('rtmp')">Copier serveur</button><button class="btn secondary" onclick="copyKey()">Copier clé</button></div><p class="small">OBS → Paramètres → Diffusion → Service personnalisé. Désactive la vidéo multipiste.</p><div id="simpleStatus" class="status">En attente d’OBS.</div><button class="btn good big" onclick="goLive()">Démarrer sur Swapp</button><button class="btn secondary" onclick="stopTunnel()">Arrêter</button></section><section class="card"><h2>Prévisualisation</h2><div class="player"><iframe id="frame" src="${purl}"></iframe></div><p class="small previewHint">Aperçu local du direct. Garde cette application ouverte pendant le live.</p></section></div>
<div class="steps"><div class="card"><h3>1. Connecte</h3><p class="small">Swapp Local récupère ta clé.</p></div><div class="card"><h3>2. Lance OBS</h3><p class="small">Serveur personnalisé + clé Swapp.</p></div><div class="card"><h3>3. Démarre</h3><p class="small">Le live s’affiche sur ta chaîne.</p></div></div>
<details class="card" style="margin-top:16px"><summary class="small" style="cursor:pointer">Diagnostic technique</summary><div id="diag" class="status">Diagnostic en cours…</div><div id="publicUrl" class="status">Tunnel non lancé.</div></details>
</div><script>
let publishedLiveKey=null;
function copy(id){navigator.clipboard.writeText(document.getElementById(id).textContent)}function copyKey(){navigator.clipboard.writeText(document.getElementById('key').value)}function currentKey(){return document.getElementById('key').value.replace(/[^a-zA-Z0-9_-]/g,'')||'${DEFAULT_KEY}'}
function updateKey(){const u='/player/'+encodeURIComponent(currentKey());const f=document.getElementById('frame'); if(!f.src.endsWith(u)) f.src=u; refreshDiag();}
async function loadAccount(){try{const r=await fetch('/api/account/status?t='+Date.now());const d=await r.json();if(d.connected){document.getElementById('key').value=d.stream_key;document.getElementById('swappSite').value=d.site_url||document.getElementById('swappSite').value;document.getElementById('accountStatus').innerHTML='✅ Connecté à <b>'+(d.user?.login||'Swapp')+'</b>';updateKey();return true}else{document.getElementById('accountStatus').textContent='Non connecté';return false}}catch(e){return false}}
async function connectWithBrowser(){const box=document.getElementById('accountStatus');const raw=(document.getElementById('swappSite').value||'').trim();const site=/^https?:\/\//i.test(raw)?raw.replace(/\/$/,''):'https://'+raw.replace(/\/$/,'');document.getElementById('swappSite').value=site;const cb='http://127.0.0.1:8081/api/account/browser-callback';const url=site+'/api/oryon/local-agent/browser-connect?callback='+encodeURIComponent(cb);box.textContent='Ouverture du navigateur…';window.open(url,'_blank');let attempts=0;const timer=setInterval(async()=>{attempts++;if(await loadAccount()){clearInterval(timer);box.innerHTML='✅ Compte connecté. Tu peux lancer OBS.'}if(attempts>120){clearInterval(timer);box.textContent='Connexion non confirmée. Vérifie que tu es connecté à Swapp puis réessaie.'}},1000)}
async function disconnectAccount(){await fetch('/api/account/disconnect',{method:'POST'});document.getElementById('accountStatus').textContent='Non connecté'}
async function sendHeartbeat(live){try{const key=currentKey();const tun=await fetch('/api/tunnel/status?key='+encodeURIComponent(key)+'&t='+Date.now()).then(r=>r.json()).catch(()=>({}));await fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,live_active:!!live,player_url:tun.player_url||'',status_url:tun.status_url||''})})}catch(e){}}
async function refreshDiag(){try{const r=await fetch('/api/setup/check?key='+encodeURIComponent(currentKey())+'&auto=0&t='+Date.now());const d=await r.json();const st=d.stream||{};const obs=!!d.obs_active,hls=!!d.hls,tun=!!d.tunnel_published;let label='En attente d’OBS.';if(obs&&!hls)label='⏳ OBS reçu. Préparation du flux…';if(obs&&hls&&!tun)label='✅ Flux local prêt. Clique Démarrer sur Swapp pour publier le tunnel.';if(obs&&hls&&tun)label='✅ Flux prêt. Tunnel publié.';document.getElementById('simpleStatus').innerHTML=label;const diag=document.getElementById('diag');if(diag)diag.innerHTML='OBS actif: '+obs+'\nFFmpeg: '+!!d.ffmpeg_running+'\nHLS: '+hls+'\nTunnel: '+(tun?'publié':'non publié')+(d.tunnel_error?'\nErreur tunnel: '+d.tunnel_error:'')+(d.retry_blocked_until?'\nNouvelle tentative possible après: '+new Date(d.retry_blocked_until).toLocaleTimeString():'');const pub=document.getElementById('publicUrl');if(pub&&tun&&d.player_url)pub.textContent='Tunnel publié: '+d.player_url;if(publishedLiveKey){await sendHeartbeat(obs&&hls&&tun)}}catch(e){document.getElementById('simpleStatus').textContent='Diagnostic indisponible.'}}
async function goLive(){const box=document.getElementById('publicUrl');box.textContent='Vérification OBS → publication Swapp…';try{const r=await fetch('/api/go-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),site_url:document.getElementById('swappSite').value.trim()})});const d=await r.json();if(!d.success)throw new Error(d.error||'Publication impossible');publishedLiveKey=currentKey(); box.textContent='✅ Live en ligne sur ta chaîne Swapp.'; document.getElementById('simpleStatus').textContent='✅ Live en ligne sur Swapp.'; await sendHeartbeat(true)}catch(e){box.textContent='❌ '+(e.message||e)}}
async function stopTunnel(){try{await sendHeartbeat(false); publishedLiveKey=null; await fetch('/api/tunnel/stop',{method:'POST'});document.getElementById('publicUrl').textContent='Diffusion arrêtée.'}catch(e){document.getElementById('publicUrl').textContent='Erreur: '+e.message}}
setInterval(refreshDiag,3000);loadAccount();refreshDiag();
</script></body></html>`;
}


app.get('/', (req, res) => { const cfg = loadLocalConfig(); const key = safeKey(req.query.key || cfg.stream_key || DEFAULT_KEY); res.type('html').send(pageHtml(key)); });
app.get('/api/account/browser-callback', (req, res) => {
  try {
    if (String(req.query.ok || '') !== '1') return res.status(400).send('Connexion Swapp refusée.');
    const token = String(req.query.token || '').trim();
    const stream_key = safeKey(req.query.stream_key || '');
    const login = String(req.query.login || '').trim();
    const display_name = String(req.query.display_name || login).trim();
    const site_url = cleanSiteUrl(req.query.site_url || DEFAULT_ORYON_SITE_URL);
    if (!token || !stream_key || !login) return res.status(400).send('Réponse Swapp incomplète.');
    saveLocalConfig({ site_url, token, stream_key, user: { login, display_name }, connectedAt: new Date().toISOString(), authMode: 'browser' });
    res.type('html').send('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Swapp Local connecté</title><style>body{font-family:system-ui;background:#070914;color:white;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:560px;border:1px solid #30364f;background:#101423;border-radius:22px;padding:24px;text-align:center}</style></head><body><div class="box"><h1>Swapp Local connecté ✅</h1><p>Compte lié : <b>'+login+'</b></p><p>Tu peux revenir dans l’application Swapp Local.</p><script>setTimeout(function(){try{window.close()}catch(e){}},1800)<\/script></div></body></html>');
  } catch(e) { res.status(500).send('Erreur Swapp Local: ' + e.message); }
});

app.get('/api/account/status', (_req, res) => { const cfg = loadLocalConfig(); res.json({ success:true, connected: Boolean(cfg.token && cfg.stream_key), site_url: cfg.site_url || DEFAULT_ORYON_SITE_URL, user: cfg.user || null, stream_key: cfg.stream_key || DEFAULT_KEY }); });
app.post('/api/account/connect', async (req, res) => {
  try {
    const base = cleanSiteUrl(req.body?.site_url || DEFAULT_ORYON_SITE_URL);
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
    const st = await waitForHlsReady(key, 35000);
    if (!st.active) return res.status(400).json({ success:false, error:`Aucun flux OBS détecté. Mets OBS sur rtmp://127.0.0.1:${RTMP_PORT}/live avec ta clé Swapp.` });
    if (!st.hls_ready) return res.status(400).json({ success:false, error:'OBS est détecté, mais le player local HLS n’est pas encore prêt. Attends 5 à 15 secondes puis réessaie.', stream: st });
    await ensurePublicTunnelReady({ key, attempts: 2 });
    const result = await registerPublicUrlOnOryon({ siteUrl: req.body?.site_url, key });
    return res.json({ success:true, ...result, stream: streamStatus(key), tunnel: publicTunnelInfo });
  } catch (e) { log('error', 'Go live auto impossible', { error: e.message }); return res.status(500).json({ success:false, error:e.message, stream: streamStatus(key), tunnel: publicTunnelInfo, log: cloudflaredLastLog.slice(-1000) }); }
});
app.post('/api/tunnel/start', async (req, res) => { try { const key = safeKey(req.body?.key || currentConfiguredKey()); const info = await ensurePublicTunnelReady({ key, attempts: 2 }); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl(), log: cloudflaredLastLog.slice(-1000) }); } catch(e) { log('error', 'Tunnel impossible', { error: e.message }); res.status(500).json({ success:false, error:e.message, log: cloudflaredLastLog.slice(-1000) }); } });
app.post('/api/tunnel/manual', async (req, res) => { try { const key = safeKey(req.body?.key || currentConfiguredKey()); const info = setManualPublicUrl(req.body?.url); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl() }); } catch(e) { res.status(400).json({ success:false, error:e.message }); } });
app.post('/api/tunnel/stop', async (_req, res) => { try { await stopPublicTunnel(); res.json({ success:true }); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });
app.get('/api/tunnel/status', (req, res) => { const key = safeKey(req.query.key || currentConfiguredKey()); res.json({ success:true, active:Boolean(publicTunnelInfo?.url), tunnel:publicTunnelInfo, player_url:publicPlayerUrl(key), status_url:publicStatusUrl(), cloudflared_log:cloudflaredLastLog.slice(-1000) }); });
app.post('/api/publish-to-swapp', async (req, res) => { try { const cfg = loadLocalConfig(); const key = safeKey(req.body?.key || cfg.stream_key || DEFAULT_KEY); if (!cfg.token) return res.status(401).json({ success:false, error:'Connecte d’abord ton compte Swapp.' }); if (!publicTunnelInfo?.url) await ensurePublicTunnelReady({ key, attempts: 2 }); const result = await registerPublicUrlOnOryon({ siteUrl:req.body?.site_url, key }); res.json(result); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });

app.post('/api/heartbeat', async (req, res) => {
  try {
    const cfg = loadLocalConfig();
    if(!cfg.token) return res.status(401).json({ success:false, error:'Compte Swapp non connecté.' });
    const key = safeKey(req.body?.key || cfg.stream_key || DEFAULT_KEY);
    const base = cleanSiteUrl(cfg.site_url || DEFAULT_ORYON_SITE_URL);
    const headers = { 'Content-Type':'application/json', 'Authorization': `Bearer ${cfg.token}` };
    const body = JSON.stringify({ stream_key:key, live_active:!!req.body?.live_active, player_url:req.body?.player_url||publicPlayerUrl(key), status_url:req.body?.status_url||publicStatusUrl() });
    const r = await fetch(`${base}/api/oryon/local-agent/heartbeat`, { method:'POST', headers, body });
    const j = await r.json().catch(()=>({}));
    if(!r.ok || !j.success) throw new Error(j.error || `Heartbeat refusé (${r.status})`);
    lastHeartbeatLive = !!req.body?.live_active;
    return res.json({ success:true, live:lastHeartbeatLive });
  } catch(e) { return res.status(500).json({ success:false, error:e.message }); }
});

async function sendHeartbeatToSwapp(key, live){
  try {
    const cfg = loadLocalConfig();
    if(!cfg.token) return;
    const base = cleanSiteUrl(cfg.site_url || DEFAULT_ORYON_SITE_URL);
    const headers = { 'Content-Type':'application/json', 'Authorization': `Bearer ${cfg.token}` };
    const body = JSON.stringify({ stream_key:safeKey(key), live_active:!!live, player_url:live?publicPlayerUrl(key):'', status_url:live?publicStatusUrl():'' });
    await fetch(`${base}/api/oryon/local-agent/heartbeat`, { method:'POST', headers, body });
  } catch(_) {}
}

app.get('/api/setup/check', async (req, res) => {
  const key = safeKey(req.query.key || currentConfiguredKey());
  const stream = streamStatus(key);
  let tunnelOk = false;
  let tunnelError = lastTunnelFailure || '';
  let tunnel = publicTunnelInfo;
  const autoTunnel = String(req.query.auto || '0') === '1';
  if (stream.active && stream.hls_ready && autoTunnel) {
    try { tunnel = await ensurePublicTunnelReady({ key, attempts: 1 }); tunnelOk = true; }
    catch(e) { tunnelError = e.message || String(e); }
  } else if (publicTunnelInfo?.url) {
    try { await verifyPublicTunnel(publicTunnelInfo.url, 2); tunnelOk = true; }
    catch(e) { tunnelError = e.message || String(e); }
  }
  res.json({
    success:true,
    ready:Boolean(stream.active && stream.ffmpeg_running && stream.hls_ready && tunnelOk),
    obs_active:Boolean(stream.active),
    ffmpeg:true,
    ffmpeg_info:ffmpegInfo(),
    ffmpeg_running:Boolean(stream.ffmpeg_running),
    hls:Boolean(stream.hls_ready),
    tunnel_published:Boolean(tunnelOk),
    tunnel:tunnel || null,
    tunnel_error:tunnelError,
    retry_blocked_until: tunnelRetryBlockedUntil || null,
    player_url:tunnelOk ? publicPlayerUrl(key) : '',
    status_url:tunnelOk ? publicStatusUrl() : '',
    stream,
    account: loadLocalConfig().user || null,
    site_url: loadLocalConfig().site_url || DEFAULT_ORYON_SITE_URL,
    message: stream.active && stream.hls_ready ? (tunnelOk ? 'Flux prêt et tunnel publié.' : 'Flux local prêt. Clique Démarrer sur Swapp pour publier. Si Cloudflare répond 429, attends le cooldown ou passe au serveur RTMP dédié.') : 'En attente du flux OBS ou préparation HLS.'
  });
});

app.get('/api/hls-ready/:key', (req, res) => res.json({ success:true, stream:streamStatus(req.params.key), tunnel:{ active:Boolean(publicTunnelInfo?.url), info:publicTunnelInfo, player_url:publicPlayerUrl(req.params.key) } }));
app.get('/health', (_req, res) => res.json({ success:true, name:'Swapp Local', rtmp:`rtmp://127.0.0.1:${RTMP_PORT}/live`, local_base_url:LOCAL_BASE_URL, media_root:MEDIA_ROOT, ffmpeg:ffmpegInfo(), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), tunnel:publicTunnelInfo, account: loadLocalConfig().user || null }));
app.get('/api/status', (req, res) => res.json({ success:true, ffmpeg:ffmpegInfo(), media_root:MEDIA_ROOT, stream:streamStatus(req.query.key || currentConfiguredKey()), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), events }));
app.get('/player/:key', (req, res) => {
  const key = safeKey(req.params.key);
  const hls = hlsUrl(key);
  const status = `/api/hls-ready/${encodeURIComponent(key)}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Swapp Local Player</title><style>html,body{margin:0;width:100%;height:100%;background:#030508;color:white;font-family:system-ui;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#030508;pointer-events:none}.state{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#9ba7bb;padding:20px;white-space:pre-line}.debug{position:absolute;left:8px;bottom:8px;font-size:11px;color:#65708a;background:#03050899;padding:6px 8px;border-radius:8px;max-width:90%;overflow:hidden;text-overflow:ellipsis}</style></head><body><video id="v" autoplay muted playsinline></video><div id="s" class="state">Connexion au flux…</div><div id="d" class="debug"></div><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script><script>const src=${JSON.stringify(hls)},statusUrl=${JSON.stringify(status)},v=document.getElementById("v"),s=document.getElementById("s"),dbg=document.getElementById("d");let h=null,booted=false,tries=0;v.controls=false;function ok(){s.style.display="none";dbg.textContent="Lecture HLS OK"}function msg(t){s.style.display="grid";s.textContent=t}async function state(){try{const r=await fetch(statusUrl+"?t="+Date.now(),{cache:"no-store"});return await r.json()}catch(e){return {success:false,error:e.message}}}async function ready(){try{const st=await state();const stream=st.stream||{};dbg.textContent="OBS="+!!stream.active+" FFmpeg="+!!stream.ffmpeg_running+" HLS="+!!stream.hls_ready+" segments="+(stream.hls_segments||0);if(!stream.hls_ready)return false;const r=await fetch(src+"?t="+Date.now(),{cache:"no-store"});return r.ok}catch(e){dbg.textContent="HLS fetch error: "+e.message;return false}}async function boot(){if(booted)return;tries++;if(!await ready()){msg(tries>8?"Flux reçu. Préparation de la vidéo…
Si ça reste ici, arrête puis relance OBS.":"Connexion au flux…");setTimeout(boot,1500);return}booted=true;if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=src+"?t="+Date.now();v.addEventListener("loadedmetadata",ok,{once:true});v.addEventListener("playing",ok);v.play().catch(()=>{});return}if(window.Hls&&Hls.isSupported()){h=new Hls({lowLatencyMode:true,liveSyncDurationCount:2,backBufferLength:30});h.loadSource(src+"?t="+Date.now());h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>{ok();v.play().catch(()=>{})});h.on(Hls.Events.ERROR,(_e,d)=>{dbg.textContent="HLS error: "+(d&&d.type?d.type:"")+" "+(d&&d.details?d.details:"");if(d&&d.fatal){booted=false;try{h.destroy()}catch(e){};h=null;msg("Reconnexion au flux…");setTimeout(boot,1500)}});return}msg("Navigateur non compatible HLS.")}boot();setInterval(()=>{if(!booted)boot()},4000);</script></body></html>`;
  res.type('html').send(html);
});

app.listen(HTTP_PORT, () => { console.log(`[Swapp Local] Interface: http://localhost:${HTTP_PORT}`); console.log(`[Swapp Local] OBS server: rtmp://127.0.0.1:${RTMP_PORT}/live`); });
