const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// --- CONFIGURATION (CONSERVÉE) ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; 

const genAI = new GoogleGenAI(GEMINI_API_KEY);

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// --- VOTRE CACHE ORIGINAL ---
const CACHE = {
    twitchUser: null,
    lastScanData: null,
    boostedStream: null,
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0 }
};

// --- LOGIQUE TWITCH & GEMINI (VOTRE STRUCTURE) ---
async function getTwitchAppToken() {
    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const data = await res.json();
    return data.access_token;
}

async function twitchApi(endpoint, token = null) {
    const t = token || await getTwitchAppToken();
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${t}` }
    });
    return res.json();
}

async function runGeminiAnalysis(prompt) {
    try {
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent(prompt);
        return { success: true, html_response: result.response.text() };
    } catch (e) { return { success: false, error: e.message }; }
}

// --- ROUTES AUTH (AVEC FIX FERMETURE POPUP) ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state);
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenRes.json();
    const userRes = await twitchApi('users', tokenData.access_token);
    
    CACHE.twitchUser = { ...userRes.data[0], access_token: tokenData.access_token };
    
    // RESTAURATION : Fermeture propre de la popup
    res.send(`<html><body><script>if(window.opener){window.opener.location.reload();}window.close();</script></body></html>`);
});

// --- AJOUT DASHBOARD 360 (DANS VOTRE STYLE) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const userRes = await twitchApi(`users?login=${query}`);
    if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0];
        const stream = await twitchApi(`streams?user_id=${user.id}`);
        const follow = await twitchApi(`users/follows?to_id=${user.id}`);
        const vods = await twitchApi(`videos?user_id=${user.id}&first=1&type=archive`);
        
        CACHE.lastScanData = { ...user, is_live: stream.data.length > 0, followers: follow.total || 0, last_vod: vods.data[0] || null };
        return res.json({ success: true, data: CACHE.lastScanData });
    }
    res.json({ success: false, error: "Cible introuvable" });
});

// Réutilisation de votre fonction auto_action pour le Dashboard
app.post('/auto_action', async (req, res) => {
    const { action_type, target_name } = req.body;
    let prompt = "";
    if(action_type === 'niche_critique') prompt = `Analyse critique de niche pour ${target_name}. Format HTML court.`;
    // ... gardez vos autres types d'actions ici ...
    
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.get('/followed_streams', async (req, res) => {
    if(!CACHE.twitchUser) return res.json({ streams: [] });
    const data = await twitchApi(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
    res.json({ streams: data.data || [] });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`Dashboard 360 prêt sur port ${PORT}`));
