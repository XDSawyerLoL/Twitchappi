const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Assurez-vous d'avoir installé : npm install @google/genai express cors node-fetch body-parser cookie-parser
const { GoogleGenAI } = require('@google/genai');

const app = express();

// =========================================================
// --- CONFIGURATION ET VARIABLES D'ENVIRONNEMENT ---
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'VOTRE_CLIENT_ID_TWITCH';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'VOTRE_SECRET_TWITCH';
// L'URL exacte doit être configurée dans vos variables d'environnement sur Render
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI || `https://justplayerstreamhubpro.onrender.com/twitch_auth_callback`;

// CLÉ API GEMINI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'VOTRE_CLE_API_GEMINI'; 
const GEMINI_MODEL = "gemini-2.0-flash"; 

let ai = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== 'VOTRE_CLE_API_GEMINI') {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 
    console.log("DEBUG: GEMINI_API_KEY chargée. IA Active.");
} else {
    console.error("ATTENTION: Clé Gemini manquante ou invalide. L'IA ne fonctionnera pas.");
}

// =========================================================
// MIDDLEWARES
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
// Assure que les fichiers statiques (CSS, JS client) sont servis.
app.use(express.static(path.join(__dirname))); 

// Cache en mémoire (À remplacer par BDD pour la persistance !)
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {}
};

// =========================================================
// HELPERS TWITCH
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
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        } else {
            console.error("Échec token Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau token:", error);
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
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        throw new Error("Token Twitch expiré.");
    }
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${errorText}`);
    }

    return res.json();
}

// =========================================================
// HELPER GEMINI (IA) - OPTIMISÉ POUR JSON / HTML
// =========================================================

/**
 * Exécute une requête Gemini.
 * @param {string} prompt - Le prompt à envoyer.
 * @param {string} format - 'json', 'html', ou 'text'.
 */
async function runGeminiAnalysis(prompt, format = 'html') {
    if (!ai) return { success: false, error: "Clé IA manquante." };

    try {
        let systemInstruction;
        
        if (format === 'json') {
            systemInstruction = "Tu es un expert Twitch. Réponds UNIQUEMENT avec un objet JSON valide, sans Markdown (```json) ni texte, avant ou après. Strictement un objet JSON.";
        } else if (format === 'html') {
            systemInstruction = "Tu es un assistant Twitch expert. Formate toujours ta réponse en utilisant des balises HTML standard (<ul>, <p>, <strong>, <span>, etc.) pour une intégration directe dans un div, sans utiliser les balises <html>, <body>, ou <style>. Sois concis et utilise un style professionnel.";
        } else {
            systemInstruction = "Tu es un assistant Twitch concis. Réponds en texte simple.";
        }

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: systemInstruction }
        });
        
        let text = response.text.trim();
        
        if (format === 'json') {
            // Nettoyage si l'IA ajoute des balises Markdown malgré l'instruction
            if (text.startsWith('```json')) text = text.replace(/^```json/, '').replace(/```$/, '');
            if (text.startsWith('```')) text = text.replace(/^```/, '').replace(/```$/, '');

            try {
                const jsonData = JSON.parse(text);
                return { success: true, data: jsonData };
            } catch (parseError) {
                console.error("Erreur parsing JSON IA:", text);
                return { success: false, error: "L'IA a renvoyé un format JSON invalide.", raw: text };
            }
        }
        
        // Pour format 'html' ou 'text'
        return { success: true, html_response: text }; 

    } catch (e) {
        console.error("Erreur Gemini:", e.message);
        let status = 500;
        if (e.message.includes('429')) status = 429;
        return { success: false, status, error: e.message };
    }
}


// =========================================================
// ROUTES AUTHENTIFICATION
// (La majorité reste identique)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:email user:read:follows channel:read:subscriptions user:read:broadcast"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("État invalide.");
    if (error) return res.status(400).send(`Erreur Twitch: ${error}`);

    try {
        const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${REDIRECT_URI}`;
        const tokenRes = await fetch(tokenUrl, { method: 'POST' });
        const tokenData = await tokenRes.json();
        
        if (tokenData.access_token) {
            const userRes = await twitchApiFetch('users', tokenData.access_token);
            const user = userRes.data[0];
            
            CACHE.twitchUser = {
                ...user,
                access_token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            res.redirect('/'); 
        } else {
            res.status(500).send("Erreur token Twitch.");
        }
    } catch (e) {
        res.status(500).send(`Erreur Auth: ${e.message}`);
    }
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.json({ success: true });
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ 
            is_connected: true, 
            display_name: CACHE.twitchUser.display_name, 
            profile_image_url: CACHE.twitchUser.profile_image_url,
            username: CACHE.twitchUser.login 
        });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// =========================================================
// ROUTE : MON FIL SUIVI
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Utilisateur non connecté." });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        const streams = data.data.map(stream => ({
            user_name: stream.user_name,
            user_login: stream.user_login,
            title: stream.title,
            game_name: stream.game_name,
            viewer_count: stream.viewer_count,
            // Formatage de l'URL pour la miniature
            thumbnail_url: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
        }));
        res.json({ success: true, streams });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});


// =========================================================
// ROUTE : SCAN CIBLE (JEUX & USERS)
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        // Tentative 1: Recherche de jeu (catégorie)
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0 && gameRes.data[0].name.toLowerCase() === query.toLowerCase()) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            
            const totalStreamers = streamsRes.data.length;
            const totalViewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0); 
            const avgViewersPerStreamer = totalStreamers > 0 ? (totalViewers / totalStreamers).toFixed(2) : 0;

            const topStreams = streamsRes.data.slice(0, 5).map(s => ({ 
                user_name: s.user_name, 
                user_login: s.user_login, 
                title: s.title, 
                viewer_count: s.viewer_count 
            }));
            
            return res.json({ 
                success: true, 
                type: 'game',
                game_data: { // Structure JSON pour le client HTML V10.2
                    name: game.name,
                    box_art_url: game.box_art_url,
                    total_streamers: totalStreamers,
                    total_viewers: totalViewers,
                    avg_viewers_per_streamer: avgViewersPerStreamer,
                    streams: topStreams
                }
            });
        }
        
        // Tentative 2: Recherche d'utilisateur
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
            const isLive = streamRes.data.length > 0;

            return res.json({
                success: true,
                type: 'user',
                user_data: { // Structure JSON pour le client HTML V10.2
                    login: user.login,
                    display_name: user.display_name,
                    profile_image_url: user.profile_image_url,
                    description: user.description,
                    is_live: isLive,
                    stream_details: isLive ? {
                        viewer_count: streamRes.data[0].viewer_count,
                        title: streamRes.data[0].title
                    } : null
                }
            });
        }

        res.status(404).json({ success: false, message: "Jeu ou utilisateur introuvable." });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});


// =========================================================
// ROUTE : VOD & REPURPOSING
// =========================================================

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data.length) return res.status(404).json({ success: false, error: "Chaîne introuvable." });
        
        // type=archive pour les VODs, type=highlight/upload pour le reste
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`); 
        if (!vodRes.data.length) return res.status(404).json({ success: false, error: "Aucune VOD trouvée." });
        
        const vod = vodRes.data[0];
        res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: vod.thumbnail_url,
                duration: vod.duration 
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// =========================================================
// ROUTE : JEUX TENDANCE (CROISSANCE)
// =========================================================

app.get('/trending_games', async (req, res) => {
    try {
        // Récupère les 20 meilleurs jeux par nombre de viewers
        const data = await twitchApiFetch('games/top?first=20');
        res.json({ success: true, games: data.data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// =========================================================
// ROUTES IA GÉNÉRIQUES (/critique_ia)
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";
    let format = 'html'; // Par défaut, la plupart des critiques retournent du HTML pour l'affichage

    switch (type) {
        case 'niche':
            prompt = `Analyse le jeu ou la catégorie Twitch "${query}" pour un petit streamer (moins de 50 viewers). 
            Produis un rapport concis en HTML, structuré avec des balises <h4>, <ul>, et <li>. 
            Le rapport doit inclure : 
            1. Un titre de verdict fort.
            2. Une section "Score Niche et Risque de Saturation" (utiliser des <strong> pour les pourcentages).
            3. Une section "Opportunités de Contenu Unique" (liste <li> de 3 idées).
            4. Une section "Points d'Attaque (Faiblesses des concurrents)" (liste <li> de 3 points).
            `;
            break;
            
        case 'repurpose':
            prompt = `Le titre de VOD et le thème de la chaîne sont : "${query}". 
            Ton objectif est de trouver des idées de clips viraux. 
            Réponds en HTML structuré avec des <ul> et <li>. 
            Pour CHAQUE idée de clip, tu DOIS inclure un "Point de Clip:" suivi d'une estimation de temps (format 00:00:00). 
            Exemple: "<strong>Titre Putaclic:</strong> Mon clip le plus fou ! **Point de Clip:** 01:25:30. Raison: Réaction émotionnelle intense."`;
            break;

        case 'trend':
            prompt = `Analyse les tendances actuelles de Twitch en regardant les jeux à faible ratio Viewer/Streamer. 
            Produis un rapport en HTML. 
            Le rapport doit inclure : 
            1. Un titre "Tendance sous-estimée". 
            2. Une liste <ul> de 3 jeux ou catégories qui sont actuellement sous-saturés ou en forte croissance pour les petits streamers. 
            3. Un paragraphe sur "Pourquoi l'opportunité est là".`;
            break;
            
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA invalide." });
    }

    const result = await runGeminiAnalysis(prompt, format);
    
    if(result.success) return res.json(result);
    // Si l'IA échoue, renvoie l'erreur
    res.status(result.status || 500).json(result);
});


// =========================================================
// ROUTES IA ACTIONS (/auto_action)
// =========================================================

app.post('/auto_action', async (req, res) => {
    const { query, action_type } = req.body;
    if (!query) return res.status(400).json({ success: false, error: "La requête (query) est requise." });

    if (action_type === 'export_metrics') {
        // Simulation d'une API interne complexe pour l'export des metrics
        // NOTE: Ceci nécessite d'être connecté à Twitch pour fonctionner correctement
        if (!CACHE.twitchUser) {
             return res.status(401).json({ success: false, error: "Non connecté à Twitch pour exporter les métriques." });
        }
        
        // Simulation de données de métriques (vrai API plus complexe)
        const followers = CACHE.twitchUser.view_count * 0.05 + 100; // Juste un nombre
        
        return res.json({
            success: true,
            html_response: `<p style="color:var(--color-ai-niche); font-weight:bold; text-align:center;">📊 Export réussi ! Metrics mis à jour dans le rapport.</p>`,
            metrics: {
                views: CACHE.twitchUser.view_count || 150000, 
                retention: 0.65, // 65% (pour l'affichage client)
                followers: Math.floor(followers) 
            }
        });
    }

    let prompt = "";
    let format = 'html'; 

    if (action_type === 'title_disruption') {
        prompt = `Propose 3 titres Twitch ultra-putaclics et disruptifs pour le thème/jeu "${query}". 
        Réponds en HTML structuré avec un titre <h4> et une liste <ul>. 
        Pour chaque titre, ajoute une balise <strong> pour le mot clé.`;
    } else if (action_type === 'create_clip') {
        prompt = `Tu as 30 secondes pour faire un clip basé sur le thème "${query}". 
        Décris en HTML le meilleur moment à capturer et quel "hook" (phrase d'accroche) utiliser dans le titre du clip.`;
    }

    const result = await runGeminiAnalysis(prompt, format);
    
    if(result.success) {
        // Si c'est un succès HTML, on l'encapsule pour le client
        return res.json({ success: true, html_response: result.html_response });
    }
    
    // Si l'IA échoue, renvoie l'erreur
    res.status(result.status || 500).json(result);
});


// =========================================================
// ROUTE : MINI ASSISTANT
// =========================================================

app.post('/mini_assistant', async (req, res) => {
    const { q, context } = req.body;
    // Format text pour le mini assistant, puis le client l'affiche.
    const prompt = `Assistant Twitch (Contexte: ${context}). Question: "${q}". Réponds en texte simple et cours (< 50 mots).`;
    const result = await runGeminiAnalysis(prompt, 'text');
    
    if (result.success) {
        // Le client attend 'html_response' même si c'est du texte simple
        return res.json({ success: true, html_response: result.html_response });
    }
    
    res.status(result.status || 500).json(result);
});


// =========================================================
// ROUTE : BOOST (RAID FINDER)
// =========================================================

app.post('/stream_boost', async (req, res) => {
    // Vérification de connexion
    if (!CACHE.twitchUser) {
         return res.status(401).json({ success: false, html_response: "<p style='color:red'>🛑 Vous devez être connecté pour utiliser le Boost.</p>" });
    }

    const channel = CACHE.twitchUser.login;
    const now = Date.now();
    // Cooldown de 3 heures (10800000 ms)
    if (CACHE.streamBoosts[channel] && now - CACHE.streamBoosts[channel] < 10800000) {
        return res.status(429).json({ success: false, html_response: "<p style='color:red'>⏳ Cooldown actif. Prochain Boost disponible dans 3 heures.</p>" });
    }

    try {
        // 1. Vérifier si l'utilisateur est LIVE pour trouver un raid
        const streamRes = await twitchApiFetch(`streams?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        if (!streamRes.data.length) {
            return res.json({ success: false, html_response: "<p style='color:orange'>🛑 Vous n'êtes pas LIVE. Le Boost recherche des raids seulement si vous streamez.</p>" });
        }
        const currentCategory = streamRes.data[0].game_name;

        // 2. Trouver des candidats de Raid (0-100 Viewers)
        const gameRes = await twitchApiFetch(`games?name=${encodeURIComponent(currentCategory)}`);
        if (!gameRes.data.length) {
             return res.json({ success: false, html_response: `<p style='color:orange'>🛑 Catégorie "${currentCategory}" introuvable sur Twitch.</p>` });
        }
        const gameId = gameRes.data[0].id;

        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100&language=fr`); 
        
        let raidCandidates = streamsRes.data.filter(s => s.viewer_count >= 0 && s.viewer_count <= 100 && s.user_id !== CACHE.twitchUser.id);
        
        raidCandidates.sort((a, b) => a.viewer_count - b.viewer_count);

        CACHE.streamBoosts[channel] = now; 

        if (raidCandidates.length > 0) {
            const topCandidate = raidCandidates[0];
            const htmlOutput = `
                <p style='color:#59d682; font-weight:bold;'>🚀 BOOST ACTIVÉ !</p>
                <div class="card" style="margin-top: 10px; padding: 10px; background: rgba(89, 214, 130, 0.1);">
                    <p>Raid suggéré dans votre niche (${currentCategory}):</p>
                    <p><strong>${topCandidate.user_name}</strong> (${topCandidate.viewer_count} viewers)</p>
                    <button onclick="navigator.clipboard.writeText('/raid ${topCandidate.user_login}')" class="timestamp-link" style="background:var(--color-primary-pink); margin-top: 5px;">Copier: /raid ${topCandidate.user_login}</button>
                </div>
            `;
            return res.json({ 
                success: true, 
                html_response: htmlOutput,
                raidCandidate: { user_name: topCandidate.user_name, user_login: topCandidate.user_login, viewer_count: topCandidate.viewer_count }
            });
        }
        
        return res.json({ success: false, html_response: "<p style='color:gray'>🔍 Boost activé, mais aucun candidat au Raid trouvé dans votre niche (0-100 viewers).</p>" });

    } catch (e) {
        console.error("Erreur Boost:", e);
        res.status(500).json({ success: false, html_response: `<p style='color:red'>Erreur de service: ${e.message}</p>` });
    }
});


// =========================================================
// ROUTE RACINE (NicheOptimizer.html)
// =========================================================

app.get('/', (req, res) => {
    // FIX: Sert NicheOptimizer.html
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// =========================================================
// SERVER START
// =========================================================

app.listen(PORT, () => {
    console.log(`Serveur prêt sur http://localhost:${PORT}`);
    console.log(`REDIRECT_URI configuré: ${REDIRECT_URI}`);
    console.log(`Fichier HTML servi à la racine: NicheOptimizer.html`);
});
