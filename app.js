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
// (REMPLACEZ CES VALEURS PAR VOS CLÉS)
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET_TWITCH';
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || 'http://localhost:10000/twitch_auth_callback';

// 🚨🚨 VÉRIFIEZ ABSOLUMENT CETTE LIGNE 🚨🚨
// REMPLACEZ 'VOTRE_CLE_API_GEMINI' par votre clé réelle
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_API_GEMINI'; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

const ai = new GoogleGenAI(GEMINI_API_KEY);

// Cache global pour les tokens et les données utilisateur
const CACHE = {
    twitchTokens: {}, // { app: { access_token, expires_at }, user: { ... } }
    twitchUser: null, // { id, login, display_name, access_token, refresh_token }
    lastStreamBoost: 0,
    raidCooldown: new Map(), // Pour gérer le cooldown de l'IA (clé: type d'action)
};

// =========================================================
// --- MIDDLEWARE ---
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser(crypto.randomBytes(32).toString('hex')));
app.use(express.static(path.join(__dirname))); // Pour servir NicheOptimizer.html

// =========================================================
// --- FONCTIONS UTILS TWITCH API ---
// =========================================================

/**
 * Obtient un token d'application Twitch ou le renouvelle si nécessaire.
 * @param {'app'|'user'} type - Le type de token à obtenir.
 */
async function getTwitchToken(type) {
    if (type === 'app' && CACHE.twitchTokens.app && CACHE.twitchTokens.app.expires_at > Date.now()) {
        return CACHE.twitchTokens.app.access_token;
    }
    
    if (type === 'app') {
        const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
        const res = await fetch(url, { method: 'POST' });
        const data = await res.json();
        
        if (data.access_token) {
            CACHE.twitchTokens.app = {
                access_token: data.access_token,
                expires_at: Date.now() + (data.expires_in * 1000) - 60000 // 1 minute de marge
            };
            return data.access_token;
        }
    }
    return null;
}

/**
 * Effectue un appel à l'API Twitch Helix.
 * @param {string} endpoint - L'endpoint Helix (ex: 'users?login=...')
 * @param {string} token - Le token d'accès (user ou app).
 */
async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Accès Twitch non autorisé.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    // 🚨 FIX: Gérer le statut 401/403 pour le token utilisateur
    if (res.status === 401 || res.status === 403) {
        // Invalide le token app si c'est lui qui a échoué
        if (token === CACHE.twitchTokens['app']?.access_token) {
             CACHE.twitchTokens['app'] = null; 
        }
        
        // Si le token qui a échoué est le token utilisateur, lancer une erreur spécifique
        if (token && token === CACHE.twitchUser?.access_token) {
            throw new Error("USER_TOKEN_INVALIDATED"); 
        }
        
        throw new Error("Token Twitch expiré ou invalide. Veuillez réessayer.");
    }
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur lors de l'appel à l'API Twitch: Statut ${res.status}. Détail: ${errorText.substring(0, 50)}...`);
    }

    return res.json();
}

/**
 * Fonction générique pour interroger l'IA Gemini.
 * @param {string} systemInstruction - Instruction système pour le modèle.
 * @param {string} prompt - Le prompt utilisateur.
 */
async function callGemini(systemInstruction, prompt) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'VOTRE_CLE_API_GEMINI') {
        return {
            success: false,
            error: "Clé API Gemini manquante. Veuillez configurer `GEMINI_API_KEY` dans app.js.",
            html_response: `<p style="color:red; text-align:center;">❌ Configuration manquante: Clé API Gemini non définie.</p>`
        };
    }
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
            },
        });

        // Simuler un retour structuré simple pour l'interface client
        const html_response = response.text.replace(/\n/g, '<br>');
        
        return {
            success: true,
            html_response: `<div class="ai-content">${html_response}</div>`,
            status: 200
        };

    } catch (e) {
        console.error("Erreur Gemini:", e);
        return {
            success: false,
            error: `Erreur d'exécution de l'IA: ${e.message}`,
            html_response: `<p style="color:red; text-align:center;">❌ Erreur IA: ${e.message}</p>`,
            status: 500
        };
    }
}


// =========================================================
// --- ROUTES D'AUTHENTIFICATION TWITCH ---
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_auth_state', state, { httpOnly: true, signed: true });
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;

    if (req.signedCookies.twitch_auth_state !== state) {
        return res.status(403).send('Erreur: L\'état CSRF ne correspond pas.');
    }

    try {
        // 1. Échange du code pour le token d'accès utilisateur
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        });
        const tokenData = await tokenRes.json();

        if (tokenData.access_token) {
            const userToken = tokenData.access_token;

            // 2. Récupération des informations de l'utilisateur
            const user = await twitchApiFetch('users', userToken);
            const userData = user.data[0];

            // 3. Stockage des informations dans le cache global (simple session pour cette démo)
            CACHE.twitchUser = {
                id: userData.id,
                login: userData.login,
                display_name: userData.display_name,
                access_token: userToken,
                refresh_token: tokenData.refresh_token,
            };

            res.clearCookie('twitch_auth_state');
            res.redirect('/');
        } else {
            throw new Error(`Échec de l'échange de token: ${tokenData.message || 'Inconnu'}`);
        }
    } catch (error) {
        console.error("Erreur d'authentification:", error);
        res.status(500).send(`Erreur lors de l'authentification Twitch: ${error.message}`);
    }
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser) {
        res.json({
            is_connected: true,
            display_name: CACHE.twitchUser.display_name,
            username: CACHE.twitchUser.login
        });
    } else {
        res.json({ is_connected: false });
    }
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true, message: "Déconnexion réussie." });
});


// =========================================================
// --- ROUTES TWITCH API (DATA) ---
// =========================================================

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
        // 🚨 FIX: Si le token utilisateur a été invalidé par Twitch
        if (e.message === "USER_TOKEN_INVALIDATED") {
            CACHE.twitchUser = null; // Invalide le cache côté serveur
            return res.status(401).json({ 
                success: false, 
                error: "Token utilisateur Twitch expiré ou révoqué. Veuillez vous reconnecter via Twitch.",
                needs_reconnect: true // Flag pour le client
            });
        }
        
        console.error("Erreur lors de la récupération des streams suivis:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/random_raid_target', async (req, res) => {
    const { game_name } = req.query;
    if (!game_name) {
        return res.status(400).json({ success: false, error: "Le paramètre 'game_name' est requis." });
    }
    
    try {
        // 1. Récupérer l'ID du jeu
        const gameSearch = await twitchApiFetch(`games?name=${encodeURIComponent(game_name)}`);
        const game = gameSearch.data[0];
        
        if (!game) {
            return res.status(404).json({ success: false, error: `Jeu non trouvé pour: ${game_name}` });
        }
        
        const gameId = game.id;
        
        // 2. Récupérer les streams du jeu (max 100)
        // Filtrer les gros streamers (plus de 1000 vues) pour cibler les petites niches
        const streamsData = await twitchApiFetch(`streams?game_id=${gameId}&first=100`);
        
        const potentialTargets = streamsData.data.filter(stream => stream.viewer_count > 5 && stream.viewer_count < 1000);
        
        if (potentialTargets.length === 0) {
            return res.status(404).json({ success: false, error: `Aucun streamer de taille moyenne trouvé dans la catégorie ${game_name} pour un raid.` });
        }
        
        // 3. Sélectionner une cible aléatoire
        const randomIndex = Math.floor(Math.random() * potentialTargets.length);
        const target = potentialTargets[randomIndex];
        
        return res.json({ 
            success: true, 
            raid_target: {
                user_login: target.user_login,
                display_name: target.user_name,
                viewer_count: target.viewer_count,
                game_name: target.game_name
            } 
        });

    } catch (error) {
        console.error("Erreur Raid Target:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});


// =========================================================
// --- ROUTES IA (AI CRITIQUE & BOOST) ---
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    
    if (!type || !query) {
        return res.status(400).json({ success: false, error: "Les paramètres 'type' et 'query' sont requis." });
    }
    
    let systemInstruction = "";
    let prompt = "";
    let resultContainerId = "ai-result-box"; 

    switch (type) {
        case 'niche':
            systemInstruction = `Tu es un expert en optimisation de niche Twitch, en ciblage de mots-clés et en stratégie de croissance. Ton but est de fournir une analyse détaillée, structurée en HTML, pour maximiser l'opportunité pour un streamer.
            Rédige la réponse en français. Utilise des listes <ul> avec des emojis. Commence par un titre <h4>.`;
            prompt = `Analyse le jeu ou la niche suivante: ${query}. Donne une critique structurée sur les points suivants: 1. Opportunité (Taille vs Concurrence). 2. Angle de Contenu Unique (Proposition de Valeur). 3. Mots-Clés et Titres suggérés. 4. Plan d'action pour la croissance.`;
            resultContainerId = "niche-result-container"; 
            break;
        
        case 'repurpose':
            systemInstruction = `Tu es un spécialiste du repurposing de contenu vidéo Twitch en format court (TikTok, Shorts). Tu analyses une VOD/chaîne et suggères 3 à 5 moments marquants pour en faire des clips viraux.
            Rédige la réponse en français. Utilise des listes <ul>. Pour chaque suggestion, indique l'heure de début au format (HH:MM:SS). Commence par un titre <h4>.`;
            prompt = `Analyse la chaîne/VOD de ce streamer: ${query}. Donne 5 idées précises de clips courts (TikTok/Shorts) avec le timestamp (HH:MM:SS) idéal pour le début du clip.`;
            resultContainerId = "repurpose-result-container";
            break;

        case 'trend_detector':
            systemInstruction = `Tu es un algorithme de détection de tendances basé sur l'analyse Vue/Streamer (V/S). Ton rôle est d'identifier les jeux ou catégories qui sont sous-diffusés (Low Supply, High Demand).
            Rédige la réponse en français. Utilise une liste <ul>. Ne donne que les jeux spécifiques. Commence par un titre <h4>.`;
            prompt = `Analyse la tendance actuelle du streaming et suggère 5 jeux avec un fort potentiel de croissance (Excellent ratio Vues/Streamer). Pour chaque jeu, décris brièvement pourquoi il est une opportunité.`;
            resultContainerId = "ai-trend-critique-container";
            break;
            
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA inconnu." });
    }

    const aiResult = await callGemini(systemInstruction, prompt);
    
    if (aiResult.success) {
        return res.json({ success: true, html_response: aiResult.html_response, type, resultContainerId });
    } else {
        return res.status(aiResult.status || 500).json(aiResult);
    }
});


app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    const cooldownPeriod = 3 * 60 * 60 * 1000; // 3 heures

    if (Date.now() - CACHE.lastStreamBoost < cooldownPeriod) {
        const remaining = (CACHE.lastStreamBoost + cooldownPeriod) - Date.now();
        const minutes = Math.ceil(remaining / (60 * 1000));
        return res.status(429).json({
            success: false,
            error: `Le Boost IA est en cooldown. Réessayez dans ${minutes} minutes.`,
            html_response: `<p style="color:red; text-align:center;">❌ Cooldown: Le Stream Boost est limité. Réessayez dans ${minutes} minutes.</p>`
        });
    }

    const systemInstruction = `Tu es l'algorithme de recommandation Twitch. Tu vas simuler un 'Boost' de l'algorithme sur le streamer ciblé, en générant un rapport très engageant pour l'utilisateur, comme si les vues et l'engagement étaient temporairement augmentés.
    Rédige la réponse en français. Utilise des titres <h4>. Fournis des métriques simulées concrètes.`;
    
    const prompt = `Génère un rapport de Stream Boost pour la chaîne '${channel}'. Simule les métriques suivantes: 1. Augmentation des vues totale (nombre). 2. Rétention des spectateurs (pourcentage). 3. Engagement du Chat (multiplicateur). Donne des conseils clairs sur ce qui a "déclenché" le boost.`;

    const aiResult = await callGemini(systemInstruction, prompt);

    if (aiResult.success) {
        CACHE.lastStreamBoost = Date.now();
        
        // Simuler des métriques aléatoires pour l'interface
        const metrics = {
            views: `+${(Math.floor(Math.random() * 50) + 20).toString()}k`,
            retention: `${(Math.random() * 15 + 80).toFixed(1)}%`,
            engagement: `x${(Math.random() * 1.5 + 1).toFixed(1)}`,
        };
        
        return res.json({ success: true, html_response: aiResult.html_response, metrics });
    } else {
        return res.status(aiResult.status || 500).json(aiResult);
    }
});


app.post('/auto_action', async (req, res) => {
    const { action_type, query } = req.body;
    
    if (action_type === 'random_raid') {
        // Rediriger vers la nouvelle route GET pour le raid (séparée pour la clarté)
        // L'appel du front gère maintenant directement /random_raid_target
        return res.status(400).json({ 
             success: false, 
             error: "Cette route ne gère plus le raid. Le front-end doit appeler /random_raid_target pour cette action." 
        });
    }

    if (!action_type || !query) {
        return res.status(400).json({ success: false, error: "Les paramètres 'action_type' et 'query' sont requis." });
    }

    let systemInstruction = `Tu es une IA d'action rapide pour le streaming. L'utilisateur a demandé une action de type '${action_type}' pour la cible '${query}'. Fournis une réponse courte mais percutante, formatée en HTML pour l'interface.`;
    let prompt = "";
    
    switch(action_type) {
        case 'export_metrics':
            prompt = `Génère un résumé des métriques et un plan d'action d'urgence pour la chaîne/le jeu '${query}'.`;
            break;
        case 'title_disruption':
            prompt = `Génère 5 titres de stream TRES disruptifs et accrocheurs pour la chaîne/le jeu '${query}'.`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Action automatique non supportée." });
    }

    try {
        const result = await callGemini(systemInstruction, prompt);

        if (result.success) {
             // Simuler des métriques fixes/simples pour l'affichage du rapport
             const metrics = {
                views: `${(Math.floor(Math.random() * 5) + 1).toString()}k`,
                retention: `${(Math.random() * 10 + 70).toFixed(1)}%`,
                engagement: `${(Math.random() * 100 + 50).toFixed(0)}`, 
            };
            
            return res.json({
                success: true,
                html_response: result.html_response,
                metrics: metrics 
            });
        } else {
            // Gère les erreurs de l'IA (429, 500, etc.)
            return res.status(result.status || 500).json(result);
        }

    } catch (error) {
        // Gère toute autre erreur Node.js/Express inattendue et assure un retour JSON
        console.error(`Erreur d'exécution dans /auto_action pour ${req.body?.action_type}:`, error.message);
        return res.status(500).json({
            success: false,
            error: `Erreur interne du serveur lors de l'action: ${error.message}`,
            html_response: `<p style="color:#e34a64; font-weight:bold; text-align:center;">❌ Erreur d'exécution de l'API: ${error.message}</p>`
        });
    }
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

// =========================================================
// DÉMARRAGE DU SERVEUR
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur Node.js démarré sur http://localhost:${PORT}`);
    console.log(`Redirect URI configurée: ${REDIRECT_URI}`);
});
