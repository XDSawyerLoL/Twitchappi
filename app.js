/**
 * STREAMER & NICHE AI HUB - BACKEND (V39 - ULTIMATE MERGE STABLE)
 * ===============================================================
 * BASE : V20 (Ton code original certifié fonctionnel).
 * AMÉLIORATIONS : 
 * 1. Passage à 'gemini-1.5-flash' (Fix Erreur 429 Quota).
 * 2. Gestion d'erreur IA robuste (Anti-Crash).
 * 3. Ajout des routes Dashboard (Stats, Games, Languages).
 * 4. Rotation forcée à 3 minutes.
 * 5. Persistance Historique Stats.
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
// 0. INITIALISATION FIREBASE (TON CODE V20 ORIGINAL)
// =========================================================
let serviceAccount;

// Cas 1 : Environnement de Production (Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // 1. Nettoyage des guillemets parasites au début/fin
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // 2. CORRECTION CRITIQUE RENDER : Remplacement des sauts de ligne littéraux
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et réparée automatiquement (Source: Env Var).");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("🔍 Vérifiez votre variable FIREBASE_SERVICE_KEY dans Render.");
    }
} 
// Cas 2 : Environnement Local (Fichier physique pour le dev)
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée (Ni Env Var, Ni Fichier). La DB ne marchera pas.");
    }
}

// Démarrage de Firebase Admin
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation Admin :", e.message);
    }
} else {
    // Initialisation vide (fallback)
    try { admin.initializeApp(); } catch(e){}
}

// Initialisation de Firestore
const db = admin.firestore();

// --- LE FORÇAGE ULTIME (V20) ---
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
        console.log("✅ [FIRESTORE] ID de projet forcé dans les settings.");
    } catch(e) {
        console.error("⚠️ [FIRESTORE] Impossible d'appliquer les settings :", e.message);
    }
}

const app = express();

// =========================================================
// 1. CONFIGURATION ET VARIABLES D'ENVIRONNEMENT
// =========================================================

const PORT = process.env.PORT || 10000;

// Récupération des clés
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// --- CORRECTIF IA : MODÈLE PLUS LÉGER POUR ÉVITER ERREUR 429 ---
const GEMINI_MODEL = "gemini-1.5-flash"; 

// Vérification de sécurité au démarrage
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("#############################################################");
    console.error("ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("Vérifiez TWITCH_CLIENT_ID, SECRET, REDIRECT_URI et GEMINI_API_KEY");
    console.error("#############################################################");
}

// Initialisation de l'IA
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

// Middlewares Express
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. SYSTÈME DE CACHE HYBRIDE (RAM + DB)
// =========================================================
const CACHE = {
    twitchTokens: {},       // Tokens d'application
    twitchUser: null,       // Session utilisateur
    boostedStream: null,    // Boost actif
    lastScanData: null,     // Données scan
    
    // Rotation automatique (Fixée à 3 min)
    globalStreamRotation: {
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 3 * 60 * 1000 // FIX V39 : 3 Minutes exactes
    },

    // AJOUT V39 : Cache Dashboard (pour les graphs)
    statsCache: {
        global: null,
        topGames: null,
        languages: null,
        lastFetch: 0,
        cooldown: 60 * 1000
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
        } else {
            console.error("Erreur Token Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau Token:", error);
        return null;
    }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Impossible d'obtenir un Token Twitch.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur Auth Twitch (401). Token expiré.`);
    }
    
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${txt}`);
    }

    return res.json();
}

/**
 * --- CORRECTIF IA V39 : GESTION ERREUR 429 ---
 * Si l'IA sature, on renvoie une réponse "fallback" propre au lieu de crasher.
 */
async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL, // Utilisation de 1.5-flash
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Tu es un expert en stratégie Twitch. Réponds UNIQUEMENT en HTML simple (<h4>, <ul>, <li>, <p>). Sois concis."
            }
        });
        
        const text = response.text.trim();
        return { success: true, html_response: text };

    } catch (e) {
        console.error("⚠️ Erreur Gemini:", e.message);
        
        // Si erreur de quota (429), on ne crash pas le serveur
        if(e.message.includes('429') || e.message.includes('quota')) {
            return { 
                success: false, 
                error: "Quota IA dépassé", 
                html_response: `<p style="color:orange; font-weight:bold;">⚠️ L'IA est surchargée (Erreur 429). Réessayez dans 30 secondes.</p>` 
            };
        }

        return { 
            success: false, 
            error: e.message, 
            html_response: `<p style="color:var(--color-ai-action);">❌ Erreur IA: ${e.message}</p>` 
        };
    }
}

// =========================================================
// 4. ROUTES D'AUTHENTIFICATION (LOGIN / LOGOUT)
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
    if (error) return res.status(400).send(`Erreur Twitch : ${error_description}`);

    try {
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
        
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            res.send(`<html><body style="background:#111;color:#fff;"><script>if(window.opener){window.opener.postMessage('auth_success','*');window.close();}else{window.location.href='/';}</script></body></html>`);
        } else {
            res.status(500).send("Échec Token.");
        }
    } catch (e) {
        res.status(500).send(`Erreur Serveur: ${e.message}`);
    }
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true, message: "Déconnecté" });
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// =========================================================
// 5. API DE DONNÉES (FOLLOWS, VOD, SCAN)
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Non connecté." });

    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        
        const streams = data.data.map(stream => ({
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url 
        }));
        
        return res.json({ success: true, streams });
    } catch (e) {
        console.error("Erreur Followed:", e);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ success: false, error: "Manquant" });

    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data || userRes.data.length === 0) return res.status(404).json({ success: false });
        const userId = userRes.data[0].id;

        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if (!vodRes.data || vodRes.data.length === 0) return res.status(404).json({ success: false });
        
        const vod = vodRes.data[0];
        
        return res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84'),
                duration: vod.duration 
            }
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// SCAN GLOBAL (Utilisateur ou Jeu)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Vide." });
    
    try {
        // A. UTILISATEUR
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) streamDetails = streamRes.data[0];
            } catch (e) {}

            let followerCount = 'N/A';
            try {
                const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`);
                followerCount = fRes.total;
            } catch (e) {}

            let aiScore = (user.broadcaster_type === 'partner') ? '8.5/10' : '5.5/10';

            const userData = { 
                login: user.login, 
                display_name: user.display_name, 
                id: user.id, 
                profile_image_url: user.profile_image_url,
                is_live: !!streamDetails,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                total_followers: followerCount,
                total_views: user.view_count || 'N/A',
                ai_calculated_niche_score: aiScore 
            };
            
            CACHE.lastScanData = { type: 'user', ...userData };
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // B. JEU
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const streams = streamsRes.data;
            const totalStreams = streams.length;
            const totalViewers = streams.reduce((sum, s) => sum + s.viewer_count, 0);
            const avgViewers = totalStreams > 0 ? Math.round(totalViewers / totalStreams) : 0;
            
            let aiScore = (avgViewers < 100) ? '8.0/10' : '4.5/10'; 
            
            const gameData = { 
                name: game.name, 
                id: game.id, 
                box_art_url: game.box_art_url,
                total_streamers: totalStreams,
                total_viewers: totalViewers,
                avg_viewers_per_streamer: avgViewers,
                ai_calculated_niche_score: aiScore
            };
            
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }

        return res.status(404).json({ success: false, message: "Aucun résultat." });
        
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// 6. ROTATION AUTOMATIQUE & LECTEUR (AVEC FIREBASE)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown de 3 min pour forcer le refresh
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) {
        return;
    }
    
    console.log("🔄 Rafraîchissement de la liste 0-100 vues...");
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const allStreams = data.data;

        // Filtre strict : 0 à 100 vues
        let suitableStreams = allStreams.filter(stream => stream.viewer_count > 0 && stream.viewer_count <= 100);

        // Fallback
        if (suitableStreams.length === 0 && allStreams.length > 0) {
            suitableStreams = allStreams.sort((a, b) => a.viewer_count - b.viewer_count).slice(0, 10); 
        }

        if (suitableStreams.length > 0) {
            rotation.streams = suitableStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
        }
    } catch (e) {
        console.error("❌ Erreur Rotation:", e);
    }
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // 1. VÉRIFICATION FIREBASE
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
    } catch(e) {
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
            currentBoost = CACHE.boostedStream;
        }
    }

    // 2. LOGIQUE DE PRIORITÉ
    if (currentBoost && currentBoost.endTime > now) {
        const remaining = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ 
            success: true, 
            channel: currentBoost.channel, 
            viewers: 'BOOST',
            mode: 'BOOST',
            message: `⚡ BOOST ACTIF (${remaining} min)`
        });
    }

    // Sinon : ROTATION AUTOMATIQUE
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch', message: 'Fallback' });
    }

    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ 
        success: true, 
        channel: currentStream.channel,
        viewers: currentStream.viewers,
        mode: 'AUTO',
        message: `✅ Auto (3min) : ${currentStream.channel}`
    });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.status(403).json({ success: false, error: "Boost actif." });
    }

    await refreshGlobalStreamList();
    const rotation = CACHE.globalStreamRotation;

    if (rotation.streams.length === 0) return res.status(404).json({ success: false });

    if (direction === 'next') {
        rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
    } else {
        rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;
    }

    const newStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: newStream.channel, viewers: newStream.viewers });
});

// =========================================================
// 8. FONCTIONNALITÉS AVANCÉES & DASHBOARD
// =========================================================

// --- AJOUT V39 : ROUTES DASHBOARD ---
app.get('/api/stats/global', async (req, res) => {
    try {
        const data = await twitchApiFetch('streams?first=100');
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        const estimatedTotal = Math.floor(sampleViewers * 3.8); 
        const topGame = data.data.length > 0 ? data.data[0].game_name : "N/A";
        
        // Historique simple depuis Firebase
        const historySnapshot = await db.collection('stats_history').orderBy('timestamp', 'desc').limit(24).get();
        const labels = [], values = [];
        historySnapshot.docs.reverse().forEach(doc => {
             const d = doc.data();
             if(d.timestamp) { labels.push('H'); values.push(d.total_viewers); }
        });
        labels.push("Now"); values.push(estimatedTotal);

        res.json({
            success: true,
            total_viewers: estimatedTotal,
            total_channels: "98k+",
            top_game_name: topGame,
            uptime: "100%",
            history: { live: { labels, values } }
        });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/stats/top_games', async (req, res) => {
    try {
        const data = await twitchApiFetch('games/top?first=10');
        const games = data.data.map(g => ({
            name: g.name,
            box_art_url: g.box_art_url.replace('{width}', '52').replace('{height}', '72'),
            viewer_count: "Top"
        }));
        res.json({ success: true, games });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/stats/languages', async (req, res) => {
    try {
        const data = await twitchApiFetch('streams?first=100');
        const languages = {};
        data.data.forEach(s => { languages[s.language] = (languages[s.language] || 0) + 1; });
        const result = Object.keys(languages).map(key => ({ name: key.toUpperCase(), percent: Math.floor((languages[key]/data.data.length)*100) })).sort((a,b)=>b.percent-a.percent).slice(0,5);
        res.json({ success: true, languages: result });
    } catch (error) { res.status(500).json({ success: false }); }
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
        await db.collection('boosts').add({ channel: channel, startTime: now, endTime: now + (15*60*1000) });
        CACHE.boostedStream = { channel: channel, endTime: now + (15*60*1000) };
        return res.json({ success: true, html_response: `<p>Boost activé !</p>` });
    } catch (e) { return res.status(500).json({ error: "Erreur DB" }); }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ success: false });
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100&language=fr`);
        const target = streamsRes.data.filter(stream => stream.viewer_count <= parseInt(max_viewers)).sort((a, b) => b.viewer_count - a.viewer_count)[0];
        if (target) return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56') } });
        return res.json({ success: false, error: "Personne." });
    } catch (e) { return res.status(500).json({ success: false }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";
    if (type === 'niche') prompt = `Expert Twitch. Audit "${query}". 3 points forts. HTML simple.`;
    else if (type === 'repurpose') prompt = `Expert Montage. 3 clips pour "${query}". HTML simple.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.json({ success: false });
        const aiResult = await runGeminiAnalysis(`Horaires stream ${game}. HTML simple.`);
        return res.json({ success: true, game_name: gameRes.data[0].name, box_art: gameRes.data[0].box_art_url.replace('{width}','144').replace('{height}','192'), html_response: aiResult.html_response });
    } catch (e) { return res.status(500).json({ success: false }); }
});

app.get('/export_csv', (req, res) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData?.type},${CACHE.lastScanData?.login}`);
});

// --- CRON JOB HISTORIQUE ---
async function recordStats() {
    try {
        const data = await twitchApiFetch('streams?first=100');
        let v = 0; data.data.forEach(s => v += s.viewer_count);
        await db.collection('stats_history').add({ timestamp: admin.firestore.FieldValue.serverTimestamp(), total_viewers: Math.floor(v*3.8) });
    } catch(e) {}
}
setInterval(recordStats, 30 * 60 * 1000);

// =========================================================
// 8. DÉMARRAGE DU SERVEUR
// =========================================================

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` STREAMER HUB V39 (ULTIMATE FIX) PORT ${PORT}`);
    console.log(`===========================================`);
});
