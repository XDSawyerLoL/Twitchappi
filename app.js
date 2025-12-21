/**
 * STREAMER & NICHE AI HUB - BACKEND (V21 - TRACKER & IA INTEGRATION)
 * ===============================================================
 * 1. Auth Twitch & Firebase Persistance (Blindée Render)
 * 2. IA Gemini 2.5 Flash Grounding (Recherche en direct)
 * 3. Twitch Tracker Engine : Calcul des stats (Watch Time, Peak, Ratio)
 * 4. Fusion Dashboard & Comparateur
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// --- INITIALISATION FIREBASE BLINDÉE ---
const admin = require('firebase-admin');
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY.trim();
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        console.log("✅ [FIREBASE] Config réparée.");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur JSON :", error.message);
    }
}

if (serviceAccount) {
    try {
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id 
            });
        }
    } catch (e) { console.error("❌ [FIREBASE] Init error :", e.message); }
}

const db = admin.firestore();
if (serviceAccount) {
    try {
        db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true });
    } catch(e){}
}

// --- CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; 

app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

const CACHE = {
    twitchTokens: {},
    twitchUser: null,
    lastTrackerData: null,
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 10 * 60 * 1000 }
};

// =========================================================
// HELPERS TWITCH & IA
// =========================================================

async function getTwitchToken() {
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) return CACHE.twitchTokens.app.access_token;
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        if (data.access_token) {
            CACHE.twitchTokens.app = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 300000 };
            return data.access_token;
        }
    } catch (e) { console.error("Token Error", e); }
    return null;
}

async function twitchApiFetch(endpoint, token = null) {
    const accessToken = token || await getTwitchToken();
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 401) throw new Error("Auth Twitch expirée.");
    return res.json();
}

async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) return "Erreur: Clé Gemini manquante.";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }]
    };
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "L'IA n'a pas pu répondre.";
    } catch (e) { return `Erreur IA : ${e.message}`; }
}

// =========================================================
// TWITCH TRACKER ENGINE (STATS)
// =========================================================

app.get('/tracker_stats', async (req, res) => {
    try {
        // 1. Top Games
        const topGamesRes = await twitchApiFetch('games/top?first=15');
        const games = topGamesRes.data;

        const detailedStats = await Promise.all(games.map(async (game) => {
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const streams = streamsRes.data;
            
            const viewers = streams.reduce((sum, s) => sum + s.viewer_count, 0);
            const channels = streams.length;
            const avgViewers = channels > 0 ? Math.round(viewers / channels) : 0;
            
            // Calculs simulés Tracker (basés sur Live pour estimation)
            const hoursWatched = viewers * 1.2; // Estimation simplifiée
            const peakViewers = Math.round(viewers * 1.4);
            const peakChannels = Math.round(channels * 1.3);
            
            // Unified Rating (Logic interne)
            let rating = 100 - (channels / 10); 
            if (avgViewers > 50) rating += 20;
            rating = Math.min(99, Math.max(10, Math.round(rating)));

            return {
                id: game.id,
                name: game.name,
                box_art: game.box_art_url.replace('{width}', '144').replace('{height}', '192'),
                rating: rating,
                viewers: viewers,
                channels: channels,
                hours_watched: Math.round(hoursWatched),
                peak_viewers: peakViewers,
                peak_channels: peakChannels,
                avg_viewers: avgViewers,
                status: viewers > 10000 ? 'Popular' : 'Trending'
            };
        }));

        res.json({ success: true, games: detailedStats });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// ROUTES IA & ANALYSE
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query, stats } = req.body;
    let systemPrompt = "Tu es l'analyste principal de TwitchTracker. Tu fournis des rapports HTML ultra-précis avec <h4>, <ul>, <li>. Utilise le ROSE (#FF0099) pour le texte important.";
    
    let userQuery = `Analyse complète pour : ${query}. `;
    if (stats) userQuery += `Données actuelles : ${JSON.stringify(stats)}. `;
    
    if (type === 'compare') {
        userQuery += "Compare ces deux jeux/streamers. Qui a le meilleur potentiel de croissance pour un petit streamer ? Analyse le ratio viewers/channels.";
    } else {
        userQuery += "Donne un score d'opportunité sur 100, une analyse de la saturation et 3 conseils stratégiques.";
    }

    const result = await callGeminiApi(systemPrompt, userQuery);
    res.json({ success: true, result: result });
});

// =========================================================
// AUTH & ROTATION (V20 ORIGIN)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true });
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("CSRF Error");
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
            res.cookie('twitch_access_token', tokenData.access_token, { httpOnly: true, secure: true, maxAge: 3600000 });
            res.send(`<html><body style="background:#0d0d0d;color:#fff;text-align:center;padding-top:100px;"><script>window.opener.postMessage('auth_success','*');window.close();</script></body></html>`);
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/followed_streams', async (req, res) => {
    const token = req.cookies.twitch_access_token;
    if (!token) return res.status(401).json({ error: "Auth required" });
    try {
        const userRes = await twitchApiFetch('users', token);
        const userId = userRes.data[0].id;
        const data = await twitchApiFetch(`streams/followed?user_id=${userId}`, token);
        res.json({ success: true, streams: data.data, username: userRes.data[0].display_name });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`🚀 HUB V21 ONLINE PORT ${PORT}`));
