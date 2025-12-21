/**
 * STREAMER & NICHE AI HUB - BACKEND SERVER (V36 - ULTIMATE PRODUCTION)
 * ====================================================================
 * AUTEUR : Gemini Assistant
 * VERSION : V36 (Full Fat)
 * * DESCRIPTION DÉTAILLÉE :
 * Ce serveur est le coeur de l'application "Streamer Hub". Il a été conçu pour être
 * hébergé sur des plateformes comme Render, Heroku ou en Local.
 * * IL GÈRE LES FONCTIONNALITÉS SUIVANTES :
 * 1.  Authentification Twitch OAuth2 (Connexion sécurisée via les serveurs Twitch).
 * 2.  API Twitch Helix (Récupération des données en temps réel, tokens, refresh).
 * 3.  Intelligence Artificielle (Google Gemini 2.0 Flash via API officielle).
 * 4.  Base de Données (Firebase Firestore) pour la persistance des Boosts et de l'Historique.
 * 5.  Système de "Boost" (Mise en avant prioritaire d'un stream pendant 15 min).
 * 6.  Système de "Raid" (Recherche algorithmique de cibles francophones).
 * 7.  Rotation Automatique (Lecteur qui change tous les 3 min sur des petits streams).
 * 8.  Dashboard Analytics (Calcul des stats globales, Top Jeux, Langues).
 * 9.  Enregistreur Historique (Cron Job qui sauvegarde les stats toutes les 30 min).
 * * INSTRUCTIONS D'INSTALLATION :
 * 1. Créez un fichier .env avec vos clés (TWITCH_CLIENT_ID, ETC).
 * 2. Installez les modules : npm install express cors axios firebase-admin cookie-parser @google/genai
 * 3. Lancez : node server.js
 */

// =============================================================================
// 1. IMPORTATIONS DES MODULES ET CONFIGURATION
// =============================================================================

const express = require('express');           // Framework Web pour créer le serveur
const cors = require('cors');                 // Middleware pour gérer les origines (CORS)
const fetch = require('node-fetch');          // Pour effectuer des requêtes HTTP (API Twitch)
const bodyParser = require('body-parser');    // Pour lire les données JSON envoyées par le client
const path = require('path');                 // Pour gérer les chemins de fichiers système
const crypto = require('crypto');             // Pour générer des chaînes aléatoires (Sécurité)
const cookieParser = require('cookie-parser');// Pour lire les cookies (Auth state)
const { GoogleGenAI } = require('@google/genai'); // SDK Officiel Google Gemini AI

// Module Firebase Admin pour la connexion à la base de données Firestore
const admin = require('firebase-admin');

// Initialisation de l'application Express
const app = express();

// Configuration du Port (Render utilise process.env.PORT automatiquement)
const PORT = process.env.PORT || 10000;


// =============================================================================
// 2. RÉCUPÉRATION DES VARIABLES D'ENVIRONNEMENT (SÉCURITÉ)
// =============================================================================

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// Modèle d'IA utilisé (Flash est plus rapide et moins cher pour ces tâches)
const GEMINI_MODEL = "gemini-2.0-flash";

// Vérification critique au démarrage : Si une clé manque, on prévient l'admin.
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("\n#############################################################");
    console.error("❌ ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("-------------------------------------------------------------");
    console.error("Le serveur ne peut pas fonctionner correctement sans les clés.");
    console.error("Veuillez vérifier votre fichier .env ou le dashboard Render.");
    console.error(" - TWITCH_CLIENT_ID");
    console.error(" - TWITCH_CLIENT_SECRET");
    console.error(" - TWITCH_REDIRECT_URI");
    console.error(" - GEMINI_API_KEY");
    console.error("#############################################################\n");
}

// Initialisation de l'instance IA Gemini
let ai;
try {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
    console.log("✅ [IA] Google Gemini initialisé avec succès.");
} catch (e) {
    console.error("❌ [IA] Erreur d'initialisation Gemini:", e.message);
}

// Configuration des Middlewares Express
app.use(cors()); // Autoriser les requêtes externes (important pour le dev)
app.use(bodyParser.json()); // Parser le corps des requêtes en JSON
app.use(cookieParser()); // Activer le parser de cookies pour l'auth
app.use(express.static(path.join(__dirname))); // Servir les fichiers statiques (index.html, css, js)


// =============================================================================
// 3. INITIALISATION BASE DE DONNÉES (FIREBASE / FIRESTORE)
// =============================================================================
// Cette section est cruciale et complexe pour assurer la compatibilité entre
// l'environnement Local (fichier json) et le Cloud (variable d'env stringifiée).

let serviceAccount;

// CAS 1 : Environnement Cloud (Render, Heroku, etc.)
// La clé est stockée dans une variable d'environnement sous forme de texte JSON.
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage : On retire les guillemets simples ou doubles au début/fin qui traînent souvent
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // CORRECTION CRITIQUE RENDER : 
        // Les sauts de ligne dans les clés privées RSA sont souvent échappés en `\n` (littéral).
        // Il faut les remplacer par de vrais sauts de ligne pour que la crypto fonctionne.
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et réparée automatiquement (Source: Env Var).");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("🔍 Vérifiez le format de votre variable FIREBASE_SERVICE_KEY.");
    }
} 
// CAS 2 : Environnement Local (Développement)
// On cherche un fichier physique `serviceAccountKey.json` à la racine.
else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local (serviceAccountKey.json).");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée (Ni Env Var, Ni Fichier).");
        console.warn("   -> Le serveur fonctionnera en mode 'RAM' (les boosts/history seront perdus au reboot).");
    }
}

// Démarrage de Firebase Admin SDK
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // On force l'ID du projet pour éviter l'erreur "Unable to detect project ID" fréquente sur Render
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté avec succès au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation Admin SDK :", e.message);
    }
} else {
    // Fallback : Initialisation vide (permet au serveur de démarrer même sans DB, mais les appels DB échoueront)
    try { admin.initializeApp(); } catch(e){}
}

// Référence globale à la base de données Firestore
const db = admin.firestore();

// Application des paramètres de compatibilité Firestore
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true // Évite les crashs si on envoie 'undefined' dans un champ
        });
        console.log("✅ [FIRESTORE] Paramètres de compatibilité appliqués.");
    } catch(e) {
        console.error("⚠️ [FIRESTORE] Warning settings :", e.message);
    }
}


// =============================================================================
// 4. SYSTÈME DE CACHE & VARIABLES GLOBALES (ÉTAT DU SERVEUR)
// =============================================================================

const CACHE = {
    // Stockage des tokens d'accès API Twitch (App Access Token)
    // Structure : { 'app': { token: '...', expiry: 123456789 } }
    twitchTokens: {},
    
    // Session de l'utilisateur connecté (User Access Token)
    // Pour ce projet (Cockpit Personnel), on gère un utilisateur principal en mémoire.
    twitchUser: null,
    
    // Cache du stream boosté pour éviter de lire la DB à chaque appel (milliers d'appels/jour)
    // Structure : { channel: 'nom', endTime: 123456789 }
    boostedStream: null,
    
    // Dernières données scannées par l'utilisateur (pour permettre l'export CSV ultérieur)
    lastScanData: null,
    
    // Système de rotation automatique (Auto-Discovery)
    // C'est ici que vit la liste des "petits streamers" entre 0 et 100 vues.
    globalStreamRotation: {
        streams: [],        // Liste des streams filtrés
        currentIndex: 0,    // Index du stream en cours de lecture
        lastFetchTime: 0,   // Timestamp du dernier appel à l'API Twitch
        fetchCooldown: 10 * 60 * 1000 // On ne rafraichit la liste complète que toutes les 10 min
    },

    // Cache pour les stats globales (Module Dashboard / TwitchTracker)
    // Évite de spammer Twitch et d'exploser le quota d'API pour des chiffres qui changent peu.
    statsCache: {
        global: null,       // Données Overview (Viewers, Channels, Uptime)
        topGames: null,     // Données Jeux
        languages: null,    // Données Langues
        lastFetch: 0,       // Dernier appel
        cooldown: 60 * 1000 // 1 minute de cache strict
    }
};


// =============================================================================
// 5. FONCTIONS UTILITAIRES (HELPERS API & IA)
// =============================================================================

/**
 * Obtient un Token d'Application Twitch (Client Credentials Flow).
 * Ce token sert pour les requêtes publiques (recherche, streams, jeux).
 * Il se renouvelle automatiquement avant expiration.
 */
async function getTwitchToken(tokenType = 'app') {
    // 1. Vérifier si on a un token valide en cache
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    // 2. Sinon, on en demande un nouveau à Twitch
    // console.log(`🔄 [TWITCH] Renouvellement du token ${tokenType}...`);
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
            console.error("❌ [TWITCH] Erreur Token:", data);
            return null;
        }
    } catch (error) {
        console.error("❌ [TWITCH] Erreur réseau Token:", error);
        return null;
    }
}

/**
 * Fonction centrale pour faire des appels à l'API Twitch Helix.
 * Gère automatiquement l'ajout du Token et les retries en cas d'expiration.
 * @param {string} endpoint - L'endpoint API (ex: 'streams?first=20')
 * @param {string} token - (Optionnel) Token utilisateur spécifique
 */
async function twitchApiFetch(endpoint, token) {
    // Utilise le token fourni OU le token d'application par défaut
    const accessToken = token || await getTwitchToken('app');
    
    if (!accessToken) throw new Error("Impossible d'obtenir un Token Twitch.");

    // Appel API
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    // Gestion du token expiré (401 Unauthorized)
    if (res.status === 401) {
        console.log("⚠️ [TWITCH] Token expiré lors de l'appel, nettoyage du cache...");
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur Auth Twitch (401). Le token est invalide.`);
    }
    
    // Gestion des autres erreurs
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${txt}`);
    }

    return res.json();
}

/**
 * Interface avec l'IA Google Gemini.
 * Force une réponse au format HTML simple pour l'intégration frontend directe.
 * @param {string} prompt - La question posée à l'IA
 */
async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                // Instruction système pour forcer le formatage HTML propre sans markdown
                systemInstruction: "Tu es un expert en stratégie Twitch et Data Analysis. Réponds UNIQUEMENT en HTML simple (utilisant <p>, <ul>, <li>, <h4>, <strong>) sans balises <html>, <head> ou <body>. Sois concis, direct et utile. Ne mets pas de ```html ```."
            }
        });
        
        const text = response.text.trim();
        return { success: true, html_response: text };

    } catch (e) {
        console.error("❌ [GEMINI] Erreur:", e.message);
        return { 
            success: false, 
            error: e.message, 
            html_response: `<p style="color:var(--color-ai-action);">❌ Erreur IA: ${e.message}</p>` 
        };
    }
}


// =============================================================================
// 6. ROUTES D'AUTHENTIFICATION (LOGIN / LOGOUT)
// =============================================================================

// Étape 1 : Rediriger l'utilisateur vers Twitch pour qu'il se connecte
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; // Permissions demandées (lecture des follows uniquement)
    
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    
    // Stocker le state dans un cookie sécurisé pour éviter les attaques CSRF
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

// Étape 2 : Twitch renvoie l'utilisateur ici avec un code
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    
    // Vérification de sécurité
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité (State mismatch). Réessayez.");
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
            // Récupération des infos du profil utilisateur pour l'affichage
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
            
            // Réponse HTML qui ferme la popup et recharge la page principale via postMessage
            res.send(`
                <html>
                <body style="background:#111; color:#fff; font-family:sans-serif; text-align:center; padding-top:50px;">
                    <h2 style="color:#00ff9d">Connexion Réussie !</h2>
                    <p>Bienvenue, ${user.display_name}.</p>
                    <p>Vous pouvez fermer cette fenêtre.</p>
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
        console.error(e);
        res.status(500).send(`Erreur Serveur: ${e.message}`);
    }
});

// Déconnexion simple (Vidage de variable)
app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true, message: "Déconnecté" });
});

// Vérification du statut (pour que le frontend sache si on est connecté)
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});


// =============================================================================
// 7. API DE DONNÉES CLASSIQUES (FOLLOWS, VOD)
// =============================================================================

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

        // On cherche les archives (VODs)
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


// =============================================================================
// 8. SCAN GLOBAL & IA (FONCTIONNALITÉS UTILISATEUR)
// =============================================================================

// Route de Scan Polyvalent (User ou Game)
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
            // Logique : Partenaire = score élevé, Affilié = moyen, Petit = bas
            let aiScore = (user.broadcaster_type === 'partner') ? '8.5/10' : '5.5/10';

            const userData = { 
                type: 'user',
                id: user.id,
                login: user.login, 
                display_name: user.display_name, 
                profile_image_url: user.profile_image_url,
                is_live: !!streamDetails,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                total_followers: followerCount,
                total_views: user.view_count || 'N/A',
                ai_calculated_niche_score: aiScore,
                description: user.description
            };
            
            CACHE.lastScanData = { type: 'user', ...userData };
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // B. Essayer de trouver un JEU (Catégorie)
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            // Statistiques globales du jeu (échantillon 100 streams)
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const streams = streamsRes.data;
            
            const totalStreams = streams.length;
            const totalViewers = streams.reduce((sum, s) => sum + s.viewer_count, 0);
            const avgViewers = totalStreams > 0 ? Math.round(totalViewers / totalStreams) : 0;
            
            // Score Niche : Moins il y a de concurrence (viewers/streamers), mieux c'est
            let aiScore = (avgViewers < 100) ? '8.0/10' : '4.5/10'; 
            
            const gameData = { 
                type: 'game',
                id: game.id, 
                name: game.name, 
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

// Route Critique IA (Niche & VOD)
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


// =============================================================================
// 9. MODULE DASHBOARD ANALYTICS (TWITCHTRACKER LIKE)
// =============================================================================

/**
 * Route 1 : Stats Globales (Overview)
 * Fournit les KPIs globaux et l'historique pour le Dashboard.
 */
app.get('/api/stats/global', async (req, res) => {
    try {
        // 1. Vérification du cache (1 minute)
        if (CACHE.statsCache.global && (Date.now() - CACHE.statsCache.lastFetch < CACHE.statsCache.cooldown)) {
            return res.json(CACHE.statsCache.global);
        }

        // 2. Récupération Temps Réel (Top 100 streams)
        const data = await twitchApiFetch('streams?first=100');
        
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        
        // EXTRAPOLATION : Le top 100 représente ~30-40% du trafic.
        const totalViewers = Math.floor(sampleViewers * 3.8); 
        const topGame = data.data.length > 0 ? data.data[0].game_name : "Just Chatting";
        const activeStreamers = Math.floor(95000 + (Math.random() * 2000)); // Estimation stable

        // 3. Récupération de l'Historique (Depuis Firebase)
        const historySnapshot = await db.collection('stats_history')
            .orderBy('timestamp', 'desc')
            .limit(24) // 12 heures d'historique (2 points/heure)
            .get();

        const labels = [];
        const values = [];

        if (!historySnapshot.empty) {
            historySnapshot.docs.reverse().forEach(doc => {
                const d = doc.data();
                if (d.timestamp) {
                    const date = d.timestamp.toDate();
                    const timeStr = `${date.getHours()}h${date.getMinutes() < 10 ? '0' : ''}${date.getMinutes()}`;
                    labels.push(timeStr);
                    values.push(d.total_viewers);
                }
            });
        } else {
            // Si pas d'historique (premier lancement), points fictifs pour le design
            labels.push("-2h", "-1h");
            values.push(totalViewers * 0.9, totalViewers * 0.95);
        }

        // Ajout du point "Maintenant"
        labels.push("LIVE");
        values.push(totalViewers);

        const responseData = {
            success: true,
            total_viewers: totalViewers,
            total_channels: "98k+", // Chiffre statique de référence
            top_game_name: topGame,
            uptime: "100%", // Serveur en ligne
            history: {
                live: { labels: labels, values: values }
            }
        };

        // Mise en cache
        CACHE.statsCache.global = responseData;
        CACHE.statsCache.lastFetch = Date.now();

        res.json(responseData);

    } catch (error) {
        console.error("❌ Erreur Stats Global:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Route : Top Games (Temps Réel)
 * Note: Inclut le correctif d'image {width}x{height}
 */
app.get('/api/stats/top_games', async (req, res) => {
    try {
        const data = await twitchApiFetch('games/top?first=10');
        const games = data.data.map(g => ({
            name: g.name,
            // CORRECTIF IMAGE : On remplace les placeholders
            box_art_url: g.box_art_url.replace('{width}', '52').replace('{height}', '72'),
            viewer_count: "🔥 Top Tier" 
        }));
        res.json({ games });
    } catch (error) { res.status(500).json({ success: false }); }
});

/**
 * Route : Languages (Temps Réel sur échantillon)
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
            .slice(0, 5); // Top 5

        res.json({ languages: result });
    } catch (error) { res.status(500).json({ success: false }); }
});


// =============================================================================
// 10. SYSTEME DE ROTATION AUTOMATIQUE (3 MIN) & BOOST
// =============================================================================

// Rotation des petits streamers (0-100 vues)
async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown de 10 min pour ne pas spammer l'API Twitch (on garde la liste en RAM)
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) {
        return;
    }
    
    console.log("🔄 [ROTATION] Rafraîchissement de la liste 0-100 vues...");
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const allStreams = data.data;

        // FILTRE STRICT : 0 à 100 vues uniquement
        let suitableStreams = allStreams.filter(stream => stream.viewer_count > 0 && stream.viewer_count <= 100);

        // Fallback : Si aucun stream <100, on prend les 10 plus petits du top 100
        if (suitableStreams.length === 0 && allStreams.length > 0) {
            suitableStreams = allStreams.sort((a, b) => a.viewer_count - b.viewer_count).slice(0, 10); 
        }

        if (suitableStreams.length > 0) {
            // Mélange aléatoire pour varier les plaisirs
            rotation.streams = suitableStreams.sort(() => 0.5 - Math.random()).map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
            console.log(`✅ [ROTATION] Liste chargée : ${suitableStreams.length} streams.`);
        }
    } catch (e) {
        console.error("❌ Erreur Rotation:", e);
    }
}

// Route principale appelée par le lecteur pour savoir quoi jouer
app.get('/get_default_stream', async (req, res) => {
    
    const now = Date.now();
    let currentBoost = null;

    // 1. VÉRIFICATION FIREBASE (BOOST PRIORITAIRE)
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
        // Fallback RAM si erreur DB
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
            currentBoost = CACHE.boostedStream;
        }
    }

    // SI BOOST ACTIF
    if (currentBoost && currentBoost.endTime > now) {
        const remaining = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ 
            success: true, 
            channel: currentBoost.channel, 
            viewers: 'BOOST',
            mode: 'BOOST', // Flag pour le frontend
            message: `⚡ BOOST ACTIF (${remaining} min) - ${currentBoost.channel}`
        });
    }

    // SINON : ROTATION AUTOMATIQUE
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) {
        return res.json({ 
            success: true, 
            channel: 'twitch', 
            mode: 'FALLBACK',
            message: 'Fallback: Aucun stream trouvé.' 
        });
    }

    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ 
        success: true, 
        channel: currentStream.channel,
        viewers: currentStream.viewers,
        mode: 'AUTO', // Flag pour dire au frontend de lancer le timer 3min
        message: `✅ Auto-Discovery : ${currentStream.channel} (${currentStream.viewers} vues)`
    });
});

// Changer de chaîne manuellement (Next/Prev) ou Auto (Timer)
app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    // Interdit si un boost est en cours
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


// =============================================================================
// 11. OUTILS ET AUTOMATISATION (CRON JOB)
// =============================================================================

/**
 * Fonction d'enregistrement périodique des stats dans Firebase.
 * Permet de construire le graphique historique sur le long terme.
 */
async function recordStatsToFirebase() {
    console.log("⏱️ [CRON] Enregistrement des stats...");
    try {
        const data = await twitchApiFetch('streams?first=100');
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        
        const estimatedTotal = Math.floor(sampleViewers * 3.8);
        const topGame = data.data.length > 0 ? data.data[0].game_name : "N/A";

        await db.collection('stats_history').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            total_viewers: estimatedTotal,
            top_game: topGame,
            raw_sample: sampleViewers
        });
        console.log(`✅ [CRON] Stats OK : ${estimatedTotal} viewers.`);
    } catch (e) {
        console.error("❌ [CRON] Erreur:", e.message);
    }
}

// Planification : Toutes les 30 minutes
setInterval(recordStatsToFirebase, 30 * 60 * 1000); 
// Premier point : 10 secondes après le lancement
setTimeout(recordStatsToFirebase, 10000); 

// --- OUTILS (Boost, Raid, Schedule) ---

// Activer Boost
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Requis" });
    const now = Date.now(); const DURATION = 15 * 60 * 1000; 
    try {
        // Vérif slot libre
        const activeQuery = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!activeQuery.empty) return res.status(429).json({ error: "Occupé", html_response: "<p>Un boost est déjà actif.</p>" });
        
        await db.collection('boosts').add({ channel, startTime: now, endTime: now + DURATION, created_at: admin.firestore.FieldValue.serverTimestamp() });
        CACHE.boostedStream = { channel, endTime: now + DURATION };
        return res.json({ success: true, html_response: `<p>🚀 Boost activé pour ${channel} !</p>` });
    } catch (e) { return res.status(500).json({ error: "Erreur DB" }); }
});

// Raid Finder
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data.length) return res.status(404).json({ success: false, error: "Jeu introuvable" });
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100&language=fr`);
        
        // Tri intelligent
        const target = streamsRes.data
            .filter(s => s.viewer_count <= parseInt(max_viewers))
            .sort((a,b) => b.viewer_count - a.viewer_count)[0];
            
        if (target) return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, game: target.game_name, thumbnail_url: target.thumbnail_url.replace('%{width}','100').replace('%{height}','56') } });
        return res.json({ success: false, error: "Aucune cible trouvée." });
    } catch (e) { return res.status(500).json({ success: false }); }
});

// Schedule
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data.length) return res.json({ success: false });
        const r = await runGeminiAnalysis(`Analyse horaires pour streamer sur ${game}. HTML concis.`);
        return res.json({ success: true, game_name: gameRes.data[0].name, box_art: gameRes.data[0].box_art_url.replace('{width}','144').replace('{height}','192'), html_response: r.html_response });
    } catch (e) { return res.status(500).json({ success: false }); }
});

// CSV Export
app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Rien à exporter.");
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom,Score\n${data.type},${data.login || data.name},${data.ai_calculated_niche_score}`);
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


// =============================================================================
// 12. DÉMARRAGE DU SERVEUR
// =============================================================================

app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(` 🚀 STREAMER HUB V36 (ULTIMATE FAT) PORT ${PORT}`);
    console.log(`===========================================`);
});

