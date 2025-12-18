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

// Correction Modèle pour éviter erreur 404/429
const GEMINI_MODEL = "gemini-1.5-pro"; 

// =========================================================
// VÉRIFICATION CRITIQUE AU DÉMARRAGE
// =========================================================

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    process.exit(1); 
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

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
    streamBoosts: {},       
    boostedStream: null,    
    lastScanData: null,     
    
    globalStreamRotation: {
        streams: [],    
        currentIndex: 0,
        lastFetchTime: 0,
        fetchCooldown: 15 * 60 * 1000 
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
        }
        return null;
    } catch (error) {
        console.error("Erreur Token:", error);
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
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur 401 Token invalide.`);
    }
    
    if (!res.ok) throw new Error(`Erreur API Twitch: ${res.status}`);

    return res.json();
}

// =========================================================
// LOGIQUE GEMINI HELPER
// =========================================================

async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Tu es un expert Twitch. Réponds en HTML simple (<ul>, <li>, <h4>, <strong>, <p>) sans balises <html>/<body>."
            }
        });
        return { success: true, html_response: response.text().trim() };
    } catch (e) {
        return { 
            success: false, 
            status: 500, 
            error: e.message,
            html_response: `<p style="color:red;">Erreur IA: ${e.message}</p>`
        };
    }
}

// =========================================================
// ROUTES AUTH (FIX POPUP)
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
            CACHE.twitchUser = { ...user, access_token: tokenData.access_token, expiry: Date.now() + (tokenData.expires_in * 1000) };
            
            // --- FIX : RENVOYER UN SCRIPT QUI FERME LE POPUP ---
            res.send(`
                <html>
                <head><title>Connexion Réussie</title></head>
                <body style="background:#111; color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
                    <div style="text-align:center;">
                        <h2>✅ Connexion Réussie !</h2>
                        <p>Fermeture de la fenêtre...</p>
                    </div>
                    <script>
                        // Envoie le message à la fenêtre principale
                        if (window.opener) {
                            window.opener.postMessage('auth_success', '*');
                            window.close();
                        } else {
                            // Fallback si pas ouvert en popup
                            window.location.href = '/';
                        }
                    </script>
                </body>
                </html>
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
// ROUTES API DATA
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
        return res.json({ success: true, vod: vodRes.data[0] });
    } catch (e) { return res.json({ success: false }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`).catch(()=>({data:[]}));
            
            const userData = { 
                type: 'user',
                login: user.login, 
                display_name: user.display_name, 
                profile_image_url: user.profile_image_url,
                is_live: streamRes.data.length > 0,
                viewer_count: streamRes.data.length > 0 ? streamRes.data[0].viewer_count : 0,
                game_name: streamRes.data.length > 0 ? streamRes.data[0].game_name : '',
                total_views: user.view_count,
                vod_count: 0, // Placeholder
                creation_date: new Date(user.created_at).toLocaleDateString(),
                broadcaster_type: user.broadcaster_type || 'normal',
                total_followers: 'N/A', // Require extra call
                ai_calculated_niche_score: 'Calcul...'
            };
            CACHE.lastScanData = userData;
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // Recherche Jeu
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
// LOGIQUE ROTATION & HEURE D'OR
// =========================================================

// Helper pour déterminer si c'est l'heure d'or (Ex: 18h - 23h)
function checkGoldenHour() {
    const hour = new Date().getHours();
    // Heure d'or définie entre 18h et 23h (heure serveur)
    return hour >= 18 && hour <= 23;
}

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const allStreams = data.data;

        // Filtre 0-100 viewers
        let suitableStreams = allStreams.filter(stream => stream.viewer_count <= 100);

        // Fallback
        if (suitableStreams.length === 0 && allStreams.length > 0) {
            suitableStreams = allStreams.sort((a, b) => a.viewer_count - b.viewer_count).slice(0, 10);
        }

        rotation.streams = suitableStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        rotation.currentIndex = 0;
        rotation.lastFetchTime = now;
        
    } catch (e) {
        console.error("Erreur rotation:", e.message);
    }
}

app.get('/get_default_stream', async (req, res) => {
    // 1. Check Boost
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const remaining = Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 60000);
        return res.json({ 
            success: true, 
            channel: CACHE.boostedStream.channel, 
            viewers: 'BOOST', 
            message: `⚡ BOOST ACTIF (${remaining} min)`,
            is_golden_hour: checkGoldenHour()
        });
    }

    // 2. Rotation
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    if (rotation.streams.length === 0) {
        return res.json({ success: true, channel: 'twitch', message: "Aucun stream dispo.", is_golden_hour: checkGoldenHour() });
    }

    const currentStream = rotation.streams[rotation.currentIndex];
    const isGolden = checkGoldenHour();

    return res.json({ 
        success: true, 
        channel: currentStream.channel,
        viewers: currentStream.viewers,
        message: isGolden 
            ? `🌟 HEURE D'OR ACTIVE: ${currentStream.channel}` 
            : `Cycle Auto: ${currentStream.channel} (${currentStream.viewers} vues)`,
        is_golden_hour: isGolden
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
    return res.json({ success: true, channel: newStream.channel, viewers: newStream.viewers, is_golden_hour: checkGoldenHour() });
});

app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ is_boosted: true, channel: CACHE.boostedStream.channel, remaining_seconds: Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 1000) });
    }
    return res.json({ is_boosted: false });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    CACHE.boostedStream = { channel, endTime: Date.now() + 15 * 60 * 1000 };
    return res.json({ success: true, html_response: `<p style="color:pink">✅ Boost activé pour ${channel}</p>` });
});

app.post('/start_raid', async (req, res) => {
     const { game, max_viewers } = req.body;
     // ... (Simplifié pour l'exemple, reprendre ta logique si besoin)
    return res.json({ success: false, error: "Fonction raid simplifiée." });
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = `Analyse Twitch pour : ${query}. Score: ${niche_score}. `;
    if (type === 'niche') prompt += "Donne 3 points faibles et 1 opportunité cachée. Format HTML.";
    if (type === 'repurpose') prompt += "Donne 3 timestamps pour des clips TikTok. Format HTML.";
    
    const result = await runGeminiAnalysis(prompt);
    return res.json(result);
});

app.get('/export_csv', (req, res) => { res.send("CSV Export"); });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));
