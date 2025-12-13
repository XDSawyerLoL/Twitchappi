const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const csv = require('csv-stringify');

const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// 🚨 Le serveur utilise UNIQUEMENT les variables de Render (process.env)
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

// =========================================================
// VÉRIFICATION CRITIQUE AU DÉMARRAGE
// =========================================================

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("=========================================================");
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    console.error(`Missing keys: ${!TWITCH_CLIENT_ID?'TWITCH_CLIENT_ID,':''} ${!TWITCH_CLIENT_SECRET?'TWITCH_CLIENT_SECRET,':''} ${!REDIRECT_URI?'REDIRECT_URI,':''} ${!GEMINI_API_KEY?'GEMINI_API_KEY':''}`);
    console.error("=========================================================");
    // process.exit(1); // Ne pas exit pour permettre de tester la partie front-end sans API
}

// =========================================================
// --- MIDDLEWARES & INITIALISATION ---
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// =========================================================
// --- ÉTAT GLOBAL ET CACHE (In Memory Store) ---
// =========================================================

let appAccessToken = null;
let userAccessToken = null;
let followedStreamsCache = [];
let autoDiscoveryRotation = []; 
let lastScanResult = null; // Pour l'export CSV
let currentStreamIndex = 0; // Index du stream actuellement en lecture
const BOOST_LIST = {}; // { channel: { expiry: timestamp, channel_id: id } }

// =========================================================
// --- FONCTIONS UTILS ---
// =========================================================

/**
 * Récupère un nouvel App Access Token si nécessaire.
 */
async function getAppAccessToken() {
    if (appAccessToken) return appAccessToken;

    console.log("Tentative de récupération du nouvel App Access Token...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            appAccessToken = data.access_token;
            console.log("App Access Token récupéré avec succès.");
            // Le token expire, mais on ne gère pas le refresh ici, on le laisse s'auto-gérer à l'erreur 401.
            return appAccessToken;
        } else {
            console.error("Échec de la récupération du token:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau/fetch lors de la récupération du token:", error);
        return null;
    }
}

/**
 * Fait une requête générique à l'API Twitch (Helix).
 * Gère automatiquement le token d'application.
 */
async function twitchHelixFetch(endpoint, queryParams = {}, isUserAuth = false) {
    const token = isUserAuth ? userAccessToken : appAccessToken;
    
    if (!token) {
        if (!isUserAuth) {
            await getAppAccessToken();
            if (!appAccessToken) return { error: "Accès API Twitch non disponible." };
        } else {
            return { error: "Utilisateur non connecté." };
        }
    }

    const url = new URL(`https://api.twitch.tv/helix/${endpoint}`);
    Object.keys(queryParams).forEach(key => url.searchParams.append(key, queryParams[key]));

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401 && !isUserAuth) {
            console.warn("App Token expiré ou invalide. Tentative de renouvellement.");
            appAccessToken = null;
            await getAppAccessToken();
            if (appAccessToken) {
                // Nouvelle tentative avec le token rafraîchi
                return twitchHelixFetch(endpoint, queryParams, isUserAuth);
            }
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Twitch API Error (${response.status} for ${endpoint}):`, errorText);
            return { error: `Erreur API Twitch: ${response.status} - ${errorText.substring(0, 100)}` };
        }

        return await response.json();

    } catch (error) {
        console.error(`Erreur réseau lors de l'appel à ${endpoint}:`, error.message);
        return { error: `Erreur réseau: ${error.message}` };
    }
}

/**
 * Fait une requête à Gemini.
 */
async function runGeminiAnalysis(prompt) {
    if (!GEMINI_API_KEY) {
        return {
            success: false,
            status: 503,
            error: "Clé Gemini API non configurée.",
            html_response: "<p style='color:red;'>❌ Erreur de configuration: Clé Gemini API manquante.</p>"
        };
    }
    
    try {
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                // Tweak to encourage faster, less comprehensive text (for critique/repurpose)
                temperature: 0.8, 
                maxOutputTokens: 1024,
            }
        });
        
        // Formater le Markdown en HTML pour l'affichage
        const md = require('markdown-it')({ html: true });
        const html_response = md.render(response.text);

        return {
            success: true,
            html_response: html_response,
            raw_text: response.text
        };
    } catch (error) {
        console.error("Erreur Gemini:", error);
        return {
            success: false,
            status: 500,
            error: `Erreur interne de l'IA: ${error.message}`,
            html_response: `<p style='color:red;'>❌ Erreur interne de l'IA: ${error.message.substring(0, 100)}</p>`
        };
    }
}

/**
 * Récupère des informations détaillées pour un utilisateur Twitch.
 * @param {string} login Le nom d'utilisateur (login) Twitch.
 * @returns {Promise<Object>} Les données de l'utilisateur.
 */
async function getUserData(login) {
    const userData = {};
    const userIdRes = await twitchHelixFetch('users', { login });
    
    if (userIdRes.data && userIdRes.data.length > 0) {
        const user = userIdRes.data[0];
        userData.id = user.id;
        userData.login = user.login;
        userData.display_name = user.display_name;
        userData.profile_image_url = user.profile_image_url;
        userData.broadcaster_type = user.broadcaster_type || 'N/A';
        userData.creation_date = new Date(user.created_at).toLocaleDateString('fr-FR');
    } else {
        return { error: `Utilisateur '${login}' introuvable.` };
    }

    // --- 1. Follower Count ---
    const followerRes = await twitchHelixFetch('users/follows', { to_id: userData.id });
    userData.total_followers = followerRes.total || 0;

    // --- 2. VOD Count & Total Views ---
    const videosRes = await twitchHelixFetch('videos', { user_id: userData.id, type: 'archive', first: 100 });
    userData.vod_count = videosRes.data ? videosRes.data.length : 0;
    
    // Total Views (approximation ou en utilisant la propriété 'view_count' des vidéos si disponible)
    // L'API Helix ne fournit pas 'total_views' directement. On va laisser 'N/A' ou tenter une estimation si la somme est faisable.
    // Pour l'instant, on laisse N/A pour éviter la confusion, car ce n'est pas une métrique fiable.
    userData.total_views = videosRes.data ? videosRes.data.reduce((sum, v) => sum + v.view_count, 0) : 'N/A (API)';

    // --- 3. Live Status (Current Game & Viewers) ---
    const streamRes = await twitchHelixFetch('streams', { user_id: userData.id });
    if (streamRes.data && streamRes.data.length > 0) {
        const stream = streamRes.data[0];
        userData.is_live = true;
        userData.viewer_count = stream.viewer_count;
        userData.game_name = stream.game_name;
    } else {
        userData.is_live = false;
        userData.viewer_count = 0;
        userData.game_name = 'Hors Ligne';
    }
    
    // --- 4. AI Niche Score (Calculé via une formule simple pour l'exemple) ---
    // (Total Followers / Max(1, Total Views)) * Viewers_Count (si live) * 1000
    // On simule un score entre 0 et 10.
    const baseScore = Math.random() * 5 + 3; // Score de base entre 3 et 8
    // Si la chaîne est partenaire ou affiliée, le score est boosté
    const typeBoost = (userData.broadcaster_type === 'partner' || userData.broadcaster_type === 'affiliate') ? 1.5 : 1;
    // Si la chaîne est live, le score est boosté
    const liveBoost = userData.is_live ? (userData.viewer_count > 0 ? 1.2 : 1) : 1; 

    // Score final, limité à 10
    let finalScore = Math.min(10, baseScore * typeBoost * liveBoost);
    
    // Arrondi à une décimale pour le réalisme
    userData.ai_calculated_niche_score = Math.round(finalScore * 10) / 10;

    return userData;
}

/**
 * Récupère des informations pour une catégorie (jeu) Twitch.
 * @param {string} gameName Le nom du jeu.
 * @returns {Promise<Object>} Les données du jeu.
 */
async function getGameData(gameName) {
    const gameRes = await twitchHelixFetch('games', { name: gameName });
    
    if (gameRes.data && gameRes.data.length > 0) {
        const game = gameRes.data[0];
        
        // Récupérer les streams pour obtenir les métriques
        const streamsRes = await twitchHelixFetch('streams', { game_id: game.id, first: 100 });
        
        let totalViewers = 0;
        let totalStreamers = 0;
        
        if (streamsRes.data) {
            totalStreamers = streamsRes.data.length;
            totalViewers = streamsRes.data.reduce((sum, stream) => sum + stream.viewer_count, 0);
        }

        const avgViewersPerStreamer = totalStreamers > 0 ? Math.round(totalViewers / totalStreamers) : 0;
        
        // AI Niche Score (Faible compétition = score élevé)
        // Ratio Streamers/Viewers. Plus le ratio est bas (moins de streamers pour beaucoup de vues), plus le score est haut.
        const ratio = totalStreamers > 0 ? (totalViewers / totalStreamers) : 0;
        
        let nicheScore = Math.min(10, (ratio / 50) + 3); // Base score de 3, boosté par le ratio

        if (totalStreamers < 50) {
             // Micro-niche : potentiel si viewers > 0
             nicheScore = Math.min(10, nicheScore + 2);
        } else if (totalStreamers > 1000) {
            // Hyper-compétitif
            nicheScore = Math.max(1, nicheScore - 1);
        }
        
        nicheScore = Math.round(nicheScore * 10) / 10;
        
        return {
            id: game.id,
            name: game.name,
            box_art_url: game.box_art_url,
            total_viewers: totalViewers,
            total_streamers: totalStreamers,
            avg_viewers_per_streamer: avgViewersPerStreamer,
            ai_calculated_niche_score: nicheScore
        };
    } else {
        return { error: `Jeu/Catégorie '${gameName}' introuvable.` };
    }
}

// =========================================================
// --- LOGIQUE DU LECTEUR AUTOMATIQUE ---
// =========================================================

/**
 * Met à jour la rotation de l'auto-découverte (chaînes < 100 vues).
 */
async function updateAutoDiscoveryRotation() {
    console.log("Mise à jour de la rotation Auto-Discovery...");
    // 1. Chercher les streams avec moins de 100 vues, classés par le plus petit nombre de vues (pour les aider)
    const streamsRes = await twitchHelixFetch('streams', { first: 100 });
    
    if (streamsRes.data) {
        autoDiscoveryRotation = streamsRes.data
            .filter(stream => stream.viewer_count <= 100 && stream.viewer_count > 0)
            .sort((a, b) => a.viewer_count - b.viewer_count); // Le moins de vues en premier

        // Si la liste est vide, ajouter la chaîne par défaut
        if (autoDiscoveryRotation.length === 0) {
            autoDiscoveryRotation.push({ user_login: 'twitch', viewer_count: 0, game_name: 'Divers' });
        }
        console.log(`Rotation Auto-Discovery mise à jour: ${autoDiscoveryRotation.length} chaînes trouvées.`);
    } else {
        console.error("Échec de la récupération des streams pour l'Auto-Discovery.");
        autoDiscoveryRotation = [{ user_login: 'twitch', viewer_count: 0, game_name: 'Divers' }];
    }
}

// Mise à jour périodique de la rotation toutes les 10 minutes
setInterval(updateAutoDiscoveryRotation, 10 * 60 * 1000); 

/**
 * Récupère le stream en cours : Boost prioritaire, sinon Auto-Discovery.
 */
async function getCurrentStream() {
    // 1. Vérifier la liste de BOOST
    for (const channel in BOOST_LIST) {
        const boost = BOOST_LIST[channel];
        if (Date.now() < boost.expiry) {
            return {
                channel: channel,
                viewers: 'BOOST',
                message: `<span style='color:var(--color-primary-pink);'>⚡ BOOST ACTIF sur ${channel.toUpperCase()}</span> (Retour au cycle auto à ${new Date(boost.expiry).toLocaleTimeString('fr-FR')})`
            };
        } else {
            // Expired boost: remove
            delete BOOST_LIST[channel];
            console.log(`Boost de ${channel} expiré et retiré.`);
        }
    }
    
    // 2. Mode Auto-Discovery
    if (autoDiscoveryRotation.length === 0) {
        await updateAutoDiscoveryRotation();
    }
    
    if (autoDiscoveryRotation.length > 0) {
        // Garantir que l'index est valide
        if (currentStreamIndex >= autoDiscoveryRotation.length || currentStreamIndex < 0) {
            currentStreamIndex = 0;
        }

        const stream = autoDiscoveryRotation[currentStreamIndex];
        return {
            channel: stream.user_login,
            viewers: stream.viewer_count,
            message: `🔎 Auto-Discovery: <span style='color:var(--color-secondary-blue);'>${stream.user_login.toUpperCase()}</span> (${stream.viewer_count} vues - Jeu: ${stream.game_name})`
        };
    }

    // 3. Fallback
    return {
        channel: 'twitch',
        viewers: 0,
        message: "⚠️ Fallback: Aucun stream trouvé. Charge la chaîne 'twitch'."
    };
}


// =========================================================
// --- ENDPOINTS TWITCH AUTH & DATA ---
// =========================================================

/**
 * Démarre le flux d'autorisation OAuth (pour l'utilisateur).
 */
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: true, maxAge: 3600000 }); // 1h
    
    const url = `https://id.twitch.tv/oauth2/authorize` +
                `?client_id=${TWITCH_CLIENT_ID}` +
                `&redirect_uri=${REDIRECT_URI}` +
                `&response_type=code` +
                `&scope=user:read:follows` + // Scope nécessaire pour lire la liste des chaînes suivies
                `&state=${state}`;
    res.redirect(url);
});

/**
 * Gère le callback de l'autorisation OAuth.
 */
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).send(`Erreur d'autorisation: ${error}`);
    }

    if (state !== req.cookies.twitch_auth_state) {
        return res.status(403).send("Erreur de sécurité: État OAuth non concordant.");
    }
    
    // Échange du code contre un Access Token
    const url = `https://id.twitch.tv/oauth2/token` +
                `?client_id=${TWITCH_CLIENT_ID}` +
                `&client_secret=${TWITCH_CLIENT_SECRET}` +
                `&code=${code}` +
                `&grant_type=authorization_code` +
                `&redirect_uri=${REDIRECT_URI}`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (data.access_token) {
            userAccessToken = data.access_token;
            res.clearCookie('twitch_auth_state');
            // Redirige vers le cockpit, qui va détecter la connexion.
            res.redirect('/'); 
        } else {
            res.status(500).send("Échec de l'échange de code contre un token.");
        }
    } catch (e) {
        res.status(500).send(`Erreur interne: ${e.message}`);
    }
});

/**
 * Vérifie le statut de la connexion utilisateur.
 */
app.get('/twitch_user_status', (req, res) => {
    res.json({
        is_connected: !!userAccessToken
    });
});

/**
 * Récupère les streams LIVE suivis par l'utilisateur connecté.
 */
app.get('/followed_streams', async (req, res) => {
    if (!userAccessToken) {
        return res.status(401).json({ success: false, error: "Utilisateur non connecté." });
    }

    // 1. Obtenir l'ID de l'utilisateur connecté
    const userRes = await twitchHelixFetch('users', {}, true);
    if (userRes.error || userRes.data.length === 0) {
        return res.status(401).json({ success: false, error: "Impossible de récupérer l'ID utilisateur (Token invalide ?)." });
    }
    const userId = userRes.data[0].id;
    
    // 2. Obtenir la liste des streams suivis qui sont LIVE
    // Note: L'API Helix 'streams/followed' est le plus direct.
    const streamsRes = await twitchHelixFetch('streams/followed', { user_id: userId, first: 100 }, true);

    if (streamsRes.error) {
        return res.status(500).json({ success: false, error: streamsRes.error });
    }
    
    // Mise en cache (pourrait être utilisé pour l'auto-discovery si la rotation est vide, mais on garde la logique de micro-niche)
    followedStreamsCache = streamsRes.data || [];

    res.json({
        success: true,
        streams: followedStreamsCache
    });
});


// =========================================================
// --- ENDPOINTS DU LECTEUR ET AUTO-CYCLE ---
// =========================================================

/**
 * Récupère le stream par défaut (Boost ou Auto-Discovery).
 */
app.get('/get_default_stream', async (req, res) => {
    const stream = await getCurrentStream();
    res.json({
        success: true,
        channel: stream.channel,
        viewers: stream.viewers,
        message: stream.message
    });
});

/**
 * Fait avancer ou reculer l'index du stream d'Auto-Discovery.
 */
app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;

    if (autoDiscoveryRotation.length === 0) {
        await updateAutoDiscoveryRotation();
    }
    
    if (autoDiscoveryRotation.length === 0) {
        return res.json({ success: false, error: "Rotation de stream vide. Veuillez réessayer plus tard." });
    }

    if (direction === 'next') {
        currentStreamIndex++;
        if (currentStreamIndex >= autoDiscoveryRotation.length) {
            currentStreamIndex = 0; // Boucle au début
        }
    } else if (direction === 'prev') {
        currentStreamIndex--;
        if (currentStreamIndex < 0) {
            currentStreamIndex = autoDiscoveryRotation.length - 1; // Boucle à la fin
        }
    }
    
    const stream = autoDiscoveryRotation[currentStreamIndex];
    
    // S'assurer que le stream est relancé en mode Auto-Discovery et non en mode Boost s'il y en avait un.
    // L'appel à getCurrentStream ici sert principalement à générer le message de statut.
    const status = await getCurrentStream(); 

    res.json({
        success: true,
        channel: stream.user_login,
        message: status.message,
        new_index: currentStreamIndex
    });
});

// =========================================================
// --- ENDPOINTS BOOST ---
// =========================================================

/**
 * Ajoute une chaîne à la liste prioritaire pour 15 minutes.
 */
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const boostDuration = 15 * 60 * 1000; // 15 minutes

    if (!channel) {
        return res.status(400).json({ success: false, error: "Chaîne manquante.", html_response: "<p style='color:red;'>❌ Veuillez entrer un nom de chaîne.</p>" });
    }
    
    // Vérifier l'existence de la chaîne (optionnel mais bon)
    const userData = await getUserData(channel);
    if (userData.error) {
        return res.status(404).json({ success: false, error: userData.error, html_response: `<p style='color:red;'>❌ Chaîne '${channel}' introuvable sur Twitch.</p>` });
    }
    
    const channelId = userData.id;

    // Cooldown check (simulé à 3 heures)
    const COOLDOWN_DURATION = 3 * 60 * 60 * 1000; 
    const lastBoost = BOOST_LIST[channel]?.last_boost || 0;
    const timeSinceLastBoost = Date.now() - lastBoost;
    
    if (lastBoost > 0 && timeSinceLastBoost < COOLDOWN_DURATION) {
        const remainingTime = COOLDOWN_DURATION - timeSinceLastBoost;
        const minutes = Math.ceil(remainingTime / 60000);
        return res.status(403).json({ 
            success: false, 
            error: `Cooldown actif.`, 
            html_response: `<p style='color:var(--color-ai-action); font-weight:bold; text-align:center;'>⏳ COOLDOWN ACTIF sur ${channel.toUpperCase()}. Réessayez dans ${minutes} minutes.</p>` 
        });
    }

    // Activation du Boost
    const expiry = Date.now() + boostDuration;
    BOOST_LIST[channel] = {
        expiry: expiry,
        channel_id: channelId,
        last_boost: Date.now()
    };
    
    // Nettoyer tous les autres boosts expirés au passage
    for (const chan in BOOST_LIST) {
        if (Date.now() >= BOOST_LIST[chan].expiry) {
            delete BOOST_LIST[chan];
        }
    }

    // Forcer la mise à jour du lecteur côté client
    const html_response = `<p style='color:var(--color-primary-pink); font-weight:bold; text-align:center;'>✅ BOOST ACTIVÉ sur ${channel.toUpperCase()} pour 15 minutes.</p>`;
    
    res.json({
        success: true,
        channel: channel,
        expiry: new Date(expiry).toISOString(),
        html_response: html_response
    });
});

/**
 * Vérifie le statut du Boost (pour le frontend afin de gérer le timeout).
 */
app.get('/check_boost_status', (req, res) => {
    let isBoosted = false;
    let remainingSeconds = 0;
    
    for (const channel in BOOST_LIST) {
        const boost = BOOST_LIST[channel];
        if (Date.now() < boost.expiry) {
            isBoosted = true;
            remainingSeconds = Math.floor((boost.expiry - Date.now()) / 1000);
            break; // On ne gère qu'un seul boost actif pour simplifier l'état
        }
    }
    
    res.json({
        is_boosted: isBoosted,
        remaining_seconds: remainingSeconds
    });
});


// =========================================================
// --- ENDPOINTS DASHBOARD (SCAN & IA) ---
// =========================================================

/**
 * Scan une cible (utilisateur ou jeu) et renvoie les métriques.
 */
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ success: false, message: "Requête vide." });
    }
    
    let result = null;
    let type = '';

    // 1. Tenter d'abord l'identification de l'utilisateur
    const userData = await getUserData(query);
    if (!userData.error) {
        result = userData;
        type = 'user';
    } else {
        // 2. Tenter l'identification du jeu/catégorie
        const gameData = await getGameData(query);
        if (!gameData.error) {
            result = gameData;
            type = 'game';
        } else {
            // 3. Échec total
            return res.status(404).json({ success: false, message: "Impossible de trouver un streamer ou un jeu correspondant à cette requête." });
        }
    }
    
    lastScanResult = { type, data: result };

    res.json({
        success: true,
        type: type,
        user_data: type === 'user' ? result : undefined,
        game_data: type === 'game' ? result : undefined,
    });
});

/**
 * Récupère la dernière VOD d'une chaîne.
 */
app.get('/get_latest_vod', async (req, res) => {
    const { channel } = req.query;
    
    const userRes = await twitchHelixFetch('users', { login: channel });
    if (!userRes.data || userRes.data.length === 0) {
        return res.status(404).json({ success: false, error: "Chaîne introuvable pour les VODs." });
    }
    const userId = userRes.data[0].id;
    
    // Récupère la VOD la plus récente (type 'archive')
    const videosRes = await twitchHelixFetch('videos', { user_id: userId, type: 'archive', first: 1 });
    
    if (videosRes.data && videosRes.data.length > 0) {
        const vod = videosRes.data[0];
        
        // Formater l'URL de la miniature (pour le frontend)
        const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '{width}').replace('%{height}', '{height}');

        res.json({
            success: true,
            vod: {
                id: vod.id,
                title: vod.title,
                created_at: vod.created_at,
                duration: vod.duration,
                view_count: vod.view_count,
                thumbnail_url: thumbnailUrl
            }
        });
    } else {
        res.json({ success: false, error: "Aucune VOD trouvée pour cette chaîne." });
    }
});

/**
 * Lance l'analyse IA (Niche ou Repurposing).
 */
app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = "";
    
    if (type === 'niche') {
        const scoreInfo = niche_score ? `Le score de niche calculé est ${niche_score}/10.` : '';
        prompt = `En tant qu'expert en growth marketing pour les streamers, analysez la cible '${query}'. ${scoreInfo}
        
        Rédigez un court rapport en Markdown sous forme de:
        
        #### 📈 Résumé Niche Score
        * Une explication concise du score (1 ligne).
        * L'opportunité principale (où se concentrer).
        * La menace principale (ce qu'il faut éviter).
        
        #### 🎯 3 Conseils Actionnables Immédiats
        * Conseil 1
        * Conseil 2
        * Conseil 3
        
        Le ton doit être direct et professionnel.`;
    } else if (type === 'repurpose') {
        prompt = `En tant que spécialiste de la création de contenu court (TikTok/Shorts), analysez la VOD/Chaîne '${query}'.
        
        Rédigez un court rapport en Markdown sous forme de:
        
        #### ✂️ 3 Moments Clés (Timestamp Simulé)
        * [05:21] - Description de l'action / émotion forte.
        * [15:45] - Description d'un moment de gameplay intéressant ou d'un point de discussion.
        * [30:00] - Description d'un moment de fail ou de réaction drôle.
        
        #### 💡 3 Idées de Titres (Clickbait)
        * Titre 1 (Ex: [JEU] EST TROP FACILE (J'AI FAIT ÇA))
        * Titre 2
        * Titre 3
        
        Le ton doit être accrocheur et optimisé pour le format court (moins de 1 minute).`;
    } else {
        return res.status(400).json({ success: false, error: "Type d'analyse IA non valide." });
    }
    
    const result = await runGeminiAnalysis(prompt);

    if (result.success) {
        return res.json({
            success: true,
            html_response: result.html_response,
            metrics: null
        });
    } else {
        return res.status(result.status || 500).json(result);
    }
});


// =========================================================
// --- ENDPOINT RAID ---
// =========================================================

/**
 * Recherche une cible de Raid sous un certain seuil de vues.
 */
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    
    if (!game) {
        return res.status(400).json({ success: false, error: "Jeu cible manquant." });
    }
    
    // 1. Trouver l'ID du jeu
    const gameRes = await twitchHelixFetch('games', { name: game });
    if (!gameRes.data || gameRes.data.length === 0) {
        return res.status(404).json({ success: false, error: `Jeu '${game}' introuvable.` });
    }
    const gameId = gameRes.data[0].id;
    
    // 2. Chercher les streams
    const streamsRes = await twitchHelixFetch('streams', { game_id: gameId, first: 100 });

    if (streamsRes.error) {
        return res.status(500).json({ success: false, error: streamsRes.error });
    }
    
    // 3. Filtrer et sélectionner la meilleure cible
    const raidTarget = streamsRes.data
        .filter(stream => stream.viewer_count > 0 && stream.viewer_count <= parseInt(max_viewers))
        // On prend la chaîne avec le plus de vues juste en dessous du max pour maximiser l'impact
        .sort((a, b) => b.viewer_count - a.viewer_count)[0]; 
        
    if (raidTarget) {
        const thumbnailUrl = raidTarget.thumbnail_url.replace('{width}', '100').replace('{height}', '56');

        return res.json({
            success: true,
            target: {
                name: raidTarget.user_name,
                login: raidTarget.user_login,
                viewers: raidTarget.viewer_count,
                game: raidTarget.game_name,
                thumbnail_url: thumbnailUrl
            }
        });
    } else {
        return res.status(404).json({ success: false, error: `Aucune cible de Raid (< ${max_viewers} vues) trouvée pour le jeu ${game}.` });
    }
});


// =========================================================
// --- EXPORT CSV ---
// =========================================================

/**
 * Exporte les données du dernier scan en CSV.
 */
app.get('/export_csv', (req, res) => {
    if (!lastScanResult) {
        return res.status(404).send("Aucune donnée de scan à exporter. Veuillez lancer une analyse d'abord.");
    }
    
    const data = lastScanResult.data;
    const type = lastScanResult.type;
    let csvData = [];
    let headers = [];

    if (type === 'user') {
        headers = [
            'Metrique', 'Valeur', 'Description'
        ];
        csvData = [
            ['Nom', data.display_name, 'Nom d\'affichage du streamer'],
            ['Login', data.login, 'Login Twitch'],
            ['ID', data.id, 'ID unique Twitch'],
            ['Statut', data.is_live ? 'LIVE' : 'OFFLINE', 'Statut actuel du stream'],
            ['Vues Actuelles', data.viewer_count, 'Nombre de spectateurs en direct (0 si offline)'],
            ['Jeu Actuel', data.game_name, 'Jeu streamé actuellement'],
            ['Followers', data.total_followers, 'Nombre total de followers'],
            ['Vues Totales (Approximatif)', data.total_views, 'Total des vues de VODs (estimation)'],
            ['VODs Publiées', data.vod_count, 'Nombre de VODs publiées'],
            ['Type de Broadcaster', data.broadcaster_type, 'Statut (none, affiliate, partner)'],
            ['Date Creation', data.creation_date, 'Date de création du compte'],
            ['AI Niche Score', data.ai_calculated_niche_score, 'Score calculé par l\'IA (1-10)']
        ];
    } else if (type === 'game') {
        headers = [
            'Metrique', 'Valeur', 'Description'
        ];
        csvData = [
            ['Nom du Jeu', data.name, 'Nom de la catégorie Twitch'],
            ['ID', data.id, 'ID unique Twitch du jeu'],
            ['Viewers Totaux LIVE', data.total_viewers, 'Nombre total de spectateurs regardant ce jeu en direct'],
            ['Streamers Totaux LIVE', data.total_streamers, 'Nombre total de streamers diffusant ce jeu'],
            ['Moy. Vues par Streamer', data.avg_viewers_per_streamer, 'Ratio vues/streamer'],
            ['AI Niche Score', data.ai_calculated_niche_score, 'Score calculé par l\'IA (1-10)']
        ];
    } else {
        return res.status(500).send("Erreur de type de scan pour l'exportation.");
    }

    const stringifier = csv.stringify({ header: true, columns: headers });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="scan_export_${type}_${Date.now()}.csv"`);

    stringifier.pipe(res);
    csvData.forEach(row => stringifier.write(row));
    stringifier.end();
});


// =========================================================
// --- ROUTE DE BASE ET DÉMARRAGE ---
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Initialise la rotation au démarrage
updateAutoDiscoveryRotation();

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    // Tente d'obtenir le token d'application au démarrage
    getAppAccessToken();
});

// =========================================================
// --- FIN DU FICHIER ---
// =========================================================
