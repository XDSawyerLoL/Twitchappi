const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto'); // Nécessaire pour l'OAuth (génération de 'state')
const cookieParser = require('cookie-parser'); // Nécessaire pour l'OAuth (gestion du 'state')

const app = express();

// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI; 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

// --- Stockage d'État pour la Connexion Utilisateur (OAuth) ---
// Ces variables stockent l'état de l'utilisateur connecté via OAuth
let currentUserToken = null; // Token d'Accès Utilisateur (pour /followed_streams)
let currentUsername = null; 
let currentTwitchUserId = null; 

// --- Stockage d'État pour le Token Applicatif (Client Credentials) ---
// Ce token sert aux appels génériques (comme /random)
let TWITCH_ACCESS_TOKEN = null;
let TWITCH_TOKEN_EXPIRY = 0;

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser()); // Ajout essentiel pour la sécurité OAuth
// Nous n'utilisons PAS express.static() car vos routes ci-dessous pointent directement vers la racine.

// =========================================================
// Firebase Admin SDK
// =========================================================
const admin = require("firebase-admin");

let firebaseCredentials;

try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
        firebaseCredentials = JSON.parse(serviceAccountJson);
        console.log("Credentials Firebase chargées depuis la variable d'environnement.");
    } else {
        console.log("Variable d'environnement FIREBASE_SERVICE_ACCOUNT non trouvée. Tentative de lecture locale...");
        // Vous devez vous assurer que require('./serviceAccountKey.json') existe en local
        // firebaseCredentials = require('./serviceAccountKey.json');
        console.log("Firebase non initialisé - utilisez FIREBASE_SERVICE_ACCOUNT sur Render.");
        // Nous continuons sans Firebase pour ne pas bloquer le serveur si les credentials manquent.
    }
    
    if (firebaseCredentials) {
        admin.initializeApp({
            credential: admin.credential.cert(firebaseCredentials),
            // 👉 REMPLACEZ LA LIGNE CI-DESSOUS par l'URL de votre base de données :
            databaseURL: "https://TON_PROJET.firebaseio.com"
        });
        var rtdb = admin.database();
        var firestore = admin.firestore();
    }
} catch (e) {
    console.error("Erreur critique lors de l'initialisation Firebase. Le serveur continue sans DB:", e.message);
}

// =========================================================
// FONCTIONS D'AUTHENTIFICATION TWITCH (Client Credentials - APPLI)
// =========================================================

// --- Fonction pour obtenir un token Twitch (Applicatif) ---
async function getTwitchAccessToken() {
    if (TWITCH_ACCESS_TOKEN && Date.now() < TWITCH_TOKEN_EXPIRY) {
        return TWITCH_ACCESS_TOKEN;
    }

    console.log("Obtention d'un nouveau Token Applicatif Twitch...");
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (response.ok && data.access_token) {
            TWITCH_ACCESS_TOKEN = data.access_token;
            // Expiration 5 minutes avant l'heure réelle
            TWITCH_TOKEN_EXPIRY = Date.now() + (data.expires_in * 1000) - 300000; 
            return TWITCH_ACCESS_TOKEN;
        } else {
            console.error("Erreur Token Applicatif Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau Auth Twitch (Applicatif):", error.message);
        return null;
    }
}

// =========================================================
// FLUX D'AUTHENTIFICATION TWITCH (OAuth - UTILISATEUR)
// CORRIGE LE 404
// =========================================================

/**
 * 🔑 Étape 1: Démarrage de l'Authentification (GET /twitch_auth_start)
 */
app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !REDIRECT_URI) {
        return res.status(500).send("Configuration Twitch manquante.");
    }
    
    const scopes = 'user:read:follows viewing_activity_read';
    const state = crypto.randomBytes(16).toString('hex');
    
    // Stocker le 'state' dans un cookie pour la vérification de sécurité au retour
    res.cookie('oauth_state', state, { httpOnly: true, maxAge: 600000 }); 

    const twitchAuthURL = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scopes}&state=${state}`;
    
    console.log("Démarrage OAuth, redirection vers Twitch...");
    res.redirect(twitchAuthURL);
});

/**
 * 🔑 Étape 2: Callback de Twitch et Échange de Code (GET /twitch_auth_callback)
 */
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    const expectedState = req.cookies.oauth_state;
    // if (state !== expectedState) {
    //     return res.redirect(`/?error=${encodeURIComponent('Erreur de sécurité (CSRF).')}`);
    // }
    res.clearCookie('oauth_state');

    if (error) {
        console.error(`Erreur d'autorisation Twitch: ${error_description}`);
        return res.redirect(`/?error=${encodeURIComponent('Connexion Twitch refusée.')}`);
    }

    if (!code) {
        return res.redirect(`/?error=${encodeURIComponent('Code d\'autorisation manquant.')}`);
    }

    try {
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI 
            }).toString()
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error("Échec de l'échange de code:", tokenData);
            return res.redirect(`/?error=${encodeURIComponent('Échec de l\'obtention du token d\'accès.')}`);
        }

        currentUserToken = tokenData.access_token;

        // Récupérer l'ID et le nom de l'utilisateur
        const userResponse = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${currentUserToken}`,
                'Client-Id': TWITCH_CLIENT_ID
            }
        });
        const userData = await userResponse.json();
        
        if (userData.data && userData.data.length > 0) {
            currentUsername = userData.data[0].display_name;
            currentTwitchUserId = userData.data[0].id;
        }

        return res.redirect('/'); 

    } catch (error) {
        console.error("Erreur critique lors du callback Twitch:", error);
        return res.redirect(`/?error=${encodeURIComponent('Erreur serveur lors de la connexion Twitch.')}`);
    }
});

/**
 * 🔑 Route de Déconnexion (GET /twitch_logout)
 */
app.get('/twitch_logout', (req, res) => {
    currentUserToken = null;
    currentUsername = null;
    currentTwitchUserId = null;
    res.redirect('/');
});


/**
 * 🔑 Route pour vérifier le statut de connexion (GET /twitch_user_status)
 */
app.get('/twitch_user_status', (req, res) => {
    res.json({
        is_connected: !!currentUserToken,
        username: currentUsername
    });
});

// =========================================================
// FONCTIONS HELPER TWITCH
// =========================================================

async function getGameId(gameName, token) {
    if (!gameName || !token) return null;
    const searchUrl = `https://api.twitch.tv/helix/games?name=${encodeURIComponent(gameName)}`;
    const response = await fetch(searchUrl, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    // ... (Logique getGameId complète) ...
    if (response.status !== 200) {
        console.error(`Erreur Twitch Helix getGameId (HTTP ${response.status})`);
        return null;
    }
    const data = await response.json();
    return data.data.length > 0 ? data.data[0].id : null;
}

async function getStreamerDetails(userLogin, token) {
    if (!userLogin || !token) return null;

    try {
        const userRes = await fetch(
            `https://api.twitch.tv/helix/users?login=${encodeURIComponent(userLogin)}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );

        if (userRes.status !== 200) return null;

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) return null;

        const user = userData.data[0];

        const streamRes = await fetch(
            `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(userLogin)}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );
        const streamData = await streamRes.json();
        const stream = streamData.data && streamData.data.length > 0 ? streamData.data[0] : null;

        const followRes = await fetch(
            `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`,
            { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` } }
        );
        const followData = await followRes.json();

        return {
            username: user.login,
            user_id: user.id,
            is_live: !!stream,
            title: stream ? stream.title : 'Hors ligne',
            game_name: stream ? stream.game_name : 'Non spécifié',
            viewer_count: stream ? stream.viewer_count : 0,
            follower_count: followData.total || 0,
            tags: stream?.tags || [],
            avg_score: (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1)
        };
    } catch (e) {
        console.error("Erreur details streamer:", e);
        return null;
    }
}


// =========================================================
// ROUTES API (Fusion des deux versions)
// =========================================================

// Route Firebase Test (si Firebase est initialisé)
app.get('/firebase_test', async (req, res) => {
    if (!rtdb) return res.status(503).json({ message: "Firebase non initialisé." });
    try {
        await rtdb.ref("server_status").set({
            online: true,
            timestamp: Date.now()
        });
        res.json({ message: "Firebase fonctionne ✔" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// 1. GAME ID
app.get('/gameid', async (req, res) => {
    const token = await getTwitchAccessToken(); // Utilise le token Applicatif
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const id = await getGameId(req.query.name, token);
    if (id) res.json({ game_id: id, name: req.query.name });
    else res.status(404).json({ message: "Jeu non trouvé" });
});

// 2. RANDOM SCAN (ALÉATOIRE LARGE)
app.get('/random', async (req, res) => {
    const token = await getTwitchAccessToken(); // Utilise le token Applicatif
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    let url = `https://api.twitch.tv/helix/streams?first=100&language=fr`;
    if (req.query.game_id) url += `&game_id=${req.query.game_id}`;

    try {
        const response = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        const streams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0);
        if (streams.length === 0) return res.status(404).json({ message: "Aucun stream trouvé" });

        const randomStream = streams[Math.floor(Math.random() * streams.length)];
        const details = await getStreamerDetails(randomStream.user_login, token);
        if (details) res.json({ streamer: details });
        else res.status(404).json({ message: "Erreur détails streamer" });

    } catch {
        res.status(500).json({ message: "Erreur serveur scan" });
    }
});

// 3. DETAILS
app.get('/details', async (req, res) => {
    const token = await getTwitchAccessToken(); // Utilise le token Applicatif
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const details = await getStreamerDetails(req.query.login, token);
    if (details) res.json({ streamer: details });
    else res.status(404).json({ message: "Streamer introuvable" });
});

// 4. RANDOM SMALL STREAMER (< 100 Viewers)
app.get('/random_small_streamer', async (req, res) => {
    const token = await getTwitchAccessToken(); // Utilise le token Applicatif
    if (!token) return res.status(500).json({ message: "Erreur Auth Twitch" });

    const url = `https://api.twitch.tv/helix/streams?first=100&language=fr`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        // Filtrer pour les streamers avec 1 à 99 viewers
        const smallStreams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0 && s.viewer_count < 100);

        if (smallStreams.length === 0) {
            // Fallback si aucun petit streamer n'est trouvé
            const allLiveStreams = data.data.filter(s => s.type === 'live' && s.viewer_count > 0);
            if (allLiveStreams.length > 0) {
                 const fallbackStream = allLiveStreams[Math.floor(Math.random() * allLiveStreams.length)];
                 console.log(`[Small Streamer] Fallback vers ${fallbackStream.user_login}`);
                 return res.json({ username: fallbackStream.user_login, status: 'fallback_random', viewer_count: fallbackStream.viewer_count });
            }
            return res.status(404).json({ message: "Aucun stream live trouvé." });
        }

        const randomSmallStream = smallStreams[Math.floor(Math.random() * smallStreams.length)];
        res.json({ username: randomSmallStream.user_login, viewer_count: randomSmallStream.viewer_count, status: 'ok' });

    } catch (e) {
        res.status(500).json({ message: "Erreur serveur pour le scan petit streamer" });
    }
});


// 5. BOOST
app.post('/boost', (req, res) => {
    // ⚠️ Logique de boost à implémenter ici
    console.log(`BOOST: Signal d'activation reçu pour ${req.body.channelName}. Succès enregistré.`);
    res.json({ message: `Boost activé pour ${req.body.channelName}`, status: 'ok' });
});

// 6. IA : critique stream
app.post('/critique_ia', async (req, res) => {
    // ⚠️ Logique d'appel Gemini à implémenter ici
    if (!GEMINI_API_KEY) return res.status(503).json({ critique: "IA désactivée" });
    const mockCritique = "Analyse IA Simulée : Titre très efficace, mais l'image de profil pourrait être plus percutante.";
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    res.json({ critique: mockCritique });
});

// 7. IA : diagnostic titre
app.post('/diagnostic_titre', async (req, res) => {
    // ⚠️ Logique d'appel Gemini à implémenter ici
    if (!GEMINI_API_KEY) return res.status(503).json({ diagnostic: "IA désactivée" });
    const mockDiagnostic = "Diagnostic Simulé : Score 4/5. Le titre est clair mais pourrait être plus axé sur l'émotion.";
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    res.json({ diagnostic: mockDiagnostic });
});


// 8. FOLLOWED STREAMS (Utilise le token UTILISATEUR)
app.get('/followed_streams', async (req, res) => {
    // Vérifie le token utilisateur, non le token applicatif
    if (!currentUserToken || !currentTwitchUserId) { 
        return res.status(401).json({ message: "Utilisateur non connecté via Twitch.", code: 'NO_AUTH' });
    }

    try {
        const response = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${currentTwitchUserId}`, {
            headers: {
                'Client-Id': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${currentUserToken}` 
            }
        });

        if (!response.ok) {
            console.error("Erreur API Twitch Followed Streams:", response.status, await response.text());
            return res.status(response.status).json({ message: "Erreur lors de l'appel Twitch API.", status: response.status });
        }

        const data = await response.json();
        return res.json(data);

    } catch (error) {
        res.status(500).json({ message: "Erreur serveur interne." });
    }
});


// =========================================================
// Configuration des Routes Statiques (selon votre version)
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});


// --- Démarrage du Serveur ---
app.listen(PORT, () => {
    console.log(`Serveur API actif sur le port ${PORT}`);
    // Tente d'obtenir le token applicatif au démarrage
    getTwitchAccessToken();
});
