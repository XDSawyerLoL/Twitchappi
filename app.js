/**
 * STREAMER & NICHE AI HUB - BACKEND (V20 - ULTIMATE FIX COMPLETE)
 * ===============================================================
 * Serveur Node.js/Express gérant :
 * 1. L'authentification Twitch (OAuth) avec fermeture propre des popups.
 * 2. L'API Twitch (Helix) pour les scans, raids et statuts.
 * 3. L'IA Google Gemini pour les analyses (Niche, Repurposing, Planning) avec GROUNDING.
 * 4. La rotation automatique des streams (0-100 vues).
 * 5. Le système de Boost et de Raid optimisé via Firestore.
 * 6. PERSISTANCE : Connexion Firebase Blindée pour Render.
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Requis pour Node < 18 ou compatibilité
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// --- INITIALISATION FIREBASE ---
const admin = require('firebase-admin');
let serviceAccount;

if (process.env.FIREBASE_SERVICE_KEY) {
    try {
        let rawJson = process.env.FIREBASE_SERVICE_KEY.trim();
        
        // Nettoyage des guillemets Render
        if (rawJson.startsWith("'") && rawJson.endsWith("'")) rawJson = rawJson.slice(1, -1);
        if (rawJson.startsWith('"') && rawJson.endsWith('"')) rawJson = rawJson.slice(1, -1);

        // Correction des sauts de ligne JSON
        rawJson = rawJson.replace(/\n/g, '\\n').replace(/\r/g, '\\n');
        serviceAccount = JSON.parse(rawJson);

        // Correction de la clé privée pour l'authentification
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        console.log("✅ [FIREBASE] Configuration détectée et réparée.");
    } catch (error) {
        console.error("❌ [FIREBASE] Erreur de parsing JSON :", error.message);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        console.warn("⚠️ [FIREBASE] Aucune clé trouvée.");
    }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id 
        });
        console.log(`✅ [FIREBASE] Connecté au projet : ${serviceAccount.project_id}`);
    } catch (e) {
        console.error("❌ [FIREBASE] Erreur d'initialisation Admin :", e.message);
    }
} else {
    try { admin.initializeApp(); } catch(e){}
}

const db = admin.firestore();

// --- CONFIGURATION SERVEUR ---
const app = express();
const PORT = process.env.PORT || 10000;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025"; 

// Middlewares
app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// Cache & État Global
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
// FONCTIONS UTILITAIRES TWITCH
// =========================================================

/**
 * Récupère un token d'application (Client Credentials)
 */
async function getTwitchToken() {
    if (CACHE.twitchTokens.app && CACHE.twitchTokens.app.expiry > Date.now()) {
        return CACHE.twitchTokens.app.access_token;
    }
    
    const url = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
    
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        
        if (data.access_token) {
            CACHE.twitchTokens.app = {
                access_token: data.access_token,
                expiry: Date.now() + (data.expires_in * 1000) - 300000 
            };
            return data.access_token;
        }
    } catch (error) {
        console.error("Erreur Token Application:", error);
    }
    return null;
}

/**
 * Helper Fetch pour l'API Helix
 */
async function twitchApiFetch(endpoint, token = null) {
    const accessToken = token || await getTwitchToken();
    if (!accessToken) throw new Error("Accès Twitch impossible (Token manquant).");

    const response = await fetch(`https://api.twitch.tv/helix/${endpoint}`, {
        headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (response.status === 401) throw new Error("Authentification Twitch expirée.");
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Erreur API Twitch: ${err}`);
    }

    return response.json();
}

// =========================================================
// SYSTÈME IA (GEMINI + GROUNDING)
// =========================================================

async function callGeminiApi(systemPrompt, userQuery) {
    if (!GEMINI_API_KEY) return "Erreur: Clé Gemini manquante.";

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }]
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "L'IA n'a pas pu générer de réponse.";
    } catch (e) {
        console.error("Erreur Gemini:", e.message);
        return `Erreur de connexion à l'IA : ${e.message}`;
    }
}

// =========================================================
// ROUTES AUTHENTIFICATION TWITCH
// =========================================================

app.get('/twitch_auth_start', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const scope = "user:read:follows user:read:email";
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}&state=${state}`;
    res.cookie('twitch_state', state, { httpOnly: true, secure: true, maxAge: 600000 });
    res.redirect(url);
});

app.get('/twitch_auth_callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (state !== req.cookies.twitch_state) return res.status(400).send("Erreur CSRF.");
    if (error) return res.status(400).send(`Erreur : ${error}`);

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

            // Envoi du cookie pour persistance session frontend
            res.cookie('twitch_access_token', tokenData.access_token, { httpOnly: true, secure: true, maxAge: 3600000 });

            res.send(`
                <html>
                <body style="background:#0d0d0d; color:#fff; text-align:center; padding-top:100px; font-family:sans-serif;">
                    <h2 style="color:#ff0099;">Connexion Réussie !</h2>
                    <p>Redirection en cours...</p>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage('auth_success', '*');
                            window.close();
                        } else {
                            window.location.href = '/';
                        }
                    </script>
                </body>
                </html>
            `);
        } else {
            res.status(500).send("Erreur d'échange de token.");
        }
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.get('/twitch_user_status', (req, res) => {
    if (CACHE.twitchUser && CACHE.twitchUser.expiry > Date.now()) {
        return res.json({ is_connected: true, ...CACHE.twitchUser });
    }
    res.json({ is_connected: false });
});

app.post('/twitch_logout', (req, res) => {
    CACHE.twitchUser = null;
    res.clearCookie('twitch_access_token');
    res.json({ success: true });
});

// =========================================================
// ROUTES DATA & TWITCH API
// =========================================================

app.get('/followed_streams', async (req, res) => {
    const token = req.cookies.twitch_access_token || (CACHE.twitchUser ? CACHE.twitchUser.access_token : null);
    if (!token) return res.status(401).json({ error: "Non authentifié" });

    try {
        const userRes = await twitchApiFetch('users', token);
        const userId = userRes.data[0].id;
        const data = await twitchApiFetch(`streams/followed?user_id=${userId}`, token);
        res.json({ success: true, streams: data.data, username: userRes.data[0].display_name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/scan_target', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Requête vide" });

    try {
        // Recherche Utilisateur
        const userRes = await twitchApiFetch(`users?login=${encodeURIComponent(query.toLowerCase())}`);
        if (userRes.data.length > 0) {
            const user = userRes.data[0];
            const followers = await twitchApiFetch(`channels/followers?broadcaster_id=${user.id}&first=1`);
            
            const userData = {
                type: 'user',
                login: user.login,
                display_name: user.display_name,
                profile_image: user.profile_image_url,
                follower_count: followers.total,
                broadcaster_type: user.broadcaster_type || 'Streamer',
                ai_calculated_niche_score: followers.total < 5000 ? "9.5/10 (Niche)" : "5.0/10 (Saturé)"
            };
            CACHE.lastScanData = userData;
            return res.json({ success: true, ...userData });
        }

        // Recherche Jeu
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(query)}&first=1`);
        if (gameRes.data.length > 0) {
            const game = gameRes.data[0];
            const streams = await twitchApiFetch(`streams?game_id=${game.id}&language=fr&first=100`);
            
            const gameData = {
                type: 'game',
                name: game.name,
                box_art: game.box_art_url.replace('{width}', '144').replace('{height}', '192'),
                live_streamers: streams.data.length,
                total_viewers: streams.data.reduce((s, a) => s + a.viewer_count, 0),
                ai_calculated_niche_score: streams.data.length < 20 ? "8.5/10" : "4.0/10"
            };
            CACHE.lastScanData = gameData;
            return res.json({ success: true, ...gameData });
        }

        res.status(404).json({ error: "Cible introuvable." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =========================================================
// GESTION ROTATION & BOOSTS (FIREBASE)
// =========================================================

async function refreshRotation() {
    const now = Date.now();
    if (now - CACHE.globalStreamRotation.lastFetchTime < CACHE.globalStreamRotation.fetchCooldown && CACHE.globalStreamRotation.streams.length > 0) return;

    try {
        const data = await twitchApiFetch(`streams?language=fr&first=100`);
        const suitable = data.data.filter(s => s.viewer_count >= 0 && s.viewer_count <= 100);
        
        CACHE.globalStreamRotation.streams = suitable.map(s => ({
            channel: s.user_login,
            viewers: s.viewer_count,
            game: s.game_name,
            title: s.title
        }));
        CACHE.globalStreamRotation.lastFetchTime = now;
        console.log(`🔄 Rotation mise à jour : ${suitable.length} streams trouvés.`);
    } catch (e) {
        console.error("Erreur rafraîchissement rotation:", e.message);
    }
}

app.get('/get_default_stream', async (req, res) => {
    const now = Date.now();
    
    // 1. Vérification Boost Actif Firestore
    try {
        const boostQuery = await db.collection('boosts')
            .where('endTime', '>', now)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get();

        if (!boostQuery.empty) {
            const boost = boostQuery.docs[0].data();
            return res.json({ success: true, channel: boost.channel, type: 'BOOST', viewers: '⚡' });
        }
    } catch (e) {
        console.error("Firestore error:", e.message);
    }

    // 2. Rotation Standard
    await refreshRotation();
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: true, channel: 'twitch', type: 'FALLBACK' });

    const current = rot.streams[rot.currentIndex];
    res.json({ success: true, ...current, type: 'ROTATION' });
});

app.post('/cycle_stream', (req, res) => {
    const { direction } = req.body;
    const rot = CACHE.globalStreamRotation;
    if (rot.streams.length === 0) return res.json({ success: false });

    if (direction === 'next') rot.currentIndex = (rot.currentIndex + 1) % rot.streams.length;
    else rot.currentIndex = (rot.currentIndex - 1 + rot.streams.length) % rot.streams.length;

    res.json({ success: true, ...rot.streams[rot.currentIndex] });
});

app.post('/stream_boost', async (req, res) => {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: "Chaîne requise." });

    const now = Date.now();
    try {
        // Un seul boost à la fois
        const active = await db.collection('boosts').where('endTime', '>', now).limit(1).get();
        if (!active.empty) return res.status(429).json({ error: "Un boost est déjà en cours." });

        await db.collection('boosts').add({
            channel: channel.toLowerCase(),
            startTime: now,
            endTime: now + (15 * 60 * 1000), // 15 min
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ success: true, html_response: `<p style="color:#ff0099; font-weight:bold;">🚀 BOOST ACTIVÉ pour ${channel} !</p>` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =========================================================
// ROUTES ANALYSE IA SPÉCIALISÉES
// =========================================================

app.post('/critique_ia', async (req, res) => {
    const { type, query, niche_score } = req.body;
    let systemPrompt = "Tu es un expert en croissance Twitch. Réponds en HTML structuré (h4, ul, li).";
    let userQuery = "";

    if (type === 'niche') {
        userQuery = `Analyse la niche "${query}" (Score: ${niche_score}). Donne 3 forces, 3 risques et une stratégie pour percer.`;
    } else if (type === 'repurpose') {
        userQuery = `Analyse cette VOD : "${query}". Identifie 3 moments clés pour TikTok/Shorts avec des timestamps fictifs et des titres accrocheurs.`;
    } else if (type === 'trend') {
        userQuery = "Quelles sont les 3 tendances majeures sur Twitch aujourd'hui pour les petits streamers ? Sois très spécifique.";
    }

    const text = await callGeminiApi(systemPrompt, userQuery);
    res.json({ success: true, result: text });
});

app.post('/analyze_schedule', async (req, res) => {
    const { game } = req.body;
    const systemPrompt = "Expert en data Twitch. Analyse les meilleurs horaires pour streamer ce jeu.";
    const userQuery = `Analyse le jeu "${game}". Prédit les créneaux avec le meilleur ratio viewers/streamers en France.`;
    
    const text = await callGeminiApi(systemPrompt, userQuery);
    res.json({ success: true, html_response: text });
});

// =========================================================
// UTILITAIRES FINAUX (CSV, RAID, STATIC)
// =========================================================

app.get('/export_csv', (req, res) => {
    const data = CACHE.lastScanData;
    if (!data) return res.status(404).send("Pas de données.");

    let csv = "Metrique,Valeur\n";
    Object.keys(data).forEach(k => {
        csv += `${k},${data[k]}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Analysis.csv');
    res.send(csv);
});

app.post('/start_raid', async (req, res) => {
    const { game, max_viewers } = req.body;
    try {
        const gameRes = await twitchApiFetch(`search/categories?query=${encodeURIComponent(game)}&first=1`);
        if (gameRes.data.length === 0) return res.status(404).json({ error: "Jeu non trouvé." });
        
        const streams = await twitchApiFetch(`streams?game_id=${gameRes.data[0].id}&language=fr&first=100`);
        const target = streams.data.find(s => s.viewer_count <= parseInt(max_viewers));

        if (target) {
            res.json({
                success: true,
                target: {
                    name: target.user_name,
                    login: target.user_login,
                    viewers: target.viewer_count,
                    game: target.game_name,
                    thumbnail: target.thumbnail_url.replace('{width}', '200').replace('{height}', '112')
                }
            });
        } else {
            res.status(404).json({ error: "Aucune cible de raid trouvée." });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'NicheOptimizer.html'));
});

// Lancement
app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 HUB V20 ULTIMATE - ONLINE ON PORT ${PORT}`);
    console.log(`===============================================`);
});
