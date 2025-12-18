/**
 * ==================================================================================
 * STREAMER & NICHE AI HUB - SERVER BACKEND (PRODUCTION FULL VERSION)
 * ==================================================================================
 * Version: 2.0 (Deep Search Integration)
 * Auteur: Assistant IA
 * Description: 
 * Serveur Node.js complet gérant l'authentification Twitch, l'API Helix, 
 * l'intelligence artificielle Gemini, et la logique de rotation automatique
 * des streams pour les petites chaînes (< 100 vues).
 * * FONCTIONNALITÉS :
 * 1. Auth OAuth2 Twitch (Code Flow)
 * 2. API Proxy pour contourner les CORS
 * 3. Deep Pagination (Recherche en profondeur pour les petits streams)
 * 4. Système de Boost (Priorité payante simulée)
 * 5. Intégration IA Google Gemini (Analyse de Niche & VOD)
 * 6. Export CSV
 * ==================================================================================
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

// Initialisation de l'application Express
const app = express();

// ==================================================================================
// 1. CONFIGURATION ET VARIABLES D'ENVIRONNEMENT
// ==================================================================================
// Assurez-vous que ces variables sont définies dans votre environnement d'hébergement.

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

// Vérification stricte au démarrage pour éviter les erreurs silencieuses
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("\n#############################################################");
    console.error("ERREUR FATALE : VARIABLES D'ENVIRONNEMENT MANQUANTES");
    console.error("Le serveur ne peut pas démarrer sans les clés API.");
    console.error(`Status des clés :`);
    console.error(`- TWITCH_CLIENT_ID: ${TWITCH_CLIENT_ID ? 'OK' : 'MANQUANT'}`);
    console.error(`- TWITCH_CLIENT_SECRET: ${TWITCH_CLIENT_SECRET ? 'OK' : 'MANQUANT'}`);
    console.error(`- TWITCH_REDIRECT_URI: ${REDIRECT_URI ? 'OK' : 'MANQUANT'}`);
    console.error(`- GEMINI_API_KEY: ${GEMINI_API_KEY ? 'OK' : 'MANQUANT'}`);
    console.error("#############################################################\n");
    process.exit(1); // Arrêt immédiat du processus
}

// Initialisation de l'instance IA
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

// Configuration des Middlewares
app.use(cors()); // Permet les requêtes Cross-Origin
app.use(bodyParser.json()); // Permet de lire le JSON dans les requêtes POST
app.use(cookieParser()); // Permet de lire les cookies (pour l'état OAuth)
app.use(express.static(path.join(__dirname))); // Sert les fichiers statiques (HTML, CSS, JS)

// ==================================================================================
// 2. SYSTÈME DE CACHE ET ÉTAT GLOBAL (IN-MEMORY DATABASE)
// ==================================================================================
// Nous utilisons un objet global pour stocker l'état car il n'y a pas de base de données.

const CACHE = {
    // Stockage des tokens d'application Twitch
    twitchTokens: {
        app: null // { access_token, expiry }
    }, 
    
    // Session utilisateur active (Un seul utilisateur supporté dans cette version simple)
    twitchUser: null,       
    
    // Gestion des Boosts (Mise en avant temporaire)
    streamBoosts: {},       // Historique des cooldowns (Map: chaine -> timestamp)
    boostedStream: null,    // Le boost actif actuellement { channel, endTime }
    
    // Données pour l'export CSV
    lastScanData: null,     
    
    // Gestion de la Rotation Automatique (Auto-Discovery)
    globalStreamRotation: {
        streams: [],        // Liste filtrée des streams < 100 vues
        currentIndex: 0,    // Index du stream en cours de lecture
        lastFetchTime: 0,   // Timestamp de la dernière mise à jour de la liste
        fetchCooldown: 10 * 60 * 1000 // On ne rafraichit la liste que toutes les 10 min pour économiser l'API
    }
};

// ==================================================================================
// 3. FONCTIONS UTILITAIRES (HELPERS)
// ==================================================================================

/**
 * Obtient un Token d'Application Twitch (Client Credentials Flow).
 * Ce token est utilisé pour les requêtes publiques (recherche, streams, etc.).
 */
async function getTwitchAppToken() {
    // Vérifier si le token en cache est encore valide (avec une marge de 5 min)
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) {
        return CACHE.twitchTokens.app.access_token;
    }
    
    console.log("Renouvellement du Token Twitch App...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens.app = {
                access_token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        } else {
            console.error("Erreur critique lors de l'obtention du token Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau Token:", error);
        return null;
    }
}

/**
 * Fonction générique pour appeler l'API Twitch Helix.
 * Gère automatiquement l'ajout des headers d'authentification.
 */
async function twitchApiFetch(endpoint, userToken = null) {
    // Utilise soit le token utilisateur (si fourni), soit le token d'app
    const accessToken = userToken || await getTwitchAppToken();
    
    if (!accessToken) {
        throw new Error("Impossible d'obtenir un token d'accès valide.");
    }

    // Construction de l'URL (gestion propre des séparateurs ? et &)
    const baseUrl = `https://api.twitch.tv/helix/${endpoint}`;
    
    try {
        const res = await fetch(baseUrl, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });

        // Gestion de l'expiration du token (401 Unauthorized)
        if (res.status === 401) {
            console.warn("Token expiré détecté (401). Nettoyage du cache.");
            if (userToken === CACHE.twitchTokens.app?.access_token) CACHE.twitchTokens.app = null; 
            if (userToken === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
            throw new Error(`Erreur d'authentification Twitch (401). Veuillez rafraîchir.`);
        }
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Erreur API Twitch (${res.status}): ${errorText}`);
        }

        return await res.json();
    } catch (error) {
        throw error;
    }
}

/**
 * Interface avec l'IA Google Gemini.
 * Force le formatage HTML pour l'affichage direct dans le frontend.
 */
async function runGeminiAnalysis(prompt) {
    try {
        const model = ai.getGenerativeModel({ 
            model: GEMINI_MODEL,
            systemInstruction: "Tu es un expert en analyse de données Twitch et en stratégie de contenu. Tes réponses doivent être structurées EXCLUSIVEMENT en HTML simple (sans balises <html>, <head>, <body>). Utilise des balises <h4> pour les titres, <ul>/<li> pour les listes, et <strong> pour l'emphase. Sois direct, concis et actionnable."
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        return { success: true, html_response: text.trim() };
    } catch (e) {
        console.error("Erreur Gemini:", e);
        return { 
            success: false, 
            error: e.message, 
            html_response: `<p style="color:var(--color-ai-action);">❌ Une erreur est survenue lors de l'analyse IA : ${e.message}</p>` 
        };
    }
}

// ==================================================================================
// 4. ROUTES D'AUTHENTIFICATION OAUTH2 (CONNEXION UTILISATEUR)
// ==================================================================================

// Étape 1 : Redirection vers la page de login Twitch
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    // Scopes demandés : Lire les follows
    const scope = "user:read:follows"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    
    // Stockage du state en cookie sécurisé pour éviter les attaques CSRF
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

// Étape 2 : Callback de retour après connexion sur Twitch
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    
    // Vérification de sécurité du State
    if (state !== req.cookies.twitch_state) {
        return res.status(403).send("Erreur de sécurité (CSRF): État invalide.");
    }

    if (error) {
        return res.status(400).send(`Erreur renvoyée par Twitch : ${error_description}`);
    }

    try {
        // Échange du Code contre un Token d'accès Utilisateur
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
            // Récupération des informations du profil utilisateur
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            // Mise à jour de la session utilisateur en cache
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            // Réponse HTML qui ferme la fenêtre popup et notifie la fenêtre principale
            res.send(`
                <html>
                <body style="background-color:#111; color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
                    <div style="text-align:center;">
                        <h2>Connexion Réussie !</h2>
                        <p>Fermeture de la fenêtre...</p>
                    </div>
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
            console.error("Erreur Token Data:", tokenData);
            res.status(500).send("Échec de l'authentification : Impossible d'obtenir le token.");
        }
    } catch (e) {
        console.error("Erreur Callback:", e);
        res.status(500).send(`Erreur interne : ${e.message}`);
    }
});

// Déconnexion
app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true, message: "Déconnexion effectuée." });
});

// Vérification de l'état de connexion (Appelé par le frontend au chargement)
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ 
            is_connected: true, 
            display_name: CACHE.twitchUser.display_name,
            username: CACHE.twitchUser.username,
            id: CACHE.twitchUser.id
        });
    }
    // Si expiré ou nul
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// ==================================================================================
// 5. ROUTES DE DONNÉES (FOLLOWS, SCAN, VOD)
// ==================================================================================

// Liste des chaînes suivies par l'utilisateur connecté
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Utilisateur non connecté." });

    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        
        const formattedStreams = data.data.map(stream => ({
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url 
        }));
        
        return res.json({ success: true, streams: formattedStreams });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Récupération de la dernière VOD (pour l'analyse de Repurposing)
app.get('/get_latest_vod', async (req, res) => {
    const channelName = req.query.channel;
    if (!channelName) return res.status(400).json({ success: false, error: "Paramètre 'channel' requis." });

    try {
        // 1. Obtenir l'ID utilisateur
        const userRes = await twitchApiFetch(`users?login=${channelName}`);
        if (!userRes.data || userRes.data.length === 0) {
            return res.status(404).json({ success: false, error: "Chaîne introuvable." });
        }
        const userId = userRes.data[0].id;

        // 2. Obtenir la dernière vidéo archivée
        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if (!vodRes.data || vodRes.data.length === 0) {
            return res.status(404).json({ success: false, error: "Aucune VOD disponible." });
        }
        
        const vod = vodRes.data[0];
        
        return res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                duration: vod.duration,
                created_at: vod.created_at
            }
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Route principale pour le SCAN (Dashboard 360)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    
    try {
        // STRATÉGIE 1 : RECHERCHE UTILISATEUR
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // Récupération des infos de stream live
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) streamDetails = streamRes.data[0];
            } catch (e) { console.error("Erreur stream fetch", e); }

            // Récupération du nombre de followers (nécessite un appel spécifique)
            let followerCount = 'Non dispo';
            try {
                const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`);
                followerCount = fRes.total;
            } catch (e) {}

            // Calcul simplifié du score niche (l'IA fera mieux ensuite)
            let aiScore = (user.broadcaster_type === 'partner') ? '9.0/10' : '6.0/10';

            const userData = { 
                login: user.login, 
                display_name: user.display_name, 
                id: user.id, 
                profile_image_url: user.profile_image_url,
                is_live: !!streamDetails,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                total_followers: followerCount,
                total_views: user.view_count || 0,
                ai_calculated_niche_score: aiScore,
                broadcaster_type: user.broadcaster_type
            };
            
            CACHE.lastScanData = { type: 'user', ...userData };
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // STRATÉGIE 2 : RECHERCHE DE JEU (CATÉGORIE)
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            // Statistiques globales du jeu
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const streams = streamsRes.data;
            
            const totalStreams = streams.length;
            const totalViewers = streams.reduce((sum, s) => sum + s.viewer_count, 0);
            
            // Calcul de saturation
            let saturation = "Faible";
            if (totalViewers > 50000) saturation = "Très Élevée";
            else if (totalViewers > 10000) saturation = "Élevée";
            
            const gameData = { 
                name: game.name, 
                id: game.id, 
                box_art_url: game.box_art_url,
                total_streamers: totalStreams,
                total_viewers: totalViewers,
                saturation: saturation,
                ai_calculated_niche_score: (totalViewers < 2000) ? '8.5/10' : '4.0/10'
            };
            
            CACHE.lastScanData = { type: 'game', ...gameData };
            return res.json({ success: true, type: 'game', game_data: gameData });
        }

        return res.status(404).json({ success: false, message: "Aucun résultat trouvé." });
        
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// ==================================================================================
// 6. LOGIQUE COMPLEXE : ROTATION & DEEP DIVE (CORRECTION < 100 VUES)
// ==================================================================================

/**
 * Cette fonction est le cœur du système "Auto-Discovery".
 * Contrairement à la version précédente, elle utilise une pagination (cursor)
 * pour aller chercher LOIN dans la liste des streams Twitch si les premiers
 * résultats contiennent des chaînes trop grosses (> 100 vues).
 */
async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    // Cooldown : Si la liste est déjà remplie et récente, on ne fait rien
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 10) {
        return;
    }
    
    console.log(">>> DÉBUT DU REFRESH DEEP SEARCH : Recherche de streams FR < 100 vues...");
    
    let allCandidates = [];
    let cursor = null;
    let pageCount = 0;
    const MAX_PAGES_TO_SCAN = 10; // On scanne jusqu'à 10 pages de 100 streams (1000 chaînes)
    const TARGET_POOL_SIZE = 50;  // On veut au moins 50 chaînes valides

    try {
        // BOUCLE DE PAGINATION
        while (allCandidates.length < TARGET_POOL_SIZE && pageCount < MAX_PAGES_TO_SCAN) {
            
            let url = `streams?language=fr&first=100`;
            if (cursor) {
                url += `&after=${cursor}`;
            }
            
            const response = await twitchApiFetch(url);
            
            if (!response.data || response.data.length === 0) {
                console.log("Plus de résultats disponibles chez Twitch.");
                break;
            }

            // --- FILTRAGE STRICT ---
            // On ne garde QUE les streams qui ont STRICTEMENT 100 vues ou moins
            // Et qui ont au moins 1 viewer (pour éviter les bugs d'affichage 0)
            const validBatch = response.data.filter(stream => {
                return stream.viewer_count > 0 && stream.viewer_count <= 100;
            });

            console.log(`Page ${pageCount + 1}: Trouvé ${validBatch.length} streams valides sur ${response.data.length} analysés.`);
            
            allCandidates = allCandidates.concat(validBatch);

            // Préparation de la page suivante
            cursor = response.pagination ? response.pagination.cursor : null;
            if (!cursor) break; // Plus de pages
            
            pageCount++;
        }

        // Si après tout ça, on n'a rien (ex: bug API ou milieu de la nuit), on fait un fallback
        if (allCandidates.length === 0) {
             console.warn("ALERTE: Aucun stream < 100 trouvé. Fallback sur le bas du classement Top 100.");
             const fallback = await twitchApiFetch(`streams?language=fr&first=100`);
             // On prend les 20 derniers de la liste (les plus petits du top)
             allCandidates = fallback.data.slice(-20);
        } else {
             // On mélange la liste pour que ce ne soit pas toujours les mêmes
             // Algorithme de mélange de Fisher-Yates simplifié
             allCandidates = allCandidates.sort(() => Math.random() - 0.5);
        }

        // Mise à jour du Cache
        rotation.streams = allCandidates.map(s => ({ 
            channel: s.user_login, 
            viewers: s.viewer_count,
            game: s.game_name
        }));
        
        // Reset de l'index si on dépasse la nouvelle taille
        if (rotation.currentIndex >= rotation.streams.length) {
            rotation.currentIndex = 0;
        }
        
        rotation.lastFetchTime = now;
        console.log(`>>> REFRESH TERMINÉ. Nouvelle liste : ${rotation.streams.length} chaînes qualifiées.`);

    } catch (e) {
        console.error("Erreur critique lors du Deep Refresh:", e);
    }
}

// Route appelée par le frontend pour savoir quoi jouer
app.get('/get_default_stream', async (req, res) => {
    
    // CAS 1 : BOOST ACTIF (Priorité absolue)
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const { channel, endTime } = CACHE.boostedStream;
        const minutesRemaining = Math.ceil((endTime - Date.now()) / 60000);
        
        return res.json({ 
            success: true, 
            channel: channel, 
            viewers: 'BOOST',
            message: `⚡ BOOST ACTIF : ${channel} (Reste ${minutesRemaining} min)`,
            mode: 'boost'
        });
    }

    // CAS 2 : ROTATION NORMALE
    // On s'assure que la liste est à jour
    await refreshGlobalStreamList(); 

    const rotation = CACHE.globalStreamRotation;
    
    // Sécurité si liste vide
    if (rotation.streams.length === 0) {
        return res.json({ 
            success: true, 
            channel: 'twitch', 
            message: 'Aucune chaîne trouvée (Mode Fallback)',
            mode: 'fallback'
        });
    }

    // Récupération du stream actuel selon l'index
    const currentStream = rotation.streams[rotation.currentIndex];

    return res.json({ 
        success: true, 
        channel: currentStream.channel,
        viewers: currentStream.viewers,
        game: currentStream.game,
        message: `✅ Auto-Discovery : ${currentStream.channel} (${currentStream.viewers} vues)`,
        mode: 'auto'
    });
});

// Route pour passer à la chaîne suivante (Manuellement ou via Timer)
app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body; 

    // Impossible de changer si un Boost est actif
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.status(403).json({ success: false, error: "Impossible de changer : Un Boost est actif." });
    }

    // Mise à jour de la liste si nécessaire
    await refreshGlobalStreamList();
    
    const rotation = CACHE.globalStreamRotation;

    if (rotation.streams.length === 0) {
        return res.status(404).json({ success: false, error: "Liste vide." });
    }

    // Calcul du nouvel index (Circulaire)
    if (direction === 'next') {
        rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
    } else if (direction === 'prev') {
        rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;
    }

    const newStream = rotation.streams[rotation.currentIndex];
    console.log(`Cycle Stream vers : ${newStream.channel} (${newStream.viewers} vues)`);

    return res.json({ 
        success: true, 
        channel: newStream.channel, 
        viewers: newStream.viewers 
    });
});

// ==================================================================================
// 7. FONCTIONNALITÉS AVANCÉES (BOOST, RAID, IA, CSV)
// ==================================================================================

// Vérification du statut Boost (Polling frontend)
app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const remainingTime = Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 1000);
        return res.json({ 
            is_boosted: true, 
            channel: CACHE.boostedStream.channel, 
            remaining_seconds: remainingTime 
        });
    }
    // Nettoyage si expiré
    if (CACHE.boostedStream) {
        CACHE.boostedStream = null;
    }
    return res.json({ is_boosted: false });
});

// Activation d'un Boost
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Chaîne manquante." });

    const now = Date.now();
    const COOLDOWN_DURATION = 3 * 60 * 60 * 1000; // 3 heures
    const BOOST_DURATION = 15 * 60 * 1000;        // 15 minutes

    // Vérification du Cooldown
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel]) < COOLDOWN_DURATION) {
        const waitMin = Math.ceil((CACHE.streamBoosts[channel] + COOLDOWN_DURATION - now) / 60000);
        return res.status(429).json({ 
            error: "Cooldown actif.", 
            html_response: `<p style="color:var(--color-ai-action);">❌ Vous devez attendre encore ${waitMin} minutes avant de re-booster cette chaîne.</p>` 
        });
    }

    // Application du Boost
    CACHE.streamBoosts[channel] = now;
    CACHE.boostedStream = { channel: channel, endTime: now + BOOST_DURATION };

    return res.json({ 
        success: true, 
        html_response: `<p style="color:var(--color-primary-pink); font-weight:bold;">🚀 Boost activé avec succès pour ${channel} ! Diffusion prioritaire pendant 15 minutes.</p>` 
    });
});

// Raid Optimisé (Filtre Langue + Viewers)
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    if (!game || !max_viewers) return res.status(400).json({ success: false, error: "Paramètres incomplets." });

    try {
        // 1. Trouver le jeu
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ success: false, error: `Jeu "${game}" introuvable.` });

        const gameId = gameRes.data[0].id;

        // 2. Trouver les streams FR de ce jeu
        // On récupère 100 streams pour avoir du choix
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100&language=fr`);

        // 3. Filtrer selon le critère utilisateur
        const maxV = parseInt(max_viewers);
        const candidates = streamsRes.data.filter(stream => stream.viewer_count <= maxV);
        
        // 4. Sélectionner le meilleur candidat
        // On prend celui qui a le plus de vues PARMI ceux qui sont sous la limite (Optimisation d'impact)
        let target = candidates.sort((a, b) => b.viewer_count - a.viewer_count)[0];
        
        // Fallback
        if (!target && streamsRes.data.length > 0) {
            // Si personne n'est sous la limite, on prend le plus petit disponible
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
                    thumbnail_url: target.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180')
                }
            });
        } else {
            return res.json({ success: false, error: "Aucun streamer français trouvé sur ce jeu." });
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
        prompt = `Agis comme un expert Twitch. Le score de niche calculé est ${niche_score}. Analyse le profil/jeu "${query}". Donne 3 points forts (<ul>) et 3 conseils de contenu (<ul>). Termine par une phrase de motivation <strong>.`;
    } else if (type === 'repurpose') {
        prompt = `Expert TikTok/Shorts. Analyse la VOD "${query}". Suggère 3 moments clés (timestamps fictifs basés sur le titre) pour faire des clips viraux. Format HTML liste <ul>.`;
    }

    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

// Nouvelle fonctionnalité : Best Time
app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    if (!game) return res.status(400).json({ success: false, error: "Jeu manquant." });

    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.json({ success: false, error: "Jeu introuvable." });
        
        const gameData = gameRes.data[0];
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameData.id}&first=100`);
        const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
        
        const prompt = `
            Analyse le jeu Twitch "${gameData.name}".
            Données actuelles: ${streamsRes.data.length} streamers (échantillon), ${totalViewers} viewers total.
            
            En te basant sur la "saturation" (ratio viewers/streamers), génère une réponse HTML :
            1. <h4>Analyse de Saturation</h4> (Est-ce le bon moment ?).
            2. <h4>Meilleurs Créneaux Horaires</h4> (Propose 3 créneaux jour/heure précis).
            3. <strong>Conseil Pro</strong> sur la durée idéale.
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
    if (!data) return res.status(404).send("Aucune donnée de scan disponible.");

    let csvContent = "Metrique,Valeur\n";
    if (data.type === 'user') {
        csvContent += `Type,Streamer\nNom,${data.display_name}\nVues,${data.viewer_count}\nFollowers,${data.total_followers}\nScore,${data.ai_calculated_niche_score}`;
    } else {
        csvContent += `Type,Jeu\nNom,${data.name}\nTotal Viewers,${data.total_viewers}\nTotal Streamers,${data.total_streamers}\nScore,${data.ai_calculated_niche_score}`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(csvContent);
});

// Route racine pour servir le HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// ==================================================================================
// 8. DÉMARRAGE DU SERVEUR
// ==================================================================================

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(` STREAMER HUB V2.0 (PRODUCTION) EN LIGNE`);
    console.log(` Port: ${PORT}`);
    console.log(` Mode: Deep Search Enabled (< 100 vues strict)`);
    console.log(`==================================================\n`);
});
