/**
 * STREAMER & NICHE AI HUB - BACKEND (V20 - ULTIMATE FIX COMPLETE)
 * ===============================================================
 * Serveur Node.js/Express gérant :
 * 1. L'authentification Twitch (OAuth) avec fermeture propre des popups.
 * 2. L'API Twitch (Helix) pour les scans, raids et statuts.
 * 3. L'IA Google Gemini pour les analyses (Niche, Repurposing, Planning) avec GROUNDING (Google Search).
 * 4. La rotation automatique des streams (0-100 vues).
 * 5. Le système de Boost et de Raid optimisé via Firestore.
 * 6. PERSISTANCE : Connexion Firebase Blindée pour Render (Fix JSON & ProjectID).
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Requis pour la compatibilité des requêtes backend
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// --- AJOUT FIREBASE (COMPATIBLE RENDER & LOCAL) ---
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE (LE CORRECTIF V20)
// =========================================================
let serviceAccount;

// Cas 1 : Environnement de Production (Render)
// On nettoie la variable d'environnement pour éviter les erreurs de parsing
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY.trim();
        
        // 1. Nettoyage des guillemets parasites au début/fin souvent ajoutés par Render
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // 2. CORRECTION CRITIQUE RENDER : Remplacement des sauts de ligne littéraux
        // On s'assure que le JSON est valide avant le parse
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);
        
        // 3. Réparation de la clé privée après le parsing (Firebase a besoin des vrais \n)
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
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

// Démarrage de Firebase Admin avec gestion d'erreurs
if (serviceAccount) {
    try {
        // On évite les doubles initialisations si le serveur redémarre à chaud
        if (admin.apps.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                // On force l'ID du projet dès l'init pour aider Firebase
                projectId: serviceAccount.project_id 
            });
        }
        console.log(`✅ [FIREBASE] Connecté au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation Admin :", e.message);
    }
} else {
    // Initialisation vide (fallback) pour éviter de crasher le reste du serveur
    try { if (admin.apps.length === 0) admin.initializeApp(); } catch(e){}
}

// Initialisation de Firestore
const db = admin.firestore();

// --- LE FORÇAGE ULTIME (V20) ---
// On impose l'ID du projet dans les réglages de la DB pour contourner le bug Render "Unable to detect Project Id"
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

// =========================================================
// 1. CONFIGURATION ET VARIABLES D'ENVIRONNEMENT
// =========================================================

const app = express();
const PORT = process.env.PORT || 10000;

// Récupération des clés Twitch et Gemini
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; // Modèle supportant le Grounding (recherche Google)

// Vérification de sécurité au démarrage
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("#############################################################");
    console.error("ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("Vérifiez TWITCH_CLIENT_ID, SECRET, REDIRECT_URI et GEMINI_API_KEY");
    console.error("#############################################################");
}

// Middlewares Express
app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());
// Sert les fichiers statiques (HTML/CSS/JS client) depuis la racine du projet
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. SYSTÈME DE CACHE HYBRIDE (RAM + DB)
// =========================================================
const CACHE = {
    twitchTokens: {},       // Tokens d'application (App Access Token)
    twitchUser: null,       // Session utilisateur connecté (User Access Token)
    boostedStream: null,    // Le boost actif est stocké ici pour lecture rapide
    lastScanData: null,     // Dernières données scannées (pour l'export CSV)
    
    // Rotation automatique des chaînes (Auto-Discovery)
    globalStreamRotation: {
        streams: [],        // Liste des streams filtrés (0-100 vues)
        currentIndex: 0,    // Index actuel dans la liste
        lastFetchTime: 0,   // Dernier appel à l'API Twitch
        fetchCooldown: 15 * 60 * 1000 // Rafraichissement toutes les 15 min
    }
};

// =========================================================
// 3. FONCTIONS UTILITAIRES TWITCH (HELPERS)
// =========================================================

/**
 * getTwitchToken
 * Récupère un Token Twitch "App Access" (Client Credentials).
 * Utilisé pour les requêtes publiques (recherche, stats globales).
 */
async function getTwitchToken() {
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
                expiry: Date.now() + (data.expires_in * 1000) - 300000 // Marge de 5 min
            };
            return data.access_token;
        } else {
            console.error("❌ [TWITCH] Erreur lors de l'obtention du token d'application :", data);
            return null;
        }
    } catch (error) {
        console.error("❌ [TWITCH] Erreur réseau lors de la génération du token :", error);
        return null;
    }
}

/**
 * twitchApiFetch
 * Effectue un appel sécurisé à l'API Helix.
 */
async function twitchApiFetch(endpoint, token = null) {
    const accessToken = token || await getTwitchToken();
    if (!accessToken) throw new Error("Impossible d'obtenir un Token Twitch valide.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        throw new Error(`Authentification Twitch expirée (401).`);
    }
    
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${txt}`);
    }

    return res.json();
}

// =========================================================
// 4. SYSTÈME IA ROBUSTE (GEMINI + GROUNDING)
// =========================================================

/**
 * callGeminiApi
 * Appelle Google Gemini avec l'outil de recherche Google (Grounding).
 * Ce système est plus robuste car il interroge les données réelles du web.
 */
async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) return "Erreur: Clé API Gemini absente.";

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }] // Activation de la recherche Google pour l'IA
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`IA API Error: ${errData.error?.message || response.statusText}`);
        }

        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        return textResponse || "Désolé, l'IA n'a pas pu générer d'analyse pertinente pour le moment.";
        
    } catch (e) {
        console.error("❌ [IA] Erreur lors de l'appel Gemini :", e.message);
        return `Désolé, une erreur technique est survenue avec l'IA : ${e.message}`;
    }
}

// =========================================================
// 5. ROUTES D'AUTHENTIFICATION (LOGIN / CALLBACK)
// =========================================================

/**
 * /twitch_auth_start
 * Démarre le flux OAuth Twitch.
 */
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows user:read:email"; 
    
    const url = `https://id.twitch.tv/oauth2/authorize?` + new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: scope,
        state: state
    }).toString();

    // Stockage de l'état pour vérification au retour
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

/**
 * /twitch_auth_callback
 * Gère le retour de l'autorisation Twitch.
 */
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité : Session invalide.");
    if (error) return res.status(400).send(`Erreur lors de la connexion : ${error}`);

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
            // Récupération des informations de l'utilisateur
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            // On renvoie une page qui ferme la fenêtre popup et informe l'application parente
            res.send(`
                <html>
                <body style="background:#0d0d0d; color:#fff; font-family:sans-serif; text-align:center; padding-top:80px;">
                    <h2 style="color:#ff0099; font-family:Orbitron, sans-serif;">CONNEXION RÉUSSIE !</h2>
                    <p>Authentification validée. Fermeture de la fenêtre...</p>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage('auth_success', '*');
                            setTimeout(() => window.close(), 1500);
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
        console.error("❌ [AUTH] Erreur lors du callback :", e.message);
        res.status(500).send(`Erreur Serveur: ${e.message}`);
    }
});

/**
 * /twitch_user_status
 * Permet au frontend de vérifier l'état de la session utilisateur.
 */
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

/**
 * /twitch_logout
 * Déconnecte l'utilisateur du serveur.
 */
app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true, message: "Utilisateur déconnecté." });
});

// =========================================================
// 6. ROUTES API (FOLLOWS, SCANS, VODS)
// =========================================================

/**
 * /followed_streams
 * Récupère les streams suivis par l'utilisateur connecté qui sont en Live.
 */
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Non connecté." });

    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        
        // On nettoie les URLs d'images
        const streams = data.data.map(stream => ({
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
        }));
        
        return res.json({ success: true, streams, username: CACHE.twitchUser.display_name });
    } catch (e) {
        console.error("❌ [API] Erreur Followed Streams :", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * /scan_target
 * Scanne un streamer ou un jeu pour obtenir des données de niche.
 */
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Veuillez entrer un nom de chaîne ou de jeu." });
    
    try {
        // --- ÉTAPE A : Tenter de trouver un UTILISATEUR ---
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query.toLowerCase())}`); 
        
        if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // Vérifier s'il est en Live
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) streamDetails = streamRes.data[0];
            } catch (e) {}

            // Nombre de followers
            let followerCount = 0;
            try {
                const fRes = await twitchApiFetch(`channels/followers?broadcaster_id=${user.id}&first=1`);
                followerCount = fRes.total;
            } catch (e) {}

            // Calcul basique du score niche par défaut
            let aiScore = (followerCount < 5000) ? '9.0/10 (Forte Opportunité)' : '5.5/10 (Saturé)';

            const userData = { 
                type: 'user',
                login: user.login, 
                display_name: user.display_name, 
                id: user.id, 
                profile_image: user.profile_image_url,
                is_live: !!streamDetails,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : 'Hors-ligne',
                total_followers: followerCount,
                ai_calculated_niche_score: aiScore 
            };
            
            CACHE.lastScanData = userData;
            return res.json({ success: true, ...userData });
        }
        
        // --- ÉTAPE B : Tenter de trouver un JEU (Catégorie) ---
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data && gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            // Statistiques des streams FR actuels pour ce jeu
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&language=fr&first=100`);
            const streams = streamsRes.data;
            
            const totalStreams = streams.length;
            const totalViewers = streams.reduce((sum, s) => sum + s.viewer_count, 0);
            const avgViewers = totalStreams > 0 ? Math.round(totalViewers / totalStreams) : 0;
            
            let aiScore = (totalStreams < 20) ? '8.5/10' : '4.0/10'; 
            
            const gameData = { 
                type: 'game',
                name: game.name, 
                id: game.id, 
                box_art: game.box_art_url.replace('{width}', '144').replace('{height}', '192'),
                live_streamers_fr: totalStreams,
                total_viewers_fr: totalViewers,
                avg_viewers_per_streamer: avgViewers,
                ai_calculated_niche_score: aiScore
            };
            
            CACHE.lastScanData = gameData;
            return res.json({ success: true, ...gameData });
        }

        return res.status(404).json({ success: false, message: "Aucun résultat trouvé pour cette recherche." });
        
    } catch (e) {
        console.error("❌ [SCAN] Erreur :", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// 7. ROTATION AUTOMATIQUE & LECTEUR (AVEC FIREBASE)
// =========================================================

/**
 * refreshGlobalStreamList
 * Met à jour la liste des petits streamers FR (0-100 vues) pour la rotation.
 */
async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown de 15 min pour ne pas surcharger Twitch API
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) {
        return;
    }
    
    console.log("🔄 [ROTATION] Rafraîchissement des streams FR de niche (0-100 vues)...");
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const allStreams = data.data;

        // On filtre : On veut des streams qui ont entre 1 et 100 viewers (pour percer)
        let suitableStreams = allStreams.filter(stream => stream.viewer_count > 0 && stream.viewer_count <= 110);

        // Fallback : si aucun petit stream n'est trouvé, on prend les plus bas
        if (suitableStreams.length === 0 && allStreams.length > 0) {
            suitableStreams = allStreams.sort((a, b) => a.viewer_count - b.viewer_count).slice(0, 10); 
        }

        if (suitableStreams.length > 0) {
            rotation.streams = suitableStreams.map(s => ({ 
                channel: s.user_login, 
                viewers: s.viewer_count,
                game: s.game_name,
                title: s.title,
                thumbnail: s.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
            }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
        }
    } catch (e) {
        console.error("❌ [ROTATION] Erreur rafraîchissement :", e.message);
    }
}

/**
 * /get_default_stream
 * Détermine la chaîne à afficher par défaut dans le lecteur.
 * Donne la priorité absolue aux Boosts enregistrés dans Firebase.
 */
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let activeBoost = null;

    // 1. VÉRIFICATION FIREBASE (PRIORITÉ ABSOLUE)
    try {
        // On cherche un boost dont l'heure de fin n'est pas encore passée
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get();
            
        if (!boostQuery.empty) {
            const data = boostQuery.docs[0].data();
            activeBoost = { channel: data.channel, endTime: data.endTime };
            CACHE.boostedStream = activeBoost; // Mise à jour cache RAM
        } else {
            CACHE.boostedStream = null;
        }
    } catch(e) {
        console.error("⚠️ [DB] Erreur lecture Boost Firebase :", e.message);
        // Fallback cache RAM en cas de souci DB passager
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) {
            activeBoost = CACHE.boostedStream;
        }
    }

    // 2. LOGIQUE DE RÉPONSE
    // Si un Boost est actif : on l'impose
    if (activeBoost) {
        const remaining = Math.ceil((activeBoost.endTime - now) / 60000);
        return res.json({ 
            success: true, 
            channel: activeBoost.channel, 
            viewers: '⚡ BOOST',
            message: `⚡ BOOST ACTIF (${remaining} min restantes)`
        });
    }

    // Sinon : On passe à la rotation de découverte
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch', message: 'Fallback: Twitch Global.' });
    }

    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ 
        success: true, 
        channel: currentStream.channel,
        viewers: currentStream.viewers,
        game: currentStream.game,
        message: `✅ Auto-Discovery : ${currentStream.channel}`
    });
});

/**
 * /cycle_stream
 * Permet de passer manuellement au stream suivant ou précédent dans la rotation.
 */
app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    // On interdit le cycle si un boost est en cours (pour ne pas casser la visibilité du boosté)
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.status(403).json({ success: false, error: "Un Boost est actuellement actif." });
    }

    await refreshGlobalStreamList();
    const rotation = CACHE.globalStreamRotation;

    if (rotation.streams.length === 0) return res.status(404).json({ success: false });

    if (direction === 'next') {
        rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
    } else {
        rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;
    }

    const nextStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, ...nextStream });
});

// =========================================================
// 8. FONCTIONNALITÉS AVANCÉES (BOOST, RAID, IA)
// =========================================================

/**
 * /stream_boost
 * Active la mise en vedette d'une chaîne dans Firestore.
 */
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Veuillez entrer un nom de chaîne." });

    const now = Date.now();
    const DURATION = 15 * 60 * 1000; // 15 minutes de boost

    try {
        // Un seul boost à la fois autorisé globalement
        const activeBoostCheck = await db.collection('boosts')
            .where('endTime', '>', now)
            .limit(1)
            .get();

        if (!activeBoostCheck.empty) {
            const active = activeBoostCheck.docs[0].data();
            const rem = Math.ceil((active.endTime - now) / 60000);
            return res.status(429).json({ 
                error: "Désolé, la vedette est occupée.", 
                html_response: `<p style="color:#ffcc00;">❌ Un autre boost est déjà actif pour ${active.channel}. Réessayez dans ${rem} min.</p>` 
            });
        }

        // Création de l'entrée dans Firebase
        await db.collection('boosts').add({
            channel: channel.toLowerCase().trim(),
            startTime: now,
            endTime: now + DURATION,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        // Mise à jour cache RAM immédiate
        CACHE.boostedStream = { channel: channel.toLowerCase().trim(), endTime: now + DURATION };

        return res.json({ 
            success: true, 
            html_response: `<p style="color:#ff0099; font-weight:bold;">🚀 BOOST ACTIVÉ ! Votre chaîne est maintenant en vedette sur tout le Hub pendant 15 minutes.</p>` 
        });

    } catch (e) {
        console.error("❌ [DB] Erreur création Boost :", e.message);
        return res.status(500).json({ error: "Erreur base de données." });
    }
});

/**
 * /critique_ia
 * Route polyvalente pour les analyses approfondies par l'IA.
 */
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    
    let systemPrompt = "Tu es un expert mondial en croissance Twitch et en stratégie de contenu. Ton but est de fournir des conseils extrêmement précis et exploitables.";
    let userQuery = "";

    if (type === 'niche') {
        userQuery = `Analyse en profondeur le sujet/niche : "${query}". L'indice calculé par nos algorithmes est de ${niche_score}.
        1. Explique pourquoi ce sujet est une bonne ou mauvaise niche aujourd'hui sur Twitch FR.
        2. Identifie 3 angles d'attaque uniques pour se démarquer.
        3. Propose 3 titres de stream percutants pour ce sujet.
        Réponds en HTML structuré (h4, ul, li, strong).`;
    } 
    else if (type === 'repurpose') {
        userQuery = `J'ai terminé un stream sur le sujet : "${query}". Identifie 3 segments potentiels pour faire des YouTube Shorts ou TikToks qui deviennent viraux. Donne des instructions de montage (sous-titres, zooms) et des titres accrocheurs. Réponds en HTML.`;
    }
    else if (type === 'trend') {
        userQuery = "Quelles sont les 3 tendances majeures et concrètes qui émergent sur Twitch en ce moment pour les streamers de moins de 100 viewers ? Utilise la recherche Google pour être à jour. Réponds en HTML.";
    }
    else {
        userQuery = query;
    }

    const htmlResult = await callGeminiApi(systemPrompt, userQuery);
    res.json({ success: true, result: htmlResult });
});

/**
 * /analyze_schedule
 * Détermine les meilleurs horaires de stream pour un jeu donné.
 */
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    if (!game) return res.status(400).json({ success: false, error: "Jeu manquant." });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data || gameRes.data.length === 0) return res.json({ success: false, error: "Jeu introuvable." });
        
        const gameData = gameRes.data[0];
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameData.id}&first=100`);
        const totalV = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
        
        const prompt = `Analyse le planning optimal pour le jeu "${gameData.name}". Nous avons ${streamsRes.data.length} streamers en live pour ${totalV} viewers. 
        Agis en data-scientist Twitch. Propose 3 créneaux horaires spécifiques pour percer. Réponds en HTML.`;

        const aiResult = await callGeminiApi("Expert Data Twitch", prompt);
        
        return res.json({
            success: true,
            game_name: gameData.name,
            box_art: gameData.box_art_url.replace('{width}','144').replace('{height}','192'),
            html_response: aiResult
        });

    } catch (e) {
        console.error("❌ [PLANNING] Erreur :", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// 9. UTILITAIRES FINAUX (CSV, RAID, STATIC)
// =========================================================

/**
 * /export_csv
 * Exporte les dernières données de scan en format CSV.
 */
app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Veuillez d'abord effectuer un scan de niche pour exporter les données.");

    let csv = "Metrique,Valeur\n";
    Object.keys(data).forEach(k => {
        // On nettoie les virgules pour ne pas casser le format CSV
        const val = String(data[k]).replace(/,/g, ' ');
        csv += `${k},${val}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Analyse_Niche_Twitch.csv');
    res.status(200).send(csv);
});

/**
 * /start_raid
 * Trouve une cible de raid idéale basée sur des critères précis.
 */
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    if (!game) return res.status(400).json({ error: "Le nom du jeu est requis." });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ error: "Catégorie introuvable." });

        const gameId = gameRes.data[0].id;
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&language=fr&first=100`);

        // On cherche un streamer FR qui rentre dans les critères de viewers
        const candidates = streamsRes.data.filter(s => s.viewer_count > 0 && s.viewer_count <= parseInt(max_viewers));
        const target = candidates.sort((a, b) => b.viewer_count - a.viewer_count)[0];

        if (target) {
            return res.json({
                success: true,
                target: {
                    name: target.user_name,
                    login: target.user_login,
                    viewers: target.viewer_count,
                    game: target.game_name,
                    thumbnail_url: target.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
                }
            });
        } else {
            return res.status(404).json({ error: "Aucun streamer FR de cette taille n'est en Live sur ce jeu." });
        }
    } catch (e) {
        console.error("❌ [RAID] Erreur :", e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * Route Racine /
 * Sert l'application frontend principale.
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

/**
 * DÉMARRAGE DU SERVEUR
 */
app.listen(PORT, () => {
    console.log(`=============================================================`);
    console.log(`🚀 HUB V20 ULTIMATE FIX - EN LIGNE SUR LE PORT ${PORT}`);
    console.log(`📡 FIRESTORE : ${admin.apps.length > 0 ? 'PRÊT' : 'ERREUR INIT'}`);
    console.log(`🤖 IA ROBUSTE : ${GEMINI_MODEL} (Google Grounding ACTIVE)`);
    console.log(`=============================================================`);
});
