import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch'; // Maintenu pour la compatibilité avec certains environnements Node.js
import bodyParser from 'body-parser';
import path from 'path';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url'; 
import 'dotenv/config'; // Charge immédiatement les variables .env pour process.env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Configuration des Variables d'Environnement ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
// Clé Gemini pour l'analyse IA
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Modèle pour le grounding (recherche Google)
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

// --- DEBUG : Vérification des clés ---
if (GEMINI_API_KEY) {
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    // Avertissement critique si la clé IA manque
    console.warn("ATTENTION: GEMINI_API_KEY est absente. Le service IA fonctionnera en mode dégradé (sans appels réels).");
}
if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error("FATAL DEBUG: Les clés TWITCH_CLIENT_ID/SECRET sont absentes. L'AUTH Twitch est désactivée.");
}

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// =========================================================
// Fonctions d'Aide (Twitch & Gemini)
// =========================================================

/**
 * Fonction générique pour appeler l'API Twitch Helix.
 * @param {string} endpoint - L'endpoint Helix (ex: 'users').
 * @param {string} token - Jeton d'accès utilisateur (Bearer Token).
 * @param {string} method - Méthode HTTP (GET par défaut).
 * @returns {Promise<object>} - Les données de la réponse Twitch.
 */
async function callTwitchApi(endpoint, token, method = 'GET') {
    if (!TWITCH_CLIENT_ID) {
        throw new Error("Clé client Twitch manquante.");
    }
    const url = `https://api.twitch.tv/helix/${endpoint}`;
    
    const response = await fetch(url, {
        method: method,
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (response.status === 401) {
        throw new Error("Jeton Twitch non valide ou expiré.");
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur API Twitch (${response.status}): ${errorText}`);
    }

    return response.json();
}

/**
 * Récupère l'ID de l'utilisateur associé au jeton.
 * @param {string} token - Jeton d'accès utilisateur.
 * @returns {Promise<string>} - L'ID de l'utilisateur.
 */
async function fetchUserIdFromToken(token) {
    // L'endpoint 'users' sans paramètres retourne les infos de l'utilisateur du token
    const data = await callTwitchApi('users', token);
    if (data.data && data.data.length > 0) {
        return data.data[0].id;
    }
    throw new Error("Impossible d'obtenir l'ID utilisateur à partir du jeton.");
}


// --- Fonctions de Scan (Placeholders mis à jour pour simuler/utiliser la vraie API) ---

async function fetchGameDetailsForScan(query, token) {
    // Dans une vraie application, on ferait un appel à l'API Twitch
    // Helix: games?name=query
    const simulatedData = {
        'valorant': { game_id: '516570', name: 'Valorant', viewer_count_rank: 5 },
        'minecraft': { game_id: '210515', name: 'Minecraft', viewer_count_rank: 2 },
    };
    return simulatedData[query.toLowerCase()] || null;
}

async function fetchUserDetailsForScan(query, token) {
    // Dans une vraie application, on ferait un appel à l'API Twitch
    // Helix: users?login=query
    const simulatedData = {
        'zerator': { user_id: '123456', display_name: 'ZeratoR', followers: '3.5M', latest_game: 'Just Chatting' },
        'gotaga': { user_id: '789012', display_name: 'Gotaga', followers: '4.2M', latest_game: 'Call of Duty' },
    };
    return simulatedData[query.toLowerCase()] || null;
}

/**
 * Appelle l'API Gemini avec la recherche Google (grounding)
 * @param {string} systemPrompt - Instruction du système pour le rôle de l'IA.
 * @param {string} userQuery - La requête spécifique de l'utilisateur.
 * @returns {Promise<string>} - Le texte généré par l'IA ou un message d'erreur.
 */
async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) {
        return "Erreur: La clé API Gemini est absente. Le service IA est désactivé.";
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    // Configuration pour le grounding (recherche Google)
    const tools = [{ "google_search": {} }];
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: tools,
    };

    let lastError = null;
    const maxRetries = 3;
    let delay = 1000; // 1 seconde de délai initial

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    return text; // Succès
                }
                lastError = "Réponse IA vide ou mal formée.";
            } else {
                lastError = `Erreur API Google (${response.status}): ${response.statusText}`;
            }
        } catch (e) {
            lastError = `Erreur réseau/fetch: ${e.message}`;
        }

        if (attempt < maxRetries - 1) {
            console.log(`Tentative ${attempt + 1} échouée. Nouvelle tentative dans ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Délai exponentiel
        }
    }

    return `Erreur critique après ${maxRetries} tentatives: ${lastError}`;
}


// =========================================================
// Routes d'Authentification Twitch (NON MODIFIÉES)
// =========================================================

// 1. Démarrer le processus d'authentification (Côté client appelle cette route)
app.get('/twitch_auth_start', (req, res) => {
    if (!TWITCH_CLIENT_ID || !REDIRECT_URI) {
        return res.status(500).send("Erreur: TWITCH_CLIENT_ID ou REDIRECT_URI manquants dans les variables d'environnement.");
    }

    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('twitch_auth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

    const scope = [
        'user:read:follows', 
        'user:read:email'   
    ].join(' ');

    const authUrl = `https://id.twitch.tv/oauth2/authorize` +
        `?response_type=code` +
        `&client_id=${TWITCH_CLIENT_ID}` +
        `&redirect_uri=${REDIRECT_URI}` +
        `&scope=${scope}` +
        `&state=${state}`;

    res.redirect(authUrl);
});

// 2. Route de retour de Twitch (Callback)
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    const storedState = req.cookies.twitch_auth_state;

    res.clearCookie('twitch_auth_state');

    if (error) {
        console.error("Erreur de connexion Twitch:", error);
        return res.redirect('/NicheOptimizer.html?auth_status=error&message=Connexion refusée par l\'utilisateur.');
    }

    if (!state || state !== storedState) {
        console.error("Erreur CSRF: L'état de la requête ne correspond pas au cookie.");
        return res.redirect('/NicheOptimizer.html?auth_status=error&message=Erreur de sécurité (CSRF).');
    }

    if (!code) {
        return res.redirect('/NicheOptimizer.html?auth_status=error&message=Code d\'autorisation manquant.');
    }

    const tokenUrl = 'https://id.twitch.tv/oauth2/token';
    const tokenPayload = {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
    };

    try {
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            body: new URLSearchParams(tokenPayload),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Échec de l\'échange de jeton:', errorText);
            return res.redirect(`/NicheOptimizer.html?auth_status=error&message=Échec de l'échange de jeton: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (accessToken) {
            // Stocker le jeton d'accès dans un cookie sécurisé
            res.cookie('twitch_access_token', accessToken, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production', 
                maxAge: tokenData.expires_in * 1000 // Durée de vie du jeton
            });

            return res.redirect('/NicheOptimizer.html?auth_status=success');
        } else {
            return res.redirect('/NicheOptimizer.html?auth_status=error&message=Jeton d\'accès non reçu.');
        }

    } catch (e) {
        console.error("Erreur réseau/serveur lors de l'échange de jeton:", e);
        return res.redirect('/NicheOptimizer.html?auth_status=error&message=Erreur interne du serveur.');
    }
});


// =========================================================
// Route Critique IA (API INTERNE) (NON MODIFIÉE, sauf pour les commentaires)
// =========================================================

app.post('/critique_ia', async (req, res) => {
    // 1. Gérer la Détection de Tendances
    if (req.body.type === 'trend') {
        console.log("INFO: Lancement de l'analyse de détection de tendances IA...");
        
        const systemPrompt = `
            Vous êtes un analyste expert des tendances de streaming et du "Meta-Jeu" de Twitch. 
            Votre objectif est de fournir une analyse percutante et exploitable pour un streamer.
            
            1. Utilisez OBLIGATOIREMENT la recherche Google (grounding) pour obtenir les données les plus récentes.
            2. Identifiez 3 niches ou jeux émergents (en forte croissance mais avec une concurrence gérable).
            3. Proposez une stratégie de contenu concrète pour un streamer pour exploiter l'une de ces tendances.
            4. Formattez la réponse EN FRANÇAIS en HTML, en utilisant des balises pour structurer l'information, en gras pour les titres et en utilisant des listes (ul/li) pour les points clés. N'utilisez PAS de Markdown ni de balise <html>/<body>.
            5. Utilisez des couleurs sombres pour le fond et des couleurs vives (comme le jaune ou le vert) pour accentuer les informations importantes (Hex codes comme #ffcc00 ou #59d682).
        `;
        
        const userQuery = "Quelles sont les trois tendances actuelles sur Twitch (jeux ou catégories) qui montrent une forte croissance et une opportunité pour les petits streamers, et donnez une stratégie d'exploitation concrète.";

        try {
            const rawResponse = await callGeminiApi(systemPrompt, userQuery);
            
            // Le résultat est déjà formaté en HTML par l'IA
            const htmlCritique = rawResponse; 
            
            return res.json({
                type: "trend_analysis",
                html_critique: htmlCritique
            });

        } catch (error) {
            console.error("Erreur lors de l'appel Gemini pour les tendances:", error);
            return res.status(500).json({
                error: "Erreur interne du service IA lors de l'analyse des tendances."
            });
        }
    }
    
    // 2. Gérer le Scan de Niche/Streamer (Logique existante)
    const query = req.body.query;
    if (!query) {
        return res.status(400).json({ error: "Le paramètre 'query' est manquant." });
    }

    const token = req.cookies.twitch_access_token || "SIMULATED_TWITCH_TOKEN"; 

    // --- ÉTAPE 1: Tenter un scan de JEU (Simulé) ---
    const gameData = await fetchGameDetailsForScan(query, token);

    if (gameData) {
        // Si le jeu est trouvé
        return res.json({
            type: "game",
            game_data: gameData,
            html_critique: `<h4 style="color:#59d682;">Analyse de Jeu: ${gameData.name}</h4><p>Le jeu <b>${gameData.name}</b> a été identifié. Il se classe au <b>Top ${gameData.viewer_count_rank}</b> des jeux les plus regardés. L'IA analyserait la concurrence et le potentiel de niche ici. (TODO: Implémenter l'analyse IA détaillée du jeu.)</p>`
        });
    } else {
        // --- ÉTAPE 2: Si aucun jeu trouvé, tenter un scan d'UTILISATEUR (Simulé) ---
        const userData = await fetchUserDetailsForScan(query, token);
        
        if (userData) {
            // Si l'utilisateur est trouvé
            return res.json({
                type: "user",
                user_data: userData,
                html_critique: `<h4 style="color:#59d682;">Analyse de Streamer: ${userData.display_name}</h4><p>Le streamer <b>${userData.display_name}</b> (Suiveurs: ${userData.followers}) a été trouvé. Il streamait récemment sur <b>${userData.latest_game}</b>. L'IA analyserait les forces/faiblesses et le contenu optimal ici. (TODO: Implémenter l'analyse IA détaillée du streamer.)</p>`
        });
        } else {
            // Aucun résultat trouvé ni comme jeu, ni comme utilisateur
            return res.json({ 
                type: "none", 
                html_critique: `<h4 style="color:red;">Aucun Résultat</h4><p>Aucun résultat trouvé pour la requête '${query}' comme jeu ou utilisateur.</p>`
            });
        }
    }
});

// =========================================================
// Route Critique : Fil Suivi (MAINTENANT IMPLÉMENTÉE)
// =========================================================
app.get('/followed_streams', async (req, res) => {
    const token = req.cookies.twitch_access_token;
    
    if (!token) {
        // Renvoie 401 pour forcer le frontend à demander la connexion
        return res.status(401).json({ 
            error: "Jeton d'accès utilisateur Twitch manquant. Veuillez vous connecter." 
        });
    }

    try {
        // 1. Obtenir l'ID utilisateur à partir du jeton
        const userId = await fetchUserIdFromToken(token);

        // 2. Obtenir les streams suivis
        // Doc Twitch: streams/followed?user_id=
        const streamsData = await callTwitchApi(`streams/followed?user_id=${userId}`, token);
        
        // 3. Traiter les données (on ne renvoie que ce dont le frontend a besoin)
        const simplifiedStreams = streamsData.data.map(stream => ({
            id: stream.id,
            user_name: stream.user_name,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
        }));
        
        return res.json({ 
            user_id: userId,
            streams: simplifiedStreams 
        });

    } catch (e) {
        console.error("Erreur lors de la récupération du fil suivi:", e.message);
        // Important: si l'erreur est liée au jeton (401), on renvoie 401 pour forcer la déconnexion
        if (e.message.includes("Jeton Twitch non valide") || e.message.includes("401")) {
            // Effacer le cookie non valide et demander une nouvelle authentification
            res.clearCookie('twitch_access_token');
            return res.status(401).json({ error: "Jeton Twitch expiré ou non valide. Veuillez vous reconnecter." });
        }
        return res.status(500).json({ 
            error: `Erreur interne du serveur lors de l'appel Twitch: ${e.message}`
        });
    }
});


// =========================================================
// Configuration des Routes Statiques (NON MODIFIÉES)
// =========================================================

// Route racine
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Routes pour les autres fichiers HTML
app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/lucky_streamer_picker.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lucky_streamer_picker.html'));
});

app.get('/sniper_tool.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'sniper_tool.html'));
});

// =========================================================
// Démarrage du Serveur (NON MODIFIÉ)
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur Express démarré sur le port ${PORT}`);
});
