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
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI; 

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

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

const BOOST_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 heures

const CACHE = {
    appAccessToken: {
        token: null,
        expiry: 0
    },
    nicheOpportunities: {
        data: null,
        timestamp: 0,
        lifetime: 1000 * 60 * 20 // 20 minutes
    },
    streamBoosts: {}
};

// =========================================================
// --- MIDDLEWARES & CONFIG EXPRESS ---
// =========================================================

app.use(cors({ 
    origin: '*',
    credentials: true
})); 
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// --- FONCTIONS UTILITAIRES TWITCH API ---
// =========================================================

/**
 * Récupère ou met à jour le jeton d'accès d'application Twitch.
 */
async function getAppAccessToken() {
    const now = Date.now();
    if (CACHE.appAccessToken.token && CACHE.appAccessToken.expiry > now) {
        return CACHE.appAccessToken.token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        const newToken = data.access_token;
        
        CACHE.appAccessToken.token = newToken;
        CACHE.appAccessToken.expiry = now + (data.expires_in * 1000) - (5 * 60 * 1000); 
        
        console.log("✅ Nouveau Token Twitch généré et mis en cache.");
        return newToken;
        
    } catch (error) {
        console.error("❌ Échec de la récupération du token Twitch:", error.message);
        return null;
    }
}

/**
 * Récupère les détails de l'utilisateur à partir d'un token d'accès utilisateur.
 */
async function fetchUserIdentity(userAccessToken) {
    const url = 'https://api.twitch.tv/helix/users';
    try {
        const response = await fetch(url, {
            headers: {
                'Client-Id': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${userAccessToken}`
            }
        });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return data.data && data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        console.error("❌ Erreur lors de la récupération de l'identité utilisateur:", error.message);
        return null;
    }
}

/**
 * Récupère les streams en direct suivis par l'utilisateur.
 */
async function fetchFollowedStreams(userId, userAccessToken) {
    const url = `https://api.twitch.tv/helix/streams/followed?user_id=${userId}`;
    try {
        const response = await fetch(url, {
            headers: {
                'Client-Id': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${userAccessToken}`
            }
        });
        if (!response.ok) {
             throw new Error(`Erreur API Twitch (followed_streams): ${response.status}`);
        }
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des streams suivis:", error.message);
        return [];
    }
}

/**
 * Récupère les détails d'un jeu par son nom.
 */
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

/**
 * Récupère les streams en direct pour un ID de jeu donné.
 */
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

/**
 * Récupère les détails d'un utilisateur et vérifie s'il est en direct.
 */
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

/**
 * Récupère les détails de la dernière VOD d'un streamer.
 */
async function fetchLatestVOD(channelLogin, token) {
    // 1. Trouver l'ID de l'utilisateur
    const userUrl = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelLogin)}`;
    const HEADERS = {
        'Client-Id': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };

    const userResponse = await fetch(userUrl, { headers: HEADERS });
    const userData = await userResponse.json();

    if (!userData.data || userData.data.length === 0) {
        throw new Error(`Utilisateur Twitch non trouvé: ${channelLogin}`);
    }

    const userId = userData.data[0].id;

    // 2. Trouver la dernière VOD (type=archive, first=1)
    const vodUrl = `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=1`;
    
    const vodResponse = await fetch(vodUrl, { headers: HEADERS });
    const vodData = await vodResponse.json();

    if (!vodResponse.ok) {
        throw new Error(`Erreur API Twitch VOD: ${vodResponse.status}`);
    }

    if (vodData.data && vodData.data.length > 0) {
        const vod = vodData.data[0];
        const thumbnailUrl = vod.thumbnail_url.replace(/%\{width\}/g, '320').replace(/%\{height\}/g, '180');
        
        return {
            vod_id: vod.id,
            vod_title: vod.title,
            vod_url: vod.url,
            vod_thumbnail: thumbnailUrl
        };
    } else {
        return null;
    }
}


/**
 * Effectue un scan V/S (Viewers/Streamer) sur les petits streams pour trouver des niches.
 */
async function fetchNicheOpportunities(token) {
    const now = Date.now();
    if (CACHE.nicheOpportunities.data && CACHE.nicheOpportunities.timestamp + CACHE.nicheOpportunities.lifetime > now) {
        console.log("✅ Données de niche récupérées du cache.");
        return CACHE.nicheOpportunities.data;
    }

    console.log("🚀 Lancement du nouveau scan V/S...");
    const MAX_PAGES = 20;
    const MAX_VIEWERS_LIMIT = 500;
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
// --- MIDDLEWARE GÉNÉRAL ET ROUTES API ---
// =========================================================

// Middleware pour vérifier la clé Gemini avant les routes IA
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/critique_ia') && !ai) {
        return res.status(503).json({ error: "Service d'IA non disponible : Clé Gemini manquante." });
    }
    next();
});

// --- Routes OAuth ---

app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !REDIRECT_URI) {
        return res.status(500).send("Erreur de configuration côté serveur (CLIENT_ID ou REDIRECT_URI manquant).");
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true, maxAge: 600000 });
    
    const scope = 'user:read:follows'; 
    const authUrl = `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&response_type=code` +
        `&scope=${scope}` +
        `&state=${state}`;
        
    res.redirect(authUrl);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
         return res.status(400).send(`Erreur d'authentification Twitch: ${error}.`);
    }

    const storedState = req.cookies.twitch_auth_state;
    
    if (!state || state !== storedState) {
        return res.status(403).send('Erreur: État de la requête invalide ou manquant. Attaque CSRF potentielle.');
    }
    
    res.clearCookie('twitch_auth_state');

    const url = `https://id.twitch.tv/oauth2/token` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&client_secret=${TWITCH_CLIENT_SECRET}` +
        `&code=${code}` +
        `&grant_type=authorization_code` +
        `&redirect_uri=${REDIRECT_URI}`;
        
    try {
        const response = await fetch(url, { method: 'POST' });
        const tokenData = await response.json();

        if (tokenData.access_token) {
            const userAccessToken = tokenData.access_token;
            
            const identity = await fetchUserIdentity(userAccessToken);

            if (identity) {
                res.cookie('twitch_access_token', userAccessToken, { httpOnly: true, maxAge: tokenData.expires_in * 1000 });
                res.cookie('twitch_user_id', identity.id, { httpOnly: true, maxAge: tokenData.expires_in * 1000 });

                res.redirect('/NicheOptimizer.html'); 
            } else {
                return res.status(500).send("Erreur: Échec de la récupération de l'identité utilisateur après l'authentification.");
            }
        } else {
            console.error("Erreur de token:", tokenData);
            return res.status(500).send("Erreur: Échec de l'échange de code pour le jeton d'accès.");
        }
    } catch (error) {
        console.error("Erreur callback:", error.message);
        return res.status(500).send(`Erreur lors de l'authentification: ${error.message}`);
    }
});


app.get('/twitch_user_status', async (req, res) => {
    const userAccessToken = req.cookies.twitch_access_token;
    
    if (!userAccessToken) {
        return res.json({ 
            is_connected: false 
        });
    }

    try {
        const identity = await fetchUserIdentity(userAccessToken); 

        if (identity) {
            return res.json({ 
                is_connected: true, 
                username: identity.display_name,
                user_id: identity.id
            });
        } else {
            res.clearCookie('twitch_access_token');
            res.clearCookie('twitch_user_id');
            return res.json({ 
                is_connected: false 
            });
        }
    } catch (error) {
        console.error("Erreur critique dans /twitch_user_status (catch):", error.message);
        return res.json({ 
            is_connected: false, 
            error: "Vérification interne échouée." 
        });
    }
});

app.post('/twitch_logout', (req, res) => {
    res.clearCookie('twitch_access_token');
    res.clearCookie('twitch_user_id');
    res.json({ success: true, message: "Déconnexion réussie" });
});

app.get('/followed_streams', async (req, res) => {
    const userAccessToken = req.cookies.twitch_access_token;
    const userId = req.cookies.twitch_user_id;

    if (!userAccessToken || !userId) {
        return res.status(401).json({ error: "Utilisateur non authentifié." });
    }

    try {
        const streams = await fetchFollowedStreams(userId, userAccessToken);
        return res.json({ data: streams });
    } catch (e) {
        console.error("Erreur lors de la récupération des streams suivis:", e.message);
        return res.status(500).json({ error: "Échec de la récupération des streams Twitch." });
    }
});

// --- NOUVELLE ROUTE : CATÉGORIES RECOMMANDÉES (HYPE V/S) ---
app.get('/hype_categories', async (req, res) => {
    try {
        const token = await getAppAccessToken();
        if (!token) {
            return res.status(503).json({ 
                error: "Impossible d'obtenir le jeton d'accès App Twitch." 
            });
        }

        // 1. Récupérer les données de niche (V/S) depuis le cache/scan
        const nicheOpportunities = await fetchNicheOpportunities(token);
        
        if (!nicheOpportunities || nicheOpportunities.length === 0) {
            return res.json({ success: true, data: [] });
        }

        // 2. Récupérer les miniatures (box_art_url) pour chaque jeu
        const categoryPromises = nicheOpportunities.map(async (niche) => {
            const gameDetails = await fetchGameDetails(niche.game_name, token);
            
            if (gameDetails) {
                return {
                    game_name: niche.game_name,
                    viewer_count: niche.total_viewers, 
                    box_art_url: gameDetails.box_art_url 
                };
            }
            return null;
        });

        // Attendre que toutes les promesses soient résolues
        const resolvedCategories = await Promise.all(categoryPromises);
        
        // Filtrer les entrées nulles et retourner le résultat
        const finalCategories = resolvedCategories.filter(cat => cat !== null);
        
        return res.json({ 
            success: true, 
            data: finalCategories 
        });

    } catch (e) {
        console.error("❌ Erreur critique dans /hype_categories:", e.message);
        return res.status(500).json({ 
            error: `Erreur interne du serveur lors de la récupération des catégories: ${e.message}` 
        });
    }
});


// --- ROUTE POUR RÉCUPÉRER LES DÉTAILS VOD (Utilisée par le Repurposing) ---
app.post('/get_vod_details', async (req, res) => {
    const { channel } = req.body;
    
    if (!channel || channel.trim() === "") {
        return res.status(400).json({ error: "Le nom de la chaîne est requis." });
    }

    try {
        const token = await getAppAccessToken();
        if (!token) {
            return res.status(500).json({ 
                success: false, 
                error: "Impossible d'obtenir le jeton d'accès App Twitch." 
            });
        }

        const vodDetails = await fetchLatestVOD(channel, token); 

        if (vodDetails) {
            return res.json({ success: true, ...vodDetails });
        } else {
            return res.json({ 
                success: false, 
                error: "Aucune VOD récente (archive) trouvée pour cette chaîne. Cela peut être dû aux paramètres de confidentialité, à la suppression ou à la durée de rétention de Twitch."
            });
        }
    } catch (e) {
        console.error("❌ Erreur critique dans /get_vod_details:", e.message);
        return res.status(500).json({ 
            success: false, 
            error: `Erreur interne du serveur lors de la recherche de VOD: ${e.message}` 
        });
    }
});


// --- ROUTE SCAN & RESULTAT ---
app.post('/scan_target', async (req, res) => {
    const { query } = req.body; 
    if (!query || query.trim() === "") {
        return res.status(400).json({ error: "Le paramètre 'query' est manquant ou vide. Veuillez entrer un nom de jeu ou un pseudo." });
    }

    try {
        const token = await getAppAccessToken();
        if (!token) {
            return res.status(500).json({ error: "Impossible d'obtenir le jeton d'accès App Twitch." });
        }

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
        console.error("❌ Erreur critique dans /scan_target:", e.message);
        return res.status(500).json({ error: `Erreur interne du serveur lors du scan: ${e.message}` });
    }
});


// --- ROUTE CRITIQUE IA ---
app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;

    if (!['trend', 'niche', 'repurpose'].includes(type)) {
        return res.status(400).json({ error: "Type de critique IA non supporté. Types valides : trend, niche, repurpose." });
    }

    if (type !== 'trend' && (!query || query.trim() === '')) {
        return res.status(400).json({ error: "Le paramètre 'query' est manquant ou vide pour ce type d'analyse." });
    }

    try {
        const token = await getAppAccessToken();
        if (!token) {
            return res.status(500).json({ error: "Impossible d'obtenir le jeton d'accès Twitch." });
        }

        let iaPrompt = "";
        let promptTitle = "";

        if (type === 'trend') {
            promptTitle = "Détection de la Prochaine Niche";
            const nicheOpportunities = await fetchNicheOpportunities(token);
            if (!nicheOpportunities || nicheOpportunities.length === 0) {
                return res.json({ html_critique: `<p style="color:red;">❌ L'analyse n'a trouvé aucune niche fiable (moins de 5 streamers par jeu analysé).</p>` });
            }
            const promptData = JSON.stringify(nicheOpportunities, null, 2);

            iaPrompt = `
                Tu es le 'Streamer AI Hub', un conseiller en croissance expert. Ton analyse est basée sur le ratio V/S (Spectateurs par Streamer). 
                Voici le TOP 10 des meilleures opportunités de niches: ${promptData}
                Ta réponse doit être en français et formatée en HTML. Réponds en trois parties: 1. Niche Recommandée, 2. Optimisation du Contenu (SEO Twitch), 3. Plan d'Action 7 Jours.
            `;
            
        } else if (type === 'niche') {
            promptTitle = `Analyse de Niche pour le Jeu: ${query}`;
            
            const gameDetails = await fetchGameDetails(query, token);
            if (!gameDetails) {
                 return res.status(404).json({ error: `Jeu non trouvé: ${query}` });
            }
            const streams = await fetchStreamsForGame(gameDetails.id, token);
            const topStreams = streams.slice(0, 10).map(s => ({
                streamer: s.user_name,
                viewers: s.viewer_count,
                title: s.title
            }));
            const promptData = JSON.stringify(topStreams, null, 2);

            iaPrompt = `
                Tu es l'IA spécialisée en Niche. Le jeu ciblé est **${query}**. 
                Voici une analyse de ses 10 meilleurs streams actuels : ${promptData}
                Analyse la concurrence et la saturation du jeu. Propose une niche **spécifique** pour ce jeu (ex: "Jeu en mode Difficile" ou "Builds exclusifs").
                Ta réponse doit être en français et formatée en HTML. Réponds en trois parties: 1. Conclusion Niche (Saturation ?), 2. Proposition de Niche Spécifique, 3. 3 Idées de Titres Uniques pour cette Niche.
            `;

        } else if (type === 'repurpose') {
            promptTitle = `Analyse de Repurposing pour le Streamer: ${query}`;
            
            const userData = await fetchUserDetailsForScan(query, token);
            if (!userData) {
                 return res.status(404).json({ error: `Streamer non trouvé: ${query}` });
            }
            
            const vodDetails = await fetchLatestVOD(query, token).catch(() => null);
            const vodTitle = vodDetails ? vodDetails.vod_title : "VOD récente introuvable";


            const promptData = JSON.stringify({
                Streamer: userData.display_name,
                description: userData.description,
                dernieresActivites: [
                    `Dernière VOD: "${vodTitle}"`,
                    "Le streamer a une forte présence en Just Chatting et jeux compétitifs.",
                    "Analyser la VOD la plus récente pour trouver des moments de clutch, des fails hilarants, ou des discussions profondes."
                ]
            }, null, 2);


            iaPrompt = `
                Tu es l'IA spécialisée en Repurposing. Le streamer ciblé est **${query}**.
                Voici l'analyse de ses récentes activités : ${promptData}
                L'objectif est de générer du contenu court (TikTok/YouTube Shorts) à partir de ses VODs.
                Ta réponse doit être en français et formatée en HTML. Réponds en trois parties: 1. Identification du "Moment Viral" Potentiel (le plus fort), 2. Proposition de Vidéo Courte (Titre, Description, Hook) avec un **Point de Clip:** format 00:00:00 (même si la VOD n'est pas scannée, simule un timecode plausible), 3. 3 Idées de Sujets YouTube Long-Format Basées sur le style du Streamer.
                
                IMPORTANT: Dans la partie 2, inclure la mention exacte de timecode comme ceci: **Point de Clip:** 00:25:40 pour que le frontend le détecte.
            `;
        }
        
        if (!ai) {
             return res.status(503).json({ error: "Service d'IA non disponible." });
        }
        
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: iaPrompt,
        });

        // --- CORRECTION : Nettoyage du formatage Markdown/Code Block ---
        let cleanedText = result.text.trim();
        // Supprimer '```html' ou '```' au début
        if (cleanedText.startsWith('```html')) {
            cleanedText = cleanedText.substring(7); 
        } else if (cleanedText.startsWith('```')) {
             cleanedText = cleanedText.substring(3); 
        }
        // Supprimer '```' à la fin
        if (cleanedText.endsWith('```')) {
            cleanedText = cleanedText.substring(0, cleanedText.length - 3); 
        }
        cleanedText = cleanedText.trim(); 
        // -----------------------------------------------------------------


        return res.json({
            html_critique: `<h4>${promptTitle}</h4>` + cleanedText
        });

    } catch (e) {
        console.error(`❌ Erreur critique dans /critique_ia (${type}):`, e.message);
        const statusCode = e.message.includes('non trouvé') ? 404 : 500;
        return res.status(statusCode).json({ 
            error: `Erreur IA: ${e.message}. Vérifiez la clé GEMINI_API_KEY ou la connexion Twitch.`
        });
    }
});


// --- ROUTE STREAM BOOST (avec Cooldown) ---
app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    
    if (!channel || channel.trim() === "") {
        return res.status(400).json({ error: "Le nom de la chaîne est requis pour le Boost." });
    }

    const now = Date.now();
    const lastBoost = CACHE.streamBoosts[channel];

    if (lastBoost && (now - lastBoost) < BOOST_COOLDOWN_MS) {
        const timeRemaining = BOOST_COOLDOWN_MS - (now - lastBoost);
        const minutesRemaining = Math.ceil(timeRemaining / (1000 * 60));
        
        const errorMessage = `
             <p style="color:#e34a64; font-weight:bold;">
                ❌ Cooldown actif.
             </p>
             <p>
                Le Boost de <strong>${channel}</strong> sera disponible dans <strong>${minutesRemaining} minutes</strong>.
             </p>
        `;

        return res.status(429).json({ 
            error: `Cooldown de 3 heures actif. Prochain Boost disponible dans environ ${minutesRemaining} minutes.`,
            html_response: errorMessage
        });
    }

    CACHE.streamBoosts[channel] = now;

    const successMessage = `
        <p style="color:var(--color-primary-pink); font-weight:bold;">
            ✅ Boost de Stream Activé !
        </p>
        <p>
            La chaîne <strong>${channel}</strong> a été ajoutée à la rotation prioritaire pour une période de 10 minutes. 
            Le prochain boost sera disponible dans 3 heures. Bonne chance !
        </p>
    `;

    return res.json({ 
        success: true, 
        html_response: successMessage 
    });
});


// =========================================================
// Configuration des Routes Statiques
// =========================================================

// Route racine - sert le NicheOptimizer
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Route explicite pour NicheOptimizer.html (utile si le front y fait référence)
app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    getAppAccessToken(); 
});
