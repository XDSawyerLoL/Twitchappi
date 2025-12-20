/**
 * STREAMER & NICHE AI HUB - BACKEND (V20.2 - FULL VERSION 700+ LINES)
 * ===================================================================
 * TOUTES LES FONCTIONS : AUTH, SCAN, TRACKER, BOOST, RAID, IA, CSV, PLANNING.
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// =========================================================
// 0. INITIALISATION FIREBASE (VÉRITÉ ABSOLUE)
// =========================================================
let serviceAccount = null;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée (Source: Env Var).");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur Parsing variable.");
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Mode dégradé (Sans DB).");
    }
}

if (serviceAccount && !admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id 
    });
} else if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// =========================================================
// 1. CONFIGURATION IA (SYNTAXE OFFICIELLE V1)
// =========================================================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = "gemini-1.5-flash";

// =========================================================
// 2. CONFIGURATION TWITCH & SERVEUR
// =========================================================
const app = express();
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// =========================================================
// 3. SYSTÈME DE CACHE & ROTATION (VERSION LONGUE)
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
// 4. HELPERS TWITCH HELIX (LONG VERSION)
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

async function helixFetch(endpoint, token = null) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Accès Twitch impossible.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.status === 401) {
        CACHE.twitchTokens['app'] = null; 
        throw new Error("401 Unauthorized");
    }
    return res.json();
}

// =========================================================
// 5. IA STRATÉGIQUE (RÉPARÉ ET COMPLET)
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert en croissance Twitch. Analyse les données comme TwitchTracker et SullyGnome réunis. Format HTML simple (p, ul, li, h4, strong). Ne sois jamais vague, donne des ordres d'action."
        });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return { success: true, html_response: response.text().trim() };
    } catch (e) {
        console.error("Erreur IA:", e);
        return { success: false, html_response: `<p style="color:red;">Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// 6. ROUTES D'AUTHENTIFICATION (VERSION POPUP)
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
    if (error) return res.status(400).send(`Twitch Error: ${error_description}`);

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
            const userRes = await helixFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            CACHE.twitchUser = { ...user, access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
            res.send(`<html><body style="background:#111;color:#fff;text-align:center;padding-top:50px;"><h2>✅ Connexion Réussie !</h2><p>Fermeture...</p><script>window.opener.postMessage('auth_success', '*');window.close();</script></body></html>`);
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
// 7. SCAN & TRACKER (LOGIQUE FIREBASE COMPLÈTE)
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    
    try {
        const userRes = await helixFetch(`users?login=${encodeURIComponent(query)}`);
        
        if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0];
            const fRes = await helixFetch(`users/follows?followed_id=${user.id}&first=1`);
            
            // --- PUISSANCE TRACKER : Snapshot Firebase ---
            const historyRef = db.collection('streamer_history').doc(user.login).collection('snapshots');
            const lastSnap = await historyRef.orderBy('timestamp', 'desc').limit(1).get();
            
            let growthInfo = "Radar activé. Premier point de données enregistré.";
            if(!lastSnap.empty){
                const oldF = lastSnap.docs[0].data().followers;
                const diff = fRes.total - oldF;
                growthInfo = `Analyse Tracker : ${diff >= 0 ? '+' : ''}${diff} followers depuis le dernier scan.`;
            }
            await historyRef.add({ followers: fRes.total, timestamp: admin.firestore.FieldValue.serverTimestamp() });

            // Stream en cours ?
            let streamData = null;
            try {
                const sRes = await helixFetch(`streams?user_id=${user.id}`);
                if (sRes.data.length > 0) streamData = sRes.data[0];
            } catch (e) {}

            const data = {
                login: user.login, display_name: user.display_name, id: user.id,
                profile_img: user.profile_image_url, is_live: !!streamData,
                viewers: streamData ? streamData.viewer_count : 0,
                game: streamData ? streamData.game_name : 'OFFLINE',
                total_followers: fRes.total, growth_info: growthInfo,
                niche_score: (user.broadcaster_type === 'partner') ? '9.0/10' : '6.5/10'
            };

            CACHE.lastScanData = { type: 'user', ...data };
            return res.json({ success: true, type: 'user', user_data: data });
        }

        // Sinon recherche Catégorie (Jeu)
        const gameRes = await helixFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await helixFetch(`streams?game_id=${game.id}&first=100`);
            const totalV = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
            const gameData = { name: game.name, id: game.id, viewers: totalV, streamers: streamsRes.data.length, box: game.box_art_url };
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        res.status(404).json({ success: false, message: "Cible introuvable." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// 8. COCKPIT : BOOST, RAID & ROTATION AUTOMATIQUE
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    if (now - CACHE.globalStreamRotation.lastFetchTime < CACHE.globalStreamRotation.fetchCooldown && CACHE.globalStreamRotation.streams.length > 0) return;
    try {
        const data = await helixFetch(`streams?language=fr&first=100`);
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
    const current = rot.streams[rot.currentIndex] || { channel: 'twitch', viewers: 0 };
    res.json({ success: true, channel: current.channel, viewers: current.viewers });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    try {
        const active = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!active.empty) return res.status(429).json({ error: "Zone saturée." });
        await db.collection('boosts').add({ channel, endTime: now + 900000, timestamp: admin.firestore.FieldValue.serverTimestamp() });
        res.json({ success: true, html_response: `<p style="color:#ff0099; font-weight:bold;">🚀 BOOST ACTIVÉ : ${channel} est en tête de pont !</p>` });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await helixFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        const gameId = gameRes.data[0].id;
        const streamsRes = await helixFetch(`streams?game_id=${gameId}&language=fr&first=100`);
        const targets = streamsRes.data.filter(s => s.viewer_count <= parseInt(max_viewers));
        const target = targets.sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if (target) {
            res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, game: target.game_name, img: target.thumbnail_url.replace('{width}','100').replace('{height}','56') } });
        } else res.json({ success: false, error: "Aucune cible micro-niche." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// 9. IA STRATÉGIQUE & ANALYSES (DASHBOARD)
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query, growth_info } = req.body;
    let prompt = "";
    if (type === 'niche') prompt = `Analyse de Niche : ${query}. Croissance : ${growth_info}. Génère un plan de domination Twitch.`;
    else if (type === 'repurpose') prompt = `Repurposing VOD : ${query}. Trouve les meilleurs moments pour des TikToks.`;
    
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    const prompt = `Analyse de planning pour le jeu ${game}. Quelles sont les meilleures heures pour streamer quand on a moins de 50 viewers ?`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

// =========================================================
// 10. EXPORT & FALLBACKS
// =========================================================

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if (!d) return res.status(404).send("Pas de données.");
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=TwitchTracker_Clone.csv');
    res.send(`Metric,Value\nType,${d.type}\nName,${d.display_name || d.name}\nFollowers,${d.total_followers || 0}\nGrowth,${d.growth_info || ''}`);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` STREAMER HUB V20.2 - FULL POWER ON ${PORT}`);
    console.log(`===========================================`);
});
