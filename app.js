const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // NOTE: Ceci doit être présent pour Node < 18
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin"); // Assurons-nous que cette dépendance est au top

const app = express();

// =========================================================
// Configuration des Variables d'Environnement
// =========================================================
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
    console.error("FATAL DEBUG: GEMINI_API_KEY non trouvée. Les fonctionnalités IA seront désactivées.");
}

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI) {
    console.error("FATAL DEBUG: Les variables d'environnement Twitch (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI) ne sont pas configurées.");
}


// =========================================================
// Configuration Firebase Admin (pour l'authentification)
// =========================================================

// Assurez-vous que FIREBASE_SERVICE_ACCOUNT est défini dans les variables d'environnement
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin SDK initialisé avec succès.");
    } catch (e) {
        console.error("ERREUR FATALE lors de l'initialisation de Firebase Admin :", e.message);
    }
} else {
    console.error("AVERTISSEMENT : FIREBASE_SERVICE_ACCOUNT n'est pas configuré. L'émission de tokens Firebase sera impossible.");
}


// =========================================================
// Middleware
// =========================================================
// Permet toutes les requêtes CORS
app.use(cors({
    origin: '*', // En production, il est recommandé de restreindre ceci
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); // Sert les fichiers statiques (HTML, CSS, JS frontend)

// =========================================================
// Stockage du token d'application Twitch (pour les appels non-utilisateur)
// =========================================================
let appToken = {
    accessToken: null,
    expiresAt: 0,
    isRefreshing: false
};

/**
 * Récupère un token d'application Twitch ou le renouvelle s'il est expiré.
 * @returns {string | null} Le token d'accès ou null en cas d'erreur.
 */
async function getAppAccessToken() {
    if (appToken.accessToken && appToken.expiresAt > Date.now() + 60000) { // Token valide pour au moins 60 secondes
        return appToken.accessToken;
    }

    if (appToken.isRefreshing) {
        // Attendre la fin du rafraîchissement si une autre requête est déjà en cours
        return new Promise(resolve => {
            const check = setInterval(() => {
                if (!appToken.isRefreshing) {
                    clearInterval(check);
                    resolve(appToken.accessToken);
                }
            }, 100);
        });
    }

    appToken.isRefreshing = true;
    console.log("Rafraîchissement du Token d'Application Twitch...");

    try {
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            }).toString()
        });

        const data = await response.json();

        if (response.ok) {
            appToken.accessToken = data.access_token;
            appToken.expiresAt = Date.now() + (data.expires_in * 1000);
            console.log("Nouveau Token d'Application Twitch récupéré avec succès.");
            return appToken.accessToken;
        } else {
            console.error('Erreur lors de la récupération du token d\'application:', data);
            return null;
        }
    } catch (error) {
        console.error('Erreur de connexion lors de la récupération du token d\'application:', error);
        return null;
    } finally {
        appToken.isRefreshing = false;
    }
}

// =========================================================
// Fonctions d'aide pour l'API Twitch
// =========================================================

/**
 * Récupère les données de l'utilisateur connecté via un token d'utilisateur.
 * @param {string} userToken Le token d'accès Twitch de l'utilisateur.
 * @returns {Promise<object | null>} Les données de l'utilisateur ou null.
 */
async function fetchCurrentUser(userToken) {
    try {
        const response = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.data[0] || null;
        } else {
            console.error('Erreur API Twitch lors de la récupération de l\'utilisateur:', response.status, await response.text());
            return null;
        }
    } catch (e) {
        console.error('Erreur de connexion lors de la récupération de l\'utilisateur:', e);
        return null;
    }
}

/**
 * Récupère la liste des chaînes suivies par l'utilisateur.
 * @param {string} userId L'ID de l'utilisateur.
 * @param {string} userToken Le token d'accès Twitch de l'utilisateur.
 * @returns {Promise<Array<object>>} La liste des chaînes suivies.
 */
async function fetchFollowedChannels(userId, userToken) {
    try {
        const response = await fetch(`https://api.twitch.tv/helix/channels/followed?user_id=${userId}&first=100`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${userToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.data || [];
        } else {
            console.error('Erreur API Twitch lors de la récupération des chaînes suivies:', response.status, await response.text());
            return [];
        }
    } catch (e) {
        console.error('Erreur de connexion lors de la récupération des chaînes suivies:', e);
        return [];
    }
}


/**
 * Récupère les données d'un jeu par son nom.
 * @param {string} query Nom du jeu à rechercher.
 * @param {string} appToken Token d'application Twitch.
 * @returns {Promise<object | null>} Les données du jeu ou null.
 */
async function fetchGameDetailsForScan(query, appToken) {
    try {
        const response = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(query)}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${appToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Retourne le premier résultat trouvé
            return data.data[0] || null; 
        } else {
            console.error('Erreur API Twitch lors de la recherche du jeu:', response.status, await response.text());
            return null;
        }
    } catch (e) {
        console.error('Erreur de connexion lors de la recherche du jeu:', e);
        return null;
    }
}

/**
 * Récupère les données d'un utilisateur par son login.
 * @param {string} query Login de l'utilisateur à rechercher.
 * @param {string} appToken Token d'application Twitch.
 * @returns {Promise<object | null>} Les données de l'utilisateur ou null.
 */
async function fetchUserDetailsForScan(query, appToken) {
    try {
        const response = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(query)}`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${appToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Retourne le premier résultat trouvé
            return data.data[0] || null; 
        } else {
            console.error('Erreur API Twitch lors de la recherche de l\'utilisateur:', response.status, await response.text());
            return null;
        }
    } catch (e) {
        console.error('Erreur de connexion lors de la recherche de l\'utilisateur:', e);
        return null;
    }
}

/**
 * Récupère les streams actifs pour un jeu donné.
 * @param {string} gameId L'ID du jeu.
 * @param {string} appToken Token d'application Twitch.
 * @returns {Promise<Array<object>>} La liste des streams.
 */
async function fetchStreamsForGame(gameId, appToken) {
    try {
        const response = await fetch(`https://api.twitch.tv/helix/streams?game_id=${gameId}&first=100`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${appToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data.data || [];
        } else {
            console.error('Erreur API Twitch lors de la récupération des streams:', response.status, await response.text());
            return [];
        }
    } catch (e) {
        console.error('Erreur de connexion lors de la récupération des streams:', e);
        return [];
    }
}

// =========================================================
// Fonctions d'aide pour l'API Gemini
// =========================================================

/**
 * Appelle l'API Gemini pour effectuer une analyse.
 * @param {string} prompt Le prompt à envoyer au modèle.
 * @param {boolean} useGrounding Utiliser Google Search pour l'ancrage (grounding).
 * @param {string} systemInstruction Instruction système pour guider la réponse.
 * @returns {Promise<object>} L'objet JSON de la réponse Gemini.
 */
async function callGeminiApi(prompt, useGrounding = false, systemInstruction = "") {
    if (!GEMINI_API_KEY) {
        return { 
            error: "Clé API Gemini manquante. Fonctionnalité IA désactivée.",
            html_critique: `<p style="color:red;">Erreur: Clé API Gemini manquante. Les analyses IA sont indisponibles.</p>` 
        };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        // Utilise le grounding si nécessaire
        tools: useGrounding ? [{ "google_search": {} }] : undefined,
        // Utilise l'instruction système si elle est fournie
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    };

    // Configuration de la stratégie d'essais avec backoff exponentiel
    const maxRetries = 5;
    let delay = 1000;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const candidate = result.candidates?.[0];
                const text = candidate?.content?.parts?.[0]?.text || "";

                // Extraction des sources si le grounding est utilisé
                let sources = [];
                const groundingMetadata = candidate?.groundingMetadata;
                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    sources = groundingMetadata.groundingAttributions
                        .map(attribution => ({
                            uri: attribution.web?.uri,
                            title: attribution.web?.title,
                        }))
                        .filter(source => source.uri && source.title);
                }

                // Pour la lisibilité côté client, on convertit la réponse en HTML/Markdown si le modèle le permet
                const htmlCritique = text.replace(/\n/g, '<br/>') || '<p>Analyse IA vide.</p>';

                return {
                    text: text,
                    html_critique: htmlCritique,
                    sources: sources
                };
            } else if (response.status === 429) {
                // Trop de requêtes (Rate Limit), on attend et on réessaie
                console.warn(`Tentative ${i + 1}: Rate limit atteint. Attente de ${delay}ms.`);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Backoff exponentiel
                    continue;
                } else {
                    throw new Error("Échec après plusieurs tentatives de Rate Limit.");
                }
            } else {
                // Autres erreurs HTTP
                const errorText = await response.text();
                console.error(`Erreur API Gemini (HTTP ${response.status}):`, errorText);
                return { 
                    error: `Erreur API Gemini (HTTP ${response.status}).`,
                    html_critique: `<p style="color:red;">Erreur de l'API IA: ${response.status}.</p>` 
                };
            }
        } catch (error) {
            console.error(`Erreur réseau/générale lors de l'appel Gemini:`, error.message);
            return { 
                error: `Erreur de connexion au service IA: ${error.message}`,
                html_critique: `<p style="color:red;">Erreur de connexion au service IA: ${error.message}</p>` 
            };
        }
    }
    // Si la boucle se termine sans succès
    return {
        error: "Échec de l'appel Gemini après toutes les tentatives.",
        html_critique: `<p style="color:red;">Échec de l'appel IA après plusieurs tentatives.</p>`
    };
}


// =========================================================
// Configuration des Routes d'Authentification Twitch
// =========================================================

// --- ÉTAPE 1: Démarrer le processus OAuth ---
app.get('/auth/twitch', (req, res) => {
    // Crée un état unique pour la protection CSRF
    const state = crypto.randomBytes(16).toString('hex');
    // Stocke l'état dans un cookie chiffré
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); // Expire après 10 min

    const scope = 'user:read:follows user:read:email'; // Les permissions requises
    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.append('client_id', TWITCH_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('state', state);

    res.redirect(authUrl.toString());
});

// --- ÉTAPE 2: Gérer le callback (réponse de Twitch) ---
app.get('/auth/twitch/callback', async (req, res) => {
    const { code, state, error, scope } = req.query;
    const storedState = req.cookies.twitch_state;

    // 1. Vérification CSRF et erreur
    if (error) {
        return res.redirect(`/NicheOptimizer.html?error=${error}`);
    }
    if (!storedState || state !== storedState) {
        return res.redirect(`/NicheOptimizer.html?error=state_mismatch`);
    }
    // L'état a été vérifié, on le supprime
    res.clearCookie('twitch_state'); 
    if (!code) {
        return res.redirect(`/NicheOptimizer.html?error=no_code`);
    }

    // 2. Échange du code contre un token d'accès
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

        if (tokenResponse.ok) {
            const userToken = tokenData.access_token;
            
            // 3. Récupération des infos utilisateur (pour l'ID et l'e-mail)
            const userData = await fetchCurrentUser(userToken);

            if (userData && admin.apps.length > 0) {
                const userId = userData.id;
                const email = userData.email || `${userData.login}@twitch.user`; // Fallback pour email
                const username = userData.login;
                
                // 4. Création/Obtention d'un Custom Token Firebase
                const firebaseToken = await admin.auth().createCustomToken(userId, {
                    twitch_username: username,
                    twitch_email: email,
                    twitch_user_id: userId
                });

                // Redirige l'utilisateur avec son token d'accès Twitch et son token Firebase
                // Le client stockera le token d'accès Twitch de manière sécurisée (httpOnly cookie si possible, ou localStorage/sessionStorage pour les SPAs)
                // Ici, on utilise des cookies non-httpOnly pour l'accès JS facile
                res.cookie('twitch_access_token', userToken, { secure: true, maxAge: tokenData.expires_in * 1000 });
                res.cookie('firebase_custom_token', firebaseToken, { secure: true, maxAge: 3600000 }); // Token Firebase valide pour 1h
                
                // Redirection vers l'application principale (le client gérera la connexion Firebase avec le token)
                return res.redirect(`/NicheOptimizer.html?auth_success=true&username=${username}`);

            } else {
                 return res.redirect(`/NicheOptimizer.html?error=user_fetch_failed`);
            }
        } else {
            console.error('Erreur lors de l\'échange de code:', tokenData);
            return res.redirect(`/NicheOptimizer.html?error=token_exchange_failed`);
        }
    } catch (e) {
        console.error('Erreur globale lors du callback Twitch:', e);
        return res.redirect(`/NicheOptimizer.html?error=internal_server_error`);
    }
});


// =========================================================
// Routes API pour les données de l'utilisateur
// =========================================================

/**
 * Middleware pour extraire le token Twitch de l'utilisateur
 * et le rendre disponible dans req.twitchToken
 */
function extractTwitchToken(req, res, next) {
    const token = req.cookies.twitch_access_token;
    if (!token) {
        return res.status(401).json({ error: "Token Twitch non trouvé. Veuillez vous reconnecter." });
    }
    req.twitchToken = token;
    next();
}

// --- Route pour vérifier l'état d'authentification ---
app.get('/api/check_auth', extractTwitchToken, async (req, res) => {
    const userData = await fetchCurrentUser(req.twitchToken);
    
    if (userData) {
        return res.json({ 
            isAuthenticated: true, 
            userId: userData.id, 
            username: userData.login,
            profile_image_url: userData.profile_image_url
        });
    } else {
        // Le token n'est plus valide (expiré, révoqué, etc.)
        res.clearCookie('twitch_access_token');
        res.clearCookie('firebase_custom_token');
        return res.status(401).json({ isAuthenticated: false, error: "Token Twitch invalide/expiré." });
    }
});

// --- Route pour récupérer les chaînes suivies ---
app.get('/api/followed_channels', extractTwitchToken, async (req, res) => {
    const userData = await fetchCurrentUser(req.twitchToken);
    if (!userData) {
        return res.status(401).json({ error: "Utilisateur non identifié." });
    }

    const followedChannels = await fetchFollowedChannels(userData.id, req.twitchToken);
    return res.json({ 
        total: followedChannels.length,
        channels: followedChannels.map(c => ({
            broadcaster_id: c.broadcaster_id,
            broadcaster_name: c.broadcaster_name,
            followed_at: c.followed_at
        })) 
    });
});


// =========================================================
// Routes API pour l'Analyse IA
// =========================================================

// --- Route générique pour la critique IA ---
app.post('/critique_ia', async (req, res) => {
    const { type, query, game_id, game_name, streamer_name, context } = req.body;
    let prompt = "";
    let systemInstruction = "";
    let useGrounding = false;
    let twitchData = null;

    try {
        // --- 1. Préparation du prompt et des données Twitch ---
        const token = await getAppAccessToken();
        if (!token) {
            return res.status(503).json({ error: "Impossible d'obtenir le token d'application Twitch." });
        }

        switch (type) {
            case 'niche':
                if (!game_id || !game_name) {
                    return res.status(400).json({ error: "Jeu ID et nom requis pour l'analyse de niche." });
                }
                // Récupération des streams actifs pour le jeu
                const streams = await fetchStreamsForGame(game_id, token);
                twitchData = JSON.stringify(streams.slice(0, 50)); // Limiter à 50 pour la taille du prompt

                systemInstruction = `Tu es un expert en stratégie de streaming et en analyse de marché. Ton rôle est de critiquer un jeu basé sur les 50 premiers streams actifs (taille d'audience, langue, titres) pour déterminer s'il représente une bonne niche pour un nouveau streamer. Réponds uniquement en HTML et Markdown (sans les tags HTML/BODY/HEAD).`;

                prompt = `Analyse le jeu '${game_name}' (Game ID: ${game_id}) comme niche de streaming. Voici les données JSON des 50 premiers streams actifs: ${twitchData}.
                Objectif de la critique (en français):
                1. Compétitivité: Le marché est-il saturé ou y a-t-il de la place pour les petits streamers ? (Regarder la distribution de l'audience).
                2. Langue: Quelle est la langue dominante des streams ? Y a-t-il une niche francophone à exploiter ?
                3. Titres: Quels sont les mots-clés ou le style de titre les plus courants ? Suggère un titre original et accrocheur pour se démarquer.
                4. Conclusion de niche: Ce jeu est-il une 'bonne niche', une 'niche risquée' ou une 'niche saturée' ? Justifie.`;
                break;

            case 'repurpose':
                if (!streamer_name || !context) {
                    return res.status(400).json({ error: "Nom du streamer et contexte requis pour la critique de repurpose." });
                }
                
                systemInstruction = `Tu es un expert en marketing digital et en création de contenu court (TikTok, YouTube Shorts). Ton rôle est de prendre le contexte d'un stream et de proposer des idées de 'repurpose' (réutilisation) en contenu court. Réponds uniquement en HTML et Markdown (sans les tags HTML/BODY/HEAD).`;

                prompt = `Le streamer '${streamer_name}' a eu ce moment de stream/contexte : "${context}".
                Propose trois (3) idées détaillées de clips ou de concepts de contenu court (pour TikTok/Shorts) basées sur ce contexte.
                Pour chaque idée, donne:
                1. Un Titre de vidéo court.
                2. L'Angle de la vidéo (émotion, astuce, fail, moment fort).
                3. Un Script ou une description de 3 lignes max.
                Rédige l'analyse en français.`;
                break;

            case 'trend':
                systemInstruction = `Tu es un analyste de tendances de jeu vidéo. Ton rôle est de fournir une analyse des jeux qui gagnent rapidement en popularité sur Twitch et sur les réseaux sociaux. Réponds uniquement en HTML et Markdown (sans les tags HTML/BODY/HEAD).`;
                useGrounding = true; // Active le Google Search pour les tendances actuelles

                prompt = `Fournis une analyse des tendances de streaming actuelles. Identifie 3 jeux (récemment sortis ou en forte croissance) qui sont prometteurs pour les nouveaux streamers. Pour chacun, donne un bref résumé de ce qui le rend viral et pourquoi il est une bonne opportunité (en français). Base-toi sur des données et tendances actualisées.`;
                break;

            default:
                return res.status(400).json({ error: "Type de critique IA non reconnu." });
        }

        // --- 2. Appel à l'IA Gemini ---
        const iaResult = await callGeminiApi(prompt, useGrounding, systemInstruction);

        if (iaResult.error) {
            return res.status(500).json({ error: iaResult.error, html_critique: iaResult.html_critique });
        }
        
        // --- 3. Ajout des sources si le grounding a été utilisé ---
        if (iaResult.sources && iaResult.sources.length > 0) {
            const sourcesHtml = iaResult.sources.map((src, index) => 
                `<a href="${src.uri}" target="_blank" class="text-sm text-blue-400 hover:text-blue-200 transition duration-150 block truncate" title="${src.title}">${index + 1}. ${src.title}</a>`
            ).join('');
            
            iaResult.html_critique += `<div class="mt-4 p-3 bg-gray-800 rounded-lg border border-gray-700 shadow-inner">
                <h4 class="font-semibold text-lg mb-2 text-gray-300">Sources de l'Analyse (Grounding)</h4>
                ${sourcesHtml}
            </div>`;
        }

        return res.json({ 
            success: true,
            html_critique: iaResult.html_critique,
            raw_text: iaResult.text
        });

    } catch (e) {
        console.error("Erreur serveur dans /critique_ia:", e);
        return res.status(500).json({ 
            error: `Erreur interne du serveur lors de la critique IA: ${e.message}`,
            html_critique: `<p style="color:red;">Erreur interne du serveur: ${e.message}</p>`
        });
    }
});

// --- Route pour scanner un jeu ou un utilisateur ---
app.post('/api/scan_search', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: "La requête de scan est vide." });
    }

    const token = await getAppAccessToken();
    if (!token) {
        return res.status(503).json({ error: "Impossible d'obtenir le token d'application Twitch." });
    }
    
    // --- ÉTAPE 1: Tenter un scan de JEU ---
    const gameData = await fetchGameDetailsForScan(query, token);

    if (gameData) {
        // Si le jeu est trouvé
        const streams = await fetchStreamsForGame(gameData.id, token);
        const viewerCount = streams.reduce((sum, stream) => sum + stream.viewer_count, 0);

        return res.json({
            type: "game",
            game_data: {
                id: gameData.id,
                name: gameData.name,
                box_art_url: gameData.box_art_url.replace('{width}', '140').replace('{height}', '190'),
                total_streams: streams.length,
                total_viewers: viewerCount,
                top_streamer_login: streams[0]?.user_login || "N/A",
                top_streamer_viewers: streams[0]?.viewer_count || 0
            },
            message: `Jeu trouvé: ${gameData.name}. ${streams.length} streams actifs, ${viewerCount} spectateurs. Prêt pour l'analyse de niche.`
        });

    } else {
        // --- ÉTAPE 2: Si aucun jeu trouvé, tenter un scan d'UTILISATEUR ---
        const userData = await fetchUserDetailsForScan(query, token);
        
        if (userData) {
            // Si l'utilisateur est trouvé
            return res.json({
                type: "user",
                user_data: {
                    id: userData.id,
                    login: userData.login,
                    display_name: userData.display_name,
                    profile_image_url: userData.profile_image_url,
                    description: userData.description
                },
                message: `Utilisateur trouvé: ${userData.display_name}. Prêt pour l'analyse de repurpose.`
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

// Route de base qui sert le fichier principal de l'application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Assure que le fichier principal est accessible directement
app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Assure que les autres outils sont accessibles (si existants)
app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});


// =========================================================
// Démarrage du Serveur
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    // Tente de récupérer le token d'application immédiatement
    getAppAccessToken();
});

// Reste de votre code (non spécifié dans le snippet, mais inclus pour la complétude)
// ...








