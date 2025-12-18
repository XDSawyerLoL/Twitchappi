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
const GEMINI_MODEL = "gemini-2.0-flash-exp"; // Modèle rapide recommandé

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

// Cache simple en mémoire
const CACHE = {
    twitchTokens: {}, 
    twitchUser: null,
    streamBoosts: {},       // Cooldown (3 heures)
    boostedStream: null,    // Boost actif
    lastScanData: null,     // Cache Export CSV
    
    // Rotation globale
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

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        if (token === CACHE.twitchTokens['app']?.access_token) CACHE.twitchTokens['app'] = null; 
        if (token === CACHE.twitchUser?.access_token) CACHE.twitchUser = null; 
        throw new Error(`Erreur d'autorisation Twitch (401).`);
    }
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${errorText.substring(0, 100)}...`);
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
                systemInstruction: "Tu es un expert en croissance Twitch. Tes réponses doivent être en HTML pur (sans balises <html>, <head>, <body>), prêtes à être injectées dans une div."
            }
        });
        
        const text = response.text.trim();
        // Nettoyage au cas où l'IA mettrait quand même du markdown
        const cleanText = text.replace(/```html/g, '').replace(/```/g, '');
        return { success: true, html_response: cleanText };

    } catch (e) {
        let errorMessage = `Erreur IA: ${e.message}`;
        return { 
            success: false, 
            status: 500, 
            error: errorMessage,
            html_response: `<p style="color:red;">${errorMessage}</p>`
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
    const { code, state, error } = req.query;
    const storedState = req.cookies.twitch_state;
    
    if (state !== storedState || error) return res.status(400).send("Erreur Auth.");

    try {
        const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
                expiry: Date.now() + (tokenData.expires_in * 1000)
            };
            
            // SCRIPT DE FERMETURE AUTOMATIQUE
            res.send(`
                <html>
                    <body style="background:#111; color:#fff; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
                        <div style="text-align:center;">
                            <h2 style="color:#59d682;">✅ Connexion Réussie !</h2>
                            <p>Fermeture...</p>
                        </div>
                        <script>
                            if (window.opener) window.opener.postMessage('auth_success', '*');
                            window.close();
                        </script>
                    </body>
                </html>
            `);
        } else {
            res.status(500).send("Erreur Token Twitch.");
        }
    } catch (e) {
        res.status(500).send(`Erreur serveur: ${e.message}`);
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
// --- ROUTES DATA (Follows, VOD, Scan) ---
// =========================================================

app.get('/followed_streams', async (req, res) => {
    if (!CACHE.twitchUser) return res.status(401).json({ success: false, error: "Non connecté." });
    try {
        const data = await twitchApiFetch(`streams/followed?user_id=${CACHE.twitchUser.id}`, CACHE.twitchUser.access_token);
        const streams = data.data.map(s => ({
            user_name: s.user_name, user_login: s.user_login, game_name: s.game_name, viewer_count: s.viewer_count, thumbnail_url: s.thumbnail_url 
        }));
        return res.json({ success: true, streams });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

app.get('/get_latest_vod', async (req, res) => {
    const channel = req.query.channel;
    if (!channel) return res.status(400).json({ success: false });
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data.length) return res.status(404).json({ success: false });
        
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`);
        if (!vodRes.data.length) return res.status(404).json({ success: false });
        
        const vod = vodRes.data[0];
        return res.json({ success: true, vod: { id: vod.id, title: vod.title, thumbnail_url: vod.thumbnail_url.replace('%{width}', '150').replace('%{height}', '84') } });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false });
    try {
        // Recherche User
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            let isLive = false;
            try { const s = await twitchApiFetch(`streams?user_id=${user.id}`); if(s.data.length) isLive = true; } catch(e){}
            
            // Estimation simple
            let score = '5.0/10';
            if (user.broadcaster_type === 'partner') score = '8.5/10';

            const userData = { 
                login: user.login, display_name: user.display_name, id: user.id, profile_image_url: user.profile_image_url,
                is_live: isLive, total_followers: 'N/A', total_views: user.view_count || 0,
                broadcaster_type: user.broadcaster_type || 'normal', ai_calculated_niche_score: score
            };
            CACHE.lastScanData = userData;
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        // Recherche Jeu
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const streams = streamsRes.data;
            
            const total = streams.length;
            const viewers = streams.reduce((a, b) => a + b.viewer_count, 0);
            const avg = total > 0 ? Math.round(viewers / total) : 0;
            let score = avg < 100 ? '8.0/10' : '4.5/10';

            const gameData = { 
                name: game.name, box_art_url: game.box_art_url, total_streamers: total, total_viewers: viewers,
                avg_viewers_per_streamer: avg, ai_calculated_niche_score: score
            };
            CACHE.lastScanData = gameData;
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        return res.status(404).json({ success: false, message: "Introuvable." });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
});

// =========================================================
// --- ROTATION & LECTEUR ---
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const r = CACHE.globalStreamRotation;
    if (now - r.lastFetchTime < r.fetchCooldown && r.streams.length > 0) return;
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        let suitable = data.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
        if (suitable.length === 0) suitable = data.data.slice(0, 10); // Fallback
        
        r.streams = suitable.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
        r.currentIndex = 0;
        r.lastFetchTime = now;
    } catch (e) { console.error("Erreur rotation:", e); }
}

app.get('/get_default_stream', async (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        const rem = Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 60000);
        return res.json({ success: true, channel: CACHE.boostedStream.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${rem} min)` });
    }

    await refreshGlobalStreamList(); 
    const r = CACHE.globalStreamRotation;
    if (r.streams.length === 0) return res.json({ success: true, channel: 'twitch', viewers: 0, message: "⚠️ Fallback" });

    const s = r.streams[r.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `✅ Auto: ${s.channel} (${s.viewers} vues)` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({ success: false });

    await refreshGlobalStreamList();
    const r = CACHE.globalStreamRotation;
    if (r.streams.length === 0) return res.status(404).json({ success: false });

    if (direction === 'next') r.currentIndex = (r.currentIndex + 1) % r.streams.length;
    else r.currentIndex = (r.currentIndex - 1 + r.streams.length) % r.streams.length;

    const s = r.streams[r.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers });
});

// =========================================================
// --- BOOST & RAID ---
// =========================================================

app.get('/check_boost_status', (req, res) => {
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) {
        return res.json({ is_boosted: true, channel: CACHE.boostedStream.channel, remaining_seconds: Math.ceil((CACHE.boostedStream.endTime - Date.now()) / 1000) });
    }
    return res.json({ is_boosted: false });
});

app.post('/stream_boost', (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({});
    const now = Date.now();
    
    if (CACHE.streamBoosts[channel] && (now - CACHE.streamBoosts[channel]) < 10800000) {
        return res.status(429).json({ error: "Cooldown actif.", html_response: "<p style='color:red'>Cooldown actif.</p>" });
    }
    
    CACHE.streamBoosts[channel] = now;
    CACHE.boostedStream = { channel: channel, endTime: now + 900000 };
    res.json({ success: true, html_response: "<p style='color:#ff0099'>✅ Boost Activé !</p>" });
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data.length) return res.status(404).json({ success: false });
        
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&first=100`);
        const target = streamsRes.data.filter(s => s.viewer_count <= max_viewers).sort((a,b) => b.viewer_count - a.viewer_count)[0];
        
        if (target) {
            res.json({ success: true, target: { name: target.user_name, login: target.user_login, viewers: target.viewer_count, thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56') } });
        } else {
            res.json({ success: false, error: "Aucune cible." });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// =========================================================
// --- IA GENERALE ---
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = "";
    if (type === 'niche') prompt = `Analyse niche Twitch pour "${query}". Score: ${niche_score}. Donne 3 points forts et 3 idées de contenu en HTML (ul/li).`;
    else if (type === 'repurpose') prompt = `Analyse VOD "${query}" pour repurposing TikTok. Donne 3 timestamps et titres en HTML.`;
    
    const result = await runGeminiAnalysis(prompt);
    if(result.success) res.json(result); else res.status(500).json(result);
});

// =========================================================
// --- NOUVELLE ROUTE : ANALYSE DU MEILLEUR TEMPS (BEST TIME) ---
// =========================================================

app.post('/analyze_best_time', async (req, res) => {
    const { game } = req.body;
    if (!game) return res.status(400).json({ success: false, error: "Jeu manquant" });

    try {
        // 1. Données Réelles
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gameRes.data.length) return res.status(404).json({ success: false, error: "Jeu introuvable" });

        const gameData = gameRes.data[0];
        const streamsRes = await twitchApiFetch(`streams?game_id=${gameData.id}&first=100`);
        const streams = streamsRes.data;

        const totalStreamers = streams.length;
        const totalViewers = streams.reduce((acc, s) => acc + s.viewer_count, 0);
        const ratio = totalStreamers > 0 ? (totalViewers / totalStreamers).toFixed(2) : 0;

        // 2. Prompt Expert
        const prompt = `
            Analyse pour le jeu : "${gameData.name}".
            Stats Actuelles : ${totalViewers} viewers, ${totalStreamers} streamers, Ratio ${ratio}.
            
            Détermine le "GOLDEN TIME" (Meilleur créneau horaire/jour) pour streamer ce jeu et maximiser la visibilité.
            Base-toi sur le genre du jeu (FPS, RPG, Chill, etc.) et les habitudes Twitch.

            FORMAT DE RÉPONSE STRICT (HTML pour injection div, style ORANGE #ff9100) :
            
            <div style="text-align:center; margin-bottom:20px;">
                <h2 style="color:#ff9100; font-size:24px; margin-bottom:5px;">🏆 CRÉNEAU GAGNANT</h2>
                <div style="font-size:18px; font-weight:bold; color:white;">[JOUR] à [HEURE]</div>
                <div style="color:#888; font-size:12px;">(Basé sur le ratio actuel de ${ratio})</div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div style="background:#222; padding:10px; border-radius:8px; border:1px solid #ff9100;">
                    <h4 style="color:#ff9100; margin:0; font-size:14px;">🌞 Pourquoi ?</h4>
                    <p style="font-size:12px; color:#ddd; margin-top:5px;">[Explication courte]</p>
                </div>
                <div style="background:#222; padding:10px; border-radius:8px; border:1px solid #ff9100;">
                    <h4 style="color:#ff9100; margin:0; font-size:14px;">⚠️ Zone Rouge</h4>
                    <p style="font-size:12px; color:#ddd; margin-top:5px;">[Pire moment]</p>
                </div>
            </div>
            
            <div style="margin-top:15px; padding:10px; background:#111; border-left:3px solid #ff9100;">
                <strong style="color:white;">Conseil :</strong> [Conseil stratégique court]
            </div>
        `;

        const result = await runGeminiAnalysis(prompt);
        if (result.success) res.json({ success: true, html_response: result.html_response });
        else res.json({ success: false, error: "Erreur IA" });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// --- EXPORT & SERVING ---
// =========================================================

app.get('/export_csv', (req, res) => {
    if (!CACHE.lastScanData) return res.status(404).send("Pas de données.");
    const d = CACHE.lastScanData;
    let csv = "Key,Value\n";
    for (const [k, v] of Object.entries(d)) csv += `${k},${v}\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Export.csv');
    res.send(csv);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));
app.get('/NicheOptimizer.html', (req, res) => res.sendFile(path.join(__dirname, 'NicheOptimizer.html')));

app.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));
