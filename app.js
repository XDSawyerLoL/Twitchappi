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
// --- MIDDLEWARES & CACHE ---
// =========================================================

app.use(cors({ origin: '*', credentials: true })); 
app.use(bodyParser.json());
app.use(cookieParser());

const CACHE = {
    appAccessToken: null,
    appTokenExpiry: 0,
    streamBoosts: {} 
};

// =========================================================
// --- FONCTIONS TWITCH API UTILITAIRES ---
// =========================================================

async function getAppAccessToken() {
    const now = Date.now();
    if (CACHE.appAccessToken && CACHE.appTokenExpiry > now) {
        return CACHE.appAccessToken;
    }
    console.log("DEBUG: Rafraîchissement du jeton d'accès d'application...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Échec de l'obtention du jeton d'accès d'application Twitch. Statut: ${response.status}. Corps: ${errorText}`);
        }
        const data = await response.json();
        if (data.access_token) {
            CACHE.appAccessToken = data.access_token;
            CACHE.appTokenExpiry = now + (data.expires_in - 300) * 1000; 
            console.log("DEBUG: Jeton d'accès d'application Twitch obtenu.");
            return CACHE.appAccessToken;
        } else {
            throw new Error("Réponse de jeton d'accès invalide.");
        }
    } catch (error) {
        console.error("❌ Erreur critique getAppAccessToken:", error.message);
        throw new Error("Impossible d'obtenir le jeton d'accès App Twitch.");
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
        if (!response.ok) {
            console.error(`❌ Erreur HTTP dans fetchGameDetails: ${response.status} - ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        return data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des détails du jeu:", error.message);
        return null;
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
        if (!response.ok) {
            console.error(`❌ Erreur HTTP (User) dans fetchUserDetailsForScan: ${response.status} - ${response.statusText}`);
            return null; 
        }
        const data = await response.json();

        if (data.data.length > 0) {
            const user = data.data[0];
            const streamUrl = `https://api.twitch.tv/helix/streams?user_id=${user.id}`;
            const streamResponse = await fetch(streamUrl, { headers: HEADERS });
            
            if (!streamResponse.ok) {
                 console.warn(`⚠️ Erreur HTTP (Stream) lors de la vérification de l'état en direct: ${streamResponse.status}. On assume 'non live'.`);
                 return {
                    id: user.id,
                    display_name: user.display_name,
                    login: user.login,
                    profile_image_url: user.profile_image_url,
                    description: user.description,
                    is_live: false,
                    stream_details: null
                };
            }

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

async function fetchStreamsByGameId(gameId, token, limit = 100) {
    const url = `https://api.twitch.tv/helix/streams?game_id=${gameId}&first=${limit}`;
    const HEADERS = {
        'Client-Id': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) {
            console.error(`❌ Erreur HTTP dans fetchStreamsByGameId: ${response.status} - ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des streams:", error.message);
        return null;
    }
}

async function fetchLatestVod(channelId, token) {
    const url = `https://api.twitch.tv/helix/videos?user_id=${channelId}&type=archive&first=1`;
    const HEADERS = {
        'Client-Id': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) {
            console.error(`❌ Erreur HTTP dans fetchLatestVod: ${response.status} - ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        return data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        console.error("❌ Erreur lors de la récupération de la VOD:", error.message);
        return null;
    }
}

async function fetchTopGames(token) {
    const url = `https://api.twitch.tv/helix/games/top?first=20`;
    const HEADERS = {
        'Client-Id': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) {
            console.error(`❌ Erreur HTTP dans fetchTopGames: ${response.status} - ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des top jeux:", error.message);
        return null;
    }
}


// --- Fonctions d'authentification utilisateur (omises ici pour la concision) ---
const USER_TOKENS = {};

async function refreshUserToken(userId) { /* ... */ return null; }
async function getConnectedUserTokenData(req) { /* ... */ return null; }
app.get('/twitch_auth_start', (req, res) => { /* ... */ });
app.get('/twitch_auth_callback', async (req, res) => { /* ... */ });
app.get('/twitch_user_status', async (req, res) => { /* ... */ });
app.post('/twitch_logout', (req, res) => { /* ... */ });
app.get('/followed_streams', async (req, res) => { /* ... */ });


// =========================================================
// --- ROUTES D'ANALYSE ET IA ---
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: "Requête manquante." });
    }
    try {
        const token = await getAppAccessToken();
        const gameData = await fetchGameDetails(query, token);
        if (gameData) {
            const streams = await fetchStreamsByGameId(gameData.id, token, 10);
            let totalViewers = 0;
            let totalStreamers = 0;
            if (streams && streams.length > 0) {
                totalStreamers = streams.length;
                totalViewers = streams.reduce((sum, stream) => sum + stream.viewer_count, 0);
            }
            const avgViewersPerStreamer = totalStreamers > 0 ? Math.round(totalViewers / totalStreamers) : 0;
            return res.json({ 
                success: true, 
                type: 'game', 
                game_data: {
                    id: gameData.id,
                    name: gameData.name,
                    box_art_url: gameData.box_art_url.replace('-{width}x{height}', '-180x240'),
                    total_streamers: totalStreamers,
                    total_viewers: totalViewers,
                    avg_viewers_per_streamer: avgViewersPerStreamer,
                    streams: streams || []
                }
            });
        }
        const userData = await fetchUserDetailsForScan(query, token);
        if (userData) {
            return res.json({ 
                success: true, 
                type: 'user', 
                user_data: userData 
            });
        }
        return res.json({ 
            success: false, 
            type: 'none', 
            message: `Aucun jeu ou streamer trouvé pour la requête: ${query}.` 
        });

    } catch (e) {
        console.error("❌ Erreur critique dans /scan_target:", e.message);
        return res.status(500).json({ error: `Erreur interne du serveur: ${e.message}` });
    }
});


app.post('/critique_ia', async (req, res) => {
    if (!ai) {
        return res.status(503).json({ success: false, error: "Le service IA n'est pas disponible (clé API manquante)." });
    }
    const { query, type } = req.body;
    let prompt = "";
    let systemInstruction = "";
    // ... (logic for different types: niche, repurpose, trend) ...
    switch(type) {
        case 'niche':
            if (!query) return res.status(400).json({ success: false, error: "Le jeu est manquant pour l'analyse de niche." });
            systemInstruction = `Tu es un consultant IA expert en croissance Twitch. Ton but est d'analyser un jeu comme une "niche" et de donner une critique ultra-actionnable au streamer. Réponds en format HTML.`;
            prompt = `Analyse le jeu **${query}** et fournis une critique de niche. Inclus :
            1. Un titre fort (h4)
            2. Un paragraphe sur l'attrait général.
            3. Une liste non ordonnée (ul/li) de 3-5 points d'action (stratégies de contenu précises pour se démarquer sur ce jeu).
            4. Utilise un langage motivant et professionnel.`;
            break;
        case 'repurpose':
             if (!query) return res.status(400).json({ success: false, error: "Le streamer est manquant pour l'analyse de repurposing." });
            systemInstruction = `Tu es un expert en repurposing vidéo. Ton but est d'analyser une VOD (simulée ici pour **${query}**) et de donner des idées de clips courts pour TikTok/YouTube Shorts. Réponds en format HTML.`;
            prompt = `Analyse la dernière VOD du streamer **${query}** (imaginaire, basée sur des concepts de VOD typiques: fail drôle, clutch épique, moment émotionnel, explication technique). Donne 3 suggestions de clips courts ultra-viraux. 
            Pour chaque clip (dans une liste ul/li) :
            1. Décris l'action.
            2. Donne un titre viral précis.
            3. **POINT CRITIQUE: Simule un timestamp de début de clip (format 00:00:00)** comme ceci: **Point de Clip:** 00:25:40. Ces timestamps sont cruciaux.
            Utilise le HTML pour le formatage.`;
            break;
        case 'trend':
            systemInstruction = `Tu es un 'Trend Detector' IA. Ton but est d'analyser les tendances de jeu V/S (Spectateurs par Streamer) pour identifier des 'pépites cachées' où la demande est forte (Viewers) et l'offre faible (Streamers). Réponds en format HTML.`;
            prompt = `Fournis une analyse des tendances de niche Twitch. Identifie 3 à 5 jeux/catégories qui ont actuellement un excellent potentiel V/S (Spectateurs/Streamer) et qui ne sont pas dans le Top 5 global. Pour chaque point (en liste ul/li) :
            1. Donne le nom du jeu.
            2. Explique brièvement pourquoi il est une opportunité (faible concurrence, communauté engagée).
            Utilise le HTML pour le formatage.`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA invalide." });
    }
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: systemInstruction },
        });
        const html_critique = `
            <div class="ai-content">
                ${response.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}
            </div>
        `;
        return res.json({ success: true, html_critique: html_critique });
    } catch (e) {
        console.error(`❌ Erreur IA (${type}):`, e.message);
        return res.status(500).json({ success: false, error: `Échec de l'appel à l'API Gemini. Vérifiez votre clé API et les logs serveur.` });
    }
});


// Route pour l'assistant IA de poche (CORRIGÉE)
app.post('/mini_assistant', async (req, res) => {
    if (!ai) {
        console.error("❌ Erreur Mini Assistant: GEMINI_API_KEY manquante. Retour 503."); 
        return res.status(503).json({ 
            success: false, 
            error: "Le service IA n'est pas disponible (clé API manquante)." 
        });
    }
    
    const { q, context } = req.body;
    const systemInstruction = `Tu es un assistant IA amical pour les streamers. Tu réponds aux questions sur les titres de streams, les clips, les stratégies de croissance et les concepts Twitch. Le contexte actuel du streamer ou du jeu est: ${context}. Ta réponse doit être courte, utile et en HTML pour le formatage (p, ul/li, strong).`;

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: q }] }],
            config: { systemInstruction: systemInstruction },
        });
        
        const html_answer = response.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

        return res.json({ success: true, answer: html_answer });
        
    } catch (e) {
        // Amélioration de la gestion des erreurs internes de l'IA pour renvoyer un JSON
        console.error("❌ Erreur Mini Assistant (API call failed):", e.message);
        return res.status(500).json({ 
            success: false, 
            error: `Erreur interne du serveur lors de l'appel à l'IA. (Détail: ${e.message.substring(0, 50)}...)` 
        });
    }
});


// ... (Reste des routes omises pour la concision) ...

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    getAppAccessToken().catch(e => console.error("Échec du jeton initial:", e.message));
});
