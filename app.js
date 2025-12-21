/**
 * STREAMER & NICHE AI HUB - BACKEND (V22 - FULL MERGE PRODUCTION)
 * ===============================================================
 * Ce fichier combine :
 * - L'infrastructure V20 (Firebase, Auth, IA Gemini, Rotation)
 * - Les Analytics V21 (Global Stats, Top Games, Languages)
 * - Compatibilité Render & Local
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
// 0. INITIALISATION FIREBASE (CODE COMPLET V20)
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
// On impose l'ID du projet dans les réglages de la DB pour contourner le bug Render
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
const GEMINI_MODEL = "gemini-2.0-flash"; // Utilisation du dernier modèle flash

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
// Sert les fichiers statiques (HTML/CSS/JS client)
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. SYSTÈME DE CACHE HYBRIDE (RAM + DB)
// =========================================================
const CACHE = {
    twitchTokens: {},       // Tokens d'application (App Access Token)
    twitchUser: null,       // Session utilisateur connecté (User Access Token)
    
    // Le boost actif est stocké ici pour lecture rapide
    boostedStream: null,    
    
    lastScanData: null,     // Dernières données scannées (pour l'export CSV)
    
    // Rotation automatique des chaînes (Auto-Discovery)
    globalStreamRotation: {
        streams: [],        // Liste des streams filtrés (0-100 vues)
        currentIndex: 0,    // Index actuel dans la liste
        lastFetchTime: 0,   // Dernier appel à l'API Twitch
        fetchCooldown: 15 * 60 * 1000 // Rafraichissement toutes les 15 min
    },

    // NOUVEAU V21 : Cache pour les stats analytics
    statsCache: {
        global: null,
        topGames: null,
        languages: null,
        lastFetch: 0,
        cooldown: 60 * 1000 // 1 minute de cache pour les stats globales
    }
};

// =========================================================
// 3. FONCTIONS UTILITAIRES (HELPERS)
// =========================================================

/**
 * Récupère un Token Twitch "App Access" (Client Credentials)
 */
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

/**
 * Effectue un appel à l'API Twitch Helix
 */
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
 * Appelle Google Gemini (IA) pour générer du contenu HTML
 */
async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Tu es un expert en stratégie Twitch et Data Analysis. Réponds UNIQUEMENT en HTML simple (utilisant <p>, <ul>, <li>, <h4>, <strong>) sans balises <html>, <head> ou <body>. Sois concis, direct et utile."
            }
        });
        
        const text = response.text.trim();
        return { success: true, html_response: text };

    } catch (e) {
        console.error("Erreur Gemini:", e);
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
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité (State mismatch).");
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
            
            res.send(`
                <html>
                <body style="background:#111; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
                    <h2>Connexion Réussie !</h2>
                    <p>Fermeture de la fenêtre...</p>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage('auth_success', '*');
                            window.close();
                        } else {
                            window.location.href = '/';
                        }
                    </script>
                </body>
                </html>
            `);
        } else {
            res.status(500).send("Échec de l'obtention du token Twitch.");
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
// 5. API DE DONNÉES CLASSIQUES (FOLLOWS, VOD)
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
    if (!channel) return res.status(400).json({ success: false, error: "Paramètre manquant" });

    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data || userRes.data.length === 0) {
            return res.status(404).json({ success: false, error: "Chaîne introuvable" });
        }
        const userId = userRes.data[0].id;

        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if (!vodRes.data || vodRes.data.length === 0) {
            return res.status(404).json({ success: false, error: "Aucune VOD trouvée" });
        }
        
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

// =========================================================
// 6. NOUVEAU MODULE ANALYTICS (V21) - LE COEUR TWITCHTRACKER
// =========================================================

/**
 * Endpoint : /api/stats/global
 * Objectif : Fournir les KPIs globaux et l'historique pour le Dashboard V19.
 * Méthode : Récupère les 100 streams les plus populaires, calcule des totaux et simule un trafic global.
 */
app.get('/api/stats/global', async (req, res) => {
    try {
        // Cache simple pour éviter de spammer l'API Twitch toutes les secondes
        if (CACHE.statsCache.global && (Date.now() - CACHE.statsCache.lastFetch < CACHE.statsCache.cooldown)) {
            return res.json(CACHE.statsCache.global);
        }

        const data = await twitchApiFetch('streams?first=100'); // Échantillon Top 100
        
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        
        // Extrapolation : Le top 100 représente généralement une grosse part du trafic, 
        // mais pour avoir un chiffre "Global" réaliste (style 2M+), on applique un multiplicateur.
        const estimatedTotal = Math.floor(sampleViewers * 3.5); 
        const topGame = data.data.length > 0 ? data.data[0].game_name : "N/A";

        // Génération d'un historique simulé pour le graphique en ligne
        // (Dans une V22, on pourrait stocker ces points dans Firebase toutes les heures)
        const history = {
            live: {
                labels: ["-4h", "-3h", "-2h", "-1h", "Maintenant"],
                values: [
                    Math.floor(estimatedTotal * 0.85), 
                    Math.floor(estimatedTotal * 0.92), 
                    Math.floor(estimatedTotal * 0.88), 
                    Math.floor(estimatedTotal * 0.95), 
                    estimatedTotal
                ]
            }
        };

        const responseData = {
            success: true,
            total_viewers: estimatedTotal,
            total_channels: "98k+", // Donnée statique réaliste (difficile à avoir en temps réel sans scan massif)
            top_game_name: topGame,
            uptime: "100%",
            history: history
        };

        // Mise en cache
        CACHE.statsCache.global = responseData;
        CACHE.statsCache.lastFetch = Date.now();

        res.json(responseData);
    } catch (error) {
        console.error("Erreur Stats Global:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Endpoint : /api/stats/top_games
 * Objectif : Remplir l'onglet "Games" avec les vraies catégories Twitch.
 */
app.get('/api/stats/top_games', async (req, res) => {
    try {
        const data = await twitchApiFetch('games/top?first=10');
        
        // Note: L'endpoint games/top ne donne pas le viewer_count directement.
        // Pour avoir le vrai chiffre, il faudrait scanner les streams de chaque jeu.
        // Pour la rapidité, on met un placeholder ou on fait un scan rapide (ici simplifié).
        const games = data.data.map(g => ({
            name: g.name,
            box_art_url: g.box_art_url.replace('{width}', '52').replace('{height}', '72'),
            viewer_count: "🔥 Trending" // Placeholder textuel
        }));

        res.json({ success: true, games });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Endpoint : /api/stats/languages
 * Objectif : Remplir l'onglet "Languages" en analysant l'échantillon Top 100.
 */
app.get('/api/stats/languages', async (req, res) => {
    try {
        const data = await twitchApiFetch('streams?first=100');
        const languages = {};
        
        data.data.forEach(s => {
            const lang = s.language;
            languages[lang] = (languages[lang] || 0) + 1;
        });

        const total = data.data.length;
        const result = Object.keys(languages)
            .map(key => ({
                name: key.toUpperCase(),
                percent: Math.floor((languages[key] / total) * 100)
            }))
            .sort((a,b) => b.percent - a.percent)
            .slice(0, 5);

        res.json({ success: true, languages: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =========================================================
// 7. SCAN GLOBAL (Utilisateur ou Jeu) - CODE V20 COMPLET
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    
    try {
        // A. Essayer de trouver un UTILISATEUR
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // Infos Stream Live
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) streamDetails = streamRes.data[0];
            } catch (e) {}

            // Infos Followers
            let followerCount = 'N/A';
            try {
                const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`);
                followerCount = fRes.total;
            } catch (e) {}

            // Calcul basique du score niche
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
        
        // B. Essayer de trouver un JEU (Catégorie)
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            // Statistiques globales du jeu
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

        return res.status(404).json({ success: false, message: "Aucun résultat trouvé (Ni User, Ni Jeu)." });
        
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// 8. ROTATION AUTOMATIQUE & LECTEUR (AVEC FIREBASE)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown de 15 min pour ne pas spammer Twitch
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) {
        return;
    }
    
    console.log("🔄 Rafraîchissement de la liste 0-100 vues...");
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const allStreams = data.data;

        // Filtre strict : 0 à 100 vues
        let suitableStreams = allStreams.filter(stream => stream.viewer_count > 0 && stream.viewer_count <= 100);

        // Fallback : Si aucun stream <100, on prend les 10 plus petits du top 100
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

// Route principale appelée par le lecteur pour savoir quoi jouer
app.get('/get_default_stream', async (req, res) => {
    
    const now = Date.now();
    let currentBoost = null;

    // 1. VÉRIFICATION FIREBASE (PRIORITÉ ABSOLUE)
    try {
        // On cherche un boost qui finit dans le futur
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get();
            
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            currentBoost = { channel: data.channel, endTime: data.endTime };
            // On met à jour le cache local
            CACHE.boostedStream = currentBoost; 
        } else {
            CACHE.boostedStream = null;
        }
    } catch(e) {
        console.error("⚠️ Erreur lecture Boost DB:", e.message);
        // Fallback RAM si la DB a un souci
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
            currentBoost = CACHE.boostedStream;
        }
    }

    // 2. LOGIQUE DE PRIORITÉ
    // Si Boost trouvé et valide
    if (currentBoost && currentBoost.endTime > now) {
        const remaining = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ 
            success: true, 
            channel: currentBoost.channel, 
            viewers: 'BOOST',
            message: `⚡ BOOST ACTIF (${remaining} min restantes) - ${currentBoost.channel}`
        });
    }

    // Sinon : ROTATION AUTOMATIQUE
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) {
        return res.json({ 
            success: true, 
            channel: 'twitch', 
            message: 'Fallback: Aucun stream trouvé.' 
        });
    }

    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ 
        success: true, 
        channel: currentStream.channel,
        viewers: currentStream.viewers,
        message: `✅ Auto-Discovery : ${currentStream.channel} (${currentStream.viewers} vues)`
    });
});

// Changer de chaîne manuellement (Next/Prev)
app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    // Interdit si un boost est en cours (Vérif RAM)
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.status(403).json({ success: false, error: "Boost actif. Changement impossible." });
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
// 9. FONCTIONNALITÉS AVANCÉES (BOOST, RAID, IA, CSV)
// =========================================================

// Vérifier si un boost est en cours (pour l'UI)
app.get('/check_boost_status', async (req, res) => {
    const now = Date.now();
    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .limit(1)
            .get();

        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            const remainingTime = Math.ceil((data.endTime - now) / 1000);
            return res.json({ 
                is_boosted: true, 
                channel: data.channel, 
                remaining_seconds: remainingTime 
            });
        }
    } catch(e) { console.error(e); }
    
    return res.json({ is_boosted: false });
});

// Activer un Boost (ECRITURE DB)
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Nom de chaîne requis." });

    const now = Date.now();
    const COOLDOWN = 3 * 60 * 60 * 1000; // 3 heures
    const DURATION = 15 * 60 * 1000;      // 15 minutes

    try {
        // 1. Vérifier si un boost est DÉJÀ actif globalement (un seul boost à la fois)
        const activeBoostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .limit(1)
            .get();

        if (!activeBoostQuery.empty) {
            const active = activeBoostQuery.docs[0].data();
            const remaining = Math.ceil((active.endTime - now) / 60000);
            return res.status(429).json({ 
                error: "Slot occupé", 
                html_response: `<p style="color:var(--color-ai-action);">❌ Un autre boost est actif (${active.channel}). Attendez ${remaining} min.</p>` 
            });
        }

        // 2. Vérifier le Cooldown personnel
        const userHistoryQuery = await db.collection('boosts')
            .where('channel', '==', channel)
            .orderBy('endTime', 'desc') 
            .limit(1)
            .get();

        if (!userHistoryQuery.empty) {
            const lastBoost = userHistoryQuery.docs[0].data();
            if ((now - lastBoost.endTime) < COOLDOWN) {
                const remainingCooldown = Math.ceil((lastBoost.endTime + COOLDOWN - now) / 60000);
                 return res.status(429).json({ 
                    error: "Cooldown actif.", 
                    html_response: `<p style="color:var(--color-ai-action);">❌ Vous devez attendre encore ${remainingCooldown} min.</p>` 
                });
            }
        }

        // 3. Créer le nouveau Boost
        await db.collection('boosts').add({
            channel: channel,
            startTime: now,
            endTime: now + DURATION,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        // Mise à jour cache
        CACHE.boostedStream = { channel: channel, endTime: now + DURATION }; 

        return res.json({ 
            success: true, 
            html_response: `<p style="color:var(--color-primary-pink); font-weight:bold;">🚀 Boost activé pour ${channel} (15 min) !</p>` 
        });

    } catch (e) {
        console.error("Erreur Firebase Boost:", e);
        return res.status(500).json({ error: "Erreur Base de Données", html_response: "<p>Erreur serveur lors de l'activation.</p>" });
    }
});

// RAID OPTIMISÉ
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    if (!game || !max_viewers) return res.status(400).json({ success: false, error: "Données manquantes" });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ success: false, error: `Jeu "${game}" introuvable.` });

        const gameId = gameRes.data[0].id;
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100&language=fr`);

        const candidates = streamsRes.data.filter(stream => stream.viewer_count <= parseInt(max_viewers));
        let target = candidates.sort((a, b) => b.viewer_count - a.viewer_count)[0];
        
        // Fallback
        if (!target && streamsRes.data.length > 0) {
            target = streamsRes.data.sort((a, b) => a.viewer_count - b.viewer_count)[0];
        }

        if (target) {
            return res.json({
                success: true,
                target: {
                    name: target.user_name,
                    login: target.user_login,
                    viewers: target.viewer_count,
                    game: target.game_name,
                    thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56')
                }
            });
        } else {
            return res.json({ success: false, error: "Aucune chaîne française trouvée pour ce jeu." });
        }
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Appels IA Génériques
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = "";

    if (type === 'niche') {
        prompt = `Expert Twitch. Score niche calculé: ${niche_score}. Analyse le sujet "${query}". Structure HTML requise: Titre <h4>, Liste <ul> de 3 forces, Liste <ul> de 3 idées contenus, Conclusion <p> avec <strong>.`;
    } else if (type === 'repurpose') {
        prompt = `Expert Montage Vidéo. Analyse la VOD "${query}". Structure HTML: Titre <h4>, Liste <ul> de 3 timestamps clips (HH:MM:SS) avec texte "**Point de Clip: HH:MM:SS**", Liste <ul> de 3 titres YouTube Shorts.`;
    }

    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

// BEST TIME (PLANNING)
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    if (!game) return res.status(400).json({ success: false, error: "Jeu manquant." });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.json({ success: false, error: "Jeu introuvable." });
        
        const gameData = gameRes.data[0];
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameData.id}&first=100`);
        const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
        const streamerCount = streamsRes.data.length;
        
        const prompt = `
            Analyse le jeu Twitch "${gameData.name}".
            Données temps réel (échantillon): ${streamerCount} streamers, ${totalViewers} viewers.
            Agis comme un expert data. Génère une réponse HTML (sans balises globales) :
            1. <h4>Indice de Saturation</h4> (Analyse ratio viewers/streamers).
            2. <h4>Meilleurs Créneaux (Prédiction)</h4>.
            3. <ul> avec 3 créneaux (Jour + Heure) recommandés pour percer.
            4. Conseil final <strong> sur la durée de session.
        `;

        const aiResult = await runGeminiAnalysis(prompt);
        return res.json({
            success: true,
            game_name: gameData.name,
            box_art: gameData.box_art_url.replace('{width}','144').replace('{height}','192'),
            html_response: aiResult.html_response
        });

    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Export CSV
app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Aucune donnée disponible. Faites un scan d'abord.");

    let csv = "Metrique,Valeur\n";
    if (data.type === 'user') {
        csv += `Type,Streamer\nNom,${data.display_name}\nVues,${data.viewer_count}\nFollowers,${data.total_followers}\nScore Niche,${data.ai_calculated_niche_score}`;
    } else {
        csv += `Type,Jeu\nNom,${data.name}\nTotal Viewers,${data.total_viewers}\nTotal Streamers,${data.total_streamers}\nScore Niche,${data.ai_calculated_niche_score}`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(csv);
});

// =========================================================
// 10. DÉMARRAGE DU SERVEUR
// =========================================================

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` STREAMER HUB V22 (ULTIMATE MERGE) PORT ${PORT}`);
    console.log(`===========================================`);
});
