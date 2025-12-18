const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// ✅ FIX : On utilise le modèle 1.5 Pro qui a un quota API gratuit et stable
const GEMINI_MODEL = "gemini-1.5-pro"; 

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("❌ ERREUR FATALE : Variables d'environnement manquantes.");
    process.exit(1); 
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); 

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// --- CACHE & VARIABLES GLOBALES ---
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    boostedStream: null,    
    globalStreamRotation: {
        streams: [],    
        currentIndex: 0,
        lastFetchTime: 0,
        fetchCooldown: 5 * 60 * 1000 // Refresh toutes les 5 min
    }
};

// --- FONCTIONS UTILES ---

async function getTwitchToken() {
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) return CACHE.twitchTokens.app.access_token;
    
    try {
        const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens.app = { access_token: data.access_token, expiry: Date.now() + (data.expires_in * 1000) - 60000 };
            return data.access_token;
        }
    } catch (e) { console.error("Erreur Token:", e); }
    return null;
}

async function twitchApiFetch(endpoint) {
    const token = await getTwitchToken();
    if (!token) throw new Error("Pas de token Twitch.");
    
    // Correction gestion des séparateurs d'URL
    const separator = endpoint.includes('?') ? '&' : '?';
    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) throw new Error(`API Twitch Erreur: ${res.status}`);
    return res.json();
}

async function runGeminiAnalysis(prompt) {
    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: "Tu es un expert Twitch. Réponds en HTML simple (<ul>, <li>, <h4>, <strong>) sans balises <html>." }
        });
        
        // Gestion de la réponse selon la structure de l'API (parfois .text(), parfois .response.text())
        const textResponse = typeof response.text === 'function' ? response.text() : 
                             (response.response && typeof response.response.text === 'function') ? response.response.text() : "Réponse vide.";
                             
        return { success: true, html_response: textResponse.trim() };
    } catch (e) {
        return { success: false, error: e.message, html_response: `<p style="color:red">Erreur IA (${GEMINI_MODEL}) : ${e.message}</p>` };
    }
}

// --- LOGIQUE ROTATION 0-100 VIEWERS (PAGINATION INCLUSE) ---

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rotation = CACHE.globalStreamRotation;
    
    if (now - rotation.lastFetchTime < rotation.fetchCooldown && rotation.streams.length > 0) return;

    try {
        console.log("Rafraîchissement liste streams...");

        // 1. Récupération large (Page 1)
        let data = await twitchApiFetch(`streams?language=fr&first=100`);
        let streams = data.data || [];

        // 2. Si on a une pagination, on va chercher la Page 2 pour trouver plus de petits streams
        if (data.pagination && data.pagination.cursor) {
            try {
                let data2 = await twitchApiFetch(`streams?language=fr&first=100&after=${data.pagination.cursor}`);
                if (data2.data) streams = streams.concat(data2.data);
            } catch(e) { console.error("Erreur pagination:", e.message); }
        }

        // 3. FILTRE STRICT : 0 à 100 Viewers
        let smallStreams = streams.filter(s => s.viewer_count <= 100);

        // 4. Fallback : Si aucun petit stream trouvé, on prend les 20 derniers de la liste globale
        if (smallStreams.length === 0 && streams.length > 0) {
            smallStreams = streams.slice(-20);
        }

        // 5. Mise à jour Rotation (Suppression doublons via Map)
        if (smallStreams.length > 0) {
            const uniqueStreams = [...new Map(smallStreams.map(item => [item.user_login, item])).values()];
            rotation.streams = uniqueStreams.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rotation.currentIndex = 0;
            rotation.lastFetchTime = now;
            console.log(`[ROTATION] ${rotation.streams.length} chaînes chargées (Filtre <= 100).`);
        }
    } catch (e) { console.error("Erreur Refresh Streams:", e); }
}

// --- ROUTES API ---

// 1. LECTEUR & ROTATION
app.get('/get_default_stream', async (req, res) => {
    // Boost Prioritaire
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ success: true, channel: CACHE.boostedStream.channel, viewers: 'BOOST', message: '⚡ BOOST ACTIF' });
    }
    
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: 'Aucun stream trouvé.' });
    
    const s = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `Cycle: ${s.channel} (${s.viewers} vues)` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ error: "Boost actif." });
    
    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.status(404).json({ error: "Liste vide" });
    
    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;
    
    const s = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers });
});

// 2. SCAN & DASHBOARD
app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    try {
        const uRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`);
        if (uRes.data && uRes.data.length > 0) {
            const u = uRes.data[0];
            const sRes = await twitchApiFetch(`streams?user_id=${u.id}`).catch(()=>({data:[]}));
            const isLive = sRes.data && sRes.data.length > 0;
            
            const userData = {
                type: 'user', display_name: u.display_name, profile_image_url: u.profile_image_url,
                is_live: isLive, viewer_count: isLive ? sRes.data[0].viewer_count : 0,
                game_name: isLive ? sRes.data[0].game_name : 'Offline', description: u.description
            };
            return res.json({ success: true, type: 'user', data: userData });
        }
        return res.json({ success: false, message: "Chaîne non trouvée." });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

// 3. IA (GEMINI 1.5 PRO)
app.post('/critique_ia', async (req, res) => {
    const { query } = req.body;
    const prompt = `Analyse la chaîne Twitch "${query}". Donne 3 points faibles marketing et 1 opportunité cachée. Format HTML.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/analyze_golden_hour', async (req, res) => {
    const { game, date } = req.body;
    const prompt = `Pour le jeu "${game}" le "${date}", quel est le meilleur créneau horaire (Heure d'Or) pour streamer avec peu de concurrence ? Donne une réponse stratégique courte avec horaires précis. Format HTML.`;
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

// 4. AUTH & SYSTEME
app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=user:read:follows&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code } = req.query;
    try {
        const r = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST', body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI })
        });
        const d = await r.json();
        if(d.access_token) {
            res.send(`<script>if(window.opener){window.opener.postMessage('auth_success','*');window.close();}else{window.location.href='/';}</script>`);
        } else res.send("Erreur Auth.");
    } catch(e) { res.send(e.message); }
});

app.get('/twitch_user_status', (req, res) => res.json({ is_connected: false })); 
app.get('/followed_streams', (req, res) => res.json({ success: true, streams: [] })); 

// Serveur
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
