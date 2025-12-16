const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// --- CONFIGURATION ORIGINALE ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; 

const ai = new GoogleGenAI(GEMINI_API_KEY);

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// CACHE ORIGINAL
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {},
    boostedStream: null,
    lastScanData: null,
    globalStreamRotation: {
        streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 900000
    }
};

// HELPERS TWITCH
async function getTwitchToken() {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();
    return data.access_token;
}

async function twitchApiFetch(endpoint, token = null) {
    const t = token || await getTwitchToken();
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${t}` }
    });
    return res.json();
}

// --- ROUTES AUTHENTIFICATION (FIX POPUP INCLUS) ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_state', state);
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenRes.json();
        const userRes = await twitchApiFetch('users', tokenData.access_token);
        CACHE.twitchUser = { ...userRes.data[0], access_token: tokenData.access_token };
        
        // Fix: Ferme la popup et rafraîchit le Hub
        res.send(`<html><body><script>if(window.opener){window.opener.location.reload();} window.close();</script></body></html>`);
    } catch(e) { res.status(500).send("Erreur Auth"); }
});

// --- DASHBOARD 360 & ANALYSE IA ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const userRes = await twitchApiFetch(`users?login=${query}`);
        if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0];
            const stream = await twitchApiFetch(`streams?user_id=${user.id}`);
            const follow = await twitchApiFetch(`users/follows?to_id=${user.id}`); 
            CACHE.lastScanData = { ...user, is_live: stream.data.length > 0, followers: follow.total || 0 };
            return res.json({ success: true, data: CACHE.lastScanData });
        }
        res.json({ success: false, error: "Introuvable" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// IA GEMINI INTEGRALE
app.post('/critique_ia', async (req, res) => {
    const { query } = req.body;
    const model = ai.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = `Analyse stratégique pour ${query}. Format HTML (p, ul, li).`;
    const result = await model.generateContent(prompt);
    res.json({ html_response: result.response.text() });
});

// --- RAID BUILDER ---
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    const gameRes = await twitchApiFetch(`games?name=${encodeURIComponent(game)}`);
    if(!gameRes.data.length) return res.json({success:false});
    const streams = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=50`);
    const targets = streams.data.filter(s => s.viewer_count <= max_viewers);
    res.json({ success: true, targets: targets.slice(0, 5) });
});

app.get('/followed_streams', async (req, res) => {
    if(!CACHE.twitchUser) return res.json({ streams: [] });
    const followed = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
    res.json({ streams: followed.data || [] });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`Serveur actif sur port ${PORT}`));
