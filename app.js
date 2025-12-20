/**
 * STREAMER & NICHE AI HUB - BACKEND (V20 - ULTIMATE FIX COMPLETE)
 * ===============================================================
 * Serveur Node.js/Express gérant :
 * 1. L'authentification Twitch (OAuth) avec fermeture propre des popups.
 * 2. L'API Twitch (Helix) pour les scans, raids et statuts.
 * 3. L'IA Google Gemini pour les analyses (Niche, Repurposing, Planning).
 * 4. La rotation automatique des streams (0-100 vues).
 * 5. Le système de Boost et de Raid optimisé.
 * 6. PERSISTANCE : Connexion Firebase Blindée pour Render.
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

// --- AJOUT FIREBASE (COMPATIBLE RENDER & LOCAL) ---
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE (LE CORRECTIF V20)
// =========================================================
let serviceAccount;

// Cas 1 : Environnement de Production (Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et réparée automatiquement (Source: Env Var).");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("🔍 Vérifiez votre variable FIREBASE_SERVICE_KEY dans Render.");
    }
} 
// Cas 2 : Local
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. La DB ne marchera pas.");
    }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Init Admin :", e.message);
    }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
        console.log("✅ [FIRESTORE] ID projet forcé.");
    } catch(e) { console.error("⚠️ settings Firestore :", e.message); }
}

const app = express();

// =========================================================
// 1. CONFIGURATION & ENV
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("#############################################");
    console.error("ERREUR : VARIABLES ENV MANQUANTES");
    console.error("#############################################");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. CACHE
// =========================================================
const CACHE = {
    twitchTokens: {},
    twitchUser: null,
    boostedStream: null,    
    lastScanData: null,
    globalStreamRotation: {
        streams: [],
        currentIndex: 0,
        lastFetchTime: 0,
        fetchCooldown: 15 * 60 * 1000
    }
};

// =========================================================
// 3. HELPERS TWITCH
// =========================================================
async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();
        
    CACHE.twitchTokens[tokenType] = {
        access_token: data.access_token,
        expiry: Date.now() + (data.expires_in * 1000) - 300000 
    };
    return data.access_token;
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });
    if (res.status === 401) throw new Error(`401 Token expiré`);
    if (!res.ok) throw new Error(`Twitch API ${res.status}`);
    return res.json();
}

// =========================================================
// 4. ROUTES AUTH TWITCH
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("State mismatch.");
    if (error) return res.status(400).send(error_description);

    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
        })
    });
        
    const tokenData = await tokenRes.json();
    const userRes = await twitchApiFetch('users', tokenData.access_token);
    const user = userRes.data[0];
            
    CACHE.twitchUser = {
        display_name: user.display_name,
        username: user.login,
        id: user.id,
        access_token: tokenData.access_token,
        expiry: Date.now() + (tokenData.expires_in * 1000)
    };
            
    res.send(`
        <html><body style="background:#111;color:#fff;text-align:center;padding-top:50px;">
        <h2>Connexion Réussie !</h2><script>window.opener?.postMessage('auth_success','*');window.close();</script>
        </body></html>
    `);
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// =========================================================
// 5. API FOLLOWED + VOD + SCAN + TRACKING
// =========================================================

app.get('/followed_streams', async (req, res) => {
    const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
    res.json({ success: true, streams: data.data });
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    const userRes = await twitchApiFetch(`users?login=${channel}`);
    const userId = userRes.data[0].id;
    const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
    const vod = vodRes.data[0];
    res.json({ success: true, vod: { id: vod.id, title: vod.title, thumbnail: vod.thumbnail_url }});
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
    if (userRes.data.length > 0) {
        const user = userRes.data[0];
        let streamDetails = null;
        try { streamDetails = (await twitchApiFetch(`streams?user_id=${user.id}`)).data[0]; } catch {}

        let followerCount = 'N/A';
        try {
            const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`);
            followerCount = fRes.total;
        } catch {}

        // 🔥 SAVE FIREBASE MINI STATS
        try {
            await db.collection("channels").doc(user.login).set({
                lastScan: Date.now(),
                last_viewers: streamDetails ? streamDetails.viewer_count : 0,
                total_followers: followerCount,
                last_game: streamDetails ? streamDetails.game_name : null
            }, { merge: true });
        } catch(e) { console.error("[History Save]", e.message); }

        try {
            const day = new Date().toISOString().substring(0, 10);
            await db.collection("channels").doc(user.login)
            .collection("history").doc(day)
            .set({
                date: day,
                viewers: streamDetails ? streamDetails.viewer_count : 0,
                followers: followerCount
            }, { merge: true });
        } catch(e) { console.error("[Daily]", e.message); }

        return res.json({ 
            success: true, 
            type: 'user', 
            user_data: {
                login: user.login,
                id: user.id,
                followers: followerCount,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0
            }
        });
    }

    res.status(404).json({ success: false });
});
// =========================================================
// 6. ROTATION AUTOMATIQUE
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) {
        return;
    }
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const allStreams = data.data;

        let suitable = allStreams.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
        if (suitable.length === 0) {
            suitable = allStreams.sort((a,b)=>a.viewer_count-b.viewer_count).slice(0,10);
        }

        rotation.streams = suitable.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        rotation.currentIndex = 0;
        rotation.lastFetchTime = now;
    } catch (e) {
        console.error("[Rotation Error]", e.message);
    }
}

// STREAM PAR DÉFAUT + SUIVI FIREBASE AUTO
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get();
            
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            currentBoost = { channel: data.channel, endTime: data.endTime };
            CACHE.boostedStream = currentBoost; 
        } else {
            CACHE.boostedStream = null;
        }
    } catch (e) {
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
            currentBoost = CACHE.boostedStream;
        }
    }

    if (currentBoost && currentBoost.endTime > now) {
        return res.json({
            success: true,
            channel: currentBoost.channel,
            viewers: 'BOOST'
        });
    }

    await refreshGlobalStreamList();
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch' });
    }

    const stream = rotation.streams[rotation.currentIndex];

    // 🔥 TRACKING MINIMAL FIREBASE AUTO
    try {
        await db.collection("channels").doc(stream.channel).set({
            lastAutoDiscovery: Date.now(),
            last_auto_viewers: stream.viewers
        }, { merge: true });
    } catch(e){}

    return res.json({ 
        success: true, 
        channel: stream.channel, 
        viewers: stream.viewers 
    });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.status(403).json({ error: "Boost actif" });
    }

    await refreshGlobalStreamList();
    const r = CACHE.globalStreamRotation;
    if (direction === 'next') r.currentIndex = (r.currentIndex+1) % r.streams.length;
    else r.currentIndex = (r.currentIndex-1+r.streams.length)%r.streams.length;
    const newStream = r.streams[r.currentIndex];
    res.json({ success:true, channel:newStream.channel, viewers:newStream.viewers });
});

// =========================================================
// 7. BOOST, RAID, IA, CSV
// =========================================================

// Vérification Boost
app.get('/check_boost_status', async (req,res)=>{
    const now = Date.now();
    const q = await db.collection('boosts')
        .where('endTime','>',now)
        .limit(1)
        .get();
    if (!q.empty) {
        const d = q.docs[0].data();
        const remain = Math.ceil((d.endTime-now)/1000);
        return res.json({ is_boosted:true, channel:d.channel, remaining_seconds:remain });
    }
    res.json({ is_boosted:false });
});

// BOOST
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    const COOLDOWN = 3 * 60 * 60 * 1000;
    const DURATION = 15 * 60 * 1000;

    const active = await db.collection('boosts')
        .where('endTime', '>', now)
        .limit(1)
        .get();
    if (!active.empty) {
        return res.status(429).json({ error:"Slot occupé" });
    }

    const hist = await db.collection('boosts')
        .where('channel','==',channel)
        .orderBy('endTime','desc').limit(1).get();

    if (!hist.empty) {
        const last = hist.docs[0].data();
        if ((now - last.endTime) < COOLDOWN) {
            return res.status(429).json({ error:"Cooldown" });
        }
    }

    await db.collection('boosts').add({
        channel,
        startTime: now,
        endTime: now+DURATION,
        created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    CACHE.boostedStream = { channel, endTime: now+DURATION };

    res.json({ success:true });
});

// RAID
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (gameRes.data.length === 0) return res.status(404).json({ error:"Jeu introuvable" });

    const gameId = gameRes.data[0].id;
    const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100&language=fr`);
    const list = streamsRes.data;
    const targetList = list.filter(s=> s.viewer_count <= max_viewers);

    let target = targetList.sort((a,b)=>b.viewer_count-a.viewer_count)[0];
    if (!target) target = list.sort((a,b)=>a.viewer_count-b.viewer_count)[0];

    if (!target) return res.json({ error:"Aucun résultat" });

    res.json({
        success: true,
        target: {
            login: target.user_login,
            viewers: target.viewer_count,
            game: target.game_name
        }
    });
});

// IA Niche / Repurpose
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    const prompt = type === 'niche'
        ? `Expert Twitch. Score niche ${niche_score}. Analyse "${query}".`
        : `Expert Vidéo. Analyse VOD "${query}".`;

    const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role:"user", parts:[{ text: prompt }]}],
    });

    res.json({ success:true, html_response: response.text });
});

// BEST TIME
app.post('/analyze_schedule', async (req,res)=>{
    const { game } = req.body;
    const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
    if (gameRes.data.length === 0) return res.json({ error:"Jeu introuvable" });

    const gameData = gameRes.data[0];
    const streamsRes = await twitchApiFetch(`streams?game_id=${gameData.id}&first=100`);
    const totalViewers = streamsRes.data.reduce((a,s)=>a+s.viewer_count,0);
    const streamerCount = streamsRes.data.length;
    
    res.json({
        success:true,
        box_art: gameData.box_art_url,
        html_response: `<p>${game} — ${streamerCount} streamers / ${totalViewers} viewers.</p>`
    });
});

// CSV
app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Aucune donnée.");
    let csv = "Metrique,Valeur\n";
    Object.keys(data).forEach(k=>{
        csv+=`${k},${data[k]}\n`;
    });
    res.setHeader('Content-Type','text/csv');
    res.send(csv);
});

// =========================================================
// 8. TRACKER FIREBASE
// =========================================================

app.get('/stats/:channel', async (req,res)=>{
    const { channel } = req.params;
    const ref = db.collection("channels").doc(channel);
    const snap = await ref.get();
    if (!snap.exists) return res.json({ success:false });
    res.json({ success:true, stats: snap.data() });
});

app.get('/stats_history/:channel', async (req,res)=>{
    const { channel } = req.params;
    const since = new Date();
    since.setDate(since.getDate()-7);

    const ref = db.collection("channels").doc(channel).collection("history");
    const snap = await ref.get();
    const days = [];
    snap.forEach(d=>{
        const v = d.data();
        if (new Date(v.date)>=since) days.push(v);
    });
    res.json({ success:true, history: days });
});

// =========================================================
// 9. START SERVER
// =========================================================

app.listen(PORT, () => {
    console.log("===========================================");
    console.log(` STREAMER HUB V20 + TRACKER ON PORT ${PORT}`);
    console.log("===========================================");
});
