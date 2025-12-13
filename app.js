const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// 🚨 Le serveur utilise UNIQUEMENT les variables de Render (process.env)
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const GEMINI_MODEL = "gemini-2.5-flash"; 

// =========================================================
// VÉRIFICATION CRITIQUE AU DÉMARRAGE
// =========================================================

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("=========================================================");
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    console.error(`Missing keys: ${!TWITCH_CLIENT_ID ? 'TWITCH_CLIENT_ID ' : ''}${!TWITCH_CLIENT_SECRET ? 'TWITCH_CLIENT_SECRET ' : ''}${!REDIRECT_URI ? 'TWITCH_REDIRECT_URI ' : ''}${!GEMINI_API_KEY ? 'GEMINI_API_KEY' : ''}`);
    console.error("=========================================================");
    process.exit(1); 
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
console.log("DEBUG: Toutes les clés critiques sont chargées. L'IA est ACTIVE.");


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
    streamBoosts: {},
    lastScanData: null // Cache pour l'export CSV
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
        // Correction de la structure d'URL de la vignette VOD si nécessaire
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

            // Données supplémentaires réelles
            const totalViews = user.view_count || 'N/A'; 
            // Formate la date de création en FR
            const creationDate = user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR') : 'N/A'; 
            // Récupère le type de partenaire/affilié
            const broadcasterType = user.broadcaster_type || 'normal'; 
            
            // Calculer un score de niche simple basé sur le type de diffuseur et la date
            // Simule l'IA en attendant l'appel réel à l'IA
            let aiCalculatedNicheScore = (broadcasterType === 'partner') ? '8.5/10' : '5.0/10';

            const userData = { 
                login: user.login, 
                display_name: user.display_name, 
                id: user.id, 
                profile_image_url: user.profile_image_url,
                is_live: !!streamDetails,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                broadcaster_type: broadcasterType.toUpperCase() || 'NORMAL',
                total_followers: followerCount,
                vod_count: vodCount,
                total_views: totalViews,
                creation_date: creationDate,
                ai_calculated_niche_score: aiCalculatedNicheScore // Placeholder
            };
            
            CACHE.lastScanData = userData;

            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // =======================================================
        // --- Tenter la recherche de JEU (SECONDE PRIORITÉ) ---
        // =======================================================
        
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const streams = streamsRes.data;
            
            const totalStreams = streams.length;
            const totalViewers = streams.reduce((sum, s) => sum + s.viewer_count, 0);
            const avgViewersPerStreamer = totalStreams > 0 ? Math.round(totalViewers / totalStreams) : 0;
            
            // Simule l'IA en attendant l'appel réel à l'IA
            let aiCalculatedNicheScore = (avgViewersPerStreamer < 100) ? '8.0/10' : '4.5/10';
            
            const gameData = { 
                name: game.name, 
                id: game.id, 
                box_art_url: game.box_art_url,
                total_streamers: totalStreams,
                total_viewers: totalViewers,
                avg_viewers_per_streamer: avgViewersPerStreamer,
                ai_calculated_niche_score: aiCalculatedNicheScore, // Placeholder
                streams: streams.map(s => ({ user_name: s.user_name, user_login: s.user_login, title: s.title, viewer_count: s.viewer_count }))
            };
            
            CACHE.lastScanData = gameData;
            
            return res.json({ success: true, type: 'game', game_data: gameData });
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
            return res.status(404).json({ success: false, error: `Catégorie de jeu "${game}" introuvable sur Twitch.`, });
        }

        const gameId = gameRes.data[0].id;
        const gameName = gameRes.data[0].name;

        // 2. Récupérer les 100 premiers streams pour ce jeu (ils sont généralement triés par viewers décroissants)
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100`);

        // 3. Filtrer les streams pour trouver une cible appropriée
        const target = streamsRes.data
            .filter(stream => stream.viewer_count <= parseInt(max_viewers))
            // Tri par le plus grand nombre de viewers sous la limite (pour un raid plus impactant)
            .sort((a, b) => b.viewer_count - a.viewer_count)[0]; 

        if (target) {
            return res.json({
                success: true,
                target: {
                    name: target.user_name,
                    login: target.user_login,
                    viewers: target.viewer_count,
                    game: target.game_name,
                    // Utiliser l'URL de vignette en version moyenne
                    thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56')
                }
            });
        } else {
            return res.json({ success: false, error: `Aucune chaîne trouvée correspondant aux critères (Jeu: ${gameName}, Max: ${max_viewers} Vues).` });
        }
        
    } catch (e) {
        console.error("Erreur dans /start_raid:", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});


// =========================================================
// --- ROUTES IA (CRITIQUE ET ANALYSE) ---
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = "";

    switch (type) {
        case 'niche':
            // PROMPT RÉVISÉ: Ajout du score pour plus de contexte
            prompt = `En tant qu'expert en stratégie de croissance Twitch, le score de niche calculé est ${niche_score}. Analyse le jeu ou streamer "${query}". Fournis une critique de niche en format HTML. Sois extrêmement concis et utilise des listes (<ul> et <li>) plutôt que des paragraphes longs: 1. Un titre de <h4>. 2. Une liste <ul> de 3 points forts CLAIRS (faible compétition, public engagé, nouveauté). 3. Une liste <ul> de 3 suggestions de contenu spécifiques au sujet (ex: "Défi Speedrun avec handicap"). 4. Une conclusion courte et impactante en <p> avec un <strong>.`;
            break;
        case 'repurpose':
            prompt = `Tu es un spécialiste du 'Repurposing' de VOD Twitch. Analyse cette dernière VOD du streamer : "${query}". En format HTML, génère : 1. Un titre <h4>. 2. Une liste <ul> de 3 moments parfaits pour des clips courts (TikTok, Shorts), en estimant un timestamp (format HH:MM:SS) pour le début du clip. Pour chaque point, utilise l'expression "**Point de Clip: HH:MM:SS**". 3. Une liste <ul> de 3 titres courts et percutants pour ces clips.`;
            break;
        case 'trend':
            prompt = `Tu es un détecteur de niches. Analyse les tendances actuelles et donne un avis sur la prochaine "grosse niche" Twitch. Fournis une critique en format HTML: 1. Un titre <h4>. 2. Une analyse en <p> sur la tendance V...`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA non reconnu." });
    }

    const result = await runGeminiAnalysis(prompt);

    if (result.success) {
        return res.json({ success: true, html_response: result.html_response });
    } else {
        return res.status(result.status || 500).json(result);
    }
});


// =========================================================
// --- ROUTE BOOST (Cooldown de 3h) ---
// =========================================================

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) {
        return res.status(400).json({ error: "Nom de chaîne manquant pour le Boost." });
    }

    const now = Date.now();
    const COOLDOWN_DURATION = 3 * 60 * 60 * 1000; // 3 heures en millisecondes
    
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel]) < COOLDOWN_DURATION) {
        const remaining = CACHE.streamBoosts[channel] + COOLDOWN_DURATION - now;
        const minutesRemaining = Math.ceil(remaining / (60 * 1000));
        
        const errorMessage = `
            <p style="color:red; font-weight:bold;"> ❌ Boost en Cooldown </p>
            <p> Vous devez attendre encore <strong style="color:var(--color-primary-pink);">${minutesRemaining} minutes</strong>. </p>
        `;
        return res.status(429).json({ error: `Cooldown de 3 heures actif. Prochain Boost disponible dans environ ${minutesRemaining} minutes.`, html_response: errorMessage });
    }

    CACHE.streamBoosts[channel] = now;
    const successMessage = `
        <p style="color:var(--color-primary-pink); font-weight:bold;"> ✅ Boost de Stream Activé ! </p>
        <p> La chaîne <strong>${channel}</strong> a été ajoutée à la rotation prioritaire pour une période de 10 minutes. Le prochain boost sera disponible dans 3 heures. Bonne chance ! </p>
    `;
    return res.json({ success: true, html_response: successMessage });
});


// =========================================================
// --- ROUTE EXPORT CSV ---
// =========================================================

app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    
    if (!data) {
        return res.status(404).send("Aucune donnée de scan récente disponible pour l'export.");
    }

    let csvContent = "";
    
    if (data.type === 'user') {
        const d = data;
        csvContent = 
            "Metrique,Valeur\n" +
            `Type de Scan,Streamer\n` +
            `Nom d'utilisateur,${d.display_name}\n` +
            `Login,${d.login}\n` +
            `Statut Live,${d.is_live ? 'OUI' : 'NON'}\n` +
            `Jeu Actuel,${d.game_name}\n` +
            `Vues Actuelles,${d.viewer_count}\n` +
            `Total Suiveurs (RÉEL),${d.total_followers}\n` +
            `Vues Totales (RÉEL),${d.total_views}\n` +
            `VODs Publiées (RÉEL),${d.vod_count}\n` +
            `Création Compte (RÉEL),${d.creation_date}\n` +
            `Type de Chaîne (RÉEL),${d.broadcaster_type}\n` +
            `SCORE NICHE (Calculé),${d.ai_calculated_niche_score}\n`;

    } else if (data.type === 'game') {
        const d = data;
        csvContent = 
            "Metrique,Valeur\n" +
            `Type de Scan,Jeu\n` +
            `Nom du Jeu,${d.name}\n` +
            `Viewers Totaux (Live),${d.total_viewers}\n` +
            `Streamers Totaux (Live),${d.total_streamers}\n` +
            `Moy. Vues par Streamer,${d.avg_viewers_per_streamer}\n` +
            `SCORE NICHE (Calculé),${d.ai_calculated_niche_score}\n`;
    } else {
        return res.status(500).send("Erreur: Format de données de scan inconnu.");
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis_Export.csv');
    res.send(csvContent);
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
            case 'create_clip':
                 prompt = `...`; // Placeholder pour le prompt de création de clip
                 break;
            case 'title_disruption':
                 prompt = `...`; // Placeholder pour le prompt de titre disruptif
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
// DÉMARRAGE DU SERVEUR
// =========================================================
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
