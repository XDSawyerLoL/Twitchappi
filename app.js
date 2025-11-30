const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // NOTE: Ceci doit être présent pour Node < 18
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin"); 

const app = express();

// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

// --- DEBUG : Vérification des clés ---
if (GEMINI_API_KEY) {
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    console.error("FATAL DEBUG: GEMINI_API_KEY n'est pas configurée. L'IA sera désactivée.");
}

if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET && REDIRECT_URI) {
    console.log("DEBUG: Configuration Twitch complète. L'authentification est ACTIVE.");
} else {
    console.warn("ATTENTION: TWITCH_CLIENT_ID/SECRET/REDIRECT_URI manquent. L'authentification Twitch est désactivée.");
}


// --- Middleware ---
app.use(cookieParser());
app.use(cors({
    origin: '*', 
    credentials: true 
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));


// =========================================================
// Configuration Firebase Admin (Simulée)
// =========================================================

const db = {}; // Placeholder pour l'instance Firestore


// =========================================================
// Variables d'État Globales (ATTENTION: Non-thread-safe/mono-utilisateur !)
// =========================================================

let currentUserToken = null;
let currentUsername = null;
let currentUserID = null;
let currentUserFollows = null;


// =========================================================
// Fonctions Auxiliaires (Fetch et Twitch API)
// =========================================================

/**
 * 🛠️ Fonction utilitaire pour effectuer des requêtes à l'API Twitch.
 * @param {string} url - L'endpoint Twitch.
 * @param {string} token - Le jeton d'accès Twitch (access_token).
 * @param {string} clientId - L'ID client Twitch.
 * @returns {Promise<any>} La réponse JSON de l'API.
 */
async function fetchTwitchAPI(url, token, clientId) {
    if (!token || !clientId) {
        console.error("Jeton ou Client ID manquant pour l'appel API.");
        return null;
    }
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Client-Id': clientId
            }
        });
        if (!response.ok) {
            console.error(`Erreur HTTP ${response.status} lors de l'appel à Twitch API: ${url}`);
            const errorText = await response.text();
            console.error('Corps de l\'erreur:', errorText);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('Erreur lors de la récupération des données Twitch:', error);
        return null;
    }
}

/**
 * 🤝 Récupère la liste des chaînes suivies par l'utilisateur connecté.
 * @param {string} userId - L'ID de l'utilisateur Twitch.
 * @param {string} token - Le jeton d'accès Twitch.
 * @returns {Promise<Array<string>|null>} La liste des noms des chaînes suivies.
 */
async function fetchUserFollows(userId, token) {
    const url = `https://api.twitch.tv/helix/users/follows?user_id=${userId}&first=100`;
    const data = await fetchTwitchAPI(url, token, TWITCH_CLIENT_ID);

    // Vérification plus robuste pour éviter les 500
    if (data && Array.isArray(data.data)) {
        return data.data.map(f => f.to_name);
    }
    return null;
}

/**
 * 👤 Récupère les détails de l'utilisateur Twitch à partir du token.
 * @param {string} token - Le jeton d'accès Twitch.
 * @returns {Promise<object|null>} Les données de l'utilisateur (ID, login, etc.).
 */
async function fetchUser(token) {
    const data = await fetchTwitchAPI('https://api.twitch.tv/helix/users', token, TWITCH_CLIENT_ID);
    if (data && Array.isArray(data.data) && data.data.length > 0) {
        return data.data[0];
    }
    return null;
}

/**
 * 🎮 Recherche un jeu par nom sur Twitch.
 * @param {string} query - Le nom du jeu.
 * @param {string} token - Le jeton d'accès.
 * @returns {Promise<object|null>} Les données du jeu.
 */
async function fetchGameDetailsForScan(query, token) {
    const url = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(query)}`;
    const data = await fetchTwitchAPI(url, token, TWITCH_CLIENT_ID);

    if (data && Array.isArray(data.data) && data.data.length > 0) {
        return data.data[0];
    }
    return null;
}

/**
 * 🎤 Recherche un utilisateur par nom d'affichage ou login sur Twitch.
 * @param {string} query - Le nom d'utilisateur.
 * @param {string} token - Le jeton d'accès.
 * @returns {Promise<object|null>} Les données de l'utilisateur.
 */
async function fetchUserDetailsForScan(query, token) {
    const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(query)}`;
    const data = await fetchTwitchAPI(url, token, TWITCH_CLIENT_ID);

    if (data && Array.isArray(data.data) && data.data.length > 0) {
        return data.data[0];
    }
    return null;
}

/**
 * 🎬 NOUVEAU: Récupère les 5 dernières VODs (Archives) d'un utilisateur cible.
 * @param {string} userId - L'ID de l'utilisateur Twitch cible.
 * @param {string} token - Le jeton d'accès Twitch du demandeur.
 * @returns {Promise<Array<object>|null>} La liste des 5 dernières VODs avec URLs formatées.
 */
async function fetchStreamerVods(userId, token) {
    // type=archive pour les VODs, first=5
    const url = `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=5`;
    const data = await fetchTwitchAPI(url, token, TWITCH_CLIENT_ID);

    if (data && Array.isArray(data.data)) {
        return data.data.map(vod => ({
            id: vod.id,
            title: vod.title,
            duration: vod.duration,
            views: vod.view_count,
            // Formatage de l'URL de miniature à une taille fixe (320x180) pour l'affichage
            thumbnail_url: vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
            url: vod.url // Lien vers la VOD
        }));
    }
    return null;
}

/**
 * 🤝 NOUVEAU: Récupère les chaînes suivies (suggestions) par l'utilisateur cible.
 * @param {string} targetUserId - L'ID de l'utilisateur Twitch cible.
 * @param {string} token - Le jeton d'accès Twitch du demandeur.
 * @returns {Promise<Array<object>|null>} La liste des 10 chaînes suivies par l'utilisateur cible.
 */
async function fetchTargetUserFollows(targetUserId, token) {
    // On prend 10 pour les suggestions
    const url = `https://api.twitch.tv/helix/users/follows?user_id=${targetUserId}&first=10`;
    const data = await fetchTwitchAPI(url, token, TWITCH_CLIENT_ID);

    if (data && Array.isArray(data.data)) {
        return data.data.map(f => ({
            name: f.to_name,
            id: f.to_id,
            followed_at: f.followed_at
        }));
    }
    return null;
}


// =========================================================
// Fonctions Gemini (Critique et Analyse)
// =========================================================

/**
 * 🧠 Appelle l'API Gemini pour générer du contenu ou des critiques.
 * (Fonction non modifiée, elle est robuste.)
 */
async function callGeminiAPI(prompt, systemPrompt, useGrounding = false) {
    if (!GEMINI_API_KEY) {
        return "Erreur: La clé API Gemini est manquante. L'IA ne peut pas fonctionner.";
    }

    if (!prompt || prompt.length < 5) {
        return "Veuillez fournir une requête d'analyse plus détaillée.";
    }

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        tools: useGrounding ? [{ "google_search": {} }] : undefined,
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    let response;
    let retries = 0;
    const maxRetries = 5;
    let delay = 1000;

    while (retries < maxRetries) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const candidate = result.candidates?.[0];

                if (candidate && candidate.content?.parts?.[0]?.text) {
                    let text = candidate.content.parts[0].text;
                    let sources = [];
                    const groundingMetadata = candidate.groundingMetadata;
                    if (groundingMetadata && groundingMetadata.groundingAttributions) {
                        sources = groundingMetadata.groundingAttributions
                            .map(attribution => ({
                                uri: attribution.web?.uri,
                                title: attribution.web?.title,
                            }))
                            .filter(source => source.uri && source.title);
                    }
                    
                    if (sources.length > 0) {
                        text += "\n\n**Sources consultées (Google Search) :**\n";
                        sources.forEach((source, index) => {
                            text += `- [${source.title}](${source.uri})\n`;
                        });
                    }

                    return text;
                } else {
                    console.error('Réponse API mal formatée:', result);
                    return "Erreur: Réponse API mal formatée ou contenu manquant.";
                }
            } else if (response.status === 429 || response.status >= 500) {
                console.warn(`Tentative ${retries + 1} échouée (Statut: ${response.status}). Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; 
                retries++;
            } else {
                const errorText = await response.text();
                console.error(`Erreur Gemini API (Statut: ${response.status}): ${errorText}`);
                return `Erreur Gemini API: Échec de l'appel (${response.status}).`;
            }
        } catch (error) {
            console.error('Erreur de connexion (Fetch):', error);
            if (retries < maxRetries - 1) {
                 await new Promise(resolve => setTimeout(resolve, delay));
                 delay *= 2;
            }
            retries++;
        }
    }

    return "Erreur critique: Échec de l'appel à l'IA après plusieurs tentatives. Veuillez réessayer plus tard.";
}


// =========================================================
// Routes de l'API (Authentification Twitch)
// =========================================================

/**
 * 🔑 Étape 1: Démarrage de l'Authentification (GET /twitch_auth_start)
 * (Contient la correction SameSite pour l'iframe)
 */
app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !REDIRECT_URI) {
        return res.status(500).send("Configuration Twitch manquante.");
    }
    
    const scopes = 'user:read:follows viewing_activity_read';
    const state = crypto.randomBytes(16).toString('hex');
    
    // CORRECTION CRITIQUE POUR L'IFRAME (SameSite=None; Secure)
    res.cookie('oauth_state', state, { 
        httpOnly: true, 
        maxAge: 600000,
        sameSite: 'None', 
        secure: true
    }); 

    const twitchAuthURL = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scopes}&state=${state}`;
    
    console.log("Démarrage OAuth, redirection vers Twitch...");
    res.redirect(twitchAuthURL);
});

/**
 * 🤝 Étape 2: Callback de Twitch (GET /twitch_auth_callback)
 */
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, scope, state } = req.query;
    const expectedState = req.cookies.oauth_state;

    res.clearCookie('oauth_state', { sameSite: 'None', secure: true });

    if (state !== expectedState) {
        console.error(`Erreur CSRF: L'état reçu (${state}) ne correspond pas à l'état attendu (${expectedState}).`);
        return res.redirect(`/?error=${encodeURIComponent('Erreur de sécurité (CSRF).')}`);
    }

    if (!code) {
        console.error("Code d'autorisation manquant dans le callback.");
        return res.redirect(`/?error=${encodeURIComponent('Code d\'autorisation manquant.')}`);
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
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.access_token) {
            currentUserToken = tokenData.access_token;
            console.log("Jeton d'accès Twitch obtenu avec succès.");

            const userData = await fetchUser(currentUserToken);

            if (userData) {
                currentUsername = userData.login;
                currentUserID = userData.id;
                console.log(`Authentification réussie pour l'utilisateur: ${currentUsername}`);
            } else {
                currentUserToken = null;
                console.error("Échec de la récupération des données utilisateur Twitch.");
                return res.redirect(`/?error=${encodeURIComponent('Échec de la récupération des données utilisateur Twitch.')}`);
            }
        } else {
            console.error("Erreur lors de l'échange du jeton:", tokenData.message);
            return res.redirect(`/?error=${encodeURIComponent('Erreur lors de l\'échange du jeton.')}`);
        }

    } catch (error) {
        console.error('Erreur irrécupérable lors de l\'authentification:', error);
        return res.redirect(`/?error=${encodeURIComponent('Erreur interne lors de l\'authentification.')}`);
    }

    return res.redirect('/');
});


/**
 * ℹ️ Route pour vérifier l'état de l'authentification (GET /auth_status)
 */
app.get('/auth_status', (req, res) => {
    if (currentUserToken && currentUsername) {
        res.json({
            isAuthenticated: true,
            username: currentUsername,
            userId: currentUserID
        });
    } else {
        res.json({
            isAuthenticated: false
        });
    }
});


/**
 * 🔄 Route pour mettre à jour la liste des chaînes suivies (GET /fetch_follows)
 */
app.get('/fetch_follows', async (req, res) => {
    if (!currentUserToken || !currentUserID) {
        return res.status(401).json({ message: "Utilisateur non authentifié." });
    }

    try {
        const follows = await fetchUserFollows(currentUserID, currentUserToken);
        if (follows) {
            currentUserFollows = follows;
            return res.json({ success: true, follows: follows });
        } else {
            // Renvoie 200 avec tableau vide si rien n'est trouvé, au lieu d'un 500 générique
            return res.json({ success: false, follows: [], message: "Aucune chaîne suivie trouvée ou erreur API silencieuse." });
        }
    } catch (error) {
        console.error("Erreur lors de la récupération des suivis:", error);
        return res.status(500).json({ message: "Erreur serveur interne lors de la récupération des suivis." });
    }
});

/**
 * 🚮 Route pour déconnecter l'utilisateur (GET /logout)
 */
app.get('/logout', (req, res) => {
    currentUserToken = null;
    currentUsername = null;
    currentUserID = null;
    currentUserFollows = null;
    
    res.redirect('/');
});

// =========================================================
// Routes de l'API (IA et Analyse)
// =========================================================

/**
 * 💡 Route IA pour la critique et la détection de tendance (POST /critique_ia)
 * (Fonction non modifiée)
 */
app.post('/critique_ia', async (req, res) => {
    const { type, query, gameTitle, streamerName, clipUrl } = req.body;

    if (!GEMINI_API_KEY) {
        return res.status(503).json({ error: "L'IA est désactivée. Clé API manquante." });
    }

    let userPrompt = '';
    let systemPrompt = "En tant qu'analyste de croissance Twitch IA spécialisé en stratégies de contenu, votre tâche est de fournir une analyse complète, structurée et actionable en Français. Votre réponse doit être en Markdown, formatée pour être affichée directement, en utilisant des **titres** et des *listes* pour une lisibilité maximale.";
    let useGrounding = false;
    let title = '';

    try {
        switch (type) {
            case 'trend':
                title = 'Analyse des Tendances Actuelles';
                userPrompt = `Identifiez et analysez les trois tendances de contenu Twitch, YouTube et TikTok les plus pertinentes pour un streamer de taille moyenne. Fournissez des conseils spécifiques pour exploiter chacune de ces tendances. La réponse doit être limitée aux 400 mots.`;
                useGrounding = true;
                break;
            case 'niche_game':
                if (!query) throw new Error("Le champ de recherche 'query' est manquant.");
                title = `Analyse de la Niche: ${query}`;
                userPrompt = `Analysez la viabilité de la niche de jeu vidéo '${query}' sur Twitch pour un nouveau streamer. Fournissez une analyse SWOT (Forces, Faiblesses, Opportunités, Menaces) détaillée basée sur les données d'audience typiques (nombre de streamers, ratio spectateurs/streamer) et les tendances récentes. Proposez trois idées de contenu originales pour se démarquer dans cette niche.`;
                useGrounding = true;
                break;
            case 'clip_repurpose':
                if (!clipUrl) throw new Error("Le champ 'clipUrl' est manquant.");
                title = `Idées de Repurposing pour Clip: ${clipUrl}`;
                userPrompt = `Le streamer a un clip Twitch à l'URL suivante: ${clipUrl}. Générez 5 idées de repurposing (réutilisation de contenu) pour ce clip, spécifiquement pour TikTok/Shorts (max 60 secondes) et YouTube (format long). Indiquez quel type de montage (zoom, texte, musique) serait nécessaire pour chaque plateforme.`;
                useGrounding = false;
                break;
            default:
                return res.status(400).json({ error: "Type d'analyse IA non valide." });
        }

        const rawText = await callGeminiAPI(userPrompt, systemPrompt, useGrounding);
        
        const htmlCritique = `<div class="p-4 bg-white/5 rounded-xl border border-border-medium shadow-lg">\n<h2 class="text-xl font-bold text-primary-pink mb-3">${title}</h2>\n${rawText.replace(/\n/g, '<br>')}</div>`;

        res.json({ html_critique: htmlCritique, raw_markdown: rawText });

    } catch (error) {
        console.error("Erreur lors du traitement de la requête IA:", error.message);
        res.status(500).json({ error: `Erreur interne lors de l'appel IA: ${error.message}` });
    }
});


/**
 * 🔍 Route pour la recherche (Scan de Jeu/Utilisateur) (POST /scan_query)
 * MODIFIÉ : Récupère les suivis suggérés et les VODs pour un utilisateur.
 */
app.post('/scan_query', async (req, res) => {
    const { query } = req.body;
    const token = currentUserToken;

    if (!token) {
        return res.status(401).json({ error: "Authentification Twitch requise pour scanner." });
    }

    if (!query) {
        return res.status(400).json({ error: "Requête de recherche manquante." });
    }

    // --- ÉTAPE 1: Tenter un scan de JEU ---
    const gameData = await fetchGameDetailsForScan(query, token);

    if (gameData) {
        const streamUrl = `https://api.twitch.tv/helix/streams?game_id=${gameData.id}&first=100`;
        const streamData = await fetchTwitchAPI(streamUrl, token, TWITCH_CLIENT_ID);
        
        // Assurer que streamData.data est un tableau
        const streams = (streamData && Array.isArray(streamData.data)) ? streamData.data : [];

        return res.json({
            type: "game",
            game_data: gameData,
            streams: streams,
            message: streams.length > 0 ? undefined : "Jeu trouvé, mais aucun stream en direct n'a été récupéré pour ce scan de jeu."
        });

    } else {
        // --- ÉTAPE 2: Si aucun jeu trouvé, tenter un scan d'UTILISATEUR ---
        const userData = await fetchUserDetailsForScan(query, token);
        
        if (userData) {
            const targetUserId = userData.id;
            
            // 1. Chaînes suggérées (qui le streamer cible suit)
            const suggestedFollows = await fetchTargetUserFollows(targetUserId, token);
            
            // 2. 5 VODs récentes
            const recentVods = await fetchStreamerVods(targetUserId, token);
            
            // Renvoie les données complètes (y compris les suivis et VODs)
            return res.json({
                type: "user",
                user_data: userData,
                suggested_channels: suggestedFollows || [], 
                recent_vods: recentVods || []               
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

// Assure que toutes les routes non gérées renvoient le fichier principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer (4).html'));
});

// S'assure que le serveur est bien démarré
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
    console.log(`URL de redirection Twitch attendue: ${REDIRECT_URI}`);
});
