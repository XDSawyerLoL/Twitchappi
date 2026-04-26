const express = require('express');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
let bundledFfmpeg = null;
try { bundledFfmpeg = require('ffmpeg-static'); } catch (_) { bundledFfmpeg = null; }

const HTTP_PORT = Number(process.env.ORYON_LOCAL_HTTP_PORT || 8081);
const RTMP_PORT = Number(process.env.ORYON_LOCAL_RTMP_PORT || 1935);
const MEDIA_ROOT = process.env.ORYON_LOCAL_MEDIA_ROOT || path.join(__dirname, 'media');
const PUBLIC_BASE_URL = process.env.ORYON_LOCAL_PUBLIC_URL || `http://localhost:${HTTP_PORT}`;
const DEFAULT_KEY = process.env.ORYON_STREAM_KEY || 'ta-cle-oryon';

fs.mkdirSync(MEDIA_ROOT, { recursive: true });

const active = {};

const nms = new NodeMediaServer({
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: HTTP_PORT + 1,
    mediaroot: MEDIA_ROOT,
    allow_origin: '*'
  },
  trans: {
    ffmpeg: process.env.FFMPEG_PATH || bundledFfmpeg || 'ffmpeg',
    tasks: [{
      app: 'live',
      hls: true,
      hlsFlags: '[hls_time=2:hls_list_size=5:hls_flags=delete_segments]',
      dash: false
    }]
  }
});

nms.on('prePublish', (id, streamPath) => {
  const key = streamPath.split('/').pop();
  active[key] = { key, streamPath, startedAt: new Date().toISOString() };
  console.log('[Oryon Local] live started:', key);
});

nms.on('donePublish', (id, streamPath) => {
  const key = streamPath.split('/').pop();
  delete active[key];
  console.log('[Oryon Local] live stopped:', key);
});

nms.run();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*'); next();});

function safeKey(value){ return String(value || DEFAULT_KEY).replace(/[^a-zA-Z0-9_-]/g,'') || DEFAULT_KEY; }
function playerUrl(key=DEFAULT_KEY){ return `${PUBLIC_BASE_URL}/player/${encodeURIComponent(safeKey(key))}`; }
function hlsUrl(key=DEFAULT_KEY){ return `${PUBLIC_BASE_URL}/hls/${encodeURIComponent(safeKey(key))}/index.m3u8`; }

app.get('/', (req,res)=>{
  const key = safeKey(req.query.key || DEFAULT_KEY);
  const rtmp = `rtmp://localhost:${RTMP_PORT}/live`;
  const purl = playerUrl(key);
  res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oryon Local</title><style>
  :root{color-scheme:dark;background:#070914;color:#f6f7fb;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,#3b1b7a55,transparent 35%),#070914}.wrap{max-width:1100px;margin:auto;padding:28px}.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:20px;align-items:stretch}.card{border:1px solid #262b42;background:#101423cc;border-radius:24px;padding:22px;box-shadow:0 20px 60px #0008}.tag{display:inline-flex;padding:7px 10px;border-radius:999px;background:#7c3aed22;border:1px solid #7c3aed66;color:#d7c6ff;font-size:13px}.code{background:#050710;border:1px solid #30364f;border-radius:14px;padding:13px;word-break:break-all;font-family:ui-monospace,monospace;color:#cfe5ff}.btn{border:0;border-radius:14px;padding:12px 15px;background:#7c3aed;color:white;font-weight:800;cursor:pointer}.btn.secondary{background:#1d2335}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}.small{color:#aab3c7;font-size:14px;line-height:1.5}.player{aspect-ratio:16/9;background:#02040a;border-radius:22px;overflow:hidden;border:1px solid #30364f}iframe{width:100%;height:100%;border:0}input{width:100%;background:#070914;border:1px solid #30364f;color:white;border-radius:12px;padding:12px;margin:6px 0}@media(max-width:850px){.hero,.grid{grid-template-columns:1fr}}</style></head><body><div class="wrap"><div class="hero"><section class="card"><span class="tag">Oryon Local est lancé</span><h1>Ton PC devient ton serveur de live.</h1><p class="small">Laisse cette application ouverte. Dans OBS, mets le serveur et la clé ci-dessous. Le player local permet de vérifier que ton flux arrive bien.</p><h3>Serveur OBS</h3><div class="code" id="rtmp">${rtmp}</div><h3>Clé de stream</h3><input id="key" value="${key}" oninput="updateKey()"><div class="row"><button class="btn" onclick="copy('rtmp')">Copier serveur</button><button class="btn secondary" onclick="copyKey()">Copier clé</button><a class="btn secondary" id="openPlayer" href="${purl}" target="_blank" style="text-decoration:none">Ouvrir le player</a></div><p class="small">OBS → Paramètres → Diffusion → Service personnalisé → Serveur + Clé.</p></section><section class="card"><h2>Prévisualisation locale</h2><div class="player"><iframe id="frame" src="${purl}"></iframe></div><p class="small">Si l’écran reste noir, vérifie que OBS diffuse et que FFmpeg est installé sur ton PC.</p></section></div><div class="grid"><div class="card"><h3>1. Lance OBS</h3><p class="small">Utilise le serveur RTMP local. Oryon Local transforme ensuite le flux en player web.</p></div><div class="card"><h3>2. Vérifie le player</h3><p class="small">Le player local doit afficher ton live avant de le publier sur Oryon.</p></div><div class="card"><h3>3. Rends-le public</h3><p class="small">Pour les viewers, expose http://localhost:${HTTP_PORT} avec un tunnel Cloudflare/ngrok puis colle l’URL publique dans ton profil Oryon.</p></div></div></div><script>function copy(id){navigator.clipboard.writeText(document.getElementById(id).textContent)}function copyKey(){navigator.clipboard.writeText(document.getElementById('key').value)}function updateKey(){const k=document.getElementById('key').value.replace(/[^a-zA-Z0-9_-]/g,''); const u='/player/'+encodeURIComponent(k||'${DEFAULT_KEY}'); document.getElementById('frame').src=u; document.getElementById('openPlayer').href=u}</script></body></html>`);
});

app.get('/health', (req,res)=>res.json({success:true, name:'Oryon Local', rtmp:`rtmp://localhost:${RTMP_PORT}/live`, public_base_url:PUBLIC_BASE_URL, active:Object.values(active)}));

app.get('/player/:key', (req,res)=>{
  const key = safeKey(req.params.key);
  const hls = hlsUrl(key);
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oryon Local Player</title><style>html,body{margin:0;width:100%;height:100%;background:#030508;color:white;font-family:system-ui}video{width:100%;height:100%;object-fit:contain;background:#030508}.state{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#9ba7bb;padding:20px}</style></head><body><video id="v" controls autoplay playsinline></video><div id="s" class="state">Connexion au flux local…<br><small>Si rien ne s'affiche, lance OBS avec la bonne clé.</small></div><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script><script>const src=${JSON.stringify(hls)};const v=document.getElementById('v'),s=document.getElementById('s');function ok(){s.style.display='none'}; if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src;v.addEventListener('loadedmetadata',ok);v.play().catch(()=>{})}else if(window.Hls&&Hls.isSupported()){const h=new Hls({lowLatencyMode:true});h.loadSource(src);h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>{ok();v.play().catch(()=>{})});h.on(Hls.Events.ERROR,()=>{s.innerHTML='Flux local indisponible.<br><small>Vérifie OBS, FFmpeg et ta clé de stream.</small>'})}else{s.textContent='Navigateur non compatible HLS.'}</script></body></html>`);
});

app.use('/hls', express.static(path.join(MEDIA_ROOT, 'live')));

app.listen(HTTP_PORT, () => {
  console.log(`[Oryon Local] Interface: http://localhost:${HTTP_PORT}`);
  console.log(`[Oryon Local] OBS server: rtmp://localhost:${RTMP_PORT}/live`);
  console.log(`[Oryon Local] Player example: ${playerUrl(DEFAULT_KEY)}`);
});
