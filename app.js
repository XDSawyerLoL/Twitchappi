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

// Cache en mémoire
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {}
};

// =========================================================
// HELPERS TWITCH & GEMINI
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
            return null;
        }
    } catch (error) {
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
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${errorText}`);
    }

    return res.json();
}

/**
 * Exécute une requête Gemini en demandant une réponse JSON stricte.
 * @param {string} prompt - Le prompt à envoyer.
 * @param {string} format - 'json' ou 'html'
 */
async function runGeminiAnalysis(prompt, format = 'json') {
    if (!ai) return { success: false, error: "Clé IA manquante." };

    try {
        let systemInstruction;
        
        if (format === 'json') {
            systemInstruction = "Tu es un expert Twitch. Réponds UNIQUEMENT avec un objet JSON valide, sans Markdown (```json) ni texte, avant ou après. Strictement un objet JSON.";
        } else {
            systemInstruction = "Tu es un assistant Twitch expert. Formate toujours ta réponse en utilisant des balises HTML standard (<ul>, <p>, <strong>, etc.) pour une intégration directe dans un div. Sois concis.";
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
        
        return { success: true, html_response: text }; 

    } catch (e) {
        console.error("Erreur Gemini:", e.message);
        let status = 500;
        if (e.message.includes('429') || e.message.includes('Quota')) status = 429;
        return { success: false, status, error: e.message };
    }
}


// =========================================================
// ROUTES AUTHENTIFICATION (INCHANGÉES)
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
// ROUTE : MON FIL SUIVI (INCHANGÉE)
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
            thumbnail_url: stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')
        }));
        res.json({ success: true, streams });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});


// =========================================================
// ROUTE : SCAN CIBLE (INCHANGÉE)
// =========================================================

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
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
                game_data: {
                    name: game.name,
                    box_art_url: game.box_art_url,
                    total_streamers: totalStreamers,
                    total_viewers: totalViewers,
                    avg_viewers_per_streamer: avgViewersPerStreamer,
                    streams: topStreams
                }
            });
        }
        
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`);
            const isLive = streamRes.data.length > 0;

            return res.json({
                success: true,
                type: 'user',
                user_data: {
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
// ROUTES IA (CRITIQUE CONSOLIDÉE) ✅ MISE À JOUR MAJEURE
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = "";
    
    // Définition de la structure JSON RICH pour Niche et Repurpose
    const jsonStructure = `{
        "score_niche": (nombre 0-100),
        "verdict": "Court résumé (bon/mauvais plan)",
        "points_forts": ["point 1", "point 2", "point 3"],
        "content_ideas": ["idée 1", "idée 2", "idée 3"],
        "disruptive_title": "Un titre d'appel pour Twitch (ultra-putaclic)",
        "viewer_persona": "Description type du viewer (en une phrase)"
        ${type === 'repurpose' ? ', "viral_clips": [{"time_guess": "00:10:00", "title": "Titre Puteaclic", "reason": "Pourquoi ça marche"}, {"time_guess": "00:30:00", "title": "...", "reason": "..."}]' : ''}
    }`;

    switch (type) {
        case 'niche':
            prompt = `Analyse le jeu ou la catégorie Twitch "${query}" pour un streamer débutant (0-50 viewers). 
            Réponds uniquement avec l'objet JSON suivant. Le score de niche (0-100) doit refléter l'opportunité (bas = saturé, haut = inexploité). 
            Structure attendue: ${jsonStructure}`;
            break;
            
        case 'repurpose':
            prompt = `Analyse le titre/thème de cette VOD : "${query}". Ton objectif est de trouver des idées de clips viraux ET une stratégie de niche autour de ce contenu. 
            Réponds uniquement avec l'objet JSON suivant. L'objet viral_clips est obligatoire.
            Structure attendue: ${jsonStructure}`;
            break;

        case 'trend':
            // Le trend reste un appel à part mais renvoie aussi du JSON structuré
            prompt = `Analyse les tendances Twitch actuelles pour les petits streamers. Retourne ce JSON:
            {
                "top_opportunity": "Nom du jeu/catégorie la plus prometteuse",
                "why": "Pourquoi c'est le moment",
                "saturation_level": (nombre 0-100, 100=saturé),
                "under_radar_games": ["Jeu 1", "Jeu 2", "Jeu 3"]
            }`;
            // On utilise le 'json' format pour le trend aussi
            break;
            
        default:
            return res.status(400).json({ success: false, error: "Type d'analyse IA invalide." });
    }

    // Un seul appel IA pour les trois types, toujours en JSON
    const result = await runGeminiAnalysis(prompt, 'json'); 
    
    if(result.success) return res.json(result);
    // Si échec (quota 429), renvoyer l'erreur complète
    res.status(result.status || 500).json(result);
});


// =========================================================
// ROUTES IA ACTIONS (/auto_action) - 'title_disruption' SUPPRIMÉ
// =========================================================

app.post('/auto_action', async (req, res) => {
    const { query, action_type } = req.body;
    
    if (action_type === 'export_metrics') {
        // ... (Logique export_metrics inchangée) ...
        if (!CACHE.twitchUser) {
             return res.status(401).json({ success: false, html_response: "<p style='color:red'>🛑 Non connecté à Twitch pour exporter les métriques.</p>" });
        }
        
        // Simulation de données de métriques
        return res.json({
            success: true,
            html_response: `<p style="color:var(--color-ai-niche); font-weight:bold; text-align:center;">📊 Export réussi ! Metrics mis à jour dans le rapport.</p>`,
            metrics: {
                views: CACHE.twitchUser.view_count || 150000, 
                retention: 0.65, 
                followers: CACHE.twitchUser.view_count ? Math.floor(CACHE.twitchUser.view_count * 0.05 + 100) : 1200 
            }
        });
    }

    let prompt = "";
    if (action_type === 'create_clip') {
        prompt = `Tu as 30 secondes pour faire un clip basé sur le thème "${query}". 
        Décris en HTML le meilleur moment à capturer et quel "hook" (phrase d'accroche) utiliser dans le titre du clip.`;
    } else {
        return res.status(400).json({ success: false, error: "Action non prise en charge." });
    }

    // Le create_clip renvoie du HTML simple
    const result = await runGeminiAnalysis(prompt, 'html');
    
    if(result.success) {
        return res.json({ success: true, html_response: result.html_response });
    }
    
    res.status(result.status || 500).json(result);
});


// =========================================================
// AUTRES ROUTES (MINI ASSISTANT & BOOST) (INCHANGÉES)
// =========================================================

app.post('/mini_assistant', async (req, res) => {
    const { q, context } = req.body;
    const prompt = `Assistant Twitch (Contexte: ${context}). Question: "${q}". Réponds en texte simple et cours (< 50 mots).`;
    const result = await runGeminiAnalysis(prompt, 'text');
    
    if (result.success) {
        return res.json({ success: true, html_response: result.html_response });
    }
    
    res.status(result.status || 500).json(result);
});

app.post('/stream_boost', async (req, res) => {
    // ... (Logique stream_boost inchangée) ...
     if (!CACHE.twitchUser) {
         return res.status(401).json({ success: false, html_response: "<p style='color:red'>🛑 Vous devez être connecté pour utiliser le Boost.</p>" });
    }

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
                <div class="card p-3 rounded mt-2 bg-gray-900 border border-gray-700">
                    <p>Raid suggéré dans votre niche (${currentCategory}):</p>
                    <p><strong>${topCandidate.user_name}</strong> (${topCandidate.viewer_count} viewers)</p>
                    <button onclick="navigator.clipboard.writeText('/raid ${topCandidate.user_login}')" class="bg-[#ff0099] text-white p-2 rounded mt-2">Copier: /raid ${topCandidate.user_login}</button>
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
        res.status(500).json({ success: false, html_response: `<p style='color:red'>Erreur de service: ${e.message}</p>` });
    }
});


// =========================================================
// ROUTE RACINE & DÉMARRAGE SERVEUR
// =========================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur prêt sur http://localhost:${PORT}`);
});
