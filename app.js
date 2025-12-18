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
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// ✅ CORRECTIF: Modèle stable inclus dans le forfait Pro (évite l'erreur 429)
const GEMINI_MODEL = "gemini-1.5-pro"; 

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
console.log("DEBUG: Toutes les clés critiques sont chargées. L'IA est ACTIVE sur " + GEMINI_MODEL);

// =========================================================
// MIDDLEWARES
// =========================================================

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// Cache simple en mémoire
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {},       // Cooldowns
    boostedStream: null,    // Boost actif
    lastScanData: null,     // Données pour export CSV
    
    // Rotation globale
    globalStreamRotation: {
        streams: [],    
        currentIndex: 0,
        lastFetchTime: 0,
        fetchCooldown: 15 * 60 * 1000 // 15 minutes
    }
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
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        } else {
            console.error("Échec token Twitch:", data);
            return null;
        }
    } catch (error) {
        console.error("Erreur réseau token Twitch:", error);
        return null;
    }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Accès Twitch non autorisé.");

    // Gestion propre du séparateur d'URL (? ou &)
    const separator = endpoint.includes('?') ? '&' : '?';
    //const finalUrl = `https://api.twitch.tv/helix/${endpoint}`; // Pas besoin si endpoint contient déjà query params, fetch gère l'url de base si on concatène

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur 401 Token invalide.`);
    }
    
    if (!res.ok) {
        throw new Error(`Erreur API Twitch: ${res.status}`);
    }

    return res.json();
}

// =========================================================
// LOGIQUE GEMINI HELPER
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        const model = ai.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            // Instruction système simplifiée pour compatibilité
            systemInstruction: "Tu es un expert Twitch. Réponds en HTML simple (<ul>, <li>, <h4>, <strong>, <p>) sans balises <html>/<body>."
        });
        
        return { success: true, html_response: result.response.text() };

    } catch (e) {
        let statusCode = 500;
        let errorMessage = `Erreur IA: ${e.message}`;
        
        if (e.message.includes('429')) {
             statusCode = 429;
             errorMessage = `❌ Erreur Quota (429). Le modèle est saturé.`;
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
// ROUTES AUTH (AVEC FIX POPUP)
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("État invalide.");

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
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
                ...user, 
                access_token: tokenData.access_token, 
                expiry: Date.now() + (tokenData.expires_in * 1000) 
            };
            
            // ✅ SCRIPT DE FERMETURE DU POPUP
            res.send(`
                <script>
                    if(window.opener) {
                        window.opener.postMessage('auth_success', '*');
                        window.close();
                    } else {
                        window.location.href = '/';
                    }
                </script>
            `);
        } else {
            res.status(500).send("Échec échange code.");
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
        return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    }
    CACHE.twitchUser = null; 
    res.json({ is_connected: false });
});

// =========================================================
// ROUTES API DATA (SCAN, VOD, SUIVI)
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        return res.json({ success: true, streams: data.data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data.length) return res.json({ success: false });
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`);
        if (!vodRes.data.length) return res.json({ success: false });
        
        const vod = vodRes.data[0];
        // Correction de l'URL thumbnail
        vod.thumbnail_url = vod.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180');
        return res.json({ success: true, vod: vod });
    } catch (e) { return res.json({ success: false }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        // 1. Essai Utilisateur
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`).catch(()=>({data:[]}));
            
            // Stats complémentaires
            let followerCount = 'N/A';
            try { const f = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`); followerCount = f.total; } catch(e){}
            
            let vodCount = 'N/A';
            try { const v = await twitchApiFetch(`videos?user_id=${user.id}&type=archive&first=1`); vodCount = v.total; } catch(e){}

            const userData = { 
                type: 'user',
                login: user.login, 
                display_name: user.display_name, 
                profile_image_url: user.profile_image_url,
                is_live: streamRes.data.length > 0,
                viewer_count: streamRes.data.length > 0 ? streamRes.data[0].viewer_count : 0,
                game_name: streamRes.data.length > 0 ? streamRes.data[0].game_name : '',
                total_views: user.view_count,
                vod_count: vodCount,
                total_followers: followerCount,
                creation_date: new Date(user.created_at).toLocaleDateString(),
                broadcaster_type: user.broadcaster_type || 'normal',
                ai_calculated_niche_score: 'Calcul...'
            };
            CACHE.lastScanData = userData;
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // 2. Essai Jeu
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const gameData = {
                type: 'game',
                name: game.name,
                box_art_url: game.box_art_url,
                total_viewers: streamsRes.data.reduce((sum, s) => sum + s.viewer_count, 0),
                total_streamers: streamsRes.data.length,
                avg_viewers_per_streamer: Math.round(streamsRes.data.reduce((sum, s) => sum + s.viewer_count, 0) / (streamsRes.data.length || 1)),
                ai_calculated_niche_score: 'Calcul...'
            };
            CACHE.lastScanData = gameData;
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        return res.status(404).json({ success: false, message: "Non trouvé" });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// ✅ ROTATION 0-100 VUES (AMÉLIORÉE: PAGINATION)
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;
    
    try {
        console.log("REFRESH: Recherche de streams 0-100 viewers...");
        
        let allStreams = [];
        let cursor = "";
        
        // On récupère jusqu'à 3 pages (300 streams) pour être SÛR de trouver des petits streams
        // car les 100 premiers de Twitch sont souvent > 100 viewers.
        for (let i = 0; i < 3; i++) {
            const pagination = cursor ? `&after=${cursor}` : "";
            const response = await twitchApiFetch(`streams?language=fr&first=100${pagination}`);
            
            if (response.data && response.data.length > 0) {
                allStreams = allStreams.concat(response.data);
                cursor = response.pagination ? response.pagination.cursor : null;
                if (!cursor) break;
            } else {
                break;
            }
        }

        // FILTRE STRICT : Entre 0 et 100 viewers
        let suitableStreams = allStreams.filter(stream => stream.viewer_count <= 100);

        // Fallback: Si aucun <100, on prend les plus petits trouvés (les derniers de la liste)
        if (suitableStreams.length === 0 && allStreams.length > 0) {
            suitableStreams = allStreams.slice(-20); 
        }

        // Mise en cache (sans doublons)
        const uniqueStreams = [...new Map(suitableStreams.map(item => [item.user_login, item])).values()];
        rotation.streams = uniqueStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        rotation.currentIndex = 0;
        rotation.lastFetchTime = now;
        console.log(`REFRESH OK: ${rotation.streams.length} chaînes trouvées.`);
        
    } catch (e) {
        console.error("Erreur refresh rotation:", e.message);
    }
}

app.get('/get_default_stream', async (req, res) => {
    // 1. Boost
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const remaining = Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 60000);
        return res.json({ 
            success: true, 
            channel: CACHE.boostedStream.channel, 
            viewers: 'BOOST', 
            message: `⚡ BOOST ACTIF (${remaining} min)` 
        });
    }

    // 2. Rotation
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch', message: "Aucun stream dispo." });
    }

    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ 
        success: true, 
        channel: currentStream.channel,
        viewers: currentStream.viewers,
        message: `Cycle 0-100: ${currentStream.channel} (${currentStream.viewers} vues)`
    });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ error: "Boost actif." });

    await refreshGlobalStreamList();
    const rotation = CACHE.globalStreamRotation;
    if (rotation.streams.length === 0) return res.status(404).json({ error: "Liste vide." });

    if (direction === 'next') rotation.currentIndex = (rotation.currentIndex + 1) % rotation.streams.length;
    else rotation.currentIndex = (rotation.currentIndex - 1 + rotation.streams.length) % rotation.streams.length;

    const newStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: newStream.channel, viewers: newStream.viewers });
});

app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ is_boosted: true, channel: CACHE.boostedStream.channel, remaining_seconds: Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 1000) });
    }
    return res.json({ is_boosted: false });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    // Cooldown check simplifié pour l'exemple
    CACHE.boostedStream = { channel, endTime: Date.now() + 15 * 60 * 1000 };
    return res.json({ success: true, html_response: `<p style="color:pink">✅ Boost activé pour ${channel}</p>` });
});

// =========================================================
// ✅ IA ET ANALYSES (NOUVELLE ROUTE GOLDEN HOUR)
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = `Analyse Twitch pour : ${query}. Score: ${niche_score || 'N/A'}. `;
    
    if (type === 'niche') prompt += "Donne 3 points faibles et 1 opportunité cachée. Format HTML.";
    if (type === 'repurpose') prompt += "Analyse la dernière VOD (si dispo) ou le style. Donne 3 idées de clips TikTok. Format HTML.";
    
    const result = await runGeminiAnalysis(prompt);
    return res.json(result);
});

// NOUVELLE ROUTE POUR L'ONGLET HEURE D'OR
app.post('/analyze_golden_hour', async (req, res) => {
    const { game, date } = req.body;
    const prompt = `Agis comme un expert data analyst Twitch. Pour le jeu "${game}" à la date "${date}" (ou aujourd'hui), identifie l'Heure d'Or (le créneau avec le meilleur ratio viewers/faible concurrence). 
    Réponds en HTML simple (<h4> pour le créneau, <ul> pour les raisons).`;
    
    const result = await runGeminiAnalysis(prompt);
    return res.json(result);
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if(gameRes.data.length === 0) return res.json({success:false, error: "Jeu introuvable"});
        
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100`);
        const targets = streamsRes.data.filter(s => s.viewer_count <= max_viewers);
        
        if(targets.length > 0) {
            const t = targets[0]; // Prend le premier qui match
            return res.json({success: true, target: { name: t.user_name, login: t.user_login, viewers: t.viewer_count, game: t.game_name, thumbnail_url: t.thumbnail_url }});
        }
        return res.json({success: false, error: "Aucune cible trouvée."});
    } catch(e) { return res.json({success:false, error: e.message}); }
});

app.get('/export_csv', (req, res) => { 
    if(!CACHE.lastScanData) return res.status(404).send("Pas de données.");
    // Logique export CSV simplifiée
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Export.csv');
    res.send(`Type,Nom\n${CACHE.lastScanData.type},${CACHE.lastScanData.type === 'user' ? CACHE.lastScanData.user_data.display_name : CACHE.lastScanData.game_data.name}`);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));
