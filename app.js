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

// --- INITIALISATION FIREBASE ---
const admin = require('firebase-admin');
let serviceAccount;

/**
 * 0. GESTION DE LA CLÉ FIREBASE (RÉPARATION RENDER)
 * Cette section est critique pour éviter les erreurs de "Project ID" ou de parsing JSON
 * courantes lors du déploiement sur Render.com.
 */
if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY.trim();
        
        // 1. Nettoyage des guillemets parasites souvent ajoutés par les interfaces de config
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // 2. CORRECTION CRITIQUE : Remplacement des sauts de ligne littéraux pour le JSON
        rawJson = rawJson.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

        serviceAccount = JSON.parse(rawJson);

        // 3. Correction de la clé privée pour l'authentification (Firebase a besoin des vrais sauts de ligne)
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
        console.log("✅ [FIREBASE] Configuration détectée, nettoyée et réparée avec succès.");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur FATALE de parsing JSON :", error.message);
        console.error("🔍 Vérifiez votre variable FIREBASE_SERVICE_KEY dans les réglages Render.");
    }
} else {
    try {
        // Fallback pour le développement local
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Clé chargée depuis le fichier local.");
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée (Variable d'env ou fichier manquant).");
    }
}

// Initialisation de l'application Firebase Admin
if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // On force l'ID du projet pour aider Firestore à se localiser sur Render
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté au projet Cloud : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation de l'instance Admin :", e.message);
    }
} else {
    // Initialisation par défaut (peut échouer si non configuré)
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

/**
 * FORÇAGE DES SETTINGS FIRESTORE
 * Contourne le bug Render "Unable to detect Project Id" en imposant l'ID manuellement
 */
if (serviceAccount) {
    try {
        db.settings({
            projectId: serviceAccount.project_id,
            ignoreUndefinedProperties: true
        });
        console.log("✅ [FIRESTORE] ID de projet forcé dans les réglages de la base de données.");
    } catch(e) {
        console.error("⚠️ [FIRESTORE] Impossible d'appliquer les réglages de settings :", e.message);
    }
}

// =========================================================
// 1. CONFIGURATION DU SERVEUR EXPRESS
// =========================================================

const app = express();
const PORT = process.env.PORT || 10000;

// Variables d'environnement Twitch et IA
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; // Modèle supportant le Grounding

// Vérification de sécurité au démarrage
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("#############################################################");
    console.error("ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES !");
    console.error("Vérifiez TWITCH_CLIENT_ID, SECRET, REDIRECT_URI et GEMINI_API_KEY");
    console.error("#############################################################");
}

// Configuration des Middlewares
app.use(cors({
    origin: '*', // Autoriser toutes les origines pour le Hub
    credentials: true
}));
app.use(bodyParser.json());
app.use(cookieParser());
// Sert les fichiers statiques (NicheOptimizer.html, etc.) depuis la racine
app.use(express.static(path.join(__dirname)));

// =========================================================
// 2. SYSTÈME DE CACHE ET ÉTAT GLOBAL (RAM)
// =========================================================
const CACHE = {
    twitchTokens: {},       // Stockage des App Access Tokens
    twitchUser: null,       // Session utilisateur actif (User Access Token)
    boostedStream: null,    // Cache rapide du boost actif
    lastScanData: null,     // Mémoire du dernier scan pour l'export CSV
    
    // Configuration de la rotation automatique des petits streamers
    globalStreamRotation: {
        streams: [],        // Liste des chaînes (0-100 vues)
        currentIndex: 0,    // Position actuelle
        lastFetchTime: 0,   // Timestamp du dernier rafraîchissement
        fetchCooldown: 15 * 60 * 1000 // Cooldown de 15 minutes
    }
};

// =========================================================
// 3. FONCTIONS UTILITAIRES TWITCH (HELPER HELIX)
// =========================================================

/**
 * getTwitchToken
 * Récupère ou rafraîchit un token d'application (Client Credentials).
 */
async function getTwitchToken() {
    // Vérification du cache
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
        }
    } catch (error) {
        console.error("❌ [TWITCH] Erreur lors de la génération du Token Application :", error);
    }
    return null;
}

/**
 * twitchApiFetch
 * Effectue un appel sécurisé à l'API Helix avec gestion automatique du token.
 */
async function twitchApiFetch(endpoint, token = null) {
    const accessToken = token || await getTwitchToken();
    if (!accessToken) throw new Error("Accès à l'API Twitch impossible (Token manquant).");

    const response = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (response.status === 401) {
        throw new Error("Authentification Twitch expirée (401).");
    }
    
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur Helix (${response.status}) : ${errText}`);
    }

    return response.json();
}

// =========================================================
// 4. SYSTÈME IA ROBUSTE (GEMINI + GROUNDING)
// =========================================================

/**
 * callGeminiApi
 * Appelle l'API Google Gemini avec l'outil de recherche Google activé (Grounding).
 * Cela garantit des données à jour sur les tendances Twitch.
 */
async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) return "Erreur : Clé API Gemini absente de la configuration.";

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    // Payload avec Grounding (Google Search)
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { 
            parts: [{ text: systemPrompt }] 
        },
        tools: [{ "google_search": {} }] // Activation du moteur de recherche Google
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errBody = await response.json();
            throw new Error(`Erreur IA API (${response.status}) : ${errBody.error?.message || response.statusText}`);
        }

        const result = await response.json();
        // Extraction du texte généré par l'IA
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "L'IA n'a pas pu formuler de réponse exploitable.";
    } catch (e) {
        console.error("❌ [IA] Erreur lors de l'appel Gemini :", e.message);
        return `Désolé, une erreur est survenue lors de l'analyse IA : ${e.message}`;
    }
}

// =========================================================
// 5. ROUTES D'AUTHENTIFICATION TWITCH (OAUTH)
// =========================================================

/**
 * /twitch_auth_start
 * Point d'entrée pour la connexion utilisateur.
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

    // Stockage du state dans un cookie pour vérification CSRF
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 });
    res.redirect(url);
});

/**
 * /twitch_auth_callback
 * Route de retour après autorisation Twitch.
 */
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    
    // Vérification de sécurité (CSRF)
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur de sécurité : État de session invalide.");
    if (error) return res.status(400).send(`Erreur lors de la connexion Twitch : ${error}`);

    try {
        // Échange du code d'autorisation contre un token d'accès utilisateur
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
            // Récupération des infos de l'utilisateur connecté
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };

            // Stockage du token dans un cookie pour le frontend
            res.cookie('twitch_access_token', tokenData.access_token, { 
                httpOnly: true, 
                secure: true, 
                maxAge: 3600000 // 1 heure
            });

            // Page de succès qui ferme la popup et prévient le parent (le Hub)
            res.send(`
                <html>
                <body style="background:#0d0d0d; color:#fff; text-align:center; padding-top:100px; font-family:sans-serif;">
                    <h2 style="color:#ff0099; font-family:Orbitron, sans-serif;">CONNEXION RÉUSSIE !</h2>
                    <p>Authentification validée. Cette fenêtre va se fermer automatiquement...</p>
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
            res.status(500).send("Erreur : Échec de l'échange du token Twitch.");
        }
    } catch (e) {
        console.error("Erreur Auth Callback :", e);
        res.status(500).send(`Erreur serveur interne : ${e.message}`);
    }
});

/**
 * /twitch_user_status
 * Permet au frontend de savoir si une session est active.
 */
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ 
            is_connected: true, 
            display_name: CACHE.twitchUser.display_name,
            username: CACHE.twitchUser.username,
            id: CACHE.twitchUser.id
        });
    }
    res.json({ is_connected: false });
});

/**
 * /twitch_logout
 * Déconnexion propre.
 */
app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.clearCookie('twitch_access_token');
    res.json({ success: true, message: "Déconnexion effectuée." });
});

// =========================================================
// 6. ROUTES API TWITCH (DATA & SCANS)
// =========================================================

/**
 * /followed_streams
 * Récupère les chaînes suivies qui sont actuellement en Live.
 */
app.get('/followed_streams', async (req, res) => {
    const token = req.cookies.twitch_access_token || (CACHE.twitchUser ? CACHE.twitchUser.access_token : null);
    if (!token) return res.status(401).json({ success: false, error: "Utilisateur non authentifié." });

    try {
        const userRes = await twitchApiFetch('users', token);
        const userId = userRes.data[0].id;
        const data = await twitchApiFetch(`streams/followed?user_id=${userId}`, token);
        
        res.json({ 
            success: true, 
            streams: data.data, 
            username: userRes.data[0].display_name 
        });
    } catch (e) {
        console.error("Erreur Followed Streams :", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * /scan_target
 * Recherche approfondie d'un streamer ou d'une catégorie de jeu.
 */
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: "La requête est vide." });

    try {
        // Tentative 1 : Recherche d'un UTILISATEUR
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query.toLowerCase())}`);
        if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // On récupère le nombre de followers (requête séparée)
            let followerCount = 0;
            try {
                const fData = await twitchApiFetch(`channels/followers?broadcaster_id=${user.id}&first=1`);
                followerCount = fData.total;
            } catch(e){}

            const userData = {
                type: 'user',
                login: user.login,
                display_name: user.display_name,
                profile_image: user.profile_image_url,
                follower_count: followerCount,
                broadcaster_type: user.broadcaster_type || 'Streamer Standard',
                description: user.description || "Aucune description.",
                ai_calculated_niche_score: followerCount < 10000 ? "9.5/10 (Niche Potentielle)" : "4.5/10 (Saturé)"
            };
            CACHE.lastScanData = userData;
            return res.json({ success: true, ...userData });
        }

        // Tentative 2 : Recherche d'une CATÉGORIE / JEU
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data && gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            // Statistiques sur les streams FR actuels pour ce jeu
            const streams = await twitchApiFetch(`streams?game_id=${game.id}&language=fr&first=100`);
            const totalV = streams.data.reduce((sum, s) => sum + s.viewer_count, 0);

            const gameData = {
                type: 'game',
                name: game.name,
                box_art: game.box_art_url.replace('{width}', '144').replace('{height}', '192'),
                live_streamers_fr: streams.data.length,
                total_viewers_fr: totalV,
                avg_viewers_fr: streams.data.length > 0 ? Math.round(totalV / streams.data.length) : 0,
                ai_calculated_niche_score: streams.data.length < 15 ? "8.8/10" : "3.5/10"
            };
            CACHE.lastScanData = gameData;
            return res.json({ success: true, ...gameData });
        }

        res.status(404).json({ success: false, error: "Aucun streamer ou jeu trouvé pour cette recherche." });
    } catch (e) {
        console.error("Erreur Scan Target :", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// 7. GESTION ROTATION & BOOSTS (FIRESTORE PERSISTANCE)
// =========================================================

/**
 * refreshRotation
 * Met à jour la liste des petits streamers FR (0-100 vues).
 */
async function refreshRotation() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;

    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        // Filtrage strict des petits streamers
        const suitable = data.data.filter(s => s.viewer_count >= 0 && s.viewer_count <= 120);
        
        if (suitable.length > 0) {
            rot.streams = suitable.map(s => ({
                channel: s.user_login,
                viewers: s.viewer_count,
                game: s.game_name,
                title: s.title,
                thumbnail: s.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
            }));
            rot.lastFetchTime = now;
            console.log(`🔄 [ROTATION] Liste mise à jour : ${suitable.length} chaînes trouvées.`);
        }
    } catch (e) {
        console.error("❌ [ROTATION] Erreur rafraîchissement :", e.message);
    }
}

/**
 * /get_default_stream
 * Détermine quelle chaîne afficher dans le lecteur principal.
 * Priorité 1 : Boost Actif (Firestore).
 * Priorité 2 : Rotation de découverte.
 */
app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    
    // 1. Vérification de l'existence d'un Boost en cours dans la DB
    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get();

        if (!boostQuery.empty) {
            const boost = boostQuery.docs[0].data();
            const remaining = Math.ceil((boost.endTime - now) / 60000);
            return res.json({ 
                success: true, 
                channel: boost.channel, 
                type: 'BOOST', 
                viewers: '⚡ BOOST',
                remaining_min: remaining
            });
        }
    } catch (e) {
        console.error("❌ [DB] Erreur lecture Boost :", e.message);
    }

    // 2. Si pas de boost, on utilise la rotation automatique
    await refreshRotation();
    const rot = CACHE.globalStreamRotation;
    
    if (rot.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch', type: 'FALLBACK', viewers: 'N/A' });
    }

    // Sélection du stream à l'index actuel
    const current = rot.streams[rot.currentIndex];
    res.json({ 
        success: true, 
        ...current, 
        type: 'ROTATION_DISCOVERY' 
    });
});

/**
 * /cycle_stream
 * Commande manuelle (Next/Prev) du lecteur.
 */
app.post('/cycle_stream', (req, res) => {
    const { direction } = req.body;
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: false });

    if (direction === 'next') {
        rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    } else {
        rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    }

    res.json({ success: true, ...rot.streams[rot.currentIndex] });
});

/**
 * /stream_boost
 * Enregistre un nouveau boost dans Firestore.
 */
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Le nom de la chaîne est requis." });

    const now = Date.now();
    try {
        // On vérifie s'il n'y a pas déjà un boost actif
        const active = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!active.empty) {
            const data = active.docs[0].data();
            return res.status(429).json({ 
                error: "Désolé, un boost est déjà actif.",
                current_boost: data.channel 
            });
        }

        // Création du boost pour 15 minutes
        await db.collection('boosts').add({
            channel: channel.toLowerCase(),
            startTime: now,
            endTime: now + (15 * 60 * 1000), 
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ 
            success: true, 
            html_response: `<p style="color:#ff0099; font-weight:bold;">🚀 BOOST ACTIVÉ ! Votre chaîne est maintenant en vedette pour 15 minutes.</p>` 
        });
    } catch (e) {
        console.error("❌ [DB] Erreur création Boost :", e.message);
        res.status(500).json({ error: e.message });
    }
});

// =========================================================
// 8. ROUTES D'ANALYSE IA SPÉCIALISÉES
// =========================================================

/**
 * /critique_ia
 * Route d'analyse polyvalente.
 */
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let systemPrompt = "Tu es un expert en croissance Twitch et analyste de niche. Réponds en HTML structuré (h4, ul, li).";
    let userQuery = "";

    if (type === 'niche') {
        userQuery = `Analyse en profondeur la niche de streaming "${query}" (Indice de niche : ${niche_score}). 
        Identifie 3 forces majeures, 3 risques et propose une stratégie concrète étape par étape pour percer dans ce sujet. 
        Utilise des données récentes sur l'audience Twitch.`;
    } else if (type === 'repurpose') {
        userQuery = `J'ai fini de streamer ce contenu : "${query}". 
        Agis comme un monteur expert. Identifie 3 segments types qui feraient d'excellents YouTube Shorts ou TikToks. 
        Donne-leur des titres "putaclic" mais efficaces et suggère le format de montage (sous-titres, zooms, etc.).`;
    } else if (type === 'trend') {
        userQuery = "Analyse les tendances Twitch actuelles. Quelles sont les 3 catégories ou types de streams qui explosent en ce moment et qui offrent une opportunité réelle pour un streamer avec moins de 50 spectateurs ? Sois très spécifique.";
    } else {
        userQuery = query;
    }

    const text = await callGeminiApi(systemPrompt, userQuery);
    res.json({ success: true, result: text });
});

/**
 * /analyze_schedule
 * Détermine les meilleurs horaires de stream pour un jeu.
 */
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    if (!game) return res.status(400).json({ error: "Nom de jeu manquant." });

    const systemPrompt = "Tu es un data-scientist spécialisé dans les métriques Twitch FR. Ton but est de maximiser la visibilité des streamers.";
    const userQuery = `Analyse le jeu "${game}". Prédis les 3 créneaux horaires de la semaine où le ratio 'Spectateurs total / Nombre de streamers FR' est le plus avantageux pour un petit streamer. Formate la réponse en HTML propre.`;
    
    const text = await callGeminiApi(systemPrompt, userQuery);
    res.json({ success: true, html_response: text });
});

// =========================================================
// 9. OUTILS ET UTILITAIRES FINAUX (CSV, RAID, STATIC)
// =========================================================

/**
 * /export_csv
 * Génère un rapport CSV des dernières analyses effectuées.
 */
app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Aucune donnée d'analyse disponible pour l'export.");

    let csvContent = "Metrique,Valeur\n";
    csvContent += `Date Export,${new Date().toLocaleString()}\n`;
    Object.keys(data).forEach(key => {
        // Nettoyage sommaire des virgules pour le format CSV
        const val = String(data[key]).replace(/,/g, ' ');
        csvContent += `${key},${val}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Rapport_JustPlay_AI.csv');
    res.status(200).send(csvContent);
});

/**
 * /start_raid
 * Trouve une cible de raid idéale pour l'utilisateur.
 */
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        // Recherche de la catégorie
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ error: "Jeu non trouvé." });
        
        const gameId = gameRes.data[0].id;
        // Recherche de streams FR
        const streams = await twitchApiFetch(`streams?game_id=${gameId}&language=fr&first=100`);
        
        // Filtre selon le nombre maximum de viewers souhaité
        const target = streams.data.find(s => s.viewer_count > 0 && s.viewer_count <= parseInt(max_viewers));

        if (target) {
            res.json({
                success: true,
                target: {
                    name: target.user_name,
                    login: target.user_login,
                    viewers: target.viewer_count,
                    game: target.game_name,
                    thumbnail: target.thumbnail_url.replace('{width}', '200').replace('{height}', '112')
                }
            });
        } else {
            res.status(404).json({ error: "Aucune cible de raid française correspondant à vos critères n'est en live." });
        }
    } catch (e) {
        console.error("Erreur Raid Logic :", e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * Route Racine /
 * Sert l'application principale (le frontend).
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

/**
 * DÉMARRAGE DU SERVEUR
 */
app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 HUB V20 ULTIMATE - PORT ${PORT}`);
    console.log(`📡 ÉTAT FIRESTORE : ${admin.apps.length > 0 ? 'CONNECTÉ' : 'ATTENTE'}`);
    console.log(`🤖 MODÈLE IA : ${GEMINI_MODEL}`);
    console.log(`===============================================`);
});
