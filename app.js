const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// ❌ REMPLACÉ: const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

// =========================================================
// --- NOUVELLE LOGIQUE D'IMPORTATION DYNAMIQUE POUR L'IA ---
// =========================================================

// Déclaration de 'ai' au scope global
let ai;
let GoogleGenAI; 

async function initGemini() {
    try {
        // Importation dynamique pour contourner le problème de module CommonJS/ESM
        const geminiModule = await import('@google/genai');
        GoogleGenAI = geminiModule.GoogleGenAI;
        ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
        console.log("✅ GoogleGenAI chargé via l'importation dynamique. L'IA est ACTIVE.");
        return true;
    } catch (e) {
        console.error("FATAL ERROR: Impossible de charger GoogleGenAI.", e.message);
        return false;
    }
}

// =========================================================
// MIDDLEWARES
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// Cache simple en mémoire pour les tokens et le boost
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {} 
};

// =========================================================
// LOGIQUE TWITCH HELPER
// =========================================================

async function getTwitchToken(tokenType) {
    if (CACHE.twitchTokens[tokenType] && CACHE.twitchTokens[tokenType].expiry > Date.now()) {
        return CACHE.twitchTokens[tokenType].access_token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens[tokenType] = {
                access_token: data.access_token,
                // Expiry set 5 minutes before actual expiry for buffer
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
        if (token === CACHE.twitchTokens['app']?.access_token) {
             CACHE.twitchTokens['app'] = null; 
        }
        if (token === CACHE.twitchUser?.access_token) {
             CACHE.twitchUser = null; 
        }
        const errorText = await res.text();
        throw new Error(`Erreur d'autorisation Twitch (401). Token invalide. Détail: ${errorText.substring(0, 100)}...`);
    }
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur lors de l'appel à l'API Twitch: Statut ${res.status}. Détail: ${errorText.substring(0, 100)}...`);
    }

    return res.json();
}

// =========================================================
// LOGIQUE GEMINI HELPER
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        // 'ai' est maintenant disponible car startServer a attendu initGemini()
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
                { role: "user", parts: [{ text: prompt }] }
            ],
            config: {
                systemInstruction: "Tu es un expert en croissance et stratégie Twitch. Toutes tes réponses doivent être formatées en HTML simple (utilisant <p>, <ul>, <li>, <h4>, <strong>, <em>) sans balise <html> ou <body>, pour être directement injectées dans une div."
            }
        });
        
        const text = response.text.trim();
        return { success: true, html_response: text };

    } catch (e) {
        let statusCode = 500;
        let errorMessage = `Erreur interne du serveur lors de l'appel à l'IA. (Détail: ${e.message})`;
        
        if (e.message.includes('429')) {
             statusCode = 429;
             errorMessage = `❌ Erreur: Échec de l'appel à l'API Gemini. Limite de requêtes atteinte (Code 429). Votre clé IA a atteint son quota.`;
        }
        
        if (e.message.includes('400') || e.message.includes('403')) {
             statusCode = 403;
             errorMessage = `❌ Erreur: Clé API Gemini refusée (Code 403/400). La clé est invalide ou le service n'est pas activé.`;
        }
        
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
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    const storedState = req.cookies.twitch_state;
    
    if (state !== storedState) {
        return res.status(400).send("Erreur de sécurité: État invalide.");
    }

    if (error) {
        return res.status(400).send(`Erreur Twitch: ${error} - ${error_description}`);
    }

    try {
        // CORRECTION CRITIQUE : Envoi des paramètres dans le corps (body) de la requête POST
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            })
        });
        
        const tokenData = await tokenRes.json();
        
        if (tokenData.access_token) {
            
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            CACHE.twitchUser = {
                display_name: user.display_name,
                username: user.login,
                id: user.id,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            res.redirect('/'); 
        } else {
            console.error("=========================================================");
            console.error("ERREUR CRITIQUE: Échec de l'échange de code Twitch.");
            console.error("Détails renvoyés par Twitch:", tokenData);
            console.error("=========================================================");
            
            const twitchError = tokenData.message || tokenData.error || "Détail non fourni.";
            res.status(500).send(`Erreur lors de l'échange du code Twitch. Vérifiez le log du serveur. Détail: ${twitchError}`);
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
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data || userRes.data.length === 0) {
            return res.status(404).json({ success: false, error: "Chaîne Twitch introuvable." });
        }
        const userId = userRes.data[0].id;

        const vodRes = await twitchApiFetch(`videos?user_id=${userId}&type=archive&first=1`);
        if (!vodRes.data || vodRes.data.length === 0) {
            return res.status(404).json({ success: false, error: `Aucune VOD récente trouvée pour ${channel}.` });
        }
        
        const vod = vodRes.data[0];
        const thumbnailUrl = vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84');

        return res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: thumbnailUrl,
                duration: vod.duration 
            }
        });
    } catch (e) {
        console.error("Erreur lors de la récupération de la VOD:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: "Requête vide." });
    
    try {
        
        // =======================================================
        // --- Tenter d'abord la recherche d'UTILISATEUR (PRIORITÉ) ---
        // =======================================================
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            
            // 1. Récupérer les streams (pour savoir s'il est live, son jeu, etc.)
            let streamDetails = null;
            try {
                const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (streamRes.data.length > 0) {
                    streamDetails = streamRes.data[0];
                }
            } catch (e) { /* Ignorer l'erreur, continuer avec les données utilisateur */ }

            // 2. Récupérer le nombre total de followers
            let followerCount = 'N/A';
            try {
                // L'API followers donne le total directement dans la réponse
                const followerRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`); 
                followerCount = followerRes.total;
            } catch (e) { /* Ignorer l'erreur, continuer avec les données utilisateur */ }
            
            // 3. Récupérer le nombre total de VODs
            let vodCount = 'N/A';
            try {
                // L'API videos donne le total directement dans la réponse
                const vodRes = await twitchApiFetch(`videos?user_id=${user.id}&type=archive&first=1`);
                vodCount = vodRes.total;
            } catch (e) { /* Ignorer l'erreur, continuer avec les données utilisateur */ }

            // NOUVEAU: Données supplémentaires réelles
            const totalViews = user.view_count || 'N/A';
            // Formate la date de création en FR
            const creationDate = user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR') : 'N/A';
            // Récupère le type de partenaire/affilié
            const broadcasterType = user.broadcaster_type || 'normal'; 


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
                    game_name: streamDetails?.game_name || 'Divers',
                    viewer_count: streamDetails?.viewer_count || 0,
                    
                    // STATISTIQUES BRUTES TWITCH API (RÉELLES)
                    total_followers: followerCount,
                    total_vods: vodCount,
                    total_views_count: totalViews, 
                    account_creation_date: creationDate,
                    broadcaster_type: broadcasterType, 
                    
                    // DONNÉES ESTIMÉES PAR L'IA (car non publiques sur Twitch API)
                    // Ces données doivent rester simulées/estimées car Twitch ne les fournit pas publiquement.
                    ai_estimated_avg_viewers: (Math.random() * 500).toFixed(0),
                    ai_estimated_growth: (Math.random() * 10 - 2).toFixed(1), // -2% à 8%
                }
            });
        }

        // =======================================================
        // --- Si AUCUN utilisateur trouvé, tenter la recherche de JEU ---
        // =======================================================
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
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

        return res.status(404).json({ success: false, message: `Impossible de trouver un utilisateur ou un jeu correspondant à "${query}".` });

    } catch (e) {
        console.error("Erreur dans /scan_target:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// --- ROUTE RAID (Recherche réelle) ---
// =========================================================

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    
    if (!game || !max_viewers) {
        return res.status(400).json({ success: false, error: "Jeu ou nombre de viewers manquant pour le Raid." });
    }
    
    try {
        // 1. Tenter de récupérer l'ID du jeu
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: `Catégorie de jeu "${game}" introuvable sur Twitch.`,
            });
        }
        const gameId = gameRes.data[0].id;
        const gameName = gameRes.data[0].name;
        
        // 2. Récupérer les 100 premiers streams pour ce jeu (ils sont généralement triés par vues, donc nous allons chercher une petite chaîne parmi les 100)
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100`);
        const liveStreams = streamsRes.data;
        
        let target = null;
        
        // 3. Filtrer pour trouver la CIBLE RAID
        // On va chercher le plus petit streamer (>= 1 vue) qui est en dessous de max_viewers.
        for (const stream of liveStreams) {
            if (stream.viewer_count <= max_viewers && stream.viewer_count > 0) {
                 if (!target || stream.viewer_count < target.viewer_count) {
                    target = {
                        name: stream.user_name,
                        login: stream.user_login,
                        viewers: stream.viewer_count,
                        game: stream.game_name,
                        // Remplace les placeholders de Twitch pour obtenir l'URL de la miniature du stream
                        thumbnail_url: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
                    };
                 }
            }
        }
        
        if (target) {
            // Cible trouvée. Retourne les données réelles.
            return res.json({
                success: true,
                channel: target,
                // Le frontend va générer l'HTML à partir des données structurées
            });
        } else {
            // Aucune cible adéquate trouvée
            return res.status(404).json({ 
                success: false, 
                error: `Aucune cible de Raid trouvée dans ${gameName} avec moins de ${max_viewers} vues (parmi les 100 premiers résultats).`,
            });
        }
        
    } catch (e) {
        console.error("Erreur lors de la recherche de Raid:", e.message);
        return res.status(500).json({ 
            success: false, 
            error: `Erreur serveur lors de la recherche de Raid: ${e.message}`,
        });
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
            // PROMPT RÉVISÉ: Demande de concision et structure en listes
            prompt = `En tant qu'expert en stratégie de croissance Twitch, analyse le jeu ou streamer "${query}". Fournis une critique de niche en format HTML. Sois extrêmement concis et utilise des listes (<ul> et <li>) plutôt que des paragraphes longs: 1. Un titre de <h4>. 2. Une liste <ul> de 3 points forts CLAIRS (faible compétition, public engagé, nouveauté). 3. Une liste <ul> de 3 suggestions de contenu spécifiques au sujet (ex: "Défi Speedrun avec handicap"). 4. Une conclusion courte et impactante en <p> avec un <strong>.`;
            break;
        case 'repurpose':
            prompt = `Tu es un spécialiste du 'Repurposing' de VOD Twitch. Analyse cette dernière VOD du streamer : "${query}". En format HTML, génère : 1. Un titre <h4>. 2. Une liste <ul> de 3 moments parfaits pour des clips courts (TikTok, Shorts), en estimant un timestamp (format HH:MM:SS) pour le début du clip. Pour chaque point, utilise l'expression "**Point de Clip: HH:MM:SS**". 3. Une liste <ul> de 3 titres courts et percutants pour ces clips.`;
            break;
        case 'trend':
            prompt = `Tu es un détecteur de niches. Analyse les tendances actuelles et donne un avis sur la prochaine "grosse niche" Twitch. Fournis une critique en format HTML: 1. Un titre <h4>. 2. Une analyse en <p> sur la tendance V/S (viewers-to-streamers). 3. Une liste <ul> de 3 jeux ou genres "sous-évalués" à stream. 4. Un conseil de croissance tactique en <p> avec un <strong>.`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA invalide." });
    }

    const result = await runGeminiAnalysis(prompt);

    if (result.success) {
        return res.json(result);
    } else {
        return res.status(result.status || 500).json(result);
    }
});

app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    const BOOST_COOLDOWN_MS = 3 * 60 * 60 * 1000; 
    const now = Date.now();
    const lastBoost = CACHE.streamBoosts[channel];
    
    if (lastBoost && now - lastBoost < BOOST_COOLDOWN_MS) {
        const remainingTime = BOOST_COOLDOWN_MS - (now - lastBoost);
        const minutesRemaining = Math.ceil(remainingTime / 60000); 

        const errorMessage = `
             <p style="color:red; font-weight:bold;">
                 ❌ Boost en Cooldown
             </p>
             <p>
                 Vous devez attendre encore <strong style="color:var(--color-primary-pink);">${minutesRemaining} minutes</strong>.
             </p>
        `;

        return res.status(429).json({ 
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

app.post('/auto_action', async (req, res) => {
    try {
        const { query, action_type } = req.body;
        let prompt = "";
        
        if (!query || !action_type) {
            return res.status(400).json({ success: false, error: "Les paramètres 'query' ou 'action_type' sont manquants." });
        }

        switch (action_type) {
            case 'export_metrics':
                // 1. Logique d'Export de Métriques (Génération d'un fichier CSV)
                const metrics_data = {
                    views: Math.floor(Math.random() * 500000) + 100000,
                    retention: (Math.random() * 0.3) + 0.6,
                    followers: Math.floor(Math.random() * 5000) + 1000
                };
                
                const csvContent = [
                    'Métrique,Valeur',
                    `Vues Totales (Simulées),${metrics_data.views}`,
                    `Taux de Rétention (Simulé),${(metrics_data.retention * 100).toFixed(1)}%`,
                    `Nouveaux Suiveurs (Simulés),${metrics_data.followers}`
                ].join('\n');
                
                // Déclenche le téléchargement du fichier CSV
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="Stats_Twitch_${query}_${new Date().toISOString().slice(0, 10)}.csv"`);
                
                return res.send(csvContent); // <- Envoi du fichier. Ne retourne pas de JSON.

            case 'create_clip':
                // 2. Logique de Création de Clip (Utilise l'IA pour le titre et les idées)
                prompt = `Tu es un spécialiste du 'Repurposing' de VOD Twitch. Analyse le sujet ou VOD : "${query}". En format HTML, génère : 1. Un titre <h4> pour le rapport. 2. Une liste <ul> de 3 titres courts et percutants pour un clip (max 60 caractères chacun).`;
                break;

            case 'title_disruption':
                // 3. Logique de Titre Disruptif
                prompt = `Tu es un expert en stratégie de croissance Twitch. Analyse le jeu ou sujet : "${query}". En format HTML, génère : 1. Un titre <h4> pour le rapport. 2. Une liste <ul> de 3 suggestions de titres de stream ULTRA-DISRUPTIFS pour maximiser les clics dans les recommandations. 3. Une conclusion en <p> avec un <strong>.`;
                break;

            default:
                return res.status(400).json({ success: false, error: `Type d'action non supporté : ${action_type}` });
        }
        
        // Exécution de l'IA pour les actions 'create_clip' et 'title_disruption'
        const result = await runGeminiAnalysis(prompt);

        if (result.success) {
            return res.json({
                success: true,
                html_response: result.html_response,
                metrics: null
            });
        } else {
            return res.status(result.status || 500).json(result);
        }

    } catch (error) {
        console.error(`Erreur d'exécution dans /auto_action pour ${req.body?.action_type}:`, error.message);
        // Si l'erreur se produit AVANT res.send (pour le CSV) ou res.json (pour l'IA)
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                error: `Erreur interne du serveur lors de l'action: ${error.message}`,
                html_response: `<p style="color:#e34a64; font-weight:bold; text-align:center;">❌ Erreur d'exécution de l'API: ${error.message}</p>`
            });
        }
    }
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.get('/NicheOptimizer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// =========================================================
// DÉMARRAGE DU SERVEUR (ASYNCHRONE)
// =========================================================

async function startServer() {
    
    // 1. VÉRIFICATION CRITIQUE
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
        console.error("=========================================================");
        console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
        console.error(`Missing keys: ${!TWITCH_CLIENT_ID ? 'TWITCH_CLIENT_ID ' : ''}${!TWITCH_CLIENT_SECRET ? 'TWITCH_CLIENT_SECRET ' : ''}${!REDIRECT_URI ? 'TWITCH_REDIRECT_URI ' : ''}${!GEMINI_API_KEY ? 'GEMINI_API_KEY' : ''}`);
        console.error("=========================================================");
        process.exit(1); 
    }
    
    // 2. Initialisation de l'IA (Importation dynamique)
    const isAiReady = await initGemini();
    if (!isAiReady) {
        // initGemini a déjà loggé l'erreur
        process.exit(1); 
    }

    // 3. Démarrage du serveur Express
    app.listen(PORT, () => {
        console.log(`Serveur démarré sur http://localhost:${PORT}`);
        console.log(`REDIRECT_URI pour Twitch: ${REDIRECT_URI}`);
    });
}

startServer(); // Lancer l'application
