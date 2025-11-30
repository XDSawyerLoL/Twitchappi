// app.js - serveur Express (CommonJS) - prêt Render
const express = require('express');
const fetch = require('node-fetch'); // node-fetch v2 style
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '/')));

// ENV
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT || null;

// Basic logging of env (non-sensitive)
console.log('--- Statut variables d\'env ---');
console.log('PORT:', PORT);
console.log('TWITCH_CLIENT_ID:', TWITCH_CLIENT_ID ? 'OK' : 'MISSING');
console.log('GEMINI_API_KEY:', GEMINI_API_KEY ? 'OK' : 'MISSING');
console.log('-------------------------------');

// --- Simple Twitch App Token (client credentials) ---
let TWITCH_APP_TOKEN = null;
let TWITCH_TOKEN_EXP = 0;

async function getTwitchAccessToken(){
  try{
    const now = Date.now()/1000;
    if(TWITCH_APP_TOKEN && now < TWITCH_TOKEN_EXP) return TWITCH_APP_TOKEN;

    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    const r = await fetch(url, { method: 'POST' });
    const j = await r.json();
    if(j.access_token){
      TWITCH_APP_TOKEN = j.access_token;
      TWITCH_TOKEN_EXP = now + (j.expires_in || 3600) - 30;
      console.log('Nouveau token Twitch obtenu.');
      return TWITCH_APP_TOKEN;
    } else {
      console.error('Impossible d\'obtenir token Twitch:', j);
      return null;
    }
  } catch(e){
    console.error('Erreur getTwitchAccessToken:', e.message || e);
    return null;
  }
}

// --- /live_ping : retourne live boolean + viewers/title/game si live ---
app.get('/live_ping', async (req, res) => {
  const channel = (req.query.channel || '').toString().trim().toLowerCase();
  if(!channel) return res.status(400).json({ live: false, error: 'channel missing' });

  try{
    const token = await getTwitchAccessToken();
    if(!token) return res.status(503).json({ live:false, error:'twitch token missing' });

    const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`;
    const r = await fetch(url, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }});
    if(!r.ok) {
      return res.status(500).json({ live:false, error:'twitch api error' });
    }
    const j = await r.json();
    const isLive = j.data && j.data.length > 0;
    if(isLive){
      const s = j.data[0];
      return res.json({ live:true, viewer_count: s.viewer_count || 0, title: s.title || '', game_name: s.game_name || '' });
    } else {
      return res.json({ live:false });
    }
  } catch(e){
    console.error('Error /live_ping:', e);
    return res.status(500).json({ live:false, error:'internal' });
  }
});

// --- /scan_target : adapted from your code base (game or user)
app.post('/scan_target', async (req, res) => {
  const target = (req.body.target || '').toString().trim();
  if(!target) return res.status(400).json({ error: "Paramètre 'target' manquant." });

  try{
    const token = await getTwitchAccessToken();
    if(!token) return res.status(503).json({ error: "Erreur d'authentification Twitch (Token applicatif)." });

    // try as game
    const gRes = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(target)}`, {
      headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    const gJson = await gRes.json();
    const game = (gJson.data && gJson.data[0]) ? gJson.data[0] : null;

    if(game){
      const gameId = game.id;
      const streamsUrl = `https://api.twitch.tv/helix/streams?game_id=${gameId}&first=12`;
      const streamsRes = await fetch(streamsUrl, { headers:{ 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }});
      const streamsJson = await streamsRes.json();
      const streams = (streamsJson.data || []).map(s=>({
        user_name: s.user_login || s.user_name || '',
        viewer_count: s.viewer_count || 0,
        game_name: s.game_name || '',
        thumbnail_url: s.thumbnail_url || ''
      }));
      return res.json({ type: "game", streams, message: `Résultats pour le jeu: ${target}` });
    }

    // else try as user
    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(target)}`, { headers:{ 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }});
    const userJson = await userRes.json();
    if(userJson.data && userJson.data.length){
      const u = userJson.data[0];
      // get stream details
      const streamRes = await fetch(`https://api.twitch.tv/helix/streams?user_id=${u.id}`, { headers:{ 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }});
      const streamJson = await streamRes.json();
      const stream = (streamJson.data && streamJson.data[0]) ? streamJson.data[0] : null;
      return res.json({ type: "user", user_data: {
        username: u.display_name || u.login,
        id: u.id,
        title: stream ? stream.title : '',
        is_live: !!stream,
        viewer_count: stream ? stream.viewer_count : 0,
        game_name: stream ? stream.game_name : ''
      }});
    }

    // nothing found
    return res.json({ type: "none", message: "Aucun jeu ni utilisateur trouvé." });

  } catch(e){
    console.error('Error /scan_target:', e);
    return res.status(500).json({ error: "Erreur interne lors du scan." });
  }
});

// --- /niche_analyse, /repurpose, /trend_detector (light wrappers) ---
// If GEMINI_API_KEY present you should implement proper call to Gemini; here we provide simple wrappers
app.get('/niche_analyse', async (req, res) => {
  const text = (req.query.text||'').toString();
  if(!text) return res.status(400).send('<div style="color:#ff8080">Paramètre manquant</div>');
  // If you have Gemini integration, call it here. For robustness we fallback to a simple placeholder.
  if(!GEMINI_API_KEY) {
    return res.send(`<div><strong>Analyse (mode dégradé)</strong><p>${escapeHtml(text.slice(0,100))}…</p><ul><li>Conseil 1: Sois unique</li><li>Conseil 2: Engage avec la communauté</li></ul></div>`);
  }
  // If key present, you can implement the real call here (left as future improvement).
  return res.send(`<div><strong>Analyse IA</strong><p>Réponse IA disponible (clé présente) — implémentation souhaitée côté serveur.</p></div>`);
});

app.get('/repurpose', async (req,res) => {
  const text = (req.query.text||'').toString();
  if(!text) return res.status(400).send('<div style="color:#ff8080">Paramètre manquant</div>');
  if(!GEMINI_API_KEY) {
    return res.send(`<div><strong>Repurposing (mode dégradé)</strong><p>Extraits: ${escapeHtml(text.slice(0,120))}</p><ul><li>Tweet idea</li><li>Short idea for YT</li></ul></div>`);
  }
  return res.send(`<div><strong>Repurpose IA</strong><p>Réponse IA (clés ok) — implémentation serveur souhaitée.</p></div>`);
});

app.get('/trend_detector', async (req,res) => {
  if(!GEMINI_API_KEY) {
    return res.send(`<div><strong>Trends (mode dégradé)</strong><ul><li>Jeu A en hausse</li><li>Jeu B en baisse</li></ul></div>`);
  }
  return res.send(`<div><strong>Trend Detector</strong><p>Réponse IA (clé disponible) — implémentation serveur souhaitée.</p></div>`);
});

// --- critique_ia : used by assistant (POST) ---
app.post('/critique_ia', async (req,res) => {
  try{
    const { type, prompt, channel } = req.body || {};
    if(!GEMINI_API_KEY) {
      return res.status(200).json({ text: `IA désactivée (GEMINI_API_KEY manquante). Requête reçue : ${prompt || type || 'assist'}` });
    }
    // If you want a real Gemini call, implement it here.
    // For now return a structured placeholder but presentable.
    const replyText = `IA (placeholder) : Je peux analyser ${prompt || type || channel}. Implémentation Gemini côté serveur nécessaire pour réponse réelle.`;
    return res.json({ text: replyText });
  } catch(e){
    console.error('Error /critique_ia:', e);
    return res.status(500).json({ error: 'internal' });
  }
});

// --- random_small_streamer (helper used by front) ---
app.get('/random_small_streamer', async (req,res) => {
  try{
    const token = await getTwitchAccessToken();
    if(!token) return res.status(503).json({ message: 'twitch token missing' });
    const url = `https://api.twitch.tv/helix/streams?first=100&language=fr`;
    const r = await fetch(url, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }});
    const j = await r.json();
    const list = (j.data || []).filter(s => s.viewer_count > 0 && s.viewer_count < 200);
    if(!list.length) return res.status(404).json({ message: 'no live streams' });
    const pick = list[Math.floor(Math.random()*list.length)];
    res.json({ username: pick.user_login, viewer_count: pick.viewer_count, status:'ok' });
  }catch(e){
    console.error('random_small_streamer error:', e);
    res.status(500).json({ message:'server error' });
  }
});


// Serve front (fallback)
app.get('/', (req,res) => {
  res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Escape helper
function escapeHtml(str){
  return (''+str).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Start
app.listen(PORT, () => {
  console.log(`Serveur prêt sur port ${PORT}`);
});
