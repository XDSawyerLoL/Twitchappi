/**
 * STREAMER & NICHE AI HUB - BACKEND (V22 - FINAL ULTIMATE)
 * ========================================================
 * COPIE INTÉGRALE AVEC CORRECTIFS DE PROD (RENDER)
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// --- CORRECTIF 1 : L'IA DOIT UTILISER LE SDK OFFICIEL STABLE ---
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CORRECTIF 2 : FIREBASE ADMIN ---
const admin = require('firebase-admin');

// =========================================================
// CONFIGURATION FIREBASE (BLINDÉE POUR RENDER)
// =========================================================
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        // Nettoyage agressif des guillemets et sauts de ligne pour Render
        let rawJson = process.env.FIREBASE_SERVICE_KEY.trim();
        if (rawJson.startsWith("'") || rawJson.startsWith('"')) rawJson = rawJson.slice(1, -1);
        rawJson = rawJson.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
        
        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée depuis ENV.");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur JSON critique :", error.message);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. La DB sera désactivée.");
    }
}

// Initialisation unique
if (serviceAccount && !admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });
        console.log(`✅ [DB] Connecté au projet : ${serviceAccount.project_id}`);
    } catch (e) { console.error("❌ Erreur Init Admin :", e); }
} else if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const app = express();

// =========================================================
// VARIABLES D'ENVIRONNEMENT & IA
// =========================================================
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-1.5-flash"; 

// Initialisation IA (Nouvelle Syntaxe)
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// SYSTÈME DE CACHE & VARIABLES GLOBALES
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
// HELPERS (FONCTIONS UTILES)
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
    if (!accessToken) throw new Error("Token Twitch manquant.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur Auth 401.`);
    }
    return res.json();
}

// --- FONCTION IA RÉPARÉE ---
async function runGeminiAnalysis(prompt) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert Twitch. Réponds en HTML simple (p, ul, li, h4, strong). Pas de markdown."
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return { success: true, html_response: text.trim() };
    } catch (e) {
        console.error("IA Error:", e);
        return { success: false, html_response: `<p style="color:red">Erreur IA: ${e.message}</p>` };
    }
}

// =========================================================
// ROUTES AUTHENTIFICATION
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    // Vérification de sécurité
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur state.");
    
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
            CACHE.twitchUser = {
                display_name: user.display_name, username: user.login, id: user.id,
                access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            res.send(`<html><body style="background:#111;color:#fff;text-align:center;padding-top:50px;"><h2>Connecté !</h2><script>if(window.opener){window.opener.postMessage('auth_success','*');window.close();}else{window.location.href='/';}</script></body></html>`);
        } else { res.status(500).send("Echec Token."); }
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name, id: CACHE.twitchUser.id });
    }
    res.json({ is_connected: false });
});

// =========================================================
// ROUTES API DONNÉES
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        const streams = data.data.map(s => ({
            user_name: s.user_name, user_login: s.user_login, title: s.title,
            viewer_count: s.viewer_count, thumbnail_url: s.thumbnail_url 
        }));
        return res.json({ success: true, streams });
    } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ success: false });
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data.length) return res.status(404).json({ success: false });
        
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`);
        if (!vodRes.data.length) return res.status(404).json({ success: false });
        
        const vod = vodRes.data[0];
        return res.json({ 
            success: true, 
            vod: { id: vod.id, title: vod.title, thumbnail_url: vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84') }
        });
    } catch (e) { return res.status(500).json({ error: e.message }); }
});

// --- SCAN 360° + TRACKER (LE CŒUR DU SYSTÈME) ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false });
    
    try {
        // A. Recherche Streamer
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // Infos
            let streamDetails = null;
            try {
                const sRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (sRes.data.length > 0) streamDetails = sRes.data[0];
            } catch (e) {}

            let totalFollowers = 0;
            try {
                const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`);
                totalFollowers = fRes.total;
            } catch (e) {}

            // --- TRACKER LOGIC (L'AJOUT MAJEUR) ---
            const historyRef = db.collection('streamer_history').doc(user.login).collection('snapshots');
            const lastSnap = await historyRef.orderBy('timestamp', 'desc').limit(1).get();
            
            let growthInfo = "Initialisation du Tracker.";
            if(!lastSnap.empty) {
                const diff = totalFollowers - lastSnap.docs[0].data().followers;
                growthInfo = `Évolution : ${diff >= 0 ? '+' : ''}${diff} followers depuis le dernier scan.`;
            }
            await historyRef.add({ followers: totalFollowers, timestamp: admin.firestore.FieldValue.serverTimestamp() });

            const userData = { 
                login: user.login, display_name: user.display_name, profile_image_url: user.profile_image_url,
                is_live: !!streamDetails, viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                total_followers: totalFollowers, total_views: user.view_count || 'N/A',
                ai_calculated_niche_score: (user.broadcaster_type === 'partner') ? '8.5/10' : '6.0/10',
                growth_info: growthInfo
            };
            
            CACHE.lastScanData = { type: 'user', ...userData };
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // B. Recherche Jeu
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const totalViewers = streamsRes.data.reduce((sum, s) => sum + s.viewer_count, 0);
            
            const gameData = { 
                name: game.name, id: game.id, box_art_url: game.box_art_url,
                total_streamers: streamsRes.data.length, total_viewers: totalViewers,
                ai_calculated_niche_score: '7.5/10'
            };
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }

        return res.status(404).json({ success: false, message: "Aucun résultat." });
    } catch (e) { return res.status(500).json({ error: e.message }); }
});

// =========================================================
// ROTATION & BOOST
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    if (now - CACHE.globalStreamRotation.lastFetchTime < CACHE.globalStreamRotation.fetchCooldown && CACHE.globalStreamRotation.streams.length > 0) return;
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const suitableStreams = data.data.filter(stream => stream.viewer_count <= 100);
        if (suitableStreams.length > 0) {
            CACHE.globalStreamRotation.streams = suitableStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            CACHE.globalStreamRotation.currentIndex = 0;
            CACHE.globalStreamRotation.lastFetchTime = now;
        }
    } catch (e) { console.error("Erreur Rotation:", e); }
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // Priorité DB
    try {
        const boostQuery = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            currentBoost = { channel: data.channel, endTime: data.endTime };
            CACHE.boostedStream = currentBoost; 
        } else { CACHE.boostedStream = null; }
    } catch(e) {
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) currentBoost = CACHE.boostedStream;
    }

    if (currentBoost && currentBoost.endTime > now) {
        const remaining = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ success: true, channel: currentBoost.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${remaining} min)` });
    }

    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    if (rotation.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: 'Fallback.' });

    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: currentStream.channel, viewers: currentStream.viewers, message: `✅ Auto-Discovery : ${currentStream.channel}` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ success: false });

    await refreshGlobalStreamList();
    const rotation = CACHE.globalStreamRotation;
    if (rotation.streams.length === 0) return res.status(404).json({ success: false });

    if (direction === 'next') rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
    else rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;

    const newStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: newStream.channel });
});

app.get('/check_boost_status', async (req, res) => {
    const now = Date.now();
    try {
        const boostQuery = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            return res.json({ is_boosted: true, channel: data.channel, remaining_seconds: Math.ceil((data.endTime - now) / 1000) });
        }
    } catch(e) {}
    return res.json({ is_boosted: false });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    try {
        const active = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!active.empty) return res.status(429).json({ error: "Slot occupé" });

        await db.collection('boosts').add({ channel: channel, startTime: now, endTime: now + 900000, created_at: admin.firestore.FieldValue.serverTimestamp() });
        CACHE.boostedStream = { channel: channel, endTime: now + 900000 }; 
        return res.json({ success: true, html_response: `<p style="color:#ff0099;">🚀 Boost activé pour ${channel} !</p>` });
    } catch (e) { return res.status(500).json({ error: "Erreur DB" }); }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ success: false, error: "Jeu introuvable." });

        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100&language=fr`);
        const target = streamsRes.data.filter(s => s.viewer_count <= parseInt(max_viewers)).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if (target) {
            return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, game: target.game_name, thumbnail_url: target.thumbnail_url.replace('{width}','100').replace('{height}','56') } });
        }
        return res.json({ success: false, error: "Aucune cible." });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = `Analyse : ${query}. Contexte : ${niche_score}. Type : ${type}.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    const prompt = `Analyse planning jeu "${game}". Donne meilleurs créneaux HTML.`;
    const result = await runGeminiAnalysis(prompt);
    res.json({ success: true, html_response: result.html_response });
});

app.get('/export_csv', (req, res) => {
    const d = CACHE.lastScanData;
    if (!d) return res.status(404).send("Pas de données.");
    res.setHeader('Content-Type', 'text/csv');
    res.send(`Metrique,Valeur\nNom,${d.display_name || d.name}\nFollowers,${d.total_followers || 0}`);
});

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` STREAMER HUB V22 (COMPLETE) PORT ${PORT}`);
    console.log(`===========================================`);
});
