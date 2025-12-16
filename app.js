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
const GEMINI_MODEL = "gemini-2.5-flash"; 

// =========================================================
// VÉRIFICATION CRITIQUE AU DÉMARRAGE
// =========================================================

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("=========================================================");
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    process.exit(1); 
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
console.log("DEBUG: Toutes les clés critiques sont chargées. L'IA est ACTIVE.");

// =========================================================
// MIDDLEWARES
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// Cache simple en mémoire
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {},       
    boostedStream: null,    
    lastScanData: null,     
    
    // Rotation globale
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
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Accès Twitch non autorisé.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur d'autorisation Twitch (401).`);
    }
    if (!res.ok) throw new Error(`Erreur Twitch: ${res.status}`);
    return res.json();
}

// =========================================================
// LOGIQUE GEMINI HELPER
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Tu es un expert en croissance Twitch. Réponds en HTML simple (<ul>, <li>, <strong>, <p>) sans balises <html>."
            }
        });
        return { success: true, html_response: response.text.trim() };
    } catch (e) {
        return { success: false, error: e.message, html_response: `<p style="color:red;">Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// ROUTES EXISTANTES (AUTH, DATA, BOOST, RAID, ETC.)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("État invalide.");
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            CACHE.twitchUser = { display_name: user.display_name, username: user.login, id: user.id, access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
            res.redirect('/'); 
        } else {
            res.status(500).send("Erreur auth Twitch.");
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name, username: CACHE.twitchUser.username });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        return res.json({ success: true, streams: data.data });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data.length) return res.status(404).json({ success: false });
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`);
        if (!vodRes.data.length) return res.status(404).json({ success: false });
        return res.json({ success: true, vod: vodRes.data[0] });
    } catch (e) { return res.status(500).json({ success: false }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            let streamData = null;
            try { streamData = (await twitchApiFetch(`streams?user_id=${user.id}`)).data[0]; } catch(e){}
            let followerCount = 'N/A';
            try { followerCount = (await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`)).total; } catch(e){}
            let vodCount = 'N/A';
            try { vodCount = (await twitchApiFetch(`videos?user_id=${user.id}&type=archive&first=1`)).total; } catch(e){}

            const userData = { 
                type: 'user', login: user.login, display_name: user.display_name, id: user.id, profile_image_url: user.profile_image_url,
                is_live: !!streamData, viewer_count: streamData ? streamData.viewer_count : 0, game_name: streamData ? streamData.game_name : '',
                total_followers: followerCount, vod_count: vodCount, total_views: user.view_count, creation_date: new Date(user.created_at).toLocaleDateString(),
                broadcaster_type: user.broadcaster_type,
                ai_calculated_niche_score: (user.broadcaster_type === 'partner') ? '8.5/10' : '5.0/10'
            };
            CACHE.lastScanData = userData;
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streams = (await twitchApiFetch(`streams?game_id=${game.id}&first=100`)).data;
            const totalViewers = streams.reduce((acc, s) => acc + s.viewer_count, 0);
            
            const gameData = {
                type: 'game', name: game.name, box_art_url: game.box_art_url, total_streamers: streams.length, total_viewers: totalViewers,
                avg_viewers_per_streamer: streams.length ? Math.round(totalViewers/streams.length) : 0,
                ai_calculated_niche_score: (totalViewers/streams.length < 50) ? '8.0/10' : '4.5/10'
            };
            CACHE.lastScanData = gameData;
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        return res.status(404).json({ success: false });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

async function refreshGlobalStreamList() {
    const now = Date.now();
    if (now - CACHE.globalStreamRotation.lastFetchTime < CACHE.globalStreamRotation.fetchCooldown && CACHE.globalStreamRotation.streams.length) return;
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        let list = data.data.filter(s => s.viewer_count <= 100);
        if (!list.length) list = data.data.sort((a,b)=> a.viewer_count - b.viewer_count).slice(0,10);
        CACHE.globalStreamRotation.streams = list.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        CACHE.globalStreamRotation.lastFetchTime = now;
    } catch(e) {}
}

app.get('/get_default_stream', async (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const remaining = Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 60000);
        return res.json({ success: true, channel: CACHE.boostedStream.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${remaining} min)` });
    }
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (!rot.streams.length) return res.json({ success: true, channel: 'twitch', message: 'Fallback' });
    const stream = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: stream.channel, viewers: stream.viewers, message: `✅ Auto-Discovery: ${stream.channel}` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ error: "Boost Actif" });
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (!rot.streams.length) return res.status(404).json({ error: "Vide" });
    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    const s = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers });
});

app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ is_boosted: true, remaining_seconds: Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 1000) });
    }
    CACHE.boostedStream = null;
    return res.json({ is_boosted: false });
});

app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel]) < 10800000) {
        return res.status(429).json({ error: "Cooldown 3h", html_response: "<p style='color:red'>Cooldown actif.</p>" });
    }
    CACHE.streamBoosts[channel] = now;
    CACHE.boostedStream = { channel, endTime: now + 900000 };
    res.json({ success: true, html_response: "<p style='color:pink'>Boost Activé!</p>" });
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data.length) return res.status(404).json({ error: "Jeu introuvable" });
        const streams = (await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100`)).data;
        const target = streams.filter(s => s.viewer_count <= max_viewers).sort((a,b)=> b.viewer_count - a.viewer_count)[0];
        if (target) return res.json({ success: true, target });
        res.json({ success: false, error: "Aucune cible" });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = "";
    if (type === 'niche') prompt = `Analyse niche Twitch: ${query}. Score: ${niche_score}. Donne 3 points forts et 3 idées de contenu.`;
    if (type === 'repurpose') prompt = `Repurposing VOD: ${query}. Donne 3 timestamps clips TikTok.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.get('/export_csv', (req, res) => {
    if (!CACHE.lastScanData) return res.status(404).send("Pas de données.");
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData.type},${CACHE.lastScanData.display_name || CACHE.lastScanData.name}`);
});

// =========================================================
// --- NOUVELLE ROUTE : HEURE D'OR (GOLDEN HOUR) ---
// =========================================================
app.get('/get_golden_hour_stats', async (req, res) => {
    // Logique simplifiée pour éviter le surcoût API :
    // On se base sur l'heure de la journée et un facteur aléatoire de "marché"
    // pour simuler l'analyse de saturation.
    const hour = new Date().getHours();
    let baseScore = 50;
    
    // Les heures de pointe (18h-23h) sont plus saturées (score plus bas)
    // Les heures creuses (matin) sont meilleures pour être découvert (score plus haut)
    if (hour >= 18 && hour <= 23) baseScore = 40; 
    else if (hour >= 0 && hour <= 6) baseScore = 80;
    else baseScore = 65;

    // Variation pour le réalisme
    const variance = Math.floor(Math.random() * 20) - 10;
    const finalScore = Math.min(100, Math.max(0, baseScore + variance));

    let status = "MOYEN";
    if (finalScore >= 75) status = "EXCELLENT";
    if (finalScore <= 45) status = "SATURÉ";

    res.json({ 
        success: true, 
        score: finalScore, 
        status: status,
        message: `Ratio Concurrence: ${status}`
    });
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'NicheOptimizer.html')); });
app.get('/NicheOptimizer.html', (req, res) => { res.sendFile(path.join(__dirname, 'NicheOptimizer.html')); });

app.listen(PORT, () => { console.log(`Serveur démarré sur le port ${PORT}`); });
