const express = require('express');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let localtunnel = null;
try { localtunnel = require('localtunnel'); } catch (_) { localtunnel = null; }
let bundledFfmpeg = null;
try { bundledFfmpeg = require('ffmpeg-static'); } catch (_) { bundledFfmpeg = null; }

const HTTP_PORT = Number(process.env.ORYON_LOCAL_HTTP_PORT || 8081);
const RTMP_PORT = Number(process.env.ORYON_LOCAL_RTMP_PORT || 1935);
const MEDIA_ROOT = process.env.ORYON_LOCAL_MEDIA_ROOT || path.join(__dirname, 'media');
const DEFAULT_KEY = process.env.ORYON_STREAM_KEY || 'ta-cle-oryon';
const DEFAULT_ORYON_SITE_URL = process.env.ORYON_SITE_URL || 'https://justplayerstreamhubpro.onrender.com';
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

const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), 'OryonLocal');
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

function log(type, message, data = {}) {
  const entry = { at: new Date().toISOString(), type, message, data };
  events.unshift(entry);
  while (events.length > 200) events.pop();
  console.log(`[Oryon Live] ${type}: ${message}`, data || '');
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
  return { key: k, active: Boolean(active[k]), ffmpeg_running: Boolean(ffmpegJobs[k]), hls_exists: fs.existsSync(hlsPath(k)), hls_url: hlsUrl(k), hls_path: hlsPath(k), hls_files: files, started_at: active[k]?.startedAt || null, last_seen: active[k]?.lastSeen || null };
}
async function waitForHlsReady(key = currentConfiguredKey(), timeoutMs = 35000) {
  const start = Date.now();
  const k = safeKey(key);
  while (Date.now() - start < timeoutMs) {
    const st = streamStatus(k);
    if (st.hls_exists) return st;
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
nms.on('donePublish', (_id, streamPath) => { const key = safeKey(streamPath.split('/').pop()); delete active[key]; stopHlsTransmux(key); log('rtmp', 'Flux OBS arrêté', { streamPath, key }); setTimeout(() => sendHeartbeatToOryon(key, false).catch(()=>{}), 250); });
try { nms.run(); log('system', 'Serveur RTMP lancé', { rtmp: `rtmp://127.0.0.1:${RTMP_PORT}/live`, ffmpeg: ffmpegInfo() }); } catch (e) { log('error', 'RTMP impossible', { error: e.message }); }

function normalizePublicBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(url)) throw new Error('URL publique invalide : elle doit commencer par https://');
  return url;
}
function setManualPublicUrl(url) { publicTunnelInfo = { url: normalizePublicBaseUrl(url), startedAt: new Date().toISOString(), provider: 'manual' }; log('tunnel', 'URL publique manuelle', publicTunnelInfo); return publicTunnelInfo; }
function withTimeout(promise, ms, label) { let timer; const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label || 'Délai dépassé')), ms); }); return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)); }
async function startCloudflaredProvider() {
  if (cloudflaredProcess && publicTunnelInfo?.url) return publicTunnelInfo;
  cloudflaredLastLog = '';
  return await withTimeout(new Promise((resolve, reject) => {
    const child = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', `http://127.0.0.1:${HTTP_PORT}`], { windowsHide: true });
    cloudflaredProcess = child;
    let resolved = false;
    const onData = buf => {
      const text = String(buf || '');
      cloudflaredLastLog = (cloudflaredLastLog + text).slice(-6000);
      const match = cloudflaredLastLog.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) { resolved = true; publicTunnelInfo = { url: match[0], startedAt: new Date().toISOString(), provider: 'cloudflared' }; log('tunnel', 'Cloudflare lancé', publicTunnelInfo); resolve(publicTunnelInfo); }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('error', err => { if (!resolved) reject(new Error(`cloudflared introuvable : ${err.message}`)); });
    child.on('exit', (code, signal) => { const ok = resolved; if (publicTunnelInfo?.provider === 'cloudflared') publicTunnelInfo = null; cloudflaredProcess = null; if (!ok) reject(new Error(`cloudflared arrêté sans URL. Code=${code || ''} Signal=${signal || ''}. ${cloudflaredLastLog.slice(-800)}`)); });
  }), 25000, 'cloudflared ne donne pas d’URL après 25 secondes');
}
async function startLocalTunnelProvider() {
  if (!localtunnel) throw new Error('localtunnel absent du package');
  const tunnel = await withTimeout(localtunnel({ port: HTTP_PORT }), 20000, 'localtunnel ne répond pas');
  publicTunnel = tunnel;
  publicTunnelInfo = { url: tunnel.url.replace(/\/$/, ''), startedAt: new Date().toISOString(), provider: 'localtunnel' };
  tunnel.on('close', () => { publicTunnel = null; if (publicTunnelInfo?.provider === 'localtunnel') publicTunnelInfo = null; });
  log('tunnel', 'localtunnel lancé', publicTunnelInfo);
  return publicTunnelInfo;
}
async function startPublicTunnel(provider = 'auto') {
  if (publicTunnelInfo?.url && (publicTunnel || cloudflaredProcess || publicTunnelInfo.provider === 'manual')) return publicTunnelInfo;
  const requested = String(provider || 'auto').toLowerCase();
  const errors = [];
  const order = requested === 'auto' ? ['cloudflared', 'localtunnel'] : [requested];
  for (const p of order) {
    try { return p === 'cloudflared' ? await startCloudflaredProvider() : await startLocalTunnelProvider(); }
    catch (e) { errors.push(`${p}: ${e.message}`); log('error', `${p} impossible`, { error: e.message }); }
  }
  throw new Error(`Aucun tunnel n’a démarré. ${errors.join(' | ')}`);
}
async function stopPublicTunnel() { if (publicTunnel) { try { publicTunnel.close(); } catch (_) {} } if (cloudflaredProcess) { try { cloudflaredProcess.kill(); } catch (_) {} } publicTunnel = null; cloudflaredProcess = null; publicTunnelInfo = null; return { success: true }; }
async function registerPublicUrlOnOryon({ siteUrl, key }) {
  const cfg = loadLocalConfig();
  const base = cleanSiteUrl(siteUrl || cfg.site_url || DEFAULT_ORYON_SITE_URL);
  if (!base || !/^https?:\/\//i.test(base)) throw new Error('URL du site Oryon invalide');
  if (!publicTunnelInfo?.url) throw new Error('Tunnel public non lancé');
  const player = publicPlayerUrl(key);
  if (!player || /localhost|127\.0\.0\.1/i.test(player)) throw new Error('URL publique invalide : le tunnel n’a pas fourni d’adresse publique.');
  const payload = { stream_key: safeKey(key), public_base_url: publicTunnelInfo.url, player_url: player, status_url: publicStatusUrl(), provider: publicTunnelInfo.provider || 'auto' };
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
  const r = await fetch(`${base}/api/oryon/local-agent/register-public-url`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || `Oryon a refusé l’enregistrement (${r.status})`);
  log('publish', 'Live envoyé à Oryon', { siteUrl: base, player_url: payload.player_url });
  return { success: true, site_url: base, ...payload, response: j };
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((_, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });

function pageHtml(key){
  const cfg = loadLocalConfig();
  const site = cfg.site_url || DEFAULT_ORYON_SITE_URL;
  const login = cfg.user?.login || '';
  const purl = playerUrl(key);
  const rtmp = `rtmp://127.0.0.1:${RTMP_PORT}/live`;
  return String.raw`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oryon Live</title><style>
:root{color-scheme:dark;background:#070914;color:#f6f7fb;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#3b1b7a55,transparent 35%),#070914}.wrap{max-width:1160px;margin:auto;padding:26px}.card{border:1px solid #262b42;background:#101423cc;border-radius:24px;padding:22px;box-shadow:0 20px 60px #0008}.hero{display:grid;grid-template-columns:.92fr 1.08fr;gap:18px}.tag{display:inline-flex;padding:7px 10px;border-radius:999px;background:#7c3aed22;border:1px solid #7c3aed66;color:#d7c6ff;font-size:13px}.btn{border:0;border-radius:14px;padding:13px 16px;background:#7c3aed;color:white;font-weight:900;cursor:pointer}.btn.secondary{background:#1d2335}.btn.good{background:#18bf72}.btn.big{font-size:18px;padding:16px 22px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.small{color:#aab3c7;font-size:14px;line-height:1.5}.player{aspect-ratio:16/9;background:#02040a;border-radius:22px;overflow:hidden;border:1px solid #30364f}iframe{width:100%;height:100%;border:0;overflow:hidden}input{width:100%;background:#070914;border:1px solid #30364f;color:white;border-radius:12px;padding:12px;margin:6px 0}.status{margin-top:12px;padding:12px;border:1px solid #30364f;border-radius:14px;background:#070914;color:#cfe5ff;font-size:14px;white-space:pre-wrap}.code{background:#050710;border:1px solid #30364f;border-radius:14px;padding:13px;word-break:break-all;font-family:ui-monospace,monospace;color:#cfe5ff}.muted{color:#aab3c7}.ok{color:#86efac}.warn{color:#fde68a}.hidden{display:none!important}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}.center{text-align:center}.topConnect{margin-bottom:18px}.previewHint{margin-top:10px}.mini{font-size:12px;color:#7e8aa3}@media(max-width:900px){.hero,.steps{grid-template-columns:1fr}.wrap{padding:14px}}</style></head><body><div class="wrap">
<section class="card topConnect"><span class="tag">Oryon Live</span><h1>Connecte ton compte Oryon</h1><p class="small">Connecte une fois ton compte. Ensuite Oryon Live récupère ta clé et publie ton direct automatiquement.</p><label class="small">Adresse du site Oryon</label><input id="oryonSite" value="${site}"><div class="row"><button class="btn big" onclick="connectWithBrowser()">Connecter avec mon compte Oryon</button><button class="btn secondary" onclick="disconnectAccount()">Déconnecter</button><button class="btn secondary" onclick="loadAccount()">Actualiser</button></div><div id="accountStatus" class="status">${login ? '✅ Connecté à '+login : 'Non connecté'}</div></section>
<div class="hero"><section class="card"><h1>Diffuser avec OBS</h1><p class="small">Laisse cette app ouverte. Dans OBS, utilise le serveur et la clé ci-dessous.</p><h3>Serveur OBS</h3><div class="code" id="rtmp">${rtmp}</div><h3>Clé de stream</h3><input id="key" value="${key}" oninput="updateKey()"><div class="row"><button class="btn secondary" onclick="copy('rtmp')">Copier serveur</button><button class="btn secondary" onclick="copyKey()">Copier clé</button></div><p class="small">OBS → Paramètres → Diffusion → Service personnalisé. Désactive la vidéo multipiste.</p><div id="simpleStatus" class="status">En attente d’OBS.</div><button class="btn good big" onclick="goLive()">Démarrer sur Oryon</button><button class="btn secondary" onclick="stopTunnel()">Arrêter</button></section><section class="card"><h2>Prévisualisation</h2><div class="player"><iframe id="frame" src="${purl}"></iframe></div><p class="small previewHint">Aperçu local du direct. Garde cette application ouverte pendant le live.</p></section></div>
<div class="steps"><div class="card"><h3>1. Connecte</h3><p class="small">Oryon Live récupère ta clé.</p></div><div class="card"><h3>2. Lance OBS</h3><p class="small">Serveur personnalisé + clé Oryon.</p></div><div class="card"><h3>3. Démarre</h3><p class="small">Le live s’affiche sur ta chaîne.</p></div></div>
<details class="card" style="margin-top:16px"><summary class="small" style="cursor:pointer">Diagnostic technique</summary><div id="diag" class="status">Diagnostic en cours…</div><div id="publicUrl" class="status">Tunnel non lancé.</div></details>
</div><script>
function copy(id){navigator.clipboard.writeText(document.getElementById(id).textContent)}function copyKey(){navigator.clipboard.writeText(document.getElementById('key').value)}function currentKey(){return document.getElementById('key').value.replace(/[^a-zA-Z0-9_-]/g,'')||'${DEFAULT_KEY}'}
function updateKey(){const u='/player/'+encodeURIComponent(currentKey());const f=document.getElementById('frame'); if(!f.src.endsWith(u)) f.src=u; refreshDiag();}
async function loadAccount(){try{const r=await fetch('/api/account/status?t='+Date.now());const d=await r.json();if(d.connected){document.getElementById('key').value=d.stream_key;document.getElementById('oryonSite').value=d.site_url||document.getElementById('oryonSite').value;document.getElementById('accountStatus').innerHTML='✅ Connecté à <b>'+(d.user?.login||'Oryon')+'</b>';updateKey();return true}else{document.getElementById('accountStatus').textContent='Non connecté';return false}}catch(e){return false}}
async function connectWithBrowser(){const box=document.getElementById('accountStatus');const raw=(document.getElementById('oryonSite').value||'').trim();const site=/^https?:\/\//i.test(raw)?raw.replace(/\/$/,''):'https://'+raw.replace(/\/$/,'');document.getElementById('oryonSite').value=site;const cb='http://127.0.0.1:8081/api/account/browser-callback';const url=site+'/api/oryon/local-agent/browser-connect?callback='+encodeURIComponent(cb);box.textContent='Ouverture du navigateur…';window.open(url,'_blank');let attempts=0;const timer=setInterval(async()=>{attempts++;if(await loadAccount()){clearInterval(timer);box.innerHTML='✅ Compte connecté. Tu peux lancer OBS.'}if(attempts>120){clearInterval(timer);box.textContent='Connexion non confirmée. Vérifie que tu es connecté à Oryon puis réessaie.'}},1000)}
async function disconnectAccount(){await fetch('/api/account/disconnect',{method:'POST'});document.getElementById('accountStatus').textContent='Non connecté'}
async function sendHeartbeat(live){try{const key=currentKey();const tun=await fetch('/api/tunnel/status?key='+encodeURIComponent(key)+'&t='+Date.now()).then(r=>r.json()).catch(()=>({}));await fetch('/api/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,live_active:!!live,player_url:tun.player_url||'',status_url:tun.status_url||''})})}catch(e){}}
async function refreshDiag(){try{const r=await fetch('/api/status?key='+encodeURIComponent(currentKey())+'&t='+Date.now());const d=await r.json();const st=d.stream||{};const ok=st.active&&st.ffmpeg_running&&st.hls_exists;document.getElementById('simpleStatus').innerHTML=ok?'✅ Flux prêt. Tu peux démarrer sur Oryon.':(st.active?'⏳ Flux reçu. Préparation…':'En attente d’OBS.'); const diag=document.getElementById('diag'); if(diag) diag.innerHTML=ok?'Flux prêt.':(st.active?'OBS reçu, conversion en cours.':'Aucun flux OBS détecté.'); if(publishedLiveKey){ await sendHeartbeat(ok); }}catch(e){document.getElementById('simpleStatus').textContent='Diagnostic indisponible.'}}
async function goLive(){const box=document.getElementById('publicUrl');box.textContent='Vérification OBS → publication Oryon…';try{const r=await fetch('/api/go-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),site_url:document.getElementById('oryonSite').value.trim()})});const d=await r.json();if(!d.success)throw new Error(d.error||'Publication impossible');publishedLiveKey=currentKey(); box.textContent='✅ Live en ligne sur ta chaîne Oryon.'; document.getElementById('simpleStatus').textContent='✅ Live en ligne sur Oryon.'; await sendHeartbeat(true)}catch(e){box.textContent='❌ '+(e.message||e)}}
async function stopTunnel(){try{await sendHeartbeat(false); publishedLiveKey=null; await fetch('/api/tunnel/stop',{method:'POST'});document.getElementById('publicUrl').textContent='Diffusion arrêtée.'}catch(e){document.getElementById('publicUrl').textContent='Erreur: '+e.message}}
setInterval(refreshDiag,3000);loadAccount();refreshDiag();
</script></body></html>`;
}


app.get('/', (req, res) => { const cfg = loadLocalConfig(); const key = safeKey(req.query.key || cfg.stream_key || DEFAULT_KEY); res.type('html').send(pageHtml(key)); });
app.get('/api/account/browser-callback', (req, res) => {
  try {
    if (String(req.query.ok || '') !== '1') return res.status(400).send('Connexion Oryon refusée.');
    const token = String(req.query.token || '').trim();
    const stream_key = safeKey(req.query.stream_key || '');
    const login = String(req.query.login || '').trim();
    const display_name = String(req.query.display_name || login).trim();
    const site_url = cleanSiteUrl(req.query.site_url || DEFAULT_ORYON_SITE_URL);
    if (!token || !stream_key || !login) return res.status(400).send('Réponse Oryon incomplète.');
    saveLocalConfig({ site_url, token, stream_key, user: { login, display_name }, connectedAt: new Date().toISOString(), authMode: 'browser' });
    res.type('html').send('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Oryon Live connecté</title><style>body{font-family:system-ui;background:#070914;color:white;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:560px;border:1px solid #30364f;background:#101423;border-radius:22px;padding:24px;text-align:center}</style></head><body><div class="box"><h1>Oryon Live connecté ✅</h1><p>Compte lié : <b>'+login+'</b></p><p>Tu peux revenir dans l’application Oryon Live.</p><script>setTimeout(function(){try{window.close()}catch(e){}},1800)<\/script></div></body></html>');
  } catch(e) { res.status(500).send('Erreur Oryon Live: ' + e.message); }
});

app.get('/api/account/status', (_req, res) => { const cfg = loadLocalConfig(); res.json({ success:true, connected: Boolean(cfg.token && cfg.stream_key), site_url: cfg.site_url || DEFAULT_ORYON_SITE_URL, user: cfg.user || null, stream_key: cfg.stream_key || DEFAULT_KEY }); });
app.post('/api/account/connect', async (req, res) => {
  try {
    const base = cleanSiteUrl(req.body?.site_url || DEFAULT_ORYON_SITE_URL);
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');
    if (!base || !/^https?:\/\//i.test(base)) return res.status(400).json({ success:false, error:'Adresse du site Oryon invalide.' });
    if (!login || !password) return res.status(400).json({ success:false, error:'Pseudo et mot de passe requis.' });
    const r = await fetch(`${base}/api/oryon/local-agent/connect`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ login, password, app:'Oryon Live' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) return res.status(r.status || 500).json({ success:false, error:j.error || 'Connexion Oryon refusée.' });
    const cfg = saveLocalConfig({ site_url: base, token: j.token, stream_key: j.stream_key, user: j.user, connectedAt: new Date().toISOString() });
    return res.json({ success:true, site_url: cfg.site_url, token: cfg.token, stream_key: cfg.stream_key, user: cfg.user });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
});
app.post('/api/account/disconnect', (_req, res) => { clearLocalConfig(); res.json({ success:true }); });

app.post('/api/go-live', async (req, res) => {
  const cfg = loadLocalConfig();
  const key = safeKey(req.body?.key || cfg.stream_key || DEFAULT_KEY);
  try {
    if (!cfg.token) return res.status(401).json({ success:false, error:'Connecte d’abord ton compte Oryon dans l’application.' });
    const st = await waitForHlsReady(key, 35000);
    if (!st.active) return res.status(400).json({ success:false, error:`Aucun flux OBS détecté. Mets OBS sur rtmp://127.0.0.1:${RTMP_PORT}/live avec ta clé Oryon.` });
    if (!st.hls_exists) return res.status(400).json({ success:false, error:'OBS est détecté, mais le player local n’est pas encore prêt. Attends 5 à 15 secondes puis réessaie.' });
    await startPublicTunnel('auto');
    const result = await registerPublicUrlOnOryon({ siteUrl: req.body?.site_url, key });
    return res.json({ success:true, ...result, stream: streamStatus(key), tunnel: publicTunnelInfo });
  } catch (e) { log('error', 'Go live auto impossible', { error: e.message }); return res.status(500).json({ success:false, error:e.message, stream: streamStatus(key), tunnel: publicTunnelInfo, log: cloudflaredLastLog.slice(-1000) }); }
});
app.post('/api/tunnel/start', async (req, res) => { try { const key = safeKey(req.body?.key || currentConfiguredKey()); const info = await startPublicTunnel(req.body?.provider || 'auto'); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl(), log: cloudflaredLastLog.slice(-1000) }); } catch(e) { log('error', 'Tunnel impossible', { error: e.message }); res.status(500).json({ success:false, error:e.message, log: cloudflaredLastLog.slice(-1000) }); } });
app.post('/api/tunnel/manual', async (req, res) => { try { const key = safeKey(req.body?.key || currentConfiguredKey()); const info = setManualPublicUrl(req.body?.url); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl() }); } catch(e) { res.status(400).json({ success:false, error:e.message }); } });
app.post('/api/tunnel/stop', async (_req, res) => { try { await stopPublicTunnel(); res.json({ success:true }); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });
app.get('/api/tunnel/status', (req, res) => { const key = safeKey(req.query.key || currentConfiguredKey()); res.json({ success:true, active:Boolean(publicTunnelInfo?.url), tunnel:publicTunnelInfo, player_url:publicPlayerUrl(key), status_url:publicStatusUrl(), cloudflared_log:cloudflaredLastLog.slice(-1000) }); });
app.post('/api/publish-to-oryon', async (req, res) => { try { const cfg = loadLocalConfig(); const key = safeKey(req.body?.key || cfg.stream_key || DEFAULT_KEY); if (!cfg.token) return res.status(401).json({ success:false, error:'Connecte d’abord ton compte Oryon.' }); if (!publicTunnelInfo?.url) await startPublicTunnel('auto'); const result = await registerPublicUrlOnOryon({ siteUrl:req.body?.site_url, key }); res.json(result); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });

app.post('/api/heartbeat', async (req, res) => {
  try {
    const cfg = loadLocalConfig();
    if(!cfg.token) return res.status(401).json({ success:false, error:'Compte Oryon non connecté.' });
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

async function sendHeartbeatToOryon(key, live){
  try {
    const cfg = loadLocalConfig();
    if(!cfg.token) return;
    const base = cleanSiteUrl(cfg.site_url || DEFAULT_ORYON_SITE_URL);
    const headers = { 'Content-Type':'application/json', 'Authorization': `Bearer ${cfg.token}` };
    const body = JSON.stringify({ stream_key:safeKey(key), live_active:!!live, player_url:live?publicPlayerUrl(key):'', status_url:live?publicStatusUrl():'' });
    await fetch(`${base}/api/oryon/local-agent/heartbeat`, { method:'POST', headers, body });
  } catch(_) {}
}

app.get('/health', (_req, res) => res.json({ success:true, name:'Oryon Live', rtmp:`rtmp://127.0.0.1:${RTMP_PORT}/live`, local_base_url:LOCAL_BASE_URL, media_root:MEDIA_ROOT, ffmpeg:ffmpegInfo(), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), tunnel:publicTunnelInfo, account: loadLocalConfig().user || null }));
app.get('/api/status', (req, res) => res.json({ success:true, ffmpeg:ffmpegInfo(), media_root:MEDIA_ROOT, stream:streamStatus(req.query.key || currentConfiguredKey()), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), events }));
app.get('/player/:key', (req, res) => { const key = safeKey(req.params.key); const hls = hlsUrl(key); const html = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Oryon Live Player</title><style>html,body{margin:0;width:100%;height:100%;background:#030508;color:white;font-family:system-ui;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#030508;pointer-events:none}.state{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#9ba7bb;padding:20px}</style></head><body><video id=\"v\" autoplay muted playsinline></video><div id=\"s\" class=\"state\">Connexion au flux…</div><script src=\"https://cdn.jsdelivr.net/npm/hls.js@latest\"></script><script>const src=" + JSON.stringify(hls) + ",v=document.getElementById(\"v\"),s=document.getElementById(\"s\");let h=null,booted=false;v.controls=false;function ok(){s.style.display=\"none\"}function msg(t){s.style.display=\"grid\";s.textContent=t}async function ready(){try{const r=await fetch(src+\"?t=\"+Date.now(),{cache:\"no-store\"});return r.ok}catch(e){return false}}async function boot(){if(booted)return;if(!await ready()){msg(\"Connexion au flux…\");setTimeout(boot,2000);return}booted=true;if(v.canPlayType(\"application/vnd.apple.mpegurl\")){v.src=src+\"?t=\"+Date.now();v.addEventListener(\"loadedmetadata\",ok,{once:true});v.play().catch(()=>{});return}if(window.Hls&&Hls.isSupported()){h=new Hls({lowLatencyMode:true,liveSyncDurationCount:2});h.loadSource(src+\"?t=\"+Date.now());h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>{ok();v.play().catch(()=>{})});h.on(Hls.Events.ERROR,(_e,d)=>{if(d&&d.fatal){booted=false;try{h.destroy()}catch(e){};h=null;msg(\"Reconnexion…\");setTimeout(boot,2000)}});return}msg(\"Navigateur non compatible HLS.\")}boot();</script></body></html>"; res.type('html').send(html); });

app.listen(HTTP_PORT, () => { console.log(`[Oryon Live] Interface: http://localhost:${HTTP_PORT}`); console.log(`[Oryon Live] OBS server: rtmp://127.0.0.1:${RTMP_PORT}/live`); });
