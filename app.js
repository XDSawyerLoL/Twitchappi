/**
 * STREAMER & NICHE AI HUB - BACKEND (V26 - JSON FIX)
 * ==================================================
 * Correctif JSON Parse Error :
 * - Suppression du "nettoyage" pré-parse qui corrompait le JSON.
 * - Correction de la clé privée APRES le parsing (Post-Processing).
 * - Compatible Render (Env Var) & Local (Fichier).
 */

const express = require('express');
const cors = require('cors');
// fetch est natif en Node 18+
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require('firebase-admin');

// =========================================================
// 0. INITIALISATION FIREBASE (FIX PARSING)
// =========================================================
let serviceAccount;

try {
    // Cas 1 : Render (Variable d'environnement)
    if (process.env.FIREBASE_SERVICE_KEY) {
        let rawJson = process.env.FIREBASE_SERVICE_KEY;
        
        // Nettoyage basique des guillemets externes (copier-coller accidentel)
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // TENTATIVE DE PARSING DIRECT (Le plus fiable)
        serviceAccount = JSON.parse(rawJson);
        console.log("✅ [FIREBASE] JSON parsé avec succès.");
        
        // FIX CLÉ PRIVÉE (Post-Parsing) :
        // Si la clé privée contient des "\n" littéraux (texte), on les convertit en vrais sauts de ligne.
        if (serviceAccount.private_key && serviceAccount.private_key.includes("\\n")) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
    } 
    // Cas 2 : Local (Fichier physique)
    else {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("✅ [FIREBASE] Fichier local chargé.");
    }

    // Connexion
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté : ${serviceAccount.project_id}`);
    } else {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée. Mode BDD désactivé.");
        try { admin.initializeApp(); } catch(e){}
    }

} catch (error) {
    console.error("###################################################");
    console.error("❌ ERREUR CRITIQUE FIREBASE (Parsing JSON)");
    console.error("Message :", error.message);
    console.error("Conseil : Vérifiez que votre variable d'environnement sur Render ne contient pas de sauts de ligne réels, mais bien des \\n");
    console.error("###################################################");
    // On initialise vide pour ne pas faire crasher l'app au démarrage
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();
if (serviceAccount) { try { db.settings({ ignoreUndefinedProperties: true }); } catch(e) {} }

const app = express();

// =========================================================
// 1. CONFIG ET VARIABLES
// =========================================================

const PORT = process.env.PORT || 10000;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !REDIRECT_URI || !GEMINI_API_KEY) {
    console.error("⚠️  ATTENTION : Variables d'environnement manquantes sur Render !");
}

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname))); 

// =========================================================
// 2. CACHE & ÉTAT
// =========================================================
const CACHE = {
    twitchTokens: {},
    twitchUser: null,
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
// 3. FONCTIONS UTILITAIRES
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
        console.error("Erreur Token Twitch:", error);
        return null;
    }
}

async function twitchApiFetch(endpoint, token) {
    const accessToken = token || await getTwitchToken('app');
    if (!accessToken) throw new Error("Impossible d'obtenir un Token Twitch.");

    const res = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (res.status === 401) {
        CACHE.twitchTokens['app'] = null; 
        throw new Error(`Erreur Auth Twitch (401). Réessayez.`);
    }
    
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur API Twitch (${res.status}): ${txt}`);
    }

    return res.json();
}

/**
 * FONCTION IA REST (Sans SDK)
 */
async function runGeminiAnalysis(prompt) {
    if (!GEMINI_API_KEY) return { success: false, error: "Clé API Gemini manquante" };

    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 800
            }
        };

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            console.error("API Gemini Error:", data.error.message);
            throw new Error("L'IA est temporairement indisponible.");
        }

        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        text = text.replace(/```html/g, '').replace(/```/g, '').trim();

        return { success: true, html_response: text };

    } catch (e) {
        console.error("Erreur Gemini (REST):", e.message);
        return { 
            success: false, 
            error: e.message, 
            html_response: `<p style="color:var(--color-ai-action);">❌ Erreur IA: ${e.message}</p>` 
        };
    }
}

// =========================================================
// 4. ROUTES AUTH
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows"; 
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 }); 
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`Erreur Twitch : ${error}`);

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
            
            res.send(`
                <html><body style="background:#111;color:#fff;text-align:center;padding-top:50px;font-family:sans-serif;">
                <h2>Connexion Réussie !</h2>
                <script>
                    if(window.opener) {
                        window.opener.postMessage('auth_success', '*');
                        window.close();
                    } else {
                        window.location.href = '/';
                    }
                </script>
                </body></html>
            `);
        } else {
            res.status(500).send("Échec récupération Token.");
        }
    } catch (e) {
        res.status(500).send(`Erreur: ${e.message}`);
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
// 5. API DATA
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
    if (!channel) return res.status(400).json({ error: "No channel" });
    try {
        const userRes = await twitchApiFetch(`users?login=${channel}`);
        if (!userRes.data?.length) return res.status(404).json({ error: "User not found" });
        
        const vodRes = await twitchApiFetch(`videos?user_id=${userRes.data[0].id}&type=archive&first=1`);
        if (!vodRes.data?.length) return res.status(404).json({ error: "No VOD" });
        
        return res.json({ success: true, vod: vodRes.data[0] });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false });
    
    try {
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query)}`); 
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            let streamDetails = null;
            let followerCount = 'N/A';
            
            try {
                const sRes = await twitchApiFetch(`streams?user_id=${user.id}`);
                if (sRes.data.length > 0) streamDetails = sRes.data[0];
                const fRes = await twitchApiFetch(`users/follows?followed_id=${user.id}&first=1`);
                followerCount = fRes.total;
            } catch(e){}

            const userData = { 
                type: 'user',
                login: user.login, 
                display_name: user.display_name, 
                id: user.id, 
                profile_image_url: user.profile_image_url,
                is_live: !!streamDetails,
                viewer_count: streamDetails ? streamDetails.viewer_count : 0,
                game_name: streamDetails ? streamDetails.game_name : '',
                total_followers: followerCount,
                total_views: user.view_count || 'N/A',
                ai_calculated_niche_score: (user.broadcaster_type === 'partner') ? '8.5/10' : '5.5/10'
            };
            
            CACHE.lastScanData = userData;
            return res.json({ success: true, type: 'user', user_data: userData });
        }
        
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streamsRes = await twitchApiFetch(`streams?game_id=${game.id}&first=100`);
            const totalS = streamsRes.data.length;
            const totalV = streamsRes.data.reduce((a, b) => a + b.viewer_count, 0);
            
            const gameData = { 
                type: 'game',
                name: game.name, 
                id: game.id, 
                box_art_url: game.box_art_url,
                total_streamers: totalS,
                total_viewers: totalV,
                ai_calculated_niche_score: (totalV/totalS < 10) ? '8.0/10' : '4.5/10'
            };
            
            CACHE.lastScanData = gameData;
            return res.json({ success: true, type: 'game', game_data: gameData });
        }
        return res.status(404).json({ success: false, message: "Introuvable" });
        
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// =========================================================
// 6. ROTATION & BOOST
// =========================================================

async function refreshGlobalStreamList() {
    const now = Date.now();
    const rot = CACHE.globalStreamRotation;
    if (now - rot.lastFetchTime < rot.fetchCooldown && rot.streams.length > 0) return;
    
    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        let suitable = data.data.filter(s => s.viewer_count > 0 && s.viewer_count <= 100);
        if (suitable.length === 0 && data.data.length > 0) suitable = data.data.slice(0, 10);
        
        if (suitable.length > 0) {
            rot.streams = suitable.map(s => ({ channel: s.user_login, viewers: s.viewer_count }));
            rot.currentIndex = 0;
            rot.lastFetchTime = now;
        }
    } catch (e) { console.error("Err Rotation:", e.message); }
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    let currentBoost = null;

    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now).orderBy('endTime', 'desc').limit(1).get();
        if (!boostQuery.empty) {
            const d = boostQuery.docs[0].data();
            currentBoost = { channel: d.channel, endTime: d.endTime };
            CACHE.boostedStream = currentBoost;
        }
    } catch(e) {
        if (CACHE.boostedStream && CACHE.boostedStream.endTime > now) currentBoost = CACHE.boostedStream;
    }

    if (currentBoost && currentBoost.endTime > now) {
        const rem = Math.ceil((currentBoost.endTime - now) / 60000);
        return res.json({ success: true, channel: currentBoost.channel, viewers: 'BOOST', message: `⚡ BOOST ACTIF (${rem} min)` });
    }

    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', message: 'Aucun stream.' });

    const s = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: s.channel, viewers: s.viewers, message: `✅ Auto-Discovery (${s.viewers} vues)` });
});

app.post('/cycle_stream', async (req, res) => {
    const { direction } = req.body;
    if (CACHE.boostedStream && CACHE.boostedStream.endTime > Date.now()) return res.status(403).json({});

    await refreshGlobalStreamList();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.status(404).json({});

    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

    const ns = rot.streams[rot.currentIndex];
    return res.json({ success: true, channel: ns.channel, viewers: ns.viewers });
});

// =========================================================
// 7. FEATURES (BOOST, RAID, ETC)
// =========================================================

app.get('/check_boost_status', async (req, res) => {
    const now = Date.now();
    try {
        const q = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!q.empty) {
            const d = q.docs[0].data();
            return res.json({ is_boosted: true, channel: d.channel, remaining_seconds: Math.ceil((d.endTime - now) / 1000) });
        }
    } catch(e) {}
    return res.json({ is_boosted: false });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Chaîne requise" });
    const now = Date.now();
    const DURATION = 15 * 60 * 1000;

    try {
        const active = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!active.empty) return res.status(429).json({ error: "Slot occupé", html_response: "<p>Slot occupé !</p>" });

        await db.collection('boosts').add({ channel, startTime: now, endTime: now + DURATION });
        CACHE.boostedStream = { channel, endTime: now + DURATION };
        return res.json({ success: true, html_response: "<p>🚀 Boost Activé !</p>" });
    } catch(e) {
        return res.status(500).json({ error: "Erreur DB", html_response: "<p>Erreur Serveur</p>" });
    }
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gRes.data.length) return res.status(404).json({ error: "Jeu introuvable" });
        
        const sRes = await twitchApiFetch(`streams?game_id=${gRes.data[0].id}&first=100&language=fr`);
        let candidates = sRes.data.filter(s => s.viewer_count <= max_viewers);
        let target = candidates.length ? candidates[0] : (sRes.data[0] || null);

        if (target) {
            return res.json({ success: true, target: {
                name: target.user_name, login: target.user_login, viewers: target.viewer_count,
                game: target.game_name, thumbnail_url: target.thumbnail_url.replace('%{width}', '100').replace('%{height}', '56')
            }});
        }
        return res.json({ success: false, error: "Personne sur ce jeu." });
    } catch(e) { return res.status(500).json({ error: e.message }); }
});

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let prompt = `Expert Twitch. `;
    if (type === 'niche') prompt += `Analyse le stream/jeu "${query}" (Score: ${niche_score}). HTML requis: <h4>Analyse</h4>, <ul>3 points forts</ul>, <ul>3 conseils</ul>. Sois concis.`;
    else if (type === 'repurpose') prompt += `Analyse VOD "${query}" pour TikTok. HTML requis: <h4>Clips Potentiels</h4>, <ul>3 timestamps et idées de titres</ul>.`;
    
    const result = await runGeminiAnalysis(prompt);
    res.json(result);
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    try {
        const gRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (!gRes.data.length) return res.json({ success: false });
        const gData = gRes.data[0];
        
        const prompt = `Analyse créneaux horaires pour le jeu "${gData.name}". HTML requis: <h4>Meilleurs Moments</h4>, <ul>3 créneaux jour/heure</ul>, <p>Conseil durée</p>.`;
        const aiResult = await runGeminiAnalysis(prompt);
        
        return res.json({ 
            success: true, 
            game_name: gData.name, 
            box_art: gData.box_art_url.replace('{width}','144').replace('{height}','192'),
            html_response: aiResult.html_response 
        });
    } catch(e) { return res.status(500).json({ error: e.message }); }
});

app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Pas de données.");
    let csv = `Type,Nom,Score\n${data.type},${data.display_name || data.name},${data.ai_calculated_niche_score}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Twitch_Analysis.csv');
    res.send(csv);
});

app.listen(PORT, () => console.log(`🚀 SERVEUR LANCÉ SUR LE PORT ${PORT}`));
