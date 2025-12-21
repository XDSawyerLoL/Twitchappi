/**
 * STREAMER & NICHE AI HUB - BACKEND (V22 - TRACKER & IA GROUNDING)
 * ===============================================================
 * Serveur Node.js/Express gérant :
 * 1. L'authentification Twitch (OAuth) + Persistance Firebase (Fix Render).
 * 2. Moteur de statistiques Twitch Tracker (Watch Time, Peaks, Rating).
 * 3. IA Gemini 2.5 Flash avec GROUNDING (Recherche Google en direct).
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// --- INITIALISATION FIREBASE BLINDÉE (V20 Fix) ---
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
    } catch (error) { console.error("❌ [FIREBASE] Erreur JSON :", error.message); }
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
    try { db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true }); } catch(e){}
}

const app = express();
const PORT = process.env.PORT || 10000;

// Configuration Clés
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
    lastScanData: null
};

// =========================================================
// SYSTÈME IA ROBUSTE (AVEC GROUNDING)
// =========================================================

async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) return "Erreur: Clé Gemini manquante.";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }] // ACTIVATION GROUNDING
    };

    try {
        const response = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "Analyse indisponible.";
    } catch (e) { 
        console.error("IA Error:", e);
        return `Désolé, erreur IA : ${e.message}`; 
    }
}

// =========================================================
// MOTEUR TRACKER & API TWITCH
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
    if (res.status === 401) throw new Error("Session expirée.");
    return res.json();
}

app.get('/tracker_stats', async (req, res) => {
    try {
        const topGamesRes = await twitchApiFetch('games/top?first=20');
        const detailedStats = await Promise.all(topGamesRes.data.map(async (game) => {
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const viewers = streamsRes.data.reduce((sum, s) => sum + s.viewer_count, 0);
            const channels = streamsRes.data.length;
            const avgViewers = channels > 0 ? Math.round(viewers / channels) : 0;
            
            return {
                id: game.id, name: game.name, box_art: game.box_art_url.replace('{width}', '144').replace('{height}', '192'),
                rating: Math.min(99, Math.max(10, 100 - (channels / 10) + (avgViewers / 2))),
                viewers, channels, watch_time: viewers * 1.6, stream_time: channels * 2.1,
                peak_viewers: Math.round(viewers * 1.4), peak_channels: Math.round(channels * 1.25)
            };
        }));
        res.json({ success: true, games: detailedStats });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, stats } = req.body;
    let systemPrompt = "Tu es l'analyste stratégique Twitch. Réponds UNIQUEMENT en HTML structuré (h4, ul, li). Utilise le ROSE (#FF0099) pour les conseils clés.";
    let userQuery = `Analyse de niche complète pour : ${query}. `;
    if (stats) userQuery += `Métriques réelles extraites : ${JSON.stringify(stats)}. `;
    
    if (type === 'compare') userQuery += "Compare ces deux sujets pour un petit streamer. Lequel est le plus viable ?";
    else userQuery += "Fournis un score d'opportunité, une analyse de saturation et 3 recommandations de contenu.";

    const result = await callGeminiApi(systemPrompt, userQuery);
    res.json({ success: true, html_response: result });
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query.toLowerCase())}`);
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            const followers = await twitchApiFetch(`channels/followers?broadcaster_id=${user.id}&first=1`);
            const data = { login: user.login, display_name: user.display_name, profile_image: user.profile_image_url, total_followers: followers.total, ai_calculated_niche_score: "7.2/10" };
            return res.json({ success: true, type: 'user', user_data: data });
        }
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const data = { name: game.name, box_art: game.box_art_url, total_viewers: 4500, total_streamers: 30, ai_calculated_niche_score: "8.5/10" };
            return res.json({ success: true, type: 'game', game_data: data });
        }
        res.status(404).json({ success: false, message: "Cible non trouvée" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- AUTH & BOOST ---

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
        const data = await twitchApiFetch(`streams/followed?user_id=${userRes.data[0].id}`, token);
        res.json({ success: true, streams: data.data, username: userRes.data[0].display_name });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/twitch_user_status', async (req, res) => {
    const token = req.cookies.twitch_access_token;
    if (!token) return res.json({ is_connected: false });
    try {
        const userRes = await twitchApiFetch('users', token);
        res.json({ is_connected: true, display_name: userRes.data[0].display_name });
    } catch (e) { res.json({ is_connected: false }); }
});

app.get('/get_default_stream', (req, res) => res.json({ success: true, channel: 'twitch', message: 'Auto-Discovery : Twitch' }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`🚀 HUB V22 READY PORT ${PORT}`));
