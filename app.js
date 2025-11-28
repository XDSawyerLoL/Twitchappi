const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); 
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const admin = require("firebase-admin"); 

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI; // Maintenant utilisé pour l'OAuth

// Clé IA et modèle optimisé
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

// Initialisation de l'IA
let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    console.error("FATAL DEBUG: GEMINI_API_KEY non trouvée. L'IA sera désactivée.");
}

// =========================================================
// --- CACHING STRATÉGIQUE ---
// =========================================================

const CACHE = {
    appAccessToken: {
        token: null,
        expiry: 0
    },
    nicheOpportunities: {
        data: null,
        timestamp: 0,
        lifetime: 1000 * 60 * 20 
    }
};

// =========================================================
// --- MIDDLEWARES & CONFIG EXPRESS ---
// =========================================================

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(cookieParser());

// =========================================================
// --- FONCTIONS UTILITAIRES TWITCH API ---
// =========================================================

/**
 * Récupère ou met à jour le jeton d'accès d'application Twitch.
 */
async function getAppAccessToken() {
    const now = Date.now();
    // 1. Vérifier le cache
    if (CACHE.appAccessToken.token && CACHE.appAccessToken.expiry > now) {
        return CACHE.appAccessToken.token;
    }
    
    // 2. Si non valide, demander un nouveau token
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        const newToken = data.access_token;
        
        // 3. Mettre à jour le cache
        CACHE.appAccessToken.token = newToken;
        CACHE.appAccessToken.expiry = now + (data.expires_in * 1000) - (5 * 60 * 1000); 
        
        console.log("✅ Nouveau Token Twitch généré et mis en cache.");
        return newToken;
        
    } catch (error) {
        console.error("❌ Échec de la récupération du token Twitch:", error.message);
        return null;
    }
}

async function fetchGameDetails(query, token) {
    const url = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(query)}`;
    const HEADERS = {
        'Client-Id': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };

    try {
        const response = await fetch(url, { headers: HEADERS });
        const data = await response.json();
        return data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des détails du jeu:", error.message);
        return null;
    }
}

async function fetchStreamsForGame(gameId, token) {
    const url = `https://api.twitch.tv/helix/streams?game_id=${gameId}&first=100`;
    const HEADERS = {
        'Client-Id': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };

    try {
        const response = await fetch(url, { headers: HEADERS });
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des streams du jeu:", error.message);
        return [];
    }
}

async function fetchUserDetailsForScan(query, token) {
    const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(query)}`;
    const HEADERS = {
        'Client-Id': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };

    try {
        const response = await fetch(url, { headers: HEADERS });
        const data = await response.json();

        if (data.data.length > 0) {
            const user = data.data[0];
            const streamUrl = `https://api.twitch.tv/helix/streams?user_id=${user.id}`;
            const streamResponse = await fetch(streamUrl, { headers: HEADERS });
            const streamData = await streamResponse.json();
            const isLive = streamData.data.length > 0;
            const streamDetails = isLive ? streamData.data[0] : null;

            return {
                id: user.id,
                display_name: user.display_name,
                login: user.login,
                profile_image_url: user.profile_image_url,
                description: user.description,
                is_live: isLive,
                stream_details: streamDetails
            };
        }
        return null;

    } catch (error) {
        console.error("❌ Erreur lors de la récupération des détails de l'utilisateur:", error.message);
        return null;
    }
}


// =========================================================
// --- FONCTION CLÉ : CALCUL DU RATIO V/S & OPPORTUNITÉS ---
// =========================================================

const MAX_PAGES = 20; 
const MAX_VIEWERS_LIMIT = 500; 

async function fetchNicheOpportunities(token) {
    const now = Date.now();
    // 1. Vérifier le cache des niches
    if (CACHE.nicheOpportunities.data && CACHE.nicheOpportunities.timestamp + CACHE.nicheOpportunities.lifetime > now) {
        console.log("✅ Données de niche récupérées du cache.");
        return CACHE.nicheOpportunities.data;
    }

    console.log("🚀 Lancement du nouveau scan V/S...");
    
    const API_BASE_URL = 'https://api.twitch.tv/helix/streams';
    let paginationCursor = null;
    let requestsCount = 0;
    const gameStats = {};

    while (requestsCount < MAX_PAGES) {
        let url = API_BASE_URL + `?first=100`; 
        if (paginationCursor) {
            url += `&after=${paginationCursor}`;
        }

        const HEADERS = {
            'Client-Id': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`
        };

        try {
            const response = await fetch(url, { headers: HEADERS });
            if (!response.ok) {
                if (response.status === 429) {
                    console.warn("⚠️ Rate Limit Twitch atteint. Arrêt du scan.");
                    break;
                }
                throw new Error(`Erreur API Twitch: ${response.status}`);
            }

            const data = await response.json();

            data.data.forEach(stream => {
                const viewers = stream.viewer_count;
                
                if (viewers <= MAX_VIEWERS_LIMIT) { 
                    const gameId = stream.game_id;
                    const gameName = stream.game_name;
    
                    if (!gameStats[gameId]) {
                        gameStats[gameId] = { 
                            game_name: gameName,
                            totalViewers: 0,
                            totalStreamers: 0,
                        };
                    }
    
                    gameStats[gameId].totalViewers += viewers;
                    gameStats[gameId].totalStreamers += 1;
                }
            });

            paginationCursor = data.pagination.cursor;
            requestsCount++;

            if (!paginationCursor || requestsCount >= MAX_PAGES) {
                break;
            }

        } catch (error) {
            console.error("❌ Erreur lors de la requête de scan V/S :", error.message);
            break;
        }
    }

    const nicheOpportunities = [];
    for (const gameId in gameStats) {
        const stats = gameStats[gameId];
        
        if (stats.totalStreamers >= 5) {
            const ratio = stats.totalViewers / stats.totalStreamers;

            nicheOpportunities.push({
                game_name: stats.game_name,
                ratio_v_s: parseFloat(ratio.toFixed(2)), 
                total_streamers: stats.totalStreamers,
                total_viewers: stats.totalViewers,
            });
        }
    }

    nicheOpportunities.sort((a, b) => b.ratio_v_s - a.ratio_v_s);
    
    const topNiches = nicheOpportunities.slice(0, 10);

    CACHE.nicheOpportunities.data = topNiches;
    CACHE.nicheOpportunities.timestamp = now;

    return topNiches;
}

// =========================================================
// --- ROUTES DE L'APPLICATION (API) ---
// =========================================================

// Middleware pour vérifier la disponibilité de l'IA
app.use((req, res, next) => {
    if (req.originalUrl === '/critique_ia' && !ai) {
        return res.status(503).json({ error: "Service d'IA non disponible : Clé Gemini manquante." });
    }
    next();
});


// --- CORRECTION DU CANNOT GET /twitch_auth_start ---
// Route pour lancer l'authentification utilisateur (OAuth) - Réintroduite pour la compatibilité
app.get('/twitch_auth_start', (req, res) => {
    // Génération d'un état aléatoire pour la sécurité (prévention CSRF)
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

    // Les scopes 'user:read:follows' et 'user:read:email' sont des exemples courants
    const scopes = 'user:read:follows+user:read:email+channel:read:subscriptions';

    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scopes}&state=${state}`;
    
    // Redirection de l'utilisateur vers Twitch
    res.redirect(authUrl);
});
// --- FIN DE LA CORRECTION ---


// Route principale pour l'analyse IA des niches
app.post('/critique_ia', async (req, res) => {
    if (req.body.type !== 'trend') {
        return res.status(400).json({ error: "Type de critique IA non supporté." });
    }

    try {
        const token = await getAppAccessToken();
        if (!token) {
            return res.status(500).json({ error: "Impossible d'obtenir le jeton d'accès Twitch." });
        }

        const nicheOpportunities = await fetchNicheOpportunities(token);

        if (!nicheOpportunities || nicheOpportunities.length === 0) {
            return res.json({ 
                html_critique: `<p style="color:red;">❌ L'analyse n'a trouvé aucune niche fiable (moins de 5 streamers par jeu analysé).</p>` 
            });
        }

        const promptData = JSON.stringify(nicheOpportunities, null, 2);
        
        const iaPrompt = `
            Tu es le 'Streamer AI Hub', un conseiller en croissance expert.
            Ton analyse est basée sur le ratio V/S (Spectateurs par Streamer), l'indicateur clé pour trouver des niches sur Twitch. Un ratio V/S élevé signifie que la concurrence est faible par rapport à la demande.
            
            Voici le TOP 10 des meilleures opportunités de niches (classées par Ratio V/S) que nous avons trouvées :
            ${promptData}

            Ta réponse doit être en français et formatée en HTML pour un affichage web. Utilise des balises <h1>, <p>, <ul>, <li> et des sauts de ligne (<br/>) pour aérer.
            
            Réponds en trois parties distinctes :

            PARTIE 1: CONCLUSION et Recommandation (Titre: "🌟 Niche Recommandée par l'IA")
            - Identifie la meilleure opportunité (le top du classement V/S) en justifiant pourquoi c'est la meilleure pour un nouveau streamer.

            PARTIE 2: Stratégie de Titre et Description (Titre: "✍️ Optimisation du Contenu (SEO Twitch)")
            - Propose un titre de live percutant, accrocheur et non-générique pour le jeu recommandé.
            - Explique comment le streamer doit utiliser les tags et la description pour cibler précisément cette niche.

            PARTIE 3: Plan d'Action sur 7 Jours (Titre: "📅 Plan d'Action 7 Jours (Croissance Instantanée)")
            - Donne un plan d'action concret en 3 étapes (un objectif par étape) pour les 7 premiers jours de streaming sur cette niche.
        `;

        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: iaPrompt,
        });

        const iaResponse = result.text;

        return res.json({
            html_critique: iaResponse 
        });

    } catch (e) {
        console.error("❌ Erreur critique dans /critique_ia:", e.message);
        return res.status(500).json({ 
            html_critique: `<p style="color:red;">Erreur IA: ${e.message}. Vérifiez la clé GEMINI_API_KEY ou la connexion Twitch.</p>`
        });
    }
});

// Route pour le scan de jeu ou d'utilisateur
app.post('/api/scan_query', async (req, res) => {
    const { query } = req.body; 
    if (!query) {
        return res.status(400).json({ error: "Le paramètre 'query' est manquant." });
    }

    try {
        const token = await getAppAccessToken();
        if (!token) {
            return res.status(500).json({ error: "Impossible d'obtenir le jeton d'accès Twitch." });
        }

        // --- ÉTAPE 1: Tenter un scan de JEU ---
        const gameData = await fetchGameDetails(query, token);
        
        if (gameData) {
            const streams = await fetchStreamsForGame(gameData.id, token);
            
            const totalViewers = streams.reduce((sum, stream) => sum + stream.viewer_count, 0);
            const totalStreamers = streams.length;
            const avgViewers = totalStreamers > 0 ? (totalViewers / totalStreamers).toFixed(2) : 0;
            
            return res.json({
                type: "game",
                game_data: {
                    name: gameData.name,
                    box_art_url: gameData.box_art_url.replace('-{width}x{height}', '-285x380'),
                    total_viewers: totalViewers,
                    total_streamers: totalStreamers,
                    avg_viewers_per_streamer: avgViewers,
                    streams: streams.slice(0, 10) 
                }
            });

        } else {
            // --- ÉTAPE 2: Tenter un scan d'UTILISATEUR ---
            const userData = await fetchUserDetailsForScan(query, token);
            
            if (userData) {
                return res.json({
                    type: "user",
                    user_data: userData
                });
            } else {
                return res.json({ 
                    type: "none", 
                    message: `Aucun résultat trouvé pour la requête '${query}' comme jeu ou utilisateur.` 
                });
            }
        }

    } catch (e) {
        console.error("❌ Erreur critique dans /api/scan_query:", e.message);
        return res.status(500).json({ error: `Erreur interne du serveur lors du scan: ${e.message}` });
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

// Ajout de toutes les routes statiques manquantes pour une compatibilité maximale
app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});

// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    getAppAccessToken(); 
});
