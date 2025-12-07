/* =====================================================
  Twitch Niche Optimizer – app.js FINAL V8.1
  Correction: Gestion des erreurs JSON pour éviter le "Unexpected token <"
  ===================================================== */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');

const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 10000;

// --- CONFIGURATION ---
const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI, 
  GEMINI_API_KEY
} = process.env;

// --- MIDDLEWARES ---
app.use(cors());
app.use(bodyParser.json({ limit: '200kb' }));
app.use(cookieParser());
// Sert les fichiers HTML/CSS/JS situés à la racine
app.use(express.static(path.join(__dirname))); 

// --- INIT IA ---
const GEMINI_MODEL = 'gemini-2.5-flash';
let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("✅ IA Active");
} else {
    console.log("⚠️ IA Inactive (Clé manquante)");
}

// --- CACHE & MEMOIRE ---
const CACHE = {
  twitchAppToken: null,
  twitchAppExpiry: 0,
  streamBoosts: {}
};
const USER_POINTS = {}; // Persistance simple

// --- HELPER TWITCH ---
async function getAppToken() {
  if (CACHE.twitchAppToken && CACHE.twitchAppExpiry > Date.now()) {
    return CACHE.twitchAppToken;
  }
  const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
  try {
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      CACHE.twitchAppToken = data.access_token;
      CACHE.twitchAppExpiry = Date.now() + (data.expires_in * 1000) - 300000;
      return data.access_token;
  } catch(e) {
      console.error("Erreur Token App:", e);
      return null;
  }
}

async function twitchFetch(endpoint, userToken = null) {
  const token = userToken || await getAppToken();
  const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`
    }
  });
  return res.json();
}

async function fetchUserIdentity(token) {
    const data = await twitchFetch('users', token);
    return data.data ? data.data[0] : null;
}

// ================== ROUTES AUTH (OAUTH) ==================

app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !TWITCH_REDIRECT_URI) return res.status(500).send("Config manquante");
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true, maxAge: 600000 });
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.redirect(authUrl);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (!state || state !== req.cookies.twitch_auth_state) return res.status(403).send("Erreur état");
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${TWITCH_REDIRECT_URI}`;
    
    try {
        const tokenRes = await fetch(url, { method: 'POST' });
        const tokenData = await tokenRes.json();
        
        if (tokenData.access_token) {
            const identity = await fetchUserIdentity(tokenData.access_token);
            if (identity) {
                res.cookie('twitch_access_token', tokenData.access_token, { httpOnly: true, maxAge: 86400000 });
                res.cookie('twitch_user_id', identity.id, { httpOnly: true, maxAge: 86400000 });
                if (!USER_POINTS[identity.id]) USER_POINTS[identity.id] = 0;
                res.redirect('/NicheOptimizer.html');
            } else {
                res.send("Erreur identité");
            }
        } else {
            res.send("Erreur token");
        }
    } catch (e) { res.send(e.message); }
});

app.get('/twitch_user_status', async (req, res) => {
    const token = req.cookies.twitch_access_token;
    if (!token) return res.json({ is_connected: false });
    
    const identity = await fetchUserIdentity(token);
    if (identity) {
        res.json({ 
            is_connected: true, 
            username: identity.display_name,
            points: USER_POINTS[identity.id] || 0
        });
    } else {
        res.json({ is_connected: false });
    }
});

app.post('/twitch_logout', (req, res) => {
    res.clearCookie('twitch_access_token');
    res.clearCookie('twitch_user_id');
    res.json({ success: true });
});

// ================== ROUTES API FONCTIONNELLES ==================

// 1. Streams Suivis
app.get('/followed_streams', async (req, res) => {
    const token = req.cookies.twitch_access_token;
    const userId = req.cookies.twitch_user_id;
    if (!token || !userId) return res.status(401).json({ error: "Non connecté" });
    
    try {
        const data = await twitchFetch(`streams/followed?user_id=${userId}`, token);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Scan Target (Jeu/User)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query manquante" });
    
    try {
        const gameData = await twitchFetch(`games?name=${encodeURIComponent(query)}`);
        if (gameData.data && gameData.data.length > 0) {
            const game = gameData.data[0];
            const streams = await twitchFetch(`streams?game_id=${game.id}&first=10`);
            // Calcul stats
            const totalViewers = streams.data.reduce((acc, s) => acc + s.viewer_count, 0);
            return res.json({
                type: 'game',
                game_data: {
                    name: game.name,
                    box_art_url: game.box_art_url.replace('{width}x{height}', '285x380'),
                    total_viewers: totalViewers,
                    total_streamers: streams.data.length,
                    streams: streams.data
                }
            });
        }
        
        const userData = await twitchFetch(`users?login=${encodeURIComponent(query)}`);
        if (userData.data && userData.data.length > 0) {
            const user = userData.data[0];
            const stream = await twitchFetch(`streams?user_id=${user.id}`);
            return res.json({
                type: 'user',
                user_data: {
                    ...user,
                    is_live: stream.data.length > 0,
                    stream_details: stream.data[0] || null
                }
            });
        }
        
        res.json({ type: 'none', message: "Rien trouvé." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. IA Generative (Critique, Trend, Repurpose)
app.post('/critique_ia', async (req, res) => {
    if (!ai) return res.status(503).json({ error: "IA non configurée" });
    const { type, query } = req.body;
    
    let prompt = "";
    if (type === 'niche') prompt = `Analyse le potentiel Twitch du jeu ${query}. Donne 3 points forts et 3 points faibles. Réponds en HTML (<ul>, <li>).`;
    else if (type === 'repurpose') prompt = `Comment transformer les streams de ${query} en TikToks viraux ? Donne 3 idées. Réponds en HTML.`;
    else if (type === 'trend') prompt = `Quelles sont les 5 niches Twitch émergentes aujourd'hui ? Réponds en HTML.`;
    
    try {
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        res.json({ html_critique: result.response.text() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Mini Assistant Chat
app.post('/ai_chat_query', async (req, res) => {
    if (!ai) return res.status(503).json({ error: "IA non configurée" });
    const { query } = req.body;
    
    try {
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: "Tu es un assistant expert Twitch. Réponds court. Question: " + query }] }]
        });
        res.json({ success: true, response: result.response.text() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Boost & Points
app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    // Logique simplifiée
    res.json({ success: true, html_response: `<p style="color:#ff0099">Boost activé pour <strong>${channel}</strong> ! (Simulation)</p>` });
});

app.post('/share_streamer', (req, res) => {
    const userId = req.cookies.twitch_user_id;
    if (!userId) return res.status(401).json({ error: "Non connecté" });
    
    USER_POINTS[userId] = (USER_POINTS[userId] || 0) + 10;
    res.json({ success: true, message: "10 points ajoutés !", new_points: USER_POINTS[userId] });
});

app.post('/redeem_points', (req, res) => {
    const userId = req.cookies.twitch_user_id;
    const { cost } = req.body;
    
    if (!userId) return res.status(401).json({ error: "Non connecté" });
    if ((USER_POINTS[userId] || 0) < cost) return res.status(400).json({ error: "Pas assez de points" });
    
    USER_POINTS[userId] -= cost;
    res.json({ success: true, message: "Récompense débloquée !", new_points: USER_POINTS[userId] });
});

// ================== ROUTES STATIQUES & GESTION ERREUR 404 ==================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

// Gestionnaire d'erreur JSON (POUR ÉVITER LE BUG "Unexpected token <")
app.use((req, res) => {
    if (req.accepts('json')) {
        res.status(404).json({ error: `Route API introuvable : ${req.method} ${req.url}` });
    } else {
        res.status(404).send("Page introuvable");
    }
});

// START
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
