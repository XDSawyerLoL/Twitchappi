const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // NOTE: Ceci doit être présent pour Node < 18
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin"); // Assurons-nous que cette dépendance est au top

const app = express();

// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
// Utilisation du modèle Flash pour les analyses, incluant la recherche (grounding)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// CORRIGÉ: Remplacé le nom du modèle preview par le nom stable
const GEMINI_MODEL = "gemini-2.5-flash"; 

// --- DEBUG : Vérification des clés ---
if (GEMINI_API_KEY) {
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    // Avertissement critique si la clé IA manque
    console.error("FATAL DEBUG: GEMINI_API_KEY est absente ou vide. L'IA est DÉSACTIVÉE et les routes /critique_ia peuvent échouer avec 503.");
}
console.log(`DEBUG CONFIG TWITCH: Client ID: ${TWITCH_CLIENT_ID ? 'OK' : 'MANQUANT'}, Secret: ${TWITCH_CLIENT_SECRET ? 'OK' : 'MANQUANT'}, Redirect URI: ${REDIRECT_URI ? 'OK' : 'MANQUANT'}`);

// --- Stockage d'État pour la Connexion Utilisateur (OAuth) ---
let currentUserToken = null; // Token d'Accès Utilisateur
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

// Gère l'erreur cosmétique du favicon
app.get('/favicon.ico', (req, res) => res.status(204).end()); 

// =========================================================
// Firebase Admin SDK (Laissé tel quel)
// =========================================================

let firebaseCredentials;
var rtdb, firestore;

try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
        firebaseCredentials = JSON.parse(serviceAccountJson);
        console.log("Credentials Firebase chargées depuis la variable d'environnement.");
    } else {
        console.log("Variable d'environnement FIREBASE_SERVICE_ACCOUNT non trouvée. Le serveur continue sans DB...");
    }
    
    if (firebaseCredentials) {
        admin.initializeApp({
            credential: admin.credential.cert(firebaseCredentials),
            // 👉 REMPLACEZ LA LIGNE CI-DESSOUS par l'URL de votre base de données :
            databaseURL: "https://TON_PROJET.firebaseio.com"
        });
        rtdb = admin.database();
        firestore = admin.firestore();
    }
} catch (e) {
    console.error("Erreur critique lors de l'initialisation Firebase. Le serveur continue sans DB:", e.message);
}

// =========================================================
// FONCTIONS D'AUTHENTIFICATION TWITCH (Client Credentials - APPLI)
// =========================================================

// --- Fonction pour obtenir un token Twitch (Applicatif) ---
async function getTwitchAccessToken() {
    if (TWITCH_ACCESS_TOKEN && Date.now() < TWITCH_TOKEN_EXPIRY) {
        return TWITCH_ACCESS_TOKEN;
    }

    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        console.error("FATAL: Impossible d'obtenir le Token Applicatif. Client ID ou Secret est manquant.");
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
            console.log("Token Applicatif Twitch obtenu avec succès.");
            return TWITCH_ACCESS_TOKEN;
        } else {
            console.error("Erreur Token Applicatif Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau Auth Twitch (Applicatif):", error.message);
        return null;
    }
}

// =========================================================
// FLUX D'AUTHENTIFICATION TWITCH (OAuth - UTILISATEUR)
// =========================================================

/**
 * 🔑 Étape 1: Démarrage de l'Authentification (GET /twitch_auth_start)
 */
app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !REDIRECT_URI) {
        return res.status(500).send("Configuration Twitch manquante.");
    }
    
    // Scopes nécessaires pour l'application
    const scopes = 'user:read:follows viewing_activity_read';
    const state = crypto.randomBytes(16).toString('hex');
    
    // Stocker le 'state' dans un cookie pour la vérification de sécurité au retour
    res.cookie('oauth_state', state, { httpOnly: true, maxAge: 600000 }); 

    const twitchAuthURL = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scopes}&state=${state}`;
    
    console.log("Démarrage OAuth, redirection vers Twitch...");
    res.redirect(twitchAuthURL);
});

/**
 * 🔑 Étape 2: Callback de Twitch et Échange de Code (GET /twitch_auth_callback)
 */
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    const expectedState = req.cookies.oauth_state;
    if (state !== expectedState) {
        // En cas de mismatch de 'state' (attaque CSRF), on redirige avec erreur.
        return res.redirect(`/?error=${encodeURIComponent('Erreur de sécurité (CSRF).')}`);
    }
    res.clearCookie('oauth_state'); // Nettoyer le cookie après vérification

    if (error) {
        console.error(`Erreur d'autorisation Twitch: ${error_description}`);
        return res.redirect(`/?error=${encodeURIComponent('Connexion Twitch refusée.')}`);
    }

    if (!code) {
        return res.redirect(`/?error=${encodeURIComponent('Code d\'autorisation manquant.')}`);
    }

    try {
        console.log("DEBUG: Tentative d'échange de code avec les paramètres suivants:");
        console.log(` - Client ID: ${TWITCH_CLIENT_ID ? 'CHARGÉ' : 'MANQUANT'}`);
        console.log(` - Client Secret: ${TWITCH_CLIENT_SECRET ? 'CHARGÉ' : 'MANQUANT'}`);
        console.log(` - Redirect URI: ${REDIRECT_URI}`);
        console.log(` - Code: ${code.substring(0, 10)}...`); // N'affiche que le début

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
            console.error("ÉCHEC DE L'ÉCHANGE DE CODE D'UTILISATEUR (RÉPONSE TWITCH):", tokenData);
            return res.redirect(`/?error=${encodeURIComponent('Échec de l\'obtention du token d\'accès.')}`);
        }

        currentUserToken = tokenData.access_token;

        // Récupérer l'ID et le nom de l'utilisateur
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
            console.log(`SUCCESS: Utilisateur connecté : ${currentUsername} (${currentTwitchUserId})`);
        }

        // Redirection vers la page d'accueil après succès
        return res.redirect('/'); 

    } catch (error) {
        console.error("Erreur critique lors du callback Twitch:", error);
        return res.redirect(`/?error=${encodeURIComponent('Erreur serveur lors de la connexion Twitch.')}`);
    }
});

/**
 * 🔑 Route de Déconnexion (GET /twitch_logout)
 */
app.get('/twitch_logout', (req, res) => {
    currentUserToken = null;
    currentUsername = null;
    currentTwitchUserId = null;
    res.redirect('/');
});


/**
 * 🔑 Route pour vérifier le statut de connexion (GET /twitch_user_status)
 */
app.get('/twitch_user_status', (req, res) => {
    res.json({
        is_connected: !!currentUserToken,
        username: currentUsername
    });
});

// =========================================================
// FONCTIONS HELPER TWITCH (Utilisent le token Applicatif)
// =========================================================

/**
 * Helper pour formater les grands nombres (1500000 -> 1.5M)
 */
const formatNumber = (num) => {
    if (typeof num !== 'number') return num;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

async function getTwitchUsersDetails(userIds, token) {
    if (!userIds || userIds.length === 0 || !token) return {};
    
    // Construction de la query string: ?id=id1&id=id2&...
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

/**
 * Récupère les détails spécifiques nécessaires pour l'affichage des stats utilisateur sur le scan.
 */
async function fetchUserDetailsForScan(userLogin, token) {
    if (!userLogin || !token) return null;

    try {
        const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(userLogin)}`;
        const userRes = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });

        if (userRes.status !== 200) {
            console.error(`Erreur Twitch Helix fetchUserDetailsForScan (HTTP ${userRes.status})`);
            return null;
        }

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) return null;

        const user = userData.data[0];

        // Récupération du nombre total de followers (nécessite une autre requête)
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


// La fonction getStreamerDetails est complexe et non utilisée directement par le nouveau scan, mais je la laisse pour les autres routes.
async function getStreamerDetails(userLogin, token) {
    if (!userLogin || !token) return null;

    try {
        const userRes = await fetch(
            `https://api.twitch.tv/helix/users?login=${encodeURIComponent(userLogin)}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );

        if (userRes.status !== 200) return null;

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) return null;

        const user = userData.data[0];

        const streamRes = await fetch(
            `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(userLogin)}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );
        const streamData = await streamRes.json();
        const stream = streamData.data && streamData.data.length > 0 ? streamData.data[0] : null;

        const followRes = await fetch(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );
        const followData = await followRes.json();

        return {
            username: user.login,
            user_id: user.id,
            is_live: !!stream,
            title: stream ? stream.title : 'Hors ligne',
            game_name: stream ? stream.game_name : 'Non spécifié',
            viewer_count: stream ? stream.viewer_count : 0,
            follower_count: followData.total || 0,
            tags: stream?.tags || [],
        };
    } catch (e) {
        console.error("Erreur details streamer:", e);
        return null;
    }
}

// =========================================================
// FONCTION DE REPRISE POUR L'API GEMINI
// =========================================================

/**
 * Appelle l'API Gemini avec une stratégie de reprise exponentielle en cas d'échec réseau ou serveur.
 * @param {string} apiUrl L'URL complète de l'API.
 * @param {object} payload Le corps de la requête.
 * @param {number} maxRetries Le nombre maximum de tentatives.
 * @returns {Promise<object>} Le JSON de la réponse de l'API.
 */
async function callGeminiApiWithRetry(apiUrl, payload, maxRetries = 5) {
    let lastError = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            // Si la réponse est successful (200-299), on la retourne
            if (response.ok) {
                return response.json();
            } else if (response.status === 429 || response.status >= 500) {
                // Erreurs de serveur (5xx) ou Too Many Requests (429): on retente
                lastError = new Error(`HTTP ${response.status} sur tentative ${i + 1}`);
                // On continue la boucle pour le backoff
            } else {
                // Erreurs non retryable (400, 401, 403, etc.): on lève une erreur immédiatement
                const errorText = await response.text();
                // Tente d'analyser le JSON, sinon utilise le texte brut
                try {
                    const errorJson = JSON.parse(errorText);
                    console.error(`Gemini API Error (HTTP ${response.status}):`, JSON.stringify(errorJson));
                    throw new Error(`Gemini API returned status ${response.status}: ${JSON.stringify(errorJson)}`);
                } catch {
                     console.error(`Gemini API Error (HTTP ${response.status}):`, errorText);
                     throw new Error(`Gemini API returned status ${response.status}: ${errorText.substring(0, 100)}...`);
                }
            }
        } catch (error) {
            // Erreur réseau: on retente
            lastError = error;
        }

        // Logique de backoff exponentiel: 1s, 2s, 4s, 8s, ...
        const delay = Math.pow(2, i) * 1000;
        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    // Si la boucle se termine sans succès, on lève l'erreur finale
    throw new Error(`Failed to call Gemini API after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
}


// =========================================================
// ROUTES API (Production Ready)
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

    let url = `https://api.twitch.tv/helix/streams?first=100&language=fr`;
    if (req.query.game_id) url += `&game_id=${req.query.game_id}`;

    try {
        const response = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const streams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0);
        if (streams.length === 0) return res.status(404).json({ message: "Aucun stream trouvé" });

        const randomStream = streams[Math.floor(Math.random() * streams.length)];
        const details = await getStreamerDetails(randomStream.user_login, token);
        if (details) res.json({ streamer: details });
        else res.status(404).json({ message: "Erreur détails streamer" });

    } catch {
        res.status(500).json({ message: "Erreur serveur scan" });
    }
});

// 3. DETAILS
app.get('/details', async (req, res) => {
    const token = await getTwitchAccessToken(); 
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const details = await getStreamerDetails(req.query.login, token);
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


// 5. BOOST
app.post('/boost', (req, res) => {
    console.log(`BOOST: Signal d'activation reçu pour ${req.body.channelName}. Succès enregistré.`);
    // Ceci est un placeholder d'action, pas de simulation de données ici
    res.json({ message: `Boost activé pour ${req.body.channelName}`, status: 'ok' });
});

// 6. IA : Gère tous les diagnostics (Stream, Niche, Repurpose, Trend)
app.post('/critique_ia', async (req, res) => {
    // --- LOGGING DE DEBUG ---
    console.log("CRITIQUE_IA: Requête reçue.");
    console.log("CRITIQUE_IA: Body:", req.body);
    // -------------------------

    const { type, title, game, tags, channel } = req.body;
    
    if (!GEMINI_API_KEY) {
        // Retourne une erreur 503 Service indisponible, et NON 500 Interne
        return res.status(503).json({ error: "IA désactivée. Veuillez configurer GEMINI_API_KEY.", html_critique: "Service IA indisponible (Clé manquante)." });
    }

    let systemPrompt, userQuery;
    let tools = []; 
    let maxTokens = 1500; // AUGMENTÉ de 500 à 1500 pour plus de robustesse sur les longues analyses
    
    // --- Configuration des prompts en fonction du type ---
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
        maxTokens = 250; // AUGMENTÉ de 100 à 250 pour la critique courte
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
        } else if (result.promptFeedback?.blockReason) {
            console.error("Gemini API Blocked:", result.promptFeedback);
            res.status(400).json({ 
                error: `Le contenu a été bloqué par les filtres de sécurité de l'IA. Raison: ${result.promptFeedback.blockReason}`, 
                html_critique: "Désolé, l'IA ne peut pas traiter cette requête en raison de restrictions de sécurité ou de contenu." 
            });
        } else {
            // Log la réponse inattendue pour le debug
            console.error("Gemini API Unexpected Response:", JSON.stringify(result));
            res.status(500).json({ 
                error: "Erreur lors de la génération de la critique par l'IA. (Réponse API Gemini vide ou inattendue)", 
                html_critique: "Une erreur interne s'est produite lors de l'analyse par l'IA. (Réponse vide)" 
            });
        }

    } catch (error) {
        console.error("Erreur critique catch /critique_ia:", error.message);
        
        // --- NOUVEAU LOGGING DE STACK TRACE ---
        if (error.stack) {
            console.error("CRITIQUE_IA: Stack Trace:", error.stack);
        }
        // ------------------------------------
        
        let userErrorMessage = "Une erreur de connexion interne est survenue après plusieurs tentatives. Le service est peut-être temporairement indisponible.";

        if (error.message.includes("API returned status 400") || error.message.includes("API returned status 401") || error.message.includes("API returned status 403")) {
            userErrorMessage = "Erreur de configuration de l'API. La clé Gemini est probablement invalide ou manquante. (Vérifiez votre clé API)";
        } else if (error.message.includes("Failed to call Gemini API after")) {
            userErrorMessage = "L'appel à l'API de l'IA a échoué après plusieurs tentatives. Le service est peut-être temporairement indisponible ou en surcharge.";
        }

        res.status(500).json({ 
            error: `Erreur interne lors de l'appel à l'IA: ${error.message}`, 
            html_critique: userErrorMessage 
        });
    }
});


// 7. FOLLOWED STREAMS (Utilise le token UTILISATEUR & Ajoute la récupération de l'avatar)
app.get('/followed_streams', async (req, res) => {
    if (!currentUserToken || !currentTwitchUserId) { 
        // 401: Unauthorized - L'utilisateur n'est pas connecté
        return res.status(401).json({ message: "Utilisateur non connecté via Twitch.", code: 'NO_AUTH' });
    }

    try {
        // 1. Appel API pour les streams suivis (requiert le token utilisateur)
        const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${currentTwitchUserId}`, {
            headers: {
                'Client-Id': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${currentUserToken}` 
            }
        });

        if (!streamsResponse.ok) {
            console.error("Erreur API Twitch Followed Streams:", streamsResponse.status, await streamsResponse.text());
            return res.status(streamsResponse.status).json({ message: "Erreur lors de l'appel Twitch API.", status: streamsResponse.status });
        }

        const streamsData = await streamsResponse.json();
        const liveStreams = streamsData.data || [];

        if (liveStreams.length === 0) {
            return res.json({ data: [] });
        }
        
        // 2. Préparation du batch pour récupérer les détails des utilisateurs (Avatars)
        const userIds = liveStreams.map(s => s.user_id);
        const appToken = await getTwitchAccessToken(); // Token Applicatif pour Helix/users (batch)

        if (!appToken) {
             console.warn("Token applicatif manquant. Impossible de récupérer les avatars.");
             return res.json({ data: liveStreams }); // Retourne les streams sans avatar
        }

        const userDetailsMap = await getTwitchUsersDetails(userIds, appToken);
        
        // 3. Fusion des données
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

// 9. ✨ NOUVELLE ROUTE: SCAN ET RÉSULTATS (GESTION DU 404 ANTÉCÉDENT)
// CORRIGÉ: Renommé de /scan_results à /scan_target et méthode changée de GET à POST
// pour correspondre au code client et corriger l'erreur 404.
app.post('/scan_target', async (req, res) => {
    // CORRIGÉ: Changé de req.query.query à req.body.target
    const query = req.body.target ? req.body.target.trim() : '';

    if (!query) {
        // CORRIGÉ: Changé le message d'erreur pour refléter la nouvelle clé 'target'
        return res.status(400).json({ error: "Paramètre 'target' manquant." });
    }

    const token = await getTwitchAccessToken();
    if (!token) {
        return res.status(503).json({ error: "Erreur d'authentification Twitch (Token applicatif)." });
    }

    // --- ÉTAPE 1: Tenter un scan de JEU ---
    const gameId = await getGameId(query, token);
    
    if (gameId) {
        // C'est un scan de jeu
        try {
            // Limiter à 10 streams pour la grille du front-end
            const streamsUrl = `https://api.twitch.tv/helix/streams?game_id=${gameId}&first=10`;
            const streamsRes = await fetch(streamsUrl, {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            
            const streamsData = await streamsRes.json();
            const streams = streamsData.data || [];

            if (streams.length === 0) {
                return res.json({ type: "game", streams: [], message: `Aucun stream en direct trouvé pour le jeu: ${query}` });
            }

            // Mappe les données pour correspondre au format attendu par le front-end
            return res.json({
                type: "game",
                streams: streams.map(s => ({
                    user_name: s.user_login,
                    display_name: s.user_name,
                    viewer_count: s.viewer_count,
                    game_name: s.game_name,
                    // Utilise le format de l'API pour les thumbnails
                    thumbnail_url: s.thumbnail_url 
                }))
            });

        } catch (e) {
            console.error("Erreur lors du scan de jeu:", e);
            return res.status(500).json({ error: "Erreur interne lors du scan de jeu." });
        }

    } else {
        // --- ÉTAPE 2: Si aucun jeu trouvé, tenter un scan d'UTILISATEUR ---
        const userData = await fetchUserDetailsForScan(query, token);
        
        if (userData) {
            // Si l'utilisateur est trouvé
            return res.json({
                type: "user",
                user_data: userData
            });
        } else {
            // Aucun résultat trouvé ni comme jeu, ni comme utilisateur
            return res.json({ 
                type: "none", 
                message: `Aucun résultat trouvé pour la requête '${query}' comme jeu ou utilisateur.` 
            });
        }
    }
});


// =========================================================
// Configuration des Routes Statiques
// =========================================================

app.get('/', (req, res) => {
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
    getTwitchAccessToken();
});









