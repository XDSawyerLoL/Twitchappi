/**
 * STREAMER & NICHE AI HUB - BACKEND (V50 - DATA & UI FIX)
 * Code original conservé + Patch Chat/Avatar/Raid
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const http = require('http'); // NECESSAIRE POUR CHAT
const { Server } = require("socket.io"); // NECESSAIRE POUR CHAT

// ✅ MOTEUR IA
const { GoogleGenAI } = require('@google/genai');

const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE (TON CODE EXACT)
// =========================================================
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
    } catch (error) { console.error("❌ Erreur JSON Firebase:", error.message); }
} else {
    try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {}
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log("✅ [FIREBASE] Base de données connectée.");
    } catch (e) { console.error("❌ [FIREBASE] Erreur Init:", e.message); }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();
if (serviceAccount) { try { db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true }); } catch(e){} }

const app = express();

// =========================================================
// [MODIFICATION] CONFIGURATION SERVEUR & CHAT
// =========================================================
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

const GEMINI_MODEL = "gemini-2.5-flash"; 

let aiClient = null;
if (GEMINI_API_KEY) {
    try {
        aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        console.log("✅ [IA] Moteur Gemini 2.5 prêt.");
    } catch (e) { console.error("❌ [IA] Erreur Init:", e.message); }
}

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// LOGIQUE CHAT BACKEND
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

// =========================================================
// 2. CACHE & HELPERS
// =========================================================
const CACHE = {
    twitchTokens: {}, twitchUser: null, boostedStream: null, lastScanData: null, 
    globalStreamRotation: { streams: [], currentIndex: 0, lastFetchTime: 0, fetchCooldown: 3 * 60 * 1000 },
};

async function getTwitchToken(tokenType = 'app') {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) return CACHE.twitchTokens[tokenType].access_token;
    try {
        const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const data = await res.json();
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 300000 };
            return data.access_token;
        }
    } catch (e) { return null; }
    return null;
}

async function twitchAPI(endpoint, token = null) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("No Token.");
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` } });
    if (res.status === 401) { if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; throw new Error(`Token expiré.`); }
    return res.json();
}

async function runGeminiAnalysis(prompt) {
    if (!aiClient) return { success: false, html_response: "<p>❌ IA non initialisée.</p>" };
    try {
        const response = await aiClient.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: "Tu es un expert Data Twitch. Réponds UNIQUEMENT en HTML simple." }
        });
        const text = response.text ? response.text.trim() : "Réponse vide.";
        return { success: true, html_response: text };
    } catch (e) {
        return { success: false, html_response: `<p style="color:red">Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// 3. ROUTES AUTH (AVEC RECUP AVATAR)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    // On garde ton code, on ajoute juste la récupération de l'image
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
            const userRes = await twitchAPI('users', tokenData.access_token);
            const user = userRes.data[0];
            CACHE.twitchUser = { 
                display_name: user.display_name, 
                id: user.id, 
                profile_image_url: user.profile_image_url, // ON GARDE L'AVATAR
                access_token: tokenData.access_token, 
                expiry: Date.now() + (tokenData.expires_in * 1000) 
            };
            res.send("<script>window.opener.postMessage('auth_success', '*');window.close();</script>");
        } else { res.send("Erreur Token."); }
    } catch (e) { res.send("Erreur Serveur."); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

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

// (SUIVI) FIX MINIATURES
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchAPI(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        return res.json({ 
            success: true, 
            streams: data.data.map(s => ({ 
                user_name: s.user_name, 
                user_login: s.user_login, 
                viewer_count: s.viewer_count, 
                game_name: s.game_name,
                thumbnail_url: s.thumbnail_url.replace('{width}', '320').replace('{height}', '180') // FIX
            })) 
        });
    } catch (e) { return res.status(500).json({ success: false }); }
});

// (VOD) FIX MINIATURES
app.get('/get_latest_vod', async (req, res) => {
    try {
        const u = await twitchAPI(`users?login=${req.query.channel}`);
        if(!u.data.length) return res.json({success:false});
        const v = await twitchAPI(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
        if(!v.data.length) return res.json({success:false});
        
        const thumb = v.data[0].thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'); // FIX
        res.json({success:true, vod: { title: v.data[0].title, thumbnail_url: thumb, id: v.data[0].id }});
    } catch(e) { res.json({success:false}); }
});

// =========================================================
// 4. ROTATION & BOOST
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    try {
        const data = await twitchAPI(`streams?language=fr&first=100`);
        let suitable = data.data.filter(s => s.viewer_count <= 100);
        if (suitable.length === 0) suitable = data.data.slice(-10);
        if (suitable.length > 0) {
            rot.streams = suitable.sort(() => 0.5 - Math.random()).map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0; rot.lastFetchTime = now;
        }
    } catch (e) {}
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let boost = null;
    try {
        const q = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!q.empty) { boost = q.docs[0].data(); CACHE.boostedStream = boost; }
    } catch(e) { if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) boost = CACHE.boostedStream; }
    
    if (boost) return res.json({ success: true, channel: boost.channel, mode: 'BOOST', message: `⚡ BOOST ACTIF` });
    await refreshGlobalStreamList(); 
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK' });
    return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel, mode: 'AUTO', viewers: rot.streams[rot.currentIndex].viewers, message: `👁️ AUTO 3MIN` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.json({ success: false });
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: false });
    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    return res.json({ success: true, channel: rot.streams[rot.currentIndex].channel });
});

// =========================================================
// 5. STATS
// =========================================================

app.get('/api/stats/global', async (req, res) => {
    try {
        const data = await twitchAPI('streams?first=100');
        let v = 0; data.data.forEach(s => v += s.viewer_count);
        const est = Math.floor(v * 3.8);
        const topGame = data.data[0]?.game_name || "N/A";

        const history = { live: { labels:[], values:[] } };
        try {
            const snaps = await db.collection('stats_history').orderBy('timestamp', 'desc').limit(12).get();
            if (!snaps.empty) {
                snaps.docs.reverse().forEach(d => {
                    const stats = d.data();
                    if(stats.timestamp) {
                        const date = stats.timestamp.toDate();
                        const timeStr = `${date.getHours()}h${date.getMinutes() < 10 ? '0'+date.getMinutes() : date.getMinutes()}`;
                        history.live.labels.push(timeStr);
                        history.live.values.push(stats.total_viewers);
                    }
                });
            } else {
                history.live.labels = ["-1h", "Now"]; history.live.values = [est * 0.9, est];
            }
        } catch(e) {}

        res.json({ success: true, total_viewers: est, total_channels: "98k+", top_game_name: topGame, history: history });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/top_games', async (req, res) => {
    try {
        const d = await twitchAPI('games/top?first=10');
        res.json({ games: d.data.map(g => ({ name: g.name, box_art_url: g.box_art_url.replace('{width}','52').replace('{height}','72') })) });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/stats/languages', async (req, res) => {
    try {
        const d = await twitchAPI('streams?first=100');
        const l = {}; d.data.forEach(s => l[s.language] = (l[s.language]||0)+1);
        const sorted = Object.keys(l).map(k=>({name:k.toUpperCase(), percent:l[k]})).sort((a,b)=>b.percent-a.percent).slice(0,5);
        res.json({ languages: sorted });
    } catch(e) { res.status(500).json({error:e.message}); }
});

// =========================================================
// 6. OUTILS (SCAN, RAID, PLANNING)
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
        if(uRes.data.length) {
            const u = uRes.data[0];
            let channelInfo = {};
            try {
                const cRes = await twitchAPI(`channels?broadcaster_id=${u.id}`);
                if (cRes.data && cRes.data.length > 0) channelInfo = cRes.data[0];
            } catch(e) {}

            let streamInfo = null;
            try {
                const sRes = await twitchAPI(`streams?user_id=${u.id}`);
                if(sRes.data.length > 0) streamInfo = sRes.data[0];
            } catch(e) {}

            const isLive = !!streamInfo;
            const uData = { 
                login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url, 
                game_name: channelInfo.game_name || "Aucun jeu défini",
                title: channelInfo.title || "Aucun titre",
                is_live: isLive, viewer_count: isLive ? streamInfo.viewer_count : 0, 
                total_views: u.view_count,
                ai_calculated_niche_score: isLive && streamInfo.viewer_count < 100 ? "4.8/5" : "3.0/5"
            };
            
            CACHE.lastScanData = { type: 'user', ...uData };
            return res.json({ success: true, type:'user', user_data: uData });
        }
        
        // Fallback Game
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if(gRes.data.length) {
            const g = gRes.data[0];
            const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
            const total = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            const gData = { name: g.name, box_art_url: g.box_art_url.replace('{width}','60').replace('{height}','80'), total_viewers: total, total_streamers: sRes.data.length, ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0 };
            CACHE.lastScanData = { type: 'game', ...gData };
            return res.json({ success: true, type:'game', game_data: gData });
        }
        res.json({ success: false });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    const prompt = type === 'niche' ? `Audit "${query}" Twitch. Format HTML court.` : `Idées clips "${query}". Format HTML court.`;
    res.json(await runGeminiAnalysis(prompt));
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    try {
        await db.collection('boosts').add({ channel, startTime: now, endTime: now + 900000 });
        CACHE.boostedStream = { channel, endTime: now + 900000 };
        res.json({ success: true, html_response: "<p>Boost activé !</p>" });
    } catch(e) { res.status(500).json({error:"Erreur DB"}); }
});

// ✅ CORRECTION RAID (CIBLE UNIQUE)
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        
        const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        
        // Trouver la meilleure cible (le plus de viewers sous la limite)
        const target = sRes.data
            .filter(s => s.viewer_count <= parseInt(max_viewers))
            .sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if(target) {
            const thumb = target.thumbnail_url.replace('{width}','320').replace('{height}','180');
            return res.json({ 
                success: true, 
                target: { 
                    name: target.user_name, login: target.user_login, 
                    viewers: target.viewer_count, thumbnail_url: thumb, 
                    game: target.game_name 
                } 
            });
        }
        res.json({ success: false, error: "Aucune cible." });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        const gameName = gRes.data[0].name;
        const prompt = `Analyse le jeu Twitch "${gameName}". Estime la saturation. Donne 3 créneaux horaires précis. Format HTML.`;
        const r = await runGeminiAnalysis(prompt);
        res.json({ success: true, game_name: gameName, box_art: gRes.data[0].box_art_url.replace('{width}','60').replace('{height}','80'), html_response: r.html_response });
    } catch(e) { res.json({success:false}); }
});

app.get('/export_csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData?.type},${CACHE.lastScanData?.login}`);
});

app.get('/check_boost_status', async (req, res) => {
    const now = Date.now();
    try {
        const boostQuery = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!boostQuery.empty) return res.json({ is_boosted: true, channel: boostQuery.docs[0].data().channel, remaining_seconds: Math.ceil((boostQuery.docs[0].data().endTime - now) / 1000) });
    } catch(e) {}
    return res.json({ is_boosted: false });
});

// ROUTE PAR DEFAUT
app.get('/', (req,res) => {
    const indexPath = path.join(__dirname, 'index.html');
    const nichePath = path.join(__dirname, 'NicheOptimizer.html');
    res.sendFile(indexPath, (err) => { if(err) res.sendFile(nichePath); });
});

async function recordStats() {
    try {
        const data = await twitchAPI('streams?first=100');
        let v = 0; data.data.forEach(s => v += s.viewer_count);
        await db.collection('stats_history').add({ timestamp: admin.firestore.FieldValue.serverTimestamp(), total_viewers: Math.floor(v*3.8), top_game: data.data[0].game_name });
    } catch(e) {}
}
setInterval(recordStats, 30 * 60 * 1000); 
setTimeout(recordStats, 10000);

// DÉMARRAGE DU SERVEUR AVEC SOCKET.IO
server.listen(PORT, () => console.log(`🚀 SERVER V50 (CHAT ENABLED) ON PORT ${PORT}`));
