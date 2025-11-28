const express = require('express');
const fetch = require('node-fetch'); // Pour les requêtes HTTP externes (API Twitch)
const crypto = require('crypto');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();

// --- Configuration des Variables d'Environnement ---
// Render fournit le port via process.env.PORT
const PORT = process.env.PORT || 3000; 

// Variables d'environnement critiques (DOIVENT être définies sur Render)
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI; 
// Ex: https://justplayerstreamhubpro.onrender.com/twitch_auth_callback

// --- Stockage d'État (Simplifié pour Démo) ---
// En production, cette information doit être stockée dans une session sécurisée ou une DB.
let currentUserToken = null;
let currentUsername = null; 
let currentTwitchUserId = null; 
// ------------------------------------------------

// --- Middleware ---
app.use(cookieParser()); // Pour gérer les cookies
app.use(express.json()); // Pour analyser les corps de requête JSON (pour les routes POST IA/Boost)

// Servir les fichiers statiques (votre index.html, script.js, style.css doivent être dans 'public')
app.use(express.static(path.join(__dirname, 'public'))); 

// --- ROUTES D'AUTHENTIFICATION TWITCH (CORRECTION du 404) ---

/**
 * 🔑 Étape 1: Démarrage de l'Authentification (GET /twitch_auth_start)
 * Redirige l'utilisateur vers le formulaire de connexion de Twitch.
 */
app.get('/twitch_auth_start', (req, res) => {
    if (!CLIENT_ID || !REDIRECT_URI) {
        return res.status(500).send("Configuration du service Twitch manquante sur le serveur.");
    }
    
    // Scopes (permissions) requises : lire les abonnements (read:follows) est essentiel
    const scopes = 'user:read:follows viewing_activity_read';
    const state = crypto.randomBytes(16).toString('hex');
    
    // Stocker le 'state' dans un cookie pour la vérification de sécurité au retour
    res.cookie('oauth_state', state, { httpOnly: true, maxAge: 600000 }); // 10 minutes

    const twitchAuthURL = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${scopes}&state=${state}`;
    
    console.log("Démarrage OAuth, redirection vers Twitch...");
    res.redirect(twitchAuthURL);
});

/**
 * 🔑 Étape 2: Callback de Twitch et Échange de Code contre Token (GET /twitch_auth_callback)
 * Twitch renvoie l'utilisateur ici après l'autorisation.
 */
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    // 1. Vérification du 'state' pour la sécurité CSRF
    // const expectedState = req.cookies.oauth_state;
    // if (state !== expectedState) {
    //     return res.redirect(`/?error=${encodeURIComponent('Erreur de sécurité (CSRF).')}`);
    // }
    // res.clearCookie('oauth_state'); // Supprimer le cookie de state

    if (error) {
        console.error(`Erreur d'autorisation Twitch: ${error_description}`);
        return res.redirect(`/?error=${encodeURIComponent('Connexion Twitch refusée.')}`);
    }

    if (!code) {
        return res.redirect(`/?error=${encodeURIComponent('Code d\'autorisation manquant.')}`);
    }

    try {
        // 2. Appel POST pour échanger le code contre un Access Token
        const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
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

        // 3. Token récupéré : Stockage temporaire et récupération des infos utilisateur
        currentUserToken = tokenData.access_token;

        // 🌟 Étape supplémentaire : Récupérer l'ID et le nom de l'utilisateur
        const userResponse = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${currentUserToken}`,
                'Client-Id': CLIENT_ID
            }
        });
        const userData = await userResponse.json();
        
        if (userData.data && userData.data.length > 0) {
            currentUsername = userData.data[0].display_name;
            currentTwitchUserId = userData.data[0].id;
            console.log(`Utilisateur connecté: ${currentUsername} (ID: ${currentTwitchUserId})`);
        }

        // 4. Redirection vers la page principale
        return res.redirect('/'); 

    } catch (error) {
        console.error("Erreur critique lors du callback Twitch:", error);
        return res.redirect(`/?error=${encodeURIComponent('Erreur serveur lors de la connexion Twitch.')}`);
    }
});

/**
 * 🔑 Route de Déconnexion (GET /twitch_logout)
 * Nettoie le token stocké et réinitialise l'état.
 */
app.get('/twitch_logout', (req, res) => {
    currentUserToken = null;
    currentUsername = null;
    currentTwitchUserId = null;
    res.redirect('/');
});


/**
 * 🔑 Route pour vérifier le statut de connexion (GET /twitch_user_status)
 * Utilisé par le frontend pour mettre à jour l'UI au chargement.
 */
app.get('/twitch_user_status', (req, res) => {
    res.json({
        is_connected: !!currentUserToken,
        username: currentUsername
    });
});


/**
 * 🔴 Route /followed_streams (CORRECTION du 401)
 * Exemple d'utilisation du token pour appeler l'API Twitch Helix.
 */
app.get('/followed_streams', async (req, res) => {
    if (!currentUserToken || !currentTwitchUserId) {
        // Si aucun token n'est disponible, on renvoie une 401
        return res.status(401).json({ message: "Utilisateur non connecté ou token manquant.", code: 'NO_AUTH' });
    }

    try {
        const response = await fetch(`https://api.twitch.tv/helix/streams/followed?user_id=${currentTwitchUserId}`, {
            headers: {
                'Client-Id': CLIENT_ID,
                'Authorization': `Bearer ${currentUserToken}` // Le token utilisateur est ici
            }
        });

        if (!response.ok) {
            console.error("Erreur API Twitch Followed Streams:", response.status, await response.text());
            return res.status(response.status).json({ message: "Erreur lors de l'appel Twitch API.", status: response.status });
        }

        const data = await response.json();
        return res.json(data);

    } catch (error) {
        console.error("Erreur réseau /followed_streams:", error);
        res.status(500).json({ message: "Erreur serveur interne." });
    }
});


// --- VOS AUTRES ROUTES (Exemples pour /random et /critique_ia) ---

// *********** NOTE IMPORTANTE ************
// Ces routes sont des simulacres (placeholders) et dépendent de votre logique
// métier pour le scan, le boost et les appels IA. Vous devez les implémenter
// pour qu'elles fonctionnent réellement. Elles renvoient juste des succès pour l'instant.
// ****************************************

/**
 * GET /random: Simule la recherche d'un streamer avec un filtre de 30 viewers max.
 */
app.get('/random', (req, res) => {
    // ⚠️ Remplacez ceci par votre vraie logique de recherche de streamer sur Twitch
    const maxViewers = req.query.max_viewers || 30; 
    console.log(`Recherche d'un streamer avec max_viewers=${maxViewers}`);

    // Retourne des données simulées
    const mockStreamer = {
        username: 'JustPlayerStream',
        user_login: 'justplayerstream',
        title: 'Je teste un nouvel outil de boost IA pour petit streamer !',
        game_name: 'Elden Ring',
        viewer_count: Math.floor(Math.random() * 25) + 5,
        follower_count: 1500,
        avg_score: (Math.random() * 1.5 + 3.5).toFixed(1),
        tags: ['FR', 'SmallStreamer', 'Chill']
    };

    res.json({ streamer: mockStreamer });
});

/**
 * POST /boost: Simule l'envoi d'une requête de boost.
 */
app.post('/boost', (req, res) => {
    const { channelName } = req.body;
    // ⚠️ Remplacez ceci par votre vraie logique de boost (ex: envoi à un service tiers)
    console.log(`Requête de boost reçue pour: ${channelName}`);
    res.json({ status: 'ok', message: `Le boost a été initié pour ${channelName}. Vous devriez recevoir un spectateur dans les 60 secondes.` });
});

/**
 * POST /critique_ia: Simule l'appel à l'API Gemini pour la critique.
 */
app.post('/critique_ia', async (req, res) => {
    const { username, game_name, title } = req.body;
    
    // ⚠️ REMPLACER PAR VOTRE LOGIQUE D'APPEL À L'API GEMINI
    const mockCritique = `
    **Analyse IA pour ${username} :**
    
    **Points Positifs :**
    * Le titre "${title}" est engageant et crée de la curiosité.
    * Le choix du jeu (${game_name}) est populaire, mais la niche des "petits streamers" est concurrentielle.
    
    **Suggestions d'Amélioration :**
    * Ajoutez une webcam ou une interaction vocale claire.
    * Utilisez plus de tags spécifiques au gameplay pour améliorer le référencement.
    * Essayez d'utiliser des couleurs plus vibrantes sur votre overlay.
    `;
    
    // Simuler un temps de réponse de l'IA
    await new Promise(resolve => setTimeout(resolve, 1500)); 

    res.json({ critique: mockCritique });
});

/**
 * Gestion de la route par défaut (index.html)
 */
app.get('/', (req, res) => {
    // Ceci s'assure que si l'utilisateur va sur la racine, il reçoit le HTML
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Démarrage du Serveur ---
app.listen(PORT, () => {
    console.log(`\n🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`🌐 URL de base : http://localhost:${PORT}`);
    console.log(`🔑 Redirect URI : ${REDIRECT_URI}\n`);
});
