const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Assurez-vous d'avoir installé : npm install @google/genai express cors node-fetch body-parser cookie-parser
const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// ATTENTION : REMPLACEZ LES PLACEHOLDERS CI-DESSOUS
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET_TWITCH';
// L'URL Render que vous utilisez (doit correspondre à la configuration Twitch et au Front-end)
const RENDER_DOMAIN = 'https://justplayerstreamhubpro.onrender.com';
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || `${RENDER_DOMAIN}/twitch_auth_callback`;

// CLÉ API GEMINI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_API_GEMINI';
const GEMINI_MODEL = "gemini-2.0-flash";

let ai = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== 'VOTRE_CLE_API_GEMINI') {
    ai = new GoogleGenAI(GEMINI_API_KEY);
    console.log("✅ GoogleGenAI initialisé.");
} else {
    console.error("❌ CLÉ GEMINI manquante ou incorrecte.");
}

// =========================================================
// --- MIDDLEWARES & STOCKAGE SESSION SIMULÉ ---
// =========================================================

// ATTENTION: Cors est ouvert à tout le monde (*) pour la simplicité.
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// Stockage de session simplifiée (pour cet exemple)
const userSessions = new Map();

// Middleware pour vérifier la session et les tokens Twitch
async function checkTwitchAuth(req, res, next) {
    const sessionId = req.cookies.session_id;
    const session = userSessions.get(sessionId);
    if (session && session.accessToken && session.expiresAt > Date.now()) {
        req.session = session;
        // Logique de rafraîchissement (non implémentée ici)
        if (session.expiresAt - Date.now() < 300000) { 
             console.log("Token presque expiré, nécessite un rafraîchissement.");
        }
        next();
    } else {
        res.status(401).json({ success: false, error: "Non authentifié", html_response: "<p style='color:red;'>❌ Connexion Twitch requise pour cette action.</p>" });
    }
}

// =========================================================
// --- ROUTE D'AUTHENTIFICATION TWITCH (OAUTH 2.0) ---
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows+channel:read:subscriptions+clips:edit+channel:manage:raids&state=${state}`;
    // Secure: true et sameSite: 'None' sont nécessaires pour le cross-site sur HTTPS (Render)
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: true, sameSite: 'None' });
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    const expectedState = req.cookies.twitch_auth_state;

    if (!state || state !== expectedState) {
        return res.redirect(`/?error=oauth_state_invalid`);
    }

    try {
        // 1. Échange du code contre le token
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
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

        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            console.error('Erreur Token:', tokenData.message);
            return res.redirect(`/?error=token_exchange_failed&message=${encodeURIComponent(tokenData.message)}`);
        }

        const { access_token, refresh_token, expires_in } = tokenData;

        // 2. Récupération des informations utilisateur (ID et Nom)
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${access_token}`
            }
        });
        const userData = await userRes.json();
        const user = userData.data[0];

        // 3. Stockage de la session
        const sessionId = crypto.randomBytes(16).toString('hex');
        userSessions.set(sessionId, {
            id: user.id,
            username: user.login,
            displayName: user.display_name,
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt: Date.now() + (expires_in * 1000)
        });

        // 4. Envoi du cookie de session au client (HTTPS sur Render)
        res.cookie('session_id', sessionId, { httpOnly: true, secure: true, sameSite: 'None', maxAge: 90 * 24 * 60 * 60 * 1000 });
        
        // 5. Redirection vers la page principale
        res.redirect('/');

    } catch (error) {
        console.error('Erreur d\'authentification Twitch:', error);
        res.redirect(`/?error=internal_auth_error`);
    }
});

app.post('/twitch_logout', (req, res) => {
    const sessionId = req.cookies.session_id;
    if (sessionId) {
        userSessions.delete(sessionId);
        res.clearCookie('session_id', { httpOnly: true, secure: true, sameSite: 'None' });
        res.json({ success: true, message: "Déconnexion réussie." });
    } else {
        res.json({ success: true, message: "Déjà déconnecté." });
    }
});

app.get('/twitch_user_status', (req, res) => {
    const sessionId = req.cookies.session_id;
    const session = userSessions.get(sessionId);
    
    if (session && session.accessToken && session.expiresAt > Date.now()) {
        res.json({
            is_connected: true,
            username: session.username,
            display_name: session.displayName
        });
    } else {
        res.json({ is_connected: false });
    }
});

// =========================================================
// --- FONCTION UTILITAIRE API TWITCH ---
// =========================================================

async function twitchApiCall(endpoint, token, queryParams = {}) {
    const params = new URLSearchParams(queryParams).toString();
    const url = `https://api.twitch.tv/helix/${endpoint}?${params}`;
    
    const res = await fetch(url, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': token
        }
    });
    return res.json();
}

// =========================================================
// --- ROUTE DU FIL SUIVI (Followed Streams) ---
// =========================================================

app.get('/followed_streams', checkTwitchAuth, async (req, res) => {
    try {
        const userId = req.session.id;
        const accessToken = req.session.accessToken;
        const ACCESS_TOKEN_HEADER = `Bearer ${accessToken}`;
        
        const response = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${userId}&first=12`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': ACCESS_TOKEN_HEADER
            }
        });
        
        const data = await response.json();

        if (!response.ok || data.error) {
            console.error('Erreur API Twitch /followed_streams:', data.message || 'Erreur inconnue');
            return res.status(response.status).json({ success: false, error: data.message || "Erreur lors de la récupération des streams suivis." });
        }
        
        res.json({ success: true, streams: data.data });

    } catch (e) {
        console.error('Erreur /followed_streams:', e);
        res.status(500).json({ success: false, error: `Erreur interne du serveur: ${e.message}` });
    }
});

// =========================================================
// --- ROUTE SCANNER CIBLE (Utilisateur ou Jeu) ---
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ success: false, message: "La requête est vide." });
    }
    
    // Le token public est basé uniquement sur le Client-ID
    const PUBLIC_TOKEN_HEADER = `Client-ID ${TWITCH_CLIENT_ID}`; 

    try {
        // Tenter un scan de JEU
        const gameRes = await twitchApiCall('games', PUBLIC_TOKEN_HEADER, { name: query });
        if (gameRes.data && gameRes.data.length > 0) {
            const game = gameRes.data[0];

            // Récupérer les données de Stream pour calculer V/S
            const streamRes = await twitchApiCall('streams', PUBLIC_TOKEN_HEADER, { game_id: game.id, first: 100 });
            
            let totalViewers = 0;
            let totalStreamers = streamRes.data ? streamRes.data.length : 0;
            
            if (streamRes.data) {
                totalViewers = streamRes.data.reduce((sum, stream) => sum + stream.viewer_count, 0);
            }
            
            return res.json({ 
                success: true, 
                type: 'game', 
                game_data: { 
                    id: game.id, 
                    name: game.name, 
                    box_art_url: game.box_art_url, 
                    total_viewers: totalViewers, 
                    total_streamers: totalStreamers 
                } 
            });
        }
        
        // Tenter un scan d'UTILISATEUR
        const userRes = await twitchApiCall('users', PUBLIC_TOKEN_HEADER, { login: query.toLowerCase() });
        if (userRes.data && userRes.data.length > 0) {
            const user = userRes.data[0];

            // Récupérer le nombre de followers
            const followerRes = await twitchApiCall('channels/followers', PUBLIC_TOKEN_HEADER, { broadcaster_id: user.id });
            const follower_count = followerRes.total;

            // Récupérer le statut LIVE
            const streamRes = await twitchApiCall('streams', PUBLIC_TOKEN_HEADER, { user_id: user.id });
            const is_live = streamRes.data && streamRes.data.length > 0;
            const stream_details = is_live ? { 
                viewer_count: streamRes.data[0].viewer_count, 
                game_name: streamRes.data[0].game_name 
            } : null;

            return res.json({ 
                success: true, 
                type: 'user', 
                user_data: { 
                    id: user.id, 
                    login: user.login, 
                    display_name: user.display_name, 
                    profile_image_url: user.profile_image_url, 
                    follower_count: follower_count || 0,
                    is_live,
                    stream_details
                } 
            });
        }

        return res.status(404).json({ success: false, message: "Cible (utilisateur ou jeu) non trouvée sur Twitch." });

    } catch (e) {
        console.error('Erreur /scan_target:', e);
        res.status(500).json({ success: false, error: `Erreur interne du serveur: ${e.message}` });
    }
});

// ... (Les autres routes /get_latest_vod, /auto_action, /critique_ia, /stream_boost restent inchangées)

// =========================================================
// ROUTE RACINE & DÉMARRAGE SERVEUR (CORRIGÉE POUR RENDER)
// =========================================================

// Cette route sert le fichier NicheOptimizer.html à la racine de votre URL Render.
app.get('/', (req, res) => {
    // Le fichier NicheOptimizer.html doit être dans le même dossier que app.js lors du déploiement.
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html')); 
});

app.listen(PORT, () => {
    console.log(`Serveur Back-end démarré sur le port ${PORT}`);
    console.log(`Adresse de redirection Twitch configurée: ${REDIRECT_URI}`);
    console.log("------------------------------------------");
});
