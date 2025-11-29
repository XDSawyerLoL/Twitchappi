const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

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
app.use(express.static(path.join(__dirname))); // Sert les fichiers statiques (y compris le CSS/JS si dans le même dossier)

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
 * Récupère les détails d'un utilisateur, son statut live, ses abonnés, ses vues totales, et ses derniers jeux.
 * CORRECTION V7.3: Ajout des appels pour followers, view_count, et last_games (VODs).
 */
async function fetchUserDetailsForScan(query, token) {
    const HEADERS = {
        'Client-Id': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };

    let user = null;
    let userData = null;

    try {
        // 1. Récupération des détails de base de l'utilisateur (pour l'ID et les vues totales)
        const userUrl = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(query)}`;
        const userResponse = await fetch(userUrl, { headers: HEADERS });
        userData = await userResponse.json();

        if (userData.data.length === 0) {
            return null;
        }
        
        user = userData.data[0];
        const userId = user.id;

        // 2. Récupération du statut Live
        const streamUrl = `https://api.twitch.tv/helix/streams?user_id=${userId}`;
        const streamResponse = await fetch(streamUrl, { headers: HEADERS });
        const streamData = await streamResponse.json();
        const isLive = streamData.data.length > 0;
        const streamDetails = isLive ? streamData.data[0] : null;

        // 3. Récupération du nombre d'abonnés (Followers)
        const followersUrl = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`;
        const followersResponse = await fetch(followersUrl, { headers: HEADERS });
        const followersData = await followersResponse.json();
        const followersCount = followersData.total || 0;

        // 4. Récupération des 3 derniers jeux streamés (via les VODs)
        const videosUrl = `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=3`;
        const videosResponse = await fetch(videosUrl, { headers: HEADERS });
        const videosData = await videosResponse.json();
        
        // Extrait les noms des jeux, en évitant les doublons consécutifs
        const lastGames = [];
        let lastGameName = null;
        if(videosData.data) {
             videosData.data.forEach(video => {
                if (video.game_name && video.game_name !== lastGameName) {
                    lastGames.push(video.game_name);
                    lastGameName = video.game_name;
                }
            });
        }


        return {
            id: userId,
            display_name: user.display_name,
            login: user.login,
            profile_image_url: user.profile_image_url,
            description: user.description,
            is_live: isLive,
            stream_details: streamDetails,
            // NOUVEAUX CHAMPS AJOUTÉS
            followers: followersCount,
            view_count: user.view_count || 0, // 'view_count' est généralement fourni ici
            last_games: lastGames.slice(0, 3) // Limite aux 3 derniers jeux uniques
        };

    } catch (error) {
        console.error("❌ Erreur lors de la récupération des détails de l'utilisateur (fallback):", error.message);
        
        // Tente d'utiliser les données utilisateur si elles ont été partiellement récupérées
        const fallbackUser = user || {
            id: 'N/A', 
            display_name: query, 
            login: query,
            profile_image_url: '',
            description: '',
            view_count: 0
        };
        
        // Retourne les données partielles avec des valeurs de repli pour éviter le crash
        return { 
            id: fallbackUser.id, 
            display_name: fallbackUser.display_name,
            login: fallbackUser.login,
            profile_image_url: fallbackUser.profile_image_url,
            description: fallbackUser.description,
            is_live: false,
            stream_details: null,
            followers: 0,
            view_count: fallbackUser.view_count,
            last_games: []
        };
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

                // CORRECTION ICI: Redirection explicite vers la page principale
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
            // Utilise la fonction corrigée pour récupérer toutes les données
            const userData = await fetchUserDetailsForScan(query, token); 
            
            if (userData && userData.id !== 'N/A') {
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
        let promptData = "";
        let promptTitle = "";

        if (type === 'trend') {
            promptTitle = "Détection de la Prochaine Niche";
            const nicheOpportunities = await fetchNicheOpportunities(token);
            if (!nicheOpportunities || nicheOpportunities.length === 0) {
                return res.json({ html_critique: `<p style="color:red;">❌ L'analyse n'a trouvé aucune niche fiable (moins de 5 streamers par jeu analysé).</p>` });
            }
            promptData = JSON.stringify(nicheOpportunities, null, 2);

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
            promptData = JSON.stringify(topStreams, null, 2);

            iaPrompt = `
                Tu es l'IA spécialisée en Niche. Le jeu ciblé est **${query}**. 
                Voici une analyse de ses 10 meilleurs streams actuels : ${promptData}
                Analyse la concurrence et la saturation du jeu. Propose une niche **spécifique** pour ce jeu (ex: "Jeu en mode Difficile" ou "Builds exclusifs").
                Ta réponse doit être en français et formatée en HTML. Réponds en trois parties: 1. Conclusion Niche (Saturation ?), 2. Proposition de Niche Spécifique, 3. 3 Idées de Titres Uniques pour cette Niche.
            `;

        } else if (type === 'repurpose') {
            promptTitle = `Analyse de Repurposing pour le Streamer: ${query}`;
            
            // Utilise la fonction corrigée pour récupérer plus de détails
            const userData = await fetchUserDetailsForScan(query, token);
            if (!userData || userData.id === 'N/A') {
                 return res.status(404).json({ error: `Streamer non trouvé: ${query}` });
            }
            // Utilise les données du streamer comme base
            promptData = JSON.stringify({
                Streamer: userData.display_name,
                description: userData.description,
                dernieresActivites: userData.last_games.length > 0 ? userData.last_games.map(g => `Streaming de ${g} (VOD disponible)`).join(', ') : "Activités récentes non trouvées, mais analyse basée sur la description et le style.",
                followers: userData.followers,
                total_views: userData.view_count
            }, null, 2);


            iaPrompt = `
                Tu es l'IA spécialisée en Repurposing. Le streamer ciblé est **${query}** (Followers: ${userData.followers}, Vues Totales: ${userData.view_count}).
                Voici l'analyse de ses récentes activités : ${promptData}
                L'objectif est de générer du contenu court (TikTok/YouTube Shorts) à partir de ses VODs. Simule l'analyse de ses meilleurs moments.
                Ta réponse doit être en français et formatée en HTML. Réponds en trois parties: 1. Identification du "Moment Viral" Potentiel (le plus fort), 2. Proposition de Vidéo Courte (Titre, Description, Hook), 3. 3 Idées de Sujets YouTube Long-Format Basées sur le style du Streamer.
            `;
        }
        
        if (!ai) {
             return res.status(503).json({ error: "Service d'IA non disponible." });
        }
        
        const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: iaPrompt,
        });

        return res.json({
            html_critique: `<h4>${promptTitle}</h4>` + result.text 
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
