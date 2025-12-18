const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// ✅ CORRECTIF IA : Utilisation du modèle 1.5 Pro pour le quota stable
const GEMINI_MODEL = "gemini-1.5-pro"; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("=========================================================");
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    console.error("=========================================================");
    process.exit(1); 
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

// =========================================================
// MIDDLEWARES
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {},       
    boostedStream: null,    
    lastScanData: null,     
    globalStreamRotation: {
        streams: [],    
        currentIndex: 0,
        lastFetchTime: 0,
        fetchCooldown: 15 * 60 * 1000 
    }
};

// =========================================================
// LOGIQUE TWITCH HELPER
// =========================================================

async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = {
                access_token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        }
        return null;
    } catch (error) { return null; }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    return res.json();
}

// =========================================================
// LOGIQUE GEMINI HELPER
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        const model = ai.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: "Tu es un expert Twitch. Réponds en HTML simple (<ul>, <li>, <h4>, <strong>, <p>)."
        });
        return { success: true, html_response: result.response.text() };
    } catch (e) {
        return { success: false, status: 500, error: e.message, html_response: `<p style="color:red;">Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// ROUTES AUTH (FERMETURE AUTO POPUP)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
        const userRes = await twitchApiFetch('users', tokenData.access_token);
        CACHE.twitchUser = { ...userRes.data[0], access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
        // ✅ CORRECTIF : Ferme le popup et rafraîchit l'application via postMessage
        res.send(`<script>window.opener.postMessage('auth_success', '*'); window.close();</script>`);
    } else res.status(500).send("Erreur Auth.");
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

// =========================================================
// ✅ ROTATION 0-100 VIEWERS (PAGINATION TWITCH)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;

    try {
        let allStreams = [];
        let cursor = "";
        // On scanne jusqu'à 300 streams pour trouver les 0-100
        for (let i = 0; i < 3; i++) {
            const data = await twitchApiFetch(`streams?language=fr&first=100${cursor ? '&after=' + cursor : ''}`);
            allStreams = allStreams.concat(data.data);
            cursor = data.pagination?.cursor;
            if (!cursor) break;
        }
        const suitable = allStreams.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
        rotation.streams = suitable.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        rotation.currentIndex = 0;
        rotation.lastFetchTime = now;
    } catch (e) { console.error("Erreur Rotation:", e); }
}

app.get('/get_default_stream', async (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ success: true, channel: CACHE.boostedStream.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF` });
    }
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: "Aucun stream trouvé." });
    const s = rot.streams[rot.currentIndex];
    res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `Cycle 0-100: ${s.channel} (${s.viewers} vues)` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    const s = rot.streams[rot.currentIndex];
    res.json({ success: true, channel: s.channel, viewers: s.viewers });
});

// =========================================================
// ROUTES DATA & IA
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
    res.json({ success: true, streams: data.data });
});

app.post('/analyze_golden_hour', async (req, res) => {
    const { game, date } = req.body;
    const prompt = `En tant qu'expert en stratégie Twitch, analyse le jeu "${game}" pour la date "${date}". Identifie précisément l'Heure d'Or (moment où il y a du public mais peu de gros streamers). Formate en HTML (<h4>, <ul>, <li>).`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
    if (userRes.data.length > 0) {
        const u = userRes.data[0];
        const streamRes = await twitchApiFetch(`streams?user_id=${u.id}`).catch(()=>({data:[]}));
        const userData = { login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url, is_live: streamRes.data.length > 0, viewer_count: streamRes.data.length > 0 ? streamRes.data[0].viewer_count : 0, game_name: streamRes.data.length > 0 ? streamRes.data[0].game_name : 'OFF', ai_calculated_niche_score: '8.2/10' };
        CACHE.lastScanData = { type: 'user', user_data: userData };
        return res.json({ success: true, type: 'user', user_data: userData });
    }
    res.status(404).json({ success: false, message: "Non trouvé" });
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    const prompt = `Analyse Twitch: ${query}. Type: ${type}. Format HTML simple.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    CACHE.boostedStream = { channel, endTime: Date.now() + 15 * 60 * 1000 };
    res.json({ success: true, html_response: `<p style="color:pink">✅ Boost activé pour ${channel}</p>` });
});

app.get('/export_csv', (req, res) => { res.send("CSV Export Placeholder"); });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`Serveur prêt sur port ${PORT}`));
