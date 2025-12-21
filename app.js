/**
 * STREAMER & NICHE AI HUB - BACKEND SERVER (V24 - PRODUCTION ULTIME)
 * ==================================================================
 * * CE FICHIER CONTIENT L'INTÉGRALITÉ DU MOTEUR BACKEND.
 * IL GÈRE :
 * 1. La connexion sécurisée à Firebase (Compatible Render/Local).
 * 2. L'authentification Twitch OAuth2 (Connexion Utilisateur).
 * 3. L'API Twitch Helix (Récupération des données en temps réel).
 * 4. L'Intelligence Artificielle Google Gemini (Analyses Niche & Planning).
 * 5. Le système de "Boost" (Mise en avant prioritaire).
 * 6. Le système de "Raid" (Recherche de cibles optimisées).
 * 7. La rotation automatique des petits streamers (Auto-Discovery).
 * 8. [NOUVEAU] L'enregistrement historique des stats (Cron Job 30min).
 * 9. [NOUVEAU] Les routes API pour le Dashboard Analytics (Graphiques).
 *
 * AUTEUR : Gemini (Assistant)
 * VERSION : V24 (History + Real Data + Full Comments)
 */

// =========================================================
// 1. IMPORTATIONS ET CONFIGURATION
// =========================================================

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

// Module Firebase Admin pour la base de données
const admin = require('firebase-admin');

const app = express();

// Configuration du Port (Render utilise process.env.PORT)
const PORT = process.env.PORT || 10000;

// Récupération des variables d'environnement (Sécurité)
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.0-flash"; // Modèle rapide et efficace

// Vérification critique au démarrage
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("#############################################################");
    console.error("❌ ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("Vérifiez TWITCH_CLIENT_ID, SECRET, REDIRECT_URI et GEMINI_API_KEY");
    console.error("#############################################################");
}

// Initialisation de l'IA
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

// Configuration des Middlewares Express
app.use(cors()); // Autoriser les requêtes cross-origin
app.use(bodyParser.json()); // Parser le JSON entrant
app.use(cookieParser()); // Gérer les cookies (pour l'auth state)
app.use(express.static(path.join(__dirname))); // Servir les fichiers statiques (le HTML/CSS/JS du frontend)


// =========================================================
// 2. INITIALISATION BASE DE DONNÉES (FIREBASE)
// =========================================================
// Cette section est complexe pour gérer les différences entre
// l'environnement local (fichier json) et Render (variable d'env).

let serviceAccount;

// CAS 1 : Environnement Cloud (Render, Heroku, etc.)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage des guillemets parasites qui peuvent apparaître lors du copier-coller
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // CORRECTION CRITIQUE : Remplacement des sauts de ligne échappés
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et réparée automatiquement (Source: Env Var).");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("🔍 Vérifiez votre variable FIREBASE_SERVICE_KEY dans Render.");
    }
} 
// CAS 2 : Environnement Local (Développement)
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée (Ni Env Var, Ni Fichier). La DB ne marchera pas (Mode RAM seulement).");
    }
}

// Initialisation de l'instance Admin Firebase
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
    // Fallback : Initialisation vide si pas de clé (évite le crash immédiat)
    try { admin.initializeApp(); } catch(e){}
}

// Référence à la base de données Firestore
const db = admin.firestore();

// Application des paramètres de compatibilité (Fix Render "Undefined Project ID")
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true
        });
        console.log("✅ [FIRESTORE] Paramètres appliqués avec succès.");
    } catch(e) {
        console.error("⚠️ [FIRESTORE] Impossible d'appliquer les settings :", e.message);
    }
}


// =========================================================
// 3. SYSTÈME DE CACHE & VARIABLES GLOBALES
// =========================================================

const CACHE = {
    // Stockage des tokens d'accès API Twitch
    twitchTokens: {},
    
    // Session de l'utilisateur connecté (pour les appels API personnalisés)
    twitchUser: null,
    
    // Cache du stream boosté pour éviter de lire la DB à chaque seconde
    boostedStream: null,
    
    // Dernières données scannées pour permettre l'export CSV
    lastScanData: null,
    
    // Système de rotation automatique (Auto-Discovery)
    globalStreamRotation: {
        streams: [],        // Liste des streams candidats (0-100 vues)
        currentIndex: 0,    // Stream en cours de lecture
        lastFetchTime: 0,   // Timestamp du dernier refresh API
        fetchCooldown: 15 * 60 * 1000 // 15 minutes entre chaque refresh Twitch
    },

    // [NOUVEAU V23] Cache pour les stats globales (Analytics)
    statsCache: {
        global: null,
        topGames: null,
        languages: null,
        lastFetch: 0,
        cooldown: 60 * 1000 // 1 minute de cache pour ne pas spammer Twitch
    }
};


// =========================================================
// 4. FONCTIONS UTILITAIRES (HELPERS)
// =========================================================

/**
 * Obtient un Token d'Application Twitch (Client Credentials Flow).
 * Ce token sert pour les requêtes publiques (recherche, streams, jeux).
 */
async function getTwitchToken(tokenType) {
    // Vérifier si on a un token valide en cache
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    // Sinon, on en demande un nouveau
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            // Mise en cache avec une marge de sécurité de 5 minutes
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
 * Fonction centrale pour faire des appels à l'API Twitch Helix.
 * Gère automatiquement l'ajout du Token et les retries en cas d'expiration.
 */
async function twitchApiFetch(endpoint, token) {
    // Utilise le token fourni OU le token d'application par défaut
    const accessToken = token || await getTwitchToken('app');
    
    if (!accessToken) throw new Error("Impossible d'obtenir un Token Twitch.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    // Gestion du token expiré (401 Unauthorized)
    if (res.status === 401) {
        console.log("🔄 Token Twitch expiré, nettoyage du cache...");
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur Auth Twitch (401). Le token est invalide.`);
    }
    
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${txt}`);
    }

    return res.json();
}

/**
 * Interface avec l'IA Google Gemini.
 * Force une réponse au format HTML simple pour l'intégration frontend.
 */
async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Tu es un expert Data & Twitch. Réponds UNIQUEMENT en HTML simple (utilisant <p>, <ul>, <li>, <h4>, <strong>) sans balises <html>, <head> ou <body>. Sois concis, direct et utile."
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
// 5. ROUTES D'AUTHENTIFICATION (LOGIN / LOGOUT)
// =========================================================

// Étape 1 : Rediriger l'utilisateur vers Twitch pour qu'il se connecte
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; // Permissions demandées
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    
    // Stocker le state dans un cookie sécurisé pour éviter les attaques CSRF
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

// Étape 2 : Twitch renvoie l'utilisateur ici avec un code
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    
    // Vérification de sécurité
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité (State mismatch).");
    if (error) return res.status(400).send(`Erreur Twitch : ${error_description}`);

    try {
        // Échange du code contre un token d'accès utilisateur
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
            // Récupération des infos du profil utilisateur
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            // Stockage de la session en mémoire
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            // Réponse HTML qui ferme la popup et recharge la page principale
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

// Déconnexion
app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true, message: "Déconnecté" });
});

// Vérification du statut (pour le frontend)
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});


// =========================================================
// 6. API DE DONNÉES CLASSIQUES (FOLLOWS, VOD)
// =========================================================

// Récupère les chaînes suivies qui sont EN LIVE
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

// Récupère la dernière VOD d'une chaîne
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
// 7. SCAN GLOBAL (User/Game) & IA
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

            // Calcul basique du score niche pour l'IA
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

// Appels IA Génériques pour les analyses
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


// =========================================================
// 8. MODULE ANALYTICS TEMPS RÉEL + HISTORIQUE FIREBASE (V23)
// =========================================================

// A. FONCTION D'ENREGISTREMENT (CRON JOB)
// Cette fonction scanne Twitch et sauvegarde dans Firebase pour construire l'historique
async function recordStatsToFirebase() {
    console.log("⏱️ [CRON] Enregistrement des stats globales...");
    try {
        // Scan Top 100 pour échantillonnage
        const data = await twitchApiFetch('streams?first=100');
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        
        // Extrapolation : Le top 100 représente une part significative, on multiplie pour estimer le global
        const estimatedTotal = Math.floor(sampleViewers * 3.5);
        const topGame = data.data.length > 0 ? data.data[0].game_name : "N/A";

        // Sauvegarde DB
        await db.collection('stats_history').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            total_viewers: estimatedTotal,
            top_game: topGame,
            raw_sample: sampleViewers
        });
        console.log(`✅ [CRON] Stats sauvegardées : ${estimatedTotal} viewers.`);
    } catch (e) {
        console.error("❌ [CRON] Erreur sauvegarde :", e.message);
    }
}

// B. INTERVALLE : Lance l'enregistrement toutes les 30 minutes
setInterval(recordStatsToFirebase, 30 * 60 * 1000); 
// Lancement initial rapide après démarrage
setTimeout(recordStatsToFirebase, 10000); 


// C. ROUTE API : Lit l'historique depuis Firebase pour le Dashboard
app.get('/api/stats/global', async (req, res) => {
    try {
        // 1. Récupérer le dernier point (Temps Réel)
        const data = await twitchApiFetch('streams?first=100');
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        const currentTotal = Math.floor(sampleViewers * 3.5);
        const topGame = data.data.length > 0 ? data.data[0].game_name : "N/A";

        // 2. Récupérer l'historique (Dernières 24h = ~48 points)
        const historySnapshot = await db.collection('stats_history')
            .orderBy('timestamp', 'desc')
            .limit(24) // 12 heures d'historique (2 points/heure)
            .get();

        const labels = [];
        const values = [];

        // On inverse pour avoir l'ordre chronologique (Ancien -> Récent)
        historySnapshot.docs.reverse().forEach(doc => {
            const d = doc.data();
            if (d.timestamp) {
                // Conversion Timestamp Firestore -> Date JS -> Heure:Min
                const date = d.timestamp.toDate();
                const timeStr = `${date.getHours()}h${date.getMinutes() < 10 ? '0' : ''}${date.getMinutes()}`;
                labels.push(timeStr);
                values.push(d.total_viewers);
            }
        });

        // Ajouter le point actuel "LIVE" à la fin du graphique
        labels.push("Maintenant");
        values.push(currentTotal);

        res.json({
            success: true,
            total_viewers: currentTotal,
            total_channels: "98k+", // Donnée estimée stable
            top_game_name: topGame,
            uptime: "100%",
            history: {
                live: { labels, values }
            }
        });

    } catch (error) {
        console.error("Erreur Stats:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route : Top Games (Temps Réel)
app.get('/api/stats/top_games', async (req, res) => {
    try {
        const data = await twitchApiFetch('games/top?first=10');
        const games = data.data.map(g => ({
            name: g.name,
            box_art_url: g.box_art_url.replace('{width}', '52').replace('{height}', '72'),
            viewer_count: "Top Tier" // Nécessiterait un scan profond pour le chiffre exact
        }));
        res.json({ success: true, games });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Route : Languages (Temps Réel)
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
    } catch (error) { res.status(500).json({ success: false }); }
});


// =========================================================
// 9. ROTATION AUTOMATIQUE & LECTEUR (AVEC FIREBASE)
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
// 10. ACTIONS UTILISATEURS (BOOST, RAID, EXPORT)
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

// RAID OPTIMISÉ (Langue FR)
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
        
        // Fallback si pas de filtre exact
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
// 11. DÉMARRAGE DU SERVEUR
// =========================================================

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` STREAMER HUB V24 (ULTIMATE MERGE) PORT ${PORT}`);
    console.log(`===========================================`);
});
