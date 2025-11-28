
// --- IMPORTS ESM ---
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch'; 
import bodyParser from 'body-parser';
import path from 'path';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import admin from "firebase-admin"; 

// Import des utilitaires ESM pour définir __dirname et __filename
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// --- POLYFILL pour __dirname et __filename en mode ESM ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// --------------------------------------------------------

const app = express();

// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
// Configuration de l'API Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; 

// --- Stockage d'État pour la Connexion Utilisateur (OAuth) ---
let currentUserToken = null; 
let currentUsername = null;
let currentTwitchUserId = null;

// --- Stockage d'État pour le Token Applicatif (Client Credentials) ---
let TWITCH_ACCESS_TOKEN = null;
let TWITCH_TOKEN_EXPIRY = 0;

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.get('/favicon.ico', (req, res) => res.status(204).end()); 

// =========================================================
// Firebase Admin SDK (Initialisation)
// =========================================================

let rtdb, firestore;

try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
        const firebaseCredentials = JSON.parse(serviceAccountJson);
        
        admin.initializeApp({
            credential: admin.credential.cert(firebaseCredentials),
            // REMPLACEZ CETTE URL par l'URL de votre base de données :
            databaseURL: "https://votre-projet-firebase.firebaseio.com" 
        });
        rtdb = admin.database();
        firestore = admin.firestore();
        console.log("SUCCESS: Firebase initialisé.");
    } else {
        console.log("INFO: FIREBASE_SERVICE_ACCOUNT non trouvé. Le serveur fonctionne sans DB.");
    }
} catch (e) {
    console.error("ERREUR CRITIQUE lors de l'initialisation Firebase:", e.message);
}

// =========================================================
// FONCTIONS D'AUTHENTIFICATION TWITCH (Client Credentials - APPLI)
// =========================================================

/**
 * Obtient ou rafraîchit le token applicatif Twitch.
 * @returns {Promise<string|null>} Le token ou null en cas d'échec.
 */
async function getTwitchAccessToken() {
    if (TWITCH_ACCESS_TOKEN && Date.now() < TWITCH_TOKEN_EXPIRY) {
        return TWITCH_ACCESS_TOKEN;
    }

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        console.error("FATAL: Impossible d'obtenir le Token Applicatif. Client ID ou Secret manquant.");
        return null;
    }

    console.log("Obtention d'un nouveau Token Applicatif Twitch...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok && data.access_token) {
            TWITCH_ACCESS_TOKEN = data.access_token;
            // Expiration 5 minutes avant l'heure réelle
            TWITCH_TOKEN_EXPIRY = Date.now() + (data.expires_in * 1000) - 300000; 
            console.log("SUCCESS: Token Applicatif Twitch obtenu.");
            return TWITCH_ACCESS_TOKEN;
        } else {
            console.error("ERREUR Token Applicatif Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("ERREUR réseau Auth Twitch (Applicatif):", error.message);
        return null;
    }
}

// =========================================================
// FLUX D'AUTHENTIFICATION TWITCH (OAuth - UTILISATEUR)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !REDIRECT_URI) {
        return res.status(500).send("Configuration Twitch manquante.");
    }
    
    const scopes = 'user:read:follows viewing_activity_read';
    const state = crypto.randomBytes(16).toString('hex');
    
    res.cookie('oauth_state', state, { httpOnly: true, maxAge: 600000 }); 

    const twitchAuthURL = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scopes}&state=${state}`;
    
    console.log("Démarrage OAuth, redirection vers Twitch...");
    res.redirect(twitchAuthURL);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;

    const expectedState = req.cookies.oauth_state;
    if (state !== expectedState) {
        return res.redirect(`/?error=${encodeURIComponent('Erreur de sécurité (CSRF).')}`);
    }
    res.clearCookie('oauth_state'); 

    if (error || !code) {
        return res.redirect(`/?error=${encodeURIComponent('Connexion Twitch refusée ou code manquant.')}`);
    }

    try {
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI 
            }).toString()
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error("ÉCHEC DE L'ÉCHANGE DE CODE D'UTILISATEUR:", tokenData);
            return res.redirect(`/?error=${encodeURIComponent('Échec de l\'obtention du token d\'accès.')}`);
        }

        currentUserToken = tokenData.access_token;

        const userResponse = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${currentUserToken}`,
                'Client-Id': TWITCH_CLIENT_ID
            }
        });
        const userData = await userResponse.json();
        
        if (userData.data && userData.data.length > 0) {
            currentUsername = userData.data[0].display_name;
            currentTwitchUserId = userData.data[0].id;
        }

        return res.redirect('/'); 

    } catch (error) {
        console.error("Erreur critique lors du callback Twitch:", error);
        return res.redirect(`/?error=${encodeURIComponent('Erreur serveur lors de la connexion Twitch.')}`);
    }
});

app.get('/twitch_logout', (req, res) => {
    currentUserToken = null;
    currentUsername = null;
    currentTwitchUserId = null;
    res.redirect('/');
});

app.get('/twitch_user_status', (req, res) => {
    res.json({
        is_connected: !!currentUserToken,
        username: currentUsername
    });
});

// =========================================================
// FONCTIONS HELPER TWITCH
// =========================================================

const formatNumber = (num) => {
    if (typeof num !== 'number') return num;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

async function getTwitchUsersDetails(userIds, token) {
    if (!userIds || userIds.length === 0 || !token) return {};
    
    const query = userIds.map(id => `id=${id}`).join('&');
    const url = `https://api.twitch.tv/helix/users?${query}`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            console.error(`Erreur Twitch Helix getTwitchUsersDetails (HTTP ${response.status})`);
            return {};
        }
        
        const data = await response.json();
        const userMap = {};
        if (data.data) {
            data.data.forEach(user => {
                userMap[user.id] = {
                    profile_image_url: user.profile_image_url
                };
            });
        }
        return userMap;
    } catch (e) {
        console.error("Erreur réseau getTwitchUsersDetails:", e);
        return {};
    }
}

async function getGameId(gameName, token) {
    if (!gameName || !token) return null;
    const searchUrl = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`;
    const response = await fetch(searchUrl, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    if (response.status !== 200) {
        console.error(`Erreur Twitch Helix getGameId (HTTP ${response.status})`);
        return null;
    }
    const data = await response.json();
    return data.data.length > 0 ? data.data[0].id : null;
}

async function fetchUserDetailsForScan(userLogin, token) {
    if (!userLogin || !token) return null;

    try {
        const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(userLogin)}`;
        const userRes = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });

        if (userRes.status !== 200) return null;

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) return null;

        const user = userData.data[0];

        const followRes = await fetch(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );
        const followData = await followRes.json();
        
        return {
            login: user.login,
            display_name: user.display_name,
            followers: formatNumber(followData.total || 0),
            total_views: formatNumber(user.view_count || 0),
            description: user.description || 'Description non fournie.',
            profile_image_url: user.profile_image_url
        };

    } catch (e) {
        console.error("Erreur fetch user details for scan:", e);
        return null;
    }
}

async function getStreamerDetails(userLogin, token) {
    // Fonction simplifiée (non critique pour le bug actuel)
    // Elle est laissée vide pour les autres routes qui pourraient en avoir besoin.
    // Votre front-end utilise principalement fetchUserDetailsForScan et is_live.
    return {
        username: userLogin,
        is_live: false,
        title: 'Hors ligne',
        game_name: 'N/A',
        viewer_count: 0,
        follower_count: 0,
        tags: [],
    };
}

// =========================================================
// FONCTION DE REPRISE POUR L'API GEMINI (Optimisée)
// =========================================================

async function callGeminiApiWithRetry(apiUrl, payload, maxRetries = 5) {
    let lastError = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                return response.json();
            } else if (response.status === 429 || response.status >= 500) {
                lastError = new Error(`HTTP ${response.status} sur tentative ${i + 1}`);
            } else {
                const errorText = await response.text();
                try {
                    const errorJson = JSON.parse(errorText);
                    throw new Error(`Gemini API returned status ${response.status}: ${JSON.stringify(errorJson)}`);
                } catch {
                     throw new Error(`Gemini API returned status ${response.status}: ${errorText.substring(0, 100)}...`);
                }
            }
        } catch (error) {
            lastError = error;
        }

        const delay = Math.pow(2, i) * 1000;
        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`Échec de l'appel à l'API Gemini après ${maxRetries} tentatives. Dernière erreur: ${lastError?.message || 'Inconnue'}`);
}


// =========================================================
// ROUTES API
// =========================================================

// Route Firebase Test (si Firebase est initialisé)
app.get('/firebase_test', async (req, res) => {
    if (!rtdb) return res.status(503).json({ message: "Firebase non initialisé." });
    try {
        await rtdb.ref("server_status").set({ online: true, timestamp: Date.now() });
        res.json({ message: "Firebase fonctionne ✔" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// 1. GAME ID
app.get('/gameid', async (req, res) => {
    const token = await getTwitchAccessToken(); 
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const id = await getGameId(req.query.name, token);
    if (id) res.json({ game_id: id, name: req.query.name });
    else res.status(404).json({ message: "Jeu non trouvé" });
});

// 2. RANDOM SCAN (ALÉATOIRE LARGE)
app.get('/random', async (req, res) => {
    const token = await getTwitchAccessToken(); 
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    // Simplifié pour utiliser une route plus rapide
    let url = `https://api.twitch.tv/helix/streams?first=20&language=fr`; 
    if (req.query.game_id) url += `&game_id=${req.query.game_id}`;

    try {
        const response = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const streams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0);
        if (streams.length === 0) return res.status(404).json({ message: "Aucun stream trouvé" });

        const randomStream = streams[Math.floor(Math.random() * streams.length)];
        // Retourne juste le login et les stats brutes
        res.json({ username: randomStream.user_login, viewer_count: randomStream.viewer_count, status: 'ok' });

    } catch (e) {
        res.status(500).json({ message: "Erreur serveur scan aléatoire", error: e.message });
    }
});


// 3. DETAILS (Détails d'un Streamer)
app.get('/details', async (req, res) => {
    const token = await getTwitchAccessToken(); 
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const details = await fetchUserDetailsForScan(req.query.login, token);
    if (details) res.json({ streamer: details });
    else res.status(404).json({ message: "Streamer introuvable" });
});

// 4. RANDOM SMALL STREAMER (< 100 Viewers)
app.get('/random_small_streamer', async (req, res) => {
    const token = await getTwitchAccessToken(); 
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const url = `https://api.twitch.tv/helix/streams?first=100&language=fr`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const smallStreams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0 && s.viewer_count < 100);

        if (smallStreams.length === 0) {
            // Fallback: si aucun petit stream n'est trouvé, on retourne un grand
            const allLiveStreams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0);
            if (allLiveStreams.length > 0) {
                const fallbackStream = allLiveStreams[Math.floor(Math.random() * allLiveStreams.length)];
                return res.json({ username: fallbackStream.user_login, status: 'fallback_random', viewer_count: fallbackStream.viewer_count });
            }
            return res.status(404).json({ message: "Aucun stream live trouvé." });
        }

        const randomSmallStream = smallStreams[Math.floor(Math.random() * smallStreams.length)];
        res.json({ username: randomSmallStream.user_login, viewer_count: randomSmallStream.viewer_count, status: 'ok' });

    } catch (e) {
        res.status(500).json({ message: "Erreur serveur pour le scan petit streamer" });
    }
});


// 5. BOOST (Placeholder)
app.post('/boost', (req, res) => {
    res.json({ message: `Boost activé pour ${req.body.channelName}`, status: 'ok' });
});

// 6. IA : Gère tous les diagnostics (Stream, Niche, Repurpose, Trend)
app.post('/critique_ia', async (req, res) => {
    const { type, title, game, tags, channel } = req.body;
    
    if (!GEMINI_API_KEY) {
        return res.status(503).json({ error: "IA désactivée. Clé manquante.", html_critique: "Service IA indisponible (Clé manquante)." });
    }

    let systemPrompt, userQuery;
    let tools = []; 
    let maxTokens = 1500; 
    
    if (type === 'niche') {
        const nicheGame = game || req.body.nicheGame;
        if (!nicheGame) { return res.status(400).json({ error: "Jeu ou Niche manquant pour l'analyse." }); }
        systemPrompt = "Tu es un analyste de marché Twitch spécialisé. Fournis une analyse détaillée des opportunités et des menaces (SWOT simplifié) pour streamer sur le jeu/niche donné. Utilise des listes à puces et des titres en Markdown pour formater la réponse. Sois professionnel et factuel.";
        userQuery = `Analyse de niche pour le jeu : "${nicheGame}". Quels sont les angles uniques et les mots-clés de niche à cibler pour la croissance?`;
        tools = [{ "google_search": {} }]; 
    } else if (type === 'repurpose') {
        const repurposeChannel = channel;
         if (!repurposeChannel) { return res.status(400).json({ error: "Nom de chaîne manquant pour l'analyse de Repurposing." }); }
        systemPrompt = "Tu es un expert en Repurposing de contenu. Basé sur le nom du streamer, propose 3 idées de courts-métrages (Shorts, TikTok) et 1 idée de vidéo YouTube plus longue pour le contenu de ce streamer. Utilise des titres en Markdown pour chaque idée. Fais des suggestions concrètes (par exemple, 'Clip du moment où il a raté le tir').";
        userQuery = `Propose des idées de Repurposing de contenu pour le streamer (hypotthétique) : "${repurposeChannel}".`;
    } else if (type === 'trend') {
        systemPrompt = "Tu es un Détecteur de Tendances Twitch. Sur la base des données de recherche disponibles, identifie la prochaine niche/jeu émergent et explique pourquoi en 4-5 phrases max. Ta réponse doit être en Markdown gras et se concentrer uniquement sur les tendances de streaming/jeux vidéo.";
        userQuery = "Détecte et analyse la prochaine grande tendance (jeu, catégorie, type de contenu) sur Twitch pour les prochains mois. Base ta réponse sur la recherche web.";
        tools = [{ "google_search": {} }]; 
    } else if (title && game) { 
        systemPrompt = "Tu es un expert en marketing et en croissance de chaînes Twitch. Ton objectif est de fournir une analyse critique, constructive et très concise (max 3 phrases) sur le potentiel de croissance d'un stream basé sur son titre, son jeu et ses tags. Ton ton doit être professionnel et encourageant.";
        userQuery = `Analyse le stream avec ces informations : Titre : "${title}". Jeu : "${game}". Tags : "${tags?.join(', ') || 'aucun'}".`;
        maxTokens = 250; 
    } else {
        return res.status(400).json({ error: "Type d'analyse IA ou données d'entrée manquantes invalides." });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { maxOutputTokens: maxTokens }, 
            ...(tools.length > 0 && { tools: tools })
        };

        const result = await callGeminiApiWithRetry(apiUrl, payload);
        const candidate = result.candidates?.[0];
        
        if (candidate && candidate.content?.parts?.[0]?.text) {
            const generatedText = candidate.content.parts[0].text;
            res.json({ html_critique: generatedText });
        } else {
            console.error("Réponse API Gemini vide ou inattendue:", JSON.stringify(result));
            res.status(500).json({ error: "Erreur lors de la génération de la critique par l'IA.", html_critique: "Une erreur interne s'est produite (Réponse vide)." });
        }

    } catch (error) {
        console.error("Erreur critique catch /critique_ia:", error.message);
        let userErrorMessage = "Une erreur de connexion interne est survenue. Le service IA est temporairement indisponible.";

        if (error.message.includes("API returned status 40") || error.message.includes("API returned status 401")) {
            userErrorMessage = "Erreur de configuration de l'API. La clé Gemini est probablement invalide ou manquante.";
        }

        res.status(500).json({ error: `Erreur interne lors de l'appel à l'IA: ${error.message}`, html_critique: userErrorMessage });
    }
});


// 7. FOLLOWED STREAMS (Utilise le token UTILISATEUR & Avatars)
app.get('/followed_streams', async (req, res) => {
    if (!currentUserToken || !currentTwitchUserId) { 
        return res.status(401).json({ message: "Utilisateur non connecté via Twitch.", code: 'NO_AUTH' });
    }

    try {
        const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${currentTwitchUserId}`, {
            headers: {
                'Client-Id': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${currentUserToken}` 
            }
        });

        if (!streamsResponse.ok) {
            return res.status(streamsResponse.status).json({ message: "Erreur lors de l'appel Twitch API.", status: streamsResponse.status });
        }

        const streamsData = await streamsResponse.json();
        const liveStreams = streamsData.data || [];

        if (liveStreams.length === 0) {
            return res.json({ data: [] });
        }
        
        const userIds = liveStreams.map(s => s.user_id);
        const appToken = await getTwitchAccessToken(); 

        const userDetailsMap = await getTwitchUsersDetails(userIds, appToken);
        
        const enhancedStreams = liveStreams.map(stream => ({
            ...stream,
            profile_image_url: userDetailsMap[stream.user_id]?.profile_image_url || 'https://static-cdn.jtvnw.net/jtv_user_pictures/default_profile.png'
        }));
        
        return res.json({ data: enhancedStreams });

    } catch (error) {
        console.error("Erreur serveur interne /followed_streams:", error);
        res.status(500).json({ message: "Erreur serveur interne." });
    }
});


// 8. IS LIVE CHECK
app.get('/twitch_is_live', async (req, res) => {
    const channelName = req.query.channel;

    if (!channelName) {
        return res.status(400).json({ is_live: false, message: "Nom de chaîne manquant." });
    }

    const token = await getTwitchAccessToken(); 
    if (!token) return res.status(500).json({ is_live: false, message: "Erreur Auth Twitch (Token Applicatif)" });
    
    try {
        const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channelName)}`;
        const response = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();

        const isLive = data.data && data.data.length > 0;
        
        res.json({ 
            is_live: isLive, 
            viewer_count: isLive ? data.data[0].viewer_count : 0,
            title: isLive ? data.data[0].title : '',
            game_name: isLive ? data.data[0].game_name : ''
        });

    } catch (e) {
        console.error("Erreur check is live:", e);
        res.status(500).json({ is_live: false, message: "Erreur serveur vérification live." });
    }
});

// 9. SCAN ET RÉSULTATS (Jeu ou Utilisateur)
app.get('/scan_results', async (req, res) => {
    const query = req.query.query ? req.query.query.trim() : '';

    if (!query) return res.status(400).json({ error: "Paramètre 'query' manquant." });
    
    const token = await getTwitchAccessToken();
    if (!token) return res.status(503).json({ error: "Erreur d'authentification Twitch (Token applicatif)." });

    const gameId = await getGameId(query, token);
    
    if (gameId) {
        try {
            const streamsUrl = `https://api.twitch.tv/helix/streams?game_id=${gameId}&first=10`;
            const streamsRes = await fetch(streamsUrl, {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            
            const streamsData = await streamsRes.json();
            const streams = streamsData.data || [];

            return res.json({
                type: "game",
                streams: streams.map(s => ({
                    user_name: s.user_login,
                    display_name: s.user_name,
                    viewer_count: s.viewer_count,
                    game_name: s.game_name,
                    thumbnail_url: s.thumbnail_url 
                }))
            });

        } catch (e) {
            return res.status(500).json({ error: "Erreur interne lors du scan de jeu." });
        }

    } else {
        const userData = await fetchUserDetailsForScan(query, token);
        
        if (userData) {
            return res.json({ type: "user", user_data: userData });
        } else {
            return res.json({ type: "none", message: `Aucun résultat trouvé pour '${query}'.` });
        }
    }
});


// =========================================================
// Configuration des Routes Statiques (CORRECTION CRITIQUE ici)
// =========================================================

app.get('/', (req, res) => {
    // La route principale sert la page d'accueil
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});


// --- Démarrage du Serveur ---
app.listen(PORT, () => {
    console.log(`Serveur API actif sur le port ${PORT}`);
    getTwitchAccessToken(); // Tentative d'obtenir le token applicatif dès le démarrage
});
