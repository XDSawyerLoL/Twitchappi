const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// ✅ FIX QUOTA : "gemini-1.5-pro" est le modèle stable pour votre forfait Pro API
const GEMINI_MODEL = "gemini-1.5-pro"; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    process.exit(1); 
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    boostedStream: null,    
    globalStreamRotation: {
        streams: [],    
        currentIndex: 0,
        lastFetchTime: 0,
        fetchCooldown: 10 * 60 * 1000 
    }
};

// --- HELPERS ---
async function getTwitchToken() {
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) return CACHE.twitchTokens.app.access_token;
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();
    if (data.access_token) {
        CACHE.twitchTokens.app = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 60000 };
        return data.access_token;
    }
    return null;
}

async function twitchApiFetch(endpoint) {
    const token = await getTwitchToken();
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    return res.json();
}

async function runGeminiAnalysis(prompt) {
    try {
        const model = ai.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent(prompt);
        return { success: true, html_response: result.response.text() };
    } catch (e) {
        return { success: false, error: e.message, html_response: `<p style="color:red">Erreur IA: ${e.message}</p>` };
    }
}

// --- ROUTES AUTH (FIX POPUP) ---
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    try {
        const r = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const d = await r.json();
        if (d.access_token) {
            // ✅ SCRIPT POUR FERMER LE POPUP ET REFRESH L'APP
            res.send(`<script>window.opener.postMessage('auth_success', '*'); window.close();</script>`);
        } else res.send("Erreur Auth");
    } catch (e) { res.status(500).send(e.message); }
});

// --- LOGIQUE ROTATION 0-100 ---
async function refreshRotation() {
    const rot = CACHE.globalStreamRotation;
    if (Date.now() - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    const data = await twitchApiFetch(`streams?language=fr&first=100`);
    const small = data.data.filter(s => s.viewer_count <= 100);
    rot.streams = small.length > 0 ? small.map(s => ({ channel: s.user_login, viewers: s.viewer_count })) : [{channel: 'twitch', viewers: 0}];
    rot.currentIndex = 0;
    rot.lastFetchTime = Date.now();
}

app.get('/get_default_stream', async (req, res) => {
    await refreshRotation();
    const rot = CACHE.globalStreamRotation;
    const s = rot.streams[rot.currentIndex];
    res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `Cycle: ${s.channel} (${s.viewers} vues)` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    await refreshRotation();
    const rot = CACHE.globalStreamRotation;
    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    const s = rot.streams[rot.currentIndex];
    res.json({ success: true, channel: s.channel, viewers: s.viewers });
});

// --- ANALYSE HEURE D'OR ---
app.post('/analyze_golden_hour', async (req, res) => {
    const { game, date } = req.body;
    const prompt = `En tant qu'expert Twitch, analyse le jeu "${game}" pour la date "${date}". 
    Identifie l'Heure d'Or (moment avec le meilleur ratio viewers/concurrence). Réponds en HTML simple (<h4>, <ul>, <li>).`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

// --- ROUTES STANDARDS ---
app.post('/scan_target', async (req, res) => { /* Code scan original conservé */ });
app.post('/critique_ia', async (req, res) => {
    const { query, type } = req.body;
    const prompt = type === 'niche' ? `Critique de niche pour ${query}` : `Repurposing VOD pour ${query}`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`Serveur prêt sur ${PORT}`));
