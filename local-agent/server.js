const express = require('express');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
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
const FFMPEG_PATH = process.env.FFMPEG_PATH || bundledFfmpeg || 'ffmpeg';
const CLOUDFLARED_PATH = process.env.CLOUDFLARED_PATH || 'cloudflared';
const PUBLIC_BASE_URL = process.env.ORYON_LOCAL_PUBLIC_URL || `http://localhost:${HTTP_PORT}`;
const TRANSCODE_MODE = String(process.env.ORYON_LOCAL_TRANSCODE || 'copy').toLowerCase();

fs.mkdirSync(path.join(MEDIA_ROOT, 'live'), { recursive: true });

const active = {};
const ffmpegJobs = {};
const events = [];
let publicTunnel = null;
let publicTunnelInfo = null;
let cloudflaredProcess = null;
let cloudflaredLastLog = '';

function log(type, message, data = {}) {
  const entry = { at: new Date().toISOString(), type, message, data };
  events.unshift(entry);
  while (events.length > 180) events.pop();
  console.log(`[Oryon Local] ${type}: ${message}`, data || '');
}
function safeKey(value) { return String(value || DEFAULT_KEY).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_KEY; }
function hlsDir(key = DEFAULT_KEY) { return path.join(MEDIA_ROOT, 'live', safeKey(key)); }
function hlsPath(key = DEFAULT_KEY) { return path.join(hlsDir(key), 'index.m3u8'); }
function hlsUrl(key = DEFAULT_KEY) { return `${PUBLIC_BASE_URL}/hls/${encodeURIComponent(safeKey(key))}/index.m3u8`; }
function playerUrl(key = DEFAULT_KEY) { return `${PUBLIC_BASE_URL}/player/${encodeURIComponent(safeKey(key))}`; }
function publicPlayerUrl(key = DEFAULT_KEY) { return publicTunnelInfo?.url ? `${publicTunnelInfo.url}/player/${encodeURIComponent(safeKey(key))}` : ''; }
function publicStatusUrl() { return publicTunnelInfo?.url ? `${publicTunnelInfo.url}/health` : ''; }
function ffmpegInfo() { return { path: FFMPEG_PATH, bundled: Boolean(bundledFfmpeg), exists: FFMPEG_PATH === 'ffmpeg' ? null : fs.existsSync(FFMPEG_PATH), mode: TRANSCODE_MODE }; }
function listFiles(dir) { try { return fs.readdirSync(dir); } catch (_) { return []; } }
function streamStatus(key = DEFAULT_KEY) {
  const k = safeKey(key);
  const files = listFiles(hlsDir(k));
  return { key: k, active: Boolean(active[k]), ffmpeg_running: Boolean(ffmpegJobs[k]), hls_exists: fs.existsSync(hlsPath(k)), hls_url: hlsUrl(k), hls_path: hlsPath(k), hls_files: files, started_at: active[k]?.startedAt || null, last_seen: active[k]?.lastSeen || null };
}
async function waitForHlsReady(key = DEFAULT_KEY, timeoutMs = 35000) {
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
nms.on('donePublish', (_id, streamPath) => { const key = safeKey(streamPath.split('/').pop()); delete active[key]; stopHlsTransmux(key); log('rtmp', 'Flux OBS arrêté', { streamPath, key }); });
try { nms.run(); log('system', 'Serveur RTMP lancé', { rtmp: `rtmp://127.0.0.1:${RTMP_PORT}/live`, ffmpeg: ffmpegInfo() }); } catch (e) { log('error', 'RTMP impossible', { error: e.message }); }

function normalizePublicBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(url)) throw new Error('URL publique invalide : elle doit commencer par https://');
  return url;
}
function setManualPublicUrl(url) { publicTunnelInfo = { url: normalizePublicBaseUrl(url), startedAt: new Date().toISOString(), provider: 'manual' }; log('tunnel', 'URL publique manuelle', publicTunnelInfo); return publicTunnelInfo; }
function withTimeout(promise, ms, label) { let timer; const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label || 'Délai dépassé')), ms); }); return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)); }
async function startCloudflaredProvider() {
  if (cloudflaredProcess) return publicTunnelInfo;
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
  const base = String(siteUrl || DEFAULT_ORYON_SITE_URL || '').trim().replace(/\/$/, '');
  if (!base || !/^https?:\/\//i.test(base)) throw new Error('URL du site Oryon invalide');
  if (!publicTunnelInfo?.url) throw new Error('Tunnel public non lancé');
  const payload = { stream_key: safeKey(key), public_base_url: publicTunnelInfo.url, player_url: publicPlayerUrl(key), status_url: publicStatusUrl(), provider: publicTunnelInfo.provider || 'auto' };
  const r = await fetch(`${base}/api/oryon/local-agent/register-public-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || `Oryon a refusé l’enregistrement (${r.status})`);
  log('publish', 'Live envoyé à Oryon', { siteUrl: base, player_url: payload.player_url });
  return { success: true, site_url: base, ...payload, response: j };
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((_, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });

app.get('/', (req, res) => {
  const key = safeKey(req.query.key || DEFAULT_KEY);
  const rtmp = `rtmp://127.0.0.1:${RTMP_PORT}/live`;
  const purl = playerUrl(key);
  res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oryon Local</title><style>
:root{color-scheme:dark;background:#070914;color:#f6f7fb;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#3b1b7a55,transparent 35%),#070914}.wrap{max-width:1180px;margin:auto;padding:28px}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:20px;align-items:stretch}.card{border:1px solid #262b42;background:#101423cc;border-radius:24px;padding:22px;box-shadow:0 20px 60px #0008}.tag{display:inline-flex;padding:7px 10px;border-radius:999px;background:#7c3aed22;border:1px solid #7c3aed66;color:#d7c6ff;font-size:13px}.code{background:#050710;border:1px solid #30364f;border-radius:14px;padding:13px;word-break:break-all;font-family:ui-monospace,monospace;color:#cfe5ff}.btn{border:0;border-radius:14px;padding:12px 15px;background:#7c3aed;color:white;font-weight:900;cursor:pointer}.btn.secondary{background:#1d2335}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}.small{color:#aab3c7;font-size:14px;line-height:1.5}.player{aspect-ratio:16/9;background:#02040a;border-radius:22px;overflow:hidden;border:1px solid #30364f}iframe{width:100%;height:100%;border:0}input{width:100%;background:#070914;border:1px solid #30364f;color:white;border-radius:12px;padding:12px;margin:6px 0}.status{margin-top:12px;padding:12px;border:1px solid #30364f;border-radius:14px;background:#070914;color:#cfe5ff;font-size:13px;white-space:pre-wrap}.big{font-size:18px;padding:15px 20px}@media(max-width:850px){.hero,.grid{grid-template-columns:1fr}}</style></head><body><div class="wrap"><div class="hero"><section class="card"><span class="tag">Oryon Local est lancé</span><h1>Ton PC devient ton serveur de live.</h1><p class="small">Laisse cette application ouverte. Dans OBS, mets le serveur et la clé ci-dessous.</p><h3>Serveur OBS</h3><div class="code" id="rtmp">${rtmp}</div><h3>Clé de stream</h3><input id="key" value="${key}" oninput="updateKey()"><div class="row"><button class="btn secondary" onclick="copy('rtmp')">Copier serveur</button><button class="btn secondary" onclick="copyKey()">Copier clé</button><a class="btn secondary" id="openPlayer" href="${purl}" target="_blank" style="text-decoration:none">Ouvrir le player</a></div><p class="small">OBS → Paramètres → Diffusion → Service personnalisé. Désactive la vidéo multipiste.</p><div id="diag" class="status">Diagnostic en cours…</div></section><section class="card"><h2>Prévisualisation locale</h2><div class="player"><iframe id="frame" src="${purl}"></iframe></div><p class="small">Le flux peut prendre 5 à 15 secondes après le démarrage OBS.</p></section></div><section class="card" style="margin-top:16px"><span class="tag">Publication en 1 clic</span><h2>Démarrer la diffusion publique</h2><p class="small">Lance OBS, puis clique ici. L’app vérifie le flux, crée l’URL publique et l’envoie automatiquement sur ta page Oryon.</p><label class="small">Adresse du site Oryon</label><input id="oryonSite" value="${DEFAULT_ORYON_SITE_URL}"><div class="row"><button class="btn big" onclick="goLive()">Démarrer sur Oryon</button><button class="btn secondary" onclick="stopTunnel()">Arrêter le tunnel</button></div><details style="margin-top:12px"><summary class="small" style="cursor:pointer">Options avancées</summary><div class="row" style="margin-top:10px"><button class="btn secondary" onclick="startTunnel('auto')">Tunnel auto seul</button><button class="btn secondary" onclick="publishToOryon()">Envoyer URL actuelle</button></div><input id="manualPublicUrl" placeholder="https://xxxxx.trycloudflare.com"><button class="btn secondary" onclick="useManualUrl()">Utiliser cette URL publique</button></details><div id="publicUrl" class="status">Prêt. Lance OBS puis clique “Démarrer sur Oryon”.</div></section><div class="grid"><div class="card"><h3>1. OBS</h3><p class="small">Serveur personnalisé + clé Oryon.</p></div><div class="card"><h3>2. Player</h3><p class="small">La preview locale valide que ton flux arrive.</p></div><div class="card"><h3>3. Oryon</h3><p class="small">Le bouton publie automatiquement ton live sur ta chaîne.</p></div></div></div><script>
function copy(id){navigator.clipboard.writeText(document.getElementById(id).textContent)}function copyKey(){navigator.clipboard.writeText(document.getElementById('key').value)}function currentKey(){return document.getElementById('key').value.replace(/[^a-zA-Z0-9_-]/g,'')||'${DEFAULT_KEY}'}function updateKey(){const u='/player/'+encodeURIComponent(currentKey());document.getElementById('frame').src=u;document.getElementById('openPlayer').href=u;refreshDiag()}
async function refreshDiag(){try{const r=await fetch('/api/status?key='+encodeURIComponent(currentKey())+'&t='+Date.now());const d=await r.json();const st=d.stream||{};const last=(d.events||[]).find(e=>e.type==='ffmpeg'||e.type==='error'||e.type==='publish'||e.type==='tunnel');document.getElementById('diag').innerHTML=(st.active?'✅ OBS envoie un flux RTMP.':'⚠️ Aucun flux OBS détecté pour cette clé.')+'\n'+(st.ffmpeg_running?'✅ Conversion FFmpeg active.':'⚠️ Conversion FFmpeg non active.')+'\n'+(st.hls_exists?'✅ Player local prêt.':'⏳ Player local pas encore prêt.')+'\nFFmpeg: '+(d.ffmpeg.exists===false?'introuvable':d.ffmpeg.path)+'\nFichiers HLS: '+((st.hls_files||[]).join(', ')||'aucun')+'\nDernier log: '+(last?last.message:'aucun')}catch(e){document.getElementById('diag').textContent='Diagnostic indisponible: '+e.message}}
async function goLive(){const box=document.getElementById('publicUrl');box.textContent='Vérification OBS → création tunnel → publication Oryon…';try{const r=await fetch('/api/go-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),site_url:document.getElementById('oryonSite').value.trim()})});const d=await r.json();if(!d.success)throw new Error(d.error||'Publication impossible');box.innerHTML='✅ Live public envoyé sur Oryon\nPlayer public : '+d.player_url+'\n\nGarde OBS et Oryon Local ouverts.';refreshDiag()}catch(e){box.innerHTML='❌ '+(e.message||e)+'\n\nVérifie OBS, la clé, et que la vidéo multipiste OBS est désactivée.'}}
async function startTunnel(provider='auto'){const box=document.getElementById('publicUrl');box.textContent='Création du tunnel public…';try{const r=await fetch('/api/tunnel/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),provider})});const d=await r.json();if(!d.success)throw new Error(d.error||'Erreur tunnel');box.innerHTML='✅ Tunnel prêt\nPlayer public : '+d.player_url}catch(e){box.textContent='❌ '+(e.message||e)}}
async function useManualUrl(){const box=document.getElementById('publicUrl');try{const r=await fetch('/api/tunnel/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),url:document.getElementById('manualPublicUrl').value.trim()})});const d=await r.json();if(!d.success)throw new Error(d.error||'URL refusée');box.innerHTML='✅ URL publique enregistrée\nPlayer public : '+d.player_url}catch(e){box.textContent='❌ '+(e.message||e)}}
async function publishToOryon(){const box=document.getElementById('publicUrl');box.textContent='Envoi vers Oryon…';try{const r=await fetch('/api/publish-to-oryon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:currentKey(),site_url:document.getElementById('oryonSite').value.trim()})});const d=await r.json();if(!d.success)throw new Error(d.error||'Refusé');box.innerHTML='✅ Envoyé sur Oryon\n'+d.player_url}catch(e){box.textContent='❌ '+(e.message||e)}}
async function stopTunnel(){try{await fetch('/api/tunnel/stop',{method:'POST'});document.getElementById('publicUrl').textContent='Tunnel arrêté.'}catch(e){document.getElementById('publicUrl').textContent='Erreur: '+e.message}}
async function refreshTunnel(){try{const r=await fetch('/api/tunnel/status?key='+encodeURIComponent(currentKey())+'&t='+Date.now());const d=await r.json();if(d.active)document.getElementById('publicUrl').innerHTML='✅ Tunnel actif\nPlayer public : '+d.player_url}catch(_){}}
setInterval(refreshDiag,2000);setInterval(refreshTunnel,5000);refreshDiag();refreshTunnel();</script></body></html>`);
});

app.post('/api/go-live', async (req, res) => {
  const key = safeKey(req.body?.key || DEFAULT_KEY);
  try {
    const st = await waitForHlsReady(key, 35000);
    if (!st.active) return res.status(400).json({ success:false, error:`Aucun flux OBS détecté. Mets OBS sur rtmp://127.0.0.1:${RTMP_PORT}/live avec ta clé Oryon.` });
    if (!st.hls_exists) return res.status(400).json({ success:false, error:'OBS est détecté, mais le player local n’est pas encore prêt. Attends 5 à 15 secondes puis réessaie.' });
    await startPublicTunnel('auto');
    const result = await registerPublicUrlOnOryon({ siteUrl: req.body?.site_url, key });
    return res.json({ success:true, ...result, stream: streamStatus(key), tunnel: publicTunnelInfo });
  } catch (e) { log('error', 'Go live auto impossible', { error: e.message }); return res.status(500).json({ success:false, error:e.message, stream: streamStatus(key), tunnel: publicTunnelInfo, log: cloudflaredLastLog.slice(-1000) }); }
});
app.post('/api/tunnel/start', async (req, res) => { try { const key = safeKey(req.body?.key || DEFAULT_KEY); const info = await startPublicTunnel(req.body?.provider || 'auto'); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl(), log: cloudflaredLastLog.slice(-1000) }); } catch(e) { log('error', 'Tunnel impossible', { error: e.message }); res.status(500).json({ success:false, error:e.message, log: cloudflaredLastLog.slice(-1000) }); } });
app.post('/api/tunnel/manual', async (req, res) => { try { const key = safeKey(req.body?.key || DEFAULT_KEY); const info = setManualPublicUrl(req.body?.url); res.json({ success:true, ...info, player_url: publicPlayerUrl(key), status_url: publicStatusUrl() }); } catch(e) { res.status(400).json({ success:false, error:e.message }); } });
app.post('/api/tunnel/stop', async (_req, res) => { try { await stopPublicTunnel(); res.json({ success:true }); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });
app.get('/api/tunnel/status', (req, res) => { const key = safeKey(req.query.key || DEFAULT_KEY); res.json({ success:true, active:Boolean(publicTunnelInfo?.url), tunnel:publicTunnelInfo, player_url:publicPlayerUrl(key), status_url:publicStatusUrl(), cloudflared_log:cloudflaredLastLog.slice(-1000) }); });
app.post('/api/publish-to-oryon', async (req, res) => { try { const key = safeKey(req.body?.key || DEFAULT_KEY); if (!publicTunnelInfo?.url) await startPublicTunnel('auto'); const result = await registerPublicUrlOnOryon({ siteUrl:req.body?.site_url, key }); res.json(result); } catch(e) { res.status(500).json({ success:false, error:e.message }); } });

app.get('/health', (_req, res) => res.json({ success:true, name:'Oryon Local', rtmp:`rtmp://127.0.0.1:${RTMP_PORT}/live`, public_base_url:PUBLIC_BASE_URL, media_root:MEDIA_ROOT, ffmpeg:ffmpegInfo(), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), tunnel:publicTunnelInfo }));
app.get('/api/status', (req, res) => res.json({ success:true, ffmpeg:ffmpegInfo(), media_root:MEDIA_ROOT, stream:streamStatus(req.query.key || DEFAULT_KEY), active:Object.values(active), ffmpeg_jobs:Object.keys(ffmpegJobs), events }));
app.get('/player/:key', (req, res) => { const key = safeKey(req.params.key); const hls = hlsUrl(key); res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oryon Local Player</title><style>html,body{margin:0;width:100%;height:100%;background:#030508;color:white;font-family:system-ui}video{width:100%;height:100%;object-fit:contain;background:#030508}.state{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#9ba7bb;padding:20px}.panel{position:absolute;left:12px;bottom:12px;right:12px;color:#b8c3d9;font-size:13px;pointer-events:none}</style></head><body><video id="v" controls autoplay muted playsinline></video><div id="s" class="state">Connexion au flux local…<br><small>Si rien ne s'affiche, lance OBS avec la bonne clé.</small></div><div id="p" class="panel"></div><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script><script>const src=${JSON.stringify(hls)},key=${JSON.stringify(key)},v=document.getElementById('v'),s=document.getElementById('s'),p=document.getElementById('p');let h=null,tries=0;function ok(){s.style.display='none'}function msg(t){s.style.display='grid';s.innerHTML=t}async function ready(){try{const r=await fetch(src+'?t='+Date.now(),{cache:'no-store'});return r.ok}catch(e){return false}}async function status(){try{const r=await fetch('/api/status?key='+encodeURIComponent(key)+'&t='+Date.now());const d=await r.json();const st=d.stream||{};p.textContent=(st.active?'OBS reçu':'Aucun OBS')+' · '+(st.ffmpeg_running?'FFmpeg actif':'FFmpeg inactif')+' · '+(st.hls_exists?'HLS prêt':'HLS en attente')}catch(e){}}async function boot(){tries++;await status();if(!await ready()){msg('Connexion au flux local…<br><small>Essai '+tries+'. Le flux peut prendre 5 à 15 secondes.</small>');setTimeout(boot,2000);return}if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src+'?t='+Date.now();v.addEventListener('loadedmetadata',ok,{once:true});v.play().catch(()=>{});return}if(window.Hls&&Hls.isSupported()){if(h)h.destroy();h=new Hls({lowLatencyMode:true,liveSyncDurationCount:2});h.loadSource(src+'?t='+Date.now());h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>{ok();v.play().catch(()=>{})});h.on(Hls.Events.ERROR,(_e,d)=>{if(d&&d.fatal){msg('Flux interrompu, reconnexion…');setTimeout(boot,2000)}});return}msg('Navigateur non compatible HLS.')}setInterval(status,2000);boot();</script></body></html>`); });
app.use('/hls', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); }, express.static(path.join(MEDIA_ROOT, 'live')));
app.listen(HTTP_PORT, () => { console.log(`[Oryon Local] Interface: http://localhost:${HTTP_PORT}`); console.log(`[Oryon Local] OBS server: rtmp://127.0.0.1:${RTMP_PORT}/live`); });
