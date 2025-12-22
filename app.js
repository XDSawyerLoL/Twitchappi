/**
 * STREAMER HUB V65 - MOTEUR FINAL (FIX FIREBASE & AVATARS)
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

// =========================================================
// 1. INITIALISATION FIREBASE (FIX CRASH)
// =========================================================
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        // Nettoyage agressif des guillemets et sauts de ligne invisibles
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        // Remplace les vrais sauts de ligne par des \n échappés pour le JSON
        rawJson = rawJson.replace(/\n/g, '\\n').replace(/\r/g, ''); 
        
        serviceAccount = JSON.parse(rawJson);
    } catch (e) { 
        console.error("⚠️ Firebase Config Error (Mode limité):", e.message); 
    }
} else { try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {} }

if (serviceAccount) {
    try { admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }); } 
    catch (e) { console.error("Firebase Init Error:", e.message); }
} else { try { admin.initializeApp(); } catch(e){} }

const db = admin.firestore();

// =========================================================
// 2. SERVEUR & CHAT
// =========================================================
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

// LOGIQUE CHAT (AVEC AVATAR)
const chatHistory = [];
io.on('connection', (socket) => {
    socket.emit('history', chatHistory);
    socket.on('send_message', (data) => {
        if (chatHistory.length > 50) chatHistory.shift();
        // Si pas d'avatar, on met une image par défaut
        if(!data.avatar) data.avatar = "https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-70x70.png";
        chatHistory.push(data);
        io.emit('chat_message', data);
    });
});

// =========================================================
// 3. HELPERS TWITCH
// =========================================================
const CACHE = { token: null, rotation: { list: [], idx: 0, last: 0 }, twitchUser: null };

async function getToken() {
    if (CACHE.token && CACHE.token.exp > Date.now()) return CACHE.token.val;
    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`, { method: 'POST' });
    const data = await res.json();
    CACHE.token = { val: data.access_token, exp: Date.now() + (data.expires_in * 1000) - 60000 };
    return data.access_token;
}

async function twitch(endpoint, token = null) {
    const t = token || await getToken();
    return fetch(`https://api.twitch.tv/helix/${endpoint}`, { headers: { 'Client-ID': TWITCH_ID, 'Authorization': `Bearer ${t}` } }).then(r => r.json());
}

async function askIA(prompt) {
    if(!aiClient) return { html: "<p>IA indisponible.</p>" };
    try {
        const res = await aiClient.models.generateContent({ model: "gemini-2.5-flash", contents: [{ role: "user", parts: [{ text: prompt }] }] });
        return { success: true, html_response: res.text() };
    } catch(e) { return { success: false, html_response: "<p>Erreur IA.</p>" }; }
}

// =========================================================
// 4. ROUTES
// =========================================================

// Authentification (Récupération Avatar)
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
            // On récupère le profil pour avoir l'avatar
            const uRes = await fetch('https://api.twitch.tv/helix/users', { headers: { 'Client-ID': TWITCH_ID, 'Authorization': `Bearer ${tData.access_token}` } });
            const uData = await uRes.json();
            const user = uData.data[0];
            
            CACHE.twitchUser = { 
                id: user.id, 
                display_name: user.display_name, 
                profile_image_url: user.profile_image_url, // ON GARDE L'AVATAR
                access_token: tData.access_token, 
                expiry: Date.now() + 3600000 
            };
            res.send("<script>window.opener.postMessage('auth_success', '*');window.close();</script>");
        } else { res.send("Erreur Token"); }
    } catch(e) { res.send("Erreur Auth"); }
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ 
            is_connected: true, 
            display_name: CACHE.twitchUser.display_name,
            profile_image_url: CACHE.twitchUser.profile_image_url // ON L'ENVOIE AU FRONT
        });
    }
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

// SCANNER AMÉLIORÉ
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitch(`users?login=${encodeURIComponent(query)}`);
        if(uRes.data && uRes.data.length) {
            const u = uRes.data[0];
            const sRes = await twitch(`streams?user_id=${u.id}`);
            const isLive = sRes.data.length > 0;
            return res.json({ 
                success: true, type: 'user', 
                user_data: { 
                    login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url, 
                    is_live: isLive, 
                    game_name: isLive ? sRes.data[0].game_name : "Offline",
                    title: isLive ? sRes.data[0].title : "",
                    viewer_count: isLive ? sRes.data[0].viewer_count : 0
                } 
            });
        }
        res.json({ success: false });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// VOD (FIX)
app.get('/get_latest_vod', async (req, res) => {
    try {
        const u = await twitch(`users?login=${req.query.channel}`);
        if(!u.data.length) return res.json({success:false});
        const v = await twitch(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
        if(!v.data.length) return res.json({success:false});
        // Correction taille miniature
        const thumb = v.data[0].thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
        res.json({success:true, vod: { title: v.data[0].title, thumbnail_url: thumb, id: v.data[0].id }});
    } catch(e) { res.json({success:false}); }
});

// RAID FINDER (FIX)
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false, error: "Jeu introuvable"});
        
        const sRes = await twitch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        // On cherche le plus gros des petits (optimisation raid)
        const target = sRes.data.filter(s => s.viewer_count <= parseInt(max_viewers))
                                .sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if(target) {
            const thumb = target.thumbnail_url.replace('{width}','320').replace('{height}','180');
            return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: thumb, game: target.game_name } });
        }
        res.json({ success: false, error: "Personne trouvé dans cette tranche." });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// STREAM SUIVIS (FIX MINIATURES)
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        return res.json({ 
            success: true, 
            streams: data.data.map(s => ({ 
                user_name: s.user_name, 
                user_login: s.user_login, 
                viewer_count: s.viewer_count, 
                thumbnail_url: s.thumbnail_url.replace('{width}', '320').replace('{height}', '180'), // FIX ICI
                game_name: s.game_name 
            })) 
        });
    } catch (e) { return res.status(500).json({ success: false }); }
});

// Autres endpoints inchangés mais nécessaires
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
app.get('/api/stats/global', async (req, res) => {
    const d = await twitch('streams?first=100');
    let v = 0; d.data.forEach(s => v += s.viewer_count);
    res.json({ success: true, total_viewers: v * 4, total_channels: "15k+", top_game_name: d.data[0]?.game_name, history: { live: { labels: ['-1h','Now'], values: [v*0.9, v] } } });
});
app.post('/stream_boost', async (req, res) => {
    const now = Date.now();
    await db.collection('boosts').add({ channel: req.body.channel, endTime: now + 900000 });
    res.json({ success: true, html_response: "Boost activé !" });
});
app.post('/critique_ia', async (req, res) => res.json(await askIA(`Analyse "${req.body.query}" Twitch.`)));
app.post('/analyze_schedule', async (req, res) => res.json(await askIA(`Heure stream ${req.body.game}?`)));

// REDIRECTION DU FICHIER HTML
app.get('/', (req,res) => {
    // Si tu as renommé ton fichier, mets le bon nom ici. Par défaut je mets le nom classique.
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html')); 
});

server.listen(PORT, () => console.log(`🚀 SERVER V65 OK PORT ${PORT}`));
