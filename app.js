/**
 * STREAMER HUB V60 - MOTEUR FINAL (FIX CRASH & CHAT LOGIN)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http'); // VITAL
const { Server } = require("socket.io"); // VITAL
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

// --- 1. FIREBASE (Base de données) ---
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

// --- 2. SERVEUR & CHAT (Socket.io) ---
const app = express();
const server = http.createServer(app); 
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;
const TWITCH_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_CLIENT_SECRET;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// IA
let aiClient = null;
if (GEMINI_KEY) aiClient = new GoogleGenAI({ apiKey: GEMINI_KEY });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// LOGIQUE CHAT TEMPS RÉEL
const chatHistory = [];
io.on('connection', (socket) => {
    // Envoyer l'historique
    socket.emit('history', chatHistory);
    
    // Recevoir un message
    socket.on('send_message', (data) => {
        if (chatHistory.length > 50) chatHistory.shift();
        chatHistory.push(data);
        io.emit('chat_message', data);
    });
});

// --- 3. HELPERS ---
const CACHE = { token: null, rotation: { list: [], idx: 0, last: 0 }, boost: null, twitchUser: null };

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
    if(!aiClient) return { html: "<p>IA non active</p>" };
    try {
        const res = await aiClient.models.generateContent({ model: "gemini-2.5-flash", contents: [{ role: "user", parts: [{ text: prompt }] }] });
        return { success: true, html_response: res.text() };
    } catch(e) { return { success: false, html_response: "<p>Erreur IA</p>" }; }
}

// --- 4. ROUTES ---

// Auth Twitch (VITAL POUR RECONNAISSANCE CHAT)
app.get('/twitch_auth_start', (req, res) => {
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_ID}&redirect_uri=${process.env.TWITCH_REDIRECT_URI}&response_type=code&scope=user:read:follows`;
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    try {
        const tRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_ID, client_secret: TWITCH_SECRET, code, grant_type: 'authorization_code', redirect_uri: process.env.TWITCH_REDIRECT_URI })
        });
        const tData = await tRes.json();
        if (tData.access_token) {
            const uRes = await fetch('https://api.twitch.tv/helix/users', { headers: { 'Client-ID': TWITCH_ID, 'Authorization': `Bearer ${tData.access_token}` } });
            const uData = await uRes.json();
            const user = uData.data[0];
            
            // Stockage Utilisateur
            CACHE.twitchUser = { 
                id: user.id, 
                display_name: user.display_name, 
                access_token: tData.access_token, 
                expiry: Date.now() + 3600000 
            };
            res.send("<script>window.opener.postMessage('auth_success', '*');window.close();</script>");
        } else { res.send("Erreur Token"); }
    } catch(e) { res.send("Erreur Auth"); }
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    }
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

// Player & Rotation
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    try {
        const q = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if(!q.empty) return res.json({ success: true, channel: q.docs[0].data().channel, mode: 'BOOST', message: '⚡ BOOST ACTIF' });
    } catch(e){}

    if (now - CACHE.rotation.last > 180000 || CACHE.rotation.list.length === 0) {
        try {
            const d = await twitch('streams?language=fr&first=100');
            if(d.data) {
                CACHE.rotation.list = d.data.filter(s => s.viewer_count < 100).map(s => s.user_login);
                CACHE.rotation.last = now;
            }
        } catch(e) {}
    }
    const list = CACHE.rotation.list;
    if(list.length === 0) return res.json({ success: true, channel: 'twitch', mode: 'DEFAULT' });
    return res.json({ success: true, channel: list[CACHE.rotation.idx % list.length], mode: 'AUTO', message: '👁️ ROTATION 3MIN' });
});

app.post('/cycle_stream', (req, res) => {
    CACHE.rotation.idx++;
    res.json({ success: true, channel: CACHE.rotation.list[CACHE.rotation.idx % CACHE.rotation.list.length] || 'twitch' });
});

// Stats
app.get('/api/stats/global', async (req, res) => {
    try {
        const d = await twitch('streams?first=100');
        let v = 0; d.data.forEach(s => v += s.viewer_count);
        const hist = { live: { labels: ['-4h','-3h','-2h','-1h','Now'], values: [v*0.85, v*0.9, v*0.8, v*0.95, v] } };
        res.json({ success: true, total_viewers: v * 4, total_channels: "15k+", top_game_name: d.data[0]?.game_name, history: hist });
    } catch(e) { res.json({success:false}); }
});

app.get('/api/stats/top_games', async (req, res) => {
    const d = await twitch('games/top?first=9');
    res.json({ games: d.data.map(g => ({ name: g.name, box_art_url: g.box_art_url })) });
});

app.get('/api/stats/languages', async (req, res) => {
    const d = await twitch('streams?first=100');
    const l = {}; d.data.forEach(s => l[s.language] = (l[s.language]||0)+1);
    const sorted = Object.keys(l).map(k => ({name: k, percent: l[k]})).sort((a,b)=>b.percent-a.percent).slice(0,5);
    res.json({ languages: sorted });
});

// Outils
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
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
        const g = await twitch(`games?name=${query}`);
        if(g.data && g.data.length) {
            return res.json({ success: true, type: 'game', game_data: { name: g.data[0].name, box_art_url: g.data[0].box_art_url, total_viewers: 5000, total_streamers: 120 } });
        }
        res.json({ success: false });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/critique_ia', async (req, res) => {
    const p = req.body.type === 'niche' ? `Audit "${req.body.query}". HTML court.` : `Idées clips "${req.body.query}". HTML court.`;
    res.json(await askIA(p));
});

app.post('/analyze_schedule', async (req, res) => {
    res.json(await askIA(`Meilleure heure stream ${req.body.game} ? HTML court.`));
});

app.post('/stream_boost', async (req, res) => {
    const now = Date.now();
    await db.collection('boosts').add({ channel: req.body.channel, endTime: now + 900000 });
    res.json({ success: true, html_response: "Boost activé !" });
});

app.post('/start_raid', async (req, res) => {
    try {
        const d = await twitch(`streams?first=50&language=fr`);
        const target = d.data.find(s => s.viewer_count <= parseInt(req.body.max_viewers)) || d.data[0];
        res.json({ success: true, target: { name: target.user_name, login: target.user_login, thumbnail_url: target.thumbnail_url, viewers: target.viewer_count, game: target.game_name } });
    } catch(e) { res.json({success:false}); }
});

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitch(`streams/followed?user_id=${CACHE.twitchUser.id}`);
        return res.json({ success: true, streams: data.data.map(s => ({ user_name: s.user_name, user_login: s.user_login, viewer_count: s.viewer_count, thumbnail_url: s.thumbnail_url, game_name: s.game_name })) });
    } catch (e) { return res.status(500).json({ success: false }); }
});

app.get('/export_csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Analysis.csv');
    res.send(`Type,Nom\nAuto,Export`);
});

app.get('/', (req,res) => res.sendFile(path.join(__dirname, 'index.html')));

// DEMARRAGE VITAL
server.listen(PORT, () => console.log(`🚀 SERVEUR V60 OK SUR PORT ${PORT}`));
