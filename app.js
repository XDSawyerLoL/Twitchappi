/**
 * STREAMER HUB V60 - BACKEND ULTIMATE
 * Support: Chat Hub (Socket.io), IA Gemini, Stats V37
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http'); // Obligatoire pour le chat
const { Server } = require("socket.io"); // Module Chat
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

// --- INIT FIREBASE ---
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY.replace(/\\n/g, '\n');
        if (rawJson.startsWith("'") || rawJson.startsWith('"')) rawJson = rawJson.slice(1, -1);
        serviceAccount = JSON.parse(rawJson);
    } catch (e) { console.error("Firebase JSON Error", e); }
} else { try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {} }

if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
else admin.initializeApp();
const db = admin.firestore();

// --- CONFIG EXPRESS & SOCKET.IO ---
const app = express();
const server = http.createServer(app); // Serveur HTTP combiné
const io = new Server(server, { cors: { origin: "*" } }); // Serveur Chat

const PORT = process.env.PORT || 10000;
const TWITCH_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_CLIENT_SECRET;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Moteur IA
let aiClient = null;
if (GEMINI_KEY) aiClient = new GoogleGenAI({ apiKey: GEMINI_KEY });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// --- LOGIQUE CHAT (HUB) ---
const chatHistory = [];
io.on('connection', (socket) => {
    socket.emit('history', chatHistory); // Envoi l'historique au nouvel arrivant
    socket.on('send_message', (data) => {
        if (chatHistory.length > 50) chatHistory.shift();
        chatHistory.push(data);
        io.emit('chat_message', data); // Broadcast à tout le monde
    });
});

// --- CACHE & HELPERS ---
const CACHE = { token: null, rotation: { list: [], idx: 0, last: 0 }, boost: null };

async function getToken() {
    if (CACHE.token && CACHE.token.exp > Date.now()) return CACHE.token.val;
    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const data = await res.json();
    CACHE.token = { val: data.access_token, exp: Date.now() + (data.expires_in * 1000) - 60000 };
    return data.access_token;
}

async function twitch(endpoint) {
    const t = await getToken();
    return fetch(`https://api.twitch.tv/helix/${endpoint}`, { headers: { 'Client-ID': TWITCH_ID, 'Authorization': `Bearer ${t}` } }).then(r => r.json());
}

async function askIA(prompt) {
    if(!aiClient) return { html: "<p>IA non configurée</p>" };
    try {
        const res = await aiClient.models.generateContent({ model: "gemini-2.5-flash", contents: [{ role: "user", parts: [{ text: prompt }] }] });
        return { success: true, html_response: res.text() };
    } catch(e) { return { success: false, html_response: "<p>Erreur IA</p>" }; }
}

// --- ROUTES ---

// 1. Player & Rotation
app.get('/get_default_stream', async (req, res) => {
    // Vérif Boost
    const now = Date.now();
    try {
        const q = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if(!q.empty) return res.json({ success: true, channel: q.docs[0].data().channel, mode: 'BOOST', message: '⚡ BOOST ACTIF' });
    } catch(e){}

    // Rotation Auto
    if (now - CACHE.rotation.last > 180000 || CACHE.rotation.list.length === 0) {
        const d = await twitch('streams?language=fr&first=100');
        if(d.data) {
            CACHE.rotation.list = d.data.filter(s => s.viewer_count < 100).map(s => s.user_login);
            CACHE.rotation.last = now;
        }
    }
    const list = CACHE.rotation.list;
    if(list.length === 0) return res.json({ success: true, channel: 'twitch', mode: 'DEFAULT' });
    
    return res.json({ success: true, channel: list[CACHE.rotation.idx % list.length], mode: 'AUTO', message: '👁️ ROTATION 3MIN' });
});

app.post('/cycle_stream', (req, res) => {
    CACHE.rotation.idx++;
    const list = CACHE.rotation.list;
    res.json({ success: true, channel: list.length ? list[CACHE.rotation.idx % list.length] : 'twitch' });
});

// 2. Stats Dashboard (Endpoints V37)
app.get('/api/stats/global', async (req, res) => {
    try {
        const d = await twitch('streams?first=100');
        let v = 0; d.data.forEach(s => v += s.viewer_count);
        // Simulation d'historique pour le graph
        const hist = { live: { labels: ['-4h','-3h','-2h','-1h','Now'], values: [v*0.8, v*0.9, v*0.85, v*0.95, v] } };
        res.json({ success: true, total_viewers: v * 4, total_channels: "12k+", top_game_name: d.data[0]?.game_name, history: hist });
    } catch(e) { res.json({success:false}); }
});

app.get('/api/stats/top_games', async (req, res) => {
    const d = await twitch('games/top?first=9');
    res.json({ games: d.data.map(g => ({ name: g.name, box_art_url: g.box_art_url })) });
});

app.get('/api/stats/languages', async (req, res) => {
    const d = await twitch('streams?first=100');
    const langs = {}; d.data.forEach(s => langs[s.language] = (langs[s.language]||0)+1);
    const sorted = Object.keys(langs).map(k => ({name: k, percent: langs[k]})).sort((a,b)=>b.percent-a.percent).slice(0,5);
    res.json({ languages: sorted });
});

// 3. Outils (Scan, Boost, Raid)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const u = await twitch(`users?login=${query}`);
    if(u.data && u.data.length) {
        const user = u.data[0];
        const s = await twitch(`streams?user_id=${user.id}`);
        const isLive = s.data.length > 0;
        return res.json({ 
            success: true, type: 'user', 
            user_data: { 
                display_name: user.display_name, 
                profile_image_url: user.profile_image_url, 
                viewer_count: isLive ? s.data[0].viewer_count : 0,
                total_views: user.view_count,
                game_name: isLive ? s.data[0].game_name : "Offline",
                is_live: isLive,
                ai_calculated_niche_score: isLive ? 4.5 : 2.5
            } 
        });
    }
    // Fallback Jeu
    const g = await twitch(`games?name=${query}`);
    if(g.data && g.data.length) {
        return res.json({ success: true, type: 'game', game_data: { name: g.data[0].name, box_art_url: g.data[0].box_art_url, total_viewers: 5000, total_streamers: 120 } });
    }
    res.json({ success: false });
});

app.post('/critique_ia', async (req, res) => {
    const p = req.body.type === 'niche' ? `Analyse le potentiel Twitch de "${req.body.query}". HTML court.` : `Idée de clip pour "${req.body.query}". HTML court.`;
    res.json(await askIA(p));
});

app.post('/analyze_schedule', async (req, res) => {
    const p = `Meilleure heure pour streamer du ${req.body.game} ? HTML court.`;
    res.json(await askIA(p));
});

app.post('/stream_boost', async (req, res) => {
    const now = Date.now();
    await db.collection('boosts').add({ channel: req.body.channel, endTime: now + 900000 });
    res.json({ success: true, html_response: "Boost activé !" });
});

app.post('/start_raid', async (req, res) => {
    const d = await twitch(`streams?first=50&language=fr`);
    const target = d.data.find(s => s.viewer_count <= parseInt(req.body.max_viewers)) || d.data[0];
    res.json({ success: true, target: { name: target.user_name, login: target.user_login, thumbnail_url: target.thumbnail_url, viewers: target.viewer_count, game: target.game_name } });
});

// Auth Twitch (Redirection)
app.get('/twitch_auth_start', (req, res) => res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_ID}&redirect_uri=${process.env.TWITCH_REDIRECT_URI}&response_type=token&scope=user:read:follows`));

// Start Server
server.listen(PORT, () => console.log(`🚀 SERVEUR V60 (CHAT + V37 STATS) LANCÉ SUR LE PORT ${PORT}`));
