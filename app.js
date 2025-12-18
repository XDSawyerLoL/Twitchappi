const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; 

// Initialisation IA (Syntaxe Corrigée)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// Cache Système
const CACHE = {
    twitchTokens: {}, twitchUser: null, streamBoosts: {}, boostedStream: null,
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 900000 }
};

// --- HELPERS TWITCH ---
async function getTwitchToken() {
    if (CACHE.twitchTokens['app'] && CACHE.twitchTokens['app'].expiry > Date.now()) return CACHE.twitchTokens['app'].token;
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    CACHE.twitchTokens['app'] = { token: data.access_token, expiry: Date.now() + 3600000 };
    return data.access_token;
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken();
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`Twitch API Error: ${res.status}`);
    return res.json();
}

// --- LOGIQUE IA (Correction getGenerativeModel) ---
async function runGeminiAnalysis(prompt) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert Twitch. Réponds en HTML (p, ul, li, h4, strong). Pas de balise markdown ```html."
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return { success: true, html_response: text };
    } catch (e) {
        console.error("Erreur IA:", e);
        return { success: false, html_response: `<p style="color:red">Erreur IA: ${e.message}</p>` };
    }
}

// --- ROUTES AUTH ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows+channel:manage:raids&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true });
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    const tokenRes = await fetch('[https://id.twitch.tv/oauth2/token](https://id.twitch.tv/oauth2/token)', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET,
            code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI
        })
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
        const userRes = await twitchApiFetch('users', tokenData.access_token);
        CACHE.twitchUser = { ...userRes.data[0], access_token: tokenData.access_token, expiry: Date.now() + 3600000 };
        res.redirect('/');
    }
});

// --- ROUTES DATA & TOOLS ---
app.get('/get_default_stream', async (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ success: true, channel: CACHE.boostedStream.channel, viewers: 'BOOST' });
    }
    const data = await twitchApiFetch('streams?language=fr&first=100');
    const niche = data.data.filter(s => s.viewer_count <= 100);
    const target = niche[Math.floor(Math.random() * niche.length)];
    res.json({ success: true, channel: target ? target.user_login : 'twitch', viewers: target ? target.viewer_count : 0 });
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Connecte Twitch !" });
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100`);
        const targets = streamsRes.data.filter(s => s.viewer_count <= parseInt(max_viewers));
        if (targets.length > 0) {
            const target = targets[0];
            // Lancement technique du raid
            await fetch(`https://api.twitch.tv/helix/raids?from_broadcaster_id=${CACHE.twitchUser.id}&to_broadcaster_id=${target.user_id}`, {
                method: 'POST',
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${CACHE.twitchUser.access_token}` }
            });
            res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count } });
        } else res.json({ success: false, error: "Pas de cible" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = `Analyse Twitch pour ${query}. Type: ${type}. Score de niche: ${niche_score}/10.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

// Fallback routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`FULL POWER SERVER ON ${PORT}`));
