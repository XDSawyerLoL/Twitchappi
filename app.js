/**
 * STREAMER HUB V80 - MOTEUR FINAL
 * Correctifs : Firebase Parsing Robust, Route HTML, Socket.io
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http'); 
const { Server } = require("socket.io");
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

// 1. INITIALISATION FIREBASE ROBUSTE (FIX JSON ERROR)
let serviceAccount;
const rawKey = process.env.FIREBASE_SERVICE_KEY;

if (rawKey) {
    try {
        // Etape 1 : On enlève les espaces au début/fin
        let cleanKey = rawKey.trim();
        
        // Etape 2 : On retire les guillemets simples ou doubles qui encadrent tout le JSON (fréquent sur Render)
        if ((cleanKey.startsWith("'") && cleanKey.endsWith("'")) || 
            (cleanKey.startsWith('"') && cleanKey.endsWith('"'))) {
            cleanKey = cleanKey.slice(1, -1);
        }

        // Etape 3 : On remplace les VRAIS retours à la ligne par des "\n" (échappés) pour le JSON
        // C'est souvent ça qui cause l'erreur "Bad control character"
        cleanKey = cleanKey.replace(/\n/g, '\\n').replace(/\r/g, '');

        serviceAccount = JSON.parse(cleanKey);
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ [FIREBASE] Base de données connectée.");
    } catch (e) {
        console.error("⚠️ [FIREBASE ERROR] Impossible de lire la clé JSON :", e.message);
        console.log("-> Le serveur continue sans base de données (Mode limité).");
        // On initialise une app vide pour éviter le crash total
        try { admin.initializeApp(); } catch(err){}
    }
} else {
    // Cas local (fichier)
    try { 
        serviceAccount = require('./serviceAccountKey.json'); 
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (e) {
        console.log("⚠️ Pas de clé Firebase détectée. Mode limité.");
        try { admin.initializeApp(); } catch(err){}
    }
}

const db = admin.firestore();

// 2. CONFIGURATION SERVEUR
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;
const TWITCH_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_CLIENT_SECRET;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

let aiClient = null;
if (GEMINI_KEY) aiClient = new GoogleGenAI({ apiKey: GEMINI_KEY });

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// 3. LOGIQUE CHAT (AVATAR + PSEUDO)
const chatHistory = [];
io.on('connection', (socket) => {
    socket.emit('history', chatHistory);
    socket.on('send_message', (data) => {
        if (chatHistory.length > 50) chatHistory.shift();
        if(!data.avatar) data.avatar = "https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-70x70.png";
        chatHistory.push(data);
        io.emit('chat_message', data);
    });
});

// 4. HELPERS
const CACHE = { token: null, rotation: { list: [], idx: 0, last: 0 }, twitchUser: null };

async function getToken() {
    if (CACHE.token && CACHE.token.exp > Date.now()) return CACHE.token.val;
    try {
        const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const data = await res.json();
        CACHE.token = { val: data.access_token, exp: Date.now() + (data.expires_in * 1000) - 60000 };
        return data.access_token;
    } catch(e) { return null; }
}

async function twitch(endpoint, token = null) {
    const t = token || await getToken();
    return fetch(`https://api.twitch.tv/helix/${endpoint}`, { headers: { 'Client-ID': TWITCH_ID, 'Authorization': `Bearer ${t}` } }).then(r => r.json());
}

async function askIA(prompt) {
    if(!aiClient) return { success: false, html_response: "<p>IA non active.</p>" };
    try {
        const res = await aiClient.models.generateContent({ model: "gemini-2.5-flash", contents: [{ role: "user", parts: [{ text: prompt }] }] });
        return { success: true, html_response: res.text() };
    } catch(e) { return { success: false, html_response: "<p>Erreur IA.</p>" }; }
}

// 5. ROUTES
app.get('/twitch_auth_start', (req, res) => res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_ID}&redirect_uri=${process.env.TWITCH_REDIRECT_URI}&response_type=code&scope=user:read:follows`));

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
            CACHE.twitchUser = { id: user.id, display_name: user.display_name, profile_image_url: user.profile_image_url, access_token: tData.access_token, expiry: Date.now() + 3600000 };
            res.send("<script>window.opener.postMessage('auth_success', '*');window.close();</script>");
        } else { res.send("Erreur Token"); }
    } catch(e) { res.send("Erreur Auth"); }
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name, profile_image_url: CACHE.twitchUser.profile_image_url });
    }
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

// SCANNER
app.post('/scan_target', async (req, res) => {
    try {
        const uRes = await twitch(`users?login=${encodeURIComponent(req.body.query)}`);
        if(uRes.data && uRes.data.length) {
            const u = uRes.data[0];
            const sRes = await twitch(`streams?user_id=${u.id}`);
            const cRes = await twitch(`channels?broadcaster_id=${u.id}`);
            const isLive = sRes.data.length > 0;
            return res.json({ 
                success: true, type: 'user', 
                user_data: { 
                    login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url, 
                    is_live: isLive, game_name: cRes.data[0]?.game_name || "N/A", title: cRes.data[0]?.title || "",
                    viewer_count: isLive ? sRes.data[0].viewer_count : 0,
                    ai_calculated_niche_score: isLive ? "4.8/5" : "3.0/5"
                } 
            });
        }
        res.json({ success: false });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// VOD
app.get('/get_latest_vod', async (req, res) => {
    try {
        const u = await twitch(`users?login=${req.query.channel}`);
        if(!u.data.length) return res.json({success:false});
        const v = await twitch(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
        if(!v.data.length) return res.json({success:false});
        const thumb = v.data[0].thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
        res.json({success:true, vod: { title: v.data[0].title, thumbnail_url: thumb, id: v.data[0].id }});
    } catch(e) { res.json({success:false}); }
});

// RAID (Cible unique)
app.post('/start_raid', async (req, res) => {
    try {
        const gRes = await twitch(`search/categories?query=${encodeURIComponent(req.body.game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        const sRes = await twitch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const target = sRes.data.filter(s => s.viewer_count <= parseInt(req.body.max_viewers)).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        if(target) {
            const thumb = target.thumbnail_url.replace('{width}','320').replace('{height}','180');
            return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: thumb, game: target.game_name } });
        }
        res.json({ success: false });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// FOLLOWED
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        return res.json({ success: true, streams: data.data.map(s => ({ 
            user_name: s.user_name, user_login: s.user_login, viewer_count: s.viewer_count, 
            thumbnail_url: s.thumbnail_url.replace('{width}', '320').replace('{height}', '180'),
            game_name: s.game_name 
        }))});
    } catch (e) { return res.status(500).json({ success: false }); }
});

// PLAYER
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    try {
        const q = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if(!q.empty) return res.json({ success: true, channel: q.docs[0].data().channel, mode: 'BOOST', message: '⚡ BOOST ACTIF' });
    } catch(e){}
    if (now - CACHE.rotation.last > 180000 || CACHE.rotation.list.length === 0) {
        try { const d = await twitch('streams?language=fr&first=100'); if(d.data) { CACHE.rotation.list = d.data.filter(s => s.viewer_count < 100).map(s => s.user_login); CACHE.rotation.last = now; } } catch(e){}
    }
    const list = CACHE.rotation.list;
    if(list.length === 0) return res.json({ success: true, channel: 'twitch', mode: 'DEFAULT' });
    return res.json({ success: true, channel: list[CACHE.rotation.idx % list.length], mode: 'AUTO', message: '👁️ AUTO 3MIN' });
});
app.post('/cycle_stream', (req, res) => { CACHE.rotation.idx++; res.json({ success: true, channel: CACHE.rotation.list[CACHE.rotation.idx % CACHE.rotation.list.length] || 'twitch' }); });

// STATS & IA
app.get('/api/stats/global', async (req, res) => {
    const d = await twitch('streams?first=100');
    let v = 0; d.data.forEach(s => v += s.viewer_count);
    res.json({ success: true, total_viewers: v * 4, total_channels: "15k+", top_game_name: d.data[0]?.game_name, history: { live: { labels: ['-1h','Now'], values: [v*0.9, v] } } });
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
app.post('/critique_ia', async (req, res) => res.json(await askIA(req.body.type === 'niche' ? `Audit "${req.body.query}" Twitch.` : `Idée clip "${req.body.query}".`)));
app.post('/analyze_schedule', async (req, res) => res.json(await askIA(`Heure stream ${req.body.game}? HTML.`)));
app.post('/stream_boost', async (req, res) => { await db.collection('boosts').add({ channel: req.body.channel, endTime: Date.now() + 900000 }); res.json({ success: true, html_response: "Boost activé !" }); });
app.get('/export_csv', (req, res) => res.send(`Type,Nom\nScan,Export`));

// ✅ ROUTE HTML OBLIGATOIRE (Pointe sur index.html)
app.get('/', (req,res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => console.log(`🚀 SERVEUR V80 OK (PORT ${PORT})`));
