const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Assurez-vous d'avoir installé cette dépendance : npm install @google/genai node-fetch express body-parser cookie-parser cors
const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
// ⚠️ IMPORTANT : Remplacez les valeurs ci-dessous ou utilisez des variables d'environnement
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "VOTRE_TWITCH_CLIENT_ID"; 
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "VOTRE_TWITCH_CLIENT_SECRET"; 
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || "http://localhost:10000/twitch_auth_callback"; 

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "VOTRE_GEMINI_API_KEY";
const GEMINI_MODEL = "gemini-2.5-flash"; 

let ai = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== "VOTRE_GEMINI_API_KEY") {
    try {
        ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
        console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
    } catch (e) {
        console.error("FATAL DEBUG: Échec de l'initialisation de GoogleGenAI:", e.message);
        ai = null;
    }
} else {
    console.error("FATAL DEBUG: GEMINI_API_KEY non trouvée ou invalide. L'IA sera désactivée.");
}

// =========================================================
// --- MIDDLEWARES & CACHE ---
// =========================================================

app.use(cors({ origin: '*', credentials: true })); 
app.use(bodyParser.json());
app.use(cookieParser());

// Cache temporaire en mémoire pour les jetons et le boost
const CACHE = {
    appAccessToken: null,
    appTokenExpiry: 0,
    streamBoosts: {} // { channelName: timestamp }
};

// Stockage temporaire des jetons utilisateur
const USER_TOKENS = {};

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
        throw new Error("Impossible d'obtenir le jeton d'accès App Twitch. Vérifiez TWITCH_CLIENT_ID/SECRET.");
    }
}

async function fetchGameDetails(query, token) {
    const url = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(query)}`;
    const HEADERS = { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` };
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) { return null; }
        const data = await response.json();
        return data.data.length > 0 ? data.data[0] : null;
    } catch (error) { return null; }
}

async function fetchUserDetailsForScan(query, token) {
    const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(query)}`;
    const HEADERS = { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` };
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) { return null; }
        const data = await response.json();

        if (data.data.length > 0) {
            const user = data.data[0];
            const streamUrl = `https://api.twitch.tv/helix/streams?user_id=${user.id}`;
            const streamResponse = await fetch(streamUrl, { headers: HEADERS });
            
            let isLive = false;
            let streamDetails = null;

            if (streamResponse.ok) {
                const streamData = await streamResponse.json();
                isLive = streamData.data.length > 0;
                streamDetails = isLive ? streamData.data[0] : null;
            } else {
                 console.warn(`⚠️ Erreur HTTP (Stream) lors de la vérification de l'état en direct: ${streamResponse.status}.`);
            }
            
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
    const HEADERS = { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` };
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) { return null; }
        const data = await response.json();
        return data.data;
    } catch (error) { return null; }
}

async function refreshUserToken(userId) {
    const tokenData = USER_TOKENS[userId];
    if (!tokenData || tokenData.accessTokenExpiry > Date.now()) { return tokenData; }

    const url = `https://id.twitch.tv/oauth2/token?grant_type=refresh_token&refresh_token=${tokenData.refreshToken}&client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}`;

    try {
        const response = await fetch(url, { method: 'POST' });
        if (!response.ok) { delete USER_TOKENS[userId]; return null; }
        const data = await response.json();
        if (data.access_token) {
            tokenData.accessToken = data.access_token;
            tokenData.refreshToken = data.refresh_token || tokenData.refreshToken;
            tokenData.accessTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
            USER_TOKENS[userId] = tokenData;
            return tokenData;
        }
    } catch (error) {
        delete USER_TOKENS[userId];
        return null;
    }
}

async function getConnectedUserTokenData(req) {
    const sessionId = req.cookies.twitch_session_id;
    const tokenData = USER_TOKENS[sessionId];
    if (!tokenData) return null;
    return await refreshUserToken(sessionId);
}

// =========================================================
// --- ROUTES TWITCH AUTHENTIFICATION ---
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = 'user:read:follows'; 
    const authUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, sameSite: 'Lax' });
    res.redirect(authUrl);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    const storedState = req.cookies.twitch_state;
    res.clearCookie('twitch_state');

    if (error || state !== storedState) {
        const errMsg = error ? `twitch_denied: ${error}` : 'csrf_fail';
        return res.redirect(`/?auth_error=${errMsg}`);
    }

    const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`;

    try {
        const response = await fetch(tokenUrl, { method: 'POST' });
        if (!response.ok) { throw new Error(`Échec de l'échange de code: ${response.status}`); }
        const tokenData = await response.json();
        
        const userUrl = 'https://api.twitch.tv/helix/users';
        const userRes = await fetch(userUrl, { headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${tokenData.access_token}` } });
        
        if (!userRes.ok) { throw new Error(`Échec de la récupération des infos utilisateur: ${userRes.status}`); }

        const userData = await userRes.json();
        const { id: userId, login: username, display_name } = userData.data[0];
        const sessionId = crypto.randomBytes(16).toString('hex');

        USER_TOKENS[sessionId] = {
            id: userId,
            username: username,
            display_name: display_name,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            accessTokenExpiry: Date.now() + (tokenData.expires_in - 300) * 1000 
        };
        
        res.cookie('twitch_session_id', sessionId, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.redirect('/'); 
    } catch (e) {
        console.error("❌ Erreur de gestion de callback:", e.message);
        res.redirect(`/?auth_error=callback_fail&message=${e.message}`);
    }
});

app.get('/twitch_user_status', async (req, res) => {
    const tokenData = await getConnectedUserTokenData(req);
    if (tokenData) {
        return res.json({ 
            is_connected: true, 
            username: tokenData.username, 
            display_name: tokenData.display_name, 
            userId: tokenData.id,
            accessToken: tokenData.accessToken 
        });
    } else {
        return res.json({ is_connected: false, username: null });
    }
});

app.post('/twitch_logout', (req, res) => {
    const sessionId = req.cookies.twitch_session_id;
    if (sessionId) {
        delete USER_TOKENS[sessionId];
        res.clearCookie('twitch_session_id');
        return res.json({ success: true, message: "Déconnecté" });
    }
    res.json({ success: false, message: "Aucune session trouvée" });
});

// ROUTE TWITCH POUR LE FIL SUIVI
app.get('/followed_streams', async (req, res) => {
    const tokenData = await getConnectedUserTokenData(req);
    
    if (!tokenData) {
        return res.status(401).json({ success: false, error: "Non authentifié ou jeton expiré." });
    }

    const { id: userId, accessToken: token } = tokenData;

    try {
        const url = `https://api.twitch.tv/helix/streams/followed?user_id=${userId}&first=50`;
        const response = await fetch(url, {
            headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Échec de la récupération des streams suivis: ${response.status} - ${errorText}`);
            throw new Error(`API Twitch a renvoyé ${response.status}.`);
        }

        const data = await response.json();
        return res.json({ success: true, streams: data.data });
        
    } catch (e) {
        console.error("❌ Erreur /followed_streams:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// --- ROUTES D'ANALYSE ET IA ---
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) { return res.status(400).json({ success: false, error: "Requête manquante." }); }
    try {
        const token = await getAppAccessToken();
        const gameData = await fetchGameDetails(query, token);
        if (gameData) {
            const streams = await fetchStreamsByGameId(gameData.id, token, 10);
            let totalViewers = 0;
            let totalStreamers = 0;
            if (streams) {
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
                    // Remplacement des placeholders pour l'image du jeu
                    box_art_url: gameData.box_art_url.replace('-{width}x{height}', '-180x240'), 
                    total_streamers: totalStreamers,
                    total_viewers: totalViewers,
                    avg_viewers_per_streamer: avgViewersPerStreamer,
                    streams: streams || []
                }
            });
        }
        const userData = await fetchUserDetailsForScan(query, token);
        if (userData) { return res.json({ success: true, type: 'user', user_data: userData }); }
        return res.json({ success: false, type: 'none', message: `Aucun jeu ou streamer trouvé pour la requête: ${query}.` });
    } catch (e) {
        console.error("❌ Erreur critique dans /scan_target:", e.message);
        return res.status(500).json({ success: false, error: `Erreur interne du serveur: ${e.message}` });
    }
});


app.post('/critique_ia', async (req, res) => {
    if (!ai) {
        return res.status(503).json({ success: false, error: "Le service IA n'est pas disponible (clé API manquante)." });
    }
    const { query, type } = req.body;
    let prompt = "";
    let systemInstruction = "";
    
    switch(type) {
        case 'niche':
            if (!query) return res.status(400).json({ success: false, error: "Le jeu est manquant pour l'analyse de niche." });
            systemInstruction = `Tu es un consultant IA expert en croissance Twitch. Ton but est d'analyser un jeu comme une "niche" et de donner une critique ultra-actionnable au streamer. Réponds en format HTML.`;
            prompt = `Analyse le jeu **${query}** et fournis une critique de niche. Inclus : 1. Un titre fort (h4) 2. Un paragraphe sur l'attrait général. 3. Une liste non ordonnée (ul/li) de 3-5 points d'action. 4. Utilise un langage motivant et professionnel.`;
            break;
        case 'repurpose':
             if (!query) return res.status(400).json({ success: false, error: "Le streamer est manquant pour l'analyse de repurposing." });
            systemInstruction = `Tu es un expert en repurposing vidéo. Ton but est d'analyser une VOD (simulée ici pour **${query}**) et de donner des idées de clips courts pour TikTok/YouTube Shorts. Réponds en format HTML.`;
            prompt = `Analyse la dernière VOD du streamer **${query}** (imaginaire). Donne 3 suggestions de clips courts ultra-viraux. Pour chaque clip (en liste ul/li) : 1. Décris l'action. 2. Donne un titre viral précis. 3. Simule un timestamp de début de clip (format 00:00:00) comme ceci: **Point de Clip:** 00:25:40.`;
            break;
        case 'trend':
            systemInstruction = `Tu es un 'Trend Detector' IA. Ton but est d'analyser les tendances V/S (Spectateurs par Streamer). Réponds en format HTML.`;
            prompt = `Fournis une analyse des tendances de niche Twitch. Identifie 3 à 5 jeux/catégories qui ont actuellement un excellent potentiel V/S et qui ne sont pas dans le Top 5 global. Pour chaque point (en liste ul/li) : 1. Donne le nom du jeu. 2. Explique pourquoi il est une opportunité.`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA invalide." });
    }
    
    try {
        const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: [{ role: "user", parts: [{ text: prompt }] }], config: { systemInstruction: systemInstruction } });
        const html_critique = `<div class="ai-content">${response.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</div>`;
        return res.json({ success: true, html_critique: html_critique });
    } catch (e) {
        console.error(`❌ Erreur IA (${type}):`, e.message);
        return res.status(500).json({ success: false, error: `Échec de l'appel à l'API Gemini. (Détail: ${e.message.substring(0, 50)}...)` });
    }
});

// ROUTE MINI ASSISTANT IA
app.post('/mini_assistant', async (req, res) => {
    if (!ai) {
        return res.status(503).json({ success: false, error: "Le service IA n'est pas disponible (clé API manquante)." });
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
        console.error("❌ Erreur Mini Assistant (API call failed):", e.message);
        return res.status(500).json({ 
            success: false, 
            error: `Erreur interne du serveur lors de l'appel à l'IA. (Détail: ${e.message.substring(0, 50)}...)` 
        });
    }
});


app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const cooldownDuration = 3 * 3600 * 1000; // 3 heures
    const now = Date.now();

    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel] < cooldownDuration)) {
        const minutesRemaining = Math.ceil((CACHE.streamBoosts[channel] + cooldownDuration - now) / (60 * 1000));
        const errorMessage = `<p style="color:#ffcc00; font-weight:bold;">⚠️ Vous devez attendre !</p><p>Cooldown de 3 heures actif. Prochain Boost disponible dans environ <strong>${minutesRemaining} minutes</strong>.</p>`;
        return res.status(429).json({ error: `Cooldown actif. Prochain Boost dans ${minutesRemaining} minutes.`, html_response: errorMessage });
    }

    CACHE.streamBoosts[channel] = now;
    const successMessage = `<p style="color:var(--color-primary-pink); font-weight:bold;">✅ Boost de Stream Activé !</p><p>La chaîne <strong>${channel}</strong> a été ajoutée à la rotation prioritaire pour une période de 10 minutes. Le prochain boost sera disponible dans 3 heures. Bonne chance !</p>`;
    return res.json({ success: true, html_response: successMessage });
});


// =========================================================
// Configuration des Routes Statiques
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
    getAppAccessToken().catch(e => console.error("Échec du jeton initial (vérifiez les clés Twitch):", e.message));
});
