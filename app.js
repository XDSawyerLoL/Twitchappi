/**
 * STREAMER & NICHE AI HUB - BACKEND (V33 - ARCHITECT EDITION)
 * =============================================================
 * Serveur intégral gérant la data TwitchTracker, l'IA et Firebase.
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

// =========================================================
// 1. INITIALISATION FIREBASE
// =========================================================
let serviceAccount;
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
    } catch (e) { console.error("❌ Erreur Clé Firebase Env"); }
} else {
    try { serviceAccount = require('./serviceAccountKey.json'); } catch (e) {}
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
    } catch (e) { console.error("❌ Erreur Firebase Init"); }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();
if (serviceAccount) {
    try { db.settings({ projectId: serviceAccount.project_id, ignoreUndefinedProperties: true }); } catch(e) {}
}

const app = express();
const PORT = process.env.PORT || 10000;

// =========================================================
// 2. CONFIGURATION API
// =========================================================
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

const CACHE = {
    twitchTokens: {}, 
    smallStreamPool: [], 
    lastPoolUpdate: 0,
    twitchUser: null
};

// =========================================================
// 3. FONCTIONS CŒUR
// =========================================================

async function getTwitchToken() {
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) return CACHE.twitchTokens.app.token;
    try {
        const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const d = await r.json();
        CACHE.twitchTokens.app = { token: d.access_token, expiry: Date.now() + d.expires_in * 1000 };
        return d.access_token;
    } catch (e) { return null; }
}

async function apiCall(endpoint, token = null) {
    const t = token || await getTwitchToken();
    const r = await fetch(`https://api.twitch.tv/helix/${endpoint}`, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${t}` } });
    if(r.status === 401 && !token) CACHE.twitchTokens.app = null;
    return r.json();
}

async function runGemini(prompt, persona = "expert") {
    try {
        const model = ai.getGenerativeModel({ model: GEMINI_MODEL });
        const sys = persona === "coach" ? "Tu es un Coach Twitch. Réponds en listes HTML <ul>." : "Tu es un analyste Twitch. Sois direct.";
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: sys
        });
        return { success: true, html: result.response.text().trim() };
    } catch (e) { return { success: false, html: "<p>IA indisponible.</p>" }; }
}

// =========================================================
// 4. ROUTES MARKET & GLOBAL
// =========================================================

app.post('/global_pulse', async (req, res) => {
    const { type } = req.body; 
    try {
        const sRes = await apiCall('streams?first=100');
        const streams = sRes.data;
        const sampleV = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        
        const estViewers = Math.floor(sampleV * 1.6);
        const estChannels = Math.floor(streams.length * 60);

        const overview = {
            viewers: estViewers.toLocaleString(),
            channels: estChannels.toLocaleString(),
            active: Math.floor(estChannels * 0.85).toLocaleString(),
            watch_time: Math.floor(estViewers * 0.7).toLocaleString() + "h",
            stream_time: Math.floor(estChannels * 3).toLocaleString() + "h"
        };

        let table = [];
        if (type === 'languages') {
            const map = {};
            streams.forEach(s => {
                const l = s.language.toUpperCase();
                if(!map[l]) map[l] = {c:0, v:0};
                map[l].c++; map[l].v += s.viewer_count;
            });
            table = Object.entries(map).sort((a,b)=>b[1].v - a[1].v).map(([k,v], i) => ({
                rank: i+1, name: k, viewers: v.v, channels: v.c, rating: v.v > 50000 ? "A+" : "B"
            }));
        } else if (type === 'compare') {
            table = [
                { rank: 1, name: "TOP JEUX vs TOP LANGUES", rating: "COMPARE", viewers: estViewers, channels: estChannels }
            ];
        } else {
            const gRes = await apiCall('games/top?first=12');
            for(let i=0; i<gRes.data.length; i++) {
                const g = gRes.data[i];
                table.push({
                    rank: i+1, name: g.name, viewers: Math.floor(sampleV / (i+2)), channels: Math.floor(estChannels / (i+2)),
                    rating: i < 3 ? "A+" : "B",
                    img: g.box_art_url.replace('{width}','50').replace('{height}','70')
                });
            }
        }

        // Sauvegarde Firebase
        try { await db.collection('market_history').add({ timestamp: new Date(), type, viewers: estViewers }); } catch(e){}

        res.json({ success: true, overview, table });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// =========================================================
// 5. ANALYSE & COACHING
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await apiCall(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data && uRes.data.length > 0) {
            const u = uRes.data[0];
            const f = await apiCall(`channels/followers?broadcaster_id=${u.id}&first=1`);
            
            // Jours Stream
            const vRes = await apiCall(`videos?user_id=${u.id}&first=5&type=archive`);
            let days = "Analyse en cours...";
            if(vRes.data.length) {
                const map = {}; vRes.data.forEach(v => map[new Date(v.created_at).getDay()] = (map[new Date(v.created_at).getDay()]||0)+1);
                days = Object.keys(map).map(k=>['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][k]).join(', ');
            }

            // Historique
            const docRef = db.collection('history_stats').doc(String(u.id));
            const old = await docRef.get();
            let diff=0, trend="stable";
            if(old.exists) { diff = f.total - old.data().total_followers; trend = diff > 0 ? "up" : (diff < 0 ? "down" : "stable"); }
            await docRef.set({ total_followers: f.total, last_scan: new Date() }, {merge:true});

            res.json({ success: true, data: {...u, followers: f.total, days}, trend, diff });
        } else { res.json({success:false, error:"Inconnu"}); }
    } catch(e) { res.json({success:false, error:e.message}); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, context } = req.body;
    let p = `Analyse ${query}. Contexte: ${context}. Donne 3 points précis en HTML.`;
    const r = await runGemini(p, 'coach');
    res.json(r);
});

// =========================================================
// 6. RAID & PLANNING
// =========================================================

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({error: "Jeu non trouvé"});
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const target = sRes.data.filter(s => s.viewer_count <= parseInt(max_viewers)).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        if(target) {
            const u = await apiCall(`users?id=${target.user_id}`);
            res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, avatar: u.data[0].profile_image_url, thumb: target.thumbnail_url.replace('{width}','320').replace('{height}','180') } });
        } else res.json({error: "Aucune cible"});
    } catch(e) { res.json({error: e.message}); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await apiCall(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        const sRes = await apiCall(`streams?game_id=${gRes.data[0].id}&first=100`);
        const total = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
        const r = await runGemini(`Planning pour ${game}. ${sRes.data.length} streamers pour ${total} viewers. Meilleurs créneaux ?`);
        res.json({ success: true, name: gRes.data[0].name, ia: r.html });
    } catch(e) { res.json({success:false}); }
});

// =========================================================
// 7. LECTEUR & AUTH
// =========================================================

async function updatePool() {
    if (Date.now() - CACHE.lastPoolUpdate < 300000 && CACHE.smallStreamPool.length > 0) return;
    let found = []; let cursor = "";
    for (let i = 0; i < 5; i++) {
        let res = await apiCall(`streams?language=fr&first=100` + (cursor ? `&after=${cursor}` : ``));
        if(!res.data) break;
        const small = res.data.filter(s => s.viewer_count <= 100 && s.viewer_count > 0);
        found = found.concat(small);
        if(found.length >= 40) break;
        cursor = res.pagination.cursor; if(!cursor) break;
    }
    CACHE.smallStreamPool = found; CACHE.lastPoolUpdate = Date.now();
}

app.get('/get_default_stream', async (req, res) => {
    await updatePool();
    const pick = CACHE.smallStreamPool[Math.floor(Math.random() * CACHE.smallStreamPool.length)];
    res.json({ success: true, channel: pick ? pick.user_login : 'twitch', viewers: pick ? pick.viewer_count : 0 });
});

app.post('/cycle_stream', async (req, res) => {
    await updatePool();
    const pick = CACHE.smallStreamPool[Math.floor(Math.random() * CACHE.smallStreamPool.length)];
    res.json({ success: true, channel: pick.user_login });
});

app.get('/twitch_auth_start', (req, res) => res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows`));
app.get('/twitch_auth_callback', async (req, res) => {
    const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${req.query.code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`, {method:'POST'});
    const d = await r.json();
    if(d.access_token) { CACHE.twitchUser = d.access_token; res.send("<script>window.opener.postMessage('auth','*');window.close();</script>"); }
});
app.get('/twitch_user_status', (req,res) => res.json({is_connected:!!CACHE.twitchUser}));
app.get('/followed_streams', async (req, res) => {
    const u = await apiCall('users', CACHE.twitchUser);
    const f = await apiCall(`streams/followed?user_id=${u.data[0].id}`, CACHE.twitchUser);
    res.json({success:true, streams: f.data});
});

app.listen(PORT, () => console.log(`🚀 HUB V33 READY ON PORT ${PORT}`));
