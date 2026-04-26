const express = require('express');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');

const HTTP_PORT = Number(process.env.ORYON_LOCAL_HTTP_PORT || 8081);
const RTMP_PORT = Number(process.env.ORYON_LOCAL_RTMP_PORT || 1935);
const MEDIA_ROOT = process.env.ORYON_LOCAL_MEDIA_ROOT || path.join(__dirname, 'media');
const PUBLIC_BASE_URL = process.env.ORYON_LOCAL_PUBLIC_URL || `http://localhost:${HTTP_PORT}`;

fs.mkdirSync(MEDIA_ROOT, { recursive: true });

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
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
    tasks: [{
      app: 'live',
      hls: true,
      hlsFlags: '[hls_time=2:hls_list_size=5:hls_flags=delete_segments]',
      dash: false
    }]
  }
});

let active = {};
nms.on('prePublish', (id, streamPath, args) => {
  const key = streamPath.split('/').pop();
  active[key] = { key, streamPath, startedAt: new Date().toISOString() };
  console.log('[Oryon Local] live started:', key);
});
nms.on('donePublish', (id, streamPath, args) => {
  const key = streamPath.split('/').pop();
  delete active[key];
  console.log('[Oryon Local] live stopped:', key);
});
nms.run();

const app = express();
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*'); next();});
app.get('/health', (req,res)=>res.json({success:true, name:'Oryon Local Agent', rtmp:`rtmp://localhost:${RTMP_PORT}/live`, public_base_url:PUBLIC_BASE_URL, active:Object.values(active)}));
app.get('/player/:key', (req,res)=>{
  const key = String(req.params.key || '').replace(/[^a-zA-Z0-9_-]/g,'');
  const hls = `${PUBLIC_BASE_URL}/hls/${encodeURIComponent(key)}/index.m3u8`;
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oryon Local Player</title><style>html,body{margin:0;width:100%;height:100%;background:#030508;color:white;font-family:system-ui}video{width:100%;height:100%;object-fit:contain;background:#030508}.state{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#9ba7bb}</style></head><body><video id="v" controls autoplay playsinline></video><div id="s" class="state">Connexion au flux local…</div><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script><script>const src=${JSON.stringify(hls)};const v=document.getElementById('v'),s=document.getElementById('s');function ok(){s.style.display='none'}; if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src;v.addEventListener('loadedmetadata',ok);v.play().catch(()=>{})}else if(window.Hls&&Hls.isSupported()){const h=new Hls();h.loadSource(src);h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>{ok();v.play().catch(()=>{})});h.on(Hls.Events.ERROR,()=>{s.textContent='Flux local indisponible. Vérifie OBS, ffmpeg et ton tunnel.'})}else{s.textContent='Navigateur non compatible HLS.'}</script></body></html>`);
});
app.use('/hls', express.static(path.join(MEDIA_ROOT, 'live')));
app.listen(HTTP_PORT, () => {
  console.log(`[Oryon Local] HTTP ${HTTP_PORT}`);
  console.log(`[Oryon Local] OBS server: rtmp://localhost:${RTMP_PORT}/live`);
  console.log(`[Oryon Local] Player example: ${PUBLIC_BASE_URL}/player/YOUR_STREAM_KEY`);
});
