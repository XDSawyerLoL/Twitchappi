/**
 * STREAMER & NICHE AI HUB - BACKEND (V20.3 - ULTIMATE FULL VERSION)
 * ===============================================================
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// CORRECTIF CRITIQUE IA : SDK OFFICIEL @google/generative-ai
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- INITIALISATION FIREBASE (COMPATIBLE RENDER & LOCAL) ---
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE (LE CORRECTIF V20)
// =========================================================
let serviceAccount;

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
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. La DB ne marchera pas.");
    }
}

if (serviceAccount) {
    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id 
            });
        }
        console.log(`✅ [FIREBASE] Connecté au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation Admin :", e.message);
    }
}

const db = admin.firestore();
const app = express();

// =========================================================
// 1. CONFIGURATION ET VARIABLES D'ENVIRONNEMENT
// =========================================================
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; 

// INITIALISATION IA (Syntaxe Full Puissance)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. SYSTÈME DE CACHE HYBRIDE (RAM + DB)
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
// 3. FONCTIONS UTILITAIRES (HELPERS)
// =========================================================

async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = {
                access_token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        }
        return null;
    } catch (error) { return null; }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Accès Twitch impossible.");
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur Auth Twitch (401).`);
    }
    return res.json();
}

/**
 * LOGIQUE IA GEMINI FLASH (CORRIGÉE)
 */
async function runGeminiAnalysis(prompt) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert stratégie Twitch. Réponds uniquement en HTML (p, ul, li, h4, strong). Sois chirurgical."
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return { success: true, html_response: text.trim() };
    } catch (e) {
        console.error("Erreur Gemini:", e);
        return { success: false, error: e.message, html_response: `<p style="color:red;">❌ Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// 4. ROUTES D'AUTHENTIFICATION ( OAuth )
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
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité.");
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET,
                code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI
            })
        });
        const tokenData = await tokenRes.json();
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            CACHE.twitchUser = { ...user, access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
            res.send(`<html><body style="background:#111;color:#fff;text-align:center;padding-top:50px;"><h2>Connexion Réussie !</h2><script>window.opener.postMessage('auth_success', '*');window.close();</script></body></html>`);
        }
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, login, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username: login, id });
    }
    res.json({ is_connected: false });
});

// =========================================================
// 5. API DATA & SCAN (MOTEUR TRACKER ACTIF)
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        res.json({ success: true, streams: data.data });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        const userId = userRes.data[0].id;
        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if (!vodRes.data[0]) return res.json({ success: false });
        const vod = vodRes.data[0];
        res.json({ success: true, vod: { id: vod.id, title: vod.title, thumbnail_url: vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84') } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// SCAN GLOBAL AVEC PUISSANCE TRACKER
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0];
            const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`);
            
            // --- LOGIQUE TRACKER SNAPSHOT (Firebase) ---
            const historyRef = db.collection('streamer_history').doc(user.login).collection('snapshots');
            const lastSnap = await historyRef.orderBy('timestamp', 'desc').limit(1).get();
            
            let growthInfo = "Radar initialisé.";
            if(!lastSnap.empty){
                const diff = fRes.total - lastSnap.docs[0].data().followers;
                growthInfo = `Tracker : ${diff >= 0 ? '+' : ''}${diff} followers depuis le dernier scan.`;
            }
            await historyRef.add({ followers: fRes.total, timestamp: admin.firestore.FieldValue.serverTimestamp() });

            let streamDetails = null;
            try {
                const sRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (sRes.data.length > 0) streamDetails = sRes.data[0];
            } catch (e) {}

            const data = {
                login: user.login, display_name: user.display_name, profile_image_url: user.profile_image_url,
                is_live: !!streamDetails, viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                total_followers: fRes.total, total_views: user.view_count || 0,
                growth_info: growthInfo, ai_calculated_niche_score: (user.broadcaster_type === 'partner') ? '9.0/10' : '6.0/10'
            };

            CACHE.lastScanData = { type: 'user', ...data };
            return res.json({ success: true, type: 'user', user_data: data });
        }
        
        // Recherche JEU
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const gameData = { name: game.name, id: game.id, box_art_url: game.box_art_url, total_viewers: streamsRes.data.reduce((a,b) => a+b.viewer_count, 0), total_streamers: streamsRes.data.length, ai_calculated_niche_score: '7.5/10' };
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        res.status(404).json({ success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// 6. BOOST, ROTATION & RAID (STRUCTURE V20)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    if (now - CACHE.globalStreamRotation.lastFetchTime < CACHE.globalStreamRotation.fetchCooldown && CACHE.globalStreamRotation.streams.length > 0) return;
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        CACHE.globalStreamRotation.streams = data.data.filter(s => s.viewer_count <= 100).map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        CACHE.globalStreamRotation.lastFetchTime = now;
    } catch (e) {}
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    try {
        const boostQuery = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!boostQuery.empty) {
            const b = boostQuery.docs[0].data();
            return res.json({ success: true, channel: b.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF : ${b.channel}` });
        }
    } catch(e) {}
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    const s = rot.streams[rot.currentIndex] || { channel: 'twitch', viewers: 0 };
    res.json({ success: true, channel: s.channel, viewers: s.viewers });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    try {
        const active = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!active.empty) return res.status(429).json({ error: "Slot occupé" });
        await db.collection('boosts').add({ channel, endTime: now + 900000, timestamp: admin.firestore.FieldValue.serverTimestamp() });
        res.json({ success: true, html_response: `<p style="color:#ff0099">🚀 Propulseur activé pour ${channel} !</p>` });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&language=fr`);
        const target = streamsRes.data.filter(s => s.viewer_count <= parseInt(max_viewers))[0];
        if (target) res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, game: target.game_name, thumbnail_url: target.thumbnail_url.replace('{width}','100').replace('{height}','56') } });
        else res.json({ success: false, error: "Aucune cible." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// IA GENERIC
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = `Analyse stratégique : ${query}. Type: ${type}. Score: ${niche_score}.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

// CSV EXPORT
app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if (!d) return res.status(404).send("Pas de données.");
    res.setHeader('Content-Type', 'text/csv');
    res.send(`Metrique,Valeur\nNom,${d.display_name || d.name}\nFollowers,${d.total_followers || 0}\nScore,${d.ai_calculated_niche_score}`);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` STREAMER HUB V20.3 (ULITMATE FULL) PORT ${PORT}`);
    console.log(`===========================================`);
});
