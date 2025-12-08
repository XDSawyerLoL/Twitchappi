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

const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
const JWT_SECRET = 'super_secret_key_streamer_hub'; // Clé secrète pour les cookies
const TOKEN_EXPIRY = 3600; // Durée de validité du token Twitch en secondes (1 heure)

// Stockage en mémoire des tokens pour l'exemple
// En production, utilisez une base de données (Redis, MongoDB, etc.)
const userSessions = {}; 

// =========================================================
// --- MIDDLEWARES ---
// =========================================================

app.use(cors()); // Permet les requêtes cross-origin (utile pour le développement)
app.use(bodyParser.json());
app.use(cookieParser(JWT_SECRET)); // Utilise le cookie-parser avec la clé secrète

// =========================================================
// --- UTILS API TWITCH ---
// =========================================================

/**
 * Fonction utilitaire pour fetch l'API Twitch (Helix).
 */
async function twitchApiFetch(endpoint, method = 'GET', body = null) {
    const url = `${TWITCH_API_BASE}/${endpoint}`;
    
    // Pour les endpoints qui ne nécessitent pas de token utilisateur (comme la recherche de jeux/streams),
    // on utilise le "App Access Token" pour l'authentification.
    let appAccessToken = await getAppAccessToken(); 

    const options = {
        method,
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${appAccessToken}`,
            'Content-Type': 'application/json'
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    // Gère le cas où le token expire
    if (response.status === 401 && appAccessToken !== 'FALLBACK') {
        console.log("Token App Access expiré, tentative de re-génération...");
        appAccessToken = await getAppAccessToken(true); // Forcer la re-génération
        options.headers['Authorization'] = `Bearer ${appAccessToken}`;
        const secondResponse = await fetch(url, options);
        return secondResponse.json();
    }
    
    return response.json();
}

/**
 * Récupère le App Access Token (stocké globalement ou régénéré)
 * En production, cette logique devrait être beaucoup plus robuste (stockage sécurisé, expiration).
 */
let appTokenCache = { token: null, expiry: 0 };
async function getAppAccessToken(forceRefresh = false) {
    if (appTokenCache.token && appTokenCache.expiry > Date.now() + 60000 && !forceRefresh) {
        return appTokenCache.token;
    }

    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (data.access_token) {
            appTokenCache = {
                token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000)
            };
            return data.access_token;
        } else {
            console.error("Erreur lors de la récupération du App Access Token:", data);
            return 'FALLBACK';
        }
    } catch (error) {
        console.error("Erreur réseau pour le App Access Token:", error);
        return 'FALLBACK';
    }
}


// =========================================================
// --- UTILS GEMINI (IA) ---
// =========================================================

const ai = new GoogleGenAI(GEMINI_API_KEY);

/**
 * Exécute l'analyse IA avec Gemini.
 * @param {string} prompt - Le prompt à envoyer à l'IA.
 * @returns {object} { success: boolean, html_response: string, error: string }
 */
async function runGeminiAnalysis(prompt) {
    if (GEMINI_API_KEY === 'VOTRE_CLE_API_GEMINI' || !GEMINI_API_KEY) {
        return {
            success: false,
            status: 503,
            error: "Clé API Gemini non configurée.",
            html_response: "<p style='color:red; text-align:center;'>❌ ERREUR: La clé API Gemini n'est pas configurée dans le fichier app.js.</p>"
        };
    }

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const html_response = response.text.trim();
        
        // Vérification basique pour s'assurer que l'IA a répondu en HTML
        if (html_response.startsWith('<') && html_response.endsWith('>')) {
            return { success: true, html_response };
        } else {
             // Si le résultat n'est pas du HTML, l'encapsuler pour l'affichage
             const encapsulated_response = `<div class="ai-content"><p>${html_response}</p></div>`;
             return { success: true, html_response: encapsulated_response };
        }

    } catch (error) {
        console.error("Erreur lors de l'appel à l'API Gemini:", error);
        if (error.status === 429) {
            return {
                success: false,
                status: 429,
                error: "Limite de taux (Rate Limit) atteinte.",
                html_response: "<p style='color:red; text-align:center;'>❌ L'API IA a atteint sa limite de requêtes (429). Réessayez dans une minute.</p>"
            };
        }
        return { 
            success: false, 
            status: 500,
            error: error.message, 
            html_response: `<p style='color:red; text-align:center;'>❌ Erreur de l'API IA: ${error.message}</p>`
        };
    }
}


// =========================================================
// --- ROUTES D'AUTHENTIFICATION TWITCH ---
// =========================================================

// 1. Démarrage de l'authentification
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = 'user:read:follows'; // Scope pour lire le fil suivi
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    
    // Stocke l'état dans un cookie sécurisé
    res.cookie('twitch_auth_state', state, { httpOnly: true, signed: true, maxAge: 900000 }); // 15 min
    res.redirect(url);
});

// 2. Callback (Récupération du token utilisateur)
app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).send(`Erreur d'authentification: ${error}`);
    }

    const savedState = req.signedCookies.twitch_auth_state;
    if (state !== savedState) {
        return res.status(403).send('Erreur de sécurité: État CSRF invalide.');
    }
    
    // Échange du code contre un token d'accès
    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
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
        
        const tokenData = await tokenRes.json();

        if (tokenData.access_token) {
            const userRes = await fetch(`${TWITCH_API_BASE}/users`, {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${tokenData.access_token}`
                }
            });
            const userData = await userRes.json();
            const user = userData.data[0];

            if (user) {
                const sessionId = user.id;
                userSessions[sessionId] = {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    expiresAt: Date.now() + (tokenData.expires_in * 1000) - 60000, // Une minute de marge
                    username: user.login,
                    displayName: user.display_name,
                    id: user.id
                };
                
                // Crée un cookie de session pour l'utilisateur
                res.cookie('user_session', sessionId, { 
                    httpOnly: true, 
                    signed: true, 
                    maxAge: TOKEN_EXPIRY * 1000, 
                    sameSite: 'Lax'
                }); 
                
                // Redirige vers la page principale
                return res.redirect('/'); 
            }
        } else {
            return res.status(500).send(`Échec de la récupération du token: ${tokenData.message || JSON.stringify(tokenData)}`);
        }
    } catch (e) {
        console.error("Erreur lors de l'échange de code:", e);
        return res.status(500).send("Erreur interne lors de la connexion.");
    }
});

// 3. Statut de connexion
app.get('/twitch_user_status', async (req, res) => {
    const sessionId = req.signedCookies.user_session;
    const session = userSessions[sessionId];

    if (session && session.expiresAt > Date.now()) {
        return res.json({ 
            is_connected: true, 
            username: session.username,
            display_name: session.displayName
        });
    } else {
        // Optionnel: Tenter de rafraîchir le token ici si refresh_token est disponible
        if (session && session.refreshToken) {
            // Logique de rafraîchissement à implémenter ici
            delete userSessions[sessionId];
        }
        res.clearCookie('user_session');
        return res.json({ is_connected: false });
    }
});

// 4. Déconnexion
app.post('/twitch_logout', (req, res) => {
    const sessionId = req.signedCookies.user_session;
    if (userSessions[sessionId]) {
        delete userSessions[sessionId];
    }
    res.clearCookie('user_session');
    res.json({ success: true, message: "Déconnecté" });
});


// =========================================================
// --- ROUTES FONCTIONNELLES API ---
// =========================================================

/**
 * Middleware pour valider la session utilisateur
 */
function requireAuth(req, res, next) {
    const sessionId = req.signedCookies.user_session;
    const session = userSessions[sessionId];

    if (!session || session.expiresAt <= Date.now()) {
        res.clearCookie('user_session');
        return res.status(401).json({ success: false, error: "Non connecté ou session expirée.", message: "Veuillez vous reconnecter via Twitch." });
    }

    req.twitchSession = session;
    next();
}

// 1. Récupération des streams suivis
app.get('/followed_streams', requireAuth, async (req, res) => {
    const session = req.twitchSession;
    
    // 1. Récupérer les ID des chaînes suivies
    const followsRes = await fetch(`${TWITCH_API_BASE}/users/follows?user_id=${session.id}&first=100`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${session.accessToken}`
        }
    });
    const followsData = await followsRes.json();

    if (followsData.error) {
        return res.status(500).json({ success: false, error: `Erreur Twitch API Follows: ${followsData.message}` });
    }

    const followedUserIds = followsData.data.map(f => f.to_id);
    if (followedUserIds.length === 0) {
        return res.json({ success: true, streams: [] });
    }

    // 2. Récupérer les streams LIVE pour ces IDs
    const streamsRes = await twitchApiFetch(`streams?${followedUserIds.map(id => `user_id=${id}`).join('&')}`);
    
    if (streamsRes.error) {
         return res.status(500).json({ success: false, error: `Erreur Twitch API Streams: ${streamsRes.message}` });
    }
    
    // Filtrer uniquement les streams LIVE
    const liveStreams = streamsRes.data.filter(s => s.type === 'live');

    return res.json({ success: true, streams: liveStreams });
});

// 2. Récupération des jeux en tendance
app.get('/trending_games', async (req, res) => {
    try {
        const topGamesRes = await twitchApiFetch('games/top?first=10'); // Top 10 des jeux
        
        if (topGamesRes.data) {
            return res.json({ success: true, games: topGamesRes.data });
        } else {
            return res.json({ success: false, error: "Impossible de récupérer la liste des jeux." });
        }
    } catch (e) {
        console.error("Erreur dans /trending_games:", e);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// 3. Récupération de la dernière VOD d'une chaîne
app.get('/get_latest_vod', async (req, res) => {
    const { channel } = req.query;
    if (!channel) return res.status(400).json({ success: false, error: "Paramètre 'channel' manquant." });

    try {
        // Étape 1: Récupérer l'ID de l'utilisateur
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(channel)}`);
        if (!userRes.data || userRes.data.length === 0) {
            return res.json({ success: false, error: `Streamer '${channel}' non trouvé.` });
        }
        const userId = userRes.data[0].id;

        // Étape 2: Récupérer la dernière VOD
        const vodsRes = await twitchApiFetch(`videos?user_id=${userId}&first=1&type=archive`);
        
        if (vodsRes.data && vodsRes.data.length > 0) {
            return res.json({ success: true, vod: vodsRes.data[0] });
        } else {
            return res.json({ success: false, error: `Aucune VOD récente trouvée pour ${channel}.` });
        }
    } catch (e) {
        console.error("Erreur dans /get_latest_vod:", e);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// 4. ✅ NOUVELLE LOGIQUE: Analyse de Cible & Métriques (Fusion IA)
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });

    let aiPrompt = "";
    let dataForFrontend = { type: 'unknown', game_name: null, user_login: null };

    try {
        // --- 1. Tente de trouver un JEU ---
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);

        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`); 
            const totalStreams = streamsRes.data.length;
            const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
            
            dataForFrontend = {
                type: 'game',
                game_name: game.name,
                total_streams: totalStreams,
                total_viewers: totalViewers,
                viewer_streamer_ratio: totalStreams > 0 ? (totalViewers / totalStreams).toFixed(2) : 0,
            };

            aiPrompt = `Tu es un expert en évaluation de marché Twitch. Analyse le jeu suivant : ${dataForFrontend.game_name}. 
            Données Twitch: Nombre de streams LIVE scannés = ${dataForFrontend.total_streams}, Total de vues LIVE scannées = ${dataForFrontend.total_viewers}, Ratio Vues/Streamer = ${dataForFrontend.viewer_streamer_ratio}.
            
            En format HTML simple, génère :
            1. Un titre <h4>.
            2. **📊 EXPORT METRICS** : Un paragraphe <p> résumant les métriques clés de ce jeu sur Twitch.
            3. **⭐ NOTE DE QUALITÉ & STRATÉGIE** : Un paragraphe <p> évaluant la niche avec une note de 1 à 5 étoiles (ex: '⭐⭐⭐⭐') basée sur le ratio V/S (Rétention implicite) et la densité de la compétition. Propose un conseil stratégique immédiat.
            4. **📝 TITRE PROFESSIONNEL** : Propose un titre de stream professionnel et standard (non 'disruptif', comme demandé par l'utilisateur) pour streamer ce jeu, en <p>.
            `;

        } else {
            // --- 2. Tente de trouver un UTILISATEUR (Streamer) ---
            const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
            if (userRes.data.length > 0) {
                const user = userRes.data[0];
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                const isLive = streamRes.data.length > 0;
                
                // Métriques Simulées (car l'API Twitch ne donne pas la rétention directement)
                const simulatedMetrics = {
                    average_viewers: isLive ? streamRes.data[0].viewer_count.toLocaleString('fr-FR') : 'N/A',
                    retention_simulee: Math.floor(Math.random() * 80) + 20 // 20-100%
                };

                dataForFrontend = {
                    type: 'user',
                    user_login: user.login,
                    display_name: user.display_name,
                    simulated_metrics: simulatedMetrics
                };

                aiPrompt = `Tu es un coach de streamer. Analyse le streamer ${dataForFrontend.display_name}.
                Données Simulées (pour l'exemple): Vues Actuelles (si Live) = ${dataForFrontend.simulated_metrics.average_viewers}, Rétention VOD Estimée = ${dataForFrontend.simulated_metrics.retention_simulee}%.
                
                En format HTML simple, génère :
                1. Un titre <h4>.
                2. **📊 EXPORT METRICS** : Un paragraphe <p> résumant l'état du streamer (Live/Offline) et ses métriques simulées.
                3. **⭐ NOTE DE QUALITÉ & CONSEIL** : Un paragraphe <p> donnant une note de 1 à 5 étoiles (ex: '⭐⭐⭐⭐') sur sa performance actuelle (basée sur la rétention estimée). Propose un conseil immédiat sur le contenu.
                4. **📝 TITRE PROFESSIONNEL** : Propose un titre de stream professionnel et simple pour ce streamer, en <p>.
                `;
                
            } else {
                return res.json({ 
                    success: false, 
                    message: `Aucun jeu ni utilisateur trouvé pour la requête '${query}'.`,
                    html_response: `<p style="color:red; text-align:center;">❌ Aucun jeu ni streamer trouvé pour '${query}'.</p>`
                });
            }
        }
        
        // --- 3. Appel de l'IA avec le nouveau prompt ---
        const aiResult = await runGeminiAnalysis(aiPrompt);

        if (aiResult.success) {
            return res.json({ 
                success: true, 
                html_response: aiResult.html_response,
                type: dataForFrontend.type,
                game_name: dataForFrontend.game_name,
                user_login: dataForFrontend.user_login
            });
        } else {
            return res.status(aiResult.status || 500).json(aiResult);
        }

    } catch (e) {
        console.error("Erreur dans /scan_target:", e);
        return res.status(500).json({ success: false, error: e.message, html_response: `<p style="color:red; text-align:center;">❌ Erreur interne du serveur lors de l'analyse: ${e.message}</p>` });
    }
});


// 5. Analyse IA (Niche, Repurpose, Stratégie)
app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    if (!type || !query) return res.status(400).json({ success: false, error: "Type ou requête manquant." });
    
    let prompt = "";

    switch (type) {
        case 'strategie': // ✅ NOUVEAU TYPE: Fusion Niche + Croissance (avec Heures d'Or)
            prompt = `Tu es un expert en croissance et planification Twitch. Le streamer cherche une analyse stratégique pour le thème/jeu/genre : "${query}".
            
            Fournis une critique complète en format HTML simple: 
            1. Un titre <h4> de section Stratégique.
            2. **📊 Analyse de Niche (V/S)** : Une analyse en <p> de la tendance V/S (viewers-to-streamers) pour ce type de contenu ou genre, en évitant les jargons techniques et en se concentrant sur les opportunités.
            3. **💎 Angles de Contenu Sous-évalués** : Une liste <ul> de 3 suggestions de jeux, de formats ou d'angles de contenu qui sont des "niches sous-évaluées" pour se démarquer. Utilise des emojis.
            4. **⏰ HEURES D'OR STRATÉGIQUES** : Un paragraphe <p> donnant les 3 meilleurs créneaux horaires (Heure et Jour de la semaine, ex: 'Mercredi 17h-20h' HNE) pour streamer ce contenu afin de maximiser la croissance. Base cette analyse sur une compétition moyenne le soir et une faible compétition le matin.
            5. **💡 Conseil Tactique** : Un conseil de croissance tactique final en <p> (ex: focus sur le format court et l'engagement).
            `; 
            break;
            
        case 'repurpose':
            prompt = `Tu es un éditeur vidéo expert en contenu court YouTube/TikTok/Reel, analysant une VOD Twitch pour créer des clips. La VOD/Chaîne est : "${query}".
            
            Analyse et fournis 3 suggestions de clips courts (15-60s) en format HTML:
            1. Un titre <h4>.
            2. Pour chaque clip, crée un élément <li> décrivant le concept, le public cible, et mentionnant le timestamp de la VOD (Format H:MM:SS) en gras. Exemple: **Point de Clip:** 01:23:45. Utilise le format <ul>.
            `;
            break;

        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA non supporté." });
    }

    const result = await runGeminiAnalysis(prompt);
    
    if (result.success) {
        res.json({ success: true, html_response: result.html_response });
    } else {
        res.status(result.status || 500).json(result);
    }
});


// 6. Action Automatique (Simplifiée)
app.post('/auto_action', async (req, res) => {
    const { action_type, query } = req.body;
    if (!action_type || !query) {
        return res.status(400).json({ success: false, error: "Action ou requête manquante." });
    }

    try {
        let prompt = "";
        
        switch (action_type) {
            case 'create_clip':
                // Logique pour créer un clip IA
                prompt = `Tu es une IA de création de clips. La chaîne/VOD/Thème est : "${query}". 
                Génère un scénario pour un clip court de 30 secondes pour TikTok à partir de ce contenu. 
                Décris le moment capturé, l'accroche, et les effets visuels/sonores pour le rendre viral. 
                Réponds en format HTML simple, encapsulé dans <p> et <ul>, en utilisant un titre <h4>.
                `;
                break;
                
            default:
                // Si une action non supportée (comme les anciennes export_metrics) est envoyée
                return res.status(400).json({ 
                    success: false, 
                    error: "Type d'action non valide. Seul 'create_clip' est supporté." 
                });
        }
        
        const result = await runGeminiAnalysis(prompt);

        if (result.success) {
            return res.json({
                success: true,
                html_response: result.html_response,
                metrics: null // Pas de métriques pour ces actions
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


// 7. Route pour le Stream Boost (Placeholder)
app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ success: false, error: "Chaîne manquante." });

    // Simulation d'une attente et d'un cooldown.
    // En production, cette logique utiliserait des APIs externes et un stockage de cooldown persistant.
    await new Promise(resolve => setTimeout(resolve, 2000)); 

    // Simulation de la réponse IA
    const prompt = `Tu es un maître de l'optimisation des algorithmes. La chaîne "${channel}" a été envoyée pour un "Boost". Explique en HTML simple et court comment l'algorithme va travailler pour mettre en avant ce stream. Utilise un titre <h4> et une liste <ul>.`;
    
    const result = await runGeminiAnalysis(prompt);

    if (result.success) {
        res.json({ success: true, html_response: result.html_response });
    } else {
        res.status(result.status || 500).json(result);
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
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    // Pré-génération du App Access Token au démarrage
    getAppAccessToken();
});
