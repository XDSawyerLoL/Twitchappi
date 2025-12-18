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
// CONFIGURATION
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// ✅ MISE À JOUR DEMANDÉE : Modèle Gemini 3 Preview
const GEMINI_MODEL = "gemini-3-pro-preview"; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("FATAL ERROR: VARIABLES D'ENVIRONNEMENT MANQUANTES.");
    process.exit(1); 
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// Cache
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
        fetchCooldown: 10 * 60 * 1000 // Refresh 10 min
    }
};

// =========================================================
// HELPER TWITCH & IA
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
    } catch (error) { return null; }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Accès Twitch non autorisé.");
    
    // Gestion propre des séparateurs d'URL (? ou &)
    const separator = endpoint.includes('?') ? '&' : '?';
    const finalUrl = `https://api.twitch.tv/helix/${endpoint}`;

    const res = await fetch(finalUrl, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur 401 Token invalide.`);
    }
    if (!res.ok) throw new Error(`Erreur API Twitch: ${res.status}`);
    return res.json();
}

async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                systemInstruction: "Tu es un stratège Twitch expert en data. Réponds TOUJOURS en HTML simple (<ul>, <li>, <h4>, <strong>, <p>, <span style='color:...'>) sans balises <html>/<body>."
            }
        });
        return { success: true, html_response: response.text().trim() };
    } catch (e) {
        return { success: false, status: 500, error: e.message, html_response: `<p style="color:red;">Erreur IA (${GEMINI_MODEL}): ${e.message}</p>` };
    }
}

// =========================================================
// ROUTES AUTH
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
            res.send(`<script>if(window.opener){window.opener.postMessage('auth_success','*');window.close();}else{window.location.href='/';}</script>`);
        } else { res.status(500).send("Échec échange code."); }
    } catch (e) { res.status(500).send(`Erreur Auth: ${e.message}`); }
});

app.post('/twitch_logout', (req, res) => { CACHE.twitchUser = null; res.json({ success: true }); });
app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) return res.json({ is_connected: true, display_name: CACHE.twitchUser.display_name });
    CACHE.twitchUser = null; res.json({ is_connected: false });
});

// =========================================================
// API ROUTES
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        return res.json({ success: true, streams: data.data });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            const streamRes = await twitchApiFetch(`streams?user_id=${user.id}`).catch(()=>({data:[]}));
            const userData = { 
                type: 'user', login: user.login, display_name: user.display_name, profile_image_url: user.profile_image_url,
                is_live: streamRes.data.length > 0, viewer_count: streamRes.data.length > 0 ? streamRes.data[0].viewer_count : 0,
                game_name: streamRes.data.length > 0 ? streamRes.data[0].game_name : '', total_views: user.view_count,
                ai_calculated_niche_score: 'Calcul...'
            };
            CACHE.lastScanData = userData;
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const gameData = {
                type: 'game', name: game.name, box_art_url: game.box_art_url,
                total_viewers: streamsRes.data.reduce((sum, s) => sum + s.viewer_count, 0),
                total_streamers: streamsRes.data.length,
                ai_calculated_niche_score: 'Calcul...'
            };
            CACHE.lastScanData = gameData;
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        return res.status(404).json({ success: false, message: "Non trouvé" });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

app.post('/analyze_golden_hour', async (req, res) => {
    const { game, date } = req.body;
    const prompt = `Agis comme un expert data analyst Twitch. Je veux streamer "${game}" le "${date}".
        Identifie "L'Heure d'Or" (visibilité max/concurrence min). 
        Format HTML strict (titres <h4>, listes <ul>, gras <strong>). Sois précis.`;
    const result = await runGeminiAnalysis(prompt);
    return res.json(result);
});

app.post('/critique_ia', async (req, res) => {
    const { type, query } = req.body;
    let prompt = `Analyse Twitch: ${query}. `;
    if (type === 'niche') prompt += "Donne 3 faiblesses concurrents et 1 opportunité. Format HTML.";
    if (type === 'repurpose') prompt += "Donne 3 timestamps clipables. Format HTML.";
    const result = await runGeminiAnalysis(prompt);
    return res.json(result);
});

// =========================================================
// ✅ ROTATION 0-100 VIEWERS (LOGIQUE RÉPARÉE & APPROFONDIE)
// =========================================================
async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;
    
    try {
        console.log("Rafraîchissement liste streams...");
        
        // 1. Récupérer les 100 premiers (souvent > 100 vues)
        let response = await twitchApiFetch(`streams?language=fr&first=100`);
        let allStreams = response.data || [];
        
        // 2. Filtre Strict : On ne garde que ceux <= 100
        let smallStreams = allStreams.filter(s => s.viewer_count <= 100);

        // 3. SI PAS ASSEZ DE PETITS STREAMS DANS LA PAGE 1 : ON CHERCHE PLUS LOIN
        // C'est ici que la logique "marche" pour trouver les 0-100 viewers cachés derrière les gros.
        if (smallStreams.length < 20 && response.pagination && response.pagination.cursor) {
            console.log("Recherche approfondie (Page 2) pour trouver des petits streams...");
            try {
                const responsePage2 = await twitchApiFetch(`streams?language=fr&first=100&after=${response.pagination.cursor}`);
                const page2Streams = responsePage2.data || [];
                const smallPage2 = page2Streams.filter(s => s.viewer_count <= 100);
                
                // On fusionne
                smallStreams = [...smallStreams, ...smallPage2];
            } catch (err) {
                console.error("Erreur page 2:", err.message);
            }
        }

        // 4. Fallback de sécurité (si vraiment l'API est vide ou bug)
        if (smallStreams.length === 0 && allStreams.length > 0) {
            // On prend les 10 derniers de la liste (les plus petits trouvés)
            smallStreams = allStreams.slice(-10);
        }

        // On enlève les doublons potentiels et on stocke
        const uniqueStreams = [...new Map(smallStreams.map(item => [item.user_login, item])).values()];
        
        rotation.streams = uniqueStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        rotation.currentIndex = 0;
        rotation.lastFetchTime = now;
        console.log(`Rotation mise à jour : ${rotation.streams.length} chaînes trouvées (<=100 vues).`);

    } catch (e) { console.error("Erreur Rotation:", e.message); }
}

app.get('/get_default_stream', async (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const remaining = Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 60000);
        return res.json({ success: true, channel: CACHE.boostedStream.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${remaining} min)` });
    }
    await refreshGlobalStreamList(); 
    const rotation = CACHE.globalStreamRotation;
    
    // Protection contre liste vide
    if (rotation.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: "Aucun stream trouvé." });
    
    const currentStream = rotation.streams[rotation.currentIndex];
    return res.json({ success: true, channel: currentStream.channel, viewers: currentStream.viewers, message: `Cycle 0-100: ${currentStream.channel} (${currentStream.viewers} vues)` });
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

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    CACHE.boostedStream = { channel, endTime: Date.now() + 15 * 60 * 1000 };
    return res.json({ success: true, html_response: `<p style="color:pink">✅ Boost activé pour ${channel}</p>` });
});

app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.json({ is_boosted: true, channel: CACHE.boostedStream.channel, remaining_seconds: Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 1000) });
    return res.json({ is_boosted: false });
});

app.get('/export_csv', (req, res) => { res.send("CSV Export"); });
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));
