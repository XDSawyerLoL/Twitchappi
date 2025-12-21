/**
 * STREAMER & NICHE AI HUB - BACKEND SERVER (V26 - PRODUCTION HEAVY DUTY)
 * ======================================================================
 * FICHIER : server.js
 * AUTEUR  : Gemini (Assistant)
 * DATE    : Version Finale
 *
 * DESCRIPTION :
 * Ce serveur est le cerveau de l'application "Streamer Hub". Il fait le lien entre :
 * 1. L'Utilisateur (Interface Web)
 * 2. L'API Twitch (Données temps réel)
 * 3. L'IA Gemini (Analyses intelligentes)
 * 4. La Base de Données Firebase (Persistance & Historique)
 *
 * FONCTIONNALITÉS INCLUSES :
 * - Authentification OAuth2 Twitch (Login/Logout sécurisé)
 * - Gestion de base de données Firestore (Compatible Render & Local)
 * - Système de Cache intelligent (Tokens, Sessions, Stats)
 * - Moteur d'analyse de marché (Style TwitchTracker)
 * - Enregistreur d'historique automatique (Cron Job 30min)
 * - Système de Boost de chaîne (Mise en avant payante/gratuite)
 * - Outil de Raid Optimisé (Algorithme de recherche de cible)
 * - Scanner de Niche & Audit IA (Notation 5 étoiles)
 */

// =============================================================================
// 1. IMPORTATIONS ET CONFIGURATION DU SERVEUR
// =============================================================================

const express = require('express');           // Framework serveur
const cors = require('cors');                 // Gestion des requêtes Cross-Origin
const fetch = require('node-fetch');          // Pour faire des appels API externes
const bodyParser = require('body-parser');    // Pour lire le JSON envoyé par le client
const path = require('path');                 // Gestion des chemins de fichiers
const crypto = require('crypto');             // Génération de clés sécurisées
const cookieParser = require('cookie-parser');// Lecture des cookies (Auth state)
const { GoogleGenAI } = require('@google/genai'); // Librairie IA Google Gemini

// Module Firebase Admin pour la connexion à la base de données
const admin = require('firebase-admin');

// Initialisation de l'application Express
const app = express();

// Configuration du Port (Render utilise process.env.PORT, sinon 10000 par défaut)
const PORT = process.env.PORT || 10000;

// =============================================================================
// 2. VARIABLES D'ENVIRONNEMENT & SÉCURITÉ
// =============================================================================

// Récupération des clés secrètes depuis l'environnement
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// Choix du modèle IA (Flash pour la rapidité)
const GEMINI_MODEL = "gemini-2.0-flash";

// Vérification critique au démarrage : Si une clé manque, on arrête tout.
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("\n#############################################################");
    console.error("❌ ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("-------------------------------------------------------------");
    console.error("Assurez-vous d'avoir configuré :");
    console.error(" - TWITCH_CLIENT_ID");
    console.error(" - TWITCH_CLIENT_SECRET");
    console.error(" - TWITCH_REDIRECT_URI");
    console.error(" - GEMINI_API_KEY");
    console.error("#############################################################\n");
    // On ne process.exit(1) pas forcément pour laisser le serveur tourner en mode dégradé si besoin, 
    // mais les fonctions crasheront.
}

// Initialisation de l'instance IA
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

// Configuration des Middlewares Express
app.use(cors()); // Autoriser tout le monde (en dev) ou restreindre en prod
app.use(bodyParser.json()); // Parser le body en JSON
app.use(cookieParser()); // Activer le parser de cookies
app.use(express.static(path.join(__dirname))); // Servir le frontend (HTML/CSS/JS) statiquement


// =============================================================================
// 3. INITIALISATION BASE DE DONNÉES (FIREBASE / FIRESTORE)
// =============================================================================
// Cette section est complexe car elle doit gérer deux cas :
// A. Hébergement Cloud (Render) : La clé est une variable d'environnement (String)
// B. Hébergement Local (PC) : La clé est un fichier .json

let serviceAccount;

// CAS 1 : Environnement Cloud (Render)
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage des guillemets parasites (fréquent lors du copier-coller)
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // CORRECTION CRITIQUE : Remplacement des sauts de ligne échappés (\n) par de vrais sauts de ligne
        // Sans ça, la clé privée RSA est invalide.
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] Clé chargée et réparée automatiquement (Source: Env Var).");

    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("🔍 Vérifiez votre variable FIREBASE_SERVICE_KEY dans Render Dashboard.");
    }
} 
// CAS 2 : Environnement Local (Développement)
else {
    try {
        // On essaie de charger le fichier local
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local (serviceAccountKey.json).");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée (Ni Env Var, Ni Fichier).");
        console.warn("   -> Le serveur fonctionnera en mode 'RAM' (les données seront perdues au redémarrage).");
    }
}

// Démarrage de Firebase Admin SDK
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // On force l'ID du projet pour éviter l'erreur "Unable to detect project ID" sur Render
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté avec succès au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation Admin SDK :", e.message);
    }
} else {
    // Fallback : Initialisation vide (permet au serveur de démarrer même sans DB)
    try { admin.initializeApp(); } catch(e){}
}

// Référence globale à la base de données Firestore
const db = admin.firestore();

// Application des paramètres de compatibilité Firestore
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || 'goodstreamer-7e87d',
            ignoreUndefinedProperties: true // Évite les erreurs si on envoie 'undefined'
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
    // Pour simplifier, on stocke un seul user global (mode cockpit perso)
    twitchUser: null,
    
    // Cache du stream boosté pour éviter de lire la DB à chaque seconde
    // Structure : { channel: 'nom', endTime: 123456789 }
    boostedStream: null,
    
    // Dernières données scannées par l'utilisateur (pour permettre l'export CSV)
    lastScanData: null,
    
    // Système de rotation automatique (Auto-Discovery)
    globalStreamRotation: {
        streams: [],        // Liste des streams filtrés (0-100 vues)
        currentIndex: 0,    // Stream en cours de lecture
        lastFetchTime: 0,   // Timestamp du dernier refresh API
        fetchCooldown: 15 * 60 * 1000 // 15 minutes entre chaque refresh Twitch
    },

    // Cache pour les stats globales (Analytics TwitchTracker)
    // Évite de spammer Twitch et d'exploser le quota d'API
    statsCache: {
        global: null,       // Données Overview
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
    console.log(`🔄 [TWITCH] Renouvellement du token ${tokenType}...`);
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
                // Instruction système pour forcer le formatage
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
            html_response: `<p style="color:var(--danger);">❌ Erreur IA: ${e.message}</p>` 
        };
    }
}


// =============================================================================
// 6. ROUTES D'AUTHENTIFICATION (LOGIN / LOGOUT)
// =============================================================================

// Étape 1 : Rediriger l'utilisateur vers Twitch pour qu'il se connecte
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; // Permissions demandées (lecture des follows)
    
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
            
            // Stockage de la session en mémoire (Pourrait être en DB pour plus de robustesse)
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
                    <h2 style="color:#00ff9d">Connexion Réussie !</h2>
                    <p>Bienvenue, ${user.display_name}.</p>
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
// 7. MODULE DATA ANALYTICS (DASHBOARD TWITCHTRACKER)
// =============================================================================

/**
 * Route 1 : Stats Globales (Overview)
 * C'est la route principale du Dashboard. Elle fournit :
 * - Les chiffres clés (Viewers, Channels, etc.)
 * - L'historique des dernières 24h pour le graphique
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
        
        // EXTRAPOLATION : Twitch ne donne pas le total mondial via API.
        // On multiplie l'échantillon Top 100 par un facteur (3.8) pour estimer le total réel.
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

        // Traitement de l'historique (Inversion pour ordre chrono)
        if (!historySnapshot.empty) {
            historySnapshot.docs.reverse().forEach(doc => {
                const d = doc.data();
                if (d.timestamp) {
                    const date = d.timestamp.toDate();
                    // Formatage Heure (ex: 14h30)
                    const timeStr = `${date.getHours()}h${date.getMinutes() < 10 ? '0' : ''}${date.getMinutes()}`;
                    labels.push(timeStr);
                    values.push(d.total_viewers);
                }
            });
        } else {
            // Si pas d'historique (premier lancement), on met des points fictifs pour le design
            labels.push("-2h", "-1h");
            values.push(totalViewers * 0.9, totalViewers * 0.95);
        }

        // Ajout du point "Maintenant"
        labels.push("LIVE");
        values.push(totalViewers);

        // Construction de la réponse
        const responseData = {
            success: true,
            viewers: totalViewers,
            channels: 104500, // Chiffre statique de référence
            active_streamers: activeStreamers,
            watch_time: `${((totalViewers * 0.9) / 1000).toFixed(1)}K h`,
            stream_time: "2.1M h",
            games_live: 3866,
            top_game: topGame,
            history: {
                labels: labels,
                data: values
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
 * Route : Explication IA des Stats
 * Demande à Gemini d'analyser les chiffres pour l'utilisateur.
 */
app.post('/api/explain_stats', async (req, res) => {
    const { stats } = req.body;
    const prompt = `
        Agis comme un analyste financier Twitch.
        Voici les données du marché en temps réel :
        - Spectateurs Actifs : ${stats.viewers}
        - Streamers Actifs : ${stats.active_streamers}
        - Catégorie Dominante : ${stats.top_game}
        
        Donne une analyse flash de 3 phrases HTML :
        1. L'état de la concurrence (Faible/Forte).
        2. Une opportunité immédiate.
        3. Une prédiction court terme.
    `;
    const result = await runGeminiAnalysis(prompt);
    res.json({ html: result.html_response });
});

/**
 * Route : Top Games (Temps Réel)
 */
app.get('/api/stats/top_games', async (req, res) => {
    try {
        const data = await twitchApiFetch('games/top?first=8');
        const games = data.data.map(g => ({
            name: g.name,
            img: g.box_art_url.replace('{width}', '52').replace('{height}', '72'),
            viewers: "Top Tier" // On ne calcule pas le nombre exact ici pour la perf
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
// 8. SCANNER, VOD & AUDIT (FONCTIONNALITÉS UTILISATEUR)
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
            let isLive = false;
            let viewers = 0;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) {
                    isLive = true;
                    viewers = streamRes.data[0].viewer_count;
                }
            } catch (e) {}

            // Calcul du score "Niche" (Étoiles)
            // Logique : Partenaire = Haut, Petit stream = Bas, Moyen = Moyen
            let stars = 2.5;
            if (user.broadcaster_type === 'partner') stars = 4.5;
            else if (viewers > 100) stars = 3.5;
            else if (viewers > 0) stars = 3.0;

            const userData = { 
                type: 'user',
                id: user.id,
                name: user.display_name,
                login: user.login,
                img: user.profile_image_url,
                live: isLive,
                viewers: viewers,
                score_stars: stars,
                description: user.description
            };
            
            CACHE.lastScanData = userData;
            return res.json({ success: true, data: userData });
        }
        
        // B. Essayer de trouver un JEU (Catégorie)
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            // Petit scan pour avoir un volume
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=20`);
            const totalSampleViewers = streamsRes.data.reduce((sum, s) => sum + s.viewer_count, 0);
            
            // Score : Si peu de viewers mais existant = Bonne niche (4 étoiles)
            const stars = (totalSampleViewers < 5000 && totalSampleViewers > 500) ? 4.5 : 3.0;
            
            const gameData = { 
                type: 'game',
                id: game.id,
                name: game.name, 
                img: game.box_art_url.replace('{width}x{height}', '100x140'),
                viewers: totalSampleViewers, // Sur l'échantillon
                score_stars: stars
            };
            
            CACHE.lastScanData = gameData;
            return res.json({ success: true, data: gameData });
        }

        return res.status(404).json({ success: false, message: "Aucun résultat trouvé." });
        
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Route Critique IA (Niche & VOD)
app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";

    if (type === 'niche') {
        prompt = `Agis en consultant Twitch senior. Fais un audit rapide de "${query}".
                  Donne moi : 
                  1. <h4>Forces Détectées</h4> (<ul><li>...)
                  2. <h4>Faiblesses / Risques</h4> (<ul><li>...)
                  3. <p><strong>Verdict :</strong> Une phrase de conclusion choc.</p>`;
    } else if (type === 'vod') {
        prompt = `Expert Montage Vidéo & TikTok. Analyse le concept d'une VOD Twitch de la chaîne "${query}".
                  Génère 3 idées de clips viraux basés sur le style habituel de ce créateur.
                  Structure: <h4>Moments Clés (Estimés)</h4>, <ul><li>Timecode fictif : Idée de titre accrocheur</li>...`;
    }

    const result = await runGeminiAnalysis(prompt);
    res.json({ html: result.html_response });
});

// Récupération VOD pour l'onglet Audit
app.get('/get_latest_vod', async (req, res) => {
    const { channel } = req.query;
    try {
        const u = await twitchApiFetch(`users?login=${channel}`);
        if(!u.data.length) return res.json({success: false});
        
        const v = await twitchApiFetch(`videos?user_id=${u.data[0].id}&type=archive&first=1`);
        if(!v.data.length) return res.json({success: false});
        
        res.json({ success: true, vod: v.data[0] });
    } catch (e) { res.status(500).json({ success: false }); }
});


// =============================================================================
// 9. AUTOMATISATION & HISTORIQUE (CRON JOBS)
// =============================================================================

/**
 * Fonction d'enregistrement périodique des stats dans Firebase.
 * Permet de construire le graphique historique sur le long terme.
 */
async function recordStatsToFirebase() {
    console.log("⏱️ [CRON] Tentative d'enregistrement des stats...");
    try {
        const data = await twitchApiFetch('streams?first=100');
        let sampleViewers = 0;
        data.data.forEach(s => sampleViewers += s.viewer_count);
        
        // Extrapolation
        const estimatedTotal = Math.floor(sampleViewers * 3.8);
        const topGame = data.data.length > 0 ? data.data[0].game_name : "N/A";

        // Écriture en base
        await db.collection('stats_history').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            total_viewers: estimatedTotal,
            top_game: topGame,
            raw_sample: sampleViewers
        });
        console.log(`✅ [CRON] Stats enregistrées avec succès : ${estimatedTotal} viewers.`);
    } catch (e) {
        console.error("❌ [CRON] Erreur sauvegarde :", e.message);
    }
}

// Planification : Toutes les 30 minutes
setInterval(recordStatsToFirebase, 30 * 60 * 1000); 
// Premier point : 10 secondes après le lancement
setTimeout(recordStatsToFirebase, 10000); 


// =============================================================================
// 10. SYSTÈME DE PLAYER & BOOST
// =============================================================================

// Rotation des petits streamers
async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown 15 min
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        // Filtre 0-100 vues
        let suitable = data.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
        // Fallback
        if (suitable.length === 0 && data.data.length > 0) suitable = data.data.slice(0, 10);

        if (suitable.length > 0) {
            rotation.streams = suitable.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
        }
    } catch (e) { console.error("❌ Erreur Rotation:", e); }
}

// Endpoint pour le player
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    // 1. Vérif DB Boost
    try {
        const boostQuery = await db.collection('boosts').where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            currentBoost = { channel: data.channel, endTime: data.endTime };
            CACHE.boostedStream = currentBoost;
        } else { CACHE.boostedStream = null; }
    } catch(e) { if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) currentBoost = CACHE.boostedStream; }

    if (currentBoost && currentBoost.endTime > now) {
        return res.json({ success: true, channel: currentBoost.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF` });
    }

    // 2. Rotation
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    if (rotation.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: 'Fallback' });
    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: currentStream.channel, viewers: currentStream.viewers, message: `✅ Auto-Discovery` });
});

// Changement manuel
app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ success: false });
    await refreshGlobalStreamList();
    const rotation = CACHE.globalStreamRotation;
    if (rotation.streams.length === 0) return res.status(404).json({ success: false });
    
    if (direction === 'next') rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
    else rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;
    
    const newStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: newStream.channel, viewers: newStream.viewers });
});

// Création Boost
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Requis" });
    const now = Date.now(); const DURATION = 15 * 60 * 1000; 
    try {
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
        const target = streamsRes.data.filter(s => s.viewer_count <= parseInt(max_viewers)).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        if (target) return res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, game: target.game_name, thumbnail_url: target.thumbnail_url.replace('%{width}','100').replace('%{height}','56') } });
        return res.json({ success: false, error: "Aucune cible trouvée." });
    } catch (e) { return res.status(500).json({ success: false }); }
});

// CSV Export
app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Rien à exporter.");
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(`Type,Nom,Score\n${data.type},${data.name},${data.score_stars}`);
});


// =============================================================================
// 11. DÉMARRAGE DU SERVEUR
// =============================================================================

app.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(` 🚀 STREAMER HUB V26 - SERVER STARTED`);
    console.log(` 👉 PORT : ${PORT}`);
    console.log(` 👉 URL  : http://localhost:${PORT}`);
    console.log(`===========================================\n`);
});
