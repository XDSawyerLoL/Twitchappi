const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Nécessite l'installation de node-fetch@2
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Assurez-vous que le package @google/genai est installé (npm install @google/genai)
const { GoogleGenAI } = require('@google/genai'); 

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
// Remplacez les valeurs par défaut si vous n'utilisez pas de fichier .env
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET';

// 🛑 CORRECTION DÉFINITIVE DE L'URI (Utilise l'URL enregistrée chez Twitch)
// Le backend doit générer l'URL de redirection que Twitch connaît.
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'https://justplayer.fr/en-eur/pages/streamerhub/twitch_auth_callback'; 

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
} else {
    console.error("Clé GEMINI_API_KEY manquante. Les fonctions d'IA seront désactivées.");
}

// =========================================================
// --- MIDDLEWARES ---
// =========================================================

// Configurer CORS pour autoriser les requêtes de votre Frontend sur justplayer.fr
const allowedOrigins = [
    'https://justplayer.fr',
    'https://www.justplayer.fr',
    'https://justplayerstreamhubpro.onrender.com', // L'API s'appelle elle-même parfois
    'http://localhost:10000'
];
app.use(cors({
    origin: (origin, callback) => {
        // Permettre les requêtes sans 'origin' (ex: Postman ou appels locaux)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Afficher une erreur si l'origine n'est pas autorisée
            console.warn(`Tentative de CORS non autorisée depuis: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


// =========================================================
// --- CACHE ET SESSIONS SIMPLIFIÉES ---
// (À remplacer par Redis/Base de données en production réelle)
// =========================================================

const CACHE = {
    accessToken: null,
    expiresAt: 0,
    userTwitchToken: null, // Jeton d'accès de l'utilisateur
    userRefreshToken: null, // Jeton de rafraîchissement de l'utilisateur
    userId: null,
    userName: null,
    streamBoosts: {}, // Cache pour la fonction Boost
};

// =========================================================
// --- FONCTIONS UTILITAIRES TWITCH API ---
// =========================================================

// Fonction pour obtenir le jeton d'application (client credentials)
async function getAppAccessToken() {
    if (CACHE.accessToken && Date.now() < CACHE.expiresAt) {
        return CACHE.accessToken;
    }

    try {
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials',
                scope: 'user:read:follows' // Scopes par défaut
            }).toString()
        });
        const data = await response.json();
        if (data.access_token) {
            CACHE.accessToken = data.access_token;
            // Définir l'expiration 5 minutes avant la fin
            CACHE.expiresAt = Date.now() + (data.expires_in - 300) * 1000;
            console.log("Nouveau jeton d'application Twitch obtenu.");
            return CACHE.accessToken;
        }
    } catch (error) {
        console.error("Erreur lors de l'obtention du jeton d'application:", error);
    }
    return null;
}

// Fonction pour rafraîchir le jeton d'utilisateur
async function refreshUserToken() {
    if (!CACHE.userRefreshToken) return false;

    try {
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                refresh_token: CACHE.userRefreshToken,
                grant_type: 'refresh_token'
            }).toString()
        });
        const data = await response.json();

        if (data.access_token) {
            CACHE.userTwitchToken = data.access_token;
            if (data.refresh_token) {
                CACHE.userRefreshToken = data.refresh_token;
            }
            console.log("Jeton utilisateur rafraîchi avec succès.");
            return true;
        }
    } catch (error) {
        console.error("Erreur lors du rafraîchissement du jeton utilisateur:", error);
    }
    return false;
}

// Middleware pour s'assurer que l'utilisateur a un jeton valide (ou tenter de le rafraîchir)
async function ensureUserToken(req, res, next) {
    if (CACHE.userTwitchToken) {
        // Dans une application réelle, on vérifierait l'expiration ici
        return next();
    }
    
    if (await refreshUserToken()) {
        return next();
    }
    
    // Si pas de jeton ou rafraîchissement échoué
    return res.status(401).json({ error: 'User not authenticated or token expired.' });
}


// =========================================================
// --- ROUTES TWITCH AUTHENTIFICATION ---
// =========================================================

// =========================================================
// Route 1/3: Démarrer l'authentification
// =========================================================
app.get('/twitch_auth_start', (req, res) => {
    // Générer un état pour la sécurité (prévention CSRF)
    const state = crypto.randomBytes(16).toString('hex');
    // NOTE: Utilisation de 'secure: true' et 'httpOnly: true'
    // 'secure: true' est CRITIQUE car votre site est en HTTPS
    res.cookie('twitch_oauth_state', state, { httpOnly: true, secure: true, maxAge: 3600000 }); // 1h

    // Construire l'URL d'autorisation Twitch
    const authUrl = `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${TWITCH_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` + // Utilise l'URL justplayer.fr que nous avons définie
        `&response_type=code` +
        `&scope=user:read:follows+channel:read:subscriptions` + // Scopes requis pour le fil suivi
        `&state=${state}`;

    // Redirige l'utilisateur vers la page de connexion de Twitch
    res.redirect(authUrl);
});


// =========================================================
// Route 2/3: Callback Twitch (après connexion/autorisation)
// =========================================================
// ATTENTION: CETTE ROUTE DOIT ÊTRE DÉPLACÉE SUR LE SERVEUR justplayer.fr
// SI VOUS NE POUVEZ PAS CHANGER L'URI DE REDIRECTION CHEZ TWITCH.
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    const storedState = req.cookies.twitch_oauth_state;

    // 1. Gestion des erreurs et vérification CSRF
    if (error) {
        // Rediriger l'utilisateur vers une page d'erreur sur justplayer.fr
        return res.status(400).send(`Erreur d'authentification: ${error_description || error}`);
    }
    if (!state || state !== storedState) {
        // Tenter de nettoyer le cookie pour la sécurité
        res.clearCookie('twitch_oauth_state'); 
        return res.status(403).send('Erreur CSRF: Les états ne correspondent pas.');
    }
    res.clearCookie('twitch_oauth_state'); // Nettoyer après usage

    // 2. Échange du code contre les jetons
    try {
        const response = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI // Doit être identique à l'URI utilisée pour la redirection
            }).toString()
        });
        const tokenData = await response.json();

        if (tokenData.access_token) {
            CACHE.userTwitchToken = tokenData.access_token;
            CACHE.userRefreshToken = tokenData.refresh_token;

            // 3. Obtenir les infos utilisateur (ID et nom)
            const userResponse = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${CACHE.userTwitchToken}`
                }
            });
            const userData = await userResponse.json();
            
            if (userData.data && userData.data.length > 0) {
                CACHE.userId = userData.data[0].id;
                CACHE.userName = userData.data[0].display_name;
            }

            // Fermer la fenêtre pop-up pour le Frontend
            // window.close() devrait fonctionner car la fenêtre parent est désormais justplayer.fr
            // et le callback revient sur justplayer.fr
            return res.send('<script>window.close();</script>');
            
        } else {
            return res.status(400).send(`Erreur d'échange de jeton: ${tokenData.message || 'Token non reçu'}`);
        }

    } catch (e) {
        console.error("Erreur lors de l'échange de jeton:", e);
        return res.status(500).send('Erreur serveur lors du processus d\'authentification.');
    }
});


// =========================================================
// Route 3/3: Vérifier le statut de connexion de l'utilisateur
// =========================================================
app.get('/twitch_user_status', async (req, res) => {
    // Si nous avons un jeton utilisateur et un nom, nous sommes connectés.
    if (CACHE.userTwitchToken && CACHE.userName) {
        // Tenter de rafraîchir si le jeton est potentiellement expiré
        if (!(await ensureUserToken(req, res, () => true))) {
             return res.json({ is_connected: false });
        }
        return res.json({ is_connected: true, username: CACHE.userName });
    }
    return res.json({ is_connected: false });
});


// =========================================================
// Route pour la déconnexion
// =========================================================
app.get('/twitch_logout', (req, res) => {
    // Effacer les jetons et les infos utilisateur
    CACHE.userTwitchToken = null;
    CACHE.userRefreshToken = null;
    CACHE.userId = null;
    CACHE.userName = null;
    console.log("Déconnexion utilisateur effectuée.");
    // Rediriger vers la page principale
    res.redirect('/'); 
});


// =========================================================
// --- ROUTES TWITCH API (Requiert le jeton utilisateur) ---
// =========================================================

// =========================================================
// Route pour obtenir les streams suivis
// =========================================================
app.get('/followed_streams', ensureUserToken, async (req, res) => {
    // Cette route requiert le jeton d'application pour les appels Helix
    const appToken = await getAppAccessToken();

    if (!appToken || !CACHE.userId) {
        return res.status(500).json({ error: "Impossible d'obtenir le jeton d'application ou l'ID utilisateur." });
    }

    try {
        // Étape 1: Récupérer la liste des IDs des chaînes suivies
        const followsResponse = await fetch(`https://api.twitch.tv/helix/users/follows?user_id=${CACHE.userId}&first=100`, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${CACHE.userTwitchToken}` // Jeton utilisateur nécessaire pour cette requête
            }
        });
        const followsData = await followsResponse.json();

        if (!followsData.data || followsData.data.length === 0) {
             return res.json({ data: [] }); // Pas de chaînes suivies
        }
        
        const followedIds = followsData.data.map(f => f.to_id);
        
        // Étape 2: Récupérer les informations de stream pour ces IDs
        // On utilise ici le jeton d'application pour cette requête
        const streamQuery = followedIds.map(id => `user_id=${id}`).join('&');
        
        const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${streamQuery}`, {
             headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${appToken}`
            }
        });
        const streamsData = await streamsResponse.json();
        
        // Optionnel : enrichir avec la photo de profil (requiert une autre requête si non incluse)
        // Pour simplifier, on renvoie les données de stream brutes, suffisantes pour l'affichage des cartes.

        res.json(streamsData); 

    } catch (e) {
        console.error("Erreur lors de la récupération des streams suivis:", e);
        res.status(500).json({ error: "Erreur serveur lors de la récupération des streams." });
    }
});


// =========================================================
// Route pour le Scan Cible (Utilisateur ou Jeu)
// =========================================================
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Requête manquante." });

    const token = await getAppAccessToken();
    if (!token) return res.status(500).json({ error: "Jeton d'application Twitch indisponible." });

    // Tentez d'abord de trouver l'utilisateur
    try {
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${query}`, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userResponse.json();

        if (userData.data && userData.data.length > 0) {
            const user = userData.data[0];
            const result = {
                type: 'user',
                user_data: {
                    display_name: user.display_name,
                    profile_image_url: user.profile_image_url,
                    description: user.description,
                    followers: 0, // Sera mis à jour
                    anciennete: "N/A", // Sera mis à jour
                    is_live: false,
                    stream_details: null,
                    last_vods: [],
                    suggested_channels: [],
                    last_games: []
                }
            };

            // Récupérer Followers
            const followersResponse = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`, {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            const followersData = await followersResponse.json();
            result.user_data.followers = followersData.total || 0;
            
            // Calculer Ancienneté
            if (user.created_at) {
                const createdDate = new Date(user.created_at);
                const diffTime = Math.abs(new Date() - createdDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                result.user_data.anciennete = `${Math.floor(diffDays / 365)} ans`;
            }

            // Récupérer le statut LIVE et les détails du stream
            const streamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_login=${query}`, {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            const streamData = await streamResponse.json();
            if (streamData.data && streamData.data.length > 0) {
                result.user_data.is_live = true;
                result.user_data.stream_details = streamData.data[0];
            }

            // Récupérer les VODs (Vidéos)
            const vodResponse = await fetch(`https://api.twitch.tv/helix/videos?user_id=${user.id}&type=archive&first=4`, {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            const vodData = await vodResponse.json();
            if (vodData.data) {
                 result.user_data.last_vods = vodData.data.map(v => ({
                    title: v.title,
                    url: v.url,
                    thumbnail_url: v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                    duration: v.duration,
                    game_name: v.game_name
                }));
                 // Stocker le jeu de la dernière VOD si le streamer est hors ligne
                 if (!result.user_data.is_live && result.user_data.last_vods.length > 0) {
                     result.user_data.last_games.push(result.user_data.last_vods[0].game_name);
                 }
            }
            
            // Récupérer les suggestions de chaînes (par le jeu)
            let gameToSuggest = result.user_data.stream_details ? result.user_data.stream_details.game_name : result.user_data.last_games[0];
            
            if (gameToSuggest) {
                 const gameStreamsResponse = await fetch(`https://api.twitch.tv/helix/streams?game_name=${encodeURIComponent(gameToSuggest)}&first=5`, {
                    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
                });
                const gameStreamsData = await gameStreamsResponse.json();
                
                if (gameStreamsData.data) {
                    // Filtrer pour ne pas inclure l'utilisateur lui-même
                    result.user_data.suggested_channels = gameStreamsData.data
                        .filter(s => s.user_id !== user.id)
                        .slice(0, 4)
                        .map(s => ({
                            name: s.user_name,
                            viewers: s.viewer_count,
                            title: s.title,
                            profile_url: `https://twitch.tv/${s.user_login}`
                        }));
                }
            }

            return res.json(result);
        }
    } catch (e) {
        // En cas d'erreur lors de la recherche de l'utilisateur, continuer
        console.error("Erreur lors du scan utilisateur:", e);
    }
    
    // Si l'utilisateur n'est pas trouvé, tentez de trouver le jeu
    try {
        const gameResponse = await fetch(`https://api.twitch.tv/helix/games?name=${query}`, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const gameData = await gameResponse.json();

        if (gameData.data && gameData.data.length > 0) {
            const game = gameData.data[0];
            
            // Récupérer les streams actuels du jeu
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?game_id=${game.id}&first=10`, {
                headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            const streamsData = await streamsResponse.json();
            
            const totalViewers = streamsData.data ? streamsData.data.reduce((sum, s) => sum + s.viewer_count, 0) : 0;

            return res.json({
                type: 'game',
                game_data: {
                    name: game.name,
                    box_art_url: game.box_art_url.replace('{width}', '100').replace('{height}', '135'),
                    total_viewers: totalViewers,
                    total_streamers: streamsData.data ? streamsData.data.length : 0,
                    streams: streamsData.data || []
                }
            });
        }
    } catch (e) {
        console.error("Erreur lors du scan de jeu:", e);
    }

    // Si ni utilisateur ni jeu n'est trouvé
    res.json({ type: 'none', message: `Aucun utilisateur ou jeu trouvé pour: ${query}` });
});


// =========================================================
// --- ROUTES GEMINI IA ---
// =========================================================

// Fonction générique pour interagir avec Gemini
async function runGeminiAnalysis(prompt) {
    if (!ai) return { error: "Service IA non initialisé (Clé API manquante)." };
    
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                systemInstruction: "Vous êtes un expert en streaming et en marketing de contenu. Répondez toujours de manière professionnelle, structurée en HTML propre (utilisez <h4>, <p>, <ul>, <strong>) pour une intégration facile, sans inclure les balises <html>, <body> ou <style>.",
                temperature: 0.7,
            },
        });
        
        return { html_critique: response.text };
    } catch (error) {
        console.error("Erreur lors de l'appel à l'API Gemini:", error);
        return { error: `Erreur interne de l'IA: ${error.message}` };
    }
}

// =========================================================
// Route Critique IA (Niche, Repurpose, Trend)
// =========================================================
app.post('/critique_ia', async (req, res) => {
    const { query, type } = req.body;
    let prompt = "";

    switch (type) {
        case 'niche':
            if (!query) return res.status(400).json({ error: "Nom du jeu manquant." });
            prompt = `Effectuez une analyse de niche approfondie pour le jeu '${query}' sur Twitch. Identifiez 3 sous-niches non saturées (moins de 5 streamers actifs), proposez 3 angles de stream uniques pour ce jeu (ex: speedrun, défi ironman, guide pour débutant), et donnez 3 mots-clés de titre de stream optimisés pour le SEO.`;
            break;
            
        case 'repurpose':
             if (!query) return res.status(400).json({ error: "Nom du streamer manquant." });
             // Dans une vraie app, on scannerait les VODs, ici on simule l'analyse
             prompt = `Donnez 5 idées de repurposing de contenu (clips/VOD) pour un streamer nommé '${query}'. Proposez des formats pour TikTok/Reels (moins de 60s), YouTube Shorts (moins de 30s) et YouTube Long-form (5-10 min). Donnez pour chaque format un titre accrocheur.`;
             break;
             
        case 'trend':
            prompt = `Analysez les tendances actuelles sur Twitch et proposez 3 jeux émergents (ou "sleeper hits") qui ont un fort potentiel de croissance pour un nouveau streamer. Pour chacun, donnez 1 raison de leur potentiel et 1 type de contenu à créer. Structurez la réponse clairement.`;
            break;

        default:
            return res.status(400).json({ error: "Type de critique IA non valide." });
    }

    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});


// =========================================================
// Route Boost de Stream (Simulé)
// =========================================================
// NOTE: Ceci est une simulation. Un vrai boost nécessiterait des ressources serveur et une logique complexe.
app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ success: false, error: "Nom de chaîne manquant." });

    const now = Date.now();
    const COOLDOWN = 3 * 60 * 60 * 1000; // 3 heures

    // Vérification du cooldown
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel] < COOLDOWN)) {
        const remainingTime = CACHE.streamBoosts[channel] + COOLDOWN - now;
        const minutes = Math.ceil(remainingTime / (60 * 1000));
        return res.json({ 
            success: false, 
            html_response: `
                <p style="color:red; font-weight:bold;">
                    ❌ Cooldown Actif
                </p>
                <p>
                    Le boost pour <strong>${channel}</strong> est en cooldown. 
                    Vous devez attendre encore environ <strong>${minutes} minutes</strong> avant de pouvoir l'utiliser à nouveau.
                </p>
            `
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

// Route explicite pour NicheOptimizer.html
app.get('/NicheOptimizer.html', (req, res) => {
    // Si vous renommez votre fichier HTML en NicheOptimizer (3).html, mettez à jour cette ligne:
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html')); 
});

// Routes pour les autres fichiers HTML (si le projet les utilise)
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
    console.log(`Serveur démarré sur le port ${PORT}`);
    // Tente d'obtenir le premier jeton d'application au démarrage
    getAppAccessToken(); 
});
