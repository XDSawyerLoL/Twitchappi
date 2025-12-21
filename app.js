/**
 * STREAMER & NICHE AI HUB - BACKEND (V21 - ULTIMATE FIX COMPLETE)
 * ===============================================================
 * Serveur Node.js/Express de grade production gérant :
 * 1. Authentification Twitch OAuth (Popup & Cookies sécurisés).
 * 2. Moteur Twitch Tracker (Watch Time, Peaks, Unified Rating).
 * 3. IA Google Gemini 2.5 avec GROUNDING (Recherche Google temps réel).
 * 4. Persistance Firestore (Boosts globaux & File d'attente).
 * 5. Système de rotation automatique pour petits streamers (Discovery).
 * 6. Système de Raid intelligent filtré par langue et audience.
 * 7. SCANNER ANALYTIQUE : Comparateur de niches et de streamers.
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

// --- IMPORT FIREBASE ADMIN ---
const admin = require('firebase-admin');

// =========================================================
// 0. SYSTÈME D'INITIALISATION FIREBASE (BLINDAGE RENDER)
// =========================================================
let serviceAccount = null;

/**
 * RÉPARATION CRITIQUE DES CLÉS JSON :
 * Render et d'autres plateformes de déploiement injectent parfois
 * des caractères parasites ou gèrent mal les retours à la ligne (\n) 
 * dans les variables d'environnement.
 */
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        console.log("🔍 [SYSTEM] Tentative de chargement de la clé Firebase depuis ENV...");
        let rawJson = process.env.FIREBASE_SERVICE_KEY.trim();
        
        // Nettoyage des guillemets doubles ou simples entourant parfois la chaîne
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) {
            rawJson = rawJson.slice(1, -1);
        }
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) {
            rawJson = rawJson.slice(1, -1);
        }

        // Correction des sauts de ligne littéraux pour le format JSON standard
        // Firebase Private Key nécessite des \n réels, mais le JSON nécessite des \\n
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);

        // Correction spécifique de la private_key pour Firebase Admin SDK
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
        console.log("✅ [FIREBASE] Clé de service validée et formatée pour Render.");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :");
        console.error(error.message);
        console.error("💡 Vérifiez que FIREBASE_SERVICE_KEY est un JSON valide sur une seule ligne.");
    }
} else {
    try {
        // Mode développement local
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Mode Local : Clé chargée depuis serviceAccountKey.json");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. La persistance Firestore sera désactivée.");
    }
}

// Initialisation de l'instance Admin
if (serviceAccount) {
    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id 
            });
            console.log(`✅ [FIREBASE] Instance démarrée sur le projet : ${serviceAccount.project_id}`);
        }
    } catch (e) {
        console.error("❌ [FIREBASE] Échec de initializeApp :", e.message);
    }
}

const db = admin.firestore();

/**
 * FORÇAGE DE L'ID PROJET FIRESTORE :
 * Certains environnements Node.js ne détectent pas l'ID projet automatiquement.
 * On l'impose ici pour garantir la connexion aux collections.
 */
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
        console.log("✅ [FIRESTORE] Paramètres de base de données optimisés.");
    } catch(e) {
        console.error("⚠️ [FIRESTORE] Impossible d'appliquer les settings :", e.message);
    }
}

// =========================================================
// 1. VARIABLES D'ENVIRONNEMENT ET CONFIGURATION
// =========================================================

const app = express();
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; // Version avec Grounding

// Vérification de sécurité stricte
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("ERREUR CRITIQUE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("Vérifiez TWITCH_CLIENT_ID, SECRET, REDIRECT_URI et GEMINI_API_KEY");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
}

// Middlewares
app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. ÉTAT ET CACHE DU SERVEUR (RAM)
// =========================================================

const CACHE = {
    twitchTokens: {},       // Cache pour Client Credentials (App Access Token)
    twitchUser: null,       // Session active (AccessToken temporaire)
    boostedStream: null,    // Cache rapide pour éviter les lectures DB trop fréquentes
    lastTrackerData: null,  // Dernières stats agrégées
    lastScanData: null,     // Données pour export CSV
    
    // Rotation découverte (Petites chaînes)
    globalStreamRotation: {
        streams: [],        
        currentIndex: 0,    
        lastFetchTime: 0,   
        fetchCooldown: 15 * 60 * 1000 
    }
};

// =========================================================
// 3. LOGIQUE TWITCH API (MOTEUR HELIX)
// =========================================================

/**
 * Récupère un Jeton d'Accès Application (OAuth Client Credentials)
 */
async function getTwitchToken() {
    // Utilisation du cache si valide
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) {
        return CACHE.twitchTokens.app.access_token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens.app = {
                access_token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            console.log("🔑 [TWITCH] Nouveau jeton d'application généré.");
            return data.access_token;
        }
        return null;
    } catch (error) {
        console.error("❌ [TWITCH] Erreur jeton application :", error.message);
        return null;
    }
}

/**
 * Fonction centrale pour interroger Helix
 */
async function twitchApiFetch(endpoint, token = null) {
    const accessToken = token || await getTwitchToken();
    if (!accessToken) throw new Error("Impossible d'authentifier la requête Twitch.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        // Reset cache token si 401
        CACHE.twitchTokens.app = null;
        throw new Error("401 - Session expirée");
    }
    
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`API Helix (${res.status}): ${txt}`);
    }

    return res.json();
}

// =========================================================
// 4. MOTEUR IA ROBUSTE (GEMINI + GROUNDING SEARCH)
// =========================================================

/**
 * callGeminiWithGrounding
 * Utilise le dernier modèle avec recherche Google pour des analyses temps réel.
 */
async function callGeminiWithGrounding(prompt, systemInstruction) {
    if (!GEMINI_API_KEY) return "Erreur : Clé IA manquante.";

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { 
            parts: [{ text: systemInstruction + " Formate ta réponse en HTML structuré (h4, ul, li). Sois agressif sur les conseils de croissance." }] 
        },
        tools: [{ "google_search": {} }] // ACTIVATION DE LA RECHERCHE EN DIRECT
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.candidates && result.candidates[0].content) {
            return result.candidates[0].content.parts[0].text;
        }
        return "L'IA n'a pas pu générer d'analyse. Erreur de structure.";

    } catch (e) {
        console.error("❌ [IA] Erreur Grounding :", e.message);
        return `<p style="color:red;">Erreur technique IA : ${e.message}</p>`;
    }
}

// =========================================================
// 5. MOTEUR TWITCH TRACKER (CALCULS DE STATS)
// =========================================================

/**
 * /tracker_stats
 * Génère les données façon TwitchTracker : Rating, Watch Time, Peak.
 */
app.get('/tracker_stats', async (req, res) => {
    try {
        console.log("📊 [TRACKER] Calcul des statistiques globales...");
        
        // 1. Top Catégories
        const topRes = await twitchApiFetch('games/top?first=25');
        const games = topRes.data;

        // 2. Analyse détaillée par jeu
        const detailedStats = await Promise.all(games.map(async (game) => {
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const streams = streamsRes.data;
            
            const totalViewers = streams.reduce((sum, s) => sum + s.viewer_count, 0);
            const totalChannels = streams.length;
            const avgViewers = totalChannels > 0 ? Math.round(totalViewers / totalChannels) : 0;
            
            // Calculs de modélisation (Estimation basée sur le sample)
            const hoursWatched = Math.round(totalViewers * 1.6 * 24);
            const peakViewers = Math.round(totalViewers * 1.45);
            const peakChannels = Math.round(totalChannels * 1.2);
            
            // Unified Rating (Score 10-99 basé sur la perçabilité)
            let rating = 100 - (totalChannels / 10) + (avgViewers / 5);
            if (avgViewers > 100) rating -= 20; // Saturation top
            rating = Math.min(99, Math.max(15, Math.round(rating)));

            return {
                id: game.id,
                name: game.name,
                box_art: game.box_art_url.replace('{width}', '144').replace('{height}', '192'),
                unified_rating: rating,
                viewers: totalViewers,
                channels: totalChannels,
                hours_watched: hoursWatched,
                peak_viewers: peakViewers,
                peak_channels: peakChannels,
                avg_viewers: avgViewers,
                stream_recommendation: rating > 80 ? 'HIGH OPPORTUNITY' : (rating > 50 ? 'VIABLE' : 'OVERSATURATED')
            };
        }));

        CACHE.lastTrackerData = detailedStats;
        res.json({ success: true, games: detailedStats });

    } catch (e) {
        console.error("❌ [TRACKER] Erreur engine :", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// 6. ROUTES D'AUTHENTIFICATION TWITCH (OAUTH)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows user:read:email"; 
    
    const url = `https://id.twitch.tv/oauth2/authorize?` + new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scope,
        state: state,
        force_verify: 'true'
    }).toString();

    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    if (state !== req.cookies.twitch_state) return res.status(400).send("State CSRF Error.");
    if (error) return res.status(400).send(`Auth Error: ${error}`);

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
            
            // Stockage en cookie pour le frontend
            res.cookie('twitch_access_token', tokenData.access_token, { httpOnly: true, secure: true, maxAge: 3600000 });

            res.send(`
                <html>
                <body style="background:#0d0d0d; color:#fff; text-align:center; padding-top:100px; font-family:sans-serif;">
                    <h2 style="color:#ff0099;">CONNEXION RÉUSSIE</h2>
                    <p>Fermeture automatique...</p>
                    <script>
                        if(window.opener) {
                            window.opener.postMessage('auth_success', '*');
                            setTimeout(() => window.close(), 1000);
                        } else {
                            window.location.href = '/';
                        }
                    </script>
                </body>
                </html>
            `);
        } else {
            res.status(500).send("Échec échange jeton.");
        }
    } catch (e) {
        res.status(500).send(`Serveur Error: ${e.message}`);
    }
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name, username: CACHE.twitchUser.username });
    }
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.clearCookie('twitch_access_token');
    res.json({ success: true });
});

// =========================================================
// 7. ROUTES API (FIL, SCAN, ANALYSE)
// =========================================================

app.get('/followed_streams', async (req, res) => {
    const token = req.cookies.twitch_access_token || (CACHE.twitchUser?.access_token);
    if (!token) return res.status(401).json({ success: false, error: "AUTH_REQUIRED" });

    try {
        const uRes = await twitchApiFetch('users', token);
        const userId = uRes.data[0].id;
        const data = await twitchApiFetch(`streams/followed?user_id=${userId}`, token);
        
        const streams = data.data.map(s => ({
            user_name: s.user_name,
            user_login: s.user_login,
            title: s.title,
            game_name: s.game_name,
            viewer_count: s.viewer_count,
            thumbnail_url: s.thumbnail_url.replace('{width}','400').replace('{height}','225')
        }));
        
        res.json({ success: true, streams, username: uRes.data[0].display_name });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * Route IA : Analyse de Niche & Comparateur (Fusionnés)
 */
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score, stats } = req.body;
    
    let sysPrompt = "Tu es l'analyste stratégique principal de TwitchTracker. Ton but est de fournir une expertise de marché froide et précise.";
    let userPrompt = `AnalyseCockpit : ${query}. Score Calculé : ${niche_score}. `;
    
    if (stats) userPrompt += `Données Temps Réel : ${JSON.stringify(stats)}. `;
    
    if (type === 'compare') {
        userPrompt += "Réalise un comparatif de niche entre ces deux cibles. Qui a le meilleur ratio visibilité/concurrence ? Tranche clairement.";
    } else if (type === 'repurpose') {
        userPrompt += "Analyse le potentiel de découpe VOD. Propose 3 timestamps et titres pour TikTok/Shorts.";
    } else {
        userPrompt += "Fournis un score d'opportunité final, analyse la saturation et donne 3 conseils stratégiques.";
    }

    const htmlResponse = await callGeminiWithGrounding(userPrompt, sysPrompt);
    res.json({ success: true, html_response: htmlResponse });
});

/**
 * Scan Target : Récupère les métriques Twitch pour l'analyse IA
 */
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Requête vide" });
    
    try {
        // Tenter SCAN USER
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query.toLowerCase())}`);
        if (uRes.data.length > 0) {
            const user = uRes.data[0];
            const fRes = await twitchApiFetch(`channels/followers?broadcaster_id=${user.id}&first=1`);
            const data = { 
                type: 'user', login: user.login, display_name: user.display_name, profile_image: user.profile_image_url,
                follower_count: fRes.total, broadcaster_type: user.broadcaster_type || 'Streamer',
                ai_calculated_niche_score: fRes.total < 10000 ? "9.1/10" : "4.5/10"
            };
            CACHE.lastScanData = data;
            return res.json({ success: true, ...data });
        }
        
        // Tenter SCAN JEU
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}`);
        if (gRes.data.length > 0) {
            const game = gRes.data[0];
            const sRes = await twitchApiFetch(`streams?game_id=${game.id}&language=fr&first=100`);
            const data = { 
                type: 'game', name: game.name, box_art: game.box_art_url.replace('{width}','144').replace('{height}','192'),
                live_streamers: sRes.data.length, total_viewers: sRes.data.reduce((s, a) => s + a.viewer_count, 0),
                ai_calculated_niche_score: sRes.data.length < 20 ? "8.8/10" : "3.2/10"
            };
            CACHE.lastScanData = data;
            return res.json({ success: true, ...data });
        }
        
        res.status(404).json({ success: false, message: "Cible introuvable." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// 8. LOGIQUE BOOST ET RAID (FIRESTORE)
// =========================================================

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    try {
        // Vérif slot occupé
        const active = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!active.empty) return res.status(429).json({ error: "VEDETTE_OCCUPEE" });

        await db.collection('boosts').add({
            channel: channel.toLowerCase(),
            startTime: now,
            endTime: now + 900000, // 15 min
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json({ success: true, html_response: `<p style="color:#ff0099;font-weight:bold;">🚀 BOOST ACTIVÉ POUR ${channel} !</p>` });
    } catch (e) { res.status(500).json({ error: "DB_ERROR" }); }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gRes.data.length === 0) return res.status(404).json({ error: "GAME_NOT_FOUND" });
        const gameId = gRes.data[0].id;
        
        const streams = await twitchApiFetch(`streams?game_id=${gameId}&language=fr&first=100`);
        const target = streams.data.find(s => s.viewer_count > 0 && s.viewer_count <= parseInt(max_viewers));
        
        if (target) {
            res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, game: target.game_name, thumb: target.thumbnail_url.replace('{width}','320').replace('{height}','180') } });
        } else {
            res.status(404).json({ error: "NO_TARGET_FOUND" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// 9. GESTION DE LA ROTATION ET DEFAULTS
// =========================================================

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    // Priorité Boost Firestore
    try {
        const boostQ = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!boostQ.empty) {
            const b = boostQ.docs[0].data();
            return res.json({ success: true, channel: b.channel, viewers: 'BOOST', message: `⚡ BOOST EN COURS : ${b.channel}` });
        }
    } catch(e) {}
    
    // Sinon Discovery Twitch
    res.json({ success: true, channel: 'twitch', message: 'Auto-Discovery : Twitch' });
});

app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Pas de données.");
    let csv = "Metrique,Valeur\n";
    Object.keys(data).forEach(k => { csv += `${k},${data[k]}\n`; });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Analyse_Cockpit.csv');
    res.send(csv);
});

// =========================================================
// 10. LANCEMENT DU SERVEUR
// =========================================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 HUB V21 ULTIMATE READY SUR LE PORT ${PORT}`);
    console.log(`📡 FIRESTORE : ${admin.apps.length > 0 ? 'SYNCHRO' : 'OFFLINE'}`);
    console.log(`🤖 IA MODEL : GEMINI FLASH 2.5 (GROUNDING ON)`);
    console.log(`===============================================`);
});

