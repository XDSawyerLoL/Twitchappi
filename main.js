const express = require('express');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');

let bundledFfmpeg = null;
try { bundledFfmpeg = require('ffmpeg-static'); } catch (_) { bundledFfmpeg = null; }

const HTTP_PORT = Number(process.env.SWAPP_LOCAL_HTTP_PORT || process.env.ORYON_LOCAL_HTTP_PORT || 8081);
const RTMP_PORT = Number(process.env.SWAPP_LOCAL_RTMP_PORT || process.env.ORYON_LOCAL_RTMP_PORT || 1935);
const MEDIA_ROOT = process.env.SWAPP_LOCAL_MEDIA_ROOT || process.env.ORYON_LOCAL_MEDIA_ROOT || path.join(__dirname, 'media');
const DEFAULT_KEY = process.env.SWAPP_STREAM_KEY || process.env.ORYON_STREAM_KEY || 'ta-cle-swapp';
const DEFAULT_SWAPP_SITE_URL = process.env.SWAPP_SITE_URL || process.env.ORYON_SITE_URL || 'https://swapp.tv';
const LOCAL_BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;
const FFMPEG_PATH = process.env.FFMPEG_PATH || bundledFfmpeg || 'ffmpeg';
const TRANSCODE_MODE = String(process.env.SWAPP_LOCAL_TRANSCODE || process.env.ORYON_LOCAL_TRANSCODE || 'transcode').toLowerCase();
const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), 'SwappLocal');
const OLD_CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), 'OryonLocal');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const BIN_DIR = path.join(CONFIG_DIR, 'bin');
const CLOUDFLARED_EXE = process.env.CLOUDFLARED_PATH || path.join(BIN_DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const TUNNEL_HEALTH_TIMEOUT_MS = Number(process.env.SWAPP_TUNNEL_HEALTH_TIMEOUT_MS || 65000);
const TUNNEL_COOLDOWN_MS = Number(process.env.SWAPP_TUNNEL_COOLDOWN_MS || 10 * 60 * 1000);

function ensureDir(dir){ fs.mkdirSync(dir, { recursive: true }); }
ensureDir(path.join(MEDIA_ROOT, 'live'));
ensureDir(CONFIG_DIR);
ensureDir(BIN_DIR);

function loadLocalConfig(){
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) {}
  try {
    const old = path.join(OLD_CONFIG_DIR, 'config.json');
    const cfg = JSON.parse(fs.readFileSync(old, 'utf8'));
    saveLocalConfig(cfg);
    return cfg;
  } catch (_) {}
  return {};
}
function saveLocalConfig(cfg){ ensureDir(CONFIG_DIR); fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...loadLocalConfig(), ...cfg }, null, 2)); return loadLocalConfig(); }
function clearLocalConfig(){ try { fs.unlinkSync(CONFIG_FILE); } catch (_) {} }
function cleanSiteUrl(value){ let base = String(value || DEFAULT_SWAPP_SITE_URL || '').trim(); if (!base) return DEFAULT_SWAPP_SITE_URL; if (!/^https?:\/\//i.test(base)) base = 'https://' + base; return base.replace(/\/$/, ''); }
function safeKey(value){ return String(value || DEFAULT_KEY).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_KEY; }
function currentConfiguredKey(){ return safeKey(loadLocalConfig().stream_key || DEFAULT_KEY); }
function hlsDir(key = currentConfiguredKey()){ return path.join(MEDIA_ROOT, 'live', safeKey(key)); }
function hlsPath(key = currentConfiguredKey()){ return path.join(hlsDir(key), 'index.m3u8'); }
function hlsRelativeUrl(key = currentConfiguredKey()){ return `/hls/${encodeURIComponent(safeKey(key))}/index.m3u8`; }
function hlsLocalUrl(key = currentConfiguredKey()){ return `${LOCAL_BASE_URL}${hlsRelativeUrl(key)}`; }
function playerLocalUrl(key = currentConfiguredKey()){ return `${LOCAL_BASE_URL}/player/${encodeURIComponent(safeKey(key))}`; }
function publicPlayerUrl(key = currentConfiguredKey()){ return publicTunnelInfo?.url ? `${publicTunnelInfo.url}/player/${encodeURIComponent(safeKey(key))}` : ''; }
function publicStatusUrl(){ return publicTunnelInfo?.url ? `${publicTunnelInfo.url}/health` : ''; }
function listFiles(dir){ try { return fs.readdirSync(dir); } catch (_) { return []; } }
function ffmpegInfo(){ return { path: FFMPEG_PATH, bundled: Boolean(bundledFfmpeg), exists: FFMPEG_PATH === 'ffmpeg' ? null : fs.existsSync(FFMPEG_PATH), mode: TRANSCODE_MODE }; }

const active = {};
const ffmpegJobs = {};
const events = [];
let publicTunnelInfo = null;
let cloudflaredProcess = null;
let cloudflaredLastLog = '';
let tunnelCooldownUntil = 0;
let tunnelStarting = null;
let publishedLiveKey = null;
let lastHeartbeatLive = false;

function log(type, message, data = {}){
  const entry = { at: new Date().toISOString(), type, message, data };
  events.unshift(entry);
  while (events.length > 220) events.pop();
  console.log(`[Swapp Live] ${type}: ${message}`, data || '');
}
function parse429(text){ return /429|Too Many Requests|rate limit|temporarily banned/i.test(String(text || '')); }
function hlsHasSegment(key){ return listFiles(hlsDir(key)).some(f => /^seg_.*\.ts$/i.test(f) || /\.ts$/i.test(f)); }
function hlsManifestLooksReady(key){
  try { const txt = fs.readFileSync(hlsPath(key), 'utf8'); return /\.ts(\?|\n|\r|$)/i.test(txt); } catch (_) { return false; }
}
function streamStatus(key = currentConfiguredKey()){
  const k = safeKey(key);
  const files = listFiles(hlsDir(k));
  const hls_exists = fs.existsSync(hlsPath(k));
  const hls_ready = hls_exists && hlsHasSegment(k) && hlsManifestLooksReady(k);
  return {
    key: k,
    active: Boolean(active[k]),
    ffmpeg_running: Boolean(ffmpegJobs[k]),
    hls_exists,
    hls_ready,
    hls_url: hlsLocalUrl(k),
    hls_relative_url: hlsRelativeUrl(k),
    hls_path: hlsPath(k),
    hls_files: files.slice(-12),
    hls_segments: files.filter(f => /\.ts$/i.test(f)).length,
    started_at: active[k]?.startedAt || null,
    last_seen: active[k]?.lastSeen || null
  };
}
async function waitForHlsReady(key = currentConfiguredKey(), timeoutMs = 45000){
  const start = Date.now();
  const k = safeKey(key);
  while (Date.now() - start < timeoutMs) {
    const st = streamStatus(k);
    if (st.active && st.hls_ready) return st;
    await new Promise(r => setTimeout(r, 1000));
  }
  return streamStatus(k);
}
function cleanupHls(key){
  const dir = hlsDir(key);
  ensureDir(dir);
  for (const f of listFiles(dir)) {
    if (/\.(ts|m3u8|tmp)$/i.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} }
  }
}
function startHlsTransmux(key){
  const k = safeKey(key);
  if (ffmpegJobs[k]) return;
  const dir = hlsDir(k);
  ensureDir(dir);
  cleanupHls(k);
  const input = `rtmp://127.0.0.1:${RTMP_PORT}/live/${k}`;
  const output = hlsPath(k);
  const segmentPattern = path.join(dir, 'seg_%03d.ts');
  const args = [
    '-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts+nobuffer', '-flags', 'low_delay',
    '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?'
  ];
  if (TRANSCODE_MODE === 'copy') {
    args.push('-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k');
  }
  args.push('-f', 'hls', '-hls_time', '2', '-hls_list_size', '6', '-hls_flags', 'delete_segments+omit_endlist+independent_segments', '-hls_segment_filename', segmentPattern, output);
  log('ffmpeg', 'Démarrage conversion OBS → HLS', { key: k, input, output, ffmpeg: FFMPEG_PATH, mode: TRANSCODE_MODE });
  const child = spawn(FFMPEG_PATH, args, { windowsHide: true });
  ffmpegJobs[k] = child;
  child.stderr.on('data', d => { const t = String(d).trim(); if (t) log('ffmpeg', t.slice(0, 1400), { key: k }); });
  child.on('error', err => { log('error', 'FFmpeg impossible à lancer', { key: k, error: err.message }); delete ffmpegJobs[k]; });
  child.on('exit', (code, signal) => { log('ffmpeg', 'FFmpeg arrêté', { key: k, code, signal }); delete ffmpegJobs[k]; });
}
function stopHlsTransmux(key){ const k = safeKey(key); if (ffmpegJobs[k]) { try { ffmpegJobs[k].kill('SIGTERM'); } catch (_) {} delete ffmpegJobs[k]; } }

const nms = new NodeMediaServer({ logType: 2, rtmp: { port: RTMP_PORT, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 } });
nms.on('prePublish', (_id, streamPath) => { const key = safeKey(streamPath.split('/').pop()); active[key] = { key, streamPath, startedAt: active[key]?.startedAt || new Date().toISOString(), lastSeen: new Date().toISOString() }; log('rtmp', 'OBS se connecte', { streamPath, key }); });
nms.on('postPublish', (_id, streamPath) => { const key = safeKey(streamPath.split('/').pop()); active[key] = { key, streamPath, startedAt: active[key]?.startedAt || new Date().toISOString(), lastSeen: new Date().toISOString() }; log('rtmp', 'Flux OBS reçu', { streamPath, key }); setTimeout(() => startHlsTransmux(key), 400); });
nms.on('donePublish', (_id, streamPath) => { const key = safeKey(streamPath.split('/').pop()); delete active[key]; stopHlsTransmux(key); log('rtmp', 'Flux OBS arrêté', { streamPath, key }); setTimeout(() => sendHeartbeatToSwapp(key, false).catch(()=>{}), 300); });
try { nms.run(); log('system', 'Serveur RTMP lancé', { rtmp: `rtmp://127.0.0.1:${RTMP_PORT}/live`, ffmpeg: ffmpegInfo() }); } catch (e) { log('error', 'RTMP impossible', { error: e.message }); }

function downloadFile(url, dest, redirects = 0){
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'SwappLiveConnector/1.0' } }, response => {
      if ([301,302,303,307,308].includes(response.statusCode) && response.headers.location && redirects < 5) {
        file.close(() => { try { fs.unlinkSync(dest); } catch (_) {} downloadFile(response.headers.location, dest, redirects + 1).then(resolve, reject); });
        return;
      }
      if (response.statusCode !== 200) {
        file.close(() => { try { fs.unlinkSync(dest); } catch (_) {} reject(new Error(`Téléchargement cloudflared refusé (${response.statusCode})`)); });
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => { file.close(() => { try { fs.unlinkSync(dest); } catch (_) {} reject(err); }); });
  });
}
function cloudflaredDownloadUrl(){
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-arm64.exe' : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz' : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
  return process.arch === 'arm64' ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64' : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
}
async function ensureCloudflared(){
  if (process.env.CLOUDFLARED_PATH && fs.existsSync(process.env.CLOUDFLARED_PATH)) return process.env.CLOUDFLARED_PATH;
  if (fs.existsSync(CLOUDFLARED_EXE)) return CLOUDFLARED_EXE;
  if (process.platform !== 'win32') throw new Error('cloudflared absent. Installe cloudflared ou renseigne CLOUDFLARED_PATH.');
  const url = cloudflaredDownloadUrl();
  log('tunnel', 'Téléchargement automatique de Cloudflare Tunnel', { url, dest: CLOUDFLARED_EXE });
  await downloadFile(url, CLOUDFLARED_EXE);
  try { fs.chmodSync(CLOUDFLARED_EXE, 0o755); } catch (_) {}
  return CLOUDFLARED_EXE;
}
async function probeUrl(url, timeoutMs = 7000){
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctl.signal, headers: { 'User-Agent': 'SwappLiveConnector/1.0' } });
    const text = await r.text().catch(()=> '');
    return { ok: r.ok, status: r.status, text: text.slice(0, 240) };
  } catch (e) { return { ok: false, status: 0, error: e.message }; }
  finally { clearTimeout(timer); }
}
async function probeTunnelHealth(info = publicTunnelInfo, timeoutMs = TUNNEL_HEALTH_TIMEOUT_MS){
  if (!info?.url) return { ok: false, error: 'Aucun tunnel.' };
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await probeUrl(`${info.url}/health?t=${Date.now()}`, 7000);
    if (last.ok) return { ok: true, probe: last };
    await new Promise(r => setTimeout(r, 1800));
  }
  return { ok: false, probe: last, error: 'Tunnel Cloudflare créé mais pas joignable.' };
}
function killCloudflared(){
  if (cloudflaredProcess) { try { cloudflaredProcess.kill(); } catch (_) {} }
  cloudflaredProcess = null;
  publicTunnelInfo = null;
}
async function startOneCloudflareAttempt(){
  const exe = await ensureCloudflared();
  cloudflaredLastLog = '';
  return await new Promise((resolve, reject) => {
    const child = spawn(exe, ['tunnel', '--url', LOCAL_BASE_URL], { windowsHide: true });
    cloudflaredProcess = child;
    let resolved = false;
    const done = (err, info) => { if (resolved) return; resolved = true; clearTimeout(timer); err ? reject(err) : resolve(info); };
    const onData = buf => {
      const text = String(buf || '');
      cloudflaredLastLog = (cloudflaredLastLog + text).slice(-9000);
      if (parse429(cloudflaredLastLog)) {
        tunnelCooldownUntil = Date.now() + TUNNEL_COOLDOWN_MS;
        done(new Error('Cloudflare limite les créations de tunnel (429). Attends le cooldown avant de relancer.'));
        try { child.kill(); } catch (_) {}
        return;
      }
      const match = cloudflaredLastLog.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        const info = { url: match[0].replace(/\/$/, ''), startedAt: new Date().toISOString(), provider: 'cloudflare-quick-tunnel' };
        publicTunnelInfo = info;
        log('tunnel', 'Cloudflare a donné une URL, vérification en cours', info);
        done(null, info);
      }
    };
    const timer = setTimeout(() => {
      const logTail = cloudflaredLastLog.slice(-1200);
      try { child.kill(); } catch (_) {}
      done(new Error(`Cloudflare Tunnel ne donne pas d’URL après 30 secondes. ${logTail}`));
    }, 30000);
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', err => done(new Error(`cloudflared impossible à lancer : ${err.message}`)));
    child.on('exit', (code, signal) => {
      const wasResolved = resolved;
      if (publicTunnelInfo?.provider === 'cloudflare-quick-tunnel') publicTunnelInfo = null;
      cloudflaredProcess = null;
      if (!wasResolved) done(new Error(`cloudflared s’est arrêté sans URL. Code=${code || ''} Signal=${signal || ''}. ${cloudflaredLastLog.slice(-1000)}`));
    });
  });
}
async function startPublicTunnel({ force = false } = {}){
  if (Date.now() < tunnelCooldownUntil) {
    const sec = Math.ceil((tunnelCooldownUntil - Date.now()) / 1000);
    throw new Error(`Cloudflare est en cooldown après trop de tentatives. Réessaie dans environ ${sec}s. Ne spamme pas Start.`);
  }
  if (tunnelStarting) return tunnelStarting;
  tunnelStarting = (async () => {
    if (!force && publicTunnelInfo?.url && cloudflaredProcess) {
      const ok = await probeTunnelHealth(publicTunnelInfo, 9000);
      if (ok.ok) return publicTunnelInfo;
      log('tunnel', 'Ancien tunnel non joignable, recréation', ok);
      killCloudflared();
      await new Promise(r => setTimeout(r, 1500));
    }
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const info = await startOneCloudflareAttempt();
        const health = await probeTunnelHealth(info, TUNNEL_HEALTH_TIMEOUT_MS);
        if (health.ok) {
          log('tunnel', 'Tunnel Cloudflare publié et vérifié', info);
          return info;
        }
        lastError = new Error(health.error || 'Tunnel créé mais /health inaccessible.');
        log('tunnel', 'Tunnel non joignable, tentative suivante', { attempt, health });
        killCloudflared();
        await new Promise(r => setTimeout(r, 2500));
      } catch (e) {
        lastError = e;
        log('error', 'Tentative Cloudflare échouée', { attempt, error: e.message, log: cloudflaredLastLog.slice(-1000) });
        if (/429|cooldown/i.test(e.message)) break;
        killCloudflared();
        await new Promise(r => setTimeout(r, 2500));
      }
    }
    throw lastError || new Error('Cloudflare Tunnel impossible.');
  })();
  try { return await tunnelStarting; } finally { tunnelStarting = null; }
}
async function stopPublicTunnel(){ killCloudflared(); publishedLiveKey = null; return { success: true }; }

async function registerPublicUrlOnSwapp({ siteUrl, key }){
  const cfg = loadLocalConfig();
  const token = cfg.token;
  if (!token) throw new Error('Compte Swapp non connecté.');
  const base = cleanSiteUrl(siteUrl || cfg.site_url || DEFAULT_SWAPP_SITE_URL);
  const player = publicPlayerUrl(key);
  const status = publicStatusUrl();
  if (!player || /localhost|127\.0\.0\.1|loca\.lt|localtunnel/i.test(player)) throw new Error('URL publique invalide : Cloudflare Tunnel n’est pas prêt.');
  const health = await probeUrl(status + '?publish=' + Date.now(), 8000);
  if (!health.ok) throw new Error(`Tunnel Cloudflare créé mais inaccessible depuis Swapp (${health.status || health.error || 'no response'}).`);
  const payload = { stream_key: safeKey(key), public_base_url: publicTunnelInfo.url, player_url: player, embed_url: player, status_url: status, provider: publicTunnelInfo.provider || 'cloudflare-quick-tunnel' };
  const r = await fetch(`${base}/api/oryon/local-agent/register-public-url`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || `Swapp a refusé la publication (${r.status})`);
  log('publish', 'Live envoyé à Swapp', { siteUrl: base, player_url: payload.player_url });
  return j;
}
async function sendHeartbeatToSwapp(key, live){
  try {
    const cfg = loadLocalConfig();
    if (!cfg.token) return;
    const base = cleanSiteUrl(cfg.site_url || DEFAULT_SWAPP_SITE_URL);
    const headers = { 'Content-Type':'application/json', 'Authorization': `Bearer ${cfg.token}` };
    const body = JSON.stringify({ stream_key: safeKey(key), live_active: !!live, player_url: live ? publicPlayerUrl(key) : '', embed_url: live ? publicPlayerUrl(key) : '', status_url: live ? publicStatusUrl() : '', provider: live ? (publicTunnelInfo?.provider || 'cloudflare-quick-tunnel') : '' });
    const r = await fetch(`${base}/api/oryon/local-agent/heartbeat`, { method:'POST', headers, body });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j.success) throw new Error(j.error || `Heartbeat refusé (${r.status})`);
    lastHeartbeatLive = !!live;
  } catch (e) { log('heartbeat', 'Heartbeat Swapp échoué', { error: e.message }); }
}
async function maintainPublishedLive(){
  if (!publishedLiveKey) return;
  const st = streamStatus(publishedLiveKey);
  if (!st.active || !st.hls_ready) { await sendHeartbeatToSwapp(publishedLiveKey, false); return; }
  try {
    if (!publicTunnelInfo?.url || !cloudflaredProcess) await startPublicTunnel({ force: true });
    else {
      const health = await probeTunnelHealth(publicTunnelInfo, 7000);
      if (!health.ok) await startPublicTunnel({ force: true });
    }
    await sendHeartbeatToSwapp(publishedLiveKey, true);
  } catch(e) { log('tunnel', 'Maintien live impossible', { error: e.message }); }
}
setInterval(() => maintainPublishedLive().catch(()=>{}), 10000);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((_, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'no-store'); next(); });

function pageHtml(key){
  const rtmp = `rtmp://127.0.0.1:${RTMP_PORT}/live`;
  const purl = `/player/${encodeURIComponent(safeKey(key))}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Swapp Live Connector</title><style>
:root{color-scheme:dark;background:#070914;color:#f6f7fb;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#3b1b7a55,transparent 35%),#070914}.wrap{max-width:1160px;margin:auto;padding:26px}.card{border:1px solid #262b42;background:#101423cc;border-radius:24px;padding:22px;box-shadow:0 20px 60px #0008}.hero{display:grid;grid-template-columns:.92fr 1.08fr;gap:18px}.tag{display:inline-flex;padding:7px 10px;border-radius:999px;background:#7c3aed22;border:1px solid #7c3aed66;color:#d7c6ff;font-size:13px}.btn{border:0;border-radius:14px;padding:13px 16px;background:#7c3aed;color:white;font-weight:900;cursor:pointer}.btn.secondary{background:#1d2335}.btn.good{background:#18bf72}.btn.big{font-size:18px;padding:16px 22px}.btn:disabled{opacity:.55;cursor:not-allowed}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.small{color:#aab3c7;font-size:14px;line-height:1.5}.player{aspect-ratio:16/9;background:#02040a;border-radius:22px;overflow:hidden;border:1px solid #30364f}iframe{width:100%;height:100%;border:0;overflow:hidden}input{width:100%;background:#070914;border:1px solid #30364f;color:white;border-radius:12px;padding:12px;margin:6px 0}.status{margin-top:12px;padding:12px;border:1px solid #30364f;border-radius:14px;background:#070914;color:#cfe5ff;font-size:14px;white-space:pre-wrap}.code{background:#050710;border:1px solid #30364f;border-radius:14px;padding:13px;word-break:break-all;font-family:ui-monospace,monospace;color:#cfe5ff}.muted{color:#aab3c7}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.topConnect{margin-bottom:18px}.mini{font-size:12px;color:#7e8aa3}@media(max-width:900px){.hero,.steps{grid-template-columns:1fr}.wrap{padding:14px}}</style></head><body><div class="wrap">
<div class="topConnect card"><span class="tag">Swapp Live Connector</span><h1>OBS → Swapp, sans configuration réseau</h1><p class="small">Cloudflare Tunnel est géré automatiquement. Ne relance pas Start en boucle : si Cloudflare limite, l’app attend le cooldown.</p><div class="row"><input id="oryonSite" value="${cleanSiteUrl(DEFAULT_SWAPP_SITE_URL)}" style="max-width:360px"><button class="btn" onclick="connectWithBrowser()">Connecter mon compte Swapp</button><button class="btn secondary" onclick="disconnectAccount()">Déconnecter</button></div><div id="accountStatus" class="status">Vérification du compte…</div></div>
<div class="hero"><section class="card"><h2>Diffuser avec OBS</h2><p class="small">Dans OBS, utilise le serveur et la clé ci-dessous. Ensuite clique une seule fois sur Démarrer sur Swapp.</p><h3>Serveur OBS</h3><div class="code" id="rtmp">${rtmp}</div><h3>Clé de stream</h3><input id="key" value="${safeKey(key)}" oninput="updateKey()"><div class="row"><button class="btn secondary" onclick="copy('rtmp')">Copier serveur</button><button class="btn secondary" onclick="copyKey()">Copier clé</button></div><div id="simpleStatus" class="status">En attente d’OBS.</div><button id="goBtn" class="btn good big" onclick="goLive()">Démarrer sur Swapp</button><button class="btn secondary" onclick="stopTunnel()">Arrêter</button></section><section class="card"><h2>Prévisualisation locale</h2><div class="player"><iframe id="frame" src="${purl}"></iframe></div><p class="small">Si l’aperçu local ne marche pas, la page publique ne marchera pas non plus.</p></section></div>
<div class="steps"><div class="card"><h3>1. OBS actif</h3><p class="small">Le connecteur détecte OBS sur le PC.</p></div><div class="card"><h3>2. HLS prêt</h3><p class="small">Le flux est transformé en lecteur web.</p></div><div class="card"><h3>3. Tunnel publié</h3><p class="small">Swapp reçoit l’URL publique Cloudflare.</p></div></div>
<details class="card" style="margin-top:16px" open><summary class="small" style="cursor:pointer">Diagnostic</summary><div id="diag" class="status">Diagnostic en cours…</div><div id="publicUrl" class="status">Tunnel non lancé.</div></details>
</div><script>
let publishedLiveKey=null;
function copy(id){navigator.clipboard.writeText(document.getElementById(id).textContent)}function copyKey(){navigator.clipboard.writeText(document.getElementById('key').value)}function currentKey(){return document.getElementById('key').value.replace(/[^a-zA-Z0-9_-]/g,'')||'${DEFAULT_KEY}'}
function updateKey(){const u='/player/'+encodeURIComponent(currentKey());const f=document.getElementById('frame'); if(!f.src.endsWith(u)) f.src=u; refreshDiag();}
async function loadAccount(){try{const r=await fetch('/api/account/status?t='+Date.now());const d=await r.json();if(d.connected){document.getElementById('key').value=d.stream_key;document.getElementById('oryonSite').value=d.site_url||'https://swapp.tv';document.getElementById('accountStatus').innerHTML='✅ Connecté à <b>'+(d.user?.login||'Swapp')+'</b>';updateKey();return true}else{document.getElementById('accountStatus').textContent='Non connecté';return false}}catch(e){document.getElementById('accountStatus').textContent='Compte non vérifié.';return false}}
async function connectWithBrowser(){const box=document.getElementById('accountStatus');const raw=(document.getElementById('oryonSite').value||'https://swapp.tv').trim();const site=/^https?:\/\//i.test(raw)?raw.replace(/\/$/,''):'https://'+raw.replace(/\/$/,'');document.getElementById('oryonSite').value=site;const cb='http://127.0.0.1:${HTTP_PORT}/api/account/browser-callback';const url=site+'/api/oryon/local-agent/browser-connect?callback='+encodeURIComponent(cb);box.textContent='Ouverture du navigateur…';window.open(url,'_blank');let attempts=0;const timer=setInterval(async()=>{attempts++;if(await loadAccount()){clearInterval(timer);box.innerHTML='✅ Compte connecté. Tu peux lancer OBS.'}if(attempts>120){clearInterval(timer);box.textContent='Connexion non confirmée. Vérifie que tu es connecté à Swapp puis réessaie.'}},1000)}
async function disconnectAccount(){await fetch('/api/account/disconnect',{method:'POST'});document.getElementById('accountStatus').textContent='Non connecté'}
async function refreshDiag(){try{const r=await fetch('/api/setup/check?key='+encodeURIComponent(currentKey())+'&t='+Date.now());const d=await r.json();const st=d.stream||{};const ok=!!(st.active&&st.ffmpeg_running&&st.hls_ready);document.getElementById('simpleStatus').innerHTML=ok?'✅ Flux prêt. Tu peux démarrer sur Swapp.':(st.active?'⏳ OBS reçu. Préparation du lecteur…':'En attente d’OBS.');document.getElementById('diag').textContent='OBS actif: '+!!st.active+'\nFFmpeg: '+!!st.ffmpeg_running+'\nHLS: '+!!st.hls_ready+'\nSegments: '+(st.hls_segments||0)+'\nTunnel: '+(d.tunnel?.active?'publié':'non publié')+(d.cooldown_seconds?('\nCooldown Cloudflare: '+d.cooldown_seconds+'s'):'');if(d.tunnel?.player_url)document.getElementById('publicUrl').textContent=d.tunnel.player_url;if(publishedLiveKey){ await fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),live_active:ok})}).catch(()=>{}); }}catch(e){document.getElementById('simpleStatus').textContent='Diagnostic indisponible.'}}
async function goLive(){const box=document.getElementById('publicUrl'),btn=document.getElementById('goBtn');btn.disabled=true;box.textContent='Vérification OBS → création du tunnel Cloudflare → publication Swapp…';try{const r=await fetch('/api/go-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),site_url:document.getElementById('oryonSite').value.trim()})});const d=await r.json();if(!d.success)throw new Error(d.error||'Publication impossible');publishedLiveKey=currentKey();box.textContent='✅ Live publié sur Swapp\n'+(d.tunnel?.url||'')+'\n'+(d.player_url||d.tunnel?.player_url||'');document.getElementById('simpleStatus').textContent='✅ Live en ligne sur Swapp.'}catch(e){box.textContent='❌ '+(e.message||e)}finally{btn.disabled=false}}
async function stopTunnel(){try{publishedLiveKey=null;await fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),live_active:false})}).catch(()=>{});await fetch('/api/tunnel/stop',{method:'POST'});document.getElementById('publicUrl').textContent='Diffusion arrêtée.'}catch(e){document.getElementById('publicUrl').textContent='Erreur: '+e.message}}
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
    const site_url = cleanSiteUrl(req.query.site_url || DEFAULT_SWAPP_SITE_URL);
    if (!token || !stream_key || !login) return res.status(400).send('Réponse Swapp incomplète.');
    saveLocalConfig({ site_url, token, stream_key, user: { login, display_name }, connectedAt: new Date().toISOString(), authMode: 'browser' });
    res.type('html').send('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Swapp Live connecté</title><style>body{font-family:system-ui;background:#070914;color:white;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:560px;border:1px solid #30364f;background:#101423;border-radius:22px;padding:24px;text-align:center}</style></head><body><div class="box"><h1>Swapp Live connecté ✅</h1><p>Compte lié : <b>'+login+'</b></p><p>Tu peux revenir dans l’application Swapp Live.</p><script>setTimeout(function(){try{window.close()}catch(e){}},1800)<\/script></div></body></html>');
  } catch(e) { res.status(500).send('Erreur Swapp Live: ' + e.message); }
});
app.get('/api/account/status', (_req, res) => { const cfg = loadLocalConfig(); res.json({ success:true, connected: Boolean(cfg.token && cfg.stream_key), site_url: cfg.site_url || DEFAULT_SWAPP_SITE_URL, user: cfg.user || null, stream_key: cfg.stream_key || DEFAULT_KEY }); });
app.post('/api/account/disconnect', (_req, res) => { clearLocalConfig(); res.json({ success:true }); });

app.post('/api/go-live', async (req, res) => {
  const cfg = loadLocalConfig();
  const key = safeKey(req.body?.key || cfg.stream_key || DEFAULT_KEY);
  try {
    if (!cfg.token) return res.status(401).json({ success:false, error:'Connecte d’abord ton compte Swapp dans l’application.' });
    const st = await waitForHlsReady(key, 50000);
    if (!st.active) return res.status(400).json({ success:false, error:`Aucun flux OBS détecté. Mets OBS sur rtmp://127.0.0.1:${RTMP_PORT}/live avec ta clé Swapp.` });
    if (!st.hls_ready) return res.status(400).json({ success:false, error:'OBS est détecté, mais le lecteur HLS n’est pas encore prêt. Attends 5 à 15 secondes puis réessaie.' });
    await startPublicTunnel({ force: false });
    const result = await registerPublicUrlOnSwapp({ siteUrl: req.body?.site_url, key });
    publishedLiveKey = key;
    await sendHeartbeatToSwapp(key, true);
    return res.json({ success:true, ...result, player_url: publicPlayerUrl(key), stream: streamStatus(key), tunnel: { ...publicTunnelInfo, player_url: publicPlayerUrl(key), status_url: publicStatusUrl() } });
  } catch (e) { log('error', 'Go live impossible', { error: e.message }); return res.status(500).json({ success:false, error:e.message, stream: streamStatus(key), tunnel: publicTunnelInfo, cooldown_seconds: Math.max(0, Math.ceil((tunnelCooldownUntil - Date.now())/1000)), log: cloudflaredLastLog.slice(-1200) }); }
});
app.post('/api/tunnel/start', async (req, res) => { try { const key = safeKey(req.body?.key || currentConfiguredKey()); const info = await startPublicTunnel({ force: !!req.body?.force }); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl(), log: cloudflaredLastLog.slice(-1200) }); } catch(e) { log('error', 'Tunnel impossible', { error: e.message }); res.status(500).json({ success:false, error:e.message, cooldown_seconds: Math.max(0, Math.ceil((tunnelCooldownUntil - Date.now())/1000)), log: cloudflaredLastLog.slice(-1200) }); } });
app.post('/api/tunnel/stop', async (_req, res) => { try { await stopPublicTunnel(); res.json({ success:true }); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });
app.get('/api/tunnel/status', (req, res) => { const key = safeKey(req.query.key || currentConfiguredKey()); res.json({ success:true, active:Boolean(publicTunnelInfo?.url && cloudflaredProcess), tunnel:publicTunnelInfo, player_url:publicPlayerUrl(key), status_url:publicStatusUrl(), cooldown_seconds: Math.max(0, Math.ceil((tunnelCooldownUntil - Date.now())/1000)), cloudflared_log:cloudflaredLastLog.slice(-1200) }); });
app.post('/api/heartbeat', async (req, res) => { try { const key = safeKey(req.body?.key || currentConfiguredKey()); await sendHeartbeatToSwapp(key, !!req.body?.live_active); res.json({ success:true, live:lastHeartbeatLive }); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });

app.get('/health', (_req, res) => res.json({ success:true, name:'Swapp Live Connector', rtmp:`rtmp://127.0.0.1:${RTMP_PORT}/live`, local_base_url:LOCAL_BASE_URL, media_root:MEDIA_ROOT, ffmpeg:ffmpegInfo(), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), tunnel:publicTunnelInfo, account: loadLocalConfig().user || null, now: Date.now() }));
app.get('/api/status', (req, res) => res.json({ success:true, ffmpeg:ffmpegInfo(), media_root:MEDIA_ROOT, stream:streamStatus(req.query.key || currentConfiguredKey()), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), tunnel:publicTunnelInfo, events }));
app.get('/api/setup/check', (req, res) => { const key = safeKey(req.query.key || currentConfiguredKey()); res.json({ success:true, obs_active:!!streamStatus(key).active, ffmpeg:true, hls:streamStatus(key).hls_ready, stream:streamStatus(key), tunnel:{ active:Boolean(publicTunnelInfo?.url && cloudflaredProcess), info:publicTunnelInfo, player_url:publicPlayerUrl(key), status_url:publicStatusUrl() }, cooldown_seconds: Math.max(0, Math.ceil((tunnelCooldownUntil - Date.now())/1000)), cloudflared:{ path:CLOUDFLARED_EXE, exists:fs.existsSync(CLOUDFLARED_EXE), log:cloudflaredLastLog.slice(-1200) } }); });

app.get('/hls/:key/:file', (req, res) => {
  const key = safeKey(req.params.key);
  const file = path.basename(String(req.params.file || ''));
  if (!/^[a-zA-Z0-9_.-]+$/.test(file)) return res.status(400).send('Bad file');
  const full = path.join(hlsDir(key), file);
  if (!full.startsWith(hlsDir(key))) return res.status(403).send('Forbidden');
  if (!fs.existsSync(full)) return res.status(404).send('Not found');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  if (/\.m3u8$/i.test(file)) res.type('application/vnd.apple.mpegurl');
  else if (/\.ts$/i.test(file)) res.type('video/mp2t');
  res.sendFile(full);
});

app.get('/player/:key', (req, res) => {
  const key = safeKey(req.params.key);
  const hls = hlsRelativeUrl(key);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Swapp Live Player</title><style>html,body{margin:0;width:100%;height:100%;background:#030508;color:white;font-family:system-ui;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#030508;pointer-events:none}.state{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#9ba7bb;padding:20px;line-height:1.45}.state b{color:white}</style></head><body><video id="v" autoplay muted playsinline></video><div id="s" class="state">Connexion au flux…</div><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script><script>
const src=${JSON.stringify(hls)},v=document.getElementById('v'),s=document.getElementById('s');let h=null,booting=false,lastOk=0;v.controls=false;function ok(){lastOk=Date.now();s.style.display='none'}function msg(t){s.style.display='grid';s.innerHTML=t}async function ready(){try{const r=await fetch(src+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)return false;const txt=await r.text();return /\\.ts/.test(txt)}catch(e){return false}}async function boot(){if(booting)return;booting=true;if(!await ready()){booting=false;msg('Connexion au flux…<br><small>OBS est peut-être encore en préparation.</small>');setTimeout(boot,1800);return}if(h){try{h.destroy()}catch(e){}h=null}if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src+'?t='+Date.now();v.addEventListener('loadedmetadata',ok,{once:true});v.addEventListener('playing',ok,{once:true});v.play().catch(()=>{});booting=false;return}if(window.Hls&&Hls.isSupported()){h=new Hls({lowLatencyMode:true,liveSyncDurationCount:2,maxLiveSyncPlaybackRate:1.2,enableWorker:true});h.loadSource(src+'?t='+Date.now());h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>{ok();v.play().catch(()=>{})});h.on(Hls.Events.ERROR,(_e,d)=>{if(d&&d.fatal){try{h.destroy()}catch(e){}h=null;booting=false;msg('Reconnexion au flux…');setTimeout(boot,1500)}});booting=false;return}booting=false;msg('Navigateur non compatible HLS.')}setInterval(()=>{if(lastOk&&Date.now()-lastOk>15000){msg('Reconnexion au flux…');boot()}},5000);boot();
</script></body></html>`;
  res.type('html').send(html);
});

app.listen(HTTP_PORT, () => { console.log(`[Swapp Live] Interface: http://localhost:${HTTP_PORT}`); console.log(`[Swapp Live] OBS server: rtmp://127.0.0.1:${RTMP_PORT}/live`); });
