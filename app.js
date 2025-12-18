const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// ✅ CORRECTIF LIBRAIRIE : On utilise le standard stable
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// ✅ Modèle 1.5 Pro (Stable & Gratuit via API)
const GEMINI_MODEL = "gemini-1.5-pro"; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("=========================================================");
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    console.error("=========================================================");
    process.exit(1); 
}

// ✅ INITIALISATION IA CORRIGÉE
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
console.log(`DEBUG: IA Active sur le modèle ${GEMINI_MODEL}`);

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
        fetchCooldown: 10 * 60 * 1000 
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
// LOGIQUE GEMINI HELPER (CORRIGÉE)
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        // ✅ Utilisation de la méthode correcte pour @google/generative-ai
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert Twitch. Réponds en HTML simple (<ul>, <li>, <h4>, <strong>, <p>)."
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        return { success: true, html_response: text };
    } catch (e) {
        let errorMsg = e.message;
        if (e.message.includes('429')) errorMsg = "Quota API dépassé (429).";
        
        return { success: false, status: 500, error: errorMsg, html_response: `<p style="color:red;">Erreur IA: ${errorMsg}</p>` };
    }
}

// =========================================================
// ROUTES AUTH
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
    });
    const tokenData = await tokenRes.json();
    if (tokenData.access_token) {
        const userRes = await twitchApiFetch('users', tokenData.access_token);
        CACHE.twitchUser = { ...userRes.data[0], access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
        res.send(`<script>window.opener.postMessage('auth_success', '*'); window.close();</script>`);
    } else res.status(500).send("Erreur Auth.");
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

// =========================================================
// ROTATION & STREAMS
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;

    try {
        let allStreams = [];
        let cursor = "";
        for (let i = 0; i < 3; i++) {
            const data = await twitchApiFetch(`streams?language=fr&first=100${cursor ? '&after=' + cursor : ''}`);
            if(data.data) allStreams = allStreams.concat(data.data);
            cursor = data.pagination?.cursor;
            if (!cursor) break;
        }
        const suitable = allStreams.filter(s => s.viewer_count <= 100);
        
        // Fallback si vide
        if (suitable.length === 0 && allStreams.length > 0) {
             rotation.streams = allStreams.slice(-20).map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        } else {
             rotation.streams = suitable.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        }
        
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
// ROUTES ANALYSE (SCAN, IA, GOLDEN)
// =========================================================

app.post('/analyze_golden_hour', async (req, res) => {
    const { game, date } = req.body;
    const prompt = `Agis comme un expert data analyst Twitch. Pour le jeu "${game}" le "${date}", identifie l'Heure d'Or (ratio viewers/concurrence). Réponse HTML simple.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
    if (userRes.data && userRes.data.length > 0) {
        const u = userRes.data[0];
        const streamRes = await twitchApiFetch(`streams?user_id=${u.id}`).catch(()=>({data:[]}));
        
        let followers = 'N/A';
        try { const f = await twitchApiFetch(`channels/followers?broadcaster_id=${u.id}&first=1`); followers = f.total; } catch(e){}

        const userData = { 
            login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url, 
            is_live: streamRes.data.length > 0, viewer_count: streamRes.data.length > 0 ? streamRes.data[0].viewer_count : 0, 
            game_name: streamRes.data.length > 0 ? streamRes.data[0].game_name : 'OFF', 
            total_followers: followers, total_views: u.view_count, 
            ai_calculated_niche_score: 'Calcul...' 
        };
        CACHE.lastScanData = { type: 'user', user_data: userData };
        return res.json({ success: true, type: 'user', user_data: userData });
    }
    // Recherche Jeu
    const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
    if (gameRes.data && gameRes.data.length > 0) {
        const g = gameRes.data[0];
        const sRes = await twitchApiFetch(`streams?game_id=${g.id}&first=100`);
        const totalV = sRes.data.reduce((acc, v) => acc + v.viewer_count, 0);
        const gameData = { name: g.name, box_art_url: g.box_art_url, total_viewers: totalV, total_streamers: sRes.data.length, ai_calculated_niche_score: 'Calcul...' };
        CACHE.lastScanData = { type: 'game', game_data: gameData };
        return res.json({ success: true, type: 'game', game_data: gameData });
    }
    res.status(404).json({ success: false, message: "Non trouvé" });
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    const prompt = `Analyse Twitch pour "${query}". Type: ${type}. Format HTML simple.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    CACHE.boostedStream = { channel, endTime: Date.now() + 15 * 60 * 1000 };
    res.json({ success: true, html_response: `<p style="color:pink">✅ Boost activé pour ${channel}</p>` });
});

app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ is_boosted: true, channel: CACHE.boostedStream.channel, remaining_seconds: Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 1000) });
    }
    return res.json({ is_boosted: false });
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false, error: "Jeu introuvable"});
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100`);
        const targets = sRes.data.filter(s => s.viewer_count <= max_viewers);
        if(targets.length > 0) {
            const t = targets[0];
            return res.json({success: true, target: { name: t.user_name, login: t.user_login, viewers: t.viewer_count, game: t.game_name, thumbnail_url: t.thumbnail_url }});
        }
        return res.json({success: false, error: "Aucune cible trouvée."});
    } catch(e) { return res.json({success:false, error: e.message}); }
});

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
    res.json({ success: true, streams: data.data });
});

app.get('/export_csv', (req, res) => { res.send("CSV Export Placeholder"); });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur prêt sur port ${PORT}`));
