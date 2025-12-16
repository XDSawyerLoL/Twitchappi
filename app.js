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
const GEMINI_MODEL = "gemini-1.5-flash"; 

// =========================================================
// VÉRIFICATION CRITIQUE AU DÉMARRAGE
// =========================================================

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    process.exit(1); 
}

const ai = new GoogleGenAI(GEMINI_API_KEY); 

// =========================================================
// MIDDLEWARES ET CACHE
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
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });
    if (res.status === 401) { CACHE.twitchTokens['app'] = null; }
    return res.json();
}

// =========================================================
// LOGIQUE GEMINI HELPER
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        const model = ai.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent(prompt);
        return { success: true, html_response: result.response.text() };
    } catch (e) {
        return { success: false, status: 500, html_response: `<p style="color:red;">Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// ROUTES AUTH (OAuth)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true });
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
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
        CACHE.twitchUser = { 
            ...userRes.data[0], 
            access_token: tokenData.access_token, 
            expiry: Date.now() + (tokenData.expires_in * 1000) 
        };
        res.redirect('/');
    }
});

app.get('/twitch_user_status', (req, res) => {
    res.json(CACHE.twitchUser ? { is_connected: true, ...CACHE.twitchUser } : { is_connected: false });
});

// =========================================================
// LOGIQUE BOOST & ROTATION
// =========================================================

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    const COOLDOWN = 3 * 60 * 60 * 1000; 

    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel]) < COOLDOWN) {
        const min = Math.ceil((CACHE.streamBoosts[channel] + COOLDOWN - now) / 60000);
        return res.status(429).json({ success: false, html_response: `<p style="color:red;">❌ Attendez ${min} min.</p>` });
    }

    CACHE.streamBoosts[channel] = now;
    CACHE.boostedStream = { channel, endTime: now + (15 * 60 * 1000) };
    res.json({ success: true, html_response: `<p style="color:green;">✅ Boost actif pour ${channel} !</p>` });
});

app.get('/get_default_stream', async (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ success: true, channel: CACHE.boostedStream.channel, message: "BOOST" });
    }
    // Rotation 0-100 simplifiée
    if (CACHE.globalStreamRotation.streams.length === 0) {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        CACHE.globalStreamRotation.streams = data.data.filter(s => s.viewer_count <= 100).map(s => ({ channel: s.user_login }));
    }
    const s = CACHE.globalStreamRotation.streams[CACHE.globalStreamRotation.currentIndex];
    res.json({ success: true, channel: s ? s.channel : 'twitch' });
});

app.post('/cycle_stream', (req, res) => {
    const { direction } = req.body;
    const rot = CACHE.globalStreamRotation;
    rot.currentIndex = direction === 'next' ? (rot.currentIndex + 1) % rot.streams.length : (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

// =========================================================
// SCAN & ANALYSE
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const userRes = await twitchApiFetch(`users?login=${query}`);
    if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0];
        CACHE.lastScanData = { type: 'user', ...user };
        return res.json({ success: true, type: 'user', user_data: user });
    }
    res.status(404).json({ success: false });
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    const prompt = `Analyse expert Twitch pour ${query} (Type: ${type}). Format HTML.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.get('/export_csv', (req, res) => {
    if (!CACHE.lastScanData) return res.status(404).send("Pas de données");
    res.setHeader('Content-Type', 'text/csv');
    res.send(`Metrique,Valeur\nLogin,${CACHE.lastScanData.login}\nID,${CACHE.lastScanData.id}`);
});

// =========================================================
// ROUTES DE FIN ET LANCEMENT
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur actif sur le port ${PORT}`);
});
