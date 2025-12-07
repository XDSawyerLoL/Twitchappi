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
// ✅ Mise à jour de la REDIRECT_URI pour utiliser l'URL de Render
// NOTE: L'URL exacte doit être configurée dans vos variables d'environnement sur Render
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
// HELPER GEMINI (IA) - OPTIMISÉ POUR JSON
// =========================================================

async function runGeminiAnalysis(prompt, expectJson = true) {
    if (!ai) return { success: false, error: "Clé IA manquante." };

    try {
        const systemInstruction = expectJson 
            ? "Tu es un expert Twitch. Réponds UNIQUEMENT avec un objet JSON valide, sans Markdown (```json), sans texte avant ou après."
            : "Tu es un assistant Twitch concis.";

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: systemInstruction }
        });
        
        let text = response.text.trim();
        
        // Nettoyage si l'IA ajoute des balises Markdown malgré l'instruction
        if (text.startsWith('```json')) text = text.replace(/^```json/, '').replace(/```$/, '');
        if (text.startsWith('```')) text = text.replace(/^```/, '').replace(/```$/, '');

        if (expectJson) {
            try {
                const jsonData = JSON.parse(text);
                return { success: true, data: jsonData };
            } catch (parseError) {
                console.error("Erreur parsing JSON IA:", text);
                return { success: false, error: "L'IA a renvoyé un format invalide.", raw: text };
            }
        }

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
            profile_image_url: CACHE.twitchUser.profile_image_url 
        });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// =========================================================
// ROUTE : PROFIL & STATS PERSO
// =========================================================

app.get('/my_profile_stats', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Non connecté." });

    try {
        const userId = CACHE.twitchUser.id;
        const accessToken = CACHE.twitchUser.access_token;

        const userRes = await twitchApiFetch(`users?id=${userId}`, accessToken);
        const userData = userRes.data[0];

        const followersRes = await twitchApiFetch(`channels/followers?broadcaster_id=${userId}`, accessToken);
        const totalFollowers = followersRes.total;

        let subCount = "N/A (Non Affilié/Partenaire)";
        try {
            const subsRes = await twitchApiFetch(`subscriptions?broadcaster_id=${userId}&first=1`, accessToken);
            subCount = subsRes.total; 
        } catch (e) {
            console.log("Info Sub inaccessible (normal si pas partenaire)");
        }

        res.json({
            success: true,
            stats: {
                display_name: userData.display_name,
                login: userData.login,
                avatar: userData.profile_image_url,
                created_at: userData.created_at,
                view_count: userData.view_count, 
                follower_count: totalFollowers,
                broadcaster_type: userData.broadcaster_type || "Streamer Standard", 
                sub_count: subCount,
                description: userData.description
            }
        });

    } catch (e) {
        console.error("Erreur Profile Stats:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// ROUTE : RAID FINDER (0-100 Viewers)
// =========================================================

app.post('/raid_finder', async (req, res) => {
    const { category } = req.body;
    if (!category) return res.status(400).json({ success: false, error: "Catégorie requise." });

    try {
        const gameRes = await twitchApiFetch(`games?name=${encodeURIComponent(category)}`);
        if (!gameRes.data.length) return res.status(404).json({ success: false, error: "Jeu introuvable." });
        
        const gameId = gameRes.data[0].id;
        const gameArt = gameRes.data[0].box_art_url;

        const streamsRes = await twitchApiFetch(`streams?game_id=${gameId}&first=100&language=fr`); 
        
        let raidCandidates = streamsRes.data.filter(s => s.viewer_count >= 0 && s.viewer_count <= 100);
        
        raidCandidates.sort((a, b) => a.viewer_count - b.viewer_count);

        res.json({
            success: true,
            game_name: gameRes.data[0].name,
            game_art: gameArt,
            candidates: raidCandidates.slice(0, 20).map(s => ({
                user_name: s.user_name,
                user_login: s.user_login,
                viewer_count: s.viewer_count,
                title: s.title,
                thumbnail: s.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
            }))
        });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// ROUTES DATA EXISTANTES
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
            thumbnail_url: stream.thumbnail_url 
        }));
        res.json({ success: true, streams });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data.length) return res.status(404).json({ success: false, error: "Chaîne introuvable." });
        
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`);
        if (!vodRes.data.length) return res.status(404).json({ success: false, error: "Aucune VOD." });
        
        const vod = vodRes.data[0];
        res.json({ 
            success: true, 
            vod: {
                id: vod.id,
                title: vod.title,
                url: vod.url,
                thumbnail_url: vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180'),
                duration: vod.duration 
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/trending_games', async (req, res) => {
    try {
        const data = await twitchApiFetch('games/top?first=20');
        res.json({ success: true, games: data.data });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        
        if (gameRes.data.length > 0 && gameRes.data[0].name.toLowerCase() === query.toLowerCase()) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=10`);
            const viewers = streamsRes.data.reduce((acc, s) => acc + s.viewer_count, 0); 
            
            return res.json({ 
                success: true, 
                type: 'game',
                data: {
                    name: game.name,
                    box_art: game.box_art_url,
                    total_viewers_sample: viewers,
                    top_streamers: streamsRes.data.map(s => ({ name: s.user_name, viewers: s.viewer_count }))
                }
            });
        }
        
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
            return res.json({
                success: true,
                type: 'user',
                data: {
                    login: user.login,
                    display_name: user.display_name,
                    avatar: user.profile_image_url,
                    description: user.description,
                    is_live: streamRes.data.length > 0,
                    live_stats: streamRes.data.length > 0 ? streamRes.data[0] : null
                }
            });
        }
        res.status(404).json({ success: false, message: "Rien trouvé." });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// =========================================================
// ROUTES IA (JSON FIRST)
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";

    switch (type) {
        case 'niche':
            prompt = `Analyse le jeu "${query}" pour un streamer. Retourne ce JSON: 
            {
                "score_niche": (nombre 0-100),
                "verdict": "Court résumé (bon/mauvais plan)",
                "points_forts": ["point 1", "point 2", "point 3"],
                "content_ideas": ["idée 1", "idée 2", "idée 3"],
                "viewer_persona": "Description type du viewer"
            }`;
            break;
        case 'repurpose':
            prompt = `Analyse le titre/thème de cette VOD : "${query}". Imagine 3 clips viraux. Retourne ce JSON:
            {
                "viral_score": (nombre 0-100),
                "clips": [
                    {"time_guess": "00:10:00", "title": "Titre Puteaclic 1", "reason": "Pourquoi ça marche"},
                    {"time_guess": "00:30:00", "title": "Titre Puteaclic 2", "reason": "Humour/Skill"},
                    {"time_guess": "01:00:00", "title": "Titre Puteaclic 3", "reason": "Fail/Win"}
                ]
            }`;
            break;
        case 'trend':
            prompt = `Analyse les tendances Twitch actuelles. Retourne ce JSON:
            {
                "top_opportunity": "Nom du jeu/catégorie",
                "why": "Pourquoi c'est le moment",
                "saturation_level": (nombre 0-100),
                "under_radar_games": ["Jeu 1", "Jeu 2", "Jeu 3"]
            }`;
            break;
        default:
            return res.status(400).json({ success: false, error: "Type invalide." });
    }

    const result = await runGeminiAnalysis(prompt, true);
    if(result.success) return res.json(result);
    res.status(result.status || 500).json(result);
});

app.post('/auto_action', async (req, res) => {
    const { query, action_type } = req.body;
    if (!query) return res.status(400).json({ success: false });

    if (action_type === 'export_metrics') {
        const statsRes = await fetch(`http://localhost:${PORT}/my_profile_stats`); 
        const statsData = await statsRes.json();
        
        if (statsData.success) {
            return res.json({
                success: true,
                data: {
                    views: statsData.stats.view_count, 
                    followers: statsData.stats.follower_count, 
                    broadcaster_type: statsData.stats.broadcaster_type,
                    description: statsData.stats.description
                }
            });
        } else {
            return res.status(401).json({ success: false, error: "Non connecté pour exporter les métriques." });
        }
    }

    let prompt = "";
    if (action_type === 'title_disruption') {
        prompt = `Propose 3 titres Twitch disruptifs pour "${query}". JSON attendu: {"titles": [{"text": "Titre 1", "click_rate": "Haut"}, {"text": "Titre 2", "click_rate": "Moyen"}]}`;
    } else if (action_type === 'create_clip') {
        prompt = `Analyse "${query}" pour un clip. JSON attendu: {"clip_title": "...", "tags": ["tag1", "tag2"]}`;
    }

    const result = await runGeminiAnalysis(prompt, true);
    res.json(result);
});

app.post('/mini_assistant', async (req, res) => {
    const { q, context } = req.body;
    const prompt = `Assistant Twitch (Contexte: ${context}). Question: "${q}". Réponds en HTML très court (< 50 mots).`;
    const result = await runGeminiAnalysis(prompt, false);
    res.json(result);
});

// 🚀 Boost (Action Réelle: Trouver un Raid)
app.post('/stream_boost', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, html_response: "<p style='color:red'>🛑 Vous devez être connecté pour utiliser le Boost.</p>" });

    const channel = CACHE.twitchUser.login;
    const now = Date.now();
    if (CACHE.streamBoosts[channel] && now - CACHE.streamBoosts[channel] < 10800000) {
        return res.status(429).json({ success: false, html_response: "<p style='color:red'>⏳ Cooldown actif. Prochain Boost disponible dans 3 heures.</p>" });
    }

    try {
        const streamRes = await twitchApiFetch(`streams?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        if (!streamRes.data.length) {
            return res.json({ success: false, html_response: "<p style='color:orange'>🛑 Vous n'êtes pas LIVE. Le Boost recherche des raids seulement si vous streamez.</p>" });
        }
        const currentCategory = streamRes.data[0].game_name;

        // Appel à la route /raid_finder (ajustez le port si nécessaire, mais Render utilise les variables d'environnement)
        const raidDataRes = await fetch(`http://localhost:${PORT}/raid_finder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: currentCategory })
        });
        const raidData = await raidDataRes.json();

        CACHE.streamBoosts[channel] = now; 

        if (raidData.success && raidData.candidates.length > 0) {
            const topCandidate = raidData.candidates[0];
            return res.json({ 
                success: true, 
                html_response: `<p style='color:#00e676'>🚀 <strong>BOOST ACTIVÉ !</strong> Raid suggéré: <strong>${topCandidate.user_name}</strong> (${topCandidate.viewer_count} viewers). Lancez <code>/raid ${topCandidate.user_login}</code> !</p>`,
                raidCandidate: topCandidate 
            });
        }
        
        return res.json({ success: false, html_response: "<p style='color:gray'>🔍 Boost activé, mais aucun candidat au Raid trouvé dans votre niche (0-100 viewers).</p>" });

    } catch (e) {
        console.error("Erreur Boost:", e);
        res.status(500).json({ success: false, html_response: `<p style='color:red'>Erreur de service: ${e.message}</p>` });
    }
});

// =========================================================
// ROUTE RACINE (NicheOptimizer.html) ✅ FIX POUR CANNOT GET /
// =========================================================

app.get('/', (req, res) => {
    // Serve NicheOptimizer.html
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
