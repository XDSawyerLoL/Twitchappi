// =========================================================
// FICHIER app.js (Backend Node.js/Express)
// Version Complète et Corrigée
// =========================================================

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
// NOTE: Ces variables DOIVENT être définies dans votre environnement (ex: fichier .env)
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
        console.error("FATAL ERROR: Impossible de charger GoogleGenAI. Veuillez installer la dépendance: npm install @google/genai", e.message);
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
    streamBoosts: {}, // Gestion des cooldowns de Boost (timestamps)
    
    // --- ÉTAT GLOBAL POUR L'AUTO-DISCOVERY (Cycle 0-100 vues) ---
    autoDiscoveryStreamCache: [], 
    currentStreamIndex: -1, 
    // ------------------------------------------------------------
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
    // Vérification de l'initialisation de l'IA
    if (!ai) {
        const errorMessage = "❌ Erreur: Le service Gemini n'a pas pu être initialisé. Vérifiez votre clé API.";
        return { success: false, status: 503, error: errorMessage, html_response: `<p style="color:red; font-weight:bold;">${errorMessage}</p>` };
    }
    
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
// LOGIQUE DE CYCLE ET DECOUVERTE NICHE (Ajoutée/Corrigée)
// =========================================================

/**
 * Logique simulée de découverte Niche (0-100 vues).
 * REMPLACEZ par votre VRAI appel API de recherche de streams filtrés
 * @param {string} direction - 'initial', 'next', ou 'prev'.
 */
async function findNextAutoDiscoveryStream(direction) {
    // Simuler la recherche si le cache est vide ou si c'est le premier appel
    if (CACHE.autoDiscoveryStreamCache.length === 0 || direction === 'initial') {
        console.log("Simulating initial search for niche streams (0-100 viewers)...");
        
        // --- PLACEHOLDER API TWITCH (REMPLACEZ PAR VOTRE VRAIE LOGIQUE DE SCAN) ---
        // VRAIE LOGIQUE: API Twitch -> getStreams(viewer_count_min=0, viewer_count_max=100)
        CACHE.autoDiscoveryStreamCache = [
            { login: 'niche_gamer_fr', name: 'Niche Gamer #1', viewer_count: 35 },
            { login: 'retro_builder', name: 'Retro Builder', viewer_count: 12 },
            { login: 'petit_stream', name: 'Petit Stream', viewer_count: 88 },
            { login: 'autre_niche', name: 'Autre Niche', viewer_count: 5 },
        ];
        // ------------------------------------------------------------------
        
        if (CACHE.autoDiscoveryStreamCache.length > 0) {
            // Le cache est rempli, on commence au premier
            CACHE.currentStreamIndex = 0;
        } else {
            // Aucun résultat trouvé
            CACHE.currentStreamIndex = -1;
            return null;
        }
    }
    
    const cache = CACHE.autoDiscoveryStreamCache;
    let index = CACHE.currentStreamIndex;

    if (cache.length === 0) return null;

    if (direction === 'next') {
        index = (index + 1) % cache.length;
    } else if (direction === 'prev') {
        index = (index - 1 + cache.length) % cache.length;
    } 
    
    CACHE.currentStreamIndex = index;
    return cache[index];
}

// =========================================================
// --- ROUTES D'AUTHENTIFICATION TWITCH (OAuth) ---
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    const storedState = req.cookies.twitch_state;
    
    if (state !== storedState) {
        return res.status(400).send("Erreur de sécurité: État invalide.");
    }

    if (error) {
        return res.status(400).send(`Erreur Twitch: ${error} - ${error_description}`);
    }

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
            
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            res.redirect('/'); 
        } else {
            const twitchError = tokenData.message || tokenData.error || "Détail non fourni.";
            res.status(500).send(`Erreur lors de l'échange du code Twitch. Détail: ${twitchError}`);
        }
    } catch (e) {
        res.status(500).send(`Erreur interne du serveur lors de l'authentification: ${e.message}`);
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
// --- ROUTES TWITCH API (DATA) / CYCLE / BOOST ---
// =========================================================

// Route critique 1: Lancement du Lecteur par Défaut (Corrigée)
app.get('/get_default_stream', async (req, res) => {
    
    // 1. VÉRIFIER LE BOOST (PRÉEMPTION)
    // Un boost est actif pendant 10 minutes (600,000 ms)
    const boostedChannel = Object.keys(CACHE.streamBoosts).find(
        channel => CACHE.streamBoosts[channel] > (Date.now() - 10 * 60 * 1000) 
    );
    
    if (boostedChannel) {
        return res.json({
            success: true,
            channel_name: boostedChannel.toLowerCase(), 
            title: `⚡ BOOST: ${boostedChannel} est en rotation prioritaire!`,
            is_boosted: true
        });
    }

    // 2. LOGIQUE CRITIQUE: AUTO-DISCOVERY PAR DÉFAUT
    try {
        const autoDiscoveryStream = await findNextAutoDiscoveryStream('initial');

        if (autoDiscoveryStream && autoDiscoveryStream.login) {
            const title = `🔴 AUTO-DISCOVERY: ${autoDiscoveryStream.name} (${autoDiscoveryStream.viewer_count} vues) - Prêt pour l'Auto-Cycle.`;
            
            return res.json({ 
                success: true, 
                channel_name: autoDiscoveryStream.login.toLowerCase(),
                is_live: true,
                title: title,
                viewers: autoDiscoveryStream.viewer_count 
            });
        }
        
    } catch (e) {
        console.error("Échec Auto-Discovery :", e);
        // Le fallback vers 'twitch' se fait ci-dessous
    }

    // 3. FALLBACK ULTIME
    const defaultChannel = 'twitch'; 
    return res.json({ 
        success: true, 
        channel_name: defaultChannel.toLowerCase(),
        is_live: false, 
        title: 'Chaîne par défaut affichée. Auto-Discovery hors ligne.',
    });
});


// Route critique 2: Cycle Manuel/Automatique (Ajoutée)
app.post('/cycle_stream', async (req, res) => {
    
    // Vérification du Boost
    const boostedChannel = Object.keys(CACHE.streamBoosts).find(
        channel => CACHE.streamBoosts[channel] > (Date.now() - 10 * 60 * 1000)
    );
    
    if (boostedChannel) {
        return res.status(400).json({ 
            success: false, 
            error: `Le cycle est désactivé. Un Stream BOOST (${boostedChannel}) est prioritaire.` 
        });
    }
    
    const direction = req.body.direction; // 'next' ou 'prev'

    try {
        const nextStream = await findNextAutoDiscoveryStream(direction);
        
        if (nextStream) {
            const title = `🔴 AUTO-DISCOVERY: ${nextStream.name} (${nextStream.viewer_count} vues) - Cycle Manuel`;
            return res.json({
                success: true,
                channel_name: nextStream.login.toLowerCase(),
                title: title,
                viewers: nextStream.viewer_count
            });
        } else {
            return res.status(404).json({
                success: false,
                error: "Aucune autre chaîne niche trouvée. Cache vide.",
                channel_name: 'twitch'
            });
        }
    } catch (e) {
        console.error("Erreur lors du cycle de stream:", e);
        return res.status(500).json({
            success: false,
            error: "Erreur interne du serveur lors de la recherche de la prochaine chaîne."
        });
    }
});


// Route 3: Boost du Stream (Cooldwon)
app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    // Cooldown de 3 heures (3 * 60 * 60 * 1000)
    const BOOST_COOLDOWN_MS = 3 * 60 * 60 * 1000; 
    const now = Date.now();
    const lastBoost = CACHE.streamBoosts[channel];
    
    if (lastBoost && now - lastBoost < BOOST_COOLDOWN_MS) {
        const remainingTime = BOOST_COOLDOWN_MS - (now - lastBoost);
        const minutesRemaining = Math.ceil(remainingTime / 60000); 

        const errorMessage = `
             <p style="color:red; font-weight:bold;">
                 ❌ Boost en Cooldown
             </p>
             <p>
                 Vous devez attendre encore <strong style="color:var(--color-primary-pink);">${minutesRemaining} minutes</strong>.
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


app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) {
        return res.status(401).json({ success: false, error: "Utilisateur non connecté." });
    }

    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        
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


// Route 4: Dernière VOD (Corrigée: Thumbnail)
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
        // Correction de la miniature : utiliser {width} et {height}
        const thumbnailUrl = vod.thumbnail_url.replace('{width}', '400').replace('{height}', '225'); 

        return res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: thumbnailUrl,
                duration: vod.duration 
            }
        });
    } catch (e) {
        console.error("Erreur lors de la récupération de la VOD:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// Route 5: Scan 360° (Corrigée: Ajout des Metrics IA)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    
    try {
        
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) {
                    streamDetails = streamRes.data[0];
                }
            } catch (e) { /* Ignorer l'erreur */ }

            let followerCount = 'N/A';
            try {
                const followerRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`); 
                followerCount = followerRes.total;
            } catch (e) { /* Ignorer l'erreur */ }
            
            let vodCount = 'N/A';
            try {
                const vodRes = await twitchApiFetch(`videos?user_id=${user.id}&type=archive&first=1`);
                vodCount = vodRes.total;
            } catch (e) { /* Ignorer l'erreur */ }

            const totalViews = user.view_count || 'N/A';
            const creationDate = user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR') : 'N/A';
            const broadcasterType = user.broadcaster_type || 'normal'; 
            
            // --- AJOUT DES METRICS IA SIMULÉES (CRITIQUES POUR LE FRONTEND) ---
            const aiNicheScore = Math.floor(Math.random() * 80) + 10;
            const aiGrowth = (Math.random() * 10 - 2).toFixed(1);
            // -------------------------------------------------------------------


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
                    
                    ai_estimated_avg_viewers: (Math.random() * 500).toFixed(0),
                    ai_estimated_growth: aiGrowth, 
                    ai_calculated_niche_score: aiNicheScore // Score de niche (10-90)
                }
            });
        }

        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const totalStreams = streamsRes.data.length;
            const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
            const avgViewersPerStreamer = totalStreams > 0 ? (totalViewers / totalStreams).toFixed(1) : 0;
            const streams = streamsRes.data;
            
            // --- AJOUT DU SCORE IA JEU SIMULÉ ---
            const gameNicheScore = totalStreams < 20 ? (Math.floor(Math.random() * 30) + 70) : (Math.floor(Math.random() * 30) + 10);
            // -------------------------------------


            return res.json({ 
                success: true, 
                type: 'game', 
                game_data: {
                    name: game.name,
                    id: game.id,
                    box_art_url: game.box_art_url,
                    total_streamers: totalStreams,
                    total_viewers: totalViewers,
                    avg_viewers_per_streamer: avgViewersPerStreamer,
                    ai_calculated_niche_score: gameNicheScore, // Score de niche (10-90)
                    streams: streams.map(s => ({
                        user_name: s.user_name,
                        user_login: s.user_login,
                        title: s.title,
                        viewer_count: s.viewer_count
                    }))
                }
            });
        }

        return res.status(404).json({ success: false, message: `Impossible de trouver un utilisateur ou un jeu correspondant à "${query}".` });

    } catch (e) {
        console.error("Erreur dans /scan_target:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Route 6: Raid Optimisé (Corrigée: Thumbnail)
app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    
    if (!game || !max_viewers) {
        return res.status(400).json({ success: false, error: "Jeu ou nombre de viewers manquant pour le Raid." });
    }
    
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: `Catégorie de jeu "${game}" introuvable sur Twitch.`,
            });
        }
        const gameId = gameRes.data[0].id;
        const gameName = gameRes.data[0].name;
        
        // Récupérer les 100 premiers streams
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100`);
        const liveStreams = streamsRes.data;
        
        let target = null;
        
        for (const stream of liveStreams) {
            if (stream.viewer_count <= max_viewers && stream.viewer_count > 0) {
                 // On cherche le stream avec le MOINS de viewers qui respecte le critère
                 if (!target || stream.viewer_count < target.viewers) {
                    target = {
                        name: stream.user_name,
                        login: stream.user_login,
                        viewers: stream.viewer_count,
                        game: stream.game_name,
                        // Correction de la miniature : utiliser {width} et {height}
                        thumbnail_url: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
                    };
                 }
            }
        }
        
        if (target) {
            return res.json({
                success: true,
                channel: target,
            });
        } else {
            return res.status(404).json({ 
                success: false, 
                error: `Aucune cible de Raid trouvée dans ${gameName} avec moins de ${max_viewers} vues (parmi les 100 premiers résultats).`,
            });
        }
        
    } catch (e) {
        console.error("Erreur lors de la recherche de Raid:", e.message);
        return res.status(500).json({ 
            success: false, 
            error: `Erreur serveur lors de la recherche de Raid: ${e.message}`,
        });
    }
});


// =========================================================
// --- ROUTES IA (CRITIQUE ET ANALYSE) ---
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";

    switch (type) {
        case 'niche':
            prompt = `En tant qu'expert en stratégie de croissance Twitch, analyse le jeu ou streamer "${query}". Fournis une critique de niche en format HTML. Sois extrêmement concis et utilise des listes (<ul> et <li>) plutôt que des paragraphes longs: 1. Un titre de <h4>. 2. Une liste <ul> de 3 points forts CLAIRS (faible compétition, public engagé, nouveauté). 3. Une liste <ul> de 3 suggestions de contenu spécifiques au sujet (ex: "Défi Speedrun avec handicap"). 4. Une conclusion courte et impactante en <p> avec un <strong>.`;
            break;
        case 'repurpose':
            prompt = `Tu es un spécialiste du 'Repurposing' de VOD Twitch. Analyse cette dernière VOD du streamer : "${query}". En format HTML, génère : 1. Un titre ####. 2. Une liste <ul> de 3 moments parfaits pour des clips courts (TikTok, Shorts), en estimant un timestamp (format HH:MM:SS) pour le début du clip. Pour chaque point, utilise l'expression "**Point de Clip: HH:MM:SS**". 3. Une liste <ul> de 3 titres courts et percutants pour ces clips.`;
            break;
        case 'trend':
            prompt = `Tu es un détecteur de niches. Analyse les tendances actuelles et donne un avis sur la prochaine "grosse niche" Twitch. Fournis une critique en format HTML: 1. Un titre <h4>. 2. Une analyse en <p> sur la tendance V/S (viewers-to-streamers). 3. Une liste <ul> de 3 jeux ou genres "sous-évalués" à stream. 4. Un conseil de croissance tactique en <p> avec un <strong>.`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA invalide." });
    }

    const result = await runGeminiAnalysis(prompt);

    if (result.success) {
        return res.json(result);
    } else {
        return res.status(result.status || 500).json(result);
    }
});

// Route 7: Actions Automatisées (Export, Clip, Titre)
app.post('/auto_action', async (req, res) => {
    try {
        const { query, action_type } = req.body;
        let prompt = "";
        
        if (!query || !action_type) {
            return res.status(400).json({ success: false, error: "Les paramètres 'query' ou 'action_type' sont manquants." });
        }

        switch (action_type) {
            case 'export_metrics':
                const metrics_data = [
                    { Métrique: 'Vues Totales (Simulées)', Valeur: Math.floor(Math.random() * 500000) + 100000 },
                    { Métrique: 'Taux de Rétention (Simulé)', Valeur: `${((Math.random() * 0.3) + 0.6).toFixed(3) * 100}%` },
                    { Métrique: 'Nouveaux Suiveurs (Simulés)', Valeur: Math.floor(Math.random() * 5000) + 1000 }
                ];
                
                stringify(metrics_data, { header: true }, (err, csvContent) => {
                    if (err) {
                        console.error("Erreur lors de la création du CSV:", err);
                        return res.status(500).json({ success: false, error: "Erreur interne lors de la création du fichier CSV." });
                    }
                    
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename="Stats_Twitch_${query}_${new Date().toISOString().slice(0, 10)}.csv"`);
                    
                    return res.send(csvContent);
                });
                return;

            case 'create_clip':
                prompt = `Tu es un spécialiste du 'Repurposing' de VOD Twitch. Analyse le sujet ou VOD : "${query}". En format HTML, génère : 1. Un titre <h4> pour le rapport. 2. Une liste <ul> de 3 titres courts et percutants pour un clip (max 60 caractères chacun).`;
                break;

            case 'title_disruption':
                prompt = `Tu es un expert en stratégie de croissance Twitch. Analyse le jeu ou sujet : "${query}". En format HTML, génère : 1. Un titre <h4> pour le rapport. 2. Une liste <ul> de 3 suggestions de titres de stream ULTRA-DISRUPTIFS pour maximiser les clics dans les recommandations. 3. Une conclusion en <p> avec un <strong>.`;
                break;

            default:
                return res.status(400).json({ success: false, error: `Type d'action non supporté : ${action_type}` });
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

    } catch (error) {
        console.error(`Erreur d'exécution dans /auto_action pour ${req.body?.action_type}:`, error.message);
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                error: `Erreur interne du serveur lors de l'action: ${error.message}`,
                html_response: `<p style="color:#e34a64; font-weight:bold; text-align:center;">❌ Erreur d'exécution de l'API: ${error.message}</p>`
            });
        }
    }
});


// =========================================================
// --- ROUTES STATIQUES ET GESTION DES ERREURS (FIN) ---
// =========================================================

// Servir la page d'accueil (doit être le fichier de votre frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Servir la page principale explicitement
app.get('/NicheOptimizer.html', (req, res) => {
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
        process.exit(1); 
    }

    // 3. Démarrage du serveur Express
    app.listen(PORT, () => {
        console.log(`Serveur démarré sur http://localhost:${PORT}`);
        console.log(`URL d'accueil : http://localhost:${PORT}/NicheOptimizer.html`);
    });
}

startServer();
