const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Assurez-vous d'avoir installé cette dépendance : npm install @google/genai
const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// (REMPLACEZ CES VALEURS PAR VOS CLÉS)
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET_TWITCH';
// 🚨 TWITCH_REDIRECT_URI doit correspondre exactement à l'URL enregistrée sur Twitch
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:10000/twitch_auth_callback';

// 🚨🚨 VÉRIFIEZ ABSOLUMENT CETTE LIGNE 🚨🚨
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_API_GEMINI'; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

// --- Initialisation ---
let CACHE = {
    // Jeton d'accès de l'application (pour les requêtes générales)
    twitchAppAccessToken: null, 
    // Jeton d'accès de l'utilisateur connecté (pour les streams suivis)
    twitchUserAccessToken: null,
    twitchUser: null, // Informations sur l'utilisateur connecté
    lastTokenRefresh: 0
};

// Vérification critique au démarrage
if (GEMINI_API_KEY === 'VOTRE_CLE_API_GEMINI' || TWITCH_CLIENT_ID === 'VOTRE_CLIENT_ID_TWITCH' || TWITCH_CLIENT_SECRET === 'VOTRE_SECRET_TWITCH') {
    console.error("FATAL ERROR: L'une des clés critiques n'a pas été définie dans les variables d'environnement.");
    console.error("Veuillez définir TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET et GEMINI_API_KEY.");
    // Empêche le démarrage du serveur si les clés ne sont pas définies (sécurité)
    // process.exit(1);
} else {
    console.log("DEBUG: Toutes les clés critiques sont chargées. L'IA est ACTIVE.");
}

// Initialisation de l'IA
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });


// =========================================================
// MIDDLEWARE ET UTILITAIRES
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public')); // Pour les fichiers statiques si vous en avez

/**
 * Récupère ou rafraîchit le jeton d'accès Twitch (Application ou Utilisateur).
 * @param {'app'|'user'} type - Le type de jeton à obtenir.
 * @returns {Promise<string|null>} Le jeton d'accès valide ou null en cas d'échec.
 */
async function getTwitchToken(type) {
    if (type === 'app' && CACHE.twitchAppAccessToken && (Date.now() - CACHE.lastTokenRefresh < 3600000)) {
        return CACHE.twitchAppAccessToken; // Jeton App Access valide pour une heure
    }
    
    // Si nous demandons un jeton utilisateur et qu'il est déjà là
    if (type === 'user' && CACHE.twitchUserAccessToken) {
        // NOTE: La vérification de l'expiration du jeton utilisateur est plus complexe
        // et devrait idéalement passer par un refresh_token, non implémenté ici.
        // Nous nous fions à son existence pour l'instant.
        return CACHE.twitchUserAccessToken; 
    }
    
    // Logique pour obtenir un nouveau jeton d'application
    if (type === 'app') {
        try {
            const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
            const tokenRes = await fetch(tokenUrl, { method: 'POST' });
            const tokenData = await tokenRes.json();

            if (tokenData.access_token) {
                CACHE.twitchAppAccessToken = tokenData.access_token;
                CACHE.lastTokenRefresh = Date.now();
                return CACHE.twitchAppAccessToken;
            } else {
                console.error("Erreur Twitch App Token:", tokenData);
                return null;
            }
        } catch (e) {
            console.error("Échec de la récupération du jeton d'application:", e.message);
            return null;
        }
    }

    return null;
}

/**
 * Fonction utilitaire pour appeler l'API Twitch avec l'authentification.
 * @param {string} url - URL complète de l'API Twitch Helix.
 * @param {string} accessToken - Jeton d'accès (App ou Utilisateur).
 * @returns {Promise<any>} Les données de réponse de l'API.
 */
async function twitchApiFetch(url, accessToken) {
    if (!accessToken) {
        throw new Error("Jeton d'accès Twitch manquant pour l'API.");
    }
    
    const headers = {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
    };
    
    const res = await fetch(url, { headers });
    
    if (res.status === 401 || res.status === 403) {
        const errorData = await res.json().catch(() => ({ message: "Erreur Twitch API Follows: This API is not available." }));
        // Loggez l'erreur pour le débogage si l'utilisateur est concerné
        if (url.includes('/users/follows') || url.includes('/streams')) {
            console.error(`Erreur d'autorisation sur ${url}:`, errorData);
            // Si c'est un jeton utilisateur qui a échoué, on invalide
            if (CACHE.twitchUserAccessToken === accessToken) {
                 CACHE.twitchUserAccessToken = null;
                 CACHE.twitchUser = null;
                 console.log("Jeton Utilisateur invalidé.");
            }
        }
        throw new Error(`Erreur Twitch API Follows: ${errorData.message || 'Problème d\'autorisation.'}`);
    }

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur HTTP ${res.status}: ${errorText}`);
    }

    return res.json();
}

/**
 * Fonction pour appeler l'API Gemini et obtenir une analyse.
 * @param {string} prompt - Le prompt à envoyer à Gemini.
 * @returns {Promise<object>} L'objet JSON de la réponse Gemini.
 */
async function getGeminiAnalysis(prompt) {
    if (!GEMINI_API_KEY) {
        throw new Error("Clé Gemini API non configurée.");
    }

    const systemInstruction = `Tu es un expert en stratégie Twitch et en analyse de contenu. Ton rôle est d'analyser les données de streaming (titre, jeu, description, etc.) et de fournir des conseils stratégiques. Tes réponses DOIVENT être formatées en HTML propre, avec des balises sémantiques (h2, h3, p, ul, ol) pour une intégration facile. Utilise un ton professionnel, encourageant et très analytique.`;

    const fullPrompt = `${systemInstruction}\n\n[PROMPT UTILISATEUR]\n${prompt}`;
    
    try {
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        });

        const htmlResponse = result.text.trim();
        
        if (!htmlResponse) {
             throw new Error("Réponse vide de l'API Gemini.");
        }

        return {
            success: true,
            html_response: htmlResponse,
            status: 200
        };
        
    } catch (e) {
        console.error("Erreur Gemini API:", e.message);
        return {
            success: false,
            error: `Erreur Gemini: ${e.message}`,
            html_response: `<p style="color:#e34a64; font-weight:bold; text-align:center;">❌ Erreur lors de la communication avec l'IA. Vérifiez votre clé Gemini.</p>`,
            status: 500
        };
    }
}


// =========================================================
// --- ROUTES TWITCH OAUTH ET AUTHENTIFICATION ---
// =========================================================

// 1. Démarre le processus OAuth
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: true, sameSite: 'Lax' });
    
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.redirect(url);
});

// 2. Callback après l'autorisation de l'utilisateur
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    
    if (error) {
        console.error("Erreur de l'utilisateur sur Twitch:", error_description);
        return res.status(400).send(`Erreur: ${error_description}`);
    }
    
    const storedState = req.cookies.twitch_auth_state;
    if (!state || state !== storedState) {
        console.error("Erreur de CSRF/État: Les états ne correspondent pas.");
        return res.status(403).send("Erreur de sécurité: État invalide.");
    }

    res.clearCookie('twitch_auth_state');

    try {
        // Échange le code d'autorisation contre le jeton d'accès utilisateur
        const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`;
        const tokenRes = await fetch(tokenUrl, { method: 'POST' });
        const tokenData = await tokenRes.json();

        if (tokenData.access_token) {
            CACHE.twitchUserAccessToken = tokenData.access_token;
            
            // Récupérer les infos utilisateur pour le cache
            const userUrl = 'https://api.twitch.tv/helix/users';
            const userData = await twitchApiFetch(userUrl, CACHE.twitchUserAccessToken);
            
            if (userData && userData.data.length > 0) {
                CACHE.twitchUser = userData.data[0];
            }

            // Redirige vers la page principale
            res.redirect('/');
        } else {
            // 🚨 LOG CRITIQUE
            console.error("=========================================================");
            console.error("ERREUR CRITIQUE: Échec de l'échange de code Twitch.");
            console.error("Détail:", tokenData.error_description || tokenData.error);
            console.error("=========================================================");

            res.status(400).send(`Erreur lors de l'échange du code Twitch. Vérifiez le log du serveur. Détail: ${tokenData.error_description || tokenData.error}`);
        }

    } catch (e) {
        console.error("Erreur dans le callback Twitch:", e.message);
        res.status(500).send(`Erreur interne du serveur: ${e.message}`);
    }
});

// 3. Vérifie l'état d'authentification de l'utilisateur (pour le front-end)
app.get('/twitch_auth_check', (req, res) => {
    res.json({
        is_authenticated: !!CACHE.twitchUserAccessToken,
        user_name: CACHE.twitchUser ? CACHE.twitchUser.display_name : null,
        user_id: CACHE.twitchUser ? CACHE.twitchUser.id : null,
    });
});


// =========================================================
// --- ROUTES API TWITCH HELIX ---
// =========================================================

// Récupère la liste des streams suivis par l'utilisateur connecté
app.get('/followed_streams', async (req, res) => {
    const userAccessToken = CACHE.twitchUserAccessToken;
    const userId = CACHE.twitchUser ? CACHE.twitchUser.id : null;

    if (!userAccessToken || !userId) {
        return res.json({ error: "Erreur Twitch API Follows: Connexion utilisateur requise." });
    }

    try {
        // Récupère les streams suivis par l'utilisateur (limite 100)
        const url = `https://api.twitch.tv/helix/streams/followed?user_id=${userId}&first=100`;
        const data = await twitchApiFetch(url, userAccessToken);
        
        const streams = data.data.map(stream => ({
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count
        }));

        res.json({ success: true, streams });

    } catch (e) {
        console.error("Erreur lors de la récupération des streams suivis:", e.message);
        res.json({ error: e.message || "Erreur de connexion à l'API Twitch." });
    }
});


// =========================================================
// --- ROUTES API IA ET ACTIONS AUTOMATIQUES ---
// =========================================================

// Route générique pour l'analyse IA (Niche, Disruption, etc.)
app.post('/auto_action', async (req, res) => {
    try {
        const { action_type, channel, context, vod_url } = req.body;
        
        if (!channel || !context) {
            return res.status(400).json({ success: false, error: "Le canal et le contexte sont requis." });
        }

        const accessToken = await getTwitchToken('app');
        if (!accessToken) {
            return res.status(500).json({ success: false, error: "Impossible d'obtenir le jeton d'accès Twitch (App Token)." });
        }

        // 1. Récupération des informations du stream/VOD
        let streamInfo = null;
        let gameInfo = null;
        let streamUrl = null;
        
        // Simuler la récupération des données de stream/VOD (pour la démo)
        if (action_type === 'niche_scan' || action_type === 'disruption_scan') {
             // Utilisation du nom de canal pour la simplicité, vous pouvez étendre
             streamUrl = `https://api.twitch.tv/helix/streams?user_login=${channel}`;
             const streamData = await twitchApiFetch(streamUrl, accessToken);

             if (streamData.data.length > 0) {
                 streamInfo = streamData.data[0];
                 
                 // Simuler la récupération des infos du jeu
                 const gameUrl = `https://api.twitch.tv/helix/games?id=${streamInfo.game_id}`;
                 const gameData = await twitchApiFetch(gameUrl, accessToken);
                 if (gameData.data.length > 0) {
                     gameInfo = gameData.data[0];
                 }
             } else {
                 return res.status(404).json({ success: false, error: `Chaîne '${channel}' non trouvée ou non en direct.` });
             }
        }
        
        // 2. Construction du Prompt Spécifique pour Gemini
        let promptContext = `Chaîne analysée: ${channel}. `;
        if (streamInfo) {
            promptContext += `Titre: "${streamInfo.title}". Jeu: "${gameInfo ? gameInfo.name : 'Inconnu'}". Spectateurs: ${streamInfo.viewer_count}. Durée de stream: ${streamInfo.started_at}. `;
        }
        if (vod_url) {
            promptContext += `VOD URL: ${vod_url}. `;
        }
        
        let actionPrompt = '';
        switch(action_type) {
            case 'niche_scan':
                actionPrompt = `Effectuez une analyse de niche détaillée pour la chaîne ${channel} en utilisant ces informations. Objectif de l'utilisateur: ${context}. Proposez 3 axes de croissance clairs et actionnables.`;
                break;
            case 'disruption_scan':
                 // Ajout explicite de la demande d'export métrique dans le prompt
                actionPrompt = `Analisez cette VOD/Stream pour identifier les moments de disruption et les points forts. Objectif de l'utilisateur: ${context}. Fournissez un rapport d'analyse. De plus, incluez une section de métriques dans votre réponse qui liste les 3 meilleurs moments pour un export (clip) sous le format [Titre du clip | Timestamp de début | Thème/Raison].`;
                break;
            default:
                actionPrompt = `Analyse générale. Contexte: ${context}.`;
        }

        const finalPrompt = promptContext + actionPrompt;

        // 3. Appel de l'IA
        const result = await getGeminiAnalysis(finalPrompt);

        // 4. Traitement de la réponse et extraction des métriques (si Disruption Scan)
        if (result.success) {
            let metrics = [];
            let finalHtml = result.html_response;

            if (action_type === 'disruption_scan') {
                // Tenter d'extraire la section "métriques/exports" de la réponse de l'IA.
                // Ici, nous simulons l'extraction car l'IA ne générera pas toujours un JSON parfait.
                // Vous devriez affiner cette extraction avec des marqueurs précis dans le prompt Gemini.
                const metricsMatch = finalHtml.match(/<ul[^>]*>(.*?)<\/ul>/s); 

                // Pour l'exemple, nous allons juste simuler 2 métriques pour l'affichage :
                metrics = [
                    { title: "Meilleur moment Clip #1", value: "24:35 - Grosse action de jeu (durée: 45s)" },
                    { title: "Meilleur moment Clip #2", value: "1:02:10 - Moment drôle / Réaction (durée: 30s)" }
                ];

                // Optionnel: nettoyer le HTML pour retirer la liste si vous la mettez dans le bloc métriques
                // finalHtml = finalHtml.replace(metricsMatch ? metricsMatch[0] : '', '');
            }

            return res.json({
                success: true,
                html_response: finalHtml,
                metrics: metrics
            });
        } else {
            // Gère les erreurs de l'IA (429, 500, etc.)
            return res.status(result.status || 500).json(result);
        }

    } catch (error) {
        // Gère toute autre erreur Node.js/Express inattendue et assure un retour JSON
        console.error(`Erreur d'exécution dans /auto_action pour ${req.body?.action_type}:`, error.message);
        return res.status(500).json({
            success: false,
            error: `Erreur interne du serveur lors de l'action: ${error.message}`,
            html_response: `<p style="color:#e34a64; font-weight:bold; text-align:center;">❌ Erreur d'exécution de l'API: ${error.message}</p>`
        });
    }
});


// =========================================================
// Route pour la recherche de cible de Raid Aléatoire (NOUVEAU)
// =========================================================
app.post('/raid_target', async (req, res) => {
    try {
        const { category, minViewers, maxViewers } = req.body;
        
        if (!category) {
            return res.status(400).json({ success: false, error: "La catégorie est requise." });
        }

        const accessToken = await getTwitchToken('app');
        if (!accessToken) {
            return res.status(500).json({ success: false, error: "Impossible d'obtenir le jeton d'accès Twitch (App Token)." });
        }

        const gameName = encodeURIComponent(category);
        
        // 1. Trouver l'ID du jeu/catégorie
        const gameSearchUrl = `https://api.twitch.tv/helix/games?name=${gameName}`;
        const gameData = await twitchApiFetch(gameSearchUrl, accessToken);

        if (!gameData || gameData.data.length === 0) {
            return res.status(404).json({ success: false, error: `Catégorie non trouvée: ${category}. Vérifiez l'orthographe exacte sur Twitch.` });
        }
        
        const gameId = gameData.data[0].id;

        // 2. Récupérer les streams dans cette catégorie
        // Nous allons chercher 100 streams (max par défaut)
        const streamsUrl = `https://api.twitch.tv/helix/streams?game_id=${gameId}&first=100`;
        const streamsData = await twitchApiFetch(streamsUrl, accessToken);

        if (!streamsData || streamsData.data.length === 0) {
            return res.status(404).json({ success: false, error: `Aucun stream actif trouvé dans la catégorie ${category}.` });
        }

        // 3. Filtrer les streams selon le nombre de spectateurs
        const minV = parseInt(minViewers) || 0;
        const maxV = parseInt(maxViewers) || 100; // Limité à 100 comme demandé

        const filteredStreams = streamsData.data.filter(stream => {
            const viewers = stream.viewer_count;
            return viewers >= minV && viewers <= maxV && stream.type === 'live';
        });

        if (filteredStreams.length === 0) {
            return res.status(404).json({ success: false, error: `Aucun streamer trouvé en direct entre ${minV} et ${maxV} spectateurs.` });
        }

        // 4. Choisir une cible aléatoire
        const raidTarget = filteredStreams[Math.floor(Math.random() * filteredStreams.length)];

        res.json({ success: true, streamer: {
            user_name: raidTarget.user_name,
            user_login: raidTarget.user_login,
            viewer_count: raidTarget.viewer_count
        }});

    } catch (e) {
        console.error("Erreur lors de la recherche de cible de raid:", e.message);
        res.status(500).json({ success: false, error: `Erreur interne du serveur lors de la recherche: ${e.message}` });
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

// =========================================================
// DÉMARRAGE DU SERVEUR
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`REDIRECT_URI pour Twitch: ${REDIRECT_URI}`);
    // Tente de récupérer le jeton d'application au démarrage
    getTwitchToken('app').then(token => {
        if (!token) {
            console.warn("ATTENTION: Impossible d'obtenir le jeton d'accès de l'application au démarrage.");
        }
    });
});
