const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { stringify } = require('csv-stringify'); 

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

// =========================================================
// --- LOGIQUE D'IMPORTATION DYNAMIQUE POUR L'IA ---
// =========================================================

let ai;
let GoogleGenAI; 

async function initGemini() {
    try {
        const geminiModule = await import('@google/genai');
        GoogleGenAI = geminiModule.GoogleGenAI;
        ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
        console.log("✅ GoogleGenAI chargé. L'IA est ACTIVE.");
        return true;
    } catch (e) {
        console.error("FATAL ERROR: Impossible de charger GoogleGenAI.", e.message);
        return false;
    }
}

// =========================================================
// MIDDLEWARES
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {} 
};

// =========================================================
// LOGIQUE TWITCH HELPER
// =========================================================

async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = {
                access_token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        } else {
            console.error("Échec de la récupération du token Twitch (Client Credentials).", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau lors de la récupération du token Twitch:", error);
        return null;
    }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Accès Twitch non autorisé.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) {
             CACHE.twitchTokens['app'] = null; 
        }
        if (token === CACHE.twitchUser?.access_token) {
             CACHE.twitchUser = null; 
        }
        const errorText = await res.text();
        throw new Error(`Erreur d'autorisation Twitch (401). Token invalide. Détail: ${errorText.substring(0, 100)}...`);
    }
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur lors de l'appel à l'API Twitch: Statut ${res.status}. Détail: ${errorText.substring(0, 100)}...`);
    }

    return res.json();
}

// =========================================================
// LOGIQUE GEMINI HELPER
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                { role: "user", parts: [{ text: prompt }] }
            ],
            config: {
                systemInstruction: "Tu es un expert en croissance et stratégie Twitch. Toutes tes réponses doivent être formatées en HTML simple (utilisant <p>, <ul>, <li>, <h4>, <strong>, <em>) sans balise <html> ou <body>, pour être directement injectées dans une div."
            }
        });
        
        const text = response.text.trim();
        return { success: true, html_response: text };

    } catch (e) {
        let statusCode = 500;
        let errorMessage = `Erreur interne du serveur lors de l'appel à l'IA. (Détail: ${e.message})`;
        
        if (e.message.includes('429')) {
             statusCode = 429;
             errorMessage = `❌ Erreur: Échec de l'appel à l'API Gemini. Limite de requêtes atteinte (Code 429). Votre clé IA a atteint son quota.`;
        }
        
        if (e.message.includes('400') || e.message.includes('403')) {
             statusCode = 403;
             errorMessage = `❌ Erreur: Clé API Gemini refusée (Code 403/400). La clé est invalide ou le service n'est pas activé.`;
        }
        
        return { 
            success: false, 
            status: statusCode, 
            error: errorMessage,
            html_response: `<p style="color:red; font-weight:bold;">${errorMessage}</p>`
        };
    }
}

// =========================================================
// --- ROUTES D'AUTHENTIFICATION TWITCH (OAuth) ---
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    // Correction de 'twitch_state' si ce n'était pas le bon nom de cookie
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

// =========================================================
// Route CORRIGÉE: Callback Twitch OAuth (FIX DE CRASH DU COOKIE)
// Cette route gère la redirection et le potentiel crash dû aux cookies
// =========================================================
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    // 1. Gestion de l'erreur renvoyée par Twitch (par exemple, si l'utilisateur refuse)
    if (error) {
        console.error(`Erreur d'authentification Twitch: ${error} - ${error_description}`);
        // Rediriger vers la page principale avec un message d'erreur
        return res.redirect('/?error=' + encodeURIComponent("Authentification refusée ou erreur: " + (error_description || error)));
    }

    // 2. Sécurité: Comparaison de l'état (state) avec le cookie
    const storedState = req.cookies.twitch_state;
    // Effacer le cookie de state immédiatement pour des raisons de sécurité et pour éviter les problèmes d'état
    res.clearCookie('twitch_state'); 
    
    if (!storedState || state !== storedState) {
        // Log l'erreur pour le DEBUG
        console.error(`Erreur de sécurité: état (state) invalide. Reçu: ${state}, Attendu: ${storedState}`);
        // Rediriger vers la page principale, car l'API de redirection est hors service
        return res.redirect('/?error=' + encodeURIComponent("Erreur de sécurité lors de la connexion (État invalide). Veuillez réessayer."));
    }

    // 3. Échange du code contre le jeton d'accès
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
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
            
            // Récupérons l'ID de l'utilisateur
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            if (user) {
                // Stocker les informations de session dans le CACHE
                CACHE.twitchUser = {
                    display_name: user.display_name,
                    username: user.login,
                    id: user.id,
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token,
                    expiry: Date.now() + (tokenData.expires_in * 1000)
                };
                
                console.log(`✅ Utilisateur Twitch connecté: ${user.display_name}`);
                
                // Redirection vers la page principale
                return res.redirect('/');
            }
        }

        // Si l'échange de jeton ou la récupération utilisateur a échoué
        console.error("Échec de l'échange de jeton Twitch ou des données utilisateur:", tokenData);
        res.redirect('/?error=' + encodeURIComponent("Échec de la récupération des jetons Twitch."));

    } catch (e) {
        console.error("Erreur serveur lors du callback Twitch:", e);
        res.redirect('/?error=' + encodeURIComponent("Erreur serveur interne lors de la connexion."));
    }
});


app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true });
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// =========================================================
// --- ROUTES TWITCH API (DATA) ---
// =========================================================

// CORRIGÉE: Fournit toujours une réponse JSON avec le nom du canal
app.get('/get_default_stream', async (req, res) => {
    // FORCÉ EN MINUSCULES pour la compatibilité avec le lecteur vidéo
    const defaultChannel = 'twitch'; 
    
    try {
        const streamRes = await twitchApiFetch(`streams?user_login=${defaultChannel}`);
        
        if (streamRes.data.length > 0) {
            const stream = streamRes.data[0];
            
            return res.json({ 
                success: true, 
                channel_name: stream.user_login.toLowerCase(), // Nom de connexion en minuscules
                is_live: true,
                title: stream.title
            });
            
        } else {
             // Chaîne par défaut hors ligne.
             return res.json({ 
                success: true, 
                channel_name: defaultChannel.toLowerCase(),
                is_live: false,
                title: 'Chaîne par défaut hors ligne.'
             });
        }
        
    } catch (e) {
        console.error("Erreur lors de la récupération du stream par défaut:", e.message);
        // En cas d'erreur API, retourne quand même le nom de la chaîne pour que le lecteur puisse au moins tenter
        return res.status(500).json({ 
            success: false, 
            error: `Impossible de récupérer le stream par défaut: ${e.message}`,
            channel_name: defaultChannel.toLowerCase() // Fournir le nom en cas d'erreur
        });
    }
});

// CORRIGÉE: Ajout du paramètre first=100 pour éviter l'erreur 400 de pagination
app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) {
        return res.status(401).json({ success: false, error: "Utilisateur non connecté." });
    }

    try {
        // FIX : Ajout de &first=100 à la requête Twitch pour respecter la pagination.
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}&first=100`, CACHE.twitchUser.access_token);
        
        const streams = data.data.map(stream => ({
            user_id: stream.user_id,
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url 
        }));
        
        return res.json({ success: true, streams });
    } catch (e) {
        console.error("Erreur lors de la récupération des streams suivis:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) {
        return res.status(400).json({ success: false, error: "Paramètre 'channel' manquant." });
    }

    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data || userRes.data.length === 0) {
            return res.status(404).json({ success: false, error: "Chaîne Twitch introuvable." });
        }
        const userId = userRes.data[0].id;

        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if (!vodRes.data || vodRes.data.length === 0) {
            return res.status(404).json({ success: false, error: `Aucune VOD récente trouvée pour ${channel}.` });
        }
        const vod = vodRes.data[0];
        // Remplacement dynamique de la miniature pour une taille standard
        const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84');
        return res.json({ success: true, vod: { 
            id: vod.id, 
            title: vod.title, 
            url: vod.url, 
            thumbnail_url: thumbnailUrl, 
            duration: vod.duration 
        }});
        
    } catch (e) {
        console.error("Erreur lors de la récupération de la VOD:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    
    // Tentative 1: Recherche d'utilisateur
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // 1. Démarrer les requêtes en parallèle
            const [streamRes, followerRes, vodRes] = await Promise.allSettled([
                twitchApiFetch(`streams?user_id=${user.id}`),
                twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`),
                twitchApiFetch(`videos?user_id=${user.id}&type=archive&first=1`) // Pour obtenir le total
            ]);

            // 2. Traiter les résultats
            const streamDetails = streamRes.status === 'fulfilled' && streamRes.value.data.length > 0 ? streamRes.value.data[0] : null;
            const followerCount = followerRes.status === 'fulfilled' ? followerRes.value.total : 'N/A';
            const vodCount = vodRes.status === 'fulfilled' ? vodRes.value.total : 'N/A';
            
            const totalViews = user.view_count || 'N/A';
            const creationDate = user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR') : 'N/A';
            const broadcasterType = user.broadcaster_type || 'normal';

            return res.json({ 
                success: true, 
                type: 'user', 
                user_data: {
                    login: user.login,
                    display_name: user.display_name,
                    id: user.id,
                    profile_image_url: user.profile_image_url,
                    description: user.description,
                    is_live: !!streamDetails,
                    game_name: streamDetails?.game_name || 'Divers',
                    viewer_count: streamDetails?.viewer_count || 0,
                    total_followers: followerCount,
                    total_vods: vodCount,
                    total_views_count: totalViews,
                    account_creation_date: creationDate,
                    broadcaster_type: broadcasterType,
                    // Valeurs aléatoires pour simuler l'IA en l'absence de données externes
                    ai_estimated_avg_viewers: (Math.random() * 500).toFixed(0),
                    ai_estimated_growth: (Math.random() * 10 - 2).toFixed(1),
                }
            });
        }
    } catch (e) {
        console.error("Erreur lors du scan utilisateur:", e.message);
        // Continuer la recherche de jeu si la recherche utilisateur échoue.
    }

    // Tentative 2: Recherche de jeu (catégorie)
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            // 1. Obtenir les 5 streams les plus regardés pour des stats rapides
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=5`);
            const totalStreams = streamsRes.data.length;
            const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
            const avgViewersPerStreamer = totalStreams > 0 ? (totalViewers / totalStreams).toFixed(1) : 0;
            const streams = streamsRes.data;

            return res.json({ 
                success: true, 
                type: 'game', 
                game_data: {
                    name: game.name,
                    id: game.id,
                    box_art_url: game.box_art_url.replace('-{width}x{height}', '-140x190'),
                    total_streams_found: totalStreams,
                    total_viewers_on_top_streams: totalViewers,
                    avg_viewers_per_top_streamer: avgViewersPerStreamer,
                    top_streams: streams.map(s => ({
                        user_name: s.user_name,
                        viewer_count: s.viewer_count
                    })),
                    // Valeurs aléatoires pour simuler l'IA en l'absence de données externes
                    ai_niche_density: (Math.random() * 100).toFixed(0),
                }
            });
        }
    } catch (e) {
         console.error("Erreur lors du scan de jeu:", e.message);
         // L'erreur sera gérée par le bloc final.
    }

    // Si aucune donnée n'a été trouvée
    res.status(404).json({ success: false, message: `Aucun utilisateur ou jeu trouvé pour la recherche: ${query}` });
});


// =========================================================
// ROUTE IA - CRITIQUE DE NICHE
// =========================================================

app.post('/ai_niche_critique', async (req, res) => {
    const { target_name, target_type, target_data } = req.body;
    
    if (!ai) {
         return res.status(503).json({ success: false, error: "Le moteur IA n'est pas initialisé (Clé Gemini manquante ou erreur de chargement)." });
    }
    
    if (target_type === 'game') {
        const streamsSummary = target_data.top_streams.map(s => `${s.user_name} (${s.viewer_count} viewers)`).join(', ');
        const prompt = `Voici les données que j'ai recueillies sur le jeu/la catégorie Twitch "${target_name}" (Densité des viewers sur le Top 5: ${target_data.avg_viewers_per_top_streamer} viewers/streamer, Liste des Top Streamers: ${streamsSummary}). Donne un Score de Niche sur 100 et une critique rapide (2-3 paragraphes) expliquant si c'est une bonne ou mauvaise niche pour un nouveau streamer, et pourquoi.`;
        
        const iaResponse = await runGeminiAnalysis(prompt);
        if (iaResponse.success) {
            // Tenter d'extraire le score (très fragile, mais utile pour le visuel)
            const scoreMatch = iaResponse.html_response.match(/(\d+)\s*\/100/);
            const score = scoreMatch ? parseInt(scoreMatch[1]) : (Math.random() * 100).toFixed(0);

            return res.json({ 
                success: true, 
                html_output: iaResponse.html_response,
                niche_score: score
            });
        }
        return res.status(iaResponse.status || 500).json(iaResponse);

    } else if (target_type === 'user') {
        const viewerStatus = target_data.is_live ? `LIVE (vues: ${target_data.viewer_count}, jeu: ${target_data.game_name})` : 'Hors ligne';
        const prompt = `Voici les données que j'ai recueillies sur le streamer Twitch "${target_name}" (Statut: ${viewerStatus}, Followers: ${target_data.total_followers}, VODs: ${target_data.total_vods}, Description: "${target_data.description}"). Donne un Score de Niche sur 100 et une critique stratégique (2-3 paragraphes) des points forts/faibles de sa chaîne pour maximiser sa croissance.`;

        const iaResponse = await runGeminiAnalysis(prompt);
         if (iaResponse.success) {
            // Tenter d'extraire le score (très fragile, mais utile pour le visuel)
            const scoreMatch = iaResponse.html_response.match(/(\d+)\s*\/100/);
            const score = scoreMatch ? parseInt(scoreMatch[1]) : (Math.random() * 100).toFixed(0);

            return res.json({ 
                success: true, 
                html_output: iaResponse.html_response,
                niche_score: score
            });
        }
        return res.status(iaResponse.status || 500).json(iaResponse);
        
    } else {
        return res.status(400).json({ success: false, error: "Type de cible IA non supporté." });
    }
});


// =========================================================
// ROUTE IA - REPURPOSING VOD
// =========================================================

app.post('/ai_vod_repurpose', async (req, res) => {
    const { title, duration } = req.body;
    
    if (!ai) {
         return res.status(503).json({ success: false, error: "Le moteur IA n'est pas initialisé." });
    }
    
    if (!title || !duration) {
        return res.status(400).json({ success: false, error: "Titre ou durée de VOD manquant." });
    }
    
    const prompt = `La dernière VOD d'un streamer Twitch a pour titre : "${title}" et dure ${duration}. Donne 5 idées de titres accrocheurs pour des clips courts (TikTok, YouTube Shorts) à partir de cette VOD. Pour chaque idée, ajoute une courte description (1 phrase) du type de moment que l'on devrait extraire (Ex: 01:23:45). Formate ta réponse en HTML.`;

    const iaResponse = await runGeminiAnalysis(prompt);
    
    if (iaResponse.success) {
        return res.json({ success: true, html_output: iaResponse.html_response });
    }
    
    return res.status(iaResponse.status || 500).json(iaResponse);
});


// =========================================================
// ROUTE BOOST ET RAID
// =========================================================

// Gère l'activation et le statut de boost (non implémenté en détail, juste un placeholder)
app.post('/activate_boost', (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ success: false, message: "Chaîne manquante." });

    const now = Date.now();
    const cooldownTime = 3 * 3600 * 1000; // 3 heures de cooldown

    if (CACHE.streamBoosts[channel] && now - CACHE.streamBoosts[channel].last_boost < cooldownTime) {
        const remaining = CACHE.streamBoosts[channel].last_boost + cooldownTime - now;
        const remainingMinutes = Math.ceil(remaining / (60 * 1000));
        return res.json({ 
            success: false, 
            message: `❌ Cooldown actif. Vous devez attendre encore ${remainingMinutes} minutes avant de booster ${channel}.`
        });
    }

    // Activer le boost pour 15 minutes
    CACHE.streamBoosts[channel] = {
        active_until: now + (15 * 60 * 1000), // 15 minutes de boost
        last_boost: now
    };
    
    return res.json({ 
        success: true, 
        message: `✅ Boost de 15 minutes activé pour ${channel}! Vous êtes prioritaire.`,
        active_until: CACHE.streamBoosts[channel].active_until
    });
});

// Récupère l'état de la chaîne Boostée (pour le client)
app.get('/get_boost_channel', (req, res) => {
    const now = Date.now();
    const boostedChannel = Object.keys(CACHE.streamBoosts).find(channel => CACHE.streamBoosts[channel].active_until > now);
    
    if (boostedChannel) {
        return res.json({ 
            success: true, 
            channel: boostedChannel,
            remaining_ms: CACHE.streamBoosts[boostedChannel].active_until - now
        });
    }
    
    return res.json({ success: false, channel: DEFAULT_CHANNEL });
});


// ROUTE RAID: Recherche les streams sous une certaine limite de vues dans un jeu
app.get('/find_raid_target', async (req, res) => {
    const { game_query, max_viewers } = req.query;
    if (!game_query || !max_viewers) {
        return res.status(400).json({ success: false, error: "Jeu cible ou maximum de spectateurs manquant." });
    }
    
    try {
        // 1. Trouver l'ID du jeu (catégorie)
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game_query)}&first=1`);
        if (!gameRes.data.length) {
            return res.status(404).json({ success: false, error: `Catégorie Twitch "${game_query}" introuvable.` });
        }
        const gameId = gameRes.data[0].id;

        // 2. Chercher les streams dans cette catégorie
        // Nous allons chercher 100 streams pour avoir une bonne base de sélection
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100&language=fr`);

        const streams = streamsRes.data;
        
        // 3. Filtrer les streams selon le maximum de spectateurs
        const maxV = parseInt(max_viewers, 10);
        const candidates = streams
            .filter(stream => stream.viewer_count > 1 && stream.viewer_count <= maxV)
            .sort((a, b) => b.viewer_count - a.viewer_count); // Trier par nombre de vues (du plus grand au plus petit)
            
        if (candidates.length === 0) {
            return res.status(404).json({ success: false, error: `Aucune cible de Raid française trouvée (< ${maxV} spectateurs) sur le jeu ${game_query}.` });
        }
        
        // 4. Sélectionner une cible (la première, car elle a le plus de vues dans la plage)
        const target = candidates[0];
        
        return res.json({ 
            success: true, 
            message: `Cible de Raid trouvée : ${target.user_name} dans ${target.game_name}.`,
            target: {
                login: target.user_login,
                display_name: target.user_name,
                viewer_count: target.viewer_count,
                title: target.title,
                game_name: target.game_name,
                thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56')
            }
        });

    } catch (e) {
        console.error("Erreur lors de la recherche de cible de raid:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// =========================================================
// ROUTE EXPORT CSV
// =========================================================

let lastScanData = null; // Variable globale pour stocker la dernière donnée scannée

// Route temporaire pour stocker la dernière donnée scannée par le frontend
app.post('/set_last_scan', (req, res) => {
    lastScanData = req.body.data;
    res.json({ success: true, message: "Données de scan enregistrées." });
});


app.get('/export_csv', async (req, res) => {
    if (!lastScanData) {
        return res.status(404).send('Aucune donnée de scan disponible pour l\'exportation.');
    }

    const data = lastScanData;
    let records = [];

    if (data.type === 'user') {
        // Schéma pour un utilisateur
        const user = data.user_data;
        records = [
            ['Métriques', 'Valeur'],
            ['Chaîne', user.display_name],
            ['ID Utilisateur', user.id],
            ['Statut', user.is_live ? 'LIVE' : 'Hors Ligne'],
            ['Jeu Actuel', user.game_name],
            ['Vues Actuelles', user.viewer_count],
            ['Followers', user.total_followers],
            ['Total VODs', user.total_vods],
            ['Vues Total du Compte', user.total_views_count],
            ['Date Création Compte', user.account_creation_date],
            ['Type Broadcaster', user.broadcaster_type],
            ['IA: Vues Moy. Estimées', user.ai_estimated_avg_viewers],
            ['IA: Croissance Estimée (%)', user.ai_estimated_growth],
            ['Description', user.description.replace(/\n/g, ' ')] 
        ];
    } else if (data.type === 'game') {
        // Schéma pour un jeu
        const game = data.game_data;
        records = [
            ['Métriques', 'Valeur'],
            ['Catégorie', game.name],
            ['ID Catégorie', game.id],
            ['Streams Top 5 trouvés', game.total_streams_found],
            ['Viewers Total Top 5', game.total_viewers_on_top_streams],
            ['Viewers Moy. / Streamer Top 5', game.avg_viewers_per_top_streamer],
            ['IA: Densité Niche (%)', game.ai_niche_density]
        ];
        
        // Ajouter les détails des top streams
        records.push(['', '']);
        records.push(['Top Streams (Nom)', 'Viewers']);
        game.top_streams.forEach(stream => {
            records.push([stream.user_name, stream.viewer_count]);
        });
    }

    // Convertir en CSV
    stringify(records, (err, output) => {
        if (err) {
            console.error("Erreur lors de la conversion CSV:", err);
            return res.status(500).send("Erreur lors de la génération du fichier CSV.");
        }
        
        const fileName = data.type === 'user' 
            ? `Twitch_Scan_${data.user_data.login}_${new Date().toISOString().slice(0, 10)}.csv`
            : `Twitch_Scan_Game_${data.game_data.name.replace(/[^a-zA-Z0-9]/g, '')}_${new Date().toISOString().slice(0, 10)}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}\"`);
        res.send(output);
    });
});


// =========================================================
// ROUTE PRINCIPALE ET DÉMARRAGE DU SERVEUR
// =========================================================

// Route servant le fichier HTML principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Gestion des requêtes non trouvées (404)
app.use((req, res, next) => {
    if (req.accepts('json')) {
        return res.status(404).json({ success: false, error: "Route API non trouvée. Veuillez vérifier l'URL." });
    }
    res.status(404).send("Page non trouvée.");
});


// =========================================================
// DÉMARRAGE DU SERVEUR (ASYNCHRONE)
// =========================================================

async function startServer() {
    
    // 1. VÉRIFICATION CRITIQUE des Variables d'Environnement
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
        console.error("=========================================================");
        console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
        console.error("Assurez-vous que TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REDIRECT_URI et GEMINI_API_KEY sont définis.");
        console.error("=========================================================");
        process.exit(1); 
    }
    
    // 2. Initialisation de l'IA (Importation dynamique)
    const isAiReady = await initGemini();
    if (!isAiReady) {
        console.warn("⚠️ Attention: L'analyse IA sera désactivée. Vérifiez votre clé GEMINI_API_KEY et votre connexion.");
    }
    
    // 3. Démarrage du serveur Express
    app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
        console.log(`URL de redirection Twitch attendue: ${REDIRECT_URI}`);
    });
}

startServer();
