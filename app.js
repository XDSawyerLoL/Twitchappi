/**
 * STREAMER & NICHE AI HUB - BACKEND (V48 - ULTIMATE STABLE EDITION)
 * =========================================================
 * Version corrigée pour fonctionner avec @google/generative-ai ^0.21.0
 * Modèle : gemini-1.5-flash
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// [CORRECTION IMPORT] Import officiel de la librairie 0.21.0
// ✅ IMPORT DE LA NOUVELLE LIBRAIRIE (Celle qui marche)
const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// On utilise le modèle 2.5 Flash qui est très stable
const GEMINI_MODEL = "gemini-2.5-flash"; 

// Initialisation simplifiée
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
// --- AJOUT FIREBASE ---
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE
// =========================================================
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée (Env).");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur Parsing JSON :", error.message);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé locale chargée.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée.");
    }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur init :", e.message);
    }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
    } catch(e) {}
}

const app = express();

// =========================================================
// 1. CONFIGURATION
// =========================================================
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// [IA CONFIGURATION - MODELE CORRIGÉ]
let geminiModel;
if (GEMINI_API_KEY) {
    try {
        console.log("⚙️ [IA] Initialisation de Gemini...");
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        
        // Utilisation de gemini-1.5-flash (Modèle actuel standard)
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        console.log("✅ [IA] Modèle Gemini 1.5 Flash chargé.");
    } catch (e) { 
        console.error("❌ [IA] CRASH Initialisation :", e.message); 
    }
} else {
    console.error("❌ [IA] ATTENTION : GEMINI_API_KEY est introuvable sur Render !");
}

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
        fetchCooldown: 3 * 60 * 1000 
    },
    statsCache: { global: null, topGames: null, languages: null, lastFetch: 0 }
};

// =========================================================
// 3. HELPERS
// =========================================================

async function getTwitchToken(tokenType = 'app') {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 300000 };
            return data.access_token;
        }
        return null;
    } catch (error) { return null; }
}

async function twitchAPI(endpoint, token = null) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("No Token.");
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` } });
    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        throw new Error(`Token expiré.`);
    }
    return res.json();
}

// [DEBUG IA] AFFICHE L'ERREUR EXACTE SUR LE SITE
async function runGeminiAnalysis(prompt) {
    try {
        console.log("⏳ [IA] Envoi requête Gemini 2.5...");
        
        // ✅ NOUVELLE SYNTAXE (Celle de ton code qui marche)
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Tu es un expert Twitch. Réponds UNIQUEMENT en HTML simple."
            }
        });
        
        // Dans la nouvelle lib, la réponse est souvent directement accessible via .text() ou .text
        // Ton code fonctionnel utilise response.text
        const text = response.text ? response.text.trim() : "";
        
        console.log("✅ [IA] Succès !");
        return { success: true, html_response: text };

    } catch (e) {
        console.error("❌ [IA CRASH]:", e);
        return { 
            success: false, 
            html_response: `<p style="color:red">Erreur IA: ${e.message}</p>` 
        };
    }
}
// =========================================================
// 4. AUTHENTIFICATION TWITCH
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.send("Erreur Auth.");
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
            const userRes = await twitchAPI('users', tokenData.access_token);
            const user = userRes.data[0];
            CACHE.twitchUser = { display_name: user.display_name, id: user.id, access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
            res.send("<script>window.opener.postMessage('auth_success', '*');window.close();</script>");
        } else { res.send("Erreur Token."); }
    } catch (e) { res.send("Erreur Serveur."); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    res.json({ is_connected: false });
});

// =========================================================
// 5. DATA STREAMS & VOD
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchAPI(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        return res.json({ success: true, streams: data.data.map(s => ({ user_name: s.user_name, user_login: s.user_login, viewer_count: s.viewer_count, thumbnail_url: s.thumbnail_url })) });
    } catch (e) { return res.status(500).json({ success: false }); }
});

app.get('/get_latest_vod', async (req, res) => {
    try {
        const u = await twitchAPI(`users?login=${req.query.channel}`);
        if(!u.data.length) return res.json({success:false});
        const v = await twitchAPI(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
        if(!v.data.length) return res.json({success:false});
        res.json({success:true, vod: { title: v.data[0].title, thumbnail_url: v.data[0].thumbnail_url.replace('%{width}','320').replace('%{height}','180'), id: v.data[0].id }});
    } catch(e) { res.json({success:false}); }
});

// =========================================================
// 6. ROTATION 3 MINUTES
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    
    console.log("🔄 [ROTATION] Mise à jour liste...");
    try {
        const data = await twitchAPI(`streams?language=fr&first=100`);
        let suitable = data.data.filter(s => s.viewer_count <= 100);
        if (suitable.length === 0) suitable = data.data.slice(-10);

        if (suitable.length > 0) {
            rot.streams = suitable.sort(() => 0.5 - Math.random()).map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
        }
    } catch (e) { console.error("❌ Erreur Rotation:", e.message); }
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let boost = null;

    try {
        const q = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!q.empty) { boost = q.docs[0].data(); CACHE.boostedStream = boost; }
    } catch(e) { 
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) boost = CACHE.boostedStream;
    }

    if (boost) return res.json({ success: true, channel: boost.channel, mode: 'BOOST', message: `⚡ BOOST ACTIF` });

    await refreshGlobalStreamList(); 
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', mode: 'FALLBACK' });

    const current = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: current.channel, mode: 'AUTO', viewers: current.viewers, message: `👁️ AUTO 3MIN` });
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
// 7. DASHBOARD ANALYTICS
// =========================================================

app.get('/api/stats/global', async (req, res) => {
    try {
        const data = await twitchAPI('streams?first=100');
        let v = 0; data.data.forEach(s => v += s.viewer_count);
        const est = Math.floor(v * 3.8);
        const history = { live: { labels:["-1h", "Now"], values:[est*0.9, est] } };
        
        try {
            const snaps = await db.collection('stats_history').orderBy('timestamp', 'desc').limit(10).get();
            if (!snaps.empty) {
                history.live.labels = []; history.live.values = [];
                snaps.docs.reverse().forEach(d => {
                    if(d.data().timestamp) {
                        history.live.labels.push('H');
                        history.live.values.push(d.data().total_viewers);
                    }
                });
            }
        } catch(e){}

        res.json({ success: true, total_viewers: est, total_channels: "98k+", top_game_name: data.data[0]?.game_name || "N/A", history });
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
// 8. SCANNER & TOOLS
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchAPI(`users?login=${encodeURIComponent(query)}`);
        if(uRes.data.length) {
            const u = uRes.data[0];
            const sRes = await twitchAPI(`streams?user_id=${u.id}`);
            const isLive = sRes.data.length > 0;
            const score = isLive && sRes.data[0].viewer_count < 100 ? 4.5 : 3.0;
            const uData = { login: u.login, display_name: u.display_name, profile_image_url: u.profile_image_url, is_live: isLive, viewer_count: isLive ? sRes.data[0].viewer_count : 0, ai_calculated_niche_score: score };
            CACHE.lastScanData = { type: 'user', ...uData };
            return res.json({ success: true, type:'user', user_data: uData });
        }
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if(gRes.data.length) {
            const g = gRes.data[0];
            const sRes = await twitchAPI(`streams?game_id=${g.id}&first=20`);
            const total = sRes.data.reduce((a,b)=>a+b.viewer_count,0);
            const gData = { name: g.name, box_art_url: g.box_art_url.replace('{width}','60').replace('{height}','80'), total_viewers: total, ai_calculated_niche_score: total < 5000 ? 4.0 : 2.0 };
            CACHE.lastScanData = { type: 'game', ...gData };
            return res.json({ success: true, type:'game', game_data: gData });
        }
        res.json({ success: false });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    const prompt = type === 'niche' ? `Audit "${query}" Twitch.` : `Idées clips "${query}".`;
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

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(!gRes.data.length) return res.json({success:false});
        const sRes = await twitchAPI(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        const target = sRes.data.filter(s => s.viewer_count <= parseInt(max_viewers)).sort((a,b)=>b.viewer_count-a.viewer_count)[0];
        if(target) return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: target.thumbnail_url.replace('%{width}','100').replace('%{height}','56'), game: target.game_name } });
        res.json({ success: false });
    } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchAPI(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        const r = await runGeminiAnalysis(`Horaires stream ${game}.`);
        res.json({ success: true, game_name: gRes.data[0].name, box_art: gRes.data[0].box_art_url.replace('{width}','60').replace('{height}','80'), html_response: r.html_response });
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

app.get('/', (req,res) => {
    const indexPath = path.join(__dirname, 'index.html');
    const nichePath = path.join(__dirname, 'NicheOptimizer.html');
    res.sendFile(indexPath, (err) => { if(err) res.sendFile(nichePath); });
});

// -------------------------------------------------------------------------
// 9. AUTOMATISATION (CRON)
// -------------------------------------------------------------------------
async function recordStats() {
    try {
        const data = await twitchAPI('streams?first=100');
        let v = 0; data.data.forEach(s => v += s.viewer_count);
        await db.collection('stats_history').add({ timestamp: admin.firestore.FieldValue.serverTimestamp(), total_viewers: Math.floor(v*3.8), top_game: data.data[0].game_name });
        console.log(`⏱️ [CRON] Stats OK.`);
    } catch(e) {}
}
setInterval(recordStats, 30 * 60 * 1000); 
setTimeout(recordStats, 10000);

app.listen(PORT, () => console.log(`🚀 SERVER V48 (STABLE EDITION) ON PORT ${PORT}`));

