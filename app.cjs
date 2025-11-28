const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // NOTE: Ceci doit être présent pour Node < 18
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require("firebase-admin"); 

const { GoogleGenAI } = require("@google/genai"); // Utilisation du SDK officiel Google
const app = express();

// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const TWITCH_SCOPE = 'user:read:follows user:read:email';

// Configuration Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash"; 

if (GEMINI_API_KEY) {
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    console.error("FATAL DEBUG: GEMINI_API_KEY est absente ou vide. L'IA est INACTIVE.");
}

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;


// --- Initialisation Firebase Admin SDK (Simulée) ---
// *****************************************************************
// REMARQUE: Les identifiants Firebase ne sont pas inclus.
// La logique de session/tokens est basée sur des variables in-memory
// pour la simplicité de l'exemple et DOIT être remplacée par 
// une solution de BDD réelle (comme Firebase Firestore) en production.
// *****************************************************************
let userTokens = {}; // { userId: { accessToken, refreshToken, expiry } }
let currentUserId = 'simulatedUserId123';
let currentUserName = 'Guest'; 
let currentTwitchToken = 'simulatedToken'; // Token fictif pour les appels Twitch

// --- Logique Boost (File d'attente) ---
let boostQueue = [];
let isBoosting = false;
const BOOST_DURATION_MS = 60 * 1000; // 1 minute de "boost"

function processBoostQueue() {
    if (isBoosting || boostQueue.length === 0) {
        return;
    }

    isBoosting = true;
    const nextBoost = boostQueue.shift();
    console.log(`[BOOST] Démarrage du boost pour la chaîne: ${nextBoost.channelName}`);

    // Ici, vous lanceriez la logique de boost réelle (ex: alerte, promotion...)

    // Simuler la durée du boost
    setTimeout(() => {
        isBoosting = false;
        console.log(`[BOOST] Fin du boost pour la chaîne: ${nextBoost.channelName}`);
        // Passer au suivant dans la file (récursif)
        processBoostQueue(); 
    }, BOOST_DURATION_MS);
}


// --- Middlewares ---
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


// =========================================================
// Fonction d'aide pour l'API Twitch
// =========================================================

async function twitchFetch(endpoint, token) {
    if (!token) {
        console.error("Erreur: Token Twitch manquant pour l'appel API.");
        return null;
    }

    const url = `https://api.twitch.tv/helix/${endpoint}`;
    try {
        const response = await fetch(url, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            console.error("Token expiré ou invalide.");
            // Logique de rafraîchissement du token ici...
            return null;
        }

        if (!response.ok) {
            console.error(`Erreur Twitch API (${response.status}): ${endpoint}`);
            const errorBody = await response.text();
            console.error("Détails:", errorBody);
            return null;
        }

        return response.json();
    } catch (error) {
        console.error("Erreur lors de la requête Twitch:", error.message);
        return null;
    }
}

// Fonction pour récupérer les détails d'un utilisateur (pour les avatars)
async function fetchUserDetails(userIds, token) {
    if (userIds.length === 0) return {};
    const userIdsQuery = userIds.map(id => `id=${id}`).join('&');
    const userDetails = await twitchFetch(`users?${userIdsQuery}`, token);
    
    if (userDetails && userDetails.data) {
        return userDetails.data.reduce((map, user) => {
            map[user.id] = user;
            return map;
        }, {});
    }
    return {};
}

// Fonction pour récupérer les détails d'un utilisateur par login (pour le scan)
async function fetchUserDetailsForScan(login, token) {
    const userData = await twitchFetch(`users?login=${login}`, token);
    
    if (userData && userData.data && userData.data.length > 0) {
        const u = userData.data[0];
        return {
            login: u.login,
            display_name: u.display_name,
            profile_image_url: u.profile_image_url,
            description: u.description || "Pas de description fournie.",
            followers: "N/A", // Ces données nécessitent d'autres appels API ou des scopes différents
            total_views: "N/A"
        };
    }
    return null;
}


// =========================================================
// Logique IA Gemini (Critique, Repurposing, Trend)
// =========================================================

async function generateAICritique(prompt, type) {
    if (!ai) return { error: "Service Gemini non configuré." };

    console.log(`[IA] Lancement de l'analyse pour le type: ${type}`);

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                // Vous pouvez ajouter des configurations ici (température, max_output_tokens...)
                systemInstruction: "Vous êtes un expert en marketing de streaming et d'optimisation de niche sur Twitch. Répondez de manière structurée, claire et utilisez le format Markdown pour une meilleure lisibilité. Utilisez des titres (#), des listes (*) et du **gras**."
            }
        });
        
        const result = response.candidates?.[0]?.content?.parts?.[0] || {};
        
        // --- GESTION DE L'ERREUR 500 DEMANDÉE ---
        if (!result.text || result.text.trim().length === 0) {
            console.error("[IA CRITIQUE] Réponse Gemini vide ou inattendue:", JSON.stringify(response));
            return { error: "Réponse API Gemini vide ou inattendue. Veuillez réessayer." };
        }
        
        return { markdown_critique: result.text.trim() };

    } catch (error) {
        console.error(`Erreur Gemini pour le type ${type}:`, error.message);
        return { error: `Erreur lors de la génération de la critique par l'IA: ${error.message}` };
    }
}


// =========================================================
// Routes Twitch OAuth
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${TWITCH_SCOPE}&state=${state}`;
    res.redirect(authUrl);
});

// ... (Le reste des routes OAuth et d'échange de tokens reste inchangé) ...

// =========================================================
// Route 1: Statut Utilisateur
// =========================================================
app.get('/twitch_user_status', async (req, res) => {
    // Dans un système réel, on vérifierait le token en BDD
    if (currentTwitchToken === 'simulatedToken') {
        return res.json({ is_connected: false });
    }
    
    // Simulation d'une connexion réussie pour les tests
    return res.json({ 
        is_connected: true, 
        username: currentUserName,
        userId: currentUserId
    });
});

// =========================================================
// Route 2: Fil de Streams Suivis (/followed_streams)
// =========================================================
app.get('/followed_streams', async (req, res) => {
    const token = currentTwitchToken; 
    const userId = currentUserId; 

    if (!token || token === 'simulatedToken') {
        return res.status(401).json({ error: "Utilisateur non authentifié." });
    }

    // 1. Obtenir les chaînes suivies et leurs streams LIVE
    const liveStreamsData = await twitchFetch(`streams/followed?user_id=${userId}&first=20`, token);
    
    if (!liveStreamsData) {
        return res.status(500).json({ error: "Erreur lors de la récupération des streams suivis." });
    }
    
    const liveStreams = liveStreamsData.data || [];
    
    // 2. Récupérer les détails des utilisateurs (pour les avatars)
    const streamerIds = liveStreams.map(stream => stream.user_id);
    const userDetailsMap = await fetchUserDetails(streamerIds, token);
    
    // 3. Fusion des données
    const enhancedStreams = liveStreams.map(stream => ({
        // Conservation de toutes les propriétés originales, y compris user_login
        ...stream, 
        // Ajout de la propriété profile_image_url
        profile_image_url: userDetailsMap[stream.user_id]?.profile_image_url || 'https://static-cdn.jtvnw.net/jtv_user_pictures/default_profile.png'
    }));
    
    return res.json({ data: enhancedStreams });
});

// =========================================================
// Route 3: Scan Cible (/scan_target)
// =========================================================
app.post('/scan_target', async (req, res) => {
    const token = currentTwitchToken; 
    const { target } = req.body;
    const query = target.toLowerCase().trim();

    if (!token || token === 'simulatedToken') {
        return res.status(401).json({ error: "Utilisateur non authentifié." });
    }
    if (!query) {
        return res.status(400).json({ error: "Requête de scan manquante." });
    }

    // --- ÉTAPE 1: Tenter un scan de JEU ---
    const gameStreamsData = await twitchFetch(`streams?game_id=${query}&first=100`, token);

    if (gameStreamsData && gameStreamsData.data && gameStreamsData.data.length > 0) {
        // Obtenir le nom réel du jeu (car la recherche se fait par ID ou nom)
        // Ceci est une simplification. Dans un vrai cas, il faudrait l'ID du jeu.
        const gameName = gameStreamsData.data[0]?.game_name || target;

        return res.json({
            type: "game",
            streams: gameStreamsData.data.map(s => ({
                user_name: s.user_login, // Login name (pour le lecteur)
                display_name: s.user_name, // Display name (pour l'affichage)
                viewer_count: s.viewer_count,
                game_name: gameName,
                thumbnail_url: s.thumbnail_url 
            }))
        });

    } else {
        // --- ÉTAPE 2: Si aucun jeu trouvé, tenter un scan d'UTILISATEUR ---\r\n
        const userData = await fetchUserDetailsForScan(query, token);
        
        if (userData) {
            // Si l'utilisateur est trouvé
            return res.json({
                type: "user",
                user_data: userData
            });
        } else {
            // Aucun résultat trouvé ni comme jeu, ni comme utilisateur
            return res.json({ 
                type: "none", 
                message: `Aucun résultat trouvé pour la requête '${target}' comme jeu ou utilisateur.` 
            });
        }
    }
});


// =========================================================
// Route 4: Route IA Critique (/critique_ia)
// =========================================================
app.post('/critique_ia', async (req, res) => {
    const { game, channel, type } = req.body;
    let prompt = "";

    if (!ai) {
        return res.status(503).json({ error: "Service Gemini non disponible." });
    }

    // Définition du prompt en fonction du type de critique
    if (type === 'niche' && game) {
        prompt = `Faites une analyse détaillée de la niche du jeu '${game}' sur Twitch. Fournissez des conseils stratégiques (5 points minimum) pour un petit streamer qui voudrait percer dans cette catégorie en se basant sur le volume de streams vs. le nombre de spectateurs.`;
    } else if (type === 'repurpose' && channel) {
        prompt = `Créez un plan de 'repurposing' (réutilisation de contenu) pour le streamer '${channel}'. Listez les 3 meilleurs types de contenu courts (TikTok, YouTube Shorts) à tirer de ses VODs, et donnez 3 idées de titres accrocheurs pour chacun de ces contenus.`;
    } else if (type === 'trend') {
        prompt = `Identifiez la prochaine grande tendance de streaming sur Twitch, en dehors des 5 jeux les plus populaires actuels. Justifiez votre choix et donnez 5 arguments clés pour un streamer qui se lancerait immédiatement dans cette nouvelle niche.`;
    } else {
        return res.status(400).json({ error: "Paramètres de critique IA manquants ou incorrects." });
    }

    const result = await generateAICritique(prompt, type);

    if (result.error) {
        // Retourne le statut 500 si Gemini a retourné une erreur (y compris 'Réponse API Gemini vide ou inattendue.')
        return res.status(500).json({ error: result.error });
    }
    
    // Retourne le contenu en Markdown
    return res.json({ markdown_critique: result.markdown_critique });
});

// =========================================================
// Route 5: Boost Stream (File d'attente)
// =========================================================
app.post('/boost', async (req, res) => {
    const { channelName } = req.body;

    if (!channelName) {
        return res.status(400).json({ error: "Nom de la chaîne à booster manquant." });
    }

    // Vérifie si la chaîne est déjà en cours de boost ou en file d'attente
    const isAlreadyQueued = boostQueue.some(boost => boost.channelName.toLowerCase() === channelName.toLowerCase());
    
    if (isBoosting && boostQueue[0]?.channelName.toLowerCase() === channelName.toLowerCase()) {
        return res.status(202).json({ message: "La chaîne est déjà en cours de boost." });
    }
    if (isAlreadyQueued) {
        return res.status(202).json({ message: "La chaîne est déjà dans la file d'attente." });
    }

    // Ajout à la file d'attente
    boostQueue.push({ 
        channelName: channelName, 
        timestamp: Date.now() 
    });

    // Lancement du traitement si la file était vide et qu'aucun boost n'est en cours
    processBoostQueue(); 

    return res.json({ 
        message: `La chaîne '${channelName}' a été ajoutée à la file d'attente. Position: ${boostQueue.length}`,
        queue_size: boostQueue.length 
    });
});


// =========================================================
// Configuration des Routes Statiques
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// ... (Les autres routes statiques non pertinentes sont omises pour la concision) ...

// =========================================================
// Démarrage du Serveur
// =========================================================
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});









