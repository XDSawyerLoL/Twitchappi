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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_API_GEMINI';
const GEMINI_MODEL = "gemini-2.5-flash"; 

let ai = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== 'VOTRE_CLE_API_GEMINI') {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
    console.log("DEBUG: GEMINI_API_KEY est chargée. L'IA est ACTIVE.");
} else {
    console.error("FATAL DEBUG: GEMINI_API_KEY non trouvée. L'IA sera désactivée.");
}

// =========================================================
// MIDDLEWARES
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); // Pour servir NicheOptimizer.html et autres fichiers

// Cache simple en mémoire pour les tokens et le boost
const CACHE = {
    twitchTokens: {}, // { state: { access_token, refresh_token, expiry } }
    twitchUser: null,
    streamBoosts: {} // { channelName: lastBoostTime }
};

// =========================================================
// LOGIQUE TWITCH HELPER
// =========================================================

async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    // Le token n'existe pas ou est expiré, essayons de le régénérer ou d'en obtenir un nouveau
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = {
                access_token: data.access_token,
                // Définir l'expiration pour 5 minutes avant l'expiration réelle pour la sécurité
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        } else {
            console.error("Échec de la récupération du token Twitch (Client Credentials).", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau lors de la récupération du token Twitch:", error);
        return null;
    }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Accès Twitch non autorisé.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        // Le token a probablement expiré. Forçons la régénération pour le prochain appel.
        if (token === CACHE.twitchTokens['app']?.access_token) {
             CACHE.twitchTokens['app'] = null; 
        }
        throw new Error("Token Twitch expiré ou invalide. Veuillez réessayer.");
    }
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur lors de l'appel à l'API Twitch: Statut ${res.status}. Détail: ${errorText.substring(0, 50)}...`);
    }

    return res.json();
}

// =========================================================
// LOGIQUE GEMINI HELPER (CENTRALE POUR GÉRER LE 429)
// =========================================================

async function runGeminiAnalysis(prompt) {
    if (!ai) {
        throw new Error("L'API Gemini n'est pas configurée (GEMINI_API_KEY manquante).");
    }

    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                { role: "user", parts: [{ text: prompt }] }
            ],
            config: {
                // Pour s'assurer que le contenu est souvent en HTML comme demandé par le front
                systemInstruction: "Tu es un expert en croissance et stratégie Twitch. Toutes tes réponses doivent être formatées en HTML simple (utilisant <p>, <ul>, <li>, <h4>, <strong>, <em>) sans balise <html> ou <body>, pour être directement injectées dans une div."
            }
        });
        
        const text = response.text.trim();
        // Le front utilise 'html_response' pour toutes les IA
        return { success: true, html_response: text };

    } catch (e) {
        let statusCode = 500;
        let errorMessage = `Erreur interne du serveur lors de l'appel à l'IA. (Détail: ${e.message})`;
        
        // Détection du 429 (Rate Limit) - Très important
        if (e.message.includes('429')) {
             statusCode = 429;
             errorMessage = `❌ Erreur: Échec de l'appel à l'API Gemini. Limite de requêtes atteinte (Code 429). Votre clé IA a atteint son quota.`;
        }
        
        // Renvoyer une structure d'erreur claire
        return { 
            success: false, 
            status: statusCode, 
            error: errorMessage,
            html_response: `<p style="color:red; font-weight:bold;">${errorMessage}</p>`
        };
    }
}

// =========================================================
// --- ROUTES D'AUTHENTIFICATION TWITCH (OAuth) ---
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); // 10 minutes
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    const storedState = req.cookies.twitch_state;
    
    // Vérification de l'état pour la sécurité CSRF
    if (state !== storedState) {
        return res.status(400).send("Erreur de sécurité: État invalide.");
    }

    if (error) {
        return res.status(400).send(`Erreur Twitch: ${error} - ${error_description}`);
    }

    try {
        const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`;
        
        const tokenRes = await fetch(tokenUrl, { method: 'POST' });
        const tokenData = await tokenRes.json();
        
        if (tokenData.access_token) {
            
            // Étape 2: Récupérer les informations de l'utilisateur
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            // Stocker les infos et le token utilisateur
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            res.redirect('/'); // Rediriger vers la page principale
        } else {
            res.status(500).send("Erreur lors de l'échange du code Twitch.");
        }
    } catch (e) {
        res.status(500).send(`Erreur interne du serveur lors de l'authentification: ${e.message}`);
    }
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true });
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        const { display_name, username, id } = CACHE.twitchUser;
        return res.json({ is_connected: true, display_name, username, id });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
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
        
        // Twitch renvoie {width} et {height} dans l'URL de miniature, le client doit les remplacer
        const streams = data.data.map(stream => ({
            user_id: stream.user_id,
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url // Le front doit remplacer {width} et {height}
        }));
        
        return res.json({ success: true, streams });
    } catch (e) {
        console.error("Erreur lors de la récupération des streams suivis:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) {
        return res.status(400).json({ success: false, error: "Paramètre 'channel' manquant." });
    }

    try {
        // 1. Obtenir l'ID de l'utilisateur
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data || userRes.data.length === 0) {
            return res.status(404).json({ success: false, error: "Chaîne Twitch introuvable." });
        }
        const userId = userRes.data[0].id;

        // 2. Obtenir la dernière VOD
        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if (!vodRes.data || vodRes.data.length === 0) {
            return res.status(404).json({ success: false, error: `Aucune VOD récente trouvée pour ${channel}.` });
        }
        
        const vod = vodRes.data[0];
        // Twitch utilise %{width} et %{height} pour les VODs
        const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84');

        return res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: thumbnailUrl,
                duration: vod.duration // Ex: 0h1m33s
            }
        });
    } catch (e) {
        console.error("Erreur lors de la récupération de la VOD:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/trending_games', async (req, res) => {
    try {
        // Obtenir les 20 meilleurs jeux par nombre de spectateurs
        const data = await twitchApiFetch('games/top?first=20');
        
        const games = data.data.map(game => ({
            id: game.id,
            name: game.name,
            box_art_url: game.box_art_url,
            viewer_count: 0 // Le count n'est pas fourni ici directement, mais on l'estime comme "en tendance"
        }));

        // Optionnel : Tentative d'ajouter le nombre de spectateurs pour les 5 premiers jeux (peut être coûteux en appels)
        // Pour simplifier et éviter le rate limit, on ne le fait pas ici.

        return res.json({ success: true, games });

    } catch (e) {
        console.error("Erreur lors de la récupération des jeux en tendance:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    
    try {
        // 1. Tenter la recherche par jeu (Game)
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            // 2. Obtenir les streams de ce jeu
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=5`);
            const totalStreams = streamsRes.data.length;
            const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0);
            const avgViewersPerStreamer = totalStreams > 0 ? (totalViewers / totalStreams).toFixed(1) : 0;

            const streams = streamsRes.data;

            return res.json({ 
                success: true, 
                type: 'game',
                game_data: {
                    name: game.name,
                    id: game.id,
                    box_art_url: game.box_art_url,
                    total_streamers: totalStreams,
                    total_viewers: totalViewers,
                    avg_viewers_per_streamer: avgViewersPerStreamer,
                    streams: streams.map(s => ({
                        user_name: s.user_name,
                        user_login: s.user_login,
                        title: s.title,
                        viewer_count: s.viewer_count
                    }))
                }
            });
        }

        // 3. Tenter la recherche par utilisateur (User)
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // 4. Vérifier si l'utilisateur est en direct
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) {
                    streamDetails = streamRes.data[0];
                }
            } catch (e) {
                 // Optionnel : Ignorer l'erreur de stream s'il est hors ligne
            }

            return res.json({
                success: true,
                type: 'user',
                user_data: {
                    login: user.login,
                    display_name: user.display_name,
                    id: user.id,
                    profile_image_url: user.profile_image_url,
                    description: user.description,
                    is_live: !!streamDetails,
                    stream_details: streamDetails ? {
                        title: streamDetails.title,
                        game_name: streamDetails.game_name,
                        viewer_count: streamDetails.viewer_count
                    } : null
                }
            });
        }

        return res.status(404).json({ success: false, message: `Impossible de trouver un jeu ou un utilisateur correspondant à "${query}".` });

    } catch (e) {
        console.error("Erreur dans /scan_target:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// =========================================================
// --- ROUTES IA (CRITIQUE ET ANALYSE) ---
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";

    switch (type) {
        case 'niche':
            prompt = `En tant qu'expert en stratégie de croissance Twitch, analyse le jeu "${query}". Fournis une critique de niche en format HTML: 1. Un titre de <h4>. 2. Une liste <ul> de 3 points forts (faible compétition, public engagé, nouveauté). 3. Une liste <ul> de 3 suggestions de contenu spécifiques au jeu (ex: "Défi Speedrun avec handicap"). 4. Une conclusion forte en <p> avec un <strong>.`;
            break;
        case 'repurpose':
            prompt = `Tu es un spécialiste du 'Repurposing' de VOD Twitch. Analyse cette dernière VOD du streamer : "${query}". En format HTML, génère : 1. Un titre <h4>. 2. Une liste <ul> de 3 moments parfaits pour des clips courts (TikTok, Shorts), en estimant un timestamp (format HH:MM:SS) pour le début du clip. Pour chaque point, utilise l'expression "**Point de Clip: HH:MM:SS**". 3. Une liste <ul> de 3 titres courts et percutants pour ces clips.`;
            break;
        case 'trend':
            prompt = `Tu es un détecteur de niches. Analyse les tendances actuelles et donne un avis sur la prochaine "grosse niche" Twitch. Fournis une critique en format HTML: 1. Un titre <h4>. 2. Une analyse en <p> sur la tendance V/S (viewers-to-streamers). 3. Une liste <ul> de 3 jeux ou genres "sous-évalués" à stream. 4. Un conseil de croissance tactique en <p>.`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA invalide." });
    }

    const result = await runGeminiAnalysis(prompt);

    if (result.success) {
        return res.json(result);
    } else {
        // En cas d'erreur IA, renvoyer le statut d'erreur déterminé par runGeminiAnalysis (429 ou 500)
        return res.status(result.status || 500).json(result);
    }
});

// --- ROUTE MINI ASSISTANT (CORRECTION CRITIQUE) ---
app.post('/mini_assistant', async (req, res) => {
    const { q, context } = req.body; 
    
    if (!q) {
        return res.status(400).json({ success: false, error: "Requête de l'assistant vide." });
    }
    
    const prompt = `L'utilisateur stream actuellement sur la chaîne : "${context}". L'utilisateur te pose cette question : "${q}". Réponds de manière concise en format HTML pour être affiché dans une petite fenêtre de chat.`;

    const result = await runGeminiAnalysis(prompt);

    if (result.success) {
        return res.json(result);
    } else {
        // En cas d'erreur IA, renvoyer le statut d'erreur déterminé par runGeminiAnalysis (429 ou 500)
        return res.status(result.status || 500).json(result);
    }
});


// =========================================================
// --- ROUTE BOOST (COOLDOWN) ---
// =========================================================

const BOOST_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 heures

app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const now = Date.now();
    const lastBoost = CACHE.streamBoosts[channel];
    
    // Vérification du Cooldown
    if (lastBoost && now - lastBoost < BOOST_COOLDOWN_MS) {
        const remainingTime = BOOST_COOLDOWN_MS - (now - lastBoost);
        const minutesRemaining = Math.ceil(remainingTime / 60000); // Minutes restantes

        const errorMessage = `
             <p style="color:red; font-weight:bold;">
                 ❌ Boost en Cooldown
             </p>
             <p>
                 Vous devez attendre encore <strong style="color:var(--color-primary-pink);">${minutesRemaining} minutes</strong>.
             </p>
        `;

        return res.status(429).json({ // Utiliser 429 pour le Cooldown aussi, car c'est une limite
            error: `Cooldown de 3 heures actif. Prochain Boost disponible dans environ ${minutesRemaining} minutes.`,
            html_response: errorMessage
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

// Route explicite pour NicheOptimizer.html (utile si le front y fait référence)
app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// =========================================================
// DÉMARRAGE DU SERVEUR
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`REDIRECT_URI pour Twitch: ${REDIRECT_URI}`);
});
